const { AdvancedQueryService } = require('../analytics/advanced-queries.js');
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const logger = require('../shared/logger.js');

class AnalyticsService {
    constructor() {
        this.queryService = new AdvancedQueryService();
        this.operationTimeouts = new Map();
        this.s3 = new S3Client();
        this.s3Bucket = process.env.RESULTS_BUCKET;
    }
    // step Functions 
    async submitAnalyticsJob(operation, parameters) {
        const jobService = new JobService();
        const jobId = await jobService.createJob(operation, parameters);
        
        return {
            jobId: jobId,
            status: 'submitted', 
            message: 'Job submitted to Step Functions workflow',
            checkStatusUrl: `/analytics/jobs/${jobId}`,
            submittedAt: new Date().toISOString()
        };
    }

    // Special handler for Step Functions
    async executeForStepFunctions(operation, parameters) {
        // Simplified - just run the query, let Step Functions handle retries
        const result = await this.executeAnalyticsOperation(operation, parameters);
        return {
            success: true,
            data: result.data,
            metadata: result.metadata
        };
    }
    async handleS3Download(event) {
        try {
            const key = event.pathParameters?.key;
            if (!key) {
                throw new Error('Download key is required');
            }

            const command = new GetObjectCommand({
                Bucket: this.s3Bucket,
                Key: `results/${key}`
            });

            const response = await this.s3.send(command);
            const resultData = JSON.parse(await response.Body.transformToString());

            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    success: true,
                    data: resultData.data,
                    metadata: {
                        operation: resultData.operation,
                        generatedAt: resultData.generatedAt,
                        recordCount: resultData.recordCount,
                        source: 's3'
                    }
                })
            };

        } catch (error) {
            return {
                statusCode: 404,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({
                    success: false,
                    error: 'Result not found or expired',
                    message: error.message
                })
            };
        }
    }

    async saveLargeResultToS3(result, operation, startTime) {
        const s3Key = `results/${operation}-${Date.now()}.json`;
        const resultData = {
            operation,
            data: result,
            generatedAt: new Date().toISOString(),
            recordCount: result.length
        };

        await this.s3.send(new PutObjectCommand({
            Bucket: this.s3Bucket,
            Key: s3Key,
            Body: JSON.stringify(resultData, null, 2),
            ContentType: 'application/json'
        }));

        const executionTime = Date.now() - startTime;
        
        return {
            success: true,
            operation,
            executionTime: `${executionTime}ms`,
            largeResult: true,
            s3Url: `s3://${this.s3Bucket}/${s3Key}`,
            downloadUrl: `/download/${s3Key.split('/').pop()}`,
            recordCount: result.length,
            message: 'Large result saved to S3 for download',
            metadata: {
                resultCount: result.length,
                timestamp: new Date().toISOString(),
                cacheHit: false
            }
        };
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

            // Check if result is large and save to S3
            if (result.length > 1000 || JSON.stringify(result).length > 5000000) {
                return await this.saveLargeResultToS3(result, operation, startTime);
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
        this.validateCustomQuery(query);

        const pool = await this.queryService.init();
        const result = await pool.query(query, params);

        return result.rows;
    }

    validateCustomQuery(query) {
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

exports.handler = async (event, context) => {
    logger.info('Analytics Lambda invoked', {
        event: JSON.stringify(event),
        remainingTime: context.getRemainingTimeInMillis()
    });

    const analyticsService = new AnalyticsService();

    try {
        if (event.httpMethod) {
            return await handleApiGatewayEvent(event, analyticsService);
        } else if (event.operation) {
            return await handleDirectInvocation(event, analyticsService);
        } else if (event.source === 'aws.events') {
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

    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY'
    };

    if (httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    // FIXED: Call handleS3Download on analyticsService instance
    if (httpMethod === 'GET' && path.includes('/download/')) {
        return await analyticsService.handleS3Download(event);
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
                        'GET /analytics?operation=<operation>&parameters=<json>',
                        'GET /download/{key}'
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

    if (requestId) {
        result.requestId = requestId;
    }

    return result;
}

async function handleScheduledEvent(event, analyticsService) {
    logger.info('Scheduled event received', { event });

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

exports.AnalyticsService = AnalyticsService;