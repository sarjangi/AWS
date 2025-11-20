#!/usr/bin/env node
const cdk = require('aws-cdk-lib');
const { DataPipelineStack } = require('../lib/data-pipeline-stack');

// Try to load stacks, but don't fail if they don't exist
let AnalyticsStack;
try {
  AnalyticsStack = require('../lib/analytics-stack').AnalyticsStack;
} catch (error) {
  console.log('AnalyticsStack not available, deploying without analytics');
}

let MonitoringStack;
try {
  MonitoringStack = require('../lib/monitoring-stack').MonitoringStack;
} catch (error) {
  console.log('MonitoringStack not available, deploying without monitoring');
}

let StepFunctionsStack;
try {
  StepFunctionsStack = require('../lib/step-functions-stack').StepFunctionsStack;
} catch (error) {
  console.log('StepFunctionsStack not available, deploying without step functions');
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
let monitoringStack;
let stepFunctionsStack;

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
  console.log('✅ AnalyticsStack created successfully');
} else {
  console.log('❌ Skipping AnalyticsStack - required properties not available from DataPipelineStack');
}

// Monitoring Stack (if it exists and we have the required Lambdas)
if (MonitoringStack) {
  const monitoringProps = {
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
    },
    // Only include Lambdas that exist
    dataProcessorLambda: dataPipelineStack.dataProcessor,
  };

  // Add analytics Lambda if available
  if (analyticsStack && analyticsStack.analyticsLambda) {
    monitoringProps.analyticsLambda = analyticsStack.analyticsLambda;
    console.log(' Including Analytics Lambda in monitoring');
  } else {
    console.log(' Analytics Lambda not available for monitoring');
  }

  // Only create monitoring stack if we have at least one Lambda to monitor
  if (monitoringProps.dataProcessorLambda || monitoringProps.analyticsLambda) {
    monitoringStack = new MonitoringStack(app, 'MonitoringStack', monitoringProps);

    // Set dependencies
    if (analyticsStack) {
      monitoringStack.addDependency(analyticsStack);
    }
    monitoringStack.addDependency(dataPipelineStack);
    console.log('✅ MonitoringStack created successfully');
    
    // Log the available topics for debugging
    console.log(' MonitoringStack topics:', {
      alarmTopic: monitoringStack.alarmTopic ? 'EXISTS' : 'UNDEFINED',
      jobNotificationsTopic: monitoringStack.jobNotificationsTopic ? 'EXISTS' : 'UNDEFINED'
    });
  } else {
    console.log('❌ Skipping MonitoringStack - no Lambda references available');
  }
} else {
  console.log('❌ MonitoringStack not available');
}

// StepFunctions Stack (if it exists and we have the required resources)
if (StepFunctionsStack && analyticsStack) {
  console.log(' DEBUG - AnalyticsStack properties:');
  console.log('  analyticsLambda:', analyticsStack.analyticsLambda ? 'EXISTS' : 'UNDEFINED');
  console.log('  analyticsTable:', analyticsStack.analyticsTable ? 'EXISTS' : 'UNDEFINED');
  
  // Check if required properties exist
  if (analyticsStack.analyticsLambda && analyticsStack.analyticsTable) {
    const stepFunctionsProps = {
      env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
      },
      analyticsLambda: analyticsStack.analyticsLambda,
      analyticsTable: analyticsStack.analyticsTable,
    };

    // Add job notifications topic if monitoring stack exists and exports it
    if (monitoringStack && monitoringStack.jobNotificationsTopic) {
      stepFunctionsProps.jobNotificationsTopic = monitoringStack.jobNotificationsTopic;
      console.log(' Including job notifications in Step Functions');
    } else {
      console.log('  Job notifications topic not available - notifications will be disabled');
      console.log('   monitoringStack:', !!monitoringStack);
      console.log('   jobNotificationsTopic:', monitoringStack ? !!monitoringStack.jobNotificationsTopic : 'N/A');
    }

    stepFunctionsStack = new StepFunctionsStack(app, 'StepFunctionsStack', stepFunctionsProps);

    // Set dependencies
    stepFunctionsStack.addDependency(analyticsStack);
    if (monitoringStack) {
      stepFunctionsStack.addDependency(monitoringStack);
    }
    console.log('✅ StepFunctionsStack created successfully');
  } else {
    console.log('❌ Skipping StepFunctionsStack - required AnalyticsStack properties missing');
    console.log('   analyticsLambda:', !!analyticsStack.analyticsLambda);
    console.log('   analyticsTable:', !!analyticsStack.analyticsTable);
  }
} else {
  if (!StepFunctionsStack) {
    console.log('❌ StepFunctionsStack not available');
  } else {
    console.log('❌ Skipping StepFunctionsStack - AnalyticsStack not available');
  }
}

// Summary
console.log('\n📦 Deployment Summary:');
console.log('====================');
console.log(`✅ DataPipelineStack: ${dataPipelineStack ? 'CREATED' : 'SKIPPED'}`);
console.log(`✅ AnalyticsStack: ${analyticsStack ? 'CREATED' : 'SKIPPED'}`);
console.log(`✅ MonitoringStack: ${monitoringStack ? 'CREATED' : 'SKIPPED'}`);
console.log(`✅ StepFunctionsStack: ${stepFunctionsStack ? 'CREATED' : 'SKIPPED'}`);

// Check notification capability
if (stepFunctionsStack && monitoringStack && monitoringStack.jobNotificationsTopic) {
  console.log(' Job notifications: ENABLED');
} else {
  console.log(' Job notifications: DISABLED');
}

// Add tags to all stacks
cdk.Tags.of(app).add('Project', 'DataPipeline');
cdk.Tags.of(app).add('Team', 'DataEngineering');
cdk.Tags.of(app).add('Version', '1.0.0');
cdk.Tags.of(app).add('Environment', 'Development');

app.synth();