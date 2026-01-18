# Lambda Deployment Guide - CloudFormation Integration

## Overview

This guide documents the Lambda deployment workflow that integrates with CloudFormation-managed infrastructure. All Lambda functions now use the CloudFormation-managed IAM role and have environment variables configured from a centralized configuration file.

## Phase 3 Implementation

### What Was Implemented

1. **CloudFormation IAM Role Integration**
   - All Lambda functions now use the IAM role managed by CloudFormation
   - Role ARN is automatically retrieved from CloudFormation stack outputs
   - No hardcoded IAM role ARNs in deployment scripts

2. **Centralized Environment Variable Configuration**
   - Created `infrastructure/lambda-env-config.json` for all environment variables
   - Supports common variables (applied to all functions)
   - Supports function-specific variables
   - Environment variable substitution from system environment or AWS Secrets Manager

3. **Enhanced Deployment Script**
   - Updated `scripts/deploy-all-lambdas.sh` to use CloudFormation role
   - Automatic create-or-update logic (idempotent)
   - Environment variable injection per function
   - Progress reporting and error handling
   - Validates CloudFormation stack outputs before deployment

4. **Test Deployment Script**
   - Created `scripts/test-deploy-single-lambda.sh` for testing
   - Validates entire workflow with a single function
   - Verifies environment variables and IAM role configuration

## Architecture

```
┌─────────────────────────────────────┐
│   CloudFormation Stack              │
│   construction-expenses-production  │
├─────────────────────────────────────┤
│ Outputs:                            │
│ - LambdaExecutionRoleArn           │
│ - UserPoolId                        │
│ - ApiGatewayId                      │
└──────────────┬──────────────────────┘
               │
               │ ARN Retrieved
               ▼
┌─────────────────────────────────────┐
│  Deployment Script                  │
│  deploy-all-lambdas.sh             │
├─────────────────────────────────────┤
│ 1. Get IAM Role ARN from CF        │
│ 2. Load env config from JSON       │
│ 3. For each Lambda:                │
│    - Package function              │
│    - Try update-function-code      │
│    - If not exists: create         │
│    - Update configuration          │
│    - Set environment variables     │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  53 Lambda Functions                │
│  All using CF-managed IAM role     │
│  All with env vars from config     │
└─────────────────────────────────────┘
```

## Files

### 1. Environment Configuration
**File:** `infrastructure/lambda-env-config.json`

Structure:
```json
{
  "common": {
    "ENVIRONMENT": "production",
    "TABLE_PREFIX": "construction-expenses",
    "NODE_ENV": "production",
    "LOG_LEVEL": "info"
  },
  "functions": {
    "construction-expenses-function-name": {
      "FUNCTION_SPECIFIC_VAR": "value",
      "SECRET_VAR": "${ENV_VAR_NAME}"
    }
  },
  "_env_substitution": {
    "ENV_VAR_NAME": {
      "source": "environment",
      "required": true,
      "description": "Description of the variable"
    }
  }
}
```

**Important Notes:**
- Do NOT use `AWS_REGION` - it's a reserved environment variable
- Use `${VAR_NAME}` syntax for environment variable substitution
- Common variables are applied to ALL functions
- Function-specific variables override common variables

### 2. Deployment Scripts

#### Main Deployment Script
**File:** `scripts/deploy-all-lambdas.sh`

Usage:
```bash
# Deploy all 53+ Lambda functions
cd /path/to/BE\ and\ Webapp
./scripts/deploy-all-lambdas.sh
```

Features:
- Retrieves CloudFormation IAM role ARN automatically
- Idempotent (create if not exists, update if exists)
- Injects environment variables from config
- Progress reporting with colored output
- Error handling and rollback

#### Test Deployment Script
**File:** `scripts/test-deploy-single-lambda.sh`

Usage:
```bash
# Test deployment with a single function
cd /path/to/BE\ and\ Webapp
./scripts/test-deploy-single-lambda.sh
```

Tests:
- CloudFormation stack output retrieval
- Environment variable extraction
- Function creation workflow
- Environment variable verification
- IAM role verification

## Deployment Workflow

### Prerequisites

1. CloudFormation stack deployed:
   ```bash
   aws cloudformation describe-stacks \
     --stack-name construction-expenses-production \
     --region us-east-1
   ```

2. Lambda functions packaged:
   ```bash
   npm run package
   # Creates zip files in dist/ directory
   ```

3. Required environment variables set (for secrets):
   ```bash
   export PADDLE_API_KEY="your_paddle_api_key"
   export PADDLE_WEBHOOK_SECRET="your_webhook_secret"
   export CLERK_SECRET_KEY="your_clerk_secret"
   # ... etc
   ```

### Step-by-Step Deployment

#### Step 1: Verify CloudFormation Stack
```bash
aws cloudformation describe-stacks \
  --stack-name construction-expenses-production \
  --query 'Stacks[0].Outputs[?OutputKey==`LambdaExecutionRoleArn`].OutputValue' \
  --output text \
  --region us-east-1
```

Expected output:
```
arn:aws:iam::702358134603:role/construction-expenses-production-lambda-role
```

#### Step 2: Package Lambda Functions
```bash
cd /path/to/BE\ and\ Webapp
npm run package
```

This creates zip files in `dist/` directory for all 53+ Lambda functions.

#### Step 3: Test Deployment (Single Function)
```bash
./scripts/test-deploy-single-lambda.sh
```

Expected output:
```
═══════════════════════════════════════════════════════
   Lambda Deployment Test - Single Function
═══════════════════════════════════════════════════════

🔍 Retrieving CloudFormation IAM Role ARN...
✅ Lambda Role ARN: arn:aws:iam::702358134603:role/construction-expenses-production-lambda-role

✅ Environment config file found

🔍 Extracting environment variables...
   Common variables: ENVIRONMENT=production,TABLE_PREFIX=construction-expenses,NODE_ENV=production,LOG_LEVEL=info
   Function-specific variables: FUNCTION_NAME=getExpenses
✅ Environment variables prepared

✅ Zip file found: /path/to/dist/getExpenses.zip

📤 Deploying test function construction-expenses-get-expenses...

   Function created successfully
✅ Test deployment completed successfully!
```

#### Step 4: Deploy All Functions
```bash
./scripts/deploy-all-lambdas.sh
```

This will:
1. Retrieve CloudFormation IAM role ARN
2. Load environment configuration
3. Deploy all 53+ Lambda functions
4. Report success/failure for each function

Expected output:
```
═══════════════════════════════════════════════════════
   Lambda Deployment - CloudFormation Integration
═══════════════════════════════════════════════════════

🔍 Retrieving CloudFormation IAM Role ARN...
✅ Lambda Role ARN: arn:aws:iam::702358134603:role/construction-expenses-production-lambda-role

📤 Deploying construction-expenses-get-expenses...
✅ construction-expenses-get-expenses updated successfully
...
(53+ functions)

═══════════════════════════════════════════════════════
   Deployment Summary
═══════════════════════════════════════════════════════
✅ Successfully deployed: 53 functions
📦 Using CloudFormation IAM Role: arn:aws:iam::702358134603:role/...
🔧 Environment variables configured from: infrastructure/lambda-env-config.json

🎉 All Lambda functions deployed successfully!
```

## Environment Variables

### Common Variables (All Functions)
- `ENVIRONMENT`: Deployment environment (production, staging, dev)
- `TABLE_PREFIX`: DynamoDB table name prefix
- `NODE_ENV`: Node.js environment
- `LOG_LEVEL`: Logging level (info, warn, error, debug)

### AWS Provided Variables (Automatic)
These are automatically set by AWS Lambda runtime:
- `AWS_REGION`: AWS region (us-east-1)
- `AWS_LAMBDA_FUNCTION_NAME`: Lambda function name
- `AWS_LAMBDA_FUNCTION_VERSION`: Function version
- `AWS_LAMBDA_LOG_GROUP_NAME`: CloudWatch log group
- `AWS_EXECUTION_ENV`: Lambda execution environment

### Function-Specific Variables

#### Authentication Functions
- **clerk-authorizer**
  - `CLERK_SECRET_KEY`: Clerk secret key for JWT verification
  - `CLERK_PUBLISHABLE_KEY`: Clerk publishable key
  - `JWT_MAX_TOKEN_AGE`: Maximum token age (seconds)
  - `JWT_EXPIRY_GRACE_PERIOD`: Token expiry grace period (seconds)

- **webhook-clerk**
  - `CLERK_WEBHOOK_SECRET`: Clerk webhook signature secret

#### Subscription/Payment Functions
- **paddle-webhook**, **createPaddleCheckout**, **updatePaddleSubscription**
  - `PADDLE_API_KEY`: Paddle API key
  - `PADDLE_WEBHOOK_SECRET`: Webhook signature verification secret
  - `PADDLE_VENDOR_ID`: Paddle vendor/seller ID
  - `PADDLE_STARTER_PRICE_ID`: Starter plan price ID
  - `PADDLE_PRO_PRICE_ID`: Professional plan price ID
  - `PADDLE_ENTERPRISE_PRICE_ID`: Enterprise plan price ID

#### Email Functions
- **requestPaymentEmail**, **inviteUser**, **sendInvitation**
  - `FROM_EMAIL`: Sender email address
  - `FRONTEND_URL`: Frontend application URL
  - `CHECKOUT_HOST_URL`: Checkout page URL
  - `CHECKOUT_SUCCESS_URL`: Checkout success redirect URL

#### Apple IAP Functions
- **verifyApplePurchase**, **appleWebhook**
  - `APPLE_SHARED_SECRET`: Apple App Store Connect shared secret

#### Company Registration
- **registerCompany**
  - `COGNITO_USER_POOL_ID`: Cognito User Pool ID

## Verification

### Verify Single Function
```bash
aws lambda get-function-configuration \
  --function-name construction-expenses-get-expenses \
  --region us-east-1 \
  --query '{Role:Role,Environment:Environment.Variables}' \
  --output json
```

Expected output:
```json
{
  "Role": "arn:aws:iam::702358134603:role/construction-expenses-production-lambda-role",
  "Environment": {
    "FUNCTION_NAME": "getExpenses",
    "ENVIRONMENT": "production",
    "TABLE_PREFIX": "construction-expenses",
    "NODE_ENV": "production",
    "LOG_LEVEL": "info"
  }
}
```

### Verify All Functions
```bash
# List all functions with their IAM roles
aws lambda list-functions \
  --query 'Functions[?starts_with(FunctionName, `construction-expenses-`)].{Name:FunctionName,Role:Role}' \
  --output table
```

## Troubleshooting

### Issue: CloudFormation Stack Not Found
```
Error: Failed to retrieve Lambda Role ARN from CloudFormation stack
```

**Solution:**
1. Verify stack exists:
   ```bash
   aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE
   ```
2. Check stack name in script matches actual stack name

### Issue: Reserved Environment Variable
```
Error: Lambda was unable to configure your environment variables because the environment variables you have provided contains reserved keys
```

**Solution:**
Do NOT use these reserved variables in your config:
- `AWS_REGION`
- `AWS_LAMBDA_FUNCTION_NAME`
- `AWS_LAMBDA_FUNCTION_VERSION`
- Any variable starting with `AWS_`

### Issue: Environment Variable Not Substituted
```
Environment variable shows as: ${PADDLE_API_KEY} instead of actual value
```

**Solution:**
1. Set the environment variable before running script:
   ```bash
   export PADDLE_API_KEY="your_actual_key"
   ```
2. Or update `lambda-env-config.json` to use a hardcoded value (not recommended for secrets)

### Issue: Zip File Not Found
```
Error: Zip file not found: /path/to/dist/functionName.zip
```

**Solution:**
Run packaging script first:
```bash
npm run package
```

### Issue: IAM Role Permission Denied
```
Error: User is not authorized to perform: iam:PassRole
```

**Solution:**
Ensure your AWS credentials have the `iam:PassRole` permission for the Lambda execution role.

## Security Best Practices

1. **Never commit secrets to git**
   - Use environment variables for all secrets
   - Use AWS Secrets Manager for production secrets
   - Add `.env` files to `.gitignore`

2. **Use CloudFormation-managed IAM roles**
   - All Lambda functions use the same IAM role from CloudFormation
   - IAM role permissions are centrally managed
   - Role ARN is never hardcoded

3. **Principle of least privilege**
   - IAM role only has permissions needed for Lambda functions
   - DynamoDB access scoped to specific tables
   - SES access for email sending
   - Secrets Manager access for retrieving secrets

4. **Environment variable validation**
   - Required environment variables are documented
   - Scripts validate variables before deployment
   - Missing variables cause deployment to fail

## Next Steps

1. **Migrate remaining infrastructure to CloudFormation**
   - DynamoDB tables
   - S3 buckets
   - API Gateway resources

2. **Implement AWS Secrets Manager**
   - Store Paddle API keys
   - Store Clerk secrets
   - Store Apple IAP secrets
   - Update Lambda functions to retrieve from Secrets Manager

3. **Add deployment monitoring**
   - CloudWatch alarms for Lambda errors
   - SNS notifications for deployment failures
   - CloudWatch dashboard for Lambda metrics

4. **Implement CI/CD pipeline**
   - GitHub Actions workflow for automated deployment
   - Automated testing before deployment
   - Staging environment deployment first
   - Production deployment with approval

## References

- [AWS Lambda Environment Variables](https://docs.aws.amazon.com/lambda/latest/dg/configuration-envvars.html)
- [AWS CloudFormation Outputs](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/outputs-section-structure.html)
- [AWS Lambda IAM Role](https://docs.aws.amazon.com/lambda/latest/dg/lambda-intro-execution-role.html)
- [AWS Secrets Manager](https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html)
