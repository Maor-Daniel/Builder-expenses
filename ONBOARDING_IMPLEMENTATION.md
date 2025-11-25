# Onboarding Flow Implementation

**Date**: November 21, 2025
**Status**: ✅ **DEPLOYED**

---

## Overview

Implemented a complete onboarding flow for new Clerk users. When a user signs up with Clerk but hasn't created a company yet, they are prompted to:
1. Enter company name
2. Select subscription tier (Trial, Professional, Enterprise)
3. Create their company and start using the app

---

## What Was Implemented

### 1. Frontend Changes (app.html)

#### Onboarding Modal (Lines 1270-1350)
- **Welcome screen** with construction emoji and friendly message
- **Company name input** field with validation
- **Tier selection cards** with:
  - **Trial**: Free for 7 days, 1 user, 3 projects, 50 expenses
  - **Professional**: ₪200/month, 3 users, 10 projects, unlimited expenses (Recommended)
  - **Enterprise**: ₪300/month, 10 users, unlimited projects, priority support
- **Interactive tier selection** with visual feedback (border highlight, scale animation)
- **Form validation** ensuring company name and tier are selected
- **Loading state** during submission

#### JavaScript Functions (Lines 2778-2852)
- **`selectTier(tier)`**: Handles tier card selection with visual feedback
- **`submitOnboarding(event)`**: Handles form submission
  - Validates inputs
  - Calls `/register-company` API endpoint
  - Shows loading state
  - Displays success message
  - Loads app data after company creation
- **`showOnboardingModal()`**: Displays the onboarding modal

#### Modified loadAppData() (Lines 1482-1513)
- **Checks company existence** before loading data
- **Calls `/get-company` endpoint** first
- **Shows onboarding modal** if `companyExists: false`
- **Loads app data** only if company exists

---

### 2. Backend Changes

#### Updated getCompany.js
**Location**: `/Users/maordaniel/Ofek/lambda/getCompany.js`

**Key Changes**:
- Changed `getCompanyContextFromEvent()` to `getCompanyUserFromEvent()` for Clerk compatibility
- Returns `companyExists: false` when company not found (instead of 404 error)
- Added subscription tier and usage counters to response:
  - `subscriptionTier`
  - `currentProjects`
  - `currentUsers`
  - `currentMonthExpenses`

**Response Format**:
```json
{
  "success": true,
  "companyExists": false,  // New field for onboarding flow
  "message": "No company found - onboarding required",
  "userId": "user_xxxxx",
  "companyId": "user_user_xxxxx"
}
```

#### New registerCompanyClerk.js
**Location**: `/Users/maordaniel/Ofek/lambda/registerCompanyClerk.js`

**Purpose**: Clerk-based company registration (user already exists in Clerk)

**Features**:
- Extracts `companyId`, `userId`, `userEmail` from Clerk JWT
- Validates company name and subscription tier
- Checks if company already exists
- Creates company record with:
  - Company details (name, email, etc.)
  - Subscription tier
  - Usage counters initialization
  - Trial period dates (if trial tier selected)
- Creates admin user in `company-users` table
- Returns success response with company and user details

**Request**:
```json
{
  "companyName": "My Construction Company",
  "subscriptionTier": "trial" | "professional" | "enterprise"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Company created successfully",
  "company": {
    "id": "user_user_xxxxx",
    "name": "My Construction Company",
    "subscriptionTier": "trial",
    "createdAt": "2025-11-21T20:00:00.000Z"
  },
  "user": {
    "id": "user_xxxxx",
    "email": "user@example.com",
    "role": "admin"
  },
  "timestamp": "2025-11-21T20:00:00.000Z"
}
```

---

### 3. API Gateway Configuration

**Script**: `/Users/maordaniel/Ofek/scripts/deploy-onboarding-api.sh`

**Endpoints Created**:

#### GET /get-company
- **Lambda**: `construction-expenses-get-company`
- **Authorization**: Clerk JWT (Custom authorizer)
- **CORS**: Enabled
- **URL**: `https://2woj5i92td.execute-api.us-east-1.amazonaws.com/prod/get-company`

#### POST /register-company
- **Lambda**: `construction-expenses-register-company-clerk`
- **Authorization**: Clerk JWT (Custom authorizer)
- **CORS**: Enabled
- **URL**: `https://2woj5i92td.execute-api.us-east-1.amazonaws.com/prod/register-company`

---

### 4. Deployment Status

#### Lambda Functions
- ✅ `construction-expenses-get-company` - UPDATED (2025-11-21 20:16:00 UTC)
- ✅ `construction-expenses-register-company-clerk` - CREATED (2025-11-21 20:21:00 UTC)

#### API Gateway
- ✅ `/get-company` resource created (ID: worssf)
- ✅ `/register-company` resource created (ID: 6azz20)
- ✅ Deployment to `prod` stage (ID: ym5d4m)

#### Frontend
- ✅ `app.html` deployed to S3
- ✅ CloudFront cache invalidated (ID: IEZZN9FG9CW1650YBYLKBX1UFD)

---

## User Flow

### New User Signup Flow

1. **User signs up with Clerk**
   - Enters email and password
   - Completes Clerk registration

2. **User redirected to app**
   - `loadAppData()` is called
   - Calls `/get-company` endpoint

3. **No company exists**
   - Backend returns `companyExists: false`
   - Frontend shows onboarding modal

4. **User completes onboarding**
   - Enters company name
   - Selects subscription tier
   - Clicks "התחל עכשיו" (Start Now)

5. **Company created**
   - Frontend calls `/register-company` endpoint
   - Backend creates company and admin user records
   - Success message shown: "החברה נוצרה בהצלחה! ברוכים הבאים!"

6. **App loads normally**
   - `loadAppData()` is called again
   - Company exists, data loads successfully
   - User can start using the app

### Existing User Login Flow

1. **User logs in with Clerk**
   - Enters credentials
   - Clerk authenticates

2. **User redirected to app**
   - `loadAppData()` is called
   - Calls `/get-company` endpoint

3. **Company exists**
   - Backend returns `companyExists: true` with company data
   - App loads normally
   - No onboarding modal shown

---

## Testing Instructions

### Test New User Onboarding

1. **Create a new Clerk account**:
   - Go to: `https://d6dvynagj630i.cloudfront.net/hero.html`
   - Click "Sign Up"
   - Enter a NEW email address (not used before)
   - Complete registration

2. **Verify onboarding modal appears**:
   - After login, should see onboarding modal immediately
   - Modal should have:
     - Welcome message
     - Company name input
     - Three tier selection cards
     - Start button

3. **Complete onboarding**:
   - Enter company name (e.g., "Test Company ABC")
   - Click on a tier card (Trial, Professional, or Enterprise)
   - Verify tier card highlights with blue/green/purple border
   - Click "התחל עכשיו"
   - Wait for loading state

4. **Verify company created**:
   - Success message should appear
   - Modal should close
   - App should load with empty data (no expenses, projects, etc.)
   - Dashboard should show company name

5. **Verify persistence**:
   - Log out
   - Log back in with same account
   - Should NOT see onboarding modal again
   - Should see app directly

### Test Existing User (No Onboarding)

1. **Log in with existing account** (e.g., maordaniel40@gmail.com)
2. **Verify NO onboarding modal**
3. **Verify app loads normally** with existing data

### Verify Database Records

```bash
# Check company record
aws dynamodb get-item \
  --table-name construction-expenses-companies \
  --key '{"companyId": {"S": "user_user_XXXXX"}}' \
  --region us-east-1

# Check admin user record
aws dynamodb query \
  --table-name construction-expenses-company-users \
  --key-condition-expression "companyId = :cid" \
  --expression-attribute-values '{":cid": {"S": "user_user_XXXXX"}}' \
  --region us-east-1
```

### Verify Trial Period (If Trial Selected)

Expected company record for Trial tier:
```json
{
  "companyId": "user_user_XXXXX",
  "name": "Test Company ABC",
  "subscriptionTier": "trial",
  "currentProjects": 0,
  "currentUsers": 1,
  "currentMonthExpenses": 0,
  "trialStartDate": "2025-11-21T20:30:00.000Z",
  "trialEndDate": "2025-11-28T20:30:00.000Z"  // 7 days later
}
```

---

## Error Handling

### Frontend
- **No tier selected**: Shows error "אנא בחר תוכנית"
- **Empty company name**: HTML5 validation prevents submission
- **API call fails**: Shows error "שגיאה ביצירת החברה. נסה שוב."
- **Button state**: Disabled during submission with loading text

### Backend
- **Missing company name**: 400 error
- **Invalid tier**: 400 error
- **Company already exists**: 400 error "Company already exists for this user"
- **Database errors**: 500 error "Internal server error creating company"

---

## Security

- ✅ **Clerk JWT verification**: All endpoints use custom authorizer
- ✅ **Company isolation**: Each user can only create ONE company (check prevents duplicates)
- ✅ **Input validation**: Company name and tier validated on both frontend and backend
- ✅ **CORS configured**: Allows requests from CloudFront domain

---

## Known Limitations

1. **Single company per user**: Users can only create one company
   - If they try to register again, they get an error
   - May want to add "Company already exists" UI flow in future

2. **No payment integration yet**: Selecting Professional/Enterprise doesn't charge the card
   - Trial period logic is in place
   - Paddle integration needed for paid tiers

3. **No company switching**: Users can't switch between companies
   - companyId is derived from userId
   - Multi-company support would require architecture changes

---

## Next Steps (Future Enhancements)

1. **Add Paddle payment integration**:
   - Collect payment details for Professional/Enterprise
   - Create subscription in Paddle
   - Store subscription ID in company record

2. **Trial expiration handling**:
   - Add cron job to check trial expiration
   - Send warning emails before expiration
   - Downgrade/block access after expiration

3. **Company settings page**:
   - Allow editing company details
   - Upgrade/downgrade subscription tier
   - View usage statistics

4. **Invitation flow**:
   - Allow admin to invite team members
   - Send invitation emails
   - Team members join existing company

5. **Multi-company support** (optional):
   - Allow users to create/join multiple companies
   - Company switcher in navigation
   - Separate companyId from userId

---

## Files Modified

### Frontend
- `frontend/app.html`: Added onboarding modal and logic

### Backend
- `lambda/getCompany.js`: Updated for Clerk + onboarding support
- `lambda/registerCompanyClerk.js`: NEW - Clerk company registration

### Scripts
- `scripts/package-lambdas.js`: Added `registerCompanyClerk` to build list
- `scripts/deploy-onboarding-api.sh`: NEW - API Gateway deployment script

### Documentation
- `ONBOARDING_IMPLEMENTATION.md`: This file

---

## Rollback Plan (If Needed)

If onboarding flow has issues:

1. **Revert frontend**:
   ```bash
   git checkout HEAD~1 frontend/app.html
   aws s3 cp frontend/app.html s3://construction-expenses-production-frontend-702358134603/
   aws cloudfront create-invalidation --distribution-id E3EYFZ54GJKVNL --paths "/app.html"
   ```

2. **Disable new API routes** (don't delete, just remove from gateway):
   - API Gateway console → `/get-company` → Delete method
   - API Gateway console → `/register-company` → Delete method
   - Deploy changes

3. **Keep Lambda functions** (they don't hurt if not called)

---

## Support

For issues or questions:
1. Check CloudWatch logs for Lambda errors
2. Check browser console for frontend errors
3. Test API endpoints with Postman/curl
4. Verify DynamoDB records were created

**CloudWatch Log Groups**:
- `/aws/lambda/construction-expenses-get-company`
- `/aws/lambda/construction-expenses-register-company-clerk`
- `/aws/lambda/construction-expenses-clerk-authorizer`

---

**Document Version**: 1.0
**Last Updated**: 2025-11-21
**Status**: Production Ready ✅
