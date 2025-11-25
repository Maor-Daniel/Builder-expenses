#!/bin/bash
# Deploy onboarding API endpoints

set -e

API_ID="2woj5i92td"
REGION="us-east-1"
ROOT_RESOURCE_ID="sp5ue0etie"
AUTHORIZER_ID="y3vkcr"

echo "========================================="
echo "Deploying Onboarding API Endpoints"
echo "========================================="

# Create /get-company resource
echo ""
echo "Creating /get-company resource..."
GET_COMPANY_RESOURCE_ID=$(aws apigateway create-resource \
  --rest-api-id $API_ID \
  --parent-id $ROOT_RESOURCE_ID \
  --path-part "get-company" \
  --region $REGION \
  --query 'id' \
  --output text 2>/dev/null || \
  aws apigateway get-resources \
    --rest-api-id $API_ID \
    --region $REGION \
    --query 'items[?path==`/get-company`].id' \
    --output text)

echo "Resource ID: $GET_COMPANY_RESOURCE_ID"

# Create GET method for /get-company
echo ""
echo "Creating GET method for /get-company..."
aws apigateway put-method \
  --rest-api-id $API_ID \
  --resource-id $GET_COMPANY_RESOURCE_ID \
  --http-method GET \
  --authorization-type CUSTOM \
  --authorizer-id $AUTHORIZER_ID \
  --region $REGION \
  --query 'httpMethod' \
  --output text 2>/dev/null || echo "Method already exists"

# Create Lambda integration for GET /get-company
echo "Creating Lambda integration for GET /get-company..."
aws apigateway put-integration \
  --rest-api-id $API_ID \
  --resource-id $GET_COMPANY_RESOURCE_ID \
  --http-method GET \
  --type AWS_PROXY \
  --integration-http-method POST \
  --uri "arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/arn:aws:lambda:${REGION}:702358134603:function:construction-expenses-get-company/invocations" \
  --region $REGION \
  --query 'type' \
  --output text

# Add Lambda permission for API Gateway
echo "Adding Lambda permission for GET /get-company..."
aws lambda add-permission \
  --function-name construction-expenses-get-company \
  --statement-id apigateway-get-company-get \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:${REGION}:702358134603:${API_ID}/*/GET/get-company" \
  --region $REGION 2>/dev/null || echo "Permission already exists"

# Create OPTIONS method for CORS
echo "Creating OPTIONS method for /get-company..."
aws apigateway put-method \
  --rest-api-id $API_ID \
  --resource-id $GET_COMPANY_RESOURCE_ID \
  --http-method OPTIONS \
  --authorization-type NONE \
  --region $REGION 2>/dev/null || echo "OPTIONS already exists"

aws apigateway put-integration \
  --rest-api-id $API_ID \
  --resource-id $GET_COMPANY_RESOURCE_ID \
  --http-method OPTIONS \
  --type MOCK \
  --request-templates '{"application/json": "{\"statusCode\": 200}"}' \
  --region $REGION 2>/dev/null || echo "OPTIONS integration exists"

aws apigateway put-method-response \
  --rest-api-id $API_ID \
  --resource-id $GET_COMPANY_RESOURCE_ID \
  --http-method OPTIONS \
  --status-code 200 \
  --response-parameters '{"method.response.header.Access-Control-Allow-Headers": true, "method.response.header.Access-Control-Allow-Methods": true, "method.response.header.Access-Control-Allow-Origin": true}' \
  --region $REGION 2>/dev/null || echo "OPTIONS response exists"

aws apigateway put-integration-response \
  --rest-api-id $API_ID \
  --resource-id $GET_COMPANY_RESOURCE_ID \
  --http-method OPTIONS \
  --status-code 200 \
  --response-parameters '{"method.response.header.Access-Control-Allow-Headers": "'"'"'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"'"'", "method.response.header.Access-Control-Allow-Methods": "'"'"'GET,OPTIONS'"'"'", "method.response.header.Access-Control-Allow-Origin": "'"'"'*'"'"'"}' \
  --region $REGION 2>/dev/null || echo "OPTIONS integration response exists"

echo ""
echo "========================================="

# Create /register-company resource
echo ""
echo "Creating /register-company resource..."
REGISTER_COMPANY_RESOURCE_ID=$(aws apigateway create-resource \
  --rest-api-id $API_ID \
  --parent-id $ROOT_RESOURCE_ID \
  --path-part "register-company" \
  --region $REGION \
  --query 'id' \
  --output text 2>/dev/null || \
  aws apigateway get-resources \
    --rest-api-id $API_ID \
    --region $REGION \
    --query 'items[?path==`/register-company`].id' \
    --output text)

echo "Resource ID: $REGISTER_COMPANY_RESOURCE_ID"

# Create POST method for /register-company
echo ""
echo "Creating POST method for /register-company..."
aws apigateway put-method \
  --rest-api-id $API_ID \
  --resource-id $REGISTER_COMPANY_RESOURCE_ID \
  --http-method POST \
  --authorization-type CUSTOM \
  --authorizer-id $AUTHORIZER_ID \
  --region $REGION \
  --query 'httpMethod' \
  --output text 2>/dev/null || echo "Method already exists"

# Create Lambda integration for POST /register-company
echo "Creating Lambda integration for POST /register-company..."
aws apigateway put-integration \
  --rest-api-id $API_ID \
  --resource-id $REGISTER_COMPANY_RESOURCE_ID \
  --http-method POST \
  --type AWS_PROXY \
  --integration-http-method POST \
  --uri "arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/arn:aws:lambda:${REGION}:702358134603:function:construction-expenses-register-company-clerk/invocations" \
  --region $REGION \
  --query 'type' \
  --output text

# Add Lambda permission for API Gateway
echo "Adding Lambda permission for POST /register-company..."
aws lambda add-permission \
  --function-name construction-expenses-register-company-clerk \
  --statement-id apigateway-register-company-post \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:${REGION}:702358134603:${API_ID}/*/POST/register-company" \
  --region $REGION 2>/dev/null || echo "Permission already exists"

# Create OPTIONS method for CORS
echo "Creating OPTIONS method for /register-company..."
aws apigateway put-method \
  --rest-api-id $API_ID \
  --resource-id $REGISTER_COMPANY_RESOURCE_ID \
  --http-method OPTIONS \
  --authorization-type NONE \
  --region $REGION 2>/dev/null || echo "OPTIONS already exists"

aws apigateway put-integration \
  --rest-api-id $API_ID \
  --resource-id $REGISTER_COMPANY_RESOURCE_ID \
  --http-method OPTIONS \
  --type MOCK \
  --request-templates '{"application/json": "{\"statusCode\": 200}"}' \
  --region $REGION 2>/dev/null || echo "OPTIONS integration exists"

aws apigateway put-method-response \
  --rest-api-id $API_ID \
  --resource-id $REGISTER_COMPANY_RESOURCE_ID \
  --http-method OPTIONS \
  --status-code 200 \
  --response-parameters '{"method.response.header.Access-Control-Allow-Headers": true, "method.response.header.Access-Control-Allow-Methods": true, "method.response.header.Access-Control-Allow-Origin": true}' \
  --region $REGION 2>/dev/null || echo "OPTIONS response exists"

aws apigateway put-integration-response \
  --rest-api-id $API_ID \
  --resource-id $REGISTER_COMPANY_RESOURCE_ID \
  --http-method OPTIONS \
  --status-code 200 \
  --response-parameters '{"method.response.header.Access-Control-Allow-Headers": "'"'"'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'"'"'", "method.response.header.Access-Control-Allow-Methods": "'"'"'POST,OPTIONS'"'"'", "method.response.header.Access-Control-Allow-Origin": "'"'"'*'"'"'"}' \
  --region $REGION 2>/dev/null || echo "OPTIONS integration response exists"

echo ""
echo "========================================="
echo "Deploying API changes to prod stage..."
aws apigateway create-deployment \
  --rest-api-id $API_ID \
  --stage-name prod \
  --region $REGION \
  --query 'id' \
  --output text

echo ""
echo "✅ API Gateway deployment complete!"
echo ""
echo "Endpoints:"
echo "  GET  https://2woj5i92td.execute-api.us-east-1.amazonaws.com/prod/get-company"
echo "  POST https://2woj5i92td.execute-api.us-east-1.amazonaws.com/prod/register-company"
echo ""
