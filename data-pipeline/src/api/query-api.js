const { DatabaseService } = require('../database/database-service.js');

const db = new DatabaseService();

exports.handler = handler = async (event) => {
    console.log('API Event received:', event.httpMethod, event.path);

    const { httpMethod, path, queryStringParameters } = event;

    try {
        let result;

        if (httpMethod === 'GET' && path.includes('/analytics')) {
            result = await handleAnalyticsQuery(queryStringParameters);
        } else if (httpMethod === 'GET' && path.includes('/data')) {
            result = await handleDataQuery(queryStringParameters);
        } else {
            return createResponse(404, { error: 'Endpoint not found' });
        }

        return createResponse(200, result);
    } catch (error) {
        console.error('API Error:', error);
        return createResponse(500, { error: error.message });
    }
};

async function handleAnalyticsQuery(params) {
    const { startDate, endDate, topN = 10 } = params;
    
    if (!startDate || !endDate) {
        throw new Error('startDate and endDate parameters are required');
    }

    return await db.getEntityAnalytics(startDate, endDate, parseInt(topN));
}

async function handleDataQuery(params) {
    const { type, status, limit = 100 } = params;
    let query = 'SELECT * FROM entities WHERE 1=1';
    const values = [];
    let paramCount = 1;

    if (type) {
        query += ` AND entity_type = $${paramCount}`;
        values.push(type);
        paramCount++;
    }

    if (status) {
        query += ` AND status = $${paramCount}`;
        values.push(status);
        paramCount++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramCount}`;
    values.push(parseInt(limit));

    const result = await db.pool.query(query, values);
    return result.rows;
}

function createResponse(statusCode, body) {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify(body)
    };
}