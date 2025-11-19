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

