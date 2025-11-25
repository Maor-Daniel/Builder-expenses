# Deployment Summary - November 21, 2025

## ✅ Frontend Deployment - COMPLETE

### Files Deployed to S3:
- ✅ `index.html` (27 KB) - Updated landing/login page
- ✅ `app.html` (146 KB) - Main application interface
- ✅ `clerk-auth.js` (8.2 KB) - Clerk authentication utilities

### CloudFront:
- ✅ Cache invalidated (ID: ICL1GZU1YPHLY6PVWN6ERT4W78)
- ✅ Distribution: E3EYFZ54GJKVNL
- ✅ URL: https://d6dvynagj630i.cloudfront.net

**Status**: Changes will be live in 1-3 minutes after cache invalidation completes.

---

## ⏳ Backend Deployment - MANUAL UPLOAD REQUIRED

### Tier Enforcement Lambdas Ready (in `dist/` directory):

All lambdas are packaged and ready for deployment. Due to network connectivity issues with AWS CLI, please deploy manually via AWS Console:

#### Lambda Functions to Deploy:

1. **construction-expenses-company-expenses**
   - File: `dist/companyExpenses.zip` (16.2 MB)
   - Purpose: Enforce expense limits per tier (50/month for trial, unlimited for professional)
   - Changes: Added limit checking before expense creation, monthly counter auto-reset

2. **construction-expenses-company-projects**
   - File: `dist/companyProjects.zip` (16.2 MB)
   - Purpose: Enforce project limits per tier (3 for trial, 10 for professional, unlimited for enterprise)
   - Changes: Added limit checking before project creation

3. **construction-expenses-send-invitation**
   - File: `dist/sendInvitation.zip` (16.2 MB)
   - Purpose: Enforce user limits per tier (1 for trial, 3 for professional, 10 for enterprise)
   - Changes: Check user limit before sending invitation

4. **construction-expenses-accept-invitation**
   - File: `dist/acceptInvitation.zip` (16.2 MB)
   - Purpose: Increment user counter when invitation accepted
   - Changes: Atomically increment currentUsers counter

5. **construction-expenses-remove-user**
   - File: `dist/removeUser.zip` (16.2 MB)
   - Purpose: Decrement user counter when user removed
   - Changes: Atomically decrement currentUsers counter

### Manual Deployment Steps:

1. Go to: https://console.aws.amazon.com/lambda/
2. Region: `us-east-1`
3. For each function above:
   - Click function name
   - Go to "Code" tab
   - Click "Upload from" → ".zip file"
   - Select the corresponding zip file from your `dist/` folder
   - Click "Save"
   - Wait for "Successfully updated" message

### What's Implemented in These Lambdas:

**Tier Configuration** (`lambda/shared/tier-config.js`):
- Trial: ₪0/month - 1 user, 3 projects, 50 expenses/month
- Basic: ₪100/month - 1 user, 3 projects, 50 expenses/month
- Professional: ₪200/month - 3 users, 10 projects, unlimited expenses
- Enterprise: ₪300/month - 10 users, unlimited projects & expenses

**Limit Checking** (`lambda/shared/limit-checker.js`):
- Check limits before resource creation
- Return 403 with Hebrew error message when limit reached
- Suggest appropriate upgrade tier
- Monthly expense counter auto-reset logic
- Atomic increment/decrement of counters

**Hebrew Error Messages**:
- "הגעת למגבלת X פרויקטים פעילים בתוכנית Y"
- "הגעת למגבלת X הוצאות בחודש בתוכנית Y"
- "הגעת למגבלת X משתמשים בתוכנית Y"
- Includes upgrade URL: `/pricing.html`

---

## 🧪 Testing After Lambda Deployment

Once you've deployed all 5 lambdas, test with these commands:

### Test 1: Project Limit (Trial = 3 projects max)
```bash
# Login first to get token
# Then create 3 projects (should succeed)
# Then try creating 4th project (should fail with 403)

curl -X POST "https://2woj5i92td.execute-api.us-east-1.amazonaws.com/production/projects" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Project 4", "startDate": "2025-11-21"}'

# Expected: 403 error with message about upgrading to professional tier
```

### Test 2: Expense Limit (Trial = 50/month max)
```bash
# If you've already created 50 expenses this month:
curl -X POST "https://2woj5i92td.execute-api.us-east-1.amazonaws.com/production/expenses" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "YOUR_PROJECT_ID",
    "contractorId": "YOUR_CONTRACTOR_ID",
    "invoiceNum": "TEST-51",
    "amount": 100,
    "paymentMethod": "cash",
    "date": "2025-11-21"
  }'

# Expected: 403 error about expense limit
```

### Test 3: User Invitation Limit (Trial = 1 user only)
```bash
# Trial tier allows only 1 user, so 2nd invitation should fail:
curl -X POST "https://2woj5i92td.execute-api.us-east-1.amazonaws.com/production/invitations" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newuser@example.com",
    "role": "user",
    "name": "New User"
  }'

# Expected: 403 error suggesting upgrade
```

---

## 📋 Post-Deployment Checklist

- [x] Frontend deployed to S3
- [x] CloudFront cache invalidated
- [ ] Deploy 5 tier enforcement lambdas via AWS Console
- [ ] Test project limit enforcement
- [ ] Test expense limit enforcement
- [ ] Test user invitation limit enforcement
- [ ] Verify counters increment correctly
- [ ] Verify counters decrement correctly
- [ ] Verify monthly expense reset works

---

## 📁 Files Location

All deployment packages are in: `/Users/maordaniel/Ofek/dist/`

```bash
ls -lh dist/*.zip | grep -E "(companyExpenses|companyProjects|sendInvitation|acceptInvitation|removeUser)"
```

---

## 🔗 Important URLs

- **Frontend (CloudFront)**: https://d6dvynagj630i.cloudfront.net
- **API Gateway**: https://2woj5i92td.execute-api.us-east-1.amazonaws.com/production
- **AWS Lambda Console**: https://console.aws.amazon.com/lambda/ (Region: us-east-1)
- **Test Account**: maordaniel40@gmail.com / 19735Maor

---

## 📝 What Changed in This Deployment

### Frontend:
- Updated `index.html` - Login/landing page improvements
- New `app.html` - Main application interface
- New `clerk-auth.js` - Clerk authentication utilities

### Backend (Ready to Deploy):
- Tier enforcement system for projects, expenses, and users
- Atomic counter management (increment/decrement)
- Monthly expense counter auto-reset
- Hebrew error messages with upgrade prompts
- Tier limits matching pricing page exactly

---

## ⚠️ Known Issue

AWS CLI deployment failed due to network connectivity issues:
- Files are too large (16MB) for reliable upload over current connection
- Manual upload via AWS Console is more reliable
- All code is production-ready and tested locally

---

**Next Step**: Deploy the 5 lambda zip files via AWS Console, then run the tests to verify tier enforcement is working correctly.
