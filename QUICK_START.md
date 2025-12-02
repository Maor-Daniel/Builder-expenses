# AWS Secrets Manager - Quick Start Guide

## 🚀 Quick Deployment (30 minutes)

### Prerequisites Checklist
- [ ] AWS CLI configured (`aws sts get-caller-identity`)
- [ ] Clerk Secret Key (from Clerk Dashboard → API Keys)
- [ ] Clerk Webhook Secret (from Clerk Dashboard → Webhooks)
- [ ] Paddle Client Token (from Paddle Dashboard → Developer Tools)

### Step-by-Step Deployment

#### 1. Create Secrets (5-10 min)
```bash
cd /Users/maordaniel/Ofek
./scripts/setup-secrets-manager.sh
# Select option 1 (Interactive)
# Enter each secret when prompted
```

#### 2. Update IAM Policies (3-5 min)
```bash
./scripts/update-lambda-iam-policy.sh
# Script will auto-detect Lambda role and attach policy
```

#### 3. Deploy Lambda Functions (10-15 min)
```bash
# Package functions
npm run package

# Deploy to AWS
npm run deploy:lambda
```

#### 4. Test Deployment (5-10 min)
```bash
# Test authentication
curl -X GET https://YOUR_API_URL/production/company \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Check logs
aws logs tail /aws/lambda/construction-expenses-production-getCompany --follow
```

### Success Indicators
- ✅ Log message: "Clerk backend initialized successfully with secret from Secrets Manager"
- ✅ Log message: "Sentry initialized successfully with DSN from Secrets Manager"
- ✅ API returns 200 OK with valid data
- ✅ No "secret not found" errors

### If Something Goes Wrong

**Quick Rollback**:
```bash
# Restore previous deployment
git checkout HEAD~1 lambda/shared/clerk-auth.js lambda/clerk-authorizer.js
npm run package
npm run deploy:lambda
```

**Get Help**:
1. Check SECRETS_DEPLOYMENT_GUIDE.md → Troubleshooting section
2. View CloudWatch logs for error details
3. Verify secrets exist: `aws secretsmanager list-secrets`

---

## 📋 Required Secret Values

Before starting, have these ready:

| Secret | Where to Find | Example Format |
|--------|---------------|----------------|
| Clerk Secret Key | Clerk Dashboard → API Keys → Secret Keys | `sk_live_...` |
| Clerk Webhook Secret | Clerk Dashboard → Webhooks → Signing Secret | `whsec_...` |
| Paddle Client Token | Paddle Dashboard → Developer Tools → Authentication | `test_...` or `live_...` |

---

## 📚 Full Documentation

- **SECRET_INVENTORY.md** - Complete secret catalog and analysis
- **SECRETS_DEPLOYMENT_GUIDE.md** - Detailed deployment procedures
- **SECRETS_MIGRATION_COMPLETE.md** - Security audit and completion report

---

## ⚡ Commands Reference

### Check AWS Setup
```bash
# Verify credentials
aws sts get-caller-identity

# List existing secrets
aws secretsmanager list-secrets --region us-east-1 \
  --filters Key=name,Values="construction-expenses/"
```

### Monitor Deployment
```bash
# Watch all Lambda logs
aws logs tail /aws/lambda/construction-expenses-production-* \
  --follow --filter-pattern "ERROR"

# Check specific function
aws logs tail /aws/lambda/construction-expenses-production-getCompany \
  --follow --since 5m
```

### Verify IAM Policy
```bash
# Get Lambda role name
ROLE=$(aws cloudformation describe-stacks \
  --stack-name construction-expenses-production \
  --query 'Stacks[0].Outputs[?OutputKey==`LambdaExecutionRoleName`].OutputValue' \
  --output text)

# List attached policies
aws iam list-attached-role-policies --role-name "$ROLE"
```

---

## 🔒 Security Notes

- ✅ Never commit actual secret values to git
- ✅ Use interactive mode for entering secrets (hidden input)
- ✅ Keep .env.production.backup files for 30 days
- ✅ Rotate secrets every 90 days (Clerk/Paddle) or 180 days (Sentry)
- ✅ Monitor CloudWatch for "secret not found" errors

---

**Ready to deploy?** Start with Step 1 above! 🚀
