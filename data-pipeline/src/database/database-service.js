// src/database/database-service.js
const { Pool } = require('pg');
const { getSecret } = require('../shared/aws-utils.js');

class DatabaseService {
    constructor() {
        this.pool = null;
    }

    async init() {
        if (!this.pool) {
            // Get database credentials from Secrets Manager
            const secret = await getSecret(process.env.SECRET_ARN);
            
            this.pool = new Pool({
                host: process.env.DB_HOST,
                port: process.env.DB_PORT || 5432,
                database: process.env.DB_NAME,
                user: secret.username || 'postgres',
                password: secret.password,
                max: 20,
                idleTimeoutMillis: 30000,
            });
        }
        return this.pool;
    }

    async bulkInsertEntities(entities, batchSize = 500) {
        const pool = await this.init();
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            console.log(`Starting bulk insert of ${entities.length} entities`);
            
            for (let i = 0; i < entities.length; i += batchSize) {
                const batch = entities.slice(i, i + batchSize);
                const placeholders = [];
                const values = [];
                
                batch.forEach((entity, index) => {
                    const pos = index * 6;
                    placeholders.push(`($${pos + 1}, $${pos + 2}, $${pos + 3}, $${pos + 4}, $${pos + 5}, $${pos + 6})`);
                    
                    values.push(
                        entity.entity_type,
                        entity.source_system,
                        entity.canonical_id,
                        JSON.stringify(entity.attributes || {}),
                        JSON.stringify(entity.metadata || {}),
                        entity.status || 'active'
                    );
                });
                
                const query = `
                    INSERT INTO entities 
                    (entity_type, source_system, canonical_id, attributes, metadata, status)
                    VALUES ${placeholders.join(', ')}
                    ON CONFLICT (canonical_id) 
                    DO UPDATE SET
                        attributes = EXCLUDED.attributes,
                        metadata = EXCLUDED.metadata,
                        updated_at = NOW(),
                        version = entities.version + 1
                `;
                
                await client.query(query, values);
                console.log(`Processed batch ${Math.floor(i / batchSize) + 1}`);
            }
            
            await client.query('COMMIT');
            console.log('Bulk insert completed successfully');
            
            return { success: true, count: entities.length };
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Bulk insert failed:', error);
            throw new Error(`Database operation failed: ${error.message}`);
        } finally {
            client.release();
        }
    }

    // ... rest of the methods remain the same
    async getEntityAnalytics(startDate, endDate, topN = 10) {
        const pool = await this.init();
        const query = `
            WITH ranked_entities AS (
                SELECT 
                    entity_id,
                    entity_type,
                    attributes->>'name' as entity_name,
                    (attributes->>'revenue')::numeric as revenue,
                    ROW_NUMBER() OVER (
                        PARTITION BY entity_type 
                        ORDER BY (attributes->>'revenue')::numeric DESC NULLS LAST
                    ) as revenue_rank,
                    AVG((attributes->>'revenue')::numeric) OVER (
                        PARTITION BY entity_type
                    ) as avg_revenue_by_type
                FROM entities 
                WHERE status = 'active' 
                    AND created_at >= $1 
                    AND created_at <= $2
            )
            SELECT 
                entity_id,
                entity_type,
                entity_name,
                revenue,
                revenue_rank,
                avg_revenue_by_type
            FROM ranked_entities
            WHERE revenue_rank <= $3
            ORDER BY entity_type, revenue_rank;
        `;

        const result = await pool.query(query, [startDate, endDate, topN]);
        return result.rows;
    }

    async close() {
        if (this.pool) {
            await this.pool.end();
        }
    }
}