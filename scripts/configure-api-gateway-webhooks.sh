#!/bin/bash
# Configure API Gateway webhook routes
set -e

API_ID="2woj5i92td"
REGION="us-east-1"
WEBHOOK_RESOURCE_ID="vg2roi"  # /webhook resource ID

# Get Lambda ARNs
PADDLE_LAMBDA_ARN=$(aws lambda get-function --function-name construction-expenses-webhook-paddle --region $REGION --query 'Configuration.FunctionArn' --output text)
CLERK_LAMBDA_ARN=$(aws lambda get-function --function-name construction-expenses-webhook-clerk --region $REGION --query 'Configuration.FunctionArn' --output text)

echo "=== Creating /webhook/paddle resource ==="

# Create /webhook/paddle resource (or get existing)
PADDLE_RESOURCE_ID=$(aws apigateway create-resource \
  --rest-api-id $API_ID \
  --parent-id $WEBHOOK_RESOURCE_ID \
  --path-part paddle \
  --region $REGION \
  --query 'id' \
  --output text 2>/dev/null || \
  aws apigateway get-resources --rest-api-id $API_ID --region $REGION --query 'items[?path==`/webhook/paddle`].id' --output text)

echo "Paddle resource ID: $PADDLE_RESOURCE_ID"

# Create POST method for /webhook/paddle
echo "Creating POST method..."
aws apigateway put-method \
  --rest-api-id $API_ID \
  --resource-id $PADDLE_RESOURCE_ID \
  --http-method POST \
  --authorization-type NONE \
  --region $REGION \
  2>/dev/null || echo "POST method already exists"

# Set up Lambda integration
echo "Setting up Lambda integration..."
aws apigateway put-integration \
  --rest-api-id $API_ID \
  --resource-id $PADDLE_RESOURCE_ID \
  --http-method POST \
  --type AWS_PROXY \
  --integration-http-method POST \
  --uri "arn:aws:apigateway:$REGION:lambda:path/2015-03-31/functions/$PADDLE_LAMBDA_ARN/invocations" \
  --region $REGION \
  2>/dev/null || echo "Integration already exists"

# Add Lambda permission for API Gateway
echo "Adding Lambda permission..."
aws lambda add-permission \
  --function-name construction-expenses-webhook-paddle \
  --statement-id apigateway-webhook-paddle \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:$REGION:702358134603:$API_ID/*/POST/webhook/paddle" \
  --region $REGION \
  2>/dev/null || echo "Permission already exists"

echo ""
echo "=== Creating /webhook/clerk resource ==="

# Create /webhook/clerk resource (or get existing)
CLERK_RESOURCE_ID=$(aws apigateway create-resource \
  --rest-api-id $API_ID \
  --parent-id $WEBHOOK_RESOURCE_ID \
  --path-part clerk \
  --region $REGION \
  --query 'id' \
  --output text 2>/dev/null || \
  aws apigateway get-resources --rest-api-id $API_ID --region $REGION --query 'items[?path==`/webhook/clerk`].id' --output text)

echo "Clerk resource ID: $CLERK_RESOURCE_ID"

# Create POST method for /webhook/clerk
echo "Creating POST method..."
aws apigateway put-method \
  --rest-api-id $API_ID \
  --resource-id $CLERK_RESOURCE_ID \
  --http-method POST \
  --authorization-type NONE \
  --region $REGION \
  2>/dev/null || echo "POST method already exists"

# Set up Lambda integration
echo "Setting up Lambda integration..."
aws apigateway put-integration \
  --rest-api-id $API_ID \
  --resource-id $CLERK_RESOURCE_ID \
  --http-method POST \
  --type AWS_PROXY \
  --integration-http-method POST \
  --uri "arn:aws:apigateway:$REGION:lambda:path/2015-03-31/functions/$CLERK_LAMBDA_ARN/invocations" \
  --region $REGION \
  2>/dev/null || echo "Integration already exists"

# Add Lambda permission for API Gateway
echo "Adding Lambda permission..."
aws lambda add-permission \
  --function-name construction-expenses-webhook-clerk \
  --statement-id apigateway-webhook-clerk \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:$REGION:702358134603:$API_ID/*/POST/webhook/clerk" \
  --region $REGION \
  2>/dev/null || echo "Permission already exists"

echo ""
echo "=== Deploying API ==="
aws apigateway create-deployment \
  --rest-api-id $API_ID \
  --stage-name prod \
  --region $REGION

echo ""
echo "✅ API Gateway configuration complete!"
echo ""
echo "Webhook URLs:"
echo "  Paddle: https://$API_ID.execute-api.$REGION.amazonaws.com/prod/webhook/paddle"
echo "  Clerk:  https://$API_ID.execute-api.$REGION.amazonaws.com/prod/webhook/clerk"
echo ""
