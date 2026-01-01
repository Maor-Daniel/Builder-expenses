# Lambda Environment Variables Documentation

This document describes all environment variables used across the Construction Expenses Lambda functions.

## Standard Environment Variables

These variables should be set on **ALL** Lambda functions for consistent behavior:

### Core Configuration (Required)
```bash
NODE_ENV=production                    # Node.js environment (production, staging, dev)
ENVIRONMENT=production                 # Application environment (production, staging, dev)
TABLE_PREFIX=construction-expenses     # DynamoDB table name prefix
AWS_REGION=us-east-1                  # AWS region for resources
```

### Authentication (Required for auth-enabled functions)
```bash
CLERK_AUTH_ENABLED=true               # Enable Clerk JWT authentication
CLERK_FRONTEND_API=https://builder-expenses.clerk.accounts.dev
```

### Paddle Payment Integration (Required for payment functions)
```bash
PADDLE_ENVIRONMENT=production          # Paddle environment (production or sandbox)

# Paddle Price IDs (optional - defaults to production IDs)
PADDLE_STARTER_PRICE_ID=pri_01kdwqn0d0ebbev71xa0v6e2hd
PADDLE_PROFESSIONAL_PRICE_ID=pri_01kdwqsgm7mcr7myg3cxnrxt9y
PADDLE_ENTERPRISE_PRICE_ID=pri_01kdwqwn1e1z4xc93rgstytpj1

# Paddle Product IDs (optional - defaults to production IDs)
PADDLE_STARTER_PRODUCT_ID=pro_01kdwf11hqt0w7anyyq7chr23a
PADDLE_PROFESSIONAL_PRODUCT_ID=pro_01kdwqqf1cg364eztm3n0x4vg3
PADDLE_ENTERPRISE_PRODUCT_ID=pro_01kdwqvfkg3sajqszq4x0wfjbq
```

### Email Configuration (Required for notification functions)
```bash
FROM_EMAIL=noreply@builder-expenses.com
FRONTEND_URL=https://www.builder-expenses.com
```

### Storage Configuration (Required for upload functions)
```bash
RECEIPT_BUCKET=construction-expenses-receipts-702358134603
LOGO_BUCKET=construction-expenses-logos-702358134603
```

### Logging
```bash
LOG_LEVEL=info                        # Logging verbosity (debug, info, warn, error)
```

## Environment-Specific Table Names

DynamoDB table names are automatically generated based on `ENVIRONMENT` and `TABLE_PREFIX`:

### Production (`ENVIRONMENT=production`)
- `construction-expenses-companies`
- `construction-expenses-company-users`
- `construction-expenses-invitations`
- `construction-expenses-company-projects`
- `construction-expenses-company-contractors`
- `construction-expenses-company-expenses`
- `construction-expenses-company-works`
- `construction-expenses-paddle-subscriptions`
- `construction-expenses-paddle-customers`
- `construction-expenses-paddle-payments`
- `construction-expenses-paddle-webhooks`

### Staging (`ENVIRONMENT=staging`)
- `construction-expenses-staging-companies`
- `construction-expenses-staging-company-users`
- `construction-expenses-staging-invitations`
- etc.

### Development (`ENVIRONMENT=dev`)
- `construction-expenses-dev-companies`
- `construction-expenses-dev-company-users`
- `construction-expenses-dev-invitations`
- etc.

## Secrets Stored in AWS Secrets Manager

These secrets are fetched automatically by Lambda functions and should **NOT** be set as environment variables:

### Clerk Secrets
- `construction-expenses/clerk/secret-key` - Clerk API secret key
- `construction-expenses/clerk/publishable-key` - Clerk publishable key

### Paddle Secrets
- `construction-expenses/paddle/api-key` - Paddle API key
- `construction-expenses/paddle/webhook-secret` - Paddle webhook signature secret
- `construction-expenses/paddle/client-token` - Paddle production client-side token
- `construction-expenses/paddle/client-token-sandbox` - Paddle sandbox client-side token

### OpenRouter Secrets (for OCR)
- `construction-expenses/openrouter-api-key` - OpenRouter API key for Claude OCR

### Sentry Secrets
- `construction-expenses/sentry-dsn` - Sentry error tracking DSN

## Function-Specific Variables

Some Lambda functions require additional environment variables:

### Paddle Checkout Functions
- `construction-expenses-create-paddle-checkout`
- `construction-expenses-update-paddle-subscription`

Requires: All Paddle variables + `FRONTEND_URL`

### Email Functions
- `construction-expenses-invite-user`
- `construction-expenses-send-invitation`
- `construction-expenses-resend-invitation`

Requires: `FROM_EMAIL` + `FRONTEND_URL`

### Upload Functions
- `construction-expenses-upload-receipt`
- `construction-expenses-upload-logo`
- `construction-expenses-process-receipt-ocr`

Requires: `RECEIPT_BUCKET` or `LOGO_BUCKET` + OpenRouter secret

### Webhook Functions
- `construction-expenses-webhook-paddle`
- `construction-expenses-paddle-webhook`

Requires: All Paddle variables

## Setting Environment Variables

### Via AWS Console
1. Navigate to Lambda function
2. Configuration → Environment variables
3. Add key-value pairs

### Via AWS CLI
```bash
aws lambda update-function-configuration \
  --function-name construction-expenses-FUNCTION_NAME \
  --environment Variables="{NODE_ENV=production,ENVIRONMENT=production,TABLE_PREFIX=construction-expenses}" \
  --region us-east-1
```

### Via CloudFormation/Terraform
See `infrastructure/lambda-env-template.yaml` for template

## Migration Guide

If you have existing Lambda functions with hardcoded values:

### 1. Table Names
**Before:**
```javascript
const TABLE_NAME = 'construction-expenses-companies';
```

**After:**
```javascript
const { COMPANY_TABLE_NAMES } = require('./shared/table-config');
const TABLE_NAME = COMPANY_TABLE_NAMES.COMPANIES;
```

### 2. Paddle Price IDs
**Before:**
```javascript
const priceId = 'pri_01kdwqn0d0ebbev71xa0v6e2hd';
```

**After:**
```javascript
const { SUBSCRIPTION_PLANS } = require('./shared/paddle-utils');
const priceId = SUBSCRIPTION_PLANS.STARTER.priceId;
```

### 3. Email Configuration
**Before:**
```javascript
const fromEmail = 'noreply@yankale.com';
```

**After:**
```javascript
const fromEmail = process.env.FROM_EMAIL || 'noreply@builder-expenses.com';
```

## Best Practices

1. **Always use environment variables** for configuration that varies between environments
2. **Use AWS Secrets Manager** for sensitive data (API keys, passwords, tokens)
3. **Provide sensible defaults** for non-sensitive configuration
4. **Document new variables** in this file when adding them
5. **Validate required variables** at function startup to fail fast
6. **Use consistent naming** across all functions

## Troubleshooting

### Table Not Found Errors
Check that `ENVIRONMENT` and `TABLE_PREFIX` are set correctly. Table names are generated dynamically.

### Authentication Errors
Verify that secrets in AWS Secrets Manager are accessible and `CLERK_AUTH_ENABLED=true` is set.

### Paddle Checkout Failures
Ensure `PADDLE_ENVIRONMENT` matches the Paddle dashboard environment and client token is correct in Secrets Manager.

### Missing Environment Variables
Check CloudWatch logs for errors about missing configuration. Add the required variables to the Lambda function.
