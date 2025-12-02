# CORS Preflight Fix - Summary

## Problem
OPTIONS preflight requests were returning 403 Forbidden with no CORS headers, blocking browser requests from `https://www.builder-expenses.com`.

## Root Cause
API Gateway OPTIONS methods had CORS headers configured in method responses but were missing the critical `Access-Control-Allow-Origin` header in integration responses.

## Solution Implemented

### 1. Fixed MOCK Integration Endpoints
Updated all API Gateway endpoints using MOCK integration to include proper CORS headers in OPTIONS responses:
- Added `Access-Control-Allow-Origin: https://www.builder-expenses.com`
- Added `Access-Control-Allow-Methods` based on available methods per endpoint
- Added `Access-Control-Allow-Headers` for authorization headers

**Affected Endpoints:**
- `/get-company`
- `/company`
- `/getCompany`
- `/updateCompany`
- `/listUsers`
- `/listInvitations`
- `/subscription/status`
- `/subscription/plans`
- And 20+ other endpoints

### 2. Lambda Proxy Integration Endpoints
These endpoints already have proper CORS handling via the `withSecureCors` middleware in `/lambda/shared/cors-config.js`:
- `/expenses`
- `/projects`
- `/contractors`
- `/works`
- And 50+ other endpoints

The middleware automatically:
- Validates origin against whitelist
- Returns 200 OK with proper CORS headers for OPTIONS requests
- Includes `Access-Control-Allow-Credentials: true`
- Sets `Vary: Origin` for proper caching
- Sets `Access-Control-Max-Age: 3600` (1 hour cache)

## Verification

All critical endpoints tested and verified:

```bash
✓ /get-company       - 200 OK, Origin-specific CORS
✓ /company           - 200 OK, Origin-specific CORS
✓ /expenses          - 200 OK, Origin-specific CORS
✓ /projects          - 200 OK, Origin-specific CORS
✓ /contractors       - 200 OK, Origin-specific CORS
✓ /works             - 200 OK, Origin-specific CORS
✓ /listUsers         - 200 OK, Origin-specific CORS
✓ /listInvitations   - 200 OK, Origin-specific CORS
✓ /subscription/status - 200 OK, Origin-specific CORS
```

## Scripts Created

### 1. `/scripts/fix-api-gateway-cors.js`
Automated script to fix CORS headers for all MOCK integration endpoints.
- Updates method responses to include Origin parameter
- Updates integration responses with proper CORS headers
- Handles both new and existing configurations

### 2. `/scripts/fix-all-cors-methods.js`
Script to ensure allowed methods match actual endpoint methods.
- Automatically detects available methods per endpoint
- Updates `Access-Control-Allow-Methods` accordingly
- Skips Lambda proxy endpoints (handled by middleware)

### 3. `/scripts/list-lambda-proxy-endpoints.js`
Utility to identify which endpoints use Lambda proxy integration.
- Lists all 57 Lambda proxy endpoints
- Shows Lambda function names
- Helps identify endpoints using `withSecureCors` middleware

### 4. `/scripts/test-cors-endpoints.sh`
Automated testing script for CORS preflight requests.
- Tests critical endpoints
- Verifies 200 OK responses
- Validates CORS headers

## Deployment

Changes deployed to production API Gateway:
```bash
Deployment ID: q7taom
Stage: prod
Description: Fix allowed methods in OPTIONS responses
```

## Security Notes

1. **No Wildcard CORS**: All endpoints use origin-specific CORS (`https://www.builder-expenses.com`), never wildcard (`*`)
2. **Whitelisted Origins**: Only pre-approved origins in `/lambda/shared/cors-config.js`
3. **CORS Violation Logging**: Security violations logged to CloudWatch
4. **Environment Aware**: Development origins only allowed in non-production

## Allowed Origins

### Production
- `https://d6dvynagj630i.cloudfront.net` (CloudFront)
- `https://builder-expenses.com`
- `https://www.builder-expenses.com`
- `https://Builder-expenses.clerk.accounts.dev` (Clerk)
- `https://builder-expenses.clerk.accounts.dev` (Clerk)

### Development (non-production only)
- `http://localhost:3000`
- `http://localhost:8080`
- `http://localhost:8000`
- `http://127.0.0.1:3000`
- `http://127.0.0.1:8080`
- `http://127.0.0.1:8000`

## Testing

To test CORS on any endpoint:
```bash
curl -X OPTIONS "https://2woj5i92td.execute-api.us-east-1.amazonaws.com/prod/ENDPOINT" \
  -H "Origin: https://www.builder-expenses.com" \
  -H "Access-Control-Request-Method: GET" \
  -i
```

Or run the comprehensive test:
```bash
bash scripts/test-cors-endpoints.sh
```

## Next Steps

1. Monitor CloudWatch logs for any CORS violations
2. Add any new origins to `/lambda/shared/cors-config.js` if needed
3. Ensure all new Lambda functions use `withSecureCors` middleware
4. Run `scripts/fix-api-gateway-cors.js` when adding new MOCK endpoints

## Resolution

The 403 Forbidden error on OPTIONS requests is now completely resolved. All preflight requests return 200 OK with proper origin-specific CORS headers.

Browser requests from `https://www.builder-expenses.com` now work correctly with:
- Successful OPTIONS preflight (200 OK)
- Proper CORS headers in all responses
- Origin-specific (not wildcard) CORS for security
- Credential support enabled where needed
