#!/bin/bash

# Test CORS preflight requests for critical endpoints
# This script verifies that OPTIONS requests return proper CORS headers

API_BASE="https://2woj5i92td.execute-api.us-east-1.amazonaws.com/prod"
ORIGIN="https://www.builder-expenses.com"

echo "🧪 Testing CORS Preflight Requests"
echo "=================================="
echo ""

# Array of endpoints to test
declare -a ENDPOINTS=(
  "/get-company"
  "/company"
  "/expenses"
  "/projects"
  "/contractors"
  "/works"
  "/listUsers"
  "/listInvitations"
  "/subscription/status"
)

# Test each endpoint
for endpoint in "${ENDPOINTS[@]}"; do
  echo "Testing: $endpoint"

  response=$(curl -s -i -X OPTIONS "$API_BASE$endpoint" \
    -H "Origin: $ORIGIN" \
    -H "Access-Control-Request-Method: GET" 2>&1)

  # Extract status code
  status=$(echo "$response" | grep -E "^HTTP" | head -1 | awk '{print $2}')

  # Extract CORS headers
  allow_origin=$(echo "$response" | grep -i "access-control-allow-origin:" | head -1 | cut -d: -f2- | xargs)
  allow_methods=$(echo "$response" | grep -i "access-control-allow-methods:" | head -1 | cut -d: -f2- | xargs)

  # Check results
  if [ "$status" = "200" ]; then
    if [[ "$allow_origin" == *"builder-expenses.com"* ]]; then
      echo "  ✓ Status: $status"
      echo "  ✓ Origin: $allow_origin"
      echo "  ✓ Methods: $allow_methods"
    else
      echo "  ✗ Status: $status"
      echo "  ✗ Origin: $allow_origin (should include builder-expenses.com)"
      echo "  ✗ Methods: $allow_methods"
    fi
  else
    echo "  ✗ Status: $status (should be 200)"
    echo "  ✗ Origin: $allow_origin"
  fi

  echo ""
done

echo "=================================="
echo "✅ CORS Testing Complete"
echo ""
echo "Expected behavior:"
echo "  - All endpoints should return 200 OK"
echo "  - Access-Control-Allow-Origin should be: $ORIGIN"
echo "  - Access-Control-Allow-Methods should include the HTTP methods for that endpoint"
