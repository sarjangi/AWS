// src/ingestion/data-processor.js - WITH CUSTOM QUERY SUPPORT
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { Pool } = require('pg');

const s3 = new S3Client();
const secretsClient = new SecretsManagerClient();

class DatabaseService {
    constructor() {
        this.pool = null;
        this.secret = null;
    }

    async getDatabaseSecret() {
        if (!this.secret) {
            const command = new GetSecretValueCommand({ 
                SecretId: process.env.SECRET_ARN 
            });
            const response = await secretsClient.send(command);
            this.secret = JSON.parse(response.SecretString);
            console.log('Secrets Manager: Got database credentials');
        }
        return this.secret;
    }

    async init() {
        if (!this.pool) {
            const secret = await this.getDatabaseSecret();
            
            this.pool = new Pool({
                host: secret.host,
                database: secret.dbname,
                user: secret.username,
                password: secret.password,
                port: secret.port || 5432,
                max: 5,
                idleTimeoutMillis: 30000,
                ssl: { rejectUnauthorized: false }
            });
        }
        return this.pool;
    }

    async ensureTablesExist(pool) {
        await pool.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
        const createTableSQL = `
            CREATE TABLE IF NOT EXISTS entities (
                entity_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                entity_type VARCHAR(50) NOT NULL,
                source_system VARCHAR(100) NOT NULL,
                canonical_id VARCHAR(255) UNIQUE NOT NULL,
                attributes JSONB NOT NULL DEFAULT '{}',
                metadata JSONB NOT NULL DEFAULT '{}',
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                version INTEGER NOT NULL DEFAULT 1,
                status VARCHAR(20) NOT NULL DEFAULT 'active'
            );
        `;
        
        await pool.query(createTableSQL);
        console.log('Ensured entities table exists');
    }

    async bulkInsertEntities(entities) {
        const pool = await this.init();
        
        try {
            console.log(`Testing database connection`);
            
            const testResult = await pool.query('SELECT NOW() as current_time');
            console.log('Database connection successful!');
            
            await this.ensureTablesExist(pool);
            
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                
                const insertQuery = `
                    INSERT INTO entities 
                    (entity_type, source_system, canonical_id, attributes, status)
                    VALUES ($1, $2, $3, $4, $5)
                    ON CONFLICT (canonical_id) DO UPDATE SET
                        attributes = EXCLUDED.attributes,
                        updated_at = NOW(),
                        version = entities.version + 1
                    RETURNING entity_id
                `;
                
                let insertedCount = 0;
                for (const entity of entities) {
                    const result = await client.query(insertQuery, [
                        entity.entity_type,
                        entity.source_system,
                        entity.canonical_id,
                        JSON.stringify(entity.attributes),
                        entity.status
                    ]);
                    insertedCount++;
                }
                
                await client.query('COMMIT');
                console.log(`SUCCESS: Inserted/Updated ${insertedCount} entities`);
                
                return { 
                    success: true, 
                    count: insertedCount, 
                    connected: true, 
                    inserted: true 
                };
                
            } finally {
                client.release();
            }
            
        } catch (error) {
            console.error('❌ Database operation failed:', error.message);
            return { 
                success: false, 
                count: 0, 
                connected: false, 
                error: error.message 
            };
        }
    }
}

class SimpleMapper {
    mapToCanonical(record, sourceSystem) {
        const name = record.company_name || record.business_name || record.name;
        
        return {
            entity_type: this.determineEntityType(record),
            source_system: sourceSystem,
            canonical_id: `${sourceSystem}_${record.id}`,
            attributes: {
                name: name,
                revenue: record.annual_revenue || record.revenue,
                employees: record.employee_count || record.employees,
            },
            status: 'active'
        };
    }
    
    determineEntityType(data) {
        const revenue = data.annual_revenue || data.revenue || 0;
        if (revenue > 1000000) return 'medium_business';
        return 'small_business';
    }
}

exports.handler = async (event) => {
    console.log('Lambda invoked with event:', JSON.stringify(event));
    
    try {
        // NEW: Handle custom queries - CHECK THIS FIRST
        if (event.query) {
            console.log(' Running custom query:', event.query);
            const db = new DatabaseService();
            const pool = await db.init();
            const result = await pool.query(event.query);
            await pool.end();
            
            return {
                statusCode: 200,
                body: JSON.stringify({
                    rows: result.rows,
                    count: result.rowCount,
                    query: event.query
                })
            };
        }
        
        // Manual test mode (empty payload)
        if (!event.Records || event.Records.length === 0) {
            console.log('Manual test - running database queries');
            const db = new DatabaseService();
            const pool = await db.init();
            
            const count = await pool.query('SELECT COUNT(*) as total FROM entities');
            console.log(`Total entities: ${count.rows[0].total}`);
            
            const entities = await pool.query('SELECT * FROM entities ORDER BY created_at DESC LIMIT 5');
            console.log('Latest entities:', entities.rows);
            
            return {
                statusCode: 200,
                body: JSON.stringify({
                    total: count.rows[0].total,
                    latest: entities.rows,
                    message: 'Database query successful'
                })
            };
        }
        
        // Original S3 processing logic
        const record = event.Records[0];
        const bucket = record.s3.bucket.name;
        const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
        const sourceSystem = key.includes('crm') ? 'crm' : 'erp';
        
        console.log(`Processing: ${key} from ${sourceSystem}`);
        
        const command = new GetObjectCommand({ Bucket: bucket, Key: key });
        const response = await s3.send(command);
        const fileContent = await response.Body.transformToString();
        const data = JSON.parse(fileContent);
        
        console.log(`Found ${data.records.length} records`);
        
        const mapper = new SimpleMapper();
        const entities = data.records.map(record => 
            mapper.mapToCanonical(record, sourceSystem)
        );
        
        const db = new DatabaseService();
        const result = await db.bulkInsertEntities(entities);
        
        if (result.connected && result.inserted) {
            console.log('COMPLETE SUCCESS: Database connected AND data inserted!');
        } else {
            console.log('Partial success - check details above');
        }
        
        return {
            statusCode: 200,
            body: JSON.stringify({
                success: result.success,
                recordsProcessed: result.count,
                databaseConnected: result.connected,
                dataInserted: result.inserted,
                message: result.inserted ? 'Complete pipeline working!' : 'Pipeline partially working'
            })
        };
        
    } catch (error) {
        console.error('❌ Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                success: false,
                error: error.message
            })
        };
    }
};
