// infrastructure/bin/data-pipeline.js
const cdk = require('aws-cdk-lib');
const { DataPipelineStack } = require('../lib/data-pipeline-stack');

const app = new cdk.App();

new DataPipelineStack(app, 'DataPipelineStack', {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION || 'us-east-1'
    },
    description: 'Serverless data pipeline with Node.js and PostgreSQL'
});