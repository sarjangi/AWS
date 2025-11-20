#!/usr/bin/env node
const cdk = require('aws-cdk-lib');
const { DataPipelineStack } = require('../lib/data-pipeline-stack');

// Try to load analytics stack, but don't fail if it doesn't exist
let AnalyticsStack;
try {
  AnalyticsStack = require('../lib/analytics-stack').AnalyticsStack;
} catch (error) {
  console.log('AnalyticsStack not available, deploying only DataPipelineStack');
}

// Try to load monitoring stack
let MonitoringStack;
try {
  MonitoringStack = require('../lib/monitoring-stack').MonitoringStack;
} catch (error) {
  console.log('MonitoringStack not available, deploying without monitoring');
}

const app = new cdk.App();

// Main Data Pipeline Stack
const dataPipelineStack = new DataPipelineStack(app, 'DataPipelineStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
});

let analyticsStack;

// Advanced Analytics Stack (if it exists and DataPipelineStack has the required properties)
if (AnalyticsStack && dataPipelineStack.database && dataPipelineStack.vpc) {
  analyticsStack = new AnalyticsStack(app, 'AnalyticsStack', {
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
    },
    vpc: dataPipelineStack.vpc,
    database: dataPipelineStack.database,
    rawDataBucket: dataPipelineStack.rawDataBucket,
    lambdaSecurityGroup: dataPipelineStack.lambdaSecurityGroup,
  });

  analyticsStack.addDependency(dataPipelineStack);
} else {
  console.log('Skipping AnalyticsStack - required properties not available from DataPipelineStack');
}

// Monitoring Stack (if it exists and we have the required Lambdas)
if (MonitoringStack && dataPipelineStack.dataProcessor) {
  const monitoringProps = {
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
    },
    dataProcessorLambda: dataPipelineStack.dataProcessor,
  };

  // Add analytics Lambda if available
  if (analyticsStack && analyticsStack.analyticsLambda) {
    monitoringProps.analyticsLambda = analyticsStack.analyticsLambda;
  }

  const monitoringStack = new MonitoringStack(app, 'MonitoringStack', monitoringProps);

  // Monitoring depends on both stacks if they exist
  if (analyticsStack) {
    monitoringStack.addDependency(analyticsStack);
  } else {
    monitoringStack.addDependency(dataPipelineStack);
  }
} else {
  console.log('Skipping MonitoringStack - required Lambda references not available');
}

// Add tags to all stacks
cdk.Tags.of(app).add('Project', 'DataPipeline');
cdk.Tags.of(app).add('Team', 'DataEngineering');
cdk.Tags.of(app).add('Version', '1.0.0');

app.synth();