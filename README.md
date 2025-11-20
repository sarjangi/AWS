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

- **AWS CDK** - Infrastructure as Code
- **Node.js** - Lambda runtime
- **PostgreSQL** - Primary data store
- **DynamoDB** - Analytics caching
- **API Gateway** - REST API layer

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
Response:
aws cloudwatch describe-alarms --alarm-name-prefix "Analytics"
{
    "MetricAlarms": [
        {
            "AlarmName": "AnalyticsService-HighErrorRate",
            "AlarmArn": "arn:aws:cloudwatch:us-east-1:897347885635:alarm:AnalyticsService-HighErrorRate",
            "AlarmDescription": "High error rate in Analytics Lambda",
            "AlarmConfigurationUpdatedTimestamp": "2025-11-17T06:01:19.373000+00:00",
            "ActionsEnabled": true,
            "OKActions": [],
            "AlarmActions": [],
            "InsufficientDataActions": [],
            "StateValue": "OK",
            "StateReason": "Threshold Crossed: 1 datapoint [0.0 (20/11/25 02:31:00)] was not greater than the threshold (5.0).",
            "StateReasonData": "{\"version\":\"1.0\",\"queryDate\":\"2025-11-20T02:36:09.521+0000\",\"startDate\":\"2025-11-20T02:31:00.000+0000\",\"statistic\":\"Average\",\"period\":300,\"recentDatapoints\":[0.0],\"threshold\":5.0,\"evaluatedDatapoints\":[{\"timestamp\":\"2025-11-20T02:31:00.000+0000\",\"sampleCount\":1.0,\"value\":0.0}]}",
            "StateUpdatedTimestamp": "2025-11-20T02:36:09.524000+00:00",
            "MetricName": "Errors",
            "Namespace": "AWS/Lambda",
            "Statistic": "Average",
            "Dimensions": [
                {
                    "Name": "FunctionName",
                    "Value": "data-pipeline-advanced-analytics"
                }
            ],
            "Period": 300,
            "EvaluationPeriods": 2,
            "Threshold": 5.0,
            "ComparisonOperator": "GreaterThanThreshold",
            "StateTransitionedTimestamp": "2025-11-20T02:36:09.524000+00:00"
        },
        {
            "AlarmName": "AnalyticsService-Throttles",
            "AlarmArn": "arn:aws:cloudwatch:us-east-1:897347885635:alarm:AnalyticsService-Throttles",
            "AlarmDescription": "High throttle rate in Analytics Lambda",
            "AlarmConfigurationUpdatedTimestamp": "2025-11-17T06:01:19.567000+00:00",
            "ActionsEnabled": true,
            "OKActions": [],
            "AlarmActions": [],
            "InsufficientDataActions": [],
            "StateValue": "OK",
            "StateReason": "Threshold Crossed: 1 datapoint [0.0 (20/11/25 02:31:00)] was not greater than the threshold (10.0).",
            "StateReasonData": "{\"version\":\"1.0\",\"queryDate\":\"2025-11-20T02:36:07.648+0000\",\"startDate\":\"2025-11-20T02:31:00.000+0000\",\"statistic\":\"Sum\",\"period\":300,\"recentDatapoints\":[0.0],\"threshold\":10.0,\"evaluatedDatapoints\":[{\"timestamp\":\"2025-11-20T02:31:00.000+0000\",\"sampleCount\":1.0,\"value\":0.0}]}",
            "StateUpdatedTimestamp": "2025-11-20T02:36:07.650000+00:00",
            "MetricName": "Throttles",
            "Namespace": "AWS/Lambda",
            "Statistic": "Sum",
            "Dimensions": [
                {
                    "Name": "FunctionName",
                    "Value": "data-pipeline-advanced-analytics"
                }
            ],
            "Period": 300,
            "EvaluationPeriods": 1,
            "Threshold": 10.0,
            "ComparisonOperator": "GreaterThanThreshold",
            "StateTransitionedTimestamp": "2025-11-20T02:36:07.650000+00:00"
        }
    ],
    "CompositeAlarms": []
}
