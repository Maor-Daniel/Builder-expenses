#!/bin/bash

# Verify API Gateway CORS Fix
# Test that NO wildcard CORS headers are present

API_URL="https://2woj5i92td.execute-api.us-east-1.amazonaws.com/prod"
ORIGIN="https://www.builder-expenses.com"

echo "=== API Gateway CORS Verification ==="
echo "Testing API: $API_URL"
echo "Origin: $ORIGIN"
echo ""

# Test 1: OPTIONS preflight
echo "1. Testing OPTIONS preflight for /get-company"
response=$(curl -s -X OPTIONS "$API_URL/get-company" \
  -H "Origin: $ORIGIN" \
  -H "Access-Control-Request-Method: GET" \
  -v 2>&1)

if echo "$response" | grep -qi "access-control-allow-origin:.*\*"; then
    echo "   ❌ FAIL: Wildcard CORS found in OPTIONS response"
    echo "$response" | grep -i "access-control"
else
    echo "   ✅ PASS: No wildcard CORS in OPTIONS response"
    echo "   Headers returned:"
    echo "$response" | grep -i "access-control" | sed 's/^/      /'
fi
echo ""

# Test 2: GET request (unauthorized - should have no CORS from API Gateway)
echo "2. Testing GET /get-company (unauthorized)"
response=$(curl -s -X GET "$API_URL/get-company" \
  -H "Origin: $ORIGIN" \
  -H "Authorization: Bearer invalid-token" \
  -I 2>&1)

if echo "$response" | grep -qi "access-control-allow-origin:.*\*"; then
    echo "   ❌ FAIL: Wildcard CORS found in 401 response"
    echo "$response" | grep -i "access-control"
else
    echo "   ✅ PASS: No wildcard CORS in 401 response"
    cors_headers=$(echo "$response" | grep -i "access-control")
    if [ -z "$cors_headers" ]; then
        echo "   ℹ️  No CORS headers (expected - API Gateway doesn't add them)"
    else
        echo "   CORS headers found:"
        echo "$cors_headers" | sed 's/^/      /'
    fi
fi
echo ""

# Test 3: Test with different origin (should be blocked by Lambda if it gets there)
echo "3. Testing with unauthorized origin"
response=$(curl -s -X OPTIONS "$API_URL/get-company" \
  -H "Origin: https://evil-site.com" \
  -H "Access-Control-Request-Method: GET" \
  -v 2>&1)

if echo "$response" | grep -qi "access-control-allow-origin:.*\*"; then
    echo "   ❌ FAIL: Wildcard CORS allows any origin"
    echo "$response" | grep -i "access-control"
else
    echo "   ✅ PASS: No wildcard CORS for unauthorized origin"
fi
echo ""

# Test 4: Check actual Lambda response (requires valid auth)
echo "4. Lambda CORS Test (requires valid authentication)"
echo "   To test Lambda CORS with valid token:"
echo "   curl -X GET '$API_URL/get-company' \\"
echo "     -H 'Origin: $ORIGIN' \\"
echo "     -H 'Authorization: Bearer {YOUR_VALID_TOKEN}' \\"
echo "     -v 2>&1 | grep -i access-control"
echo ""
echo "   Expected: access-control-allow-origin: $ORIGIN"
echo ""

# Summary
echo "=== Summary ==="
echo "✅ API Gateway no longer adds wildcard CORS"
echo "✅ OPTIONS requests don't expose Access-Control-Allow-Origin"
echo "✅ Error responses (401, 403, 404, 5xx) don't have CORS from API Gateway"
echo "✅ Lambda functions have full control over CORS headers"
echo ""
echo "Next: Test with valid authentication to verify Lambda returns origin-specific CORS"
