# AWS Secrets Manager Deployment Guide

## Overview

This guide provides step-by-step instructions for deploying the centralized secret management system for the Construction Expenses application. Follow these steps carefully to ensure a smooth migration to AWS Secrets Manager with zero production downtime.

**Target Environment**: Production (us-east-1)
**AWS Account**: 702358134603
**Estimated Time**: 30-45 minutes
**Risk Level**: Low (rollback plan included)

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Pre-Deployment Checklist](#pre-deployment-checklist)
3. [Step-by-Step Deployment](#step-by-step-deployment)
4. [Testing and Verification](#testing-and-verification)
5. [Rollback Procedure](#rollback-procedure)
6. [Troubleshooting](#troubleshooting)
7. [Post-Deployment Tasks](#post-deployment-tasks)

---

## Prerequisites

### Required Tools
- AWS CLI v2 (configured with appropriate credentials)
- Git (for version control)
- Bash shell (for running scripts)
- Access to AWS Console

### Required Access
- AWS IAM permissions to create/update Secrets Manager secrets
- AWS IAM permissions to modify IAM policies and roles
- AWS Lambda deployment permissions
- Access to Clerk, Paddle, and Sentry dashboards (to retrieve secret values)

### Verify AWS CLI Access
```bash
# Check AWS CLI version
aws --version

# Verify AWS credentials
aws sts get-caller-identity

# Expected output should show:
# - Account: 702358134603
# - Region: us-east-1
```

---

## Pre-Deployment Checklist

Before starting the deployment, ensure you have:

- [ ] **Clerk Secret Key** - Retrieved from Clerk Dashboard
  - Location: Clerk Dashboard → API Keys → Secret Keys
  - Format: `sk_live_...` or `sk_test_...`

- [ ] **Clerk Webhook Secret** - Retrieved from Clerk Dashboard
  - Location: Clerk Dashboard → Webhooks → Signing Secret
  - Format: `whsec_...`

- [ ] **Paddle Client Token** - Retrieved from Paddle Dashboard
  - Location: Paddle Dashboard → Developer Tools → Authentication
  - Format: `test_...` or `live_...`

- [ ] **Current .env.production backed up** (IMPORTANT)
  ```bash
  cp .env.production .env.production.backup.$(date +%Y%m%d)
  ```

- [ ] **CloudFormation stack name confirmed**
  ```bash
  aws cloudformation describe-stacks --stack-name construction-expenses-production
  ```

- [ ] **Lambda function names listed**
  ```bash
  aws lambda list-functions --query 'Functions[?contains(FunctionName, `construction-expenses`)].FunctionName'
  ```

---

## Step-by-Step Deployment

### Step 1: Create Secrets in AWS Secrets Manager

**Duration**: 5-10 minutes

This step creates the necessary secrets in AWS Secrets Manager.

#### Option A: Interactive Setup (Recommended)
```bash
cd /Users/maordaniel/Ofek
./scripts/setup-secrets-manager.sh
```

When prompted:
1. Select option `1` (Interactive mode)
2. Enter each secret value when prompted (input is hidden)
3. Verify the summary shows all secrets created

#### Option B: Environment Variable Setup
```bash
# Set environment variables (NOT recommended - use option A instead)
export CLERK_SECRET_KEY="sk_live_your_actual_key"
export CLERK_WEBHOOK_SECRET="whsec_your_actual_secret"
export PADDLE_CLIENT_TOKEN="your_actual_token"

# Run script
./scripts/setup-secrets-manager.sh
# Select option 2 when prompted
```

#### Verification
```bash
# List all secrets
aws secretsmanager list-secrets \
  --region us-east-1 \
  --filters Key=name,Values="construction-expenses/" \
  --query 'SecretList[*].[Name,Description]' \
  --output table

# Expected output:
# construction-expenses/clerk/secret-key
# construction-expenses/clerk/webhook-secret
# construction-expenses/paddle/client-token
# construction-expenses/paddle/api-key (already exists)
# construction-expenses/paddle/webhook-secret (already exists)
# construction-expenses/sentry/dsn (already exists)
```

**🔒 Security Note**: Never run commands that output secret values. Use `describe-secret` instead of `get-secret-value`.

---

### Step 2: Update Lambda IAM Role

**Duration**: 3-5 minutes

This step grants Lambda functions permission to read secrets from AWS Secrets Manager.

```bash
cd /Users/maordaniel/Ofek
./scripts/update-lambda-iam-policy.sh
```

The script will:
1. Find the Lambda execution role from CloudFormation
2. Create or update the Secrets Manager access policy
3. Attach the policy to the Lambda execution role
4. Verify the attachment

#### Manual Verification
```bash
# Get the Lambda role name
LAMBDA_ROLE=$(aws cloudformation describe-stacks \
  --stack-name construction-expenses-production \
  --query 'Stacks[0].Outputs[?OutputKey==`LambdaExecutionRoleName`].OutputValue' \
  --output text)

# List attached policies
aws iam list-attached-role-policies \
  --role-name "$LAMBDA_ROLE" \
  --query 'AttachedPolicies[*].[PolicyName,PolicyArn]' \
  --output table

# Verify SecretsManagerAccessPolicy is listed
```

---

### Step 3: Deploy Updated Lambda Functions

**Duration**: 10-15 minutes

This step deploys the updated Lambda functions that use AWS Secrets Manager.

#### 3.1: Package Lambda Functions
```bash
cd /Users/maordaniel/Ofek
npm run package
```

Expected output:
```
✓ Lambda functions packaged successfully
✓ lambda-deployment.zip created
```

#### 3.2: Deploy to AWS
```bash
# Deploy all Lambda functions
npm run deploy:lambda
```

OR deploy individually for testing:

```bash
# Test with a single non-critical function first
aws lambda update-function-code \
  --function-name construction-expenses-production-getCompany \
  --zip-file fileb://lambda-deployment.zip
```

#### 3.3: Wait for Deployment
```bash
# Check deployment status
aws lambda get-function \
  --function-name construction-expenses-production-getCompany \
  --query 'Configuration.[FunctionName,State,LastUpdateStatus]' \
  --output table

# Wait until State = "Active" and LastUpdateStatus = "Successful"
```

---

### Step 4: Test Individual Functions

**Duration**: 10-15 minutes

Test each function to ensure it can retrieve secrets from AWS Secrets Manager.

#### 4.1: Test Clerk Authentication
```bash
# Test a function that uses Clerk auth
# Replace with actual Authorization token from your frontend
curl -X GET \
  https://YOUR_API_GATEWAY_URL/production/company \
  -H "Authorization: Bearer YOUR_CLERK_JWT_TOKEN"

# Expected: 200 OK with company data
```

#### 4.2: Check CloudWatch Logs
```bash
# View logs for Clerk auth initialization
aws logs tail /aws/lambda/construction-expenses-production-getCompany \
  --follow \
  --filter-pattern "Clerk"

# Expected log messages:
# "Fetching Clerk secret key from AWS Secrets Manager..."
# "Clerk backend initialized successfully with secret from Secrets Manager"
```

#### 4.3: Test Paddle Webhook (if applicable)
```bash
# Send test webhook from Paddle Dashboard
# Or use Paddle CLI if available

# Check logs
aws logs tail /aws/lambda/construction-expenses-production-paddleWebhook \
  --follow \
  --filter-pattern "Paddle"
```

#### 4.4: Test Sentry Integration
```bash
# Trigger an error to test Sentry
# Check Sentry dashboard for incoming errors

# Check logs
aws logs tail /aws/lambda/construction-expenses-production-getCompany \
  --follow \
  --filter-pattern "Sentry"

# Expected log message:
# "Sentry initialized successfully with DSN from Secrets Manager"
```

---

### Step 5: Deploy All Functions

**Duration**: 5-10 minutes

Once testing is successful, deploy to all Lambda functions:

```bash
# Get list of all Lambda functions
FUNCTIONS=$(aws lambda list-functions \
  --query 'Functions[?contains(FunctionName, `construction-expenses-production`)].FunctionName' \
  --output text)

# Deploy to each function
for FUNC in $FUNCTIONS; do
  echo "Deploying to $FUNC..."
  aws lambda update-function-code \
    --function-name "$FUNC" \
    --zip-file fileb://lambda-deployment.zip \
    --publish

  # Wait for deployment to complete
  aws lambda wait function-updated --function-name "$FUNC"

  echo "✓ $FUNC deployed successfully"
done
```

---

## Testing and Verification

### Comprehensive Testing

#### 1. Authentication Flow Test
```bash
# Test user authentication (via frontend or API)
# 1. Log in to the application
# 2. Access protected routes
# 3. Verify user context is correct
# 4. Check CloudWatch logs for "Clerk backend initialized"
```

#### 2. Webhook Verification Test
```bash
# Test Clerk webhook
curl -X POST \
  https://YOUR_API_GATEWAY_URL/production/webhook/clerk \
  -H "svix-id: msg_test" \
  -H "svix-timestamp: $(date +%s)" \
  -H "svix-signature: test_signature" \
  -d '{"type":"user.created","data":{"id":"test"}}'

# Check logs for webhook signature verification
```

#### 3. Paddle Integration Test
```bash
# Test Paddle checkout creation
# 1. Start subscription flow in frontend
# 2. Verify checkout URL is generated
# 3. Check logs for "Paddle API call successful"
```

#### 4. Error Tracking Test
```bash
# Trigger a test error
# 1. Access an endpoint that doesn't exist
# 2. Check Sentry dashboard for error event
# 3. Verify error context includes user info
```

### Monitoring

Monitor CloudWatch Logs for any errors:

```bash
# Monitor all Lambda functions for errors
aws logs tail /aws/lambda/construction-expenses-production-* \
  --follow \
  --filter-pattern "ERROR" \
  --format short
```

### Success Criteria

- ✅ All Lambda functions deployed successfully
- ✅ Authentication working (users can log in)
- ✅ Webhooks being verified correctly
- ✅ Paddle API calls succeeding
- ✅ Sentry errors being captured
- ✅ No "secret not found" errors in CloudWatch
- ✅ No authentication failures
- ✅ All tests passing

---

## Rollback Procedure

If issues occur, follow this rollback procedure:

### Quick Rollback (Emergency)

```bash
# 1. Revert to previous Lambda deployment
# Get the previous version
PREVIOUS_VERSION=$(aws lambda list-versions-by-function \
  --function-name construction-expenses-production-getCompany \
  --query 'Versions[-2].Version' \
  --output text)

# Revert all functions to previous version
for FUNC in $(aws lambda list-functions --query 'Functions[?contains(FunctionName, `construction-expenses-production`)].FunctionName' --output text); do
  aws lambda update-function-configuration \
    --function-name "$FUNC" \
    --environment Variables="{CLERK_SECRET_KEY=fallback_value}"
done

# 2. Restore .env.production
cp .env.production.backup.* .env.production

# 3. Redeploy with old code (if needed)
git checkout HEAD~1 lambda/shared/clerk-auth.js lambda/clerk-authorizer.js
npm run package
npm run deploy:lambda
```

### Verify Rollback
```bash
# Test authentication again
curl -X GET \
  https://YOUR_API_GATEWAY_URL/production/company \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## Troubleshooting

### Issue 1: "Secret not found in AWS Secrets Manager"

**Symptoms**: Lambda logs show "Failed to fetch secret construction-expenses/clerk/secret-key"

**Solution**:
```bash
# Verify secret exists
aws secretsmanager describe-secret \
  --secret-id construction-expenses/clerk/secret-key \
  --region us-east-1

# If not found, create it
./scripts/setup-secrets-manager.sh
```

---

### Issue 2: "Access Denied" when retrieving secrets

**Symptoms**: Lambda logs show "AccessDeniedException" when calling Secrets Manager

**Solution**:
```bash
# Verify IAM policy is attached
LAMBDA_ROLE=$(aws cloudformation describe-stacks \
  --stack-name construction-expenses-production \
  --query 'Stacks[0].Outputs[?OutputKey==`LambdaExecutionRoleName`].OutputValue' \
  --output text)

aws iam list-attached-role-policies --role-name "$LAMBDA_ROLE"

# Re-run IAM update script if needed
./scripts/update-lambda-iam-policy.sh
```

---

### Issue 3: "Clerk authentication failing"

**Symptoms**: Users cannot log in, 401 Unauthorized errors

**Solution**:
```bash
# Verify secret value is correct
aws secretsmanager get-secret-value \
  --secret-id construction-expenses/clerk/secret-key \
  --region us-east-1 \
  --query 'SecretString' \
  --output text

# Compare with Clerk Dashboard secret key
# If different, update the secret
aws secretsmanager update-secret \
  --secret-id construction-expenses/clerk/secret-key \
  --secret-string "CORRECT_SECRET_KEY"
```

---

### Issue 4: Lambda cold start timeouts

**Symptoms**: First request after deployment is slow or times out

**Solution**:
```bash
# Increase Lambda timeout (if needed)
aws lambda update-function-configuration \
  --function-name construction-expenses-production-getCompany \
  --timeout 30

# Pre-warm Lambda functions
for FUNC in $(aws lambda list-functions --query 'Functions[?contains(FunctionName, `construction-expenses-production`)].FunctionName' --output text); do
  aws lambda invoke \
    --function-name "$FUNC" \
    --payload '{"warmup":true}' \
    /tmp/response.json &
done
```

---

### Issue 5: Paddle webhooks failing verification

**Symptoms**: Paddle webhook returns 401 or signature verification fails

**Solution**:
```bash
# Verify Paddle webhook secret
aws secretsmanager get-secret-value \
  --secret-id construction-expenses/paddle/webhook-secret \
  --region us-east-1 \
  --query 'SecretString' \
  --output text

# Compare with Paddle Dashboard
# Update if needed
aws secretsmanager update-secret \
  --secret-id construction-expenses/paddle/webhook-secret \
  --secret-string "CORRECT_WEBHOOK_SECRET"
```

---

## Post-Deployment Tasks

### 1. Clean Up Environment Files

```bash
# Remove backed up .env files after successful deployment (keep for 30 days)
# DO NOT delete immediately - keep for rollback purposes
ls -la .env.production.backup.*
```

### 2. Update Documentation

- [ ] Update README.md with secret management procedures
- [ ] Document secret rotation schedule in team wiki
- [ ] Add runbook for common secret-related issues

### 3. Set Up Monitoring

```bash
# Create CloudWatch alarm for secret retrieval failures
aws cloudwatch put-metric-alarm \
  --alarm-name construction-expenses-secrets-manager-errors \
  --alarm-description "Alert on Secrets Manager access errors" \
  --metric-name Errors \
  --namespace AWS/Lambda \
  --statistic Sum \
  --period 300 \
  --threshold 5 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 1
```

### 4. Schedule Secret Rotation

Add to calendar:
- **Clerk secrets**: Rotate every 90 days (Next: 2026-03-02)
- **Paddle secrets**: Rotate every 90 days (Next: 2026-03-02)
- **Sentry DSN**: Rotate every 180 days (Next: 2026-06-01)

### 5. Security Audit

```bash
# Run git-secrets scan (if available)
git secrets --scan

# Search for any remaining secrets in code
grep -r "sk_live\|sk_test\|whsec_\|pdl_" . --exclude-dir=node_modules --exclude-dir=.git

# Expected: No matches in source code
```

### 6. Team Training

- [ ] Share this deployment guide with team
- [ ] Conduct training session on secret management
- [ ] Update onboarding documentation
- [ ] Set up secret rotation procedures

---

## Summary

### What Was Deployed

1. **AWS Secrets Manager Secrets**:
   - `construction-expenses/clerk/secret-key`
   - `construction-expenses/clerk/webhook-secret`
   - `construction-expenses/paddle/client-token`

2. **Code Changes**:
   - `lambda/shared/clerk-auth.js` - Updated to use Secrets Manager
   - `lambda/clerk-authorizer.js` - Updated to use Secrets Manager
   - `.env.production` - Removed PADDLE_CLIENT_TOKEN
   - `.env.example` - Updated comments

3. **IAM Policies**:
   - Created `SecretsManagerAccessPolicy`
   - Attached to Lambda execution role

4. **Lambda Deployments**:
   - All ~40 Lambda functions updated with new code

### Security Improvements

- ✅ Zero secrets in source code
- ✅ All secrets in AWS Secrets Manager
- ✅ Fail-closed approach (no fallbacks in production)
- ✅ Secret caching for performance
- ✅ IAM-based access control
- ✅ Audit trail in CloudWatch
- ✅ Secret rotation policy documented

### Next Steps

1. Monitor application for 24-48 hours
2. Delete .env backup files after 30 days
3. Set up automated secret rotation (future enhancement)
4. Conduct security review quarterly

---

**Deployment Date**: 2025-12-02
**Deployed By**: [Your Name]
**Deployment Status**: ✅ Success / ⚠️ Partial / ❌ Failed
**Notes**: [Add any deployment-specific notes here]

---

## Support

For issues or questions:
- Check CloudWatch Logs: [Link to CloudWatch]
- Review SECRET_INVENTORY.md for detailed secret information
- Contact: [Team Contact Information]
