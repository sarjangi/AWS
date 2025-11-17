const { S3Client, PutObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { SecretsManagerClient, GetSecretValueCommand, ListSecretsCommand } = require('@aws-sdk/client-secrets-manager');
const { LambdaClient, ListFunctionsCommand } = require('@aws-sdk/client-lambda');
const axios = require('axios');

const s3 = new S3Client({ region: 'us-east-1' });
const secrets = new SecretsManagerClient({ region: 'us-east-1' });
const lambda = new LambdaClient({ region: 'us-east-1' });

class PipelineTester {
    constructor() {
        this.results = [];
        this.bucketName = 'datapipelinestack-rawdatabucket57f26c03-pmq8a0g6z3sm';
        this.apiUrl = 'https://9z4ap6wa7d.execute-api.us-east-1.amazonaws.com/prod';
        this.databaseSecretId = null; // We'll discover this
    }

    async log(test, success, details = '') {
        const status = success ? '✅ PASS' : '❌ FAIL';
        this.results.push({ test, status, details });
        console.log(`${status} - ${test}${details ? `: ${details}` : ''}`);
    }

    async discoverSecretId() {
        try {
            console.log('\n🔍 Discovering Database Secret...');
            const command = new ListSecretsCommand({});
            const response = await secrets.send(command);
            
            // Find the RDS secret (should contain "CanonicalDatabase")
            const secret = response.SecretList.find(s => 
                s.Name.includes('CanonicalDatabase') || 
                s.Name.includes('DataPipelineStack')
            );
            
            if (secret) {
                this.databaseSecretId = secret.Name;
                console.log(`   Found secret: ${this.databaseSecretId}`);
                return true;
            }
            return false;
        } catch (error) {
            console.log('   Could not auto-discover secret');
            return false;
        }
    }

    async testS3() {
        try {
            console.log('\n📦 Testing S3...');
            await s3.send(new ListObjectsV2Command({ Bucket: this.bucketName, MaxKeys: 1 }));
            await this.log('S3 Access', true, `Bucket: ${this.bucketName}`);
            
            // Upload test data
            const testData = {
                records: [{
                    id: Date.now(),
                    company_name: "Pipeline Test Corp",
                    annual_revenue: 1500000,
                    employee_count: 75,
                    industry_code: "TEST",
                    created_at: new Date().toISOString()
                }],
                sourceSystem: "pipeline-test",
                timestamp: new Date().toISOString()
            };

            await s3.send(new PutObjectCommand({
                Bucket: this.bucketName,
                Key: `test-data/pipeline-test-${Date.now()}.json`,
                Body: JSON.stringify(testData, null, 2),
                ContentType: 'application/json'
            }));
            
            await this.log('S3 Upload', true, 'Test data uploaded - Lambda should trigger');
            
        } catch (error) {
            await this.log('S3 Access', false, error.message);
        }
    }

    async testSecrets() {
        try {
            console.log('\n🔐 Testing Secrets Manager...');
            
            // Try to discover secret ID if not already set
            if (!this.databaseSecretId) {
                const discovered = await this.discoverSecretId();
                if (!discovered) {
                    // Try the known secret IDs
                    const knownSecrets = [
                        'DataPipelineStackCanonicalD-glZssXwpZ8yp',
                        'DataPipelineStackCanonicalD-SjAK1kDzdo55-TUxYvS'
                    ];
                    
                    for (const secretId of knownSecrets) {
                        try {
                            const testCommand = new GetSecretValueCommand({ SecretId: secretId });
                            await secrets.send(testCommand);
                            this.databaseSecretId = secretId;
                            console.log(`   Using secret: ${this.databaseSecretId}`);
                            break;
                        } catch (e) {
                            // Continue to next
                        }
                    }
                }
            }

            if (!this.databaseSecretId) {
                await this.log('Database Secrets', false, 'Could not find database secret');
                return;
            }

            const response = await secrets.send(new GetSecretValueCommand({ 
                SecretId: this.databaseSecretId
            }));
            const secret = JSON.parse(response.SecretString);
            await this.log('Database Secrets', true, `${secret.dbname} @ ${secret.host}`);
            
        } catch (error) {
            await this.log('Database Secrets', false, error.message);
        }
    }

    async testLambda() {
        try {
            console.log('\n⚡ Testing Lambda Functions...');
            const response = await lambda.send(new ListFunctionsCommand({}));
            
            const dataProcessor = response.Functions.find(f => 
                f.FunctionName.includes('DataPipelineStack-DataProcessor'));
            const analytics = response.Functions.find(f => 
                f.FunctionName.includes('data-pipeline-advanced-analytics'));
            
            await this.log('Data Processor Lambda', !!dataProcessor, 
                dataProcessor?.FunctionName || 'Not found');
            await this.log('Analytics Lambda', !!analytics, 
                analytics?.FunctionName || 'Not found');
                
        } catch (error) {
            await this.log('Lambda Access', false, error.message);
        }
    }

    async testAPI() {
        try {
            console.log('\n🌐 Testing API Gateway...');
            const response = await axios.get(`${this.apiUrl}/health`, { timeout: 10000 });
            await this.log('API Health', response.status === 200, `Status: ${response.status}`);
        } catch (error) {
            await this.log('API Health', false, 
                error.response ? `Status: ${error.response.status}` : error.message);
        }
    }

    async run() {
        console.log('🚀 Testing Data Pipeline Infrastructure...\n');
        
        await this.testS3();
        await this.testSecrets();
        await this.testLambda();
        await this.testAPI();

        // Summary
        const passed = this.results.filter(r => r.status === '✅ PASS').length;
        console.log(`\n📊 ${passed}/${this.results.length} tests passed`);
        
        if (passed === this.results.length) {
            console.log('\n🎉 Pipeline is fully operational!');
            console.log(`📁 Upload data: s3://${this.bucketName}/`);
            console.log(`🌐 API: ${this.apiUrl}`);
            console.log(`🔐 Database Secret: ${this.databaseSecretId}`);
        } else {
            console.log('\n🔍 To find database secret, run:');
            console.log('   aws secretsmanager list-secrets --query "SecretList[?contains(Name, \\`DataPipelineStack\\`)].[Name]" --output table');
        }
    }
}

// Run tests
new PipelineTester().run().catch(console.error);
