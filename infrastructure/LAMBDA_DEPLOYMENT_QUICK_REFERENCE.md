# Lambda Deployment - Quick Reference Card

## Prerequisites Checklist

```bash
# ✅ CloudFormation stack deployed
aws cloudformation describe-stacks --stack-name construction-expenses-production

# ✅ Lambda functions packaged
npm run package

# ✅ Environment variables set
export PADDLE_API_KEY="..."
export CLERK_SECRET_KEY="..."
# ... other secrets
```

## Quick Commands

### Test Single Function
```bash
./scripts/test-deploy-single-lambda.sh
```

### Deploy All Functions
```bash
./scripts/deploy-all-lambdas.sh
```

### Verify Function
```bash
aws lambda get-function-configuration \
  --function-name construction-expenses-FUNCTION-NAME \
  --region us-east-1
```

### List All Functions
```bash
aws lambda list-functions \
  --query 'Functions[?starts_with(FunctionName, `construction-expenses-`)].FunctionName' \
  --output table
```

## Environment Variables

### Required Secrets (Set Before Deployment)
```bash
export PADDLE_API_KEY="paddle_api_key"
export PADDLE_VENDOR_ID="paddle_vendor_id"
export PADDLE_WEBHOOK_SECRET="paddle_webhook_secret"
export PADDLE_STARTER_PRICE_ID="pri_starter"
export PADDLE_PRO_PRICE_ID="pri_pro"
export PADDLE_ENTERPRISE_PRICE_ID="pri_enterprise"
export CLERK_SECRET_KEY="sk_clerk_secret"
export CLERK_PUBLISHABLE_KEY="pk_clerk_public"
export CLERK_WEBHOOK_SECRET="whsec_clerk"
export APPLE_SHARED_SECRET="apple_iap_secret"
```

### Common Variables (Automatically Applied)
- `ENVIRONMENT=production`
- `TABLE_PREFIX=construction-expenses`
- `NODE_ENV=production`
- `LOG_LEVEL=info`

## File Locations

| File | Path | Purpose |
|------|------|---------|
| Env Config | `infrastructure/lambda-env-config.json` | Environment variables |
| Deploy Script | `scripts/deploy-all-lambdas.sh` | Deploy all functions |
| Test Script | `scripts/test-deploy-single-lambda.sh` | Test deployment |
| Lambda Packages | `dist/*.zip` | Packaged Lambda functions |

## Troubleshooting

### Stack Not Found
```bash
# Check stack exists
aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE
```

### Zip File Not Found
```bash
# Package functions
npm run package
```

### Permission Denied
```bash
# Check AWS credentials
aws sts get-caller-identity
```

### Reserved Environment Variable
Do NOT use: `AWS_REGION`, `AWS_LAMBDA_FUNCTION_NAME`, `AWS_*`

## Key URLs

- CloudFormation Console: https://console.aws.amazon.com/cloudformation
- Lambda Console: https://console.aws.amazon.com/lambda
- CloudWatch Logs: https://console.aws.amazon.com/cloudwatch/home#logs

## Common Issues

| Issue | Solution |
|-------|----------|
| Function not found | Use create-or-update in deployment script |
| Reserved env var | Remove AWS_* variables from config |
| IAM permission denied | Ensure `iam:PassRole` permission |
| Env var not substituted | Export the variable before running script |

## Deployment Flow

```
1. Get CloudFormation IAM Role ARN
          ↓
2. Load environment config
          ↓
3. For each Lambda:
   - Check if exists
   - Create or update code
   - Set IAM role
   - Configure env vars
          ↓
4. Report results
```

## Success Indicators

```
✅ Lambda Role ARN retrieved
✅ Environment config loaded
✅ Function created/updated
✅ Environment variables set
✅ IAM role verified
```

## Documentation Links

- Full Guide: `infrastructure/LAMBDA_DEPLOYMENT_GUIDE.md`
- Implementation Report: `infrastructure/PHASE3_IMPLEMENTATION_REPORT.md`
- Environment Config: `infrastructure/lambda-env-config.json`
