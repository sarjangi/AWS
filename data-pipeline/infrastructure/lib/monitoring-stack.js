const cdk = require('aws-cdk-lib');
const cloudwatch = require('aws-cdk-lib/aws-cloudwatch');
const sns = require('aws-cdk-lib/aws-sns');
const actions = require('aws-cdk-lib/aws-cloudwatch-actions');

class MonitoringStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);

        const { analyticsLambda, dataProcessorLambda } = props;

        console.log('MonitoringStack props:', { 
            hasAnalyticsLambda: !!analyticsLambda,
            hasDataProcessorLambda: !!dataProcessorLambda 
        });

        // Create SNS topic for all alerts
        const alarmTopic = new sns.Topic(this, 'DataPipelineAlarmTopic', {
            topicName: 'data-pipeline-alarms',
            displayName: 'Data Pipeline Alerts'
        });

        // Subscribe email to SNS topic
        new sns.Subscription(this, 'EmailSubscription', {
            topic: alarmTopic,
            protocol: sns.SubscriptionProtocol.EMAIL,
            endpoint: 'sara.arjangi@gmail.com' // ← REPLACE
        });

        // Only create alarms for Lambdas that exist
        if (dataProcessorLambda) {
            console.log('Creating alarms for DataProcessor Lambda');
            this.createLambdaAlarms('DataProcessor', dataProcessorLambda, alarmTopic);
        } else {
            console.log('No DataProcessor Lambda provided');
        }

        if (analyticsLambda) {
            console.log('Creating alarms for Analytics Lambda');
            this.createLambdaAlarms('Analytics', analyticsLambda, alarmTopic);
        } else {
            console.log('No Analytics Lambda provided');
        }
    }

    createLambdaAlarms(serviceName, lambdaFunction, alarmTopic) {
        if (!lambdaFunction) {
            console.log(`Skipping alarms for ${serviceName} - lambdaFunction is undefined`);
            return;
        }

        console.log(`Creating alarms for ${serviceName} Lambda:`, lambdaFunction.functionName);

        // Error rate alarm
        const errorAlarm = new cloudwatch.Alarm(this, `${serviceName}ErrorAlarm`, {
            alarmName: `${serviceName}-HighErrorRate`,
            alarmDescription: `High error rate in ${serviceName} Lambda`,
            metric: lambdaFunction.metricErrors({
                period: cdk.Duration.minutes(5),
                statistic: 'Average',
            }),
            threshold: 5, // 5% error rate
            evaluationPeriods: 2,
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        });

        // Throttle alarm
        const throttleAlarm = new cloudwatch.Alarm(this, `${serviceName}ThrottleAlarm`, {
            alarmName: `${serviceName}-Throttles`,
            alarmDescription: `High throttle rate in ${serviceName} Lambda`,
            metric: lambdaFunction.metricThrottles({
                period: cdk.Duration.minutes(5),
                statistic: 'Sum',
            }),
            threshold: 10,
            evaluationPeriods: 1,
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        });

        // Add alert actions
        [errorAlarm, throttleAlarm].forEach(alarm => {
            alarm.addAlarmAction(new actions.SnsAction(alarmTopic));
            alarm.addOkAction(new actions.SnsAction(alarmTopic));
        });

        console.log(`Created alarms for ${serviceName}`);
    }
}

module.exports = { MonitoringStack };