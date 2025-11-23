#!/bin/bash

# Deploy Clerk-enabled Lambda functions
# This script deploys the new Clerk authentication Lambda functions

set -e

echo "🚀 Deploying Clerk-enabled Lambda functions..."

# Configuration
REGION="us-east-1"
CLERK_SECRET_KEY="sk_test_8NfI6R8Zp1NO1JTTgHz45C4AE53Lt4l9ZEjWpQosb3"

# Deploy deleteProjectClerk
echo "📦 Deploying deleteProjectClerk..."
aws lambda update-function-code \
    --function-name "construction-expenses-multi-table-delete-project" \
    --zip-file "fileb://dist/deleteProjectClerk.zip" \
    --region "$REGION" \
    --output json > /dev/null

echo "⏳ Waiting for function to be updated..."
aws lambda wait function-updated \
    --function-name "construction-expenses-multi-table-delete-project" \
    --region "$REGION"

echo "🔐 Updating environment variables..."
aws lambda update-function-configuration \
    --function-name "construction-expenses-multi-table-delete-project" \
    --environment "Variables={
        CLERK_SECRET_KEY=$CLERK_SECRET_KEY,
        ALLOW_DEFAULT_USER=true,
        ALLOW_DEFAULT_COMPANY=true,
        TABLE_NAME=construction-expenses-production-table,
        NODE_ENV=production
    }" \
    --region "$REGION" \
    --output json > /dev/null

echo "✅ deleteProjectClerk deployed successfully!"
echo ""

# Deploy deleteContractorClerk
echo "📦 Deploying deleteContractorClerk..."
aws lambda update-function-code \
    --function-name "construction-expenses-multi-table-delete-contractor" \
    --zip-file "fileb://dist/deleteContractorClerk.zip" \
    --region "$REGION" \
    --output json > /dev/null

echo "⏳ Waiting for function to be updated..."
aws lambda wait function-updated \
    --function-name "construction-expenses-multi-table-delete-contractor" \
    --region "$REGION"

echo "🔐 Updating environment variables..."
aws lambda update-function-configuration \
    --function-name "construction-expenses-multi-table-delete-contractor" \
    --environment "Variables={
        CLERK_SECRET_KEY=$CLERK_SECRET_KEY,
        ALLOW_DEFAULT_USER=true,
        ALLOW_DEFAULT_COMPANY=true,
        TABLE_NAME=construction-expenses-production-table,
        NODE_ENV=production
    }" \
    --region "$REGION" \
    --output json > /dev/null

echo "✅ deleteContractorClerk deployed successfully!"
echo ""

# Deploy deleteWorkClerk
echo "📦 Deploying deleteWorkClerk..."
aws lambda update-function-code \
    --function-name "construction-expenses-multi-table-delete-work" \
    --zip-file "fileb://dist/deleteWorkClerk.zip" \
    --region "$REGION" \
    --output json > /dev/null

echo "⏳ Waiting for function to be updated..."
aws lambda wait function-updated \
    --function-name "construction-expenses-multi-table-delete-work" \
    --region "$REGION"

echo "🔐 Updating environment variables..."
aws lambda update-function-configuration \
    --function-name "construction-expenses-multi-table-delete-work" \
    --environment "Variables={
        CLERK_SECRET_KEY=$CLERK_SECRET_KEY,
        ALLOW_DEFAULT_USER=true,
        ALLOW_DEFAULT_COMPANY=true,
        TABLE_NAME=construction-expenses-production-table,
        NODE_ENV=production
    }" \
    --region "$REGION" \
    --output json > /dev/null

echo "✅ deleteWorkClerk deployed successfully!"
echo ""

echo "🎉 All Clerk Lambda functions deployed successfully!"
echo ""
echo "📝 Next steps:"
echo "1. Deploy frontend with: npm run deploy:frontend"
echo "2. Test DELETE operations in the browser"
echo "3. Monitor CloudWatch logs for any issues"
echo ""
echo "🔍 To check function logs:"
echo "aws logs tail /aws/lambda/construction-expenses-multi-table-delete-project --follow"