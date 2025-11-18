const { AdvancedQueryService } = require('../analytics/advanced-queries.js');
const logger = require('../shared/logger.js');

class AnalyticsService {
    constructor() {
        this.queryService = new AdvancedQueryService();
        this.operationTimeouts = new Map();
    }

    async executeAnalyticsOperation(operation, parameters = {}) {
        const startTime = Date.now();
        const operationId = `${operation}_${startTime}`;

        try {
            logger.info('Starting analytics operation', {
                operation,
                parameters,
                operationId
            });

            let result;

            switch (operation) {
                case 'database_info':
                    result = await this.queryService.getDatabaseInfo();
                    break;
                case 'multi_dimensional_analytics':
                    result = await this.queryService.getMultiDimensionalAnalytics(
                        parameters.timeframe || '3 months'
                    );
                    break;

                case 'relationship_network':
                    result = await this.queryService.getEntityRelationshipNetwork(
                        parameters.rootEntityId
                    );
                    break;

                case 'time_series_patterns':
                    result = await this.queryService.getTimeSeriesPatterns(
                        parameters.analysisPeriod || '6 months'
                    );
                    break;

                case 'data_integrity_analysis':
                    result = await this.queryService.getDataIntegrityAnalysis();
                    break;

                case 'customer_analysis':
                    result = await this.queryService.getCustomerAnalysis(
                        parameters.metric || 'lifetime_value',
                        parameters.group_by || 'industry'
                    );
                    break;

                case 'revenue_analysis':
                    result = await this.queryService.getRevenueAnalysis(
                        parameters.metric || 'annual_revenue',
                        parameters.group_by || 'region'
                    );
                    break;

                case 'count_analysis':
                    result = await this.queryService.getCountAnalysis(
                        parameters.metric || 'customer_count',
                        parameters.group_by || 'industry'
                    );
                    break;

                case 'custom_complex_query':
                    if (!parameters.query) {
                        throw new Error('Custom query is required for this operation');
                    }
                    result = await this.executeCustomComplexQuery(parameters.query, parameters.params);
                    break;
                case 'simple_demo':
                    result = await this.queryService.getSimpleDemo();
                    break;
                default:
                    throw new Error(`Unknown analytics operation: ${operation}`);
            }

            const executionTime = Date.now() - startTime;

            logger.info('Analytics operation completed', {
                operation,
                operationId,
                executionTime,
                resultCount: result?.length || 0
            });

            return {
                success: true,
                operation,
                operationId,
                executionTime: `${executionTime}ms`,
                data: result,
                metadata: {
                    resultCount: result?.length || 0,
                    timestamp: new Date().toISOString(),
                    cacheHit: false
                }
            };

        } catch (error) {
            const executionTime = Date.now() - startTime;

            logger.error('Analytics operation failed', {
                operation,
                operationId,
                executionTime,
                error: error.message,
                stack: error.stack
            });

            return {
                success: false,
                operation,
                operationId,
                executionTime: `${executionTime}ms`,
                error: {
                    message: error.message,
                    type: error.constructor.name,
                    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
                },
                suggestions: this.getErrorSuggestions(error, operation)
            };
        }
    }

    async executeCustomComplexQuery(query, params = []) {
        // Security validation for custom queries
        this.validateCustomQuery(query);

        const pool = await this.queryService.init();
        const result = await pool.query(query, params);

        return result.rows;
    }

    validateCustomQuery(query) {
        // Basic security checks - in production, use a proper query validator
        const forbiddenPatterns = [
            /DROP\s+/i,
            /DELETE\s+FROM/i,
            /TRUNCATE\s+/i,
            /INSERT\s+INTO/i,
            /UPDATE\s+\w+\s+SET/i,
            /CREATE\s+/i,
            /ALTER\s+/i,
            /GRANT\s+/i,
            /REVOKE\s+/i
        ];

        for (const pattern of forbiddenPatterns) {
            if (pattern.test(query)) {
                throw new Error('Query contains forbidden operations');
            }
        }

        // Limit query complexity (simple heuristic)
        const queryLength = query.length;
        if (queryLength > 10000) {
            throw new Error('Query too complex. Maximum length exceeded.');
        }
    }

    getErrorSuggestions(error, operation) {
        const suggestions = [];

        if (error.message.includes('timeout')) {
            suggestions.push('Try reducing the analysis timeframe');
            suggestions.push('Consider using smaller data subsets');
        }

        if (error.message.includes('memory')) {
            suggestions.push('Try using more specific filters');
            suggestions.push('Consider implementing pagination');
        }

        if (error.message.includes('syntax')) {
            suggestions.push('Check query syntax and parameter types');
        }

        // Operation-specific suggestions
        switch (operation) {
            case 'relationship_network':
                suggestions.push('Try specifying a rootEntityId to limit the graph traversal');
                break;
            case 'multi_dimensional_analytics':
                suggestions.push('Try using a shorter timeframe for initial analysis');
                break;
        }

        return suggestions.length > 0 ? suggestions : ['Check parameters and try again'];
    }

    async getServiceHealth() {
        try {
            const pool = await this.queryService.init();
            const healthCheck = await pool.query('SELECT 1 as status, NOW() as timestamp');

            return {
                status: 'healthy',
                database: 'connected',
                timestamp: new Date().toISOString(),
                details: {
                    database_timestamp: healthCheck.rows[0].timestamp,
                    service: 'Advanced Analytics Service',
                    version: '1.0.0'
                }
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                database: 'disconnected',
                timestamp: new Date().toISOString(),
                error: error.message
            };
        }
    }
}

// Lambda handler with comprehensive error handling and logging
exports.handler = async (event, context) => {
    logger.info('Analytics Lambda invoked', {
        event: JSON.stringify(event),
        remainingTime: context.getRemainingTimeInMillis()
    });

    const analyticsService = new AnalyticsService();

    try {
        // Handle different invocation types
        if (event.httpMethod) {
            // API Gateway invocation
            return await handleApiGatewayEvent(event, analyticsService);
        } else if (event.operation) {
            // Direct Lambda invocation
            return await handleDirectInvocation(event, analyticsService);
        } else if (event.source === 'aws.events') {
            // CloudWatch Events invocation
            return await handleScheduledEvent(event, analyticsService);
        } else {
            throw new Error('Unknown invocation type');
        }
    } catch (error) {
        logger.error('Top-level handler error', {
            error: error.message,
            stack: error.stack
        });

        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                success: false,
                error: 'Internal server error',
                referenceId: context.awsRequestId
            })
        };
    } finally {
        await analyticsService.queryService.close();
    }
};

async function handleApiGatewayEvent(event, analyticsService) {
    const { httpMethod, path, queryStringParameters, body } = event;

    logger.info('API Gateway request', { httpMethod, path, queryStringParameters });

    // Set security headers
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY'
    };

    // Handle preflight requests
    if (httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    try {
        let result;

        if (httpMethod === 'GET' && path.includes('/health')) {
            result = await analyticsService.getServiceHealth();
        }
        else if (httpMethod === 'POST' && path.includes('/analytics')) {
            const requestBody = JSON.parse(body || '{}');
            result = await analyticsService.executeAnalyticsOperation(
                requestBody.operation,
                requestBody.parameters
            );
        }
        else if (httpMethod === 'GET' && path.includes('/analytics')) {
            const operation = queryStringParameters?.operation;
            const parameters = queryStringParameters?.parameters
                ? JSON.parse(queryStringParameters.parameters)
                : {};

            result = await analyticsService.executeAnalyticsOperation(operation, parameters);
        }
        else {
            return {
                statusCode: 404,
                headers,
                body: JSON.stringify({
                    success: false,
                    error: 'Endpoint not found',
                    availableEndpoints: [
                        'GET /health',
                        'POST /analytics',
                        'GET /analytics?operation=<operation>&parameters=<json>'
                    ]
                })
            };
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(result)
        };

    } catch (error) {
        logger.error('API Gateway handling error', { error: error.message });

        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
                success: false,
                error: error.message,
                type: 'API_ERROR'
            })
        };
    }
}

async function handleDirectInvocation(event, analyticsService) {
    logger.info('Direct Lambda invocation', { event });

    const { operation, parameters, requestId } = event;

    if (!operation) {
        throw new Error('Operation parameter is required for direct invocation');
    }

    const result = await analyticsService.executeAnalyticsOperation(operation, parameters);

    // Add request context if available
    if (requestId) {
        result.requestId = requestId;
    }

    return result;
}

async function handleScheduledEvent(event, analyticsService) {
    logger.info('Scheduled event received', { event });

    // Pre-defined scheduled analytics operations
    const scheduledOperations = [
        {
            operation: 'multi_dimensional_analytics',
            parameters: { timeframe: '1 month' },
            description: 'Monthly business analytics'
        },
        {
            operation: 'data_integrity_analysis',
            parameters: {},
            description: 'Daily data quality check'
        }
    ];

    const results = [];

    for (const scheduledOp of scheduledOperations) {
        try {
            logger.info('Executing scheduled operation', scheduledOp);

            const result = await analyticsService.executeAnalyticsOperation(
                scheduledOp.operation,
                scheduledOp.parameters
            );

            results.push({
                operation: scheduledOp.operation,
                description: scheduledOp.description,
                success: result.success,
                executionTime: result.executionTime,
                resultCount: result.data?.length || 0
            });

            // Add delay between operations to avoid overwhelming the database
            await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (error) {
            logger.error('Scheduled operation failed', {
                operation: scheduledOp.operation,
                error: error.message
            });

            results.push({
                operation: scheduledOp.operation,
                description: scheduledOp.description,
                success: false,
                error: error.message
            });
        }
    }

    return {
        scheduledEvent: true,
        timestamp: new Date().toISOString(),
        results,
        summary: {
            total: results.length,
            successful: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length
        }
    };
}

// Export for testing and local development
exports.AnalyticsService = AnalyticsService;
