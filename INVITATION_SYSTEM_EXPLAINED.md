# Invitation System - Complete Explanation

**Date:** 2025-11-29
**Status:** 🟡 Functional but in SES Sandbox Mode

---

## How the Invitation System Works

### 1. **Invitation Flow (Step by Step)**

```
┌─────────────────┐
│  Admin User     │
│  (Your App)     │
└────────┬────────┘
         │
         │ 1. Clicks "Invite User"
         │    Fills form: email, role, message
         │
         ▼
┌─────────────────────────────┐
│  POST /inviteUser           │
│  Lambda Function            │
└────────┬────────────────────┘
         │
         │ 2. Creates invitation record in DynamoDB
         │    - Generates unique token (UUID)
         │    - Sets expiration (7 days)
         │    - Status: 'pending'
         │
         ▼
┌─────────────────────────────┐
│  AWS SES                    │
│  (Simple Email Service)     │
└────────┬────────────────────┘
         │
         │ 3. Sends email with invitation link
         │    From: maordtech@gmail.com
         │    To: invited user's email
         │    Link: https://your-app.com/accept-invitation?token={UUID}
         │
         ▼
┌─────────────────┐
│  Invited User   │
│  (Email Inbox)  │
└────────┬────────┘
         │
         │ 4. Clicks link in email
         │
         ▼
┌─────────────────────────────┐
│  GET /acceptInvitation      │
│  Lambda Function            │
└────────┬────────────────────┘
         │
         │ 5. Validates token
         │    - Checks if exists in DynamoDB
         │    - Checks if not expired
         │    - Checks if status is 'pending'
         │
         │ 6. Creates user in Clerk (if new)
         │    - Adds user to company
         │    - Assigns role
         │
         │ 7. Updates invitation status to 'accepted'
         │
         ▼
┌─────────────────┐
│  User logged in │
│  to the system  │
└─────────────────┘
```

---

## 2. **Email Sending via AWS SES**

### Current Configuration

**Service:** AWS SES (Simple Email Service)
**Region:** us-east-1
**Sender Email:** `maordtech@gmail.com` (verified ✅)
**SES Mode:** 🔴 **SANDBOX MODE** (IMPORTANT!)

### What is SES Sandbox Mode?

When your AWS account is new, SES starts in **Sandbox Mode** with limitations:

| Feature | Sandbox Mode | Production Mode |
|---------|--------------|-----------------|
| **Send to** | Only verified email addresses | Any email address |
| **Max emails/day** | 200 | 50,000+ (can request increase) |
| **Max send rate** | 1 email/second | 14 emails/second |
| **Domain verification** | Optional | Recommended |

### Current SES Status

```bash
✅ Sending enabled: true
✅ Verified sender: maordtech@gmail.com
✅ Max 24h send: 200 emails
✅ Send rate: 1 email/second
🔴 Production access: FALSE (SANDBOX MODE)

Verified Identities:
- maordtech@gmail.com ✅ Success
- maordaniel40@gmail.com ✅ Success
- builder-expenses.com ⚠️ TemporaryFailure
- noreply@yankale.com ✅ Success
```

---

## 3. **Critical Limitation: Sandbox Mode**

### What This Means RIGHT NOW:

**❌ You CANNOT invite users with unverified email addresses!**

For example:
- ✅ Can invite: `maordtech@gmail.com` (verified)
- ✅ Can invite: `maordaniel40@gmail.com` (verified)
- ❌ Cannot invite: `john@example.com` (not verified)
- ❌ Cannot invite: `employee@company.com` (not verified)

If you try to invite an unverified email, AWS SES will **reject** the email and it will never be sent.

---

## 4. **What You Need to Send Emails to ANY Email Address**

### Option A: Request Production Access (RECOMMENDED)

**Steps:**
1. Go to AWS SES Console → Account Dashboard
2. Click "Request production access"
3. Fill out the form:
   - **Use case:** User invitation system for construction expense tracking app
   - **Website URL:** https://builder-expenses.com
   - **How users sign up:** Admin invites team members
   - **How you handle bounces:** Monitor SES bounce notifications
   - **Compliance:** Confirm you follow best practices

**Approval Time:** Usually 24-48 hours

**Benefits:**
- ✅ Send to ANY email address
- ✅ Higher sending limits (50,000/day)
- ✅ Professional appearance
- ✅ Better deliverability

### Option B: Verify Each Email Individually (TESTING ONLY)

For each person you want to invite:
```bash
aws ses verify-email-identity --email-address user@example.com --region us-east-1
```

The recipient will receive a verification email from AWS and must click the link.

**This is only practical for testing with 2-3 people, not for production.**

---

## 5. **Using Your Custom Domain Email**

You have `builder-expenses.com` domain. Here's how to use it:

### Current Status
```
Domain: builder-expenses.com
Status: ⚠️ TemporaryFailure
Reason: DNS records not properly configured
```

### Steps to Fix Domain Verification

**1. Get the verification token:**
```
Verification Token: j8a8eGDRjZza3hpjGW76Hgl1jKgn/g21mm+TO8oK554=
```

**2. Add TXT record to DNS:**
```
Type: TXT
Name: _amazonses.builder-expenses.com
Value: j8a8eGDRjZza3hpjGW76Hgl1jKgn/g21mm+TO8oK554=
TTL: 1800
```

**3. Wait for DNS propagation (15 minutes - 24 hours)**

**4. Once verified, you can send from:**
- `noreply@builder-expenses.com`
- `invitations@builder-expenses.com`
- `team@builder-expenses.com`
- Any address @builder-expenses.com

**5. Update Lambda environment variable:**
```bash
aws lambda update-function-configuration \
  --function-name construction-expenses-invite-user \
  --environment "Variables={FROM_EMAIL=noreply@builder-expenses.com}" \
  --region us-east-1
```

---

## 6. **Email Templates Used**

### Invitation Email (Hebrew)

**Subject:** `הזמנה להצטרף לחברת {companyName}`

**Content:**
- Professional HTML email with RTL support
- Company name
- User's assigned role (Admin/Manager/Editor/Viewer)
- Personal message (optional)
- Clickable "Accept Invitation" button
- Invitation link with 7-day expiration notice
- Hebrew language throughout

**Key Fields in Email:**
- `invitationUrl`: `https://your-app.com/accept-invitation?token={UUID}`
- `companyName`: From DynamoDB Companies table
- `role`: User's assigned role
- `personalMessage`: Optional message from inviter

### Resend Invitation Email

Same as above but with:
- **Subject prefix:** "שליחה מחדש:" (Resend:)
- **Yellow banner:** Indicates this is a resent invitation
- **Attempt counter:** Shows how many times email was sent (max 5)

---

## 7. **Database Structure**

### Invitations Table (DynamoDB)

**Table:** `construction-expenses-invitations`
**Primary Key:** `companyId` (HASH) + `invitationId` (RANGE)

**Fields:**
```javascript
{
  companyId: "uuid",           // Company that sent invitation
  invitationId: "uuid",        // Also used as token in URL
  email: "user@example.com",   // Invited user's email
  role: "admin|manager|editor|viewer",
  personalMessage: "...",      // Optional
  status: "pending|accepted|cancelled|expired",
  invitedBy: "userId",         // Admin who sent invitation
  createdAt: "ISO timestamp",
  expiresAt: "ISO timestamp",  // 7 days from creation

  // Email tracking
  emailSent: true/false,
  lastEmailSent: "ISO timestamp",
  emailAttempts: 3,            // How many times sent
  emailError: "...",           // Last error (if any)

  // Acceptance tracking
  acceptedBy: "userId",
  acceptedAt: "ISO timestamp",

  // Resend tracking
  resentBy: "userId",
  resentAt: "ISO timestamp"
}
```

---

## 8. **Lambda Functions Involved**

### inviteUser.js
- **Purpose:** Create invitation and send initial email
- **Permissions Required:**
  - ✅ Admin role only
  - ✅ DynamoDB PutItem on Invitations table
  - ✅ DynamoDB GetItem on Companies table
  - ✅ SES SendEmail permission
- **Validations:**
  - Email format
  - Role is valid
  - User limit not exceeded (subscription plan)
  - Email not already invited/member

### resendInvitation.js
- **Purpose:** Resend email for pending invitation
- **Path:** `POST /resendInvitation/{token}`
- **Permissions Required:**
  - ✅ Admin role only
  - ✅ Same as inviteUser
- **Validations:**
  - Token exists
  - Status is 'pending'
  - Not expired
  - Not exceeded max resend attempts (5)

### cancelInvitation.js
- **Purpose:** Cancel pending invitation
- **Path:** `DELETE /cancelInvitation/{token}`
- **Permissions Required:**
  - ✅ Admin role only
  - ✅ DynamoDB UpdateItem on Invitations table
- **Validations:**
  - Token exists
  - Status is 'pending'

### acceptInvitation.js
- **Purpose:** Process invitation acceptance
- **Path:** `GET /acceptInvitation?token={token}`
- **Public:** Yes (no auth required initially)
- **Process:**
  1. Validate token
  2. Create/update user in Clerk
  3. Add user to company
  4. Update invitation status
  5. Return success with redirect URL

---

## 9. **API Gateway Configuration**

```
Endpoint: https://2woj5i92td.execute-api.us-east-1.amazonaws.com/prod

Routes:
┌────────────────────────────────────┬──────────┬──────────────────┐
│ Path                               │ Method   │ Authorization    │
├────────────────────────────────────┼──────────┼──────────────────┤
│ /inviteUser                        │ POST     │ CUSTOM (Clerk)   │
│ /listInvitations                   │ GET      │ CUSTOM (Clerk)   │
│ /resendInvitation/{token}          │ POST     │ CUSTOM (Clerk)   │
│ /cancelInvitation/{token}          │ DELETE   │ CUSTOM (Clerk)   │
│ /acceptInvitation                  │ GET      │ NONE (Public)    │
└────────────────────────────────────┴──────────┴──────────────────┘

Latest Deployment: b20ycn (2025-11-29)
```

---

## 10. **Common Issues & Solutions**

### Issue 1: Email Not Received

**Possible Causes:**
1. 🔴 **SES Sandbox Mode** - Recipient email not verified
2. Email in spam folder
3. SES sending quota exceeded (200/day)
4. Invalid email address
5. SES temporary failure

**Solutions:**
1. Request production access (see Option A above)
2. Check spam/junk folder
3. Check SES metrics in AWS Console
4. Validate email format
5. Check Lambda CloudWatch logs

### Issue 2: 403 Error on Resend/Cancel

**Cause:** API Gateway deployment was stale

**Solution:** ✅ FIXED - Created new deployment (b20ycn)

### Issue 3: Domain Verification Failure

**Cause:** builder-expenses.com has TemporaryFailure status

**Solution:** Add TXT record to DNS (see section 5)

### Issue 4: "Maximum resend limit reached"

**Cause:** Email sent 5 times already

**Solution:**
- Create new invitation
- OR ask admin to cancel and re-invite

---

## 11. **Current Status Summary**

| Component | Status | Note |
|-----------|--------|------|
| **Lambda Functions** | ✅ Deployed | All 5 functions working |
| **API Gateway** | ✅ Deployed | Fresh deployment (b20ycn) |
| **SES Sending** | ✅ Enabled | Verified: maordtech@gmail.com |
| **SES Production** | 🔴 Sandbox | **Must request production access** |
| **Domain Verification** | ⚠️ Failed | DNS TXT record needed |
| **CORS** | ✅ Configured | All origins allowed |
| **Authorization** | ✅ Working | Clerk JWT validation |
| **Database** | ✅ Working | DynamoDB tables configured |

---

## 12. **Recommended Next Steps**

### Immediate (Testing Phase)
1. ✅ Verify test emails in SES:
   ```bash
   aws ses verify-email-identity --email-address test@example.com --region us-east-1
   ```
2. Test invitation flow with verified emails only

### Short-term (Production Ready)
1. **Request SES Production Access** (24-48 hours)
   - AWS Console → SES → Account Dashboard → Request production access
2. **Fix Domain Verification**
   - Add TXT record to builder-expenses.com DNS
3. **Update FROM_EMAIL** to use domain:
   - Change to `noreply@builder-expenses.com`

### Long-term (Monitoring)
1. Set up SES bounce/complaint handling
2. Add email delivery tracking in DynamoDB
3. Set up CloudWatch alarms for email failures
4. Implement retry logic for failed emails

---

## 13. **Testing the System**

### Test with Verified Email (Works Now)

```bash
# Invite a verified email
POST /inviteUser
{
  "email": "maordaniel40@gmail.com",  // Must be verified in SES
  "role": "manager",
  "personalMessage": "Welcome to the team!"
}

# Check email inbox
# Click invitation link
# Should successfully create account
```

### Test with Unverified Email (Will Fail)

```bash
# Invite an unverified email
POST /inviteUser
{
  "email": "someone@gmail.com",  // NOT verified in SES
  "role": "editor"
}

# Result: Lambda returns success (invitation created in DB)
# BUT: Email will NOT be sent (SES silently rejects in sandbox)
# User will never receive the email
```

---

## Summary

**Your invitation system is fully implemented and working!**

The ONLY limitation right now is **AWS SES Sandbox Mode**, which restricts sending to verified emails only.

**To send emails to anyone:**
→ Request production access in AWS SES Console
→ Approval takes 24-48 hours
→ Then you can invite anyone!

**For professional appearance:**
→ Fix builder-expenses.com domain verification
→ Update FROM_EMAIL to noreply@builder-expenses.com
