const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

const s3 = new S3Client({ region: 'us-east-1' });
const secretsClient = new SecretsManagerClient({ region: 'us-east-1' });

// Sample test data
const testData = {
    records: [
        {
            id: 1001,
            company_name: "Tech Corp Global",
            annual_revenue: 2500000,
            employee_count: 120,
            industry_code: "TECH"
        },
        {
            id: 1002,
            business_name: "Retail Masters Inc", 
            revenue: 850000,
            employees: 45,
            industry: "RETL"
        },
        {
            id: 1003,
            name: "Manufacturing Solutions Ltd",
            revenue: 5000000,
            employees: 300,
            industry: "MANF"
        },
        {
            id: 1004,
            company_name: "Startup Innovators",
            annual_revenue: 75000,
            employee_count: 8,
            industry_code: "TECH"
        }
    ],
    sourceSystem: "crm-system",
    timestamp: new Date().toISOString()
};

async function getBucketNameFromSecrets() {
    try {
        // Try to get bucket name from Secrets Manager
        const command = new GetSecretValueCommand({ 
            SecretId: 'DataPipelineStackCanonicalD-glZssXwpZ8yp' 
        });
        const response = await secretsClient.send(command);
        const secret = JSON.parse(response.SecretString);
        
        // The bucket name might be in the secret or we can construct it
        // For now, let's use the known bucket name pattern
        return 'datapipelinestack-rawdatabucket57f26c03-rx0jutfwlpxv';
    } catch (error) {
        console.log('❌ Could not get secret, using default bucket name');
        return 'datapipelinestack-rawdatabucket57f26c03-rx0jutfwlpxv';
    }
}

async function testDatabaseConnection() {
    try {
        console.log('🔐 Testing Secrets Manager connection...');
        const command = new GetSecretValueCommand({ 
            SecretId: 'DataPipelineStackCanonicalD-glZssXwpZ8yp' 
        });
        const response = await secretsClient.send(command);
        const secret = JSON.parse(response.SecretString);
        
        console.log('✅ Successfully retrieved database credentials from Secrets Manager');
        console.log('📋 Secret contains:', Object.keys(secret));
        console.log('🌐 Database host:', secret.host);
        console.log('🗃️ Database name:', secret.dbname);
        
        return true;
    } catch (error) {
        console.error('❌ Failed to get secret:', error.message);
        return false;
    }
}

async function uploadTestFile() {
    try {
        const bucketName = await getBucketNameFromSecrets();
        
        // Test Secrets Manager first
        const secretTest = await testDatabaseConnection();
        if (!secretTest) {
            console.log('🚨 Cannot proceed without database credentials');
            return;
        }
        
        const key = `crm-data/test-upload-${Date.now()}.json`;
        
        const command = new PutObjectCommand({
            Bucket: bucketName,
            Key: key,
            Body: JSON.stringify(testData, null, 2),
            ContentType: 'application/json'
        });
        
        await s3.send(command);
        console.log('\n✅ Test file uploaded successfully!');
        console.log(`📁 Bucket: ${bucketName}`);
        console.log(`📄 File: ${key}`);
        console.log('\n🔔 Lambda should automatically trigger and:');
        console.log('   1. Read this file from S3');
        console.log('   2. Get DB credentials from Secrets Manager');
        console.log('   3. Connect to RDS PostgreSQL');
        console.log('   4. Insert the data into "entities" table');
        console.log('\n📊 Check CloudWatch logs for Lambda execution...');
        
    } catch (error) {
        console.error('❌ Upload failed:', error.message);
    }
}

// Run the test
uploadTestFile();