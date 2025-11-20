# AWS Serverless Data Pipeline

This serverless data pipeline automatically processes structured data from multiple sources into a PostgreSQL schema, then provides advanced analytics through a REST API.  
Data enters through S3 uploads - when JSON files are uploaded, it automatically triggers a Lambda function that validates, transforms, and loads the data into PostgreSQL. This gives us a unified view of all our business entities.  
The Analytics API lets users run complex SQL queries through simple REST calls. It uses DynamoDB for caching frequent queries and can handle advanced operations like multi-dimensional analytics and data integrity checks.  
It's fully serverless so it scales automatically, implements proper security with VPC isolation and Secrets Manager.

## Prerequisites
- AWS CLI configured
- Node.js 18+
- AWS CDK installed (`npm install -g aws-cdk`)

## Built With
- AWS CDK - Infrastructure as Code
- Node.js - Lambda runtime
- PostgreSQL - Primary data store
- DynamoDB - Job tracking & caching
- API Gateway - REST API layer
- Step Functions - Workflow orchestration
- SNS - Notifications

## Architecture

### Data Ingestion Layer
The pipeline begins with automated data ingestion through S3. When JSON files are uploaded to the raw data bucket, S3 events automatically trigger the Data Processor Lambda function. This function:
- Validates incoming data  
- Applies transformation logic to map source-specific formats to a canonical schema  
- Loads the processed entities into PostgreSQL RDS  

The ingestion process supports multiple source systems (CRM, ERP, etc.) and maintains data consistency through upsert operations.

### Data Storage Layer
PostgreSQL RDS serves as the primary data store with a carefully designed canonical schema that unifies business entities from multiple source systems. The schema supports:
- JSONB columns for flexible attribute storage
- Automatic timestamp tracking for auditing
- Version control for entity updates
- Efficient indexing for analytical queries

DynamoDB complements the relational storage by handling:
- Job metadata and status tracking for asynchronous operations
- Query result caching for frequently accessed analytics
- Time-to-live (TTL) automatic cleanup of temporary data

### Analytics Processing Layer
The system provides two execution models for analytics operations:

#### Synchronous Processing
Simple queries and quick results are handled by the Analytics Lambda via API Gateway. This path is optimized for predictable execution times and smaller result sets, providing immediate client responses.

#### Asynchronous Processing via Step Functions
Complex, long-running analytics operations are orchestrated through AWS Step Functions, providing:
- Workflow orchestration with coordinated Lambda functions
- Automatic retries with exponential backoff for transient failures
- State management maintaining execution context
- Error handling with graceful recoveries and logging

The workflow involves:
- Job initialization and status tracking in DynamoDB
- Analytics query execution against PostgreSQL
- Intelligent result handling with automatic S3 storage for large datasets
- Completion status updates and notification delivery

### API Layer
API Gateway provides a unified REST interface that:
- Routes health checks and simple queries directly to Analytics Lambda  
- Routes complex analytics operations to Step Functions workflows  
- Queries job status directly from DynamoDB  
- Serves large result downloads from S3  

It implements proper CORS headers, request validation, and standardized error responses across all endpoints.

### Notification System
Amazon SNS provides event-driven notifications for:
- Job completion alerts
- System error reporting
- Performance monitoring alerts

Email subscriptions ensure stakeholders receive timely updates about analytics job status and health.

### Security & Infrastructure
The architecture follows defense-in-depth security:
- VPC isolation for database resources
- Secrets Manager for credential rotation
- IAM roles with least-privilege permissions
- Security groups controlling network access
- API Gateway with request validation and throttling

All components are deployed via AWS CDK for consistent, repeatable infrastructure as code deployments.

### Monitoring & Observability
CloudWatch provides monitoring for:
- Lambda function metrics and logs
- Step Functions execution history
- RDS performance monitoring
- Custom business metrics

SNS-integrated alarms notify administrators of issues with detailed logging for debugging and audit requirements.

The serverless architecture guarantees automatic scaling, high availability, cost-efficiency, robust data processing, and enterprise-grade security.

## Demo Instructions

1. **Upload data to trigger processing**  
aws s3 cp customer-data.json s3://datapipelinestack-rawdatabucket57f26c03-pmq8a0g6z3sm/crm-data/

2. **Verify processing**  
aws logs tail /aws/lambda/DataPipelineStack-DataProcessorEEF8FB1B-QjkOezu9haAc --since 1h

3. **Test analytics API**

- Health check  
curl https://9z4ap6wa7d.execute-api.us-east-1.amazonaws.com/prod/health

- SQL queries  
curl "https://9z4ap6wa7d.execute-api.us-east-1.amazonaws.com/prod/analytics?operation=database_info"
curl "https://9z4ap6wa7d.execute-api.us-east-1.amazonaws.com/prod/analytics?operation=customer_analysis"


4. **Test Step Functions Jobs (Asynchronous)**  
- Submit analytics job  
curl -X POST https://9z4ap6wa7d.execute-api.us-east-1.amazonaws.com/prod/analytics/jobs
-H "Content-Type: application/json"
-d '{
"operation": "multi_dimensional_analytics",
"parameters": {
"timeframe": "3 months"
}

- Check job status (replace `{jobId}`)  
curl -X GET https://9z4ap6wa7d.execute-api.us-east-1.amazonaws.com/prod/analytics/jobs/{jobId}
curl -X GET https://9z4ap6wa7d.execute-api.us-east-1.amazonaws.com/prod/analytics/jobs/{jobId}


5. **Test Large Result Handling**  
Trigger S3 storage for results larger than 1000 records:  
curl -X POST https://9z4ap6wa7d.execute-api.us-east-1.amazonaws.com/prod/analytics/jobs
-H "Content-Type: application/json"
-d '{
"operation": "customer_analysis",
"parameters": {
"metric": "lifetime_value",
"group_by": "industry"
}
}'


6. **Monitor Step Functions**  
- List recent executions  
aws stepfunctions list-executions --state-machine-arn arn:aws:states:us-east-1:123456789012:stateMachine:data-pipeline-analytics-job


- Get execution details  
aws stepfunctions describe-execution --execution-arn arn:aws:states:us-east-1:123456789012:execution:data-pipeline-analytics-job:job_123456789

7. **Check Notifications**  
(Same commands as above for Step Functions executions)

## Error Handling & Testing

- Test invalid operation  
$body = @{
operation = "invalid_operation"
} | ConvertTo-Json

try {
$response = Invoke-RestMethod -Uri "$apiUrl/analytics" -Method POST -Body $body -ContentType "application/json"
} catch {
Write-Host "Error handling works:" $_.Exception.Message
}

- Test database errors  
$body = @{
operation = "custom_complex_query"
parameters = @{
query = "SELECT * FROM non_existent_table"
}
} | ConvertTo-Json

try {
$response = Invoke-RestMethod -Uri "$apiUrl/analytics" -Method POST -Body $body -ContentType "application/json"
} catch {
Write-Host "Database error handled:" $_.Exception.Message
}

- Test malformed JSON and missing parameters (examples provided above)

## Monitor System Health

- Check Lambda error metrics  
aws cloudwatch get-metric-statistics
--namespace AWS/Lambda
--metric-name Errors
--dimensions Name=FunctionName,Value=data-pipeline-advanced-analytics
--start-time 2024-01-01T00:00:00Z
--end-time 2024-01-01T01:00:00Z
--period 300
--statistics Sum

- Check Step Functions failure metrics  
aws cloudwatch get-metric-statistics
--namespace AWS/States
--metric-name ExecutionsFailed
--dimensions Name=StateMachineArn,Value=arn:aws:states:us-east-1:123456789012:stateMachine:data-pipeline-analytics-job
--start-time 2024-01-01T00:00:00Z
--end-time 2024-01-01T01:00:00Z
--period 300
--statistics Sum

## Additional Notes

### Architecture Overview
- Ingestion: S3 → Lambda (automatic trigger)  
- Storage: PostgreSQL with canonical schema  
- Analytics: REST API with window functions, CTEs, JSONB operations  
- Infrastructure: CDK, Lambda, RDS, API Gateway, DynamoDB  

### SQL Features
- Multi-dimensional analytics with window functions  
- Recursive CTEs for relationship analysis  
- JSONB operations and fuzzy matching  
- Time-series pattern recognition  
- Cross-system data integrity checks  

### API Operations
- `database_info` - Schema inspection  
- `customer_analysis` - Segmentation with HAVING clauses  
- `revenue_analysis` - Window functions and rankings  
- `multi_dimensional_analytics` - Business intelligence  
- `data_integrity_analysis` - Quality scoring  

## Deployment

Deploy analytics layer:  
cdk deploy AnalyticsStack

## Testing API Endpoints (PowerShell Examples)
$apiUrl = "https://9z4ap6wa7d.execute-api.us-east-1.amazonaws.com/prod"

Test health endpoint
Invoke-RestMethod -Uri "$apiUrl/health" -Method GET

Test analytics endpoint
Invoke-RestMethod -Uri "$apiUrl/analytics?operation=simple_demo" -Method GET

Test database info
Invoke-RestMethod -Uri "$apiUrl/analytics?operation=database_info" -Method GET


Test invalid operations and error scenarios as detailed above.
