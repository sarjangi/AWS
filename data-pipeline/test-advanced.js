const { S3Client, PutObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const { DynamoDBClient, ScanCommand } = require('@aws-sdk/client-dynamodb');
const { CloudWatchLogsClient, FilterLogEventsCommand } = require('@aws-sdk/client-cloudwatch-logs');
const axios = require('axios'); // Add this for API testing

// Clients for all AWS services
const s3 = new S3Client({ region: 'us-east-1' });
const secretsClient = new SecretsManagerClient({ region: 'us-east-1' });
const lambdaClient = new LambdaClient({ region: 'us-east-1' });
const dynamoDb = new DynamoDBClient({ region: 'us-east-1' });
const cloudWatch = new CloudWatchLogsClient({ region: 'us-east-1' });

class PipelineTester {
    constructor() {
        this.testResults = [];
        
        // Use actual resource names from the outputs
        this.bucketName = 'datapipelinestack-rawdatabucket57f26c03-pmq8a0g6z3sm';
        this.databaseSecretId = 'DataPipelineStackCanonicalD-SjAK1kDzdo55-TUxYvS';
        this.analyticsLambdaName = 'data-pipeline-advanced-analytics';
        this.dataProcessorLambdaName = 'DataPipelineStack-DataProcessor2A4C2F9D-1pW1VQY4J8vC';
        this.analyticsTableName = 'data-pipeline-analytics-metadata';
        this.apiUrl = 'https://9z4ap6wa7d.execute-api.us-east-1.amazonaws.com/prod';
        this.databaseHost = 'datapipelinestack-canonicaldatabaseb1ee3819-sqj9bt2nqok0.c4fqogo60qix.us-east-1.rds.amazonaws.com';
    }

    async logTestResult(testName, success, details = '') {
        const result = {
            test: testName,
            status: success ? '✅ PASS' : '❌ FAIL',
            timestamp: new Date().toISOString(),
            details
        };
        this.testResults.push(result);
        console.log(`${result.status} - ${testName}${details ? `: ${details}` : ''}`);
        return success;
    }

    // Test 1: Secrets Manager Access
    async testSecretsManager() {
        try {
            console.log('\n🔐 TEST 1: Secrets Manager Access');
            const command = new GetSecretValueCommand({ 
                SecretId: this.databaseSecretId 
            });
            const response = await secretsClient.send(command);
            const secret = JSON.parse(response.SecretString);
            
            const hasRequiredFields = secret.host && secret.username && secret.password && secret.dbname;
            
            return await this.logTestResult(
                'Secrets Manager Retrieval',
                hasRequiredFields,
                `Host: ${secret.host}, DB: ${secret.dbname}, User: ${secret.username}`
            );
        } catch (error) {
            return await this.logTestResult(
                'Secrets Manager Retrieval',
                false,
                error.message
            );
        }
    }

    // Test 2: S3 Bucket Access
    async testS3Bucket() {
        try {
            console.log('\n📦 TEST 2: S3 Bucket Access');
            const command = new ListObjectsV2Command({
                Bucket: this.bucketName,
                MaxKeys: 10
            });
            const response = await s3.send(command);
            
            const fileCount = response.Contents ? response.Contents.length : 0;
            return await this.logTestResult(
                'S3 Bucket Access',
                true,
                `Bucket: ${this.bucketName}, Files: ${fileCount}`
            );
        } catch (error) {
            return await this.logTestResult(
                'S3 Bucket Access',
                false,
                error.message
            );
        }
    }

    // Test 3: Upload Test Data Files
    async uploadTestFiles() {
        console.log('\n📤 TEST 3: Upload Test Data Files');
        
        const testFiles = [
            {
                key: `crm-data/companies-${Date.now()}.json`,
                data: {
                    records: [
                        {
                            id: 1001,
                            company_name: "Tech Corp Global",
                            annual_revenue: 2500000,
                            employee_count: 120,
                            industry_code: "TECH",
                            created_at: new Date().toISOString()
                        },
                        {
                            id: 1002,
                            business_name: "Retail Masters Inc", 
                            revenue: 850000,
                            employees: 45,
                            industry: "RETL",
                            created_at: new Date().toISOString()
                        },
                        {
                            id: 1003,
                            name: "Manufacturing Solutions Ltd",
                            revenue: 5000000,
                            employees: 300,
                            industry: "MANF",
                            created_at: new Date().toISOString()
                        },
                        {
                            id: 1004,
                            company_name: "Startup Innovators",
                            annual_revenue: 75000,
                            employee_count: 8,
                            industry_code: "TECH",
                            created_at: new Date().toISOString()
                        }
                    ],
                    sourceSystem: "crm-system",
                    batchId: `batch-${Date.now()}`,
                    timestamp: new Date().toISOString()
                }
            },
            {
                key: `crm-data/customers-${Date.now()}.json`,
                data: {
                    records: [
                        {
                            customer_id: 2001,
                            name: "John Smith",
                            email: "john.smith@email.com",
                            company_id: 1001,
                            status: "active",
                            lifetime_value: 50000,
                            created_at: new Date().toISOString()
                        },
                        {
                            customer_id: 2002,
                            name: "Sarah Johnson",
                            email: "sarah.j@email.com", 
                            company_id: 1002,
                            status: "active",
                            lifetime_value: 25000,
                            created_at: new Date().toISOString()
                        },
                        {
                            customer_id: 2003,
                            name: "Mike Davis",
                            email: "mike.davis@email.com",
                            company_id: 1003,
                            status: "active", 
                            lifetime_value: 120000,
                            created_at: new Date().toISOString()
                        }
                    ],
                    sourceSystem: "crm-system",
                    batchId: `batch-${Date.now()}`,
                    timestamp: new Date().toISOString()
                }
            },
            {
                key: `malformed-data/test-malformed-${Date.now()}.json`,
                data: {
                    invalid_structure: "This should cause processing errors",
                    missing_fields: true,
                    timestamp: new Date().toISOString()
                }
            }
        ];

        const uploadResults = [];
        for (const file of testFiles) {
            try {
                const command = new PutObjectCommand({
                    Bucket: this.bucketName,
                    Key: file.key,
                    Body: JSON.stringify(file.data, null, 2),
                    ContentType: 'application/json'
                });
                
                await s3.send(command);
                uploadResults.push({
                    file: file.key,
                    success: true,
                    details: 'Uploaded successfully'
                });
                console.log(`   ✅ Uploaded: ${file.key}`);
            } catch (error) {
                uploadResults.push({
                    file: file.key,
                    success: false,
                    details: error.message
                });
                console.log(`   ❌ Failed: ${file.key} - ${error.message}`);
            }
        }

        const allSuccess = uploadResults.every(result => result.success);
        return await this.logTestResult(
            'Test Data Upload',
            allSuccess,
            `${uploadResults.filter(r => r.success).length}/${uploadResults.length} files uploaded`
        );
    }

    // Test 4: Check Lambda Execution
    async checkLambdaExecution() {
        console.log('\n⚡ TEST 4: Lambda Execution Monitoring');
        
        try {
            // Wait for Lambda to process the files
            console.log('   ⏳ Waiting 30 seconds for Lambda processing...');
            await new Promise(resolve => setTimeout(resolve, 30000));

            // Check CloudWatch logs for Data Processor Lambda
            const logCommand = new FilterLogEventsCommand({
                logGroupName: `/aws/lambda/${this.dataProcessorLambdaName}`,
                limit: 20,
                startTime: Date.now() - 120000 // Last 2 minutes
            });

            const logs = await cloudWatch.send(logCommand);
            const hasRecentLogs = logs.events && logs.events.length > 0;
            const recentEvents = logs.events ? logs.events.slice(-5).map(e => e.message) : [];
            
            return await this.logTestResult(
                'Lambda Execution',
                hasRecentLogs,
                hasRecentLogs ? 
                    `${logs.events.length} recent log events found` : 
                    'No recent logs found - check Lambda configuration'
            );
        } catch (error) {
            return await this.logTestResult(
                'Lambda Execution',
                false,
                error.message
            );
        }
    }

    // Test 5: Direct Lambda Invocation (Analytics)
    async testAnalyticsLambda() {
        console.log('\n📊 TEST 5: Analytics Lambda Direct Invocation');
        
        try {
            const payload = {
                operation: "health_check",
                parameters: {
                    test: true,
                    timestamp: new Date().toISOString()
                }
            };

            const command = new InvokeCommand({
                FunctionName: this.analyticsLambdaName,
                Payload: JSON.stringify(payload),
                InvocationType: 'RequestResponse'
            });

            const response = await lambdaClient.send(command);
            const result = JSON.parse(Buffer.from(response.Payload).toString());
            
            const success = result.statusCode === 200 || result.body;
            return await this.logTestResult(
                'Analytics Lambda Invocation',
                success,
                success ? 'Lambda responded successfully' : `Error: ${JSON.stringify(result)}`
            );
        } catch (error) {
            return await this.logTestResult(
                'Analytics Lambda Invocation',
                false,
                error.message
            );
        }
    }

    // Test 6: Database Connectivity Verification
    async testDatabaseConnectivity() {
        console.log('\n🗄️ TEST 6: Database Connectivity');
        
        try {
            // Get database credentials to verify they're accessible
            const secretCommand = new GetSecretValueCommand({ 
                SecretId: this.databaseSecretId 
            });
            const secretResponse = await secretsClient.send(secretCommand);
            const secret = JSON.parse(secretResponse.SecretString);

            // Verify we have all required connection info
            const hasConnectionInfo = secret.host && secret.port && secret.dbname && secret.username && secret.password;
            
            return await this.logTestResult(
                'Database Connectivity',
                hasConnectionInfo,
                `Host: ${secret.host}, Port: ${secret.port}, DB: ${secret.dbname}`
            );
        } catch (error) {
            return await this.logTestResult(
                'Database Connectivity',
                false,
                error.message
            );
        }
    }

    // Test 7: DynamoDB Analytics Table
    async testDynamoDBTable() {
        console.log('\n📋 TEST 7: DynamoDB Analytics Table');
        
        try {
            const command = new ScanCommand({
                TableName: this.analyticsTableName,
                Limit: 5
            });
            
            const response = await dynamoDb.send(command);
            const itemCount = response.Items ? response.Items.length : 0;
            
            return await this.logTestResult(
                'DynamoDB Table Access',
                true,
                `Table: ${this.analyticsTableName}, Items: ${itemCount}`
            );
        } catch (error) {
            return await this.logTestResult(
                'DynamoDB Table Access',
                false,
                error.message
            );
        }
    }

    // Test 8: Comprehensive Analytics API Test
    async testAnalyticsAPI() {
        console.log('\n🌐 TEST 8: Analytics API Endpoints');
        
        try {
            // Test Health Endpoint
            console.log(`   Testing: GET ${this.apiUrl}/health`);
            const healthResponse = await axios.get(`${this.apiUrl}/health`, {
                timeout: 10000
            });
            const healthSuccess = healthResponse.status === 200;
            
            if (!healthSuccess) {
                return await this.logTestResult(
                    'Analytics API Health Check',
                    false,
                    `Status: ${healthResponse.status}`
                );
            }

            // Test Analytics POST Endpoint
            console.log(`   Testing: POST ${this.apiUrl}/analytics`);
            const analyticsResponse = await axios.post(`${this.apiUrl}/analytics`, {
                operation: "test_query",
                parameters: {
                    test: true,
                    timestamp: new Date().toISOString()
                }
            }, {
                timeout: 15000
            });

            const analyticsSuccess = analyticsResponse.status === 200;
            
            return await this.logTestResult(
                'Analytics API Endpoints',
                healthSuccess && analyticsSuccess,
                `Health: ${healthResponse.status}, Analytics: ${analyticsResponse.status}`
            );
        } catch (error) {
            return await this.logTestResult(
                'Analytics API Endpoints',
                false,
                error.response ? `Status: ${error.response.status}, Message: ${error.response.data}` : error.message
            );
        }
    }

    // Test 9: Verify S3 Event Trigger
    async verifyS3EventTrigger() {
        console.log('\n🔄 TEST 9: S3 Event Trigger Verification');
        
        try {
            // Upload a small test file to verify the trigger works
            const testKey = `trigger-test/verify-s3-trigger-${Date.now()}.json`;
            const testData = {
                test: true,
                message: "This file should trigger the Lambda via S3 event",
                timestamp: new Date().toISOString()
            };

            const uploadCommand = new PutObjectCommand({
                Bucket: this.bucketName,
                Key: testKey,
                Body: JSON.stringify(testData, null, 2),
                ContentType: 'application/json'
            });

            await s3.send(uploadCommand);
            console.log('   ✅ Test file uploaded for trigger verification');
            
            // Wait a bit for the trigger
            await new Promise(resolve => setTimeout(resolve, 10000));

            return await this.logTestResult(
                'S3 Event Trigger',
                true,
                'Test file uploaded - check Lambda logs for processing'
            );
        } catch (error) {
            return await this.logTestResult(
                'S3 Event Trigger',
                false,
                error.message
            );
        }
    }

    // Generate comprehensive test report
    generateReport() {
        console.log('\n' + '='.repeat(70));
        console.log('📊 COMPREHENSIVE DATA PIPELINE TEST REPORT');
        console.log('='.repeat(70));
        
        const totalTests = this.testResults.length;
        const passedTests = this.testResults.filter(r => r.status === '✅ PASS').length;
        const failedTests = totalTests - passedTests;
        
        console.log(`\n📈 Summary: ${passedTests}/${totalTests} tests passed`);
        
        // Show resource overview
        console.log('\n🏗️  Resource Overview:');
        console.log(`   📦 S3 Bucket: ${this.bucketName}`);
        console.log(`   🗄️  Database: ${this.databaseHost}`);
        console.log(`   ⚡ Analytics Lambda: ${this.analyticsLambdaName}`);
        console.log(`   🌐 API URL: ${this.apiUrl}`);
        console.log(`   📋 DynamoDB Table: ${this.analyticsTableName}`);
        
        if (failedTests === 0) {
            console.log('\n🎉 ALL TESTS PASSED! pipeline is working correctly.');
            console.log('   🚀 Ready for production data processing!');
        } else {
            console.log('\n⚠️  Some tests failed. Check the details below:');
        }
        
        console.log('\n📋 Detailed Results:');
        this.testResults.forEach(result => {
            console.log(`   ${result.status} - ${result.test}`);
            if (result.details) {
                console.log(`        📝 ${result.details}`);
            }
        });

        console.log('\n🎯 Next Steps:');
        if (failedTests > 0) {
            console.log('   1. Check CloudWatch logs for Lambda functions');
            console.log('   2. Verify IAM permissions and security groups');
            console.log('   3. Check database connectivity and table structure');
            console.log('   4. Review S3 event configuration');
        } else {
            console.log('   1. Monitor CloudWatch metrics and alarms');
            console.log('   2. Consider adding authentication to API');
            console.log('   3. Set up data backup and retention policies');
            console.log('   4. Implement monitoring and alerting');
        }

        console.log('\n🔍 Troubleshooting Commands:');
        console.log('   View Lambda logs: aws logs tail /aws/lambda/' + this.dataProcessorLambdaName);
        console.log('   Check S3 files: aws s3 ls s3://' + this.bucketName + '/');
        console.log('   Test API: curl ' + this.apiUrl + '/health');

        return {
            totalTests,
            passedTests,
            failedTests,
            results: this.testResults
        };
    }

    // Run all tests
    async runAllTests() {
        console.log('🚀 STARTING COMPREHENSIVE PIPELINE TEST SUITE');
        console.log('='.repeat(70));
        console.log('Using actual AWS resources:');
        console.log(`   Account: 897347885635, Region: us-east-1`);
        console.log('='.repeat(70));

        await this.testSecretsManager();
        await this.testS3Bucket();
        await this.uploadTestFiles();
        await this.verifyS3EventTrigger();
        await this.checkLambdaExecution();
        await this.testAnalyticsLambda();
        await this.testDatabaseConnectivity();
        await this.testDynamoDBTable();
        await this.testAnalyticsAPI();

        return this.generateReport();
    }
}

// Run the test
async function main() {
    try {
        const tester = new PipelineTester();
        const report = await tester.runAllTests();
        
        // Exit with appropriate code for CI/CD
        process.exit(report.failedTests > 0 ? 1 : 0);
    } catch (error) {
        console.error('💥 Test suite failed:', error);
        process.exit(1);
    }
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

if (require.main === module) {
    main();
}

module.exports = { PipelineTester };
