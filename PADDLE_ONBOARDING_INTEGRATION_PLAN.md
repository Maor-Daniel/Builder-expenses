# Paddle + Onboarding Integration Plan

**Date**: November 22, 2025
**Status**: 📋 **PLANNING**

---

## Overview

This document outlines the complete integration between Paddle billing and the Clerk-based onboarding flow. Since your Paddle plans are already configured, we need to connect the dots between tier selection and actual payment processing.

---

## Current State Analysis

### ✅ What's Already Implemented

1. **Onboarding UI** (app.html):
   - Modal with company name input
   - Tier selection cards (Basic ₪100, Professional ₪200, Enterprise ₪300)
   - 30-day trial badges on all tiers
   - `submitOnboarding()` function calls `/register-company`

2. **Backend Company Creation** (registerCompanyClerk.js):
   - Creates company record in DynamoDB
   - Sets subscription tier
   - Sets 30-day trial period
   - Does NOT create Paddle subscription

3. **Paddle Infrastructure**:
   - `paddle-utils.js` with API integration ✅ (JUST UPDATED to match pricing)
   - `paddleWebhook.js` Lambda for webhook handling
   - DynamoDB tables for subscriptions/payments/customers
   - Webhook signature verification

### ❌ What's MISSING

1. **Paddle Checkout Integration** in onboarding flow
2. **Paddle Price IDs** from your dashboard (need actual IDs)
3. **Webhook handler deployment** and API Gateway configuration
4. **Database schema updates** (add Paddle fields to company record)
5. **Payment flow logic** (when to charge, when to start trial)

---

## Architecture Decision: Trial-First vs Payment-First

### Option A: Trial-First (RECOMMENDED) ✅

**Flow:**
1. User selects tier in onboarding
2. Backend creates company **immediately** with 30-day trial
3. Backend creates Paddle subscription **with trial**
4. No payment collected upfront
5. After 30 days, Paddle charges automatically

**Pros:**
- Frictionless signup (no credit card required)
- User can start using app immediately
- Lower abandonment rate
- Paddle handles trial→paid transition automatically

**Cons:**
- Need to enforce trial expiration if payment fails
- Some users might abuse trials (mitigate with email verification via Clerk)

### Option B: Payment-First

**Flow:**
1. User selects tier
2. Opens Paddle Checkout
3. User enters credit card
4. Paddle creates subscription with trial (card on file)
5. Backend creates company after payment method verified
6. No charge for 30 days, then automatic billing

**Pros:**
- Guaranteed payment method on file
- Lower risk of trial abuse

**Cons:**
- Higher abandonment rate (asking for card upfront)
- More complex onboarding flow

**RECOMMENDATION**: Go with **Option A (Trial-First)** since you already have user verification via Clerk email authentication.

---

## Implementation Plan

### Phase 1: Paddle Dashboard Configuration

#### Step 1.1: Create Products in Paddle

Go to your Paddle Dashboard → Catalog → Products

**Create 3 Products:**

1. **Basic Plan** (בסיסי):
   - Name: "Builder Expenses - Basic Plan"
   - Description: "For small construction companies"
   - Price: ₪100 ILS / month
   - Trial Period: 30 days
   - **Save Price ID** → e.g., `pri_01hsfjk2m3n4p5q6r7s8t9u0`

2. **Professional Plan** (מקצועי):
   - Name: "Builder Expenses - Professional Plan"
   - Description: "For growing construction companies"
   - Price: ₪200 ILS / month
   - Trial Period: 30 days
   - **Save Price ID** → e.g., `pri_01hsfjk2m3n4p5q6r7s8t9u1`

3. **Enterprise Plan** (ארגוני):
   - Name: "Builder Expenses - Enterprise Plan"
   - Description: "For large construction firms"
   - Price: ₪300 ILS / month
   - Trial Period: 30 days
   - **Save Price ID** → e.g., `pri_01hsfjk2m3n4p5q6r7s8t9u2`

**ACTION REQUIRED**:
After creating these products, add the actual Price IDs to `.env` or Lambda environment variables:

```bash
PADDLE_BASIC_PRICE_ID=pri_01hsfjk2m3n4p5q6r7s8t9u0       # <-- Your actual ID
PADDLE_PRO_PRICE_ID=pri_01hsfjk2m3n4p5q6r7s8t9u1          # <-- Your actual ID
PADDLE_ENTERPRISE_PRICE_ID=pri_01hsfjk2m3n4p5q6r7s8t9u2  # <-- Your actual ID
```

#### Step 1.2: Configure Webhook Endpoint

1. Go to Paddle Dashboard → Developer Tools → Notifications
2. Create new webhook destination:
   - URL: `https://2woj5i92td.execute-api.us-east-1.amazonaws.com/prod/webhook/paddle`
   - Events to subscribe:
     - ✅ `subscription.created`
     - ✅ `subscription.updated`
     - ✅ `subscription.canceled`
     - ✅ `subscription.trialing`
     - ✅ `transaction.completed`
     - ✅ `transaction.payment_failed`
3. **Save Webhook Secret** → Add to environment variables

#### Step 1.3: Get API Credentials

1. Go to Paddle Dashboard → Developer Tools → Authentication
2. Create API Key with these permissions:
   - `subscription:read`
   - `subscription:write`
   - `transaction:read`
   - `customer:read`
   - `customer:write`
3. **Save API Key** → Add to environment variables

---

### Phase 2: Backend Updates

#### Step 2.1: Update Company Schema

Add Paddle fields to company record (`COMPANY_TABLE_NAMES.COMPANIES`):

```javascript
{
  companyId: "user_xxxxx",
  name: "My Company",
  subscriptionTier: "basic",  // existing

  // NEW Paddle fields:
  paddleSubscriptionId: "sub_01hsfjk2m3n4p5q6r7s8t9u0",
  paddleCustomerId: "ctm_01hsfjk2m3n4p5q6r7s8t9u0",
  subscriptionStatus: "trialing", // trialing, active, past_due, canceled
  billingCycleAnchor: "2025-12-22T00:00:00Z", // When trial ends / next billing

  // Trial fields (existing):
  trialStartDate: "2025-11-22T00:00:00Z",
  trialEndDate: "2025-12-22T00:00:00Z",

  // Timestamps:
  createdAt: "2025-11-22T00:00:00Z",
  updatedAt: "2025-11-22T00:00:00Z"
}
```

#### Step 2.2: Update registerCompanyClerk.js

**Current flow:**
```javascript
1. Validate input
2. Create company record
3. Create admin user
4. Return success
```

**New flow with Paddle:**
```javascript
1. Validate input
2. Create Paddle customer
3. Create Paddle subscription with trial
4. Create company record (with Paddle IDs)
5. Create admin user
6. Return success
```

**Code changes needed** (`registerCompanyClerk.js`):

```javascript
const {
  createPaddleCustomer,
  SUBSCRIPTION_PLANS
} = require('./shared/paddle-utils');

exports.handler = async (event) => {
  // ... existing validation ...

  // Get Paddle Price ID for selected tier
  const tierPriceId = SUBSCRIPTION_PLANS[subscriptionTier.toUpperCase()].priceId;

  // Create Paddle customer and subscription
  let paddleSubscription;
  try {
    paddleSubscription = await createPaddleCustomer({
      companyName: companyName.trim(),
      email: userEmail,
      companyId: companyId,
      priceId: tierPriceId
    });
  } catch (error) {
    console.error('Paddle subscription creation failed:', error);
    return createErrorResponse(500, 'Failed to create subscription');
  }

  // Create company record with Paddle details
  const company = {
    companyId,
    name: companyName.trim(),
    subscriptionTier: subscriptionTier.toLowerCase(),

    // Paddle fields
    paddleSubscriptionId: paddleSubscription.id,
    paddleCustomerId: paddleSubscription.customer_id,
    subscriptionStatus: 'trialing', // Will be updated by webhook
    billingCycleAnchor: paddleSubscription.billing_cycle_anchor,

    // Trial period
    trialStartDate: timestamp,
    trialEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),

    // Timestamps
    createdAt: timestamp,
    updatedAt: timestamp
  };

  await dynamoOperation('put', {
    TableName: COMPANY_TABLE_NAMES.COMPANIES,
    Item: company
  });

  // ... rest of existing code ...
};
```

#### Step 2.3: Deploy Paddle Webhook Handler

**Deploy Lambda:**
```bash
cd /Users/maordaniel/Ofek

# Package webhook handler with dependencies
node scripts/package-lambdas.js  # Add paddleWebhook to the list

# Or manually:
cd lambda
zip -r ../dist/paddleWebhook.zip paddleWebhook.js shared/

# Deploy
aws lambda update-function-code \
  --function-name construction-expenses-paddle-webhook \
  --zip-file fileb://dist/paddleWebhook.zip \
  --region us-east-1

# Set environment variables
aws lambda update-function-configuration \
  --function-name construction-expenses-paddle-webhook \
  --environment "Variables={
    PADDLE_ENVIRONMENT=sandbox,
    PADDLE_API_KEY=your_actual_api_key,
    PADDLE_WEBHOOK_SECRET=your_actual_webhook_secret
  }" \
  --region us-east-1
```

**Create API Gateway endpoint:**
```bash
API_ID="2woj5i92td"
ROOT_RESOURCE_ID="sp5ue0etie"
REGION="us-east-1"

# Create /webhook resource
WEBHOOK_RESOURCE_ID=$(aws apigateway create-resource \
  --rest-api-id $API_ID \
  --parent-id $ROOT_RESOURCE_ID \
  --path-part "webhook" \
  --region $REGION \
  --query 'id' \
  --output text)

# Create /webhook/paddle resource
PADDLE_WEBHOOK_RESOURCE_ID=$(aws apigateway create-resource \
  --rest-api-id $API_ID \
  --parent-id $WEBHOOK_RESOURCE_ID \
  --path-part "paddle" \
  --region $REGION \
  --query 'id' \
  --output text)

# Create POST method
aws apigateway put-method \
  --rest-api-id $API_ID \
  --resource-id $PADDLE_WEBHOOK_RESOURCE_ID \
  --http-method POST \
  --authorization-type NONE \
  --region $REGION

# Create Lambda integration
aws apigateway put-integration \
  --rest-api-id $API_ID \
  --resource-id $PADDLE_WEBHOOK_RESOURCE_ID \
  --http-method POST \
  --type AWS_PROXY \
  --integration-http-method POST \
  --uri "arn:aws:apigateway:${REGION}:lambda:path/2015-03-31/functions/arn:aws:lambda:${REGION}:702358134603:function:construction-expenses-paddle-webhook/invocations" \
  --region $REGION

# Add Lambda permission
aws lambda add-permission \
  --function-name construction-expenses-paddle-webhook \
  --statement-id apigateway-paddle-webhook-post \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:${REGION}:702358134603:${API_ID}/*/POST/webhook/paddle" \
  --region $REGION

# Deploy API
aws apigateway create-deployment \
  --rest-api-id $API_ID \
  --stage-name prod \
  --region $REGION
```

#### Step 2.4: Update paddleWebhook.js to Handle Subscription Events

**Key events to handle:**

```javascript
// paddleWebhook.js
exports.handler = async (event) => {
  // Verify webhook signature
  const signature = event.headers['Paddle-Signature'];
  if (!verifyPaddleWebhook(event.body, signature)) {
    return createErrorResponse(401, 'Invalid webhook signature');
  }

  const webhookData = JSON.parse(event.body);
  const eventType = webhookData.event_type;

  switch (eventType) {
    case 'subscription.created':
      // Subscription created successfully
      await handleSubscriptionCreated(webhookData.data);
      break;

    case 'subscription.updated':
      // Subscription updated (plan change, payment method update)
      await handleSubscriptionUpdated(webhookData.data);
      break;

    case 'subscription.trialing':
      // Trial started
      await handleTrialStarted(webhookData.data);
      break;

    case 'subscription.activated':
      // Trial ended, subscription activated (first payment)
      await handleSubscriptionActivated(webhookData.data);
      break;

    case 'subscription.canceled':
      // Subscription canceled
      await handleSubscriptionCanceled(webhookData.data);
      break;

    case 'transaction.payment_failed':
      // Payment failed
      await handlePaymentFailed(webhookData.data);
      break;
  }

  return createResponse(200, { received: true });
};

async function handleSubscriptionCreated(data) {
  // Update company record with subscription status
  await dynamoOperation('update', {
    TableName: COMPANY_TABLE_NAMES.COMPANIES,
    Key: { companyId: data.custom_data.companyId },
    UpdateExpression: 'SET subscriptionStatus = :status, updatedAt = :now',
    ExpressionAttributeValues: {
      ':status': 'trialing',
      ':now': new Date().toISOString()
    }
  });
}

async function handleSubscriptionActivated(data) {
  // Trial ended, first payment collected
  await dynamoOperation('update', {
    TableName: COMPANY_TABLE_NAMES.COMPANIES,
    Key: { companyId: data.custom_data.companyId },
    UpdateExpression: 'SET subscriptionStatus = :status, updatedAt = :now',
    ExpressionAttributeValues: {
      ':status': 'active',
      ':now': new Date().toISOString()
    }
  });
}

// ... other handlers ...
```

---

### Phase 3: Frontend Updates (Optional)

The current onboarding flow doesn't need major changes since we're doing trial-first. However, you MAY want to add:

#### Option A: Keep Current Flow (Trial-First, No Card)
**No changes needed** - Backend handles Paddle subscription creation automatically.

#### Option B: Add Payment Method During Onboarding
**Integrate Paddle.js** to collect payment method (for future billing):

```html
<!-- In app.html, add Paddle.js SDK -->
<script src="https://cdn.paddle.com/paddle/v2/paddle.js"></script>

<script>
// Initialize Paddle
Paddle.Setup({
  environment: 'sandbox', // or 'production'
  token: 'your_client_side_token'
});

// Modified submitOnboarding function
async function submitOnboarding(event) {
  event.preventDefault();

  // ... existing validation ...

  // Option 1: Create subscription on backend (current approach)
  await registerCompanyWithPaddle(companyName, selectedTier);

  // Option 2: Open Paddle Checkout (collect payment method upfront)
  // Paddle.Checkout.open({
  //   items: [{ priceId: getPriceIdForTier(selectedTier), quantity: 1 }],
  //   customer: { email: currentUser.email },
  //   customData: { companyId: currentUser.id, companyName: companyName }
  // });
}
</script>
```

**RECOMMENDATION**: Keep current flow (Option A) for now. Add payment collection later if needed.

---

## Summary: What YOU Need to Do

### Immediate Actions (Paddle Dashboard):

1. **Create 3 Products** in Paddle:
   - Basic: ₪100/month, 30-day trial
   - Professional: ₪200/month, 30-day trial
   - Enterprise: ₪300/month, 30-day trial

2. **Copy Price IDs** from Paddle dashboard

3. **Create API Key** with subscription/customer permissions

4. **Create Webhook** pointing to: `https://2woj5i92td.execute-api.us-east-1.amazonaws.com/prod/webhook/paddle`

5. **Copy Webhook Secret**

### Configuration Updates:

**Update Lambda environment variables:**
```bash
PADDLE_ENVIRONMENT=sandbox
PADDLE_BASIC_PRICE_ID=pri_01hsfjk... # From Paddle dashboard
PADDLE_PRO_PRICE_ID=pri_01hsfjk...
PADDLE_ENTERPRISE_PRICE_ID=pri_01hsfjk...
PADDLE_API_KEY=xxx # From Paddle dashboard
PADDLE_WEBHOOK_SECRET=pdl_ntfset_xxx # From Paddle dashboard
```

### Code Changes Needed:

1. ✅ **paddle-utils.js** - DONE (updated to match current pricing)
2. ✅ **.env.paddle** - DONE (updated tier names)
3. ⏳ **registerCompanyClerk.js** - TODO (add Paddle subscription creation)
4. ⏳ **paddleWebhook.js** - TODO (verify/update webhook event handlers)
5. ⏳ **API Gateway** - TODO (create webhook endpoint)
6. ⏳ **Lambda deployment** - TODO (deploy updated Lambdas)

---

## Testing Plan

### Test 1: New User Signup with Paddle (Sandbox)

1. Create new Clerk account
2. Complete onboarding (select Basic tier)
3. Verify:
   - ✅ Company created in DynamoDB
   - ✅ Paddle subscription created (check Paddle dashboard)
   - ✅ `paddleSubscriptionId` set in company record
   - ✅ `subscriptionStatus = 'trialing'`
   - ✅ Webhook received (check CloudWatch logs)

### Test 2: Webhook Event Handling

1. Trigger test webhook from Paddle dashboard
2. Verify webhook signature verification works
3. Check company record updates correctly

### Test 3: Trial Expiration

1. Update trial end date to past date
2. Verify Paddle sends `subscription.activated` webhook
3. Verify company status changes from `trialing` to `active`
4. Verify payment collected in Paddle dashboard

---

## Next Steps

**Which approach do you want to take?**

### Approach A: Trial-First (Frictionless)
- User signs up → Company created immediately
- Paddle subscription created in background with trial
- No payment required upfront
- Paddle charges after 30 days automatically

### Approach B: Payment-First (Verified)
- User signs up → Selects tier → Enters payment method
- Paddle subscription created with card on file
- Trial still active (no charge for 30 days)
- Guaranteed payment method

**I recommend Approach A** since you already have email verification via Clerk.

Let me know:
1. Have you created the products in Paddle dashboard yet?
2. Do you have the Price IDs?
3. Should I proceed with implementing Approach A (Trial-First)?

---

**Document Version**: 1.0
**Status**: Awaiting user input on Paddle configuration
