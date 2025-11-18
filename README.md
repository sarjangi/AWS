AWS Serverless Data Pipeline

A serverless data pipeline processing structured data into PostgreSQL with advanced SQL analytics API.

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

Architecture
Ingestion: S3 → Lambda (automatic trigger)

Storage: PostgreSQL with canonical schema

Analytics: REST API with window functions, CTEs, JSONB operations

Infrastructure: CDK, Lambda, RDS, API Gateway, DynamoDB

SQL Features
Multi-dimensional analytics with window functions

Recursive CTEs for relationship analysis

JSONB operations and fuzzy matching

Time-series pattern recognition

Cross-system data integrity checks

API Operations
database_info - Schema inspection

customer_analysis - Segmentation with HAVING clauses

revenue_analysis - Window functions and rankings

multi_dimensional_analytics - Business intelligence

data_integrity_analysis - Quality scoring

