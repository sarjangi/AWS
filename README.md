AWS Serverless Data Pipeline

This serverless data pipeline It automatically processes structured data from multiple sources into a PostgreSQL schema, then provides advanced analytics through a REST API.
Data enters through S3 uploads - when JSON files are uploaded, it automatically triggers a Lambda function that validates, transforms, and loads the data into PostgreSQL. This gives us a unified view of all our business entities.
The Analytics API lets users run complex SQL queries through simple REST calls. It uses DynamoDB for caching frequent queries and can handle advanced operations like multi-dimensional analytics and data integrity checks.
It's fully serverless so it scales automatically, implements proper security with VPC isolation and Secrets Manager.

Prerequisites
- AWS CLI configured
- Node.js 18+
- AWS CDK installed (`npm install -g aws-cdk`)

Built With
AWS CDK - Infrastructure as Code
Node.js - Lambda runtime
PostgreSQL - Primary data store
DynamoDB - Job tracking & caching
API Gateway - REST API layer
Step Functions - Workflow orchestration
SNS - Notifications
Architecture
Data Ingestion Layer
The pipeline begins with automated data ingestion through S3. When JSON files are uploaded to the raw data bucket, S3 events automatically trigger the Data Processor Lambda function. This function validates incoming data, applies transformation logic to map source-specific formats to a canonical schema, and loads the processed entities into PostgreSQL RDS. The ingestion process supports multiple source systems (CRM, ERP, etc.) and maintains data consistency through upsert operations.
Data Storage Layer
PostgreSQL RDS serves as the primary data store with a carefully designed canonical schema that unifies business entities from multiple source systems. The schema supports:
JSONB columns for flexible attribute storage
Automatic timestamp tracking for auditing
Version control for entity updates
Efficient indexing for analytical queries
DynamoDB complements the relational storage by handling:
Job metadata and status tracking for asynchronous operations
Query result caching for frequently accessed analytics
Time-to-live (TTL) automatic cleanup of temporary data
Analytics Processing Layer
The system provides two execution models for analytics operations:
Synchronous Processing
For simple queries and quick results, the Analytics Lambda handles requests directly through API Gateway. This path is optimized for operations with predictable execution times and smaller result sets, providing immediate responses to clients.
Asynchronous Processing via Step Functions
Complex, long-running analytics operations are orchestrated through AWS Step Functions, which provides:
Workflow Orchestration: Coordinates multiple Lambda functions in a defined sequence
Automatic Retries: Handles transient failures with exponential backoff
State Management: Maintains execution context across distributed components
Error Handling: Graceful failure recovery and comprehensive logging
The Step Functions workflow follows this execution pattern:
Job initialization and status tracking in DynamoDB
Analytics query execution against PostgreSQL
Intelligent result handling with automatic S3 storage for large datasets
Completion status updates and notification delivery
API Layer
API Gateway provides a unified REST interface that routes requests to appropriate processing paths:
Health checks and simple queries go directly to Analytics Lambda
Complex analytics operations are routed to Step Functions workflows
Job status inquiries query DynamoDB directly
Large result downloads are served from S3
The API implements proper CORS headers, request validation, and standardized error responses across all endpoints.
Notification System
Amazon SNS provides event-driven notifications for:
Job completion alerts
System error reporting
Performance monitoring alerts
Email subscriptions ensure stakeholders receive timely updates about analytics job status and system health.
Security & Infrastructure
The architecture implements defense-in-depth security:
VPC isolation for database resources
Secrets Manager for credential rotation
IAM roles with least-privilege permissions
Security groups controlling network access
API Gateway with request validation and throttling
All components are deployed via AWS CDK with infrastructure-as-code principles, ensuring consistent, repeatable deployments across environments.
Monitoring & Observability
CloudWatch provides comprehensive monitoring:
Lambda function metrics and logs
Step Functions execution history
RDS performance monitoring
Custom business metrics
SNS-integrated alarms notify administrators of system issues, while detailed logging supports debugging and audit requirements.
This serverless architecture provides automatic scaling, high availability, and cost-efficient operation while maintaining robust data processing capabilities and enterprise-grade security.

Demo Instructions

1.Upload data to trigger processing
aws s3 cp customer-data.json s3://datapipelinestack-rawdatabucket57f26c03-pmq8a0g6z3sm/crm-data/

2.Verify processing:
aws logs tail /aws/lambda/DataPipelineStack-DataProcessorEEF8FB1B-QjkOezu9haAc --since 1h

3.Test analytics API:
Health check
curl https://9z4ap6wa7d.execute-api.us-east-1.amazonaws.com/prod/health

SQL queries
curl "https://9z4ap6wa7d.execute-api.us-east-1.amazonaws.com/prod/analytics?operation=database_info"
curl "https://9z4ap6wa7d.execute-api.us-east-1.amazonaws.com/prod/analytics?operation=customer_analysis"

4. Test Step Functions Jobs (Asynchronous)
# Submit analytics job
bash
curl -X POST https://9z4ap6wa7d.execute-api.us-east-1.amazonaws.com/prod/analytics/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "multi_dimensional_analytics",
    "parameters": {
      "timeframe": "3 months"
    }
  }'

# Check job status (replace {jobId})
curl -X GET https://9z4ap6wa7d.execute-api.us-east-1.amazonaws.com/prod/analytics/jobs/{jobId}

Powershell
$apiUrl = "https://9z4ap6wa7d.execute-api.us-east-1.amazonaws.com/prod"

# Test health endpoint
Invoke-RestMethod -Uri "$apiUrl/health" -Method GET

# Test synchronous analytics
Invoke-RestMethod -Uri "$apiUrl/analytics?operation=simple_demo" -Method GET
Invoke-RestMethod -Uri "$apiUrl/analytics?operation=database_info" -Method GET

# Submit async job
$jobBody = @{
    operation = "multi_dimensional_analytics"
    parameters = @{
        timeframe = "6 months"
    }
} | ConvertTo-Json

$jobResponse = Invoke-RestMethod -Uri "$apiUrl/analytics/jobs" -Method POST -Body $jobBody -ContentType "application/json"
Write-Host "Job submitted:" ($jobResponse | ConvertTo-Json -Depth 3)

# Check job status
$jobId = $jobResponse.jobId
Start-Sleep -Seconds 30  # Wait for processing
$statusResponse = Invoke-RestMethod -Uri "$apiUrl/analytics/jobs/$jobId" -Method GET
Write-Host "Job status:" ($statusResponse | ConvertTo-Json -Depth 3)

5. Test Large Result Handling
# This may trigger S3 storage for results >1000 records
curl -X POST https://9z4ap6wa7d.execute-api.us-east-1.amazonaws.com/prod/analytics/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "customer_analysis", 
    "parameters": {
      "metric": "lifetime_value",
      "group_by": "industry"
    }
  }'

6. Monitor Step Functions
# List recent executions
aws stepfunctions list-executions \
  --state-machine-arn arn:aws:states:us-east-1:123456789012:stateMachine:data-pipeline-analytics-job

# Get execution details
aws stepfunctions describe-execution \
  --execution-arn arn:aws:states:us-east-1:123456789012:execution:data-pipeline-analytics-job:job_123456789

 7. Check Notifications
# List recent executions
aws stepfunctions list-executions \
  --state-machine-arn arn:aws:states:us-east-1:123456789012:stateMachine:data-pipeline-analytics-job

# Get execution details
aws stepfunctions describe-execution \
  --execution-arn arn:aws:states:us-east-1:123456789012:execution:data-pipeline-analytics-job:job_123456789

Error Handling & Testing
# Invalid operation
$body = @{
    operation = "invalid_operation"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$apiUrl/analytics" -Method POST -Body $body -ContentType "application/json"
} catch {
    Write-Host "Error handling works:" $_.Exception.Message
}

# Test database errors
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

Monitor System Health
# Check Lambda metrics
aws cloudwatch get-metric-statistics \
    --namespace AWS/Lambda \
    --metric-name Errors \
    --dimensions Name=FunctionName,Value=data-pipeline-advanced-analytics \
    --start-time 2024-01-01T00:00:00Z \
    --end-time 2024-01-01T01:00:00Z \
    --period 300 \
    --statistics Sum

# Check Step Functions metrics
aws cloudwatch get-metric-statistics \
    --namespace AWS/States \
    --metric-name ExecutionsFailed \
    --dimensions Name=StateMachineArn,Value=arn:aws:states:us-east-1:123456789012:stateMachine:data-pipeline-analytics-job \
    --start-time 2024-01-01T00:00:00Z \
    --end-time 2024-01-01T01:00:00Z \
    --period 300 \
    --statistics Sum

#Architecture
Ingestion: S3 → Lambda (automatic trigger)
Storage: PostgreSQL with canonical schema
Analytics: REST API with window functions, CTEs, JSONB operations
Infrastructure: CDK, Lambda, RDS, API Gateway, DynamoDB

#SQL Features
Multi-dimensional analytics with window functions
Recursive CTEs for relationship analysis
JSONB operations and fuzzy matching
Time-series pattern recognition
Cross-system data integrity checks

#API Operations
database_info - Schema inspection
customer_analysis - Segmentation with HAVING clauses
revenue_analysis - Window functions and rankings
multi_dimensional_analytics - Business intelligence
data_integrity_analysis - Quality scoring
*************************************
# Deploy analytics layer
cdk deploy AnalyticsStack

# Test API endpoints - Use Invoke-RestMethod for PowerShell
$apiUrl = "https://9z4ap6wa7d.execute-api.us-east-1.amazonaws.com/prod"

# Test health endpoint
Invoke-RestMethod -Uri "$apiUrl/health" -Method GET

# Test analytics endpoint
Invoke-RestMethod -Uri "$apiUrl/analytics?operation=simple_demo" -Method GET

# Test database info
Invoke-RestMethod -Uri "$apiUrl/analytics?operation=database_info" -Method GET

$apiUrl = "https://9z4ap6wa7d.execute-api.us-east-1.amazonaws.com/prod"

$apiUrl = "https://9z4ap6wa7d.execute-api.us-east-1.amazonaws.com/prod"

# Trigger an invalid operation to test error handling
$body = @{
    operation = "invalid_operation_that_does_not_exist"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$apiUrl/analytics" -Method POST -Body $body -ContentType "application/json"
    Write-Host "Response:" ($response | ConvertTo-Json -Depth 3)
} catch {
    Write-Host "Error caught:" $_.Exception.Message
    Write-Host "Status Code:" $_.Exception.Response.StatusCode.value__
}
# Test missing required parameters
$body = @{
    operation = "multi_dimensional_analytics"
    # Missing parameters intentionally
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$apiUrl/analytics" -Method POST -Body $body -ContentType "application/json"
    Write-Host "Response:" ($response | ConvertTo-Json -Depth 3)
} catch {
    Write-Host "Error:" $_.Exception.Message
}

# Send malformed JSON
$malformedBody = "{ invalid json here "

try {
    $response = Invoke-RestMethod -Uri "$apiUrl/analytics" -Method POST -Body $malformedBody -ContentType "application/json"
} catch {
    Write-Host "Malformed JSON Error:" $_.Exception.Message
}

# This might trigger if database is down
$body = @{
    operation = "custom_complex_query"
    parameters = @{
        query = "SELECT * FROM non_existent_table"
    }
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$apiUrl/analytics" -Method POST -Body $body -ContentType "application/json"
    Write-Host "Database Error Test:" ($response | ConvertTo-Json -Depth 3)
} catch {
    Write-Host "Database Error:" $_.Exception.Message
}

# Test a query that should trigger large result handling
$body = @{
    operation = "multi_dimensional_analytics"
    parameters = @{
        timeframe = "12 months"
    }
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$apiUrl/analytics" -Method POST -Body $body -ContentType "application/json"
    if ($response.largeResult) {
        Write-Host "✅ Large result handled correctly - S3 URL:" $response.s3Url
        Write-Host "Download URL:" $response.downloadUrl
    } else {
        Write-Host "Regular response - result count:" $response.data.length
    }
} catch {
    Write-Host "Large Query Error:" $_.Exception.Message
}

# Test download with non-existent key
try {
    $response = Invoke-RestMethod -Uri "$apiUrl/download/invalid_key_12345" -Method GET
    Write-Host "Download Response:" ($response | ConvertTo-Json -Depth 3)
} catch {
    Write-Host "Download Error (expected):" $_.Exception.Message
}

# Wait 2 minutes then check CloudWatch metrics
Start-Sleep -Seconds 120

# Check Lambda error metrics
aws cloudwatch get-metric-statistics `
    --namespace AWS/Lambda `
    --metric-name Errors `
    --dimensions Name=FunctionName,Value=data-pipeline-advanced-analytics `
    --start-time (Get-Date).AddMinutes(-10).ToString("yyyy-MM-ddTHH:mm:ssZ") `
    --end-time (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ") `
    --period 300 `
    --statistics Sum

# Check if alarms triggered
aws cloudwatch describe-alarms --alarm-name-prefix "Analytics"


