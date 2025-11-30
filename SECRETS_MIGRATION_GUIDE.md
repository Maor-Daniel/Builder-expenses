# AWS Secrets Manager Migration Guide

## Overview

All sensitive credentials for the Construction Expenses application are now securely stored in AWS Secrets Manager instead of being hardcoded in the codebase or environment files. This guide explains how the secrets management system works and how to use it.

## Security Benefits

- **No Hardcoded Secrets**: All API keys, tokens, and credentials are removed from code
- **Centralized Management**: All secrets stored in one secure location (AWS Secrets Manager)
- **Automatic Rotation**: Secrets can be rotated without code changes
- **IAM-Based Access Control**: Only authorized Lambda functions can access secrets
- **Audit Trail**: All secret access is logged in CloudTrail
- **Pre-Commit Protection**: Git hooks prevent accidental secret commits

## Current Secrets in AWS Secrets Manager

All secrets are stored with the prefix `construction-expenses/`:

### Clerk Authentication
- `construction-expenses/clerk/publishable-key` - Public key for frontend
- `construction-expenses/clerk/secret-key` - Secret key for backend API
- `construction-expenses/clerk/webhook-secret` - Webhook signature verification

### Paddle Billing
- `construction-expenses/paddle/api-key` - API key for Paddle API calls
- `construction-expenses/paddle/webhook-secret` - Webhook signature verification

### Sentry Monitoring
- `construction-expenses/sentry/dsn` - Data Source Name for error tracking

## How to Use Secrets in Lambda Functions

### Basic Usage

```javascript
const { getSecret } = require('./shared/secrets');

exports.handler = async (event, context) => {
  // Fetch a single secret
  const apiKey = await getSecret('paddle/api-key');

  // Use the secret
  const response = await callPaddleAPI(apiKey);

  return response;
};
```

### Fetching Multiple Secrets

```javascript
const { getSecrets } = require('./shared/secrets');

exports.handler = async (event, context) => {
  // Fetch multiple secrets in parallel
  const secrets = await getSecrets([
    'clerk/secret-key',
    'paddle/api-key',
    'sentry/dsn'
  ]);

  // Use the secrets
  const clerkKey = secrets['clerk/secret-key'];
  const paddleKey = secrets['paddle/api-key'];

  return { success: true };
};
```

### Automatic Caching

Secrets are automatically cached per Lambda container instance:

```javascript
const { getSecret } = require('./shared/secrets');

// First call: Fetches from AWS Secrets Manager
const secret1 = await getSecret('paddle/api-key'); // API call

// Second call (same container): Returns from cache
const secret2 = await getSecret('paddle/api-key'); // Cached

// Cache persists for the lifetime of the Lambda container
```

## Updated Files

### Core Secrets Module
- `/lambda/shared/secrets.js` - Main secrets management module with caching

### Updated to Use Secrets Manager
- `/lambda/shared/sentry.js` - Sentry initialization with DSN from Secrets Manager
- `/lambda/shared/paddle-utils.js` - Paddle config loaded from Secrets Manager
- `/lambda/paddleWebhook.js` - Webhook signature verification
- `/lambda/webhookClerk.js` - Clerk webhook signature verification

### Environment Files (Secrets Removed)
- `.env.production` - Removed all hardcoded secrets
- `.env.example` - Updated with instructions to use Secrets Manager

### Git Protection
- `.gitignore` - Added `.env.production` to prevent commits
- `.git-secrets-patterns` - Regex patterns to detect secrets
- `.husky/pre-commit` - Pre-commit hook to block secret commits

## IAM Permissions

Lambda execution roles have been updated with Secrets Manager access:

```json
{
  "Effect": "Allow",
  "Action": [
    "secretsmanager:GetSecretValue",
    "secretsmanager:DescribeSecret"
  ],
  "Resource": "arn:aws:secretsmanager:us-east-1:702358134603:secret:construction-expenses/*"
}
```

Roles updated:
- `construction-expenses-production-lambda-role`
- `construction-expenses-multi-table-lambda-role`

## Adding New Secrets

### 1. Create Secret in AWS Secrets Manager

```bash
aws secretsmanager create-secret \
  --name construction-expenses/service/secret-name \
  --description "Description of what this secret is for" \
  --secret-string "your-secret-value" \
  --region us-east-1
```

### 2. Use Secret in Code

```javascript
const { getSecret } = require('./shared/secrets');

const mySecret = await getSecret('service/secret-name');
```

### 3. Document the Secret

Add it to this guide and to `.env.example` for local development reference.

## Rotating Secrets

### Why Rotate Secrets

If a secret is compromised (e.g., committed to git), it must be rotated:

1. **Generate new secret** in the service dashboard (Clerk, Paddle, etc.)
2. **Update AWS Secrets Manager** with the new value
3. **Invalidate old secret** in the service dashboard
4. **No code changes required** - Lambda functions automatically use new value

### Example: Rotating Clerk Secret Key

```bash
# 1. Generate new secret key in Clerk dashboard

# 2. Update AWS Secrets Manager
aws secretsmanager update-secret \
  --secret-id construction-expenses/clerk/secret-key \
  --secret-string "sk_test_NEW_SECRET_KEY_HERE" \
  --region us-east-1

# 3. Verify update
aws secretsmanager get-secret-value \
  --secret-id construction-expenses/clerk/secret-key \
  --region us-east-1 \
  --query SecretString \
  --output text

# 4. Delete old key from Clerk dashboard

# 5. Lambda functions will use new key on next invocation
```

## Local Development

For local development, you can use environment variables as a fallback:

### Option 1: Use Real Secrets (Recommended)

Set environment variables that match the secret paths:

```bash
export CLERK_SECRET_KEY="sk_test_your_dev_key"
export PADDLE_API_KEY="pdl_sdbx_your_sandbox_key"
export SENTRY_DSN="https://your_dev_dsn@sentry.io/project"
```

The secrets module will automatically use these in local development (when `IS_LOCAL=true`).

### Option 2: Use AWS Credentials

If you have AWS credentials configured, the secrets module will fetch from Secrets Manager even in local development.

## Pre-Commit Protection

A git pre-commit hook automatically scans staged files for secrets:

### Detected Patterns

- Clerk keys: `sk_test_*`, `sk_live_*`, `pk_test_*`, `pk_live_*`
- Paddle keys: `pdl_sdbx_apikey_*`, `pdl_ntfset_*`
- Sentry DSN: `https://*@*.sentry.io/*`
- AWS keys: `AKIA*`
- Generic: `(secret|password|key|token)=*`

### Testing the Hook

```bash
# Try to commit a file with a secret
echo "CLERK_SECRET_KEY=sk_test_FAKE123" > test.txt
git add test.txt
git commit -m "test"

# Output:
# ❌ ERROR: Potential secret detected in commit!
# 🔐 SECURITY VIOLATION:
#    Secrets must be stored in AWS Secrets Manager, not in code.
```

### Bypassing the Hook (DANGEROUS - Only for Emergencies)

```bash
# Only use if absolutely necessary and you know what you're doing
git commit --no-verify -m "emergency commit"
```

## Troubleshooting

### Secret Not Found Error

```
Error: Secret construction-expenses/your-secret not available in production
```

**Solution**: Create the secret in AWS Secrets Manager:

```bash
aws secretsmanager create-secret \
  --name construction-expenses/your-secret \
  --secret-string "your-value" \
  --region us-east-1
```

### Access Denied Error

```
AccessDeniedException: User is not authorized to perform: secretsmanager:GetSecretValue
```

**Solution**: Add Secrets Manager permissions to Lambda execution role:

```bash
aws iam put-role-policy \
  --role-name your-lambda-role \
  --policy-name SecretsManagerAccess \
  --policy-document file://infrastructure/secrets-manager-policy.json
```

### Cached Secret Not Updating

Lambda containers cache secrets for performance. If you update a secret and Lambda still uses the old value:

**Solution**: Wait for Lambda container to be recycled (happens automatically) or force recreation:

```bash
# Update Lambda environment variable to force container recreation
aws lambda update-function-configuration \
  --function-name your-function \
  --environment Variables={FORCE_REFRESH=$(date +%s)}
```

## Validation Commands

### List All Secrets

```bash
aws secretsmanager list-secrets \
  --region us-east-1 \
  --filters Key=name,Values=construction-expenses/ \
  --query "SecretList[].Name" \
  --output table
```

### Get Secret Value (for testing)

```bash
aws secretsmanager get-secret-value \
  --secret-id construction-expenses/clerk/secret-key \
  --region us-east-1 \
  --query SecretString \
  --output text
```

### Verify Lambda Has Access

```bash
# Check IAM policies on Lambda role
aws iam list-role-policies \
  --role-name construction-expenses-production-lambda-role

# Get policy details
aws iam get-role-policy \
  --role-name construction-expenses-production-lambda-role \
  --policy-name SecretsManagerAccess
```

### Test Secrets Integration

```bash
# Run test script
node test-secrets.js

# Expected output:
# ✅ All tests passed! Secrets Manager integration is working correctly.
```

### Check for Hardcoded Secrets (Should Return Nothing)

```bash
# Check for Clerk keys
grep -r "sk_test_" lambda/ --exclude-dir=node_modules

# Check for Paddle keys
grep -r "pdl_sdbx" lambda/ --exclude-dir=node_modules

# Check for Sentry DSN
grep -r "a03183645096b8be557a31afbed9889d" lambda/ --exclude-dir=node_modules
```

## Security Best Practices

### ✅ DO

- Store all secrets in AWS Secrets Manager
- Use `getSecret()` to fetch secrets in Lambda functions
- Rotate secrets if they're ever exposed
- Use environment variables for non-sensitive config
- Test pre-commit hooks regularly
- Document new secrets in this guide

### ❌ DON'T

- Hardcode secrets in Lambda functions
- Commit `.env.production` to git
- Use `--no-verify` to bypass pre-commit hooks
- Share secrets in Slack, email, or documentation
- Use production secrets for local development
- Leave secrets in CloudWatch logs

## Migration Checklist

- [x] All secrets moved to AWS Secrets Manager
- [x] IAM policies updated for Lambda roles
- [x] Lambda functions updated to use `getSecret()`
- [x] Hardcoded secrets removed from all files
- [x] `.env.production` secrets removed
- [x] `.gitignore` updated to block environment files
- [x] Pre-commit hooks installed and tested
- [x] Documentation created (this file)
- [x] Secrets integration tested successfully

## Emergency Secret Revocation

If a secret is compromised:

1. **Immediately revoke** in the service dashboard (Clerk, Paddle, Sentry)
2. **Generate new secret** in the service
3. **Update AWS Secrets Manager** with new value
4. **Verify** Lambda functions work with new secret
5. **Review git history** to ensure old secret won't be exposed again
6. **Consider rotating** related secrets as a precaution

## Support

For questions or issues with secrets management:

1. Check this guide first
2. Review CloudWatch logs for error messages
3. Verify IAM permissions are correct
4. Test with `node test-secrets.js`
5. Check AWS Secrets Manager console for secret status

## Additional Resources

- [AWS Secrets Manager Documentation](https://docs.aws.amazon.com/secretsmanager/)
- [Lambda IAM Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/security-iam.html)
- [Git Hooks Documentation](https://git-scm.com/book/en/v2/Customizing-Git-Git-Hooks)
- [Clerk API Keys](https://clerk.com/docs/reference/backend-api)
- [Paddle API Authentication](https://developer.paddle.com/api-reference/authentication)
- [Sentry DSN Configuration](https://docs.sentry.io/product/sentry-basics/dsn-explainer/)
