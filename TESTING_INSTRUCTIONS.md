# Tier Enforcement - Testing Instructions

## ✅ Deployment Status

### Frontend - DEPLOYED
- ✅ index.html, app.html, clerk-auth.js
- ✅ CloudFront cache invalidated
- ✅ Live at: https://d6dvynagj630i.cloudfront.net

### Backend - DEPLOYED
All 5 tier enforcement lambdas deployed successfully:
- ✅ construction-expenses-company-expenses (17 MB) - Modified: 14:21 UTC
- ✅ construction-expenses-company-projects (17 MB) - Modified: 14:26 UTC
- ✅ construction-expenses-send-invitation (17 MB) - Modified: 14:27 UTC
- ✅ construction-expenses-accept-invitation (17 MB) - Modified: 14:27 UTC
- ✅ construction-expenses-remove-user (17 MB) - Modified: 14:28 UTC

---

## 🧪 How to Test Tier Enforcement

Your account (maordaniel40@gmail.com) is on **Trial tier** with these limits:
- **3 projects max** (you currently have 6)
- **50 expenses/month max**
- **1 user only** (no invitations)

### Test 1: Project Limit (Should Block 7th Project)

Since you already have 6 projects (over the limit), trying to add another should fail:

1. Go to: https://d6dvynagj630i.cloudfront.net/app.html
2. Login with: maordaniel40@gmail.com / 19735Maor
3. Click "פרויקטים" (Projects)
4. Click "+ הוסף פרויקט" (Add Project)
5. Fill in:
   - Name: "Test Limit Project"
   - Start Date: Today
   - Budget: 50000
6. Click "שמור" (Save)

**Expected Result**:
Error message saying: "הגעת למגבלת 3 פרויקטים פעילים בתוכנית ניסיון" (You've reached the limit of 3 active projects in the trial plan) with suggestion to upgrade to professional.

---

### Test 2: Expense Limit (After Creating 50 Expenses)

1. Go to "הוצאות" (Expenses)
2. Try creating your 51st expense this month
3. Fill in all required fields and submit

**Expected Result**:
Error message: "הגעת למגבלת 50 הוצאות בחודש בתוכנית ניסיון" with upgrade prompt.

---

### Test 3: User Invitation Limit (Should Block Immediately)

Trial tier only allows 1 user (you), so inviting anyone should fail:

1. Click on user management/invitations
2. Try to send an invitation to: test@example.com
3. Submit

**Expected Result**:
Error message: "הגעת למגבלת 1 משתמשים בתוכנית ניסיון" with upgrade to professional.

---

## 🔍 How to Verify It's Working

### Check Browser Console

1. Open DevTools (F12)
2. Go to Console tab
3. Try creating a project
4. You should see the API response with:
   ```json
   {
     "success": false,
     "message": "הגעת למגבלת 3 פרויקטים פעילים בתוכנית ניסיון",
     "data": {
       "reason": "PROJECT_LIMIT_REACHED",
       "currentUsage": 6,
       "limit": 3,
       "suggestedTier": "professional",
       "upgradeUrl": "/pricing.html"
     },
     "statusCode": 403
   }
   ```

### Check Network Tab

1. Open DevTools → Network tab
2. Try creating a project
3. Find the POST request to `/projects`
4. Click on it → Response tab
5. Should show 403 status with the limit error

---

## 🐛 Troubleshooting

### If You Don't See Error Messages:

**Check Lambda Logs**:
```bash
# Check project creation attempts
aws logs tail /aws/lambda/construction-expenses-company-projects --since 5m --region us-east-1

# Check expense creation attempts
aws logs tail /aws/lambda/construction-expenses-company-expenses --since 5m --region us-east-1
```

**Look for**:
- 403 responses
- "PROJECT_LIMIT_REACHED" or "EXPENSE_LIMIT_REACHED"
- Tier limit messages

---

## 📊 What the Tier System Does

### Trial Tier (Current)
- **Price**: Free for 30 days
- **Limits**: 3 projects, 50 expenses/month, 1 user
- **What happens**: After 30 days OR when limits reached → blocked from adding more

### Professional Tier
- **Price**: ₪200/month
- **Limits**: 10 projects, **unlimited expenses**, 3 users
- **Upgrade**: When you hit trial limits

### Enterprise Tier
- **Price**: ₪300/month
- **Limits**: **Unlimited projects & expenses**, 10 users
- **For**: Large construction companies

---

## ✅ Success Criteria

Tier enforcement is working correctly if:

1. **Project Limit Works**:
   - ✅ Can't create 7th project
   - ✅ Error message in Hebrew
   - ✅ Suggests upgrading to professional
   - ✅ Links to /pricing.html

2. **Expense Limit Works**:
   - ✅ Can create up to 50 expenses this month
   - ✅ 51st expense blocked with error
   - ✅ Counter resets automatically next month

3. **User Limit Works**:
   - ✅ Can't send invitations (trial = 1 user)
   - ✅ Error suggests professional tier

4. **Counters Work**:
   - ✅ Increment when creating resources
   - ✅ Decrement when deleting resources
   - ✅ Accurately track current usage

---

## 🔄 Next Steps

1. **Test all three limits** (projects, expenses, users)
2. **Check error messages** appear correctly in UI
3. **Verify counters** are accurate in DynamoDB
4. **Test upgrade flow** (when you implement payments)

---

## 📝 Quick Test Summary

| Test | Current Status | Expected Result |
|------|---------------|-----------------|
| Create 7th project | 6 projects exist | 403 - Limit reached |
| Create 51st expense | Unknown count | 403 - Limit reached |
| Send invitation | 1 user (you) | 403 - Limit reached |
| Delete project | Should decrement | Counter goes from 6→5 |
| Monthly reset | Dec 1st | Expense counter resets to 0 |

---

## 🎯 How to See Your Current Usage

**Option 1: Check Browser DevTools**
1. Open Console
2. Look for API responses when loading the app
3. Should show current project/expense counts

**Option 2: Query DynamoDB** (from command line)
```bash
# Get your company data
aws dynamodb get-item \
  --table-name Companies \
  --key '{"companyId":{"S":"YOUR_COMPANY_ID"}}' \
  --region us-east-1
```

You'll see:
- `subscriptionTier`: "trial"
- `currentProjects`: 6
- `currentMonthExpenses`: (current count)
- `currentUsers`: 1
- `expenseCounterResetDate`: (when counter resets)

---

**Test Account**: maordaniel40@gmail.com / 19735Maor
**API URL**: https://2woj5i92td.execute-api.us-east-1.amazonaws.com/production
**Frontend URL**: https://d6dvynagj630i.cloudfront.net
