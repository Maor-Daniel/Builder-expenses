#!/bin/bash

# API Gateway CORS Fix Script
API_ID="drn8tyjw93"

# Define endpoints
declare -A ENDPOINTS=(
    ["g1t8xy"]="/expenses"
    ["80vxo2"]="/projects" 
    ["29c648"]="/contractors"
)

echo "🔧 Fixing CORS for all API endpoints..."

for RESOURCE_ID in "${!ENDPOINTS[@]}"; do
    ENDPOINT_NAME="${ENDPOINTS[$RESOURCE_ID]}"
    echo "📡 Processing $ENDPOINT_NAME (Resource ID: $RESOURCE_ID)"
    
    # Add OPTIONS method if it doesn't exist
    echo "  ➤ Adding OPTIONS method..."
    aws apigateway put-method \
        --rest-api-id $API_ID \
        --resource-id $RESOURCE_ID \
        --http-method OPTIONS \
        --authorization-type NONE \
        --no-api-key-required 2>/dev/null || echo "    ⚠️  OPTIONS method may already exist"
    
    # Add OPTIONS method response
    echo "  ➤ Adding OPTIONS method response..."
    aws apigateway put-method-response \
        --rest-api-id $API_ID \
        --resource-id $RESOURCE_ID \
        --http-method OPTIONS \
        --status-code 200 \
        --response-parameters method.response.header.Access-Control-Allow-Origin=false,method.response.header.Access-Control-Allow-Methods=false,method.response.header.Access-Control-Allow-Headers=false 2>/dev/null || echo "    ⚠️  OPTIONS method response may already exist"
    
    # Add OPTIONS integration (mock)
    echo "  ➤ Adding OPTIONS integration..."
    aws apigateway put-integration \
        --rest-api-id $API_ID \
        --resource-id $RESOURCE_ID \
        --http-method OPTIONS \
        --type MOCK \
        --request-templates '{"application/json":"{\"statusCode\": 200}"}' 2>/dev/null || echo "    ⚠️  OPTIONS integration may already exist"
    
    # Add OPTIONS integration response
    echo "  ➤ Adding OPTIONS integration response..."
    aws apigateway put-integration-response \
        --rest-api-id $API_ID \
        --resource-id $RESOURCE_ID \
        --http-method OPTIONS \
        --status-code 200 \
        --response-parameters '{"method.response.header.Access-Control-Allow-Origin":"'\''*'\''","method.response.header.Access-Control-Allow-Methods":"'\''GET,POST,PUT,DELETE,OPTIONS'\''","method.response.header.Access-Control-Allow-Headers":"'\''Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'\''"}'  2>/dev/null || echo "    ⚠️  OPTIONS integration response may already exist"
    
    # Add CORS to existing methods (GET, POST)
    for METHOD in GET POST; do
        echo "  ➤ Adding CORS to $METHOD method..."
        
        # Add method response for CORS
        aws apigateway put-method-response \
            --rest-api-id $API_ID \
            --resource-id $RESOURCE_ID \
            --http-method $METHOD \
            --status-code 200 \
            --response-parameters method.response.header.Access-Control-Allow-Origin=false 2>/dev/null || echo "    ⚠️  $METHOD method response may already exist"
        
        # Add integration response for CORS
        aws apigateway put-integration-response \
            --rest-api-id $API_ID \
            --resource-id $RESOURCE_ID \
            --http-method $METHOD \
            --status-code 200 \
            --response-parameters '{"method.response.header.Access-Control-Allow-Origin":"'\''*'\''"}'  2>/dev/null || echo "    ⚠️  $METHOD integration response may already exist"
    done
    
    echo "  ✅ Completed $ENDPOINT_NAME"
done

echo ""
echo "🚀 Deploying API changes..."
aws apigateway create-deployment \
    --rest-api-id $API_ID \
    --stage-name prod \
    --description "Add CORS support to all endpoints"

echo "✅ CORS configuration completed and deployed!"
echo "🔗 API Base URL: https://$API_ID.execute-api.us-east-1.amazonaws.com/prod"