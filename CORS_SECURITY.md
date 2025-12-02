# CORS Security Documentation

## Overview

This document describes the CORS (Cross-Origin Resource Sharing) security implementation for the Construction Expenses application. The implementation prevents CSRF (Cross-Site Request Forgery) attacks and unauthorized API access by restricting which origins can make requests to the API.

## Security Issue (RESOLVED)

**Previous Configuration:**
- ❌ CORS set to `Access-Control-Allow-Origin: *` everywhere
- ❌ Allowed ANY website to call the APIs
- ❌ Created CSRF vulnerability
- ❌ Malicious sites could make authenticated API calls

**Current Configuration:**
- ✅ CORS restricted to whitelisted origins only
- ✅ Origin validation enforced on all Lambda functions
- ✅ CSRF protection through origin whitelisting
- ✅ Security monitoring for CORS violations

## Allowed Origins

### Production Origins (Always Allowed)

```javascript
const PRODUCTION_ORIGINS = [
  'https://d6dvynagj630i.cloudfront.net',  // CloudFront distribution
  'https://builder-expenses.com',           // Custom domain
  'https://www.builder-expenses.com',       // Custom domain with www
  'https://Builder-expenses.clerk.accounts.dev', // Clerk authentication
  'https://builder-expenses.clerk.accounts.dev'
];
```

### Development Origins (Non-Production Only)

```javascript
const DEVELOPMENT_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:8080',
  'http://localhost:8000',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:8080',
  'http://127.0.0.1:8000'
];
```

**IMPORTANT:** Development origins are automatically disabled when `NODE_ENV=production` or when running in AWS region `us-east-1`.

## Architecture

### Core Module: `lambda/shared/cors-config.js`

The CORS configuration is centralized in a single module that provides:

1. **Origin Whitelisting** - Maintains list of allowed origins
2. **Environment Detection** - Automatically adjusts based on production/development
3. **Response Builders** - Secure CORS-enabled response creators
4. **Middleware** - `withSecureCors` wrapper for Lambda handlers
5. **Violation Logging** - CloudWatch-compatible security event logging

### Key Functions

#### `getAllowedOrigins()`
Returns array of allowed origins based on environment.

#### `isOriginAllowed(origin)`
Validates if an origin is in the whitelist.

```javascript
if (!isOriginAllowed(origin)) {
  // Origin is blocked
  return 403;
}
```

#### `createCorsResponse(statusCode, body, origin, additionalHeaders)`
Creates a Lambda response with secure CORS headers.

```javascript
return createCorsResponse(200, { data }, origin);
```

#### `createOptionsResponse(origin)`
Handles OPTIONS preflight requests with origin validation.

```javascript
if (event.httpMethod === 'OPTIONS') {
  return createOptionsResponse(origin);
}
```

#### `withSecureCors(handler, options)`
Middleware wrapper that automatically:
- Handles OPTIONS preflight
- Validates origin
- Logs CORS violations
- Adds CORS headers to responses

```javascript
exports.handler = withSecureCors(async (event, context) => {
  // Your handler logic
});
```

## Implementation Pattern

### Lambda Function Pattern

All Lambda functions follow this pattern:

```javascript
// lambda/myFunction.js
const {
  createResponse,
  createErrorResponse,
  getCompanyUserFromEvent
} = require('./shared/company-utils');

const { withSecureCors } = require('./shared/cors-config');

// Wrap handler with secure CORS middleware
exports.handler = withSecureCors(async (event, context) => {
  try {
    const { companyId, userId } = getCompanyUserFromEvent(event);

    // Business logic here

    return createResponse(200, { success: true });
  } catch (error) {
    console.error('Error:', error);
    return createErrorResponse(500, 'Internal server error');
  }
});
```

### Shared Utilities

All shared utility modules (`utils.js`, `company-utils.js`, `paddle-utils.js`, etc.) now use the secure CORS configuration:

```javascript
const { createCorsResponse, createCorsErrorResponse } = require('./cors-config');

function createResponse(statusCode, body, additionalHeaders = {}, origin = null) {
  return createCorsResponse(statusCode, body, origin, additionalHeaders);
}

function createErrorResponse(statusCode, message, error = null, origin = null) {
  return createCorsErrorResponse(statusCode, message, origin, error);
}
```

## CORS Headers

### Standard Response Headers

```
Access-Control-Allow-Origin: <whitelisted-origin>
Access-Control-Allow-Credentials: true
Access-Control-Allow-Headers: Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Requested-With
Access-Control-Allow-Methods: GET,POST,PUT,DELETE,OPTIONS,PATCH
Access-Control-Max-Age: 3600
Vary: Origin
Content-Type: application/json
```

### Important Notes

- **Never returns `*` (wildcard)** - Always returns specific origin or first production origin
- **Vary: Origin** - Ensures proper CDN/browser caching
- **Credentials: true** - Required for cookie/auth header support
- **Max-Age: 3600** - Caches preflight for 1 hour

## Security Monitoring

### CORS Violation Logging

When an unauthorized origin attempts to access the API, a security event is logged to CloudWatch:

```json
{
  "type": "CORS_VIOLATION",
  "severity": "SECURITY",
  "timestamp": "2025-12-02T20:30:00.000Z",
  "origin": "https://malicious-site.com",
  "function": "companyExpenses",
  "environment": "production",
  "awsRegion": "us-east-1",
  "allowedOrigins": ["https://d6dvynagj630i.cloudfront.net", ...]
}
```

### CloudWatch Insights Query

To monitor CORS violations:

```sql
fields @timestamp, origin, function, allowedOrigins
| filter type = "CORS_VIOLATION"
| sort @timestamp desc
| limit 100
```

### Alerting

Consider setting up CloudWatch Alarms for:
- High rate of CORS violations (potential attack)
- CORS violations from unexpected origins
- Wildcard CORS detection (critical misconfiguration)

## Testing

### Manual Testing

Use the provided test script:

```bash
# Set your API URL
export API_URL="https://your-api-gateway-url/prod"

# Optional: Set authentication token
export CLERK_TOKEN="your-clerk-jwt-token"

# Run tests
node test-cors-security.js
```

### Test Cases

The test script validates:
1. ✅ Whitelisted origins are allowed
2. ✅ Non-whitelisted origins are blocked (403)
3. ✅ No wildcard CORS (*) is returned
4. ✅ OPTIONS preflight works correctly
5. ✅ Vary: Origin header is present
6. ✅ Credentials support is enabled

### Security Scan

Check for wildcard CORS in codebase:

```bash
# Should return no results
grep -r "Access-Control-Allow-Origin.*\*" lambda/ --include="*.js" --exclude-dir=node_modules
```

## Adding New Origins

### Process

1. **Identify Requirement**
   - Why is this origin needed?
   - Is it a production or development origin?
   - Is it permanent or temporary?

2. **Update Configuration**

   Edit `/Users/maordaniel/Ofek/lambda/shared/cors-config.js`:

   ```javascript
   const PRODUCTION_ORIGINS = [
     // Existing origins...
     'https://new-domain.com' // Add new origin with comment explaining purpose
   ];
   ```

3. **Test Changes**

   ```bash
   # Update test script with new origin
   # Run security tests
   node test-cors-security.js
   ```

4. **Deploy**

   ```bash
   # Deploy Lambda functions
   npm run deploy
   ```

5. **Verify**

   - Check CloudWatch logs for CORS violations
   - Test frontend can access API from new origin
   - Verify unauthorized origins still blocked

### Approval Process

**Required for Production Origins:**
- Security team review
- Documentation of business justification
- Testing in staging environment
- Monitoring plan

**Development Origins:**
- Can be added by developers
- Should be clearly marked as development-only
- Must be automatically disabled in production

## Troubleshooting

### Frontend Getting 403 Errors

**Symptom:** Browser shows CORS error or 403 Forbidden

**Diagnosis:**
1. Check browser DevTools Network tab for:
   - Request Origin header value
   - Response Access-Control-Allow-Origin value

2. Check CloudWatch logs for CORS violations:
   ```sql
   filter type = "CORS_VIOLATION"
   | fields @timestamp, origin, function
   | sort @timestamp desc
   ```

**Resolution:**
- If origin is legitimate, add to whitelist
- If origin is incorrect, fix frontend configuration

### OPTIONS Preflight Failing

**Symptom:** OPTIONS request returns 403 or incorrect headers

**Diagnosis:**
1. Verify `withSecureCors` middleware is applied to Lambda
2. Check Lambda logs for errors
3. Verify origin is in whitelist

**Resolution:**
- Ensure Lambda handler is wrapped with `withSecureCors`
- Add origin to whitelist if legitimate
- Check API Gateway CORS configuration

### Wildcard CORS Detected

**Symptom:** Security scan finds `Access-Control-Allow-Origin: *`

**CRITICAL - Immediate Action Required:**

1. **Identify Source:**
   ```bash
   grep -rn "Access-Control-Allow-Origin.*\*" lambda/ --include="*.js"
   ```

2. **Fix Immediately:**
   - Update function to use `createCorsResponse` from cors-config
   - Or wrap handler with `withSecureCors`

3. **Deploy ASAP:**
   ```bash
   npm run deploy
   ```

4. **Verify Fix:**
   ```bash
   node test-cors-security.js
   ```

### Development Environment Issues

**Symptom:** Localhost cannot access API

**Diagnosis:**
- Check `NODE_ENV` is not set to `production`
- Verify development origins are in `DEVELOPMENT_ORIGINS`
- Check CloudWatch logs for CORS violations

**Resolution:**
1. Set environment variable:
   ```bash
   export NODE_ENV=development
   ```

2. Verify origin is in development list:
   ```javascript
   const DEVELOPMENT_ORIGINS = [
     'http://localhost:3000', // Add your localhost port
   ];
   ```

3. Redeploy if configuration changed

## Best Practices

### ✅ DO

- **Use `withSecureCors` middleware** for all new Lambda functions
- **Log CORS violations** for security monitoring
- **Test CORS configuration** before deploying to production
- **Review allowed origins quarterly** to remove unused origins
- **Use environment detection** to automatically disable dev origins in production
- **Include Vary: Origin header** for proper caching
- **Document all origin additions** with business justification

### ❌ DON'T

- **Never use wildcard (*) in production** - CSRF vulnerability!
- **Don't add origins without review** - security risk
- **Don't skip OPTIONS handling** - browsers require it
- **Don't hardcode origins in Lambda** - use cors-config module
- **Don't ignore CORS violations** - potential attack indicator
- **Don't bypass origin validation** - defeats security purpose
- **Don't commit sensitive origins to public repos** - if applicable

## Maintenance

### Regular Security Reviews

**Monthly:**
- Review CloudWatch logs for CORS violations
- Check for patterns indicating attacks
- Verify no wildcard CORS in codebase

**Quarterly:**
- Review allowed origins list
- Remove unused origins
- Update development origins as needed
- Test CORS configuration end-to-end

**Annual:**
- Complete security audit of CORS implementation
- Review OWASP CORS best practices
- Update documentation

### Updating Dependencies

When updating dependencies that handle HTTP responses:
1. Run security scan for wildcard CORS
2. Test with `test-cors-security.js`
3. Monitor CloudWatch logs after deployment

## API Gateway Configuration

While Lambda functions now handle CORS through the middleware, API Gateway should also be configured properly:

### Recommended API Gateway CORS Settings

- **Access-Control-Allow-Origin:** Do NOT use wildcard (*)
- **Access-Control-Allow-Headers:** Match Lambda configuration
- **Access-Control-Allow-Methods:** Match Lambda configuration
- **Access-Control-Allow-Credentials:** true

**Note:** Since Lambda functions now handle CORS through `withSecureCors` middleware, API Gateway CORS can be minimal or disabled. The Lambda CORS headers will take precedence.

### Checking API Gateway CORS

```bash
# Get API Gateway REST API ID
aws apigateway get-rest-apis --region us-east-1

# Check CORS on specific resource
aws apigateway get-method \
  --rest-api-id YOUR_API_ID \
  --resource-id YOUR_RESOURCE_ID \
  --http-method OPTIONS \
  --region us-east-1
```

## References

- [OWASP CORS Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [MDN Web Docs - CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- [AWS API Gateway CORS](https://docs.aws.amazon.com/apigateway/latest/developerguide/how-to-cors.html)

## Implementation History

- **2025-12-02:** Implemented secure CORS configuration
  - Created `lambda/shared/cors-config.js` module
  - Updated all 42 Lambda functions to use `withSecureCors` middleware
  - Updated 5 shared utility modules
  - Removed all wildcard CORS (*) occurrences
  - Created security testing script
  - Added CloudWatch logging for CORS violations
  - Documented implementation and best practices

## Contact

For questions or security concerns regarding CORS configuration:
- Review this documentation first
- Check CloudWatch logs for CORS violations
- Run `test-cors-security.js` to verify configuration
- Contact security team for production origin additions

---

**Last Updated:** 2025-12-02
**Version:** 1.0
**Status:** ✅ Production Ready
