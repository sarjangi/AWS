// query-db.js
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { Pool } = require('pg');

async function queryDB() {
    const secretsClient = new SecretsManagerClient({
        region: 'us-east-1'  // Explicitly set region for clarity
    });
    const command = new GetSecretValueCommand({ 
        SecretId: 'DataPipelineStackCanonicalD-glZssXwpZ8yp' // ✅ Correct secret name
    });
    const response = await secretsClient.send(command);
    const secret = JSON.parse(response.SecretString);
    
    const pool = new Pool({
        host: secret.host,
        database: secret.dbname,
        user: secret.username,
        password: secret.password,
        ssl: { rejectUnauthorized: false }
    });
    
    const count = await pool.query('SELECT COUNT(*) as total FROM entities');
    console.log(`📊 Total entities: ${count.rows[0].total}`);
    
    const entities = await pool.query('SELECT * FROM entities ORDER BY created_at DESC LIMIT 5');
    console.log('🔍 Latest entities:', entities.rows);
    
    await pool.end();
}

queryDB().catch(console.error);