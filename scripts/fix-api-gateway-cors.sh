#!/bin/bash

# Fix API Gateway CORS Configuration
# This removes wildcard CORS headers from OPTIONS methods so Lambda can control CORS

API_ID="2woj5i92td"
REGION="us-east-1"

echo "=== Fixing API Gateway CORS Configuration ==="
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

# Function to check and fix OPTIONS method
fix_options_method() {
    local resource_id=$1
    local path=$2

    echo "Processing: $path (Resource: $resource_id)"

    # Get current integration response
    current=$(aws apigateway get-integration-response \
        --rest-api-id "$API_ID" \
        --resource-id "$resource_id" \
        --http-method OPTIONS \
        --status-code 200 \
        --region "$REGION" \
        --output json 2>/dev/null)

    if [ $? -ne 0 ]; then
        echo "  ℹ No integration response found"
        echo ""
        return
    fi

    # Check if wildcard CORS exists
    if echo "$current" | jq -r '.responseParameters["method.response.header.Access-Control-Allow-Origin"]' | grep -q "'\\*'"; then
        echo "  ⚠ Found wildcard CORS header - REMOVING"

        # Remove the wildcard CORS header
        aws apigateway update-integration-response \
            --rest-api-id "$API_ID" \
            --resource-id "$resource_id" \
            --http-method OPTIONS \
            --status-code 200 \
            --patch-operations op=remove,path=/responseParameters/method.response.header.Access-Control-Allow-Origin \
            --region "$REGION" \
            --output json > /dev/null 2>&1

        if [ $? -eq 0 ]; then
            echo "  ✓ Successfully removed wildcard CORS"
        else
            echo "  ✗ Failed to remove wildcard CORS"
        fi
    else
        echo "  ✓ No wildcard CORS found (already configured correctly)"
    fi

    echo ""
}

# Fix each endpoint
for i in "${!id_array[@]}"; do
    fix_options_method "${id_array[$i]}" "${path_array[$i]}"
done

echo "=== Deploying Changes ==="
deployment_id=$(aws apigateway create-deployment \
    --rest-api-id "$API_ID" \
    --stage-name prod \
    --region "$REGION" \
    --description "Remove wildcard CORS headers - Lambda will control CORS" \
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
echo "Waiting 5 seconds for deployment to propagate..."
sleep 5
echo ""
echo "Testing /get-company endpoint with Origin header..."
echo ""

response=$(curl -s -X GET "https://2woj5i92td.execute-api.us-east-1.amazonaws.com/prod/get-company" \
    -H "Origin: https://www.builder-expenses.com" \
    -H "Authorization: Bearer test" \
    -v 2>&1)

echo "$response" | grep -i "access-control"

echo ""
echo "=== CORS Fix Complete ==="
echo "Lambda functions now control CORS headers"
echo ""
echo "Expected behavior:"
echo "  - Requests from https://www.builder-expenses.com should get back same origin"
echo "  - NO wildcard (*) should appear"
