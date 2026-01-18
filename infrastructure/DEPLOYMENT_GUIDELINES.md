# Infrastructure Deployment Guidelines

## Overview

This project uses a **hybrid infrastructure approach** that balances the benefits of infrastructure-as-code with operational flexibility:

- **CloudFormation** manages foundational, long-lived resources
- **AWS CLI** manages operational, frequently-changing resources

This separation allows rapid iteration on application code while maintaining declarative infrastructure management for core services.

---

## Architecture Boundaries

### CloudFormation Manages (Foundational Resources)

**Philosophy**: Immutable, long-lived resources that rarely change

- ✅ **Cognito User Pool & Client** - Authentication foundation
- ✅ **IAM Roles** - Lambda execution role with wildcard permissions for `construction-expenses-*` tables
- ✅ **API Gateway** - Base configuration, authorizer, CORS
- ✅ **S3 Bucket** - Frontend hosting (if applicable)
- ✅ **CloudFront Distribution** - CDN with Lambda@Edge (if applicable)

**Why CloudFormation?**
- Declarative infrastructure-as-code
- Easy environment replication (staging, dev)
- Built-in rollback on failure
- Version controlled in Git

### AWS CLI Manages (Operational Resources)

**Philosophy**: Mutable, frequently changing resources

- ✅ **DynamoDB Tables (13 tables)** - Schema evolution without stack dependencies
- ✅ **DynamoDB GSIs** - DynamoDB limitation: only 1 GSI change per operation
- ✅ **Lambda Functions (53+ functions)** - Rapid code deployment without stack updates
- ✅ **Lambda Environment Variables** - Function-specific configuration

**Why AWS CLI?**
- Fast iteration on Lambda code (no CloudFormation update needed)
- DynamoDB GSI changes happen independently
- Table schema evolution doesn't block other infrastructure changes
- Already working deployment pipeline

---

## Quick Reference

### Deploy Everything (Full Deployment)

```bash
npm run deploy
# or
npm run deploy:full  # Includes frontend sync
```

### Deploy Only Infrastructure (CloudFormation)

```bash
npm run deploy:infra
# or
bash scripts/deploy-hybrid-infrastructure.sh cloudformation
```

### Deploy Only Lambda Functions

```bash
npm run deploy:lambdas
# or
npm run package && npm run deploy:lambda
```

### Deploy Only DynamoDB Tables

```bash
npm run deploy:tables
# or
bash scripts/create-dynamodb-tables.sh production us-east-1
```

### Check Deployment Status

```bash
npm run deploy:status
# or
npm run stack:status
npm run stack:outputs
```

---

## Detailed Deployment Workflows

### 1. Initial Environment Setup

When setting up a **new environment** (staging, dev):

```bash
# 1. Deploy CloudFormation stack
npm run deploy:infra

# 2. Create DynamoDB tables
npm run deploy:tables

# 3. Package and deploy Lambda functions
npm run package
npm run deploy:lambdas

# 4. Verify deployment
npm run deploy:status
```

### 2. Code Changes (Lambda Functions)

When you **modify Lambda code**:

```bash
# 1. Package Lambda functions
npm run package

# 2. Deploy Lambda functions
npm run deploy:lambdas
```

**No CloudFormation update needed!** This is the key benefit of the hybrid approach.

### 3. Infrastructure Changes (Cognito, IAM, API Gateway)

When you **modify foundational infrastructure**:

```bash
# 1. Update infrastructure/cloudformation-hybrid.yaml
vim infrastructure/cloudformation-hybrid.yaml

# 2. Deploy CloudFormation update
npm run deploy:infra
```

**Lambda functions continue running during update** (zero downtime).

### 4. Database Schema Changes

#### Adding a New Table

```bash
# 1. Add table definition to scripts/create-dynamodb-tables.sh
vim scripts/create-dynamodb-tables.sh

# 2. Add table constant to lambda/shared/table-config.js
vim lambda/shared/table-config.js

# 3. Create the table
npm run deploy:tables

# 4. Document schema
npm run tables:export-schemas
```

#### Adding a New GSI

**IMPORTANT**: DynamoDB allows only **1 GSI change per operation**.

```bash
# 1. Create a specific script for this GSI
cat > scripts/gsi/add-user-email-index.sh << 'EOF'
#!/bin/bash
bash scripts/gsi/add-gsi-template.sh \
  "construction-expenses-company-users" \
  "EmailIndex" \
  "email"
EOF

# 2. Make it executable
chmod +x scripts/gsi/add-user-email-index.sh

# 3. Run it
bash scripts/gsi/add-user-email-index.sh

# 4. Wait for ACTIVE (script handles this automatically)
```

### 5. Environment Variables for Lambda

When you **add or change Lambda environment variables**:

```bash
# 1. Update infrastructure/lambda-env-config.json
vim infrastructure/lambda-env-config.json

# 2. Redeploy affected Lambda functions
npm run deploy:lambdas
```

---

## Adding New Components

### Adding a New Lambda Function

1. **Create the Lambda function file**:
   ```bash
   touch lambda/myNewFunction.js
   ```

2. **Add to packaging script** (`scripts/package-lambdas.js`):
   ```javascript
   const LAMBDA_FUNCTIONS = [
     // ... existing functions
     'myNewFunction'
   ];
   ```

3. **Add environment variables** (`infrastructure/lambda-env-config.json`):
   ```json
   {
     "functions": {
       "myNewFunction": {
         "TABLE_NAME": "construction-expenses-my-table",
         "SOME_CONFIG": "value"
       }
     }
   }
   ```

4. **Add to deployment script** (`scripts/deploy-all-lambdas.sh`):
   ```bash
   deploy_lambda "myNewFunction" "construction-expenses-myNewFunction" '{
     "TABLE_NAME": "construction-expenses-my-table",
     "SOME_CONFIG": "value"
   }'
   ```

5. **Deploy**:
   ```bash
   npm run package
   npm run deploy:lambdas
   ```

### Adding a New DynamoDB Table

1. **Add to table creation script** (`scripts/create-dynamodb-tables.sh`):
   ```bash
   create_table_if_not_exists \
     "${PREFIX}-my-new-table" \
     '{
       "TableName": "'"${PREFIX}-my-new-table"'",
       "KeySchema": [
         {"AttributeName": "id", "KeyType": "HASH"}
       ],
       "AttributeDefinitions": [
         {"AttributeName": "id", "AttributeType": "S"}
       ],
       "BillingMode": "PAY_PER_REQUEST"
     }'
   ```

2. **Add to table config** (`lambda/shared/table-config.js`):
   ```javascript
   const TABLE_NAMES = {
     // ... existing tables
     MY_NEW_TABLE: `${PREFIX}-my-new-table`
   };
   ```

3. **Create the table**:
   ```bash
   npm run deploy:tables
   ```

4. **Export schema**:
   ```bash
   npm run tables:export-schemas
   ```

---

## Best Practices

### Prevent Infrastructure Drift

❌ **DON'T**:
- Create resources manually in AWS Console
- Edit Lambda code in AWS Console
- Modify tables directly without updating scripts

✅ **DO**:
- Always use scripts for reproducibility
- Version control all infrastructure code
- Document changes in commit messages
- Export schemas weekly: `npm run tables:export-schemas`

### Environment Management

```bash
# Production (default)
npm run deploy

# Staging
ENVIRONMENT=staging npm run deploy

# Development
ENVIRONMENT=dev npm run deploy
```

### Secret Management

**Never hardcode secrets!** Use environment variables:

```bash
# Set secrets before deployment
export PADDLE_API_KEY="your_key"
export CLERK_SECRET_KEY="your_key"

# Deploy (secrets will be injected)
npm run deploy:lambdas
```

### Zero-Downtime Deployments

The hybrid approach enables zero-downtime deployments:

1. **Lambda updates**: Functions are updated individually
2. **CloudFormation updates**: Stack updates don't affect running Lambdas
3. **Table schema evolution**: New tables/GSIs don't affect existing queries

---

## Troubleshooting

### CloudFormation Stack Update Failed

```bash
# Check stack events
aws cloudformation describe-stack-events \
  --stack-name construction-expenses-production \
  --max-items 10

# Rollback if needed
aws cloudformation cancel-update-stack \
  --stack-name construction-expenses-production
```

### Lambda Deployment Failed

```bash
# Check specific function
aws lambda get-function \
  --function-name construction-expenses-myFunction

# View logs
aws logs tail /aws/lambda/construction-expenses-myFunction --follow
```

### DynamoDB Table Creation Failed

```bash
# Check table status
aws dynamodb describe-table \
  --table-name construction-expenses-my-table

# Check if table exists
aws dynamodb list-tables \
  --query 'TableNames[?starts_with(@, `construction-expenses-`)]'
```

### GSI Creation Stuck

GSI creation can take several minutes. Check status:

```bash
aws dynamodb describe-table \
  --table-name construction-expenses-my-table \
  --query 'Table.GlobalSecondaryIndexes[*].[IndexName,IndexStatus]' \
  --output table
```

---

## Common Use Cases

### Scenario 1: Bug Fix in Lambda Function

```bash
# 1. Fix the bug in lambda/myFunction.js
vim lambda/myFunction.js

# 2. Deploy (fast - no packaging needed if just editing)
npm run deploy:lambdas
```

**Time**: ~30 seconds per function

### Scenario 2: Add New API Endpoint

```bash
# 1. Create Lambda function
vim lambda/myNewEndpoint.js

# 2. Add to packaging and deployment scripts
vim scripts/package-lambdas.js
vim scripts/deploy-all-lambdas.sh

# 3. Deploy
npm run package
npm run deploy:lambdas
```

**Time**: ~2 minutes

### Scenario 3: Update Cognito Password Policy

```bash
# 1. Update CloudFormation template
vim infrastructure/cloudformation-hybrid.yaml

# 2. Deploy infrastructure update
npm run deploy:infra
```

**Time**: ~5-10 minutes (CloudFormation update)

### Scenario 4: Staging Environment Setup

```bash
# 1. Deploy CloudFormation
ENVIRONMENT=staging npm run deploy:infra

# 2. Create tables
ENVIRONMENT=staging npm run deploy:tables

# 3. Deploy Lambda functions
ENVIRONMENT=staging npm run deploy:lambdas
```

**Time**: ~15 minutes (first-time setup)

---

## Monitoring & Maintenance

### Weekly Maintenance Tasks

```bash
# Export latest table schemas
npm run tables:export-schemas

# Check stack status
npm run deploy:status

# Review CloudFormation drift
aws cloudformation detect-stack-drift \
  --stack-name construction-expenses-production
```

### Monthly Review

1. Review IAM permissions
2. Check for unused Lambda functions
3. Review DynamoDB table capacity (if using provisioned)
4. Update Lambda runtime versions if needed
5. Review CloudWatch logs for errors

---

## CLI Commands Reference

### Master Deployment Script

```bash
# Full deployment
./scripts/deploy-hybrid-infrastructure.sh full

# CloudFormation only
./scripts/deploy-hybrid-infrastructure.sh cloudformation

# Tables only
./scripts/deploy-hybrid-infrastructure.sh tables

# Lambdas only
./scripts/deploy-hybrid-infrastructure.sh lambdas

# Status check
./scripts/deploy-hybrid-infrastructure.sh status

# With options
./scripts/deploy-hybrid-infrastructure.sh full --environment=staging
./scripts/deploy-hybrid-infrastructure.sh cloudformation --dry-run
./scripts/deploy-hybrid-infrastructure.sh lambdas --skip-package
```

### npm Scripts

| Command | Description |
|---------|-------------|
| `npm run deploy` | Full deployment (CloudFormation + Tables + Lambdas) |
| `npm run deploy:infra` | CloudFormation stack only |
| `npm run deploy:tables` | DynamoDB tables only |
| `npm run deploy:lambdas` | Lambda functions only |
| `npm run deploy:status` | Check deployment status |
| `npm run deploy:frontend` | Frontend S3 sync |
| `npm run package` | Package Lambda functions |
| `npm run tables:export-schemas` | Export all table schemas |
| `npm run tables:create` | Create DynamoDB tables |
| `npm run stack:status` | CloudFormation stack status |
| `npm run stack:outputs` | CloudFormation outputs |

---

## Migration from Old Approach

If migrating from the old `construction-expenses-simple` stack:

1. **Backup**: Export all data and configuration
2. **Delete old stack**: The new hybrid approach is incompatible
3. **Deploy new stack**: Follow "Initial Environment Setup" above
4. **Migrate data**: Use DynamoDB backup/restore or custom migration script
5. **Update frontend config**: New Cognito User Pool IDs

---

## Support & Resources

- **CloudFormation Template**: `infrastructure/cloudformation-hybrid.yaml`
- **Lambda Deployment**: `scripts/deploy-all-lambdas.sh`
- **Table Management**: `scripts/create-dynamodb-tables.sh`
- **GSI Management**: `scripts/gsi/add-gsi-template.sh`
- **Environment Config**: `infrastructure/lambda-env-config.json`

For questions or issues, refer to:
- Phase 2 Report: `infrastructure/PHASE2-DYNAMODB-MANAGEMENT-COMPLETE.md`
- Phase 3 Report: `infrastructure/PHASE3_IMPLEMENTATION_REPORT.md`
- Lambda Guide: `infrastructure/LAMBDA_DEPLOYMENT_GUIDE.md`

---

## Summary

**Key Takeaways**:
- CloudFormation for foundations, CLI for operations
- Fast Lambda deployments without stack updates
- Independent DynamoDB schema evolution
- Zero-downtime production deployments
- No hardcoded values anywhere
- Idempotent scripts for safety

**Next Steps**:
1. Familiarize yourself with `npm run deploy:status`
2. Test the deployment workflow in a dev environment
3. Set up CI/CD using these scripts
4. Document any custom GSI additions

---

*Last Updated: 2026-01-17*
*Infrastructure Version: Hybrid v1.0*
