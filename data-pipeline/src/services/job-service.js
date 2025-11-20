const { DynamoDBClient, PutItemCommand, UpdateItemCommand, GetItemCommand } = require('@aws-sdk/client-dynamodb');
const { SFNClient, StartExecutionCommand, DescribeExecutionCommand } = require('@aws-sdk/client-sfn');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');

const dynamoDb = new DynamoDBClient();
const sfn = new SFNClient();

class JobService {
    constructor() {
        this.tableName = process.env.ANALYTICS_TABLE;
        this.stateMachineArn = process.env.STATE_MACHINE_ARN;
    }

    async createJob(operation, parameters) {
        const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const jobItem = {
            PK: `JOB#${jobId}`,
            SK: 'METADATA',
            jobId: jobId,
            operation: operation,
            parameters: parameters,
            status: 'submitted',
            submittedAt: new Date().toISOString(),
            expireAt: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60), // 30 days
        };

        await dynamoDb.send(new PutItemCommand({
            TableName: this.tableName,
            Item: marshall(jobItem),
        }));

        // Start Step Functions execution
        await sfn.send(new StartExecutionCommand({
            stateMachineArn: this.stateMachineArn,
            name: jobId,
            input: JSON.stringify({
                jobId: jobId,
                operation: operation,
                parameters: parameters,
                status: 'running'
            })
        }));

        return jobId;
    }

    async updateJobStatus(jobId, status, additionalData = {}) {
        const updateExpressions = ['SET #status = :status'];
        const expressionAttributes = {
            ':status': { S: status }
        };

        // Add additional data fields
        Object.keys(additionalData).forEach(key => {
            updateExpressions.push(`${key} = :${key}`);
            expressionAttributes[`:${key}`] = additionalData[key];
        });

        await dynamoDb.send(new UpdateItemCommand({
            TableName: this.tableName,
            Key: marshall({
                PK: `JOB#${jobId}`,
                SK: 'METADATA'
            }),
            UpdateExpression: `SET ${updateExpressions.join(', ')}`,
            ExpressionAttributeNames: {
                '#status': 'status'
            },
            ExpressionAttributeValues: marshall(expressionAttributes),
        }));
    }

    async getJob(jobId) {
        const result = await dynamoDb.send(new GetItemCommand({
            TableName: this.tableName,
            Key: marshall({
                PK: `JOB#${jobId}`,
                SK: 'METADATA'
            }),
        }));

        return result.Item ? unmarshall(result.Item) : null;
    }
}

// Lambda handler
exports.handler = async (event) => {
    const jobService = new JobService();
    
    try {
        switch (event.action) {
            case 'create_job':
                const jobId = await jobService.createJob(event.operation, event.parameters);
                return { jobId, status: 'submitted' };
                
            case 'update_status':
                await jobService.updateJobStatus(event.jobId, event.status, event.additionalData);
                return { success: true };
                
            case 'get_job':
                const job = await jobService.getJob(event.jobId);
                return job;
                
            default:
                throw new Error(`Unknown action: ${event.action}`);
        }
    } catch (error) {
        console.error('JobService error:', error);
        throw error;
    }
};