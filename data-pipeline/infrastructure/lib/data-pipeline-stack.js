const cdk = require('aws-cdk-lib');
const lambda = require('aws-cdk-lib/aws-lambda');
const s3 = require('aws-cdk-lib/aws-s3');
const s3n = require('aws-cdk-lib/aws-s3-notifications');
const rds = require('aws-cdk-lib/aws-rds');
const ec2 = require('aws-cdk-lib/aws-ec2');

class DataPipelineStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);

        // VPC for RDS
        const vpc = new ec2.Vpc(this, 'PipelineVPC', {
            maxAzs: 2,
            natGateways: 1,
        });

        // S3 Bucket
        const rawDataBucket = new s3.Bucket(this, 'RawDataBucket', {
            encryption: s3.BucketEncryption.S3_MANAGED,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true
        });

        // PostgreSQL RDS
        const database = new rds.DatabaseInstance(this, 'CanonicalDatabase', {
            engine: rds.DatabaseInstanceEngine.postgres({
                version: rds.PostgresEngineVersion.VER_15
            }),
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
            vpc,
            databaseName: 'canonicaldb',
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            credentials: rds.Credentials.fromGeneratedSecret('postgres'),
        });

        // Create a security group for Lambda functions
        const lambdaSecurityGroup = new ec2.SecurityGroup(this, 'LambdaSecurityGroup', {
            vpc,
            description: 'Security group for Lambda functions',
            allowAllOutbound: true,
        });

        const layer = new lambda.LayerVersion(this, 'DependenciesLayer', {
            code: lambda.Code.fromAsset('../lambda-layer'),
            compatibleRuntimes: [lambda.Runtime.NODEJS_18_X],
            description: 'All dependencies for data pipeline',
        });

        const dataProcessor = new lambda.Function(this, 'DataProcessor', {
            runtime: lambda.Runtime.NODEJS_18_X,
            code: lambda.Code.fromAsset('../src'),
            handler: 'ingestion/data-processor.handler',
            timeout: cdk.Duration.minutes(5),
            memorySize: 512,
            layers: [layer],
            environment: {
                DB_HOST: database.instanceEndpoint.hostname,
                DB_NAME: 'canonicaldb',
                SECRET_ARN: database.secret.secretArn
            },
            vpc,
            vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
            securityGroups: [lambdaSecurityGroup]
        });

        // Grant permissions
        database.connections.allowFrom(dataProcessor, ec2.Port.tcp(5432));
        database.secret.grantRead(dataProcessor);
        rawDataBucket.grantRead(dataProcessor);

        // Connect S3 to Lambda
        rawDataBucket.addEventNotification(
            s3.EventType.OBJECT_CREATED,
            new s3n.LambdaDestination(dataProcessor)
        );

        // EXPORT RESOURCES FOR OTHER STACKS
        this.vpc = vpc;
        this.database = database;
        this.rawDataBucket = rawDataBucket;
        this.lambdaSecurityGroup = lambdaSecurityGroup;

        // Outputs
        new cdk.CfnOutput(this, 'S3BucketName', {
            value: rawDataBucket.bucketName,
        });
        
        new cdk.CfnOutput(this, 'DatabaseSecretArn', {
            value: database.secret.secretArn,
        });

        new cdk.CfnOutput(this, 'VpcId', {
            value: vpc.vpcId,
        });
        this.dataProcessor = dataProcessor;
    }
}

module.exports = { DataPipelineStack };