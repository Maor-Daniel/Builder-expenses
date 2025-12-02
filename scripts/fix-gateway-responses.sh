#!/bin/bash

# Fix API Gateway Response CORS Configuration
# Remove wildcard CORS from all gateway responses

API_ID="2woj5i92td"
REGION="us-east-1"

echo "=== Removing CORS from Gateway Responses ==="
echo "API ID: $API_ID"
echo "Region: $REGION"
echo ""

# Array of response types
RESPONSE_TYPES=(
    "INTEGRATION_FAILURE"
    "RESOURCE_NOT_FOUND"
    "REQUEST_TOO_LARGE"
    "THROTTLED"
    "UNSUPPORTED_MEDIA_TYPE"
    "AUTHORIZER_CONFIGURATION_ERROR"
    "DEFAULT_5XX"
    "DEFAULT_4XX"
    "BAD_REQUEST_PARAMETERS"
    "BAD_REQUEST_BODY"
    "WAF_FILTERED"
    "EXPIRED_TOKEN"
    "ACCESS_DENIED"
    "INVALID_API_KEY"
    "UNAUTHORIZED"
    "API_CONFIGURATION_ERROR"
    "QUOTA_EXCEEDED"
    "INTEGRATION_TIMEOUT"
    "MISSING_AUTHENTICATION_TOKEN"
    "INVALID_SIGNATURE"
    "AUTHORIZER_FAILURE"
)

echo "Found ${#RESPONSE_TYPES[@]} gateway response types to fix"
echo ""

# Function to remove CORS from gateway response
fix_gateway_response() {
    local response_type=$1

    echo "Processing: $response_type"

    # Check current configuration
    current=$(aws apigateway get-gateway-response \
        --rest-api-id "$API_ID" \
        --response-type "$response_type" \
        --region "$REGION" \
        --output json 2>/dev/null)

    if [ $? -ne 0 ]; then
        echo "  ℹ No custom gateway response configured (using default)"
        echo ""
        return
    fi

    # Check if Access-Control-Allow-Origin exists
    if echo "$current" | jq -e '.responseParameters["gatewayresponse.header.Access-Control-Allow-Origin"]' > /dev/null 2>&1; then
        echo "  ⚠ Found Access-Control-Allow-Origin - REMOVING"

        # Remove the CORS header
        aws apigateway update-gateway-response \
            --rest-api-id "$API_ID" \
            --response-type "$response_type" \
            --patch-operations op=remove,path=/responseParameters/gatewayresponse.header.Access-Control-Allow-Origin \
            --region "$REGION" \
            --output json > /dev/null 2>&1

        if [ $? -eq 0 ]; then
            echo "  ✓ Successfully removed CORS from gateway response"
        else
            echo "  ✗ Failed to remove CORS from gateway response"
        fi
    else
        echo "  ✓ No CORS header found"
    fi

    echo ""
}

# Fix each gateway response type
for response_type in "${RESPONSE_TYPES[@]}"; do
    fix_gateway_response "$response_type"
done

echo "=== Deploying Changes ==="
deployment_id=$(aws apigateway create-deployment \
    --rest-api-id "$API_ID" \
    --stage-name prod \
    --region "$REGION" \
    --description "Remove CORS from gateway responses - Lambda controls CORS" \
    --query 'id' \
    --output text)

if [ $? -eq 0 ]; then
    echo "✓ Successfully deployed changes (Deployment ID: $deployment_id)"
else
    echo "✗ Failed to deploy changes"
    exit 1
fi

echo ""
echo "=== Verification ==="
echo "Waiting 10 seconds for deployment and CloudFront cache..."
sleep 10
echo ""
echo "Testing 401 Unauthorized response (invalid token)..."
echo ""

curl -s -X GET "https://2woj5i92td.execute-api.us-east-1.amazonaws.com/prod/get-company" \
    -H "Origin: https://www.builder-expenses.com" \
    -H "Authorization: Bearer invalid-token" \
    -I 2>&1 | grep -i "access-control"

echo ""
echo "=== Gateway Response Fix Complete ==="
echo "Now API Gateway will NOT add ANY CORS headers"
echo "Lambda functions are fully in control of CORS"
