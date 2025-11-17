#!/bin/bash
set -e

echo "🚀 Deploying Advanced Analytics Service..."

# Navigate to infrastructure directory
cd infrastructure

# Synthesize CloudFormation template
echo "📋 Synthesizing CloudFormation template..."
npm run synth

# Deploy Analytics Stack
echo "🔄 Deploying Analytics Stack..."
npm run deploy:analytics

echo "✅ Analytics Stack deployed successfully!"
echo "📊 Analytics API URL: Check CloudFormation outputs in AWS Console"
echo "🔍 Lambda Function: data-pipeline-advanced-analytics"
echo "💾 DynamoDB Table: data-pipeline-analytics-metadata"