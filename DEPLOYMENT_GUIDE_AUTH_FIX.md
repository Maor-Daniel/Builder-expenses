# Deployment Guide: Authentication Security Fix

## Quick Start

This guide helps you deploy the critical authentication bypass security fix.

---

## Pre-Deployment Checklist

### 1. Review Changes
```bash
# View the security fix
git diff HEAD lambda/shared/company-utils.js

# Run security tests
node lambda/shared/test-auth-security.js
```

### 2. Verify Environment Variables

**Required for Production:**
- `NODE_ENV=production` (or `ENVIRONMENT=production`)
- `CLERK_AUTH_ENABLED=true` (OR `COGNITO_AUTH_ENABLED=true`)

**Check current production config:**
```bash
# For AWS Lambda
aws lambda get-function-configuration \
  --function-name YOUR_FUNCTION_NAME \
  --query 'Environment.Variables'
```

### 3. Staging Environment Test

**Deploy to staging first:**
```bash
# Set staging environment
export NODE_ENV=production
export CLERK_AUTH_ENABLED=true

# Deploy to staging
./deploy-staging.sh  # Or your deployment script

# Test authentication
curl -H "Authorization: Bearer STAGING_TOKEN" \
  https://staging-api.example.com/projects
```

---

## Deployment Steps

### Option 1: Deploy via Package Script

```bash
# From project root
cd /Users/maordaniel/Ofek

# Package all lambdas with the fix
node scripts/package-lambdas.js

# Deploy to AWS (use your deployment method)
# Example with SAM:
sam deploy --stack-name construction-expenses --guided

# Example with Serverless:
serverless deploy --stage production
```

### Option 2: Deploy Specific Lambda Functions

If you only need to update specific functions:

```bash
# Package the shared utilities
cd lambda/shared
zip -r company-utils.zip company-utils.js

# Update functions that use company-utils.js
# (All company-scoped lambdas use this)
for func in $(aws lambda list-functions --query 'Functions[?Runtime==`nodejs18.x`].FunctionName' --output text)
do
  echo "Updating $func..."
  # Update the layer or redeploy the function
done
```

### Option 3: Manual Verification Before Deploy

```bash
# 1. Run tests locally
node lambda/shared/test-auth-security.js

# 2. Verify no test mode in production builds
grep -r "test-company-123" lambda/ --exclude-dir=node_modules

# 3. Check environment detection works
node -e "
  process.env.NODE_ENV = 'production';
  const { getCompanyUserFromEvent } = require('./lambda/shared/company-utils.js');
  try {
    getCompanyUserFromEvent({ headers: {} });
    console.error('❌ FAIL: Should have blocked');
  } catch (e) {
    console.log('✅ PASS: Production blocks test mode');
  }
"
```

---

## Environment Variable Setup

### AWS Lambda Console

1. Go to AWS Lambda Console
2. Select your function
3. Configuration → Environment variables
4. Add/update:
   ```
   NODE_ENV=production
   CLERK_AUTH_ENABLED=true
   ```
5. Save

### AWS SAM Template

```yaml
# template.yaml
Globals:
  Function:
    Environment:
      Variables:
        NODE_ENV: production
        CLERK_AUTH_ENABLED: true
        AWS_REGION: us-east-1

Resources:
  GetProjectsFunction:
    Type: AWS::Serverless::Function
    Properties:
      # ... other properties
      Environment:
        Variables:
          NODE_ENV: production
          CLERK_AUTH_ENABLED: true
```

### Serverless Framework

```yaml
# serverless.yml
provider:
  name: aws
  runtime: nodejs18.x
  environment:
    NODE_ENV: production
    CLERK_AUTH_ENABLED: true
    AWS_REGION: us-east-1

functions:
  getProjects:
    handler: lambda/getProjects.handler
    # Inherits provider.environment
```

### Terraform

```hcl
resource "aws_lambda_function" "api_function" {
  # ... other config

  environment {
    variables = {
      NODE_ENV           = "production"
      CLERK_AUTH_ENABLED = "true"
      AWS_REGION         = "us-east-1"
    }
  }
}
```

---

## Post-Deployment Verification

### 1. Check CloudWatch Logs

```bash
# Tail logs for your function
aws logs tail /aws/lambda/YOUR_FUNCTION_NAME --follow --since 5m

# Look for:
# ✅ NO "WARNING: Test authentication mode active" in production
# ✅ Successful authentication logs
# ❌ NO AUTHENTICATION_BYPASS_ATTEMPT events
```

### 2. Test API Endpoints

**Without authentication (should fail):**
```bash
curl -X GET https://api.example.com/projects
# Expected: 401 Unauthorized or 403 Forbidden
```

**With valid authentication (should succeed):**
```bash
curl -X GET \
  -H "Authorization: Bearer YOUR_VALID_TOKEN" \
  https://api.example.com/projects
# Expected: 200 OK with data
```

### 3. Verify Environment

```bash
# Check Lambda configuration
aws lambda get-function-configuration \
  --function-name YOUR_FUNCTION_NAME \
  --query 'Environment.Variables.{NODE_ENV:NODE_ENV,AUTH:CLERK_AUTH_ENABLED}'

# Expected output:
# {
#   "NODE_ENV": "production",
#   "AUTH": "true"
# }
```

### 4. Monitor CloudWatch Metrics

**Create CloudWatch Dashboard:**

1. Go to CloudWatch → Dashboards
2. Create new dashboard: "Auth Security Monitoring"
3. Add widgets:
   - Lambda invocations
   - Lambda errors
   - Custom metric for auth bypass attempts

**Query for security events:**
```
fields @timestamp, eventType, severity, message
| filter eventType = "AUTHENTICATION_BYPASS_ATTEMPT"
| sort @timestamp desc
| limit 100
```

If you see any events here after deployment, **IMMEDIATELY INVESTIGATE**.

---

## Rollback Procedures

### If Deployment Breaks Production

**Option 1: Rollback Lambda Version**
```bash
# List versions
aws lambda list-versions-by-function --function-name YOUR_FUNCTION

# Rollback to previous version
aws lambda update-alias \
  --function-name YOUR_FUNCTION \
  --name production \
  --function-version PREVIOUS_VERSION_NUMBER
```

**Option 2: Fix Environment Variables (Preferred)**
```bash
# If auth is not configured, configure it
aws lambda update-function-configuration \
  --function-name YOUR_FUNCTION \
  --environment Variables="{NODE_ENV=production,CLERK_AUTH_ENABLED=true}"
```

**Option 3: Emergency Bypass (NOT RECOMMENDED)**
```bash
# Only use if you need emergency access to fix the system
# This temporarily allows development mode in production

aws lambda update-function-configuration \
  --function-name YOUR_FUNCTION \
  --environment Variables="{NODE_ENV=development,CLERK_AUTH_ENABLED=false}"

# IMPORTANT: FIX AUTHENTICATION IMMEDIATELY AND REVERT THIS
```

---

## Monitoring Setup

### CloudWatch Alarm for Auth Bypass Attempts

```bash
# Create metric filter
aws logs put-metric-filter \
  --log-group-name /aws/lambda/YOUR_FUNCTION \
  --filter-name AuthBypassAttempts \
  --filter-pattern '{ $.eventType = "AUTHENTICATION_BYPASS_ATTEMPT" }' \
  --metric-transformations \
    metricName=AuthBypassAttempts,\
    metricNamespace=Security,\
    metricValue=1

# Create alarm
aws cloudwatch put-metric-alarm \
  --alarm-name Critical-Auth-Bypass-Attempt \
  --alarm-description "Authentication bypass attempted in production" \
  --metric-name AuthBypassAttempts \
  --namespace Security \
  --statistic Sum \
  --period 60 \
  --threshold 1 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --evaluation-periods 1 \
  --alarm-actions arn:aws:sns:REGION:ACCOUNT:security-alerts
```

---

## Common Issues & Solutions

### Issue 1: "Authentication required in production" errors

**Cause:** Environment variables not set correctly

**Solution:**
```bash
# Verify and fix environment variables
aws lambda update-function-configuration \
  --function-name YOUR_FUNCTION \
  --environment Variables="{NODE_ENV=production,CLERK_AUTH_ENABLED=true}"
```

### Issue 2: Local development broken

**Cause:** `NODE_ENV=production` set locally

**Solution:**
```bash
# In .env.local or shell
export NODE_ENV=development
export IS_LOCAL_DEVELOPMENT=true

# Or remove production env vars
unset NODE_ENV
```

### Issue 3: Still seeing test mode warnings in production

**Cause:** Either:
1. Environment variables not propagated
2. Using cached/old Lambda version
3. Using different Lambda instance

**Solution:**
```bash
# Force new deployment
aws lambda update-function-code \
  --function-name YOUR_FUNCTION \
  --zip-file fileb://function.zip \
  --publish  # Creates new version

# Update alias to new version
aws lambda update-alias \
  --function-name YOUR_FUNCTION \
  --name production \
  --function-version $NEW_VERSION
```

---

## Testing Checklist

After deployment, verify:

- [ ] CloudWatch shows no test mode warnings in production logs
- [ ] API requests without auth tokens return 401/403 errors
- [ ] API requests with valid auth tokens succeed
- [ ] Environment variables are correct in Lambda console
- [ ] CloudWatch alarm is configured and active
- [ ] Local development still works (test mode available)
- [ ] Staging environment works with production-like config
- [ ] No `AUTHENTICATION_BYPASS_ATTEMPT` events in CloudWatch

---

## Support & Escalation

### If You Encounter Issues

1. **Check CloudWatch Logs** - Most issues show clear error messages
2. **Verify Environment Variables** - 90% of issues are misconfigured env vars
3. **Test in Staging First** - Never debug in production
4. **Review Security Fix Documentation** - See `SECURITY_FIX_AUTH_BYPASS.md`

### Emergency Contacts

- **DevOps Team:** [Your DevOps contact]
- **Security Team:** [Your Security contact]
- **On-Call Engineer:** [Your on-call rotation]

---

## Success Criteria

Deployment is successful when:

✅ All Lambda functions have `NODE_ENV=production`
✅ All Lambda functions have `CLERK_AUTH_ENABLED=true` (or `COGNITO_AUTH_ENABLED=true`)
✅ CloudWatch logs show no test mode warnings in production
✅ API endpoints require proper authentication
✅ CloudWatch alarm is configured and monitoring
✅ Local development environments still work
✅ All authentication tests pass

---

## Next Steps After Deployment

1. **Monitor for 24 hours** - Watch CloudWatch for any auth bypass attempts
2. **Review access logs** - Ensure all requests are properly authenticated
3. **Update documentation** - Document the new security requirements
4. **Train team** - Ensure all developers understand the new security controls
5. **Schedule security review** - Plan regular security audits

---

**Last Updated:** 2025-11-30
**Document Version:** 1.0
**Status:** Ready for Production
