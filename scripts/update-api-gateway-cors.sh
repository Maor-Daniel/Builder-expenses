#!/bin/bash
###############################################################################
# Update API Gateway CORS Configuration
#
# This script updates API Gateway OPTIONS method integration responses to
# remove wildcard CORS and align with Lambda-level CORS security.
#
# IMPORTANT: Lambda functions now handle CORS through withSecureCors middleware,
# so API Gateway CORS is less critical. However, this script ensures consistency.
#
# Usage:
#   ./scripts/update-api-gateway-cors.sh [--dry-run]
#
###############################################################################

set -e

DRY_RUN=false
if [[ "$1" == "--dry-run" ]]; then
  DRY_RUN=true
  echo "🧪 DRY RUN MODE - No changes will be made"
fi

API_ID="2woj5i92td"
REGION="us-east-1"

# Production origin (first in whitelist)
PRODUCTION_ORIGIN="https://d6dvynagj630i.cloudfront.net"

echo "🔒 API Gateway CORS Security Update"
echo "API ID: $API_ID"
echo "Region: $REGION"
echo ""

# Get all resources
echo "📋 Fetching API Gateway resources..."
RESOURCES=$(aws apigateway get-resources --rest-api-id "$API_ID" --region "$REGION" --output json)

# Extract resource IDs and paths
RESOURCE_IDS=$(echo "$RESOURCES" | jq -r '.items[] | .id')

echo "Found $(echo "$RESOURCE_IDS" | wc -l) resources"
echo ""

UPDATED=0
SKIPPED=0
ERRORS=0

for RESOURCE_ID in $RESOURCE_IDS; do
  RESOURCE_PATH=$(echo "$RESOURCES" | jq -r ".items[] | select(.id==\"$RESOURCE_ID\") | .path")

  # Check if OPTIONS method exists
  OPTIONS_METHOD=$(aws apigateway get-method \
    --rest-api-id "$API_ID" \
    --resource-id "$RESOURCE_ID" \
    --http-method OPTIONS \
    --region "$REGION" 2>&1 || echo "NOT_FOUND")

  if [[ "$OPTIONS_METHOD" == *"NOT_FOUND"* ]] || [[ "$OPTIONS_METHOD" == *"NotFoundException"* ]]; then
    echo "⏭️  $RESOURCE_PATH - No OPTIONS method"
    ((SKIPPED++))
    continue
  fi

  # Check if it has wildcard CORS
  CURRENT_ORIGIN=$(echo "$OPTIONS_METHOD" | jq -r '.methodIntegration.integrationResponses."200".responseParameters."method.response.header.Access-Control-Allow-Origin" // "NOT_SET"')

  if [[ "$CURRENT_ORIGIN" == "'*'" ]]; then
    echo "🔧 $RESOURCE_PATH - Updating wildcard CORS..."

    if [[ "$DRY_RUN" == false ]]; then
      # Update integration response to remove wildcard
      # NOTE: We're setting it to the first production origin, but Lambda will override this
      aws apigateway put-integration-response \
        --rest-api-id "$API_ID" \
        --resource-id "$RESOURCE_ID" \
        --http-method OPTIONS \
        --status-code 200 \
        --region "$REGION" \
        --response-parameters "{
          \"method.response.header.Access-Control-Allow-Origin\": \"'$PRODUCTION_ORIGIN'\",
          \"method.response.header.Access-Control-Allow-Headers\": \"'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Requested-With'\",
          \"method.response.header.Access-Control-Allow-Methods\": \"'GET,POST,PUT,DELETE,OPTIONS,PATCH'\",
          \"method.response.header.Access-Control-Allow-Credentials\": \"'true'\",
          \"method.response.header.Vary\": \"'Origin'\"
        }" > /dev/null 2>&1

      if [ $? -eq 0 ]; then
        echo "   ✅ Updated successfully"
        ((UPDATED++))
      else
        echo "   ❌ Update failed"
        ((ERRORS++))
      fi
    else
      echo "   📝 Would update (dry-run)"
      ((UPDATED++))
    fi
  elif [[ "$CURRENT_ORIGIN" == "NOT_SET" ]]; then
    echo "⏭️  $RESOURCE_PATH - No CORS configured"
    ((SKIPPED++))
  else
    echo "✅ $RESOURCE_PATH - Already configured: $CURRENT_ORIGIN"
    ((SKIPPED++))
  fi
done

echo ""
echo "═══════════════════════════════════════════════"
echo "📊 Summary"
echo "═══════════════════════════════════════════════"
echo "✅ Already configured: $SKIPPED"
echo "🔧 Updated: $UPDATED"
echo "❌ Errors: $ERRORS"
echo ""

if [[ "$ERRORS" -gt 0 ]]; then
  echo "❌ Some updates failed. Check AWS permissions and try again."
  exit 1
fi

if [[ "$DRY_RUN" == true ]]; then
  echo "💡 Run without --dry-run to apply changes"
  echo ""
  echo "⚠️  NOTE: API Gateway CORS is now secondary to Lambda-level CORS"
  echo "   Lambda functions use withSecureCors middleware which provides"
  echo "   dynamic origin validation. API Gateway CORS is being updated"
  echo "   for consistency, but Lambda CORS takes precedence."
  exit 0
fi

# Create deployment
echo "🚀 Creating new API deployment..."
DEPLOYMENT=$(aws apigateway create-deployment \
  --rest-api-id "$API_ID" \
  --region "$REGION" \
  --stage-name prod \
  --description "CORS security update - removed wildcard CORS" \
  --output json)

DEPLOYMENT_ID=$(echo "$DEPLOYMENT" | jq -r '.id')

echo "   Deployment ID: $DEPLOYMENT_ID"
echo ""

echo "✅ API Gateway CORS security update complete!"
echo ""
echo "⚠️  IMPORTANT NOTES:"
echo "1. Lambda functions handle CORS through withSecureCors middleware"
echo "2. Lambda CORS headers override API Gateway settings"
echo "3. Test the API to ensure CORS works correctly:"
echo "   node test-cors-security.js --api-url=https://$API_ID.execute-api.$REGION.amazonaws.com/prod"
echo ""
