const { Pool } = require('pg');
const { getSecret } = require('../shared/aws-utils.js');

class AdvancedQueryService {
    constructor() {
        this.pool = null;
    }

    async init() {
        if (!this.pool) {
            const secret = await getSecret(process.env.SECRET_ARN);
            this.pool = new Pool({
                host: process.env.DB_HOST,
                database: process.env.DB_NAME,
                user: secret.username,
                password: secret.password,
                port: secret.port || 5432,
                max: 10,
                idleTimeoutMillis: 30000,
                ssl: { rejectUnauthorized: false }
            });
        }
        return this.pool;
    }

    /**
     * EXTREMELY COMPLEX QUERY 1: Multi-dimensional Business Analytics
     * Uses: Window functions, CTEs, JSONB operations, correlated subqueries
     */
    async getMultiDimensionalAnalytics(timeframe = '3 months') {
        const pool = await this.init();
        
        const query = `
            WITH time_periods AS (
                SELECT 
                    date_bin('1 month'::interval, created_at, '2024-01-01'::timestamp) as period_start,
                    date_bin('1 month'::interval, created_at, '2024-01-01'::timestamp) + '1 month'::interval as period_end
                FROM entities
                WHERE created_at >= NOW() - $1::interval
                GROUP BY 1
            ),
            entity_metrics AS (
                SELECT 
                    e.entity_id,
                    e.entity_type,
                    e.source_system,
                    (e.attributes->>'revenue')::numeric as revenue,
                    (e.attributes->>'employees')::integer as employees,
                    tp.period_start,
                    -- Complex JSONB extraction with fallbacks
                    COALESCE(
                        e.attributes->>'industry',
                        e.attributes->>'industry_code', 
                        e.attributes->>'sector',
                        'unknown'
                    ) as industry,
                    -- Calculate derived metrics
                    CASE 
                        WHEN (e.attributes->>'revenue')::numeric > 0 
                             AND (e.attributes->>'employees')::integer > 0
                        THEN (e.attributes->>'revenue')::numeric / (e.attributes->>'employees')::integer
                        ELSE NULL 
                    END as revenue_per_employee
                FROM entities e
                CROSS JOIN time_periods tp
                WHERE e.created_at >= tp.period_start 
                  AND e.created_at < tp.period_end
                  AND e.status = 'active'
            ),
            windowed_metrics AS (
                SELECT 
                    period_start,
                    entity_type,
                    industry,
                    COUNT(*) as entity_count,
                    AVG(revenue) as avg_revenue,
                    AVG(employees) as avg_employees,
                    AVG(revenue_per_employee) as avg_revenue_per_employee,
                    -- Window functions for rankings and trends
                    RANK() OVER (
                        PARTITION BY period_start, entity_type 
                        ORDER BY AVG(revenue) DESC
                    ) as revenue_rank_by_type,
                    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY revenue) as median_revenue,
                    PERCENTILE_CONT(0.8) WITHIN GROUP (ORDER BY revenue) as p80_revenue,
                    -- Growth calculations
                    LAG(AVG(revenue)) OVER (
                        PARTITION BY entity_type, industry 
                        ORDER BY period_start
                    ) as prev_period_avg_revenue,
                    -- Complex conditional aggregation
                    SUM(CASE WHEN revenue > 1000000 THEN 1 ELSE 0 END) as enterprise_count,
                    SUM(CASE WHEN revenue BETWEEN 500000 AND 1000000 THEN 1 ELSE 0 END) as medium_business_count
                FROM entity_metrics
                GROUP BY period_start, entity_type, industry
            ),
            final_analytics AS (
                SELECT 
                    period_start,
                    entity_type,
                    industry,
                    entity_count,
                    avg_revenue,
                    avg_employees,
                    avg_revenue_per_employee,
                    revenue_rank_by_type,
                    median_revenue,
                    p80_revenue,
                    -- Growth rate calculation
                    CASE 
                        WHEN prev_period_avg_revenue IS NOT NULL AND prev_period_avg_revenue > 0
                        THEN ((avg_revenue - prev_period_avg_revenue) / prev_period_avg_revenue) * 100
                        ELSE NULL 
                    END as revenue_growth_pct,
                    -- Market share calculations
                    entity_count::decimal / SUM(entity_count) OVER (PARTITION BY period_start) as overall_market_share,
                    enterprise_count,
                    medium_business_count,
                    -- Complex business segmentation
                    CASE 
                        WHEN avg_revenue > 5000000 THEN 'Tier 1'
                        WHEN avg_revenue > 1000000 THEN 'Tier 2' 
                        WHEN avg_revenue > 500000 THEN 'Tier 3'
                        ELSE 'Tier 4'
                    END as business_tier
                FROM windowed_metrics
            )
            SELECT * FROM final_analytics
            ORDER BY period_start DESC, revenue_rank_by_type
            LIMIT 100;
        `;

        const result = await pool.query(query, [`${timeframe}`]);
        return result.rows;
    }

    /**
     * EXTREMELY COMPLEX QUERY 2: Entity Relationship Network Analysis
     * Uses: Recursive CTEs, Graph analysis, JSONB path operations
     */
    async getEntityRelationshipNetwork(rootEntityId = null) {
        const pool = await this.init();
        
        const query = `
            WITH RECURSIVE entity_graph AS (
                -- Anchor: Start with root entity or all top-level entities
                SELECT 
                    e.entity_id,
                    e.canonical_id,
                    e.entity_type,
                    e.attributes->>'name' as entity_name,
                    (e.attributes->>'revenue')::numeric as revenue,
                    0 as depth,
                    ARRAY[e.entity_id] as path,
                    FALSE as cycle,
                    -- Complex JSONB path existence checks
                    (e.attributes ? 'acquisitions') as has_acquisitions,
                    (e.attributes ? 'subsidiaries') as has_subsidiaries
                FROM entities e
                WHERE ($1::uuid IS NULL AND NOT EXISTS (
                    SELECT 1 FROM entity_relationships er WHERE er.child_entity_id = e.entity_id
                )) OR e.entity_id = $1::uuid
                
                UNION ALL
                
                -- Recursive: Traverse relationships
                SELECT 
                    e.entity_id,
                    e.canonical_id,
                    e.entity_type,
                    e.attributes->>'name' as entity_name,
                    (e.attributes->>'revenue')::numeric as revenue,
                    eg.depth + 1,
                    eg.path || e.entity_id,
                    e.entity_id = ANY(eg.path) as cycle,
                    (e.attributes ? 'acquisitions') as has_acquisitions,
                    (e.attributes ? 'subsidiaries') as has_subsidiaries
                FROM entities e
                INNER JOIN entity_relationships er ON e.entity_id = er.child_entity_id
                INNER JOIN entity_graph eg ON er.parent_entity_id = eg.entity_id
                WHERE NOT cycle AND eg.depth < 5  -- Prevent infinite recursion
            ),
            graph_metrics AS (
                SELECT 
                    entity_id,
                    canonical_id,
                    entity_type,
                    entity_name,
                    revenue,
                    depth,
                    path,
                    -- Network analysis metrics
                    (SELECT COUNT(*) FROM entity_graph eg2 
                     WHERE eg2.entity_id = ANY(eg.path) AND eg2.depth > eg.depth) as downstream_count,
                    -- Complex conditional aggregations across the graph
                    CASE 
                        WHEN depth = 0 THEN 'Root'
                        WHEN depth = 1 THEN 'Direct Child'
                        WHEN depth > 1 THEN 'Indirect Child'
                    END as relationship_type,
                    -- Revenue rollup through hierarchy (simplified)
                    (SELECT SUM(revenue) FROM entity_graph eg2 
                     WHERE eg2.entity_id = ANY(eg.path)) as total_hierarchy_revenue
                FROM entity_graph eg
                WHERE NOT cycle
            ),
            final_network AS (
                SELECT 
                    *,
                    -- Advanced graph analysis
                    array_length(path, 1) as path_length,
                    -- Business impact analysis
                    CASE 
                        WHEN total_hierarchy_revenue > 10000000 THEN 'Strategic'
                        WHEN total_hierarchy_revenue > 1000000 THEN 'Important'
                        ELSE 'Standard'
                    END as business_impact,
                    -- Network centrality approximation
                    (downstream_count::float / NULLIF((SELECT MAX(downstream_count) FROM graph_metrics), 0)) as normalized_centrality
                FROM graph_metrics
            )
            SELECT * FROM final_network
            ORDER BY depth, total_hierarchy_revenue DESC
            LIMIT 200;
        `;

        const result = await pool.query(query, [rootEntityId]);
        return result.rows;
    }

    /**
     * EXTREMELY COMPLEX QUERY 3: Time-Series Pattern Recognition
     * Uses: Time-based aggregations, Statistical functions, Pattern matching
     */
    async getTimeSeriesPatterns(analysisPeriod = '6 months') {
        const pool = await this.init();
        
        const query = `
            WITH time_series_base AS (
                SELECT 
                    e.entity_id,
                    e.entity_type,
                    (e.attributes->>'revenue')::numeric as current_revenue,
                    e.created_at,
                    -- Generate monthly time series from creation date
                    generate_series(
                        date_trunc('month', e.created_at),
                        date_trunc('month', NOW()),
                        '1 month'::interval
                    ) as period,
                    -- Extract multiple attributes for multivariate analysis
                    (e.attributes->>'employees')::integer as employees,
                    COALESCE(e.attributes->>'industry', 'unknown') as industry,
                    e.source_system
                FROM entities e
                WHERE e.created_at >= NOW() - $1::interval
                  AND e.status = 'active'
            ),
            monthly_metrics AS (
                SELECT 
                    entity_id,
                    entity_type,
                    industry,
                    source_system,
                    period,
                    -- Complex conditional time-based calculations
                    CASE 
                        WHEN period = date_trunc('month', created_at) 
                        THEN current_revenue
                        ELSE NULL  -- Would normally join with actual time-series data
                    END as revenue,
                    employees,
                    -- Statistical analysis across periods
                    AVG(current_revenue) OVER (
                        PARTITION BY entity_type, industry 
                        ORDER BY period 
                        ROWS BETWEEN 3 PRECEDING AND CURRENT ROW
                    ) as moving_avg_revenue,
                    STDDEV(current_revenue) OVER (
                        PARTITION BY entity_type, industry
                    ) as revenue_volatility,
                    -- Trend analysis
                    CASE 
                        WHEN LAG(current_revenue) OVER (PARTITION BY entity_id ORDER BY period) IS NOT NULL
                        THEN (current_revenue - LAG(current_revenue) OVER (PARTITION BY entity_id ORDER BY period)) 
                             / LAG(current_revenue) OVER (PARTITION BY entity_id ORDER BY period) * 100
                        ELSE NULL
                    END as revenue_growth_pct
                FROM time_series_base
            ),
            pattern_analysis AS (
                SELECT 
                    period,
                    entity_type,
                    industry,
                    source_system,
                    COUNT(DISTINCT entity_id) as active_entities,
                    AVG(revenue) as avg_revenue,
                    AVG(employees) as avg_employees,
                    AVG(revenue_growth_pct) as avg_growth_rate,
                    -- Advanced statistical functions
                    CORR(revenue, employees) as revenue_employee_correlation,
                    -- Pattern recognition: High growth segments
                    SUM(CASE WHEN revenue_growth_pct > 20 THEN 1 ELSE 0 END) as high_growth_count,
                    SUM(CASE WHEN revenue_growth_pct < -10 THEN 1 ELSE 0 END) as declining_count,
                    -- Volatility analysis
                    STDDEV(revenue) as revenue_stddev,
                    PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY revenue) as revenue_p25,
                    PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY revenue) as revenue_p75,
                    -- Complex business logic
                    CASE 
                        WHEN AVG(revenue_growth_pct) > 15 AND COUNT(*) > 10 THEN 'Emerging Hot'
                        WHEN AVG(revenue_growth_pct) < -5 THEN 'Declining'
                        WHEN STDDEV(revenue_growth_pct) > 25 THEN 'Volatile'
                        ELSE 'Stable'
                    END as segment_trend
                FROM monthly_metrics
                WHERE revenue IS NOT NULL
                GROUP BY period, entity_type, industry, source_system
            )
            SELECT 
                *,
                -- Additional derived metrics
                (high_growth_count::float / NULLIF(active_entities, 0)) * 100 as high_growth_percentage,
                (revenue_stddev / NULLIF(avg_revenue, 0)) * 100 as revenue_coefficient_variation,
                -- Trend momentum
                LAG(avg_growth_rate) OVER (
                    PARTITION BY entity_type, industry 
                    ORDER BY period
                ) as prev_growth_rate
            FROM pattern_analysis
            ORDER BY period DESC, avg_growth_rate DESC
            LIMIT 150;
        `;

        const result = await pool.query(query, [`${analysisPeriod}`]);
        return result.rows;
    }

    /**
     * EXTREMELY COMPLEX QUERY 4: Cross-System Data Integrity Analysis
     * Uses: Fuzzy matching, Data quality scoring, Cross-system reconciliation
     */
    async getDataIntegrityAnalysis() {
        const pool = await this.init();
        
        const query = `
            WITH cross_system_matches AS (
                SELECT 
                    e1.canonical_id as canonical_1,
                    e2.canonical_id as canonical_2,
                    e1.entity_type as type_1,
                    e2.entity_type as type_2,
                    e1.attributes->>'name' as name_1,
                    e2.attributes->>'name' as name_2,
                    e1.source_system as system_1,
                    e2.source_system as system_2,
                    -- Fuzzy name matching using PostgreSQL similarity
                    similarity(
                        LOWER(COALESCE(e1.attributes->>'name', '')),
                        LOWER(COALESCE(e2.attributes->>'name', ''))
                    ) as name_similarity,
                    -- Revenue consistency check
                    ABS(
                        COALESCE((e1.attributes->>'revenue')::numeric, 0) - 
                        COALESCE((e2.attributes->>'revenue')::numeric, 0)
                    ) as revenue_discrepancy,
                    -- Complex data quality scoring
                    CASE 
                        WHEN e1.attributes->>'name' IS NOT NULL AND e2.attributes->>'name' IS NOT NULL THEN 25
                        ELSE 0
                    END +
                    CASE 
                        WHEN ABS(COALESCE((e1.attributes->>'revenue')::numeric, 0) - 
                                COALESCE((e2.attributes->>'revenue')::numeric, 0)) < 1000 THEN 25
                        ELSE 0
                    END +
                    CASE 
                        WHEN ABS(COALESCE((e1.attributes->>'employees')::integer, 0) - 
                                COALESCE((e2.attributes->>'employees')::integer, 0)) < 5 THEN 25
                        ELSE 0
                    END +
                    CASE 
                        WHEN similarity(
                            LOWER(COALESCE(e1.attributes->>'name', '')),
                            LOWER(COALESCE(e2.attributes->>'name', ''))
                        ) > 0.8 THEN 25
                        ELSE 0
                    END as data_quality_score
                FROM entities e1
                CROSS JOIN entities e2
                WHERE e1.entity_id <> e2.entity_id
                  AND e1.source_system <> e2.source_system
                  AND (e1.attributes->>'name' IS NOT NULL AND e2.attributes->>'name' IS NOT NULL)
                  AND similarity(
                        LOWER(COALESCE(e1.attributes->>'name', '')),
                        LOWER(COALESCE(e2.attributes->>'name', ''))
                  ) > 0.6  -- Minimum similarity threshold
            ),
            integrity_analysis AS (
                SELECT 
                    canonical_1,
                    canonical_2,
                    name_1,
                    name_2,
                    system_1,
                    system_2,
                    name_similarity,
                    revenue_discrepancy,
                    data_quality_score,
                    -- Match confidence classification
                    CASE 
                        WHEN data_quality_score >= 90 THEN 'High Confidence'
                        WHEN data_quality_score >= 70 THEN 'Medium Confidence' 
                        WHEN data_quality_score >= 50 THEN 'Low Confidence'
                        ELSE 'Poor Match'
                    END as match_confidence,
                    -- Discrepancy analysis
                    CASE 
                        WHEN revenue_discrepancy > 10000 THEN 'Major Revenue Discrepancy'
                        WHEN revenue_discrepancy > 1000 THEN 'Moderate Revenue Discrepancy'
                        ELSE 'Minor Revenue Discrepancy'
                    END as discrepancy_level,
                    -- Recommended action
                    CASE 
                        WHEN data_quality_score >= 80 THEN 'Auto-merge Recommended'
                        WHEN data_quality_score >= 60 THEN 'Manual Review Required'
                        ELSE 'Investigate Data Quality'
                    END as recommended_action
                FROM cross_system_matches
            )
            SELECT * FROM integrity_analysis
            ORDER BY data_quality_score DESC, name_similarity DESC
            LIMIT 100;
        `;

        const result = await pool.query(query);
        return result.rows;
    }
/**
 * Customer Analysis with WHERE/HAVING patterns
 */
async getCustomerAnalysis(metric = 'lifetime_value', groupBy = 'industry') {
    const pool = await this.init();
    
    const query = `
        WITH customer_segments AS (
            SELECT 
                COALESCE(attributes->>'industry', attributes->>'industry_code', 'unknown') as industry,
                (attributes->>'${metric}')::numeric as metric_value,
                COUNT(*) as customer_count
            FROM entities 
            WHERE status = 'active' 
              AND attributes->>'${metric}' IS NOT NULL
            GROUP BY industry
            HAVING COUNT(*) > 5 AND AVG((attributes->>'${metric}')::numeric) > 0
        )
        SELECT 
            industry,
            AVG(metric_value) as avg_metric,
            SUM(metric_value) as total_metric,
            customer_count,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY metric_value) as median_metric
        FROM customer_segments
        GROUP BY industry, customer_count
        ORDER BY avg_metric DESC
    `;

    const result = await pool.query(query);
    return result.rows;
}

/**
 * Revenue Analysis with Window Functions
 */
async getRevenueAnalysis(metric = 'annual_revenue', groupBy = 'region') {
    const pool = await this.init();
    
    const query = `
        WITH revenue_data AS (
            SELECT 
                COALESCE(attributes->>'${groupBy}', 'unknown') as group_value,
                (attributes->>'${metric}')::numeric as revenue,
                (attributes->>'employees')::integer as employees
            FROM entities 
            WHERE status = 'active' 
              AND attributes->>'${metric}' IS NOT NULL
        ),
        ranked_revenue AS (
            SELECT 
                group_value,
                revenue,
                employees,
                RANK() OVER (PARTITION BY group_value ORDER BY revenue DESC) as revenue_rank,
                LAG(revenue) OVER (PARTITION BY group_value ORDER BY revenue) as prev_revenue,
                PERCENT_RANK() OVER (PARTITION BY group_value ORDER BY revenue) as percentile
            FROM revenue_data
        )
        SELECT 
            group_value,
            COUNT(*) as company_count,
            AVG(revenue) as avg_revenue,
            SUM(revenue) as total_revenue,
            AVG(employees) as avg_employees,
            MAX(revenue) as max_revenue,
            MIN(revenue) as min_revenue
        FROM ranked_revenue
        WHERE revenue_rank <= 100  -- Top 100 per group
        GROUP BY group_value
        HAVING COUNT(*) > 3
        ORDER BY total_revenue DESC
    `;

    const result = await pool.query(query);
    return result.rows;
}
// Add to AdvancedQueryService - uses basic SQL that always works
async getSimpleDemo() {
    const pool = await this.init();
    const result = await pool.query(`
        SELECT 
            'Technology' as industry,
            58000 as avg_revenue,
            3 as customer_count
        UNION ALL
        SELECT 
            'Retail' as industry, 
            25000 as avg_revenue,
            1 as customer_count
        UNION ALL
        SELECT 
            'Manufacturing' as industry,
            120000 as avg_revenue,
            1 as customer_count
    `);
    return result.rows;
}
//  AdvancedQueryService
async getDatabaseInfo() {
    const pool = await this.init();
    
    // Get list of tables
    const tablesResult = await pool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
    `);
    
    // Get table structure for the first table (if any exist)
    let tableStructure = [];
    if (tablesResult.rows.length > 0) {
        const firstTable = tablesResult.rows[0].table_name;
        tableStructure = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = $1
        `, [firstTable]);
    }
    
    return {
        tables: tablesResult.rows,
        sample_table_structure: tableStructure.rows
    };
}
/**
 * Count Analysis with CTEs
 */
async getCountAnalysis(metric = 'customer_count', groupBy = 'industry') {
    const pool = await this.init();
    
    const query = `
        WITH base_counts AS (
            SELECT 
                COALESCE(attributes->>'${groupBy}', 'unknown') as category,
                COUNT(*) as record_count,
                AVG((attributes->>'employees')::integer) as avg_employees
            FROM entities 
            WHERE status = 'active'
            GROUP BY category
        ),
        enriched_counts AS (
            SELECT 
                category,
                record_count,
                avg_employees,
                -- Window functions for ranking
                RANK() OVER (ORDER BY record_count DESC) as count_rank,
                PERCENTILE_CONT(0.8) WITHIN GROUP (ORDER BY record_count) OVER () as p80_count
            FROM base_counts
        )
        SELECT 
            category,
            record_count,
            avg_employees,
            count_rank,
            CASE 
                WHEN record_count > p80_count THEN 'High Density'
                WHEN record_count > p80_count * 0.5 THEN 'Medium Density'
                ELSE 'Low Density'
            END as density_category
        FROM enriched_counts
        ORDER BY count_rank
    `;

    const result = await pool.query(query);
    return result.rows;
}
    async close() {
        if (this.pool) {
            await this.pool.end();
        }
    }
}

module.exports = { AdvancedQueryService };