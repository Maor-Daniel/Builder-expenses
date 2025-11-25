# Tier Enforcement - Deployment & Testing Guide

## ✅ Implementation Status

### Completed
- ✅ Tier configuration system (`lambda/shared/tier-config.js`)
- ✅ Limit checking logic (`lambda/shared/limit-checker.js`)
- ✅ Expense limit enforcement in `companyExpenses.js`
- ✅ Project limit enforcement in `companyProjects.js`
- ✅ User limit enforcement in `sendInvitation.js`, `acceptInvitation.js`, `removeUser.js`
- ✅ Usage statistics endpoint (`lambda/getCompanyUsage.js`)
- ✅ All lambdas packaged successfully (in `dist/` directory)
- ✅ Local tests passing (`node test-tier-enforcement.js`)

### Deployment Blocked
- ❌ AWS Lambda deployment - network connection errors
  - Error: "Could not connect to the endpoint URL"
  - All 5 tier enforcement lambdas ready but not deployed

## 🚀 Deployment Instructions

### Option 1: Using Deployment Script (Recommended)
```bash
# Make sure all lambdas are packaged
node scripts/package-lambdas.js

# Deploy tier enforcement lambdas
bash scripts/deploy-tier-enforcement.sh
```

### Option 2: Manual Deployment via AWS Console
1. Go to AWS Lambda Console
2. For each lambda function:
   - `construction-expenses-company-expenses` → upload `dist/companyExpenses.zip`
   - `construction-expenses-company-projects` → upload `dist/companyProjects.zip`
   - `construction-expenses-send-invitation` → upload `dist/sendInvitation.zip`
   - `construction-expenses-accept-invitation` → upload `dist/acceptInvitation.zip`
   - `construction-expenses-remove-user` → upload `dist/removeUser.zip`

### Option 3: Deploy via S3 Bucket (For Large Files)
```bash
# Upload to S3 first
aws s3 cp dist/companyExpenses.zip s3://your-lambda-bucket/
aws s3 cp dist/companyProjects.zip s3://your-lambda-bucket/
aws s3 cp dist/sendInvitation.zip s3://your-lambda-bucket/
aws s3 cp dist/acceptInvitation.zip s3://your-lambda-bucket/
aws s3 cp dist/removeUser.zip s3://your-lambda-bucket/

# Then update lambdas from S3
aws lambda update-function-code \
  --function-name construction-expenses-company-expenses \
  --s3-bucket your-lambda-bucket \
  --s3-key companyExpenses.zip

# Repeat for other lambdas...
```

## 🧪 Testing Plan

### 1. Test Tier Configuration (Local)
```bash
node test-tier-enforcement.js
```
**Expected Output**: All tier limits displayed correctly, limit checks work as expected

### 2. Test Expense Limit Enforcement

**Setup:**
- Use test company with trial tier (50 expenses/month limit)
- Current test account: maordaniel40@gmail.com / 19735Maor

**Test Cases:**
```bash
# Case 1: Create 50 expenses (should succeed)
for i in {1..50}; do
  curl -X POST https://your-api/expenses \
    -H "Authorization: Bearer YOUR_TOKEN" \
    -d '{
      "projectId": "test-project",
      "contractorId": "test-contractor",
      "invoiceNum": "INV-'$i'",
      "amount": 100,
      "paymentMethod": "cash",
      "date": "2025-11-21"
    }'
done

# Case 2: Create 51st expense (should fail with 403)
curl -X POST https://your-api/expenses \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "projectId": "test-project",
    "contractorId": "test-contractor",
    "invoiceNum": "INV-51",
    "amount": 100,
    "paymentMethod": "cash",
    "date": "2025-11-21"
  }'

# Expected response:
# {
#   "success": false,
#   "message": "הגעת למגבלת 50 הוצאות בחודש בתוכנית ניסיון",
#   "data": {
#     "reason": "EXPENSE_LIMIT_REACHED",
#     "currentUsage": 50,
#     "limit": 50,
#     "suggestedTier": "professional",
#     "upgradeUrl": "/pricing.html"
#   },
#   "statusCode": 403
# }
```

### 3. Test Project Limit Enforcement

**Test Cases:**
```bash
# Case 1: Create 3 projects (should succeed)
for i in {1..3}; do
  curl -X POST https://your-api/projects \
    -H "Authorization: Bearer YOUR_TOKEN" \
    -d '{
      "name": "Project '$i'",
      "startDate": "2025-11-21"
    }'
done

# Case 2: Create 4th project (should fail with 403)
curl -X POST https://your-api/projects \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "Project 4",
    "startDate": "2025-11-21"
  }'

# Expected: 403 error with upgrade message
```

### 4. Test User Limit Enforcement

**Test Cases:**
```bash
# Case 1: Send invitation (should fail - trial tier allows only 1 user)
curl -X POST https://your-api/invitations \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "email": "newuser@example.com",
    "role": "user",
    "name": "New User"
  }'

# Expected: 403 error suggesting upgrade to professional
```

### 5. Test Usage Statistics Endpoint

**Note:** This endpoint needs to be added to API Gateway first

```bash
curl -X GET https://your-api/company/usage \
  -H "Authorization: Bearer YOUR_TOKEN"

# Expected response:
# {
#   "success": true,
#   "data": {
#     "usage": {
#       "tier": { "name": "trial", "displayName": "ניסיון" },
#       "projects": {
#         "current": 3,
#         "limit": 3,
#         "unlimited": false,
#         "percentage": 100
#       },
#       "expenses": {
#         "current": 50,
#         "limit": 50,
#         "unlimited": false,
#         "percentage": 100,
#         "resetDate": "2025-12-01T00:00:00.000Z"
#       },
#       "users": {
#         "current": 1,
#         "limit": 1,
#         "unlimited": false,
#         "percentage": 100
#       },
#       "subscription": {
#         "status": "trial",
#         "trialEndDate": "2025-12-21T...",
#         "subscriptionStartDate": null
#       }
#     }
#   }
# }
```

### 6. Test Counter Accuracy

**Test Cases:**
```bash
# Create a project
CREATE_RESPONSE=$(curl -X POST .../projects -d '{"name":"Test","startDate":"2025-11-21"}')
PROJECT_ID=$(echo $CREATE_RESPONSE | jq -r '.project.projectId')

# Check usage (should show 1 project)
curl -X GET .../company/usage

# Delete the project
curl -X DELETE .../projects?projectId=$PROJECT_ID

# Check usage again (should show 0 projects)
curl -X GET .../company/usage
```

### 7. Test Monthly Reset

**Test Cases:**
```bash
# Check current month expenses
curl -X GET .../company/usage

# Manually update expenseCounterResetDate to last month in DynamoDB
# Then create an expense - it should trigger monthly reset

# Verify counter was reset to 0 before incrementing
```

## 📋 Post-Deployment Checklist

- [ ] All 5 tier enforcement lambdas deployed successfully
- [ ] Expense limit test passes (blocked at 51st expense)
- [ ] Project limit test passes (blocked at 4th project)
- [ ] User limit test passes (blocked on 2nd invitation)
- [ ] Counters increment on resource creation
- [ ] Counters decrement on resource deletion
- [ ] Monthly expense counter resets properly
- [ ] Usage statistics endpoint returns correct data
- [ ] API Gateway `/company/usage` endpoint configured
- [ ] Frontend displays usage dashboard
- [ ] Upgrade prompts shown when limits reached

## ⚠️ Known Issues

### AWS Deployment Connection Errors
**Error**: "Could not connect to the endpoint URL: https://lambda.us-east-1.amazonaws.com..."

**Possible Causes:**
1. Network/firewall blocking AWS endpoints
2. AWS credentials expired or misconfigured
3. Region mismatch
4. Large file size causing timeouts

**Solutions to Try:**
1. Check AWS credentials: `aws configure list`
2. Test AWS connection: `aws lambda list-functions --region us-east-1 --max-items 1`
3. Try deploying via AWS Console manually
4. Use S3 bucket for large lambda packages
5. Check network/firewall settings
6. Retry with exponential backoff

## 🔄 Next Steps After Deployment

1. **API Gateway Configuration**
   - Add GET `/company/usage` endpoint
   - Map to `getCompanyUsage` lambda (needs to be created first)
   - Use Clerk authorizer
   - Enable CORS

2. **Database Migration**
   - Run migration script to add subscription fields to existing companies
   - Set all existing companies to 'trial' tier
   - Initialize counters based on current data

3. **Frontend Integration**
   - Create usage dashboard component
   - Add upgrade prompts when limits reached
   - Handle 403 errors gracefully
   - Display trial end date

4. **Monitoring**
   - Set up CloudWatch alarms for limit-reached events
   - Monitor counter accuracy
   - Track upgrade conversion rates

## 📝 Git Commits

1. `79740bc` - Implement subscription tier enforcement system
2. `45e7738` - Add company usage statistics endpoint
3. `515ba38` - docs: Add tier enforcement implementation status document
4. `669f7a0` - test: Add local tier enforcement tests and deployment script

## 🎯 Success Criteria

Tier enforcement is successfully deployed when:
- ✅ Trial companies cannot create more than 3 projects
- ✅ Trial companies cannot create more than 50 expenses per month
- ✅ Trial companies cannot invite additional users
- ✅ Professional tier has unlimited expenses
- ✅ Enterprise tier has unlimited projects and expenses
- ✅ Usage statistics API returns accurate data
- ✅ Counters increment/decrement correctly
- ✅ Monthly expense counter resets automatically
