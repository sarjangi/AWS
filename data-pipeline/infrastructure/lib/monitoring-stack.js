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

        // Create dedicated topic for job notifications
        const jobNotificationsTopic = new sns.Topic(this, 'JobNotificationsTopic', {
            topicName: 'data-pipeline-job-notifications',
            displayName: 'Data Pipeline Job Notifications'
        });

        // Subscribe email to alarm topic
        new sns.Subscription(this, 'AlarmEmailSubscription', {
            topic: alarmTopic,
            protocol: sns.SubscriptionProtocol.EMAIL,
            endpoint: 'sara.arjangi@gmail.com' // ← REPLACE with your email
        });

        // Subscribe email to job notifications topic
        new sns.Subscription(this, 'JobEmailSubscription', {
            topic: jobNotificationsTopic,
            protocol: sns.SubscriptionProtocol.EMAIL,
            endpoint: 'sara.arjangi@gmail.com' // ← REPLACE with your email
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

        // EXPORT TOPICS FOR OTHER STACKS
        this.alarmTopic = alarmTopic;
        this.jobNotificationsTopic = jobNotificationsTopic; // FIXED: variable now exists

        // Output the topic ARNs for reference
        new cdk.CfnOutput(this, 'AlarmTopicArn', {
            value: alarmTopic.topicArn,
            description: 'SNS Topic ARN for pipeline alarms'
        });

        new cdk.CfnOutput(this, 'JobNotificationsTopicArn', {
            value: jobNotificationsTopic.topicArn,
            description: 'SNS Topic ARN for job notifications'
        });

        console.log('MonitoringStack completed - Topics exported:', {
            alarmTopic: alarmTopic.topicArn,
            jobNotificationsTopic: jobNotificationsTopic.topicArn
        });
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

        // Duration alarm (optional - for long-running jobs)
        const durationAlarm = new cloudwatch.Alarm(this, `${serviceName}DurationAlarm`, {
            alarmName: `${serviceName}-LongExecution`,
            alarmDescription: `Long execution time in ${serviceName} Lambda`,
            metric: lambdaFunction.metricDuration({
                period: cdk.Duration.minutes(5),
                statistic: 'Average',
            }),
            threshold: 300000, // 5 minutes in milliseconds
            evaluationPeriods: 2,
            comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        });

        // Add alert actions to all alarms
        [errorAlarm, throttleAlarm, durationAlarm].forEach(alarm => {
            if (alarm) {
                alarm.addAlarmAction(new actions.SnsAction(alarmTopic));
                alarm.addOkAction(new actions.SnsAction(alarmTopic));
            }
        });

        console.log(`Created alarms for ${serviceName}`);
    }
}

module.exports = { MonitoringStack };