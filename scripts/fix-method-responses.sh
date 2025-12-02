#!/bin/bash

# Fix API Gateway Method Response CORS Configuration
# Remove Access-Control-Allow-Origin from method responses so Lambda can control it

API_ID="2woj5i92td"
REGION="us-east-1"

echo "=== Removing CORS from Method Responses ==="
echo "API ID: $API_ID"
echo "Region: $REGION"
echo ""

# Get all resources with OPTIONS methods
echo "Fetching all API resources..."
resources=$(aws apigateway get-resources \
    --rest-api-id "$API_ID" \
    --region "$REGION" \
    --output json)

# Extract resource IDs that have OPTIONS methods
resource_ids=$(echo "$resources" | jq -r '.items[] | select(.resourceMethods.OPTIONS != null) | .id')
resource_paths=$(echo "$resources" | jq -r '.items[] | select(.resourceMethods.OPTIONS != null) | .path')

# Convert to arrays
IFS=$'\n' read -rd '' -a id_array <<<"$resource_ids"
IFS=$'\n' read -rd '' -a path_array <<<"$resource_paths"

echo "Found ${#id_array[@]} endpoints with OPTIONS methods"
echo ""

# Function to remove CORS from method response
fix_method_response() {
    local resource_id=$1
    local path=$2

    echo "Processing: $path (Resource: $resource_id)"

    # Check if method response exists with CORS header
    method_response=$(aws apigateway get-method-response \
        --rest-api-id "$API_ID" \
        --resource-id "$resource_id" \
        --http-method OPTIONS \
        --status-code 200 \
        --region "$REGION" \
        --output json 2>/dev/null)

    if [ $? -ne 0 ]; then
        echo "  ℹ No method response found"
        echo ""
        return
    fi

    # Check if Access-Control-Allow-Origin is in responseParameters
    if echo "$method_response" | jq -e '.responseParameters["method.response.header.Access-Control-Allow-Origin"]' > /dev/null 2>&1; then
        echo "  ⚠ Found Access-Control-Allow-Origin in method response - REMOVING"

        # Remove the CORS header from method response
        aws apigateway update-method-response \
            --rest-api-id "$API_ID" \
            --resource-id "$resource_id" \
            --http-method OPTIONS \
            --status-code 200 \
            --patch-operations op=remove,path=/responseParameters/method.response.header.Access-Control-Allow-Origin \
            --region "$REGION" \
            --output json > /dev/null 2>&1

        if [ $? -eq 0 ]; then
            echo "  ✓ Successfully removed CORS from method response"
        else
            echo "  ✗ Failed to remove CORS from method response"
        fi
    else
        echo "  ✓ No CORS header in method response"
    fi

    echo ""
}

# Fix each endpoint
for i in "${!id_array[@]}"; do
    fix_method_response "${id_array[$i]}" "${path_array[$i]}"
done

echo "=== Deploying Changes ==="
deployment_id=$(aws apigateway create-deployment \
    --rest-api-id "$API_ID" \
    --stage-name prod \
    --region "$REGION" \
    --description "Remove CORS from method responses - Lambda controls CORS" \
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
echo "Waiting 10 seconds for deployment and CloudFront cache to clear..."
sleep 10
echo ""
echo "Testing /get-company OPTIONS preflight..."
echo ""

curl -s -X OPTIONS "https://2woj5i92td.execute-api.us-east-1.amazonaws.com/prod/get-company" \
    -H "Origin: https://www.builder-expenses.com" \
    -H "Access-Control-Request-Method: GET" \
    -v 2>&1 | grep -i "access-control"

echo ""
echo "=== Method Response Fix Complete ==="
echo "Now testing actual GET request..."
echo ""

curl -s -X GET "https://2woj5i92td.execute-api.us-east-1.amazonaws.com/prod/get-company" \
    -H "Origin: https://www.builder-expenses.com" \
    -v 2>&1 | grep -i "access-control"

echo ""
echo "Expected: Lambda should add origin-specific CORS headers"
