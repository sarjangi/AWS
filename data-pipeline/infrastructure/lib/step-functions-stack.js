const cdk = require('aws-cdk-lib');
const sfn = require('aws-cdk-lib/aws-stepfunctions');
const tasks = require('aws-cdk-lib/aws-stepfunctions-tasks');
const lambda = require('aws-cdk-lib/aws-lambda');
const iam = require('aws-cdk-lib/aws-iam');

class StepFunctionsStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        
        // ONLY include jobNotificationsTopic if it exists in props
        const { analyticsLambda, analyticsTable } = props;
        const jobNotificationsTopic = props.jobNotificationsTopic; // Get separately

        // Validate required props
        if (!analyticsLambda) {
            throw new Error('analyticsLambda is required');
        }
        if (!analyticsTable) {
            throw new Error('analyticsTable is required');
        }

        console.log('StepFunctionsStack - jobNotificationsTopic:', jobNotificationsTopic ? 'AVAILABLE' : 'UNDEFINED');

        // Create a dedicated Lambda for job management
        const jobServiceLambda = new lambda.Function(this, 'JobServiceLambda', {
            runtime: lambda.Runtime.NODEJS_18_X,
            code: lambda.Code.fromAsset('../src'),
            handler: 'services/job-service.handler',
            timeout: cdk.Duration.seconds(30),
            environment: {
                ANALYTICS_TABLE: analyticsTable.tableName,
            },
        });

        // Grant permissions to DynamoDB
        analyticsTable.grantReadWriteData(jobServiceLambda);

        // Task: Update job status to "running"
        const updateJobToRunning = new tasks.LambdaInvoke(this, 'UpdateJobToRunning', {
            lambdaFunction: jobServiceLambda,
            payload: sfn.TaskInput.fromObject({
                'action': 'update_status',
                'jobId.$': '$.jobId',
                'status': 'running'
            }),
            resultPath: '$.runningStatus'
        });

        // Task: Update job status to "completed" for LARGE results
        const updateJobToCompletedLarge = new tasks.LambdaInvoke(this, 'UpdateJobToCompletedLarge', {
            lambdaFunction: jobServiceLambda,
            payload: sfn.TaskInput.fromObject({
                'action': 'update_status',
                'jobId.$': '$.jobId',
                'status': 'completed',
                'additionalData.$': '$.s3Result.Payload' // S3 data for large results
            }),
            resultPath: '$.completedStatusLarge'
        });

        // Task: Update job status to "completed" for SMALL results  
        const updateJobToCompletedSmall = new tasks.LambdaInvoke(this, 'UpdateJobToCompletedSmall', {
            lambdaFunction: jobServiceLambda,
            payload: sfn.TaskInput.fromObject({
                'action': 'update_status',
                'jobId.$': '$.jobId',
                'status': 'completed',
                'additionalData.$': '$.queryResult.Payload' // Query data for small results
            }),
            resultPath: '$.completedStatusSmall'
        });

        // Task: Execute analytics query
        const executeAnalyticsTask = new tasks.LambdaInvoke(this, 'ExecuteAnalytics', {
            lambdaFunction: analyticsLambda,
            payload: sfn.TaskInput.fromObject({
                'operation.$': '$.operation',
                'parameters.$': '$.parameters',
                'isStepFunction': true
            }),
            resultPath: '$.queryResult'
        });

        // Choice: Check if result is large
        const checkResultSize = new sfn.Choice(this, 'CheckResultSize');

        // Task: Save large results to S3
        const saveLargeResultTask = new tasks.LambdaInvoke(this, 'SaveLargeResult', {
            lambdaFunction: analyticsLambda,
            payload: sfn.TaskInput.fromObject({
                'action': 'save_large_result',
                'jobId.$': '$.jobId',
                'data.$': '$.queryResult.Payload.data',
                'operation.$': '$.operation'
            }),
            resultPath: '$.s3Result'
        });

        // COMPLETELY REMOVE NOTIFICATIONS FOR NOW
        // Just use a pass-through state
        const sendNotificationTask = new sfn.Pass(this, 'NoNotification', {
            resultPath: '$.notificationResult'
        });

        // FIXED: Use separate completion tasks for each path
        const definition = updateJobToRunning
            .next(executeAnalyticsTask)
            .next(checkResultSize
                // Large result path: Save to S3 → Update status (LARGE) → Send notification
                .when(sfn.Condition.or(
                    sfn.Condition.numberGreaterThan('$.queryResult.Payload.data.length', 1000),
                    sfn.Condition.numberGreaterThan('$.queryResult.Payload.metadata.resultCount', 1000)
                ), saveLargeResultTask
                    .next(updateJobToCompletedLarge)  // Different task for large results
                    .next(sendNotificationTask)
                )
                // Small result path: Update status (SMALL) → Send notification
                .otherwise(updateJobToCompletedSmall  // Different task for small results
                    .next(sendNotificationTask)
                )
            );

        // Create state machine
        const stateMachine = new sfn.StateMachine(this, 'AnalyticsJobStateMachine', {
            stateMachineName: 'data-pipeline-analytics-job',
            definition: definition,
            timeout: cdk.Duration.hours(2),
            stateMachineType: sfn.StateMachineType.STANDARD,
        });

        // Grant Step Functions permission to invoke Lambdas
        analyticsLambda.grantInvoke(new iam.ServicePrincipal('states.amazonaws.com'));
        jobServiceLambda.grantInvoke(new iam.ServicePrincipal('states.amazonaws.com'));

        // Export for other stacks
        this.stateMachine = stateMachine;
        this.jobServiceLambda = jobServiceLambda;

        new cdk.CfnOutput(this, 'StateMachineArn', {
            value: stateMachine.stateMachineArn,
            description: 'Step Functions State Machine ARN'
        });
    }
}

module.exports = { StepFunctionsStack };