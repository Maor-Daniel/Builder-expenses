#!/bin/bash

# Test script for /works endpoint
# This will help diagnose the 403 error

API_BASE="https://2woj5i92td.execute-api.us-east-1.amazonaws.com/prod"
TOKEN="$1"

if [ -z "$TOKEN" ]; then
  echo "Usage: ./test-works-endpoint.sh <JWT_TOKEN>"
  echo ""
  echo "Get your token from Clerk by logging into the mobile app"
  exit 1
fi

echo "=== Testing GET /works endpoint ==="
echo ""

echo "1. Testing OPTIONS (preflight)..."
curl -v -X OPTIONS \
  "${API_BASE}/works" \
  -H "Origin: http://localhost:8081" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: Authorization" \
  2>&1 | grep -E "(< HTTP|< Access-Control|< Content-Type)"

echo ""
echo ""

echo "2. Testing GET without Authorization..."
curl -v -X GET \
  "${API_BASE}/works" \
  2>&1 | grep -E "(< HTTP|error|message)" | head -5

echo ""
echo ""

echo "3. Testing GET with Authorization..."
curl -v -X GET \
  "${API_BASE}/works" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  2>&1 | grep -E "(< HTTP|< Content-Type|success|error|message)" | head -10

echo ""
echo ""

echo "4. Full response with Authorization..."
curl -X GET \
  "${API_BASE}/works" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  | jq '.' 2>/dev/null || cat

echo ""
echo "=== Test Complete ==="
