// test-query.js - Check if data made it to PostgreSQL
import { DatabaseService } from './src/database/database-service.js';

async function testQuery() {
    const db = new DatabaseService();
    try {
        await db.init();
        const result = await db.pool.query('SELECT COUNT(*) as count FROM entities');
        console.log(`✅ Total entities in database: ${result.rows[0].count}`);
        
        const recent = await db.pool.query('SELECT * FROM entities ORDER BY created_at DESC LIMIT 3');
        console.log('📊 Recent entities:', recent.rows);
    } catch (error) {
        console.log('❌ Query failed (database might not be accessible locally):', error.message);
    } finally {
        await db.close();
    }
}

testQuery();