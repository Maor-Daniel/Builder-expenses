# Hybrid Infrastructure Quick Reference

## 🚀 Most Common Commands

```bash
# Full deployment (everything)
npm run deploy

# Deploy only Lambda code changes
npm run package && npm run deploy:lambdas

# Check deployment status
npm run deploy:status

# View stack outputs
npm run stack:outputs
```

---

## 📦 What Goes Where?

| Resource | Managed By | Command |
|----------|------------|---------|
| Cognito | CloudFormation | `npm run deploy:infra` |
| IAM Roles | CloudFormation | `npm run deploy:infra` |
| API Gateway | CloudFormation | `npm run deploy:infra` |
| S3/CloudFront | CloudFormation | `npm run deploy:infra` |
| **DynamoDB Tables** | **AWS CLI** | **`npm run deploy:tables`** |
| **Lambda Functions** | **AWS CLI** | **`npm run deploy:lambdas`** |

---

## 🔄 Common Workflows

### Fix a Bug in Lambda
```bash
# 1. Edit the code
vim lambda/myFunction.js

# 2. Deploy
npm run package
npm run deploy:lambdas
```

### Add New Lambda Function
```bash
# 1. Create function
vim lambda/newFunction.js

# 2. Add to package-lambdas.js
vim scripts/package-lambdas.js

# 3. Add to deploy-all-lambdas.sh
vim scripts/deploy-all-lambdas.sh

# 4. Add env vars to lambda-env-config.json
vim infrastructure/lambda-env-config.json

# 5. Deploy
npm run package
npm run deploy:lambdas
```

### Add New DynamoDB Table
```bash
# 1. Edit table creation script
vim scripts/create-dynamodb-tables.sh

# 2. Add to table-config.js
vim lambda/shared/table-config.js

# 3. Create table
npm run deploy:tables

# 4. Export schema
npm run tables:export-schemas
```

### Add New GSI (⚠️ One at a time!)
```bash
# Create and run GSI script
bash scripts/gsi/add-gsi-template.sh \
  "construction-expenses-my-table" \
  "MyIndex" \
  "myField"
```

---

## ⚡ Quick Troubleshooting

### Lambda deployment failed
```bash
# Check logs
aws logs tail /aws/lambda/construction-expenses-FUNCTION_NAME --follow

# Check function exists
aws lambda get-function --function-name construction-expenses-FUNCTION_NAME
```

### CloudFormation stuck
```bash
# Check events
npm run stack:status

# Cancel update if needed
aws cloudformation cancel-update-stack --stack-name construction-expenses-production
```

### Table not found
```bash
# List all tables
aws dynamodb list-tables --query 'TableNames[?starts_with(@, `construction-expenses-`)]'

# Create tables
npm run deploy:tables
```

---

## 🔐 Required Environment Variables (for Lambda deployment)

```bash
export PADDLE_API_KEY="your_key"
export CLERK_SECRET_KEY="your_key"
# ... other secrets as needed
```

---

## 📊 Quick Status Check

```bash
# Everything in one view
npm run deploy:status

# Or individual components:
npm run stack:status        # CloudFormation
aws dynamodb list-tables    # DynamoDB
aws lambda list-functions   # Lambda
```

---

## 🌍 Multi-Environment

```bash
# Production (default)
npm run deploy

# Staging
ENVIRONMENT=staging npm run deploy

# Development
ENVIRONMENT=dev npm run deploy
```

---

## 🛑 Emergency Rollback

### Rollback Lambda
```bash
# Redeploy from backup
aws lambda update-function-code \
  --function-name construction-expenses-FUNCTION_NAME \
  --zip-file fileb://backup/FUNCTION_NAME.zip
```

### Rollback CloudFormation
```bash
# CloudFormation auto-rollback on failure
# Or cancel update:
aws cloudformation cancel-update-stack \
  --stack-name construction-expenses-production
```

---

## 📝 Files to Know

| File | Purpose |
|------|---------|
| `infrastructure/cloudformation-hybrid.yaml` | Infrastructure template |
| `scripts/deploy-hybrid-infrastructure.sh` | Master deployment script |
| `scripts/deploy-all-lambdas.sh` | Lambda deployment |
| `scripts/create-dynamodb-tables.sh` | Table creation |
| `infrastructure/lambda-env-config.json` | Environment variables |
| `lambda/shared/table-config.js` | Table name constants |

---

## ✅ Best Practices

- ✅ Always use scripts (never AWS Console)
- ✅ Export schemas weekly: `npm run tables:export-schemas`
- ✅ Test in staging before production
- ✅ Use environment variables for secrets
- ✅ Commit infrastructure changes to Git
- ❌ Never hardcode values
- ❌ Never create resources manually
- ❌ Never skip packaging: `npm run package`

---

## 🆘 Help

Full documentation:
- `infrastructure/DEPLOYMENT_GUIDELINES.md` - Complete guide
- `infrastructure/PHASE2-DYNAMODB-MANAGEMENT-COMPLETE.md` - DynamoDB details
- `infrastructure/PHASE3_IMPLEMENTATION_REPORT.md` - Lambda details
- `infrastructure/LAMBDA_DEPLOYMENT_GUIDE.md` - Lambda deployment

---

*Keep this file handy! 📌*
