const cdk = require('aws-cdk-lib');
const lambda = require('aws-cdk-lib/aws-lambda');
const apigateway = require('aws-cdk-lib/aws-apigateway');
const dynamodb = require('aws-cdk-lib/aws-dynamodb');
const events = require('aws-cdk-lib/aws-events');
const targets = require('aws-cdk-lib/aws-events-targets');
const logs = require('aws-cdk-lib/aws-logs');
const iam = require('aws-cdk-lib/aws-iam');
const s3 = require('aws-cdk-lib/aws-s3');
const ec2 = require('aws-cdk-lib/aws-ec2');
const cloudwatch = require('aws-cdk-lib/aws-cloudwatch');

class AnalyticsStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);

        // Get references to existing resources from DataPipelineStack
        const { vpc, database, rawDataBucket, lambdaSecurityGroup } = props;

        // DynamoDB for analytics metadata and query results cache
        const analyticsTable = new dynamodb.Table(this, 'AnalyticsMetadata', {
            tableName: 'data-pipeline-analytics-metadata',
            partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            timeToLiveAttribute: 'expireAt',
            pointInTimeRecovery: true,
        });

        // Add GSI for querying by operation type and timestamp
        analyticsTable.addGlobalSecondaryIndex({
            indexName: 'GSI1',
            partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
            projectionType: dynamodb.ProjectionType.ALL,
        });

        // S3 bucket for large query results and exports
        const analyticsResultsBucket = new s3.Bucket(this, 'AnalyticsResultsBucket', {
            bucketName: `analytics-results-${this.account}-${this.region}`,
            encryption: s3.BucketEncryption.S3_MANAGED,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            lifecycleRules: [
                {
                    expiration: cdk.Duration.days(30), // Keep results for 30 days
                },
            ],
        });

        // IAM Role for Analytics Lambda
        const analyticsRole = new iam.Role(this, 'AnalyticsLambdaRole', {
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            description: 'Role for Advanced Analytics Lambda functions',
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaVPCAccessExecutionRole'),
            ],
        });

        // Custom policies for analytics service
        analyticsRole.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'secretsmanager:GetSecretValue',
                'secretsmanager:DescribeSecret',
            ],
            resources: [database.secret.secretArn],
        }));

        analyticsRole.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'dynamodb:GetItem',
                'dynamodb:PutItem',
                'dynamodb:UpdateItem',
                'dynamodb:DeleteItem',
                'dynamodb:Query',
                'dynamodb:Scan',
                'dynamodb:BatchGetItem',
                'dynamodb:BatchWriteItem',
            ],
            resources: [
                analyticsTable.tableArn,
                `${analyticsTable.tableArn}/index/GSI1`,
            ],
        }));

        analyticsRole.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                's3:GetObject',
                's3:PutObject',
                's3:DeleteObject',
                's3:ListBucket',
            ],
            resources: [
                analyticsResultsBucket.bucketArn,
                `${analyticsResultsBucket.bucketArn}/*`,
                rawDataBucket.bucketArn,
                `${rawDataBucket.bucketArn}/*`,
            ],
        }));

        analyticsRole.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'logs:CreateLogGroup',
                'logs:CreateLogStream',
                'logs:PutLogEvents',
                'logs:DescribeLogStreams',
            ],
            resources: ['arn:aws:logs:*:*:*'],
        }));

        // Lambda Layer for analytics dependencies
        const analyticsLayer = new lambda.LayerVersion(this, 'AnalyticsDependenciesLayer', {
            code: lambda.Code.fromAsset('../lambda-layer'),
            compatibleRuntimes: [lambda.Runtime.NODEJS_18_X],
            description: 'Dependencies for advanced analytics service',
            license: 'Apache-2.0',
        });

        // Main Analytics Lambda Function
        const analyticsLambda = new lambda.Function(this, 'AdvancedAnalyticsService', {
            functionName: 'data-pipeline-advanced-analytics',
            runtime: lambda.Runtime.NODEJS_18_X,
            code: lambda.Code.fromAsset('../src'),
            handler: 'services/analytics-service.handler',
            timeout: cdk.Duration.minutes(5), // Extended timeout for complex queries
            memorySize: 2048, // Increased memory for complex operations
            role: analyticsRole,
            layers: [analyticsLayer],
            environment: {
                DB_HOST: database.instanceEndpoint.hostname,
                DB_NAME: 'canonicaldb',
                SECRET_ARN: database.secret.secretArn,
                ANALYTICS_TABLE: analyticsTable.tableName,
                RESULTS_BUCKET: analyticsResultsBucket.bucketName,
                LOG_LEVEL: 'INFO',
                NODE_ENV: 'production',
                MAX_QUERY_TIMEOUT: '300000', // 5 minutes
                CACHE_TTL: '3600000', // 1 hour cache TTL
            },
            vpc: vpc,
            vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
            securityGroups: [lambdaSecurityGroup],
            logRetention: logs.RetentionDays.ONE_MONTH,
        });

        // Allow database access
        database.connections.allowFrom(analyticsLambda, ec2.Port.tcp(5432));

        // API Gateway for analytics endpoints
        const analyticsApi = new apigateway.RestApi(this, 'AnalyticsApi', {
            restApiName: 'Data Pipeline Analytics API',
            description: 'API for advanced analytics and complex queries',
            defaultCorsPreflightOptions: {
                allowOrigins: apigateway.Cors.ALL_ORIGINS,
                allowMethods: apigateway.Cors.ALL_METHODS,
                allowHeaders: [
                    'Content-Type',
                    'X-Amz-Date',
                    'Authorization',
                    'X-Api-Key',
                    'X-Amz-Security-Token',
                ],
            },
            deployOptions: {
                stageName: 'prod',
                loggingLevel: apigateway.MethodLoggingLevel.INFO,
                dataTraceEnabled: true,
                metricsEnabled: true,
            },
        });

        // API Gateway integration with Lambda
        const analyticsIntegration = new apigateway.LambdaIntegration(analyticsLambda, {
            proxy: false,
            requestTemplates: {
                'application/json': `
                {
                    "httpMethod": "$context.httpMethod",
                    "path": "$context.resourcePath",
                    "queryStringParameters": {
                        #foreach($param in $input.params().querystring.keySet())
                        "$param": "$util.escapeJavaScript($input.params().querystring.get($param))"
                        #if($foreach.hasNext),#end
                        #end
                    },
                    "body": $input.json('$')
                }
                `,
            },
            integrationResponses: [
                {
                    statusCode: '200',
                    responseParameters: {
                        'method.response.header.Access-Control-Allow-Origin': "'*'",
                    },
                },
                {
                    statusCode: '400',
                    selectionPattern: '.*[Bb]ad[\\s-]*[Rr]equest.*',
                    responseParameters: {
                        'method.response.header.Access-Control-Allow-Origin': "'*'",
                    },
                },
                {
                    statusCode: '500',
                    selectionPattern: '.*[Ii]nternal[\\s-]*[Ee]rror.*',
                    responseParameters: {
                        'method.response.header.Access-Control-Allow-Origin': "'*'",
                    },
                },
            ],
        });

        // API Resources and Methods
        const healthResource = analyticsApi.root.addResource('health');
        healthResource.addMethod('GET', analyticsIntegration, {
            methodResponses: [
                {
                    statusCode: '200',
                    responseParameters: {
                        'method.response.header.Access-Control-Allow-Origin': true,
                    },
                },
            ],
        });

        const analyticsResource = analyticsApi.root.addResource('analytics');
        analyticsResource.addMethod('POST', analyticsIntegration, {
            methodResponses: [
                {
                    statusCode: '200',
                    responseParameters: {
                        'method.response.header.Access-Control-Allow-Origin': true,
                    },
                },
                {
                    statusCode: '400',
                    responseParameters: {
                        'method.response.header.Access-Control-Allow-Origin': true,
                    },
                },
            ],
        });

        analyticsResource.addMethod('GET', analyticsIntegration, {
            methodResponses: [
                {
                    statusCode: '200',
                    responseParameters: {
                        'method.response.header.Access-Control-Allow-Origin': true,
                    },
                },
            ],
        });

        // CloudWatch Events for scheduled analytics
        const dailyAnalyticsRule = new events.Rule(this, 'DailyAnalyticsRule', {
            ruleName: 'daily-analytics-processing',
            schedule: events.Schedule.cron({
                minute: '0',
                hour: '2', // 2 AM daily
                month: '*',
                weekDay: '*',
                year: '*',
            }),
            description: 'Daily scheduled analytics processing',
        });

        dailyAnalyticsRule.addTarget(new targets.LambdaFunction(analyticsLambda, {
            event: events.RuleTargetInput.fromObject({
                source: 'aws.events',
                'detail-type': 'Scheduled Event',
                time: events.EventField.time,
            }),
        }));

        // Monthly  analytics
        const monthlyAnalyticsRule = new events.Rule(this, 'MonthlyAnalyticsRule', {
            ruleName: 'monthly-comprehensive-analytics',
            schedule: events.Schedule.cron({
                minute: '0',
                hour: '3',
                day: '1', // First day of month
                month: '*',
                year: '*',
            }),
            description: 'Monthly comprehensive analytics and reporting',
        });

        monthlyAnalyticsRule.addTarget(new targets.LambdaFunction(analyticsLambda, {
            event: events.RuleTargetInput.fromObject({
                source: 'aws.events',
                'detail-type': 'Scheduled Event',
                time: events.EventField.time,
                operation: 'multi_dimensional_analytics',
                parameters: { timeframe: '3 months' },
            }),
        }));

        // CloudWatch Alarms for monitoring
        const errorAlarm = new cloudwatch.Alarm(this, 'AnalyticsErrorAlarm', {
            alarmName: 'AnalyticsService-HighErrorRate',
            alarmDescription: 'High error rate in Analytics Lambda',
            metric: analyticsLambda.metricErrors({
                period: cdk.Duration.minutes(5),
                statistic: 'Average',
            }),
            threshold: 5, // 5% error rate
            evaluationPeriods: 2,
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        });

        const throttleAlarm = new cloudwatch.Alarm(this, 'AnalyticsThrottleAlarm', {
            alarmName: 'AnalyticsService-Throttles',
            alarmDescription: 'High throttle rate in Analytics Lambda',
            metric: analyticsLambda.metricThrottles({
                period: cdk.Duration.minutes(5),
                statistic: 'Sum',
            }),
            threshold: 10,
            evaluationPeriods: 1,
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        });
        this.analyticsLambda = analyticsLambda;
        this.analyticsTable = analyticsTable; 
        this.analyticsResultsBucket = analyticsResultsBucket;
        // Outputs
        new cdk.CfnOutput(this, 'AnalyticsApiUrl', {
            value: analyticsApi.url,
            description: 'URL for Analytics API',
        });

        new cdk.CfnOutput(this, 'AnalyticsLambdaName', {
            value: analyticsLambda.functionName,
            description: 'Advanced Analytics Lambda function name',
        });

        new cdk.CfnOutput(this, 'AnalyticsTableName', {
            value: analyticsTable.tableName,
            description: 'DynamoDB table for analytics metadata',
        });

        new cdk.CfnOutput(this, 'AnalyticsResultsBucketName', {
            value: analyticsResultsBucket.bucketName,
            description: 'S3 bucket for large query results',
        });

        // Add tags for better resource management
        cdk.Tags.of(this).add('Service', 'AdvancedAnalytics');
        cdk.Tags.of(this).add('Environment', 'Production');
        cdk.Tags.of(this).add('DataClassification', 'Internal');


    }
}

module.exports = { AnalyticsStack };
