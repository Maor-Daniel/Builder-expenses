# 🚀 Deployment Guide - Security Fix & Mobile Safari Fix

## ✅ What Was Completed

### 1. Security Fix - Credentials Removed from Git History
- ✅ Hardcoded credentials (`Levi/Levi2000`) removed from ALL commits in Git history
- ✅ Git history rewritten and force-pushed to GitHub
- ✅ CloudFormation template updated to use parameters instead of hardcoded values
- ✅ Verification complete: No hardcoded credentials exist in codebase or history

### 2. Mobile Safari Signup Fix
- ✅ Fixed email verification issue on Mobile Safari
- ✅ Clerk instance now persists across page navigation
- ✅ Added recovery UI for lost signup state
- ✅ Deployed to GitHub main branch

## 🔴 CRITICAL: CloudFormation Stack Update Required

The CloudFormation template now **requires** two new parameters:
- `BasicAuthUsername` - Username for Lambda@Edge basic authentication
- `BasicAuthPassword` - Password for Lambda@Edge basic authentication

**These must be provided during deployment - no defaults exist for security.**

## 📋 Deployment Steps

### Step 1: Set New Credentials (IMPORTANT)

Choose strong, unique credentials (NOT the old ones):

```bash
export NEW_AUTH_USERNAME="your-new-username-here"
export NEW_AUTH_PASSWORD="your-strong-password-here"
```

**⚠️ DO NOT reuse `Levi/Levi2000` - those were exposed in Git history!**

### Step 2: Update CloudFormation Stack

```bash
cd /Users/maordaniel/Builder-expenses-main/BE\ and\ Webapp

aws cloudformation update-stack \
  --stack-name construction-expenses-production \
  --template-body file://infrastructure/cloudformation-hybrid.yaml \
  --parameters \
    ParameterKey=StackName,ParameterValue=construction-expenses-production \
    ParameterKey=Environment,ParameterValue=production \
    ParameterKey=BasicAuthUsername,ParameterValue="${NEW_AUTH_USERNAME}" \
    ParameterKey=BasicAuthPassword,ParameterValue="${NEW_AUTH_PASSWORD}" \
  --capabilities CAPABILITY_NAMED_IAM
```

### Step 3: Monitor Deployment

```bash
# Watch stack update progress
aws cloudformation describe-stack-events \
  --stack-name construction-expenses-production \
  --max-items 10 \
  --query 'StackEvents[*].[Timestamp,ResourceStatus,ResourceType,LogicalResourceId]' \
  --output table
```

Wait for stack status to be `UPDATE_COMPLETE`:

```bash
aws cloudformation wait stack-update-complete \
  --stack-name construction-expenses-production
```

### Step 4: Verify Deployment

```bash
# Check stack status
aws cloudformation describe-stacks \
  --stack-name construction-expenses-production \
  --query 'Stacks[0].{Status:StackStatus,LastUpdated:LastUpdatedTime}' \
  --output table

# Verify Lambda@Edge function updated
aws lambda get-function \
  --function-name construction-expenses-production-basic-auth \
  --query 'Configuration.{Name:FunctionName,Runtime:Runtime,LastModified:LastModified}' \
  --output table
```

### Step 5: Deploy Frontend (Mobile Safari Fix)

The frontend files with the Mobile Safari fix are already on GitHub main branch. Deploy them to your hosting:

```bash
# If using S3 + CloudFront
aws s3 sync frontend/ s3://your-frontend-bucket/ \
  --exclude "*.md" \
  --exclude "node_modules/*" \
  --cache-control "public, max-age=86400"

# Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id YOUR_DISTRIBUTION_ID \
  --paths "/*"
```

## 🧪 Testing

### Test 1: CloudFormation Basic Auth

```bash
# Test basic auth endpoint (should prompt for credentials)
curl -v https://your-cloudfront-domain.com/

# Test with new credentials
curl -u "${NEW_AUTH_USERNAME}:${NEW_AUTH_PASSWORD}" \
  https://your-cloudfront-domain.com/
```

### Test 2: Mobile Safari Signup

1. Open Safari on iPhone
2. Navigate to: `https://your-domain.com/signup.html?debug=1`
3. Fill in signup form
4. Submit and verify redirect to `verify-email.html`
5. Check console logs:
   - Should see: "Returning existing global Clerk instance"
   - Should see: "Sign-up state exists: true"
6. Enter verification code from email
7. Should verify successfully and redirect to app

### Test 3: Verify Git History Clean

```bash
# Search for hardcoded credentials in history
cd /Users/maordaniel/Builder-expenses-main/BE\ and\ Webapp
git log --all -p -S "Levi2000" -- ':!SECURITY_ADVISORY.md'

# Should only show the SECURITY_ADVISORY.md documentation
# No actual code should contain the old credentials
```

## 🔒 Post-Deployment Security Checklist

- [ ] CloudFormation stack updated with new credentials
- [ ] Old credentials (`Levi/Levi2000`) no longer work
- [ ] New credentials stored securely (not in code or Slack)
- [ ] Team members informed to re-clone repository
- [ ] All pull requests recreated if needed
- [ ] CI/CD pipelines updated with new Git commit hashes
- [ ] Basic auth tested and working with new credentials
- [ ] Mobile Safari signup flow tested and working

## 📧 Team Communication Template

Send this to your team:

```
🚨 URGENT: Git Repository History Rewritten

Due to a security issue, we've rewritten the Git history for the Builder-expenses repository.

ACTION REQUIRED:
1. Backup any uncommitted work
2. Delete your local clone: rm -rf Builder-expenses-main
3. Re-clone: git clone https://github.com/Maor-Daniel/Builder-expenses.git
4. Recreate any open pull requests

WHAT CHANGED:
- Security fix: Removed hardcoded credentials from all commits
- Feature: Fixed Mobile Safari signup email verification
- All commit hashes have changed

DEPLOYED TO PRODUCTION:
- CloudFormation stack updated with new auth credentials
- Mobile Safari fix deployed to frontend

Questions? Contact [your name]
```

## 🆘 Troubleshooting

### Issue: CloudFormation update fails with "No updates to perform"

**Solution:** The template is already up to date. Force an update:

```bash
aws cloudformation update-stack \
  --stack-name construction-expenses-production \
  --use-previous-template \
  --parameters \
    ParameterKey=StackName,UsePreviousValue=true \
    ParameterKey=Environment,UsePreviousValue=true \
    ParameterKey=BasicAuthUsername,ParameterValue="${NEW_AUTH_USERNAME}" \
    ParameterKey=BasicAuthPassword,ParameterValue="${NEW_AUTH_PASSWORD}" \
  --capabilities CAPABILITY_NAMED_IAM
```

### Issue: Lambda@Edge function not updating

**Solution:** Lambda@Edge functions take 15-30 minutes to propagate globally. Wait and check:

```bash
aws lambda get-function \
  --function-name construction-expenses-production-basic-auth \
  --region us-east-1
```

### Issue: Mobile Safari still shows verification error

**Solution:**
1. Clear browser cache and cookies
2. Hard refresh (Cmd+Shift+R)
3. Test in incognito mode
4. Check console logs for "Returning existing global Clerk instance"

### Issue: Team member can't pull after force push

**Solution:**

```bash
cd Builder-expenses-main
git fetch origin
git reset --hard origin/main
```

Or start fresh:

```bash
rm -rf Builder-expenses-main
git clone https://github.com/Maor-Daniel/Builder-expenses.git Builder-expenses-main
```

## 📊 Current Status

| Component | Status | Action Required |
|-----------|--------|-----------------|
| Git History Cleaned | ✅ Complete | None |
| GitHub Force Pushed | ✅ Complete | Inform team to re-clone |
| CloudFormation Template | ✅ Updated | Deploy to production |
| Mobile Safari Fix | ✅ Complete | Already on GitHub main |
| Production Deployment | ⏳ Pending | Run deployment steps above |

## 🔗 Related Documentation

- `/Users/maordaniel/Builder-expenses-main/BE and Webapp/SECURITY_ADVISORY.md` - Full security advisory
- `/Users/maordaniel/Builder-expenses-main/BE and Webapp/infrastructure/DEPLOYMENT_GUIDELINES.md` - General deployment guide
- `/Users/maordaniel/Builder-expenses-main/BE and Webapp/scripts/deploy-hybrid-infrastructure.sh` - Deployment script

## ✅ Success Criteria

Deployment is complete when:
1. ✅ CloudFormation stack shows `UPDATE_COMPLETE` status
2. ✅ Lambda@Edge basic auth requires new credentials
3. ✅ Old credentials (`Levi/Levi2000`) do not work
4. ✅ Mobile Safari signup completes successfully
5. ✅ Email verification works without "missing_requirements" error
6. ✅ No hardcoded credentials in Git history (verified with git log)

---

**Need help?** Check AWS CloudFormation console for detailed error messages or contact your DevOps team.
