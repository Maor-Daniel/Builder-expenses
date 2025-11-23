#!/bin/bash
# Deploy updatePaddleSubscription Lambda and configure API Gateway

set -e

REGION="us-east-1"
API_ID="2woj5i92td"
AUTHORIZER_ID="y3vkcr"
LAMBDA_ROLE="arn:aws:iam::702358134603:role/construction-expenses-production-lambda-role"
FUNCTION_NAME="construction-expenses-update-paddle-subscription"

echo "🚀 Deploying Update Paddle Subscription Feature"
echo "==============================================="

# Step 1: Create or update Lambda function
echo ""
echo "📦 Step 1: Deploying Lambda function..."

# Try to create the function (will fail if exists)
aws lambda create-function \
  --function-name $FUNCTION_NAME \
  --runtime nodejs18.x \
  --role $LAMBDA_ROLE \
  --handler updatePaddleSubscription.handler \
  --zip-file fileb://dist/updatePaddleSubscription.zip \
  --region $REGION \
  --timeout 30 \
  --memory-size 256 \
  --description "Updates existing Paddle subscription to new tier (upgrade/downgrade)" \
  --query 'FunctionArn' --output text 2>/dev/null || \
  aws lambda update-function-code \
    --function-name $FUNCTION_NAME \
    --zip-file fileb://dist/updatePaddleSubscription.zip \
    --region $REGION \
    --query 'FunctionArn' --output text

LAMBDA_ARN=$(aws lambda get-function --function-name $FUNCTION_NAME --region $REGION --query 'Configuration.FunctionArn' --output text)
echo "✅ Lambda deployed: $LAMBDA_ARN"

# Step 2: Create API Gateway resource for /update-paddle-subscription
echo ""
echo "🌐 Step 2: Configuring API Gateway..."

# Get root resource ID
ROOT_ID=$(aws apigateway get-resources --rest-api-id $API_ID --region $REGION --query 'items[?path==`/`].id' --output text)

# Create resource (or get existing)
RESOURCE_ID=$(aws apigateway create-resource \
  --rest-api-id $API_ID \
  --parent-id $ROOT_ID \
  --path-part "update-paddle-subscription" \
  --region $REGION \
  --query 'id' --output text 2>/dev/null || \
  aws apigateway get-resources --rest-api-id $API_ID --region $REGION --query 'items[?path==`/update-paddle-subscription`].id' --output text)

echo "✅ Resource created: /update-paddle-subscription (ID: $RESOURCE_ID)"

# Step 3: Create OPTIONS method (for CORS)
echo ""
echo "⚙️  Step 3: Setting up CORS (OPTIONS method)..."

aws apigateway put-method \
  --rest-api-id $API_ID \
  --resource-id $RESOURCE_ID \
  --http-method OPTIONS \
  --authorization-type NONE \
  --region $REGION 2>/dev/null || echo "OPTIONS method already exists"

aws apigateway put-integration \
  --rest-api-id $API_ID \
  --resource-id $RESOURCE_ID \
  --http-method OPTIONS \
  --type MOCK \
  --request-templates '{"application/json": "{\"statusCode\": 200}"}' \
  --region $REGION 2>/dev/null || echo "OPTIONS integration already exists"

aws apigateway put-method-response \
  --rest-api-id $API_ID \
  --resource-id $RESOURCE_ID \
  --http-method OPTIONS \
  --status-code 200 \
  --response-parameters '{"method.response.header.Access-Control-Allow-Headers": true, "method.response.header.Access-Control-Allow-Methods": true, "method.response.header.Access-Control-Allow-Origin": true}' \
  --region $REGION 2>/dev/null || echo "OPTIONS response already exists"

aws apigateway put-integration-response \
  --rest-api-id $API_ID \
  --resource-id $RESOURCE_ID \
  --http-method OPTIONS \
  --status-code 200 \
  --response-parameters '{"method.response.header.Access-Control-Allow-Headers": "'"'"'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"'"'", "method.response.header.Access-Control-Allow-Methods": "'"'"'GET,POST,PUT,DELETE,OPTIONS'"'"'", "method.response.header.Access-Control-Allow-Origin": "'"'"'*'"'"'"}' \
  --region $REGION 2>/dev/null || echo "OPTIONS integration response already exists"

echo "✅ CORS configured"

# Step 4: Create POST method with Clerk authorizer
echo ""
echo "🔐 Step 4: Setting up POST method with Clerk authorizer..."

aws apigateway put-method \
  --rest-api-id $API_ID \
  --resource-id $RESOURCE_ID \
  --http-method POST \
  --authorization-type CUSTOM \
  --authorizer-id $AUTHORIZER_ID \
  --region $REGION 2>/dev/null || echo "POST method already exists"

# Step 5: Configure Lambda integration
echo ""
echo "⚡ Step 5: Configuring Lambda integration..."

aws apigateway put-integration \
  --rest-api-id $API_ID \
  --resource-id $RESOURCE_ID \
  --http-method POST \
  --type AWS_PROXY \
  --integration-http-method POST \
  --uri "arn:aws:apigateway:$REGION:lambda:path/2015-03-31/functions/$LAMBDA_ARN/invocations" \
  --region $REGION || echo "Integration already configured"

# Step 6: Grant API Gateway permission to invoke Lambda
echo ""
echo "🔑 Step 6: Granting API Gateway permissions..."

aws lambda add-permission \
  --function-name $FUNCTION_NAME \
  --statement-id apigateway-invoke-update-paddle-subscription \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:$REGION:702358134603:$API_ID/*/*/update-paddle-subscription" \
  --region $REGION 2>/dev/null || echo "Permission already exists"

echo "✅ Permissions granted"

# Step 7: Deploy API Gateway
echo ""
echo "🚀 Step 7: Deploying API Gateway..."

aws apigateway create-deployment \
  --rest-api-id $API_ID \
  --stage-name prod \
  --region $REGION

echo "✅ API Gateway deployed"

# Step 8: Upload frontend to S3
echo ""
echo "📤 Step 8: Uploading updated frontend to S3..."

BUCKET="construction-expenses-production-frontend-702358134603"
aws s3 cp frontend/app.html s3://$BUCKET/app.html --region $REGION

echo "✅ Frontend uploaded"

# Step 9: Invalidate CloudFront cache
echo ""
echo "🔄 Step 9: Invalidating CloudFront cache..."

DISTRIBUTION_ID="E3EYFZ54GJKVNBQLATHOGJO0C8"
aws cloudfront create-invalidation \
  --distribution-id $DISTRIBUTION_ID \
  --paths "/app.html" \
  --region $REGION

echo "✅ Cache invalidated"

echo ""
echo "======================================"
echo "✅ Deployment Complete!"
echo "======================================"
echo ""
echo "📍 API Endpoint: https://$API_ID.execute-api.$REGION.amazonaws.com/prod/update-paddle-subscription"
echo "🌐 Frontend: https://builder-expenses.com/app.html"
echo ""
echo "You can now test the upgrade/downgrade functionality in the billing tab!"
