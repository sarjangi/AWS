// src/api/server.js - Local development server
import express from 'express';
import { DatabaseService } from '../database/database-service.js';
import { CanonicalMapper } from '../transformation/canonical-mapper.js';

const app = express();
const port = 3000;

// Middleware to parse JSON bodies
app.use(express.json());

const db = new DatabaseService();
const mapper = new CanonicalMapper();

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        service: 'Data Pipeline API'
    });
});

// Get all entities
app.get('/data', async (req, res) => {
    try {
        const { type, status, limit = 100 } = req.query;
        
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

        // For local development, we'll mock the database response
        // since we might not have PostgreSQL running locally
        const mockData = [
            {
                entity_id: 'test-1',
                entity_type: 'medium_business',
                canonical_id: 'crm_1',
                attributes: { name: 'Tech Corp', revenue: 1000000 },
                created_at: new Date().toISOString()
            },
            {
                entity_id: 'test-2', 
                entity_type: 'small_business',
                canonical_id: 'crm_2',
                attributes: { name: 'Retail Inc', revenue: 500000 },
                created_at: new Date().toISOString()
            }
        ];

        res.json({
            success: true,
            data: mockData,
            count: mockData.length
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Transform data endpoint (for testing transformations locally)
app.post('/transform', async (req, res) => {
    try {
        const { data, sourceSystem } = req.body;

        if (!data || !sourceSystem) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: data and sourceSystem'
            });
        }

        const canonical = await mapper.mapToCanonical(data, sourceSystem);
        
        res.json({
            success: true,
            original: data,
            canonical: canonical
        });

    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// Analytics endpoint
app.get('/analytics', async (req, res) => {
    try {
        const { startDate, endDate, topN = 10 } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({
                success: false,
                error: 'startDate and endDate parameters are required'
            });
        }

        // Mock analytics response for local development
        const mockAnalytics = [
            {
                entity_type: 'medium_business',
                count: 5,
                avg_revenue: 1500000,
                max_revenue: 2500000
            },
            {
                entity_type: 'small_business', 
                count: 8,
                avg_revenue: 450000,
                max_revenue: 800000
            }
        ];

        res.json({
            success: true,
            period: { startDate, endDate },
            analytics: mockAnalytics
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Test data transformation with sample data
app.get('/test-transform', async (req, res) => {
    try {
        const sampleData = {
            id: 999,
            company_name: "Test Company Ltd",
            annual_revenue: 1200000,
            employee_count: 65,
            industry_code: "TECH"
        };

        const canonical = await mapper.mapToCanonical(sampleData, 'crm-system');
        
        res.json({
            success: true,
            sample_data: sampleData,
            transformed: canonical
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`🚀 Local development server running at http://localhost:${port}`);
    console.log(`📊 Endpoints:`);
    console.log(`   GET  /health          - Health check`);
    console.log(`   GET  /data            - Get all entities`);
    console.log(`   POST /transform       - Transform data to canonical format`);
    console.log(`   GET  /analytics       - Get analytics`);
    console.log(`   GET  /test-transform  - Test transformation with sample data`);
});

export default app;