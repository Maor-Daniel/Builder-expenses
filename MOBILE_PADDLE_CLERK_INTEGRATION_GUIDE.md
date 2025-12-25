# Paddle + Clerk Integration - Complete Guide

**How Payment Processing Works with Authentication**

---

## 🎯 Overview

The system uses **Clerk** for authentication and **Paddle** for payment processing. These two services work together seamlessly to handle user registration, company creation, and subscription management.

### Key Points
- **Clerk** = User authentication & identity (JWT tokens)
- **Paddle** = Payment processing & subscriptions
- **30-day trial** = Card required but not charged immediately
- **Webhook-based** = Company creation happens via Paddle webhook after payment validation

---

## 🏗️ Architecture

```
┌─────────────┐
│ Mobile App  │
└──────┬──────┘
       │
       │ 1. Sign Up
       ↓
┌─────────────┐
│   Clerk     │ ← User authentication
└──────┬──────┘
       │
       │ 2. Get JWT Token
       ↓
┌─────────────┐
│  Your API   │ ← Check if company exists
└──────┬──────┘
       │
       │ 3. No company → Get Paddle checkout config
       ↓
┌─────────────┐
│   Paddle    │ ← Payment validation (30-day trial)
└──────┬──────┘
       │
       │ 4. Webhook after payment validated
       ↓
┌─────────────┐
│  Your API   │ ← CREATE company & user records
│ (Webhook)   │
└──────┬──────┘
       │
       │ 5. Poll for company creation
       ↓
┌─────────────┐
│ Mobile App  │ ← Company created, load main app
└─────────────┘
```

---

## 🔄 Complete User Flow

### Step-by-Step Process

#### **Phase 1: User Signs Up (Clerk)**

```javascript
// Mobile app - User creates account
import { useSignUp } from '@clerk/clerk-expo';

const { signUp, setActive } = useSignUp();

// 1. User enters email, password
await signUp.create({
  emailAddress: "user@example.com",
  password: "SecurePass123"
});

// 2. Verify email (if required by Clerk settings)
await signUp.attemptEmailAddressVerification({ code: "123456" });

// 3. Create session
await setActive({ session: signUp.createdSessionId });

// ✅ User is now authenticated with Clerk
// Clerk JWT token is available via getToken()
```

**What happens:**
- User account created in Clerk
- User ID generated (e.g., `user_35IvSrgIwsi33cLFULPoiQHAnk9`)
- JWT token issued with claims:
  ```json
  {
    "sub": "user_35IvSrgIwsi33cLFULPoiQHAnk9",
    "email": "user@example.com",
    "exp": 1735123456,
    "iat": 1735119856
  }
  ```

---

#### **Phase 2: Check if Company Exists**

```javascript
// Mobile app - After successful sign-up
const { getToken } = useAuth();
const token = await getToken();

const response = await fetch(
  'https://2woj5i92td.execute-api.us-east-1.amazonaws.com/prod/get-company',
  {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  }
);

const data = await response.json();
// {
//   "success": true,
//   "companyExists": false,  ← NEW USER
//   "message": "No company found - onboarding required",
//   "userId": "user_35IvSrgIwsi33cLFULPoiQHAnk9",
//   "companyId": "user_35IvSrgIwsi33cLFULPoiQHAnk9"
// }
```

**What happens:**
- Lambda Authorizer validates JWT token (lines 30-162 in `clerk-authorizer.js`)
- API checks DynamoDB for company record
- Returns `companyExists: false` for new users
- **companyId = userId** (before company creation)

---

#### **Phase 3: Show Onboarding Screen**

```javascript
// Mobile app - Show tier selection
if (!data.companyExists) {
  // Show onboarding UI
  // User selects:
  // - Company name: "חברת בניין בע\"מ"
  // - Subscription tier: "professional" (₪200/month, 30-day trial)
}
```

**Subscription Tiers (from `paddle-utils.js` lines 36-88):**

| Tier | Price | Trial | Max Users | Max Projects | Expenses/Month |
|------|-------|-------|-----------|--------------|----------------|
| **starter** | ₪100/mo | 30 days | 1 | 3 | 50 |
| **professional** | ₪200/mo | 30 days | 3 | 10 | Unlimited |
| **enterprise** | ₪300/mo | 30 days | 10 | Unlimited | Unlimited |

---

#### **Phase 4: Get Paddle Checkout Configuration**

```javascript
// Mobile app - User submits onboarding form
const checkoutResponse = await fetch(
  'https://2woj5i92td.execute-api.us-east-1.amazonaws.com/prod/create-paddle-checkout',
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      companyName: "חברת בניין בע\"מ",
      subscriptionTier: "professional"
    })
  }
);

const checkoutData = await checkoutResponse.json();
// {
//   "success": true,
//   "paddleConfig": {
//     "token": "test_db12c8b3a07159acbe3dff44dba",
//     "priceId": "pri_01k9f1y03zd5f3cxwnnza118r2", // Professional tier
//     "environment": "sandbox",
//     "customerEmail": "user@example.com",
//     "customData": {
//       "companyId": "user_35IvSrgIwsi33cLFULPoiQHAnk9",
//       "userId": "user_35IvSrgIwsi33cLFULPoiQHAnk9",
//       "companyName": "חברת בניין בע\"מ",
//       "subscriptionTier": "professional",
//       "userEmail": "user@example.com"
//     }
//   },
//   "plan": {
//     "name": "Professional",
//     "price": 200,
//     "currency": "ILS",
//     "trialDays": 30
//   }
// }
```

**What happens (`createPaddleCheckout.js`):**
1. Validates Clerk JWT token via Lambda Authorizer
2. Extracts user info: `userId`, `companyId`, `userEmail`
3. Validates company name (1-200 chars)
4. Validates tier (`starter`, `professional`, `enterprise`)
5. Gets Paddle Price ID from `SUBSCRIPTION_PLANS` map
6. Prepares `customData` object (will be sent to Paddle and returned in webhooks)
7. Returns Paddle checkout configuration

**Critical: `customData` Object**
This object is **crucial** because it contains all the information needed to create the company when Paddle webhook fires:
- `companyId` - DynamoDB key
- `userId` - Admin user ID
- `companyName` - Company name to create
- `subscriptionTier` - Tier selection
- `userEmail` - User's email

---

#### **Phase 5: Open Paddle Checkout**

**For React Native (Web View approach):**

```javascript
import { WebView } from 'react-native-webview';

// Option 1: Use Paddle.js via WebView
const PaddleCheckout = ({ checkoutData, onSuccess, onCancel }) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <script src="https://cdn.paddle.com/paddle/v2/paddle.js"></script>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body>
      <script>
        Paddle.Environment.set("${checkoutData.paddleConfig.environment}");
        Paddle.Initialize({
          token: "${checkoutData.paddleConfig.token}",
          eventCallback: function(data) {
            if (data.name === "checkout.completed") {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'checkout.completed',
                data: data
              }));
            }
            if (data.name === "checkout.closed") {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'checkout.closed'
              }));
            }
          }
        });

        Paddle.Checkout.open({
          items: [{
            priceId: "${checkoutData.paddleConfig.priceId}",
            quantity: 1
          }],
          customer: {
            email: "${checkoutData.paddleConfig.customerEmail}"
          },
          customData: ${JSON.stringify(checkoutData.paddleConfig.customData)},
          settings: {
            displayMode: "overlay",
            theme: "light",
            locale: "he"
          }
        });
      </script>
    </body>
    </html>
  `;

  return (
    <WebView
      source={{ html }}
      onMessage={(event) => {
        const message = JSON.parse(event.nativeEvent.data);
        if (message.type === 'checkout.completed') {
          onSuccess(message.data);
        } else if (message.type === 'checkout.closed') {
          onCancel();
        }
      }}
    />
  );
};
```

**Option 2: Use Paddle's API-based checkout (Recommended for mobile)**

```javascript
// Backend creates a Paddle transaction
// Mobile app receives checkout URL
// Open URL in browser or in-app browser

// This approach is cleaner for mobile apps
const response = await fetch('/create-paddle-transaction', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    companyName: "חברת בניין בע\"מ",
    subscriptionTier: "professional"
  })
});

const { checkoutUrl } = await response.json();
// checkoutUrl: "https://buy.paddle.com/checkout/txn_abc123..."

// Open in browser
Linking.openURL(checkoutUrl);
```

**What user sees:**
- Paddle-hosted checkout page
- **Credit card form** (secured by Paddle)
- Trial notice: "30-day free trial, then ₪200/month"
- Terms and conditions
- **Card is validated but NOT charged** (trial period)

---

#### **Phase 6: Paddle Webhook Fires**

**THIS IS WHERE COMPANY CREATION HAPPENS**

When user completes Paddle checkout:

```
User enters card → Paddle validates card → Paddle creates subscription
                                              ↓
                                    Paddle sends webhook
                                              ↓
                        POST https://your-api.com/webhook-paddle
```

**Webhook Payload (`subscription.created` event):**

```json
{
  "event_id": "evt_01j9abc123",
  "event_type": "subscription.created",
  "occurred_at": "2025-12-23T10:30:00.000000Z",
  "data": {
    "id": "sub_01j9xyz789",
    "status": "trialing",  // ← Important: Trial status
    "customer_id": "ctm_01j9customer",
    "items": [
      {
        "price": {
          "id": "pri_01k9f1y03zd5f3cxwnnza118r2",  // Professional tier
          "description": "Professional Plan",
          "unit_price": {
            "amount": "20000",  // ₪200.00 in cents
            "currency_code": "ILS"
          }
        },
        "quantity": 1
      }
    ],
    "custom_data": {
      "companyId": "user_35IvSrgIwsi33cLFULPoiQHAnk9",
      "userId": "user_35IvSrgIwsi33cLFULPoiQHAnk9",
      "companyName": "חברת בניין בע\"מ",
      "subscriptionTier": "professional",
      "userEmail": "user@example.com"
    },
    "started_at": "2025-12-23T10:30:00.000000Z",
    "next_billed_at": "2026-01-23T10:30:00.000000Z",  // 30 days later
    "billing_cycle": {
      "interval": "month",
      "frequency": 1
    }
  }
}
```

**Webhook Handler (`webhookPaddle.js` lines 157-205):**

```javascript
async function handleSubscriptionCreated(subscriptionData) {
  // 1. Extract company info from custom_data
  const companyId = subscriptionData.custom_data?.companyId;
  const userId = subscriptionData.custom_data?.userId;
  const companyName = subscriptionData.custom_data?.companyName;
  const tier = determineTierFromPriceId(subscriptionData.items[0].price.id);

  // 2. Create subscription record in DynamoDB
  await storeSubscription({
    companyId,
    subscriptionId: subscriptionData.id,
    paddleCustomerId: subscriptionData.customer_id,
    currentPlan: tier,  // "professional"
    status: subscriptionData.status,  // "trialing"
    nextBillingDate: subscriptionData.next_billed_at
  });

  // 3. Create company record in DynamoDB
  await dynamoOperation('update', {
    TableName: 'construction-expenses-companies',
    Key: { companyId },
    UpdateExpression: 'SET subscriptionTier = :tier, subscriptionStatus = :status, ...',
    ExpressionAttributeValues: {
      ':tier': tier,
      ':status': 'trialing',  // ← User in trial
      ':subId': subscriptionData.id,
      ':custId': subscriptionData.customer_id,
      ':nextBilling': subscriptionData.next_billed_at
    }
  });

  console.log(`Company ${companyId} created with ${tier} tier in TRIAL mode`);
}
```

**What happens:**
1. Paddle webhook received at `/webhook-paddle` endpoint
2. Signature verified (HMAC SHA256) to ensure it's from Paddle
3. `subscription.created` event processed
4. Company record created/updated in DynamoDB:
   - `subscriptionTier`: `"professional"`
   - `subscriptionStatus`: `"trialing"` ← **Important: Trial status**
   - `subscriptionId`: Paddle subscription ID
   - `nextBillingDate`: 30 days from now
5. User record created with `role: "admin"`
6. Subscription record stored in Paddle subscriptions table

**Important: Why `subscription.created` instead of `subscription.activated`?**
- `subscription.created` fires **immediately** after card validation (during trial)
- `subscription.activated` fires **only after trial ends** (30 days later)
- For trial subscriptions, we need to create company immediately using `subscription.created`

---

#### **Phase 7: Mobile App Polls for Company Creation**

```javascript
// Mobile app - Poll for company creation after checkout completed
const pollForCompany = async () => {
  const maxAttempts = 15;  // 30 seconds (2-second intervals)
  let attempts = 0;

  const poll = async () => {
    attempts++;

    const response = await fetch(
      'https://2woj5i92td.execute-api.us-east-1.amazonaws.com/prod/get-company',
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const data = await response.json();

    if (data.companyExists) {
      // ✅ Company created by webhook!
      console.log('Company created successfully!');
      return data.company;
    } else if (attempts >= maxAttempts) {
      // ❌ Timeout
      throw new Error('Company creation timeout');
    } else {
      // Wait 2 seconds and try again
      await new Promise(resolve => setTimeout(resolve, 2000));
      return poll();
    }
  };

  return poll();
};

// After Paddle checkout completed
const company = await pollForCompany();

// ✅ Now load main app with company data
console.log('Company:', company);
// {
//   "id": "user_35IvSrgIwsi33cLFULPoiQHAnk9",
//   "name": "חברת בניין בע\"מ",
//   "subscriptionTier": "professional",
//   "subscriptionStatus": "trialing",  ← User in 30-day trial
//   "currentProjects": 0,
//   "currentUsers": 1,
//   "trialEndDate": "2026-01-23T10:30:00.000000Z"
// }
```

**Why polling?**
- Webhook processing is **asynchronous**
- Typically completes in 1-3 seconds
- Polling ensures app waits for company creation
- User sees "Processing payment..." message during polling

---

## 💳 Trial vs Paid Subscriptions

### During 30-Day Trial

**Subscription Status: `trialing`**

```javascript
// What user sees
{
  "subscriptionTier": "professional",
  "subscriptionStatus": "trialing",
  "trialStartDate": "2025-12-23T10:30:00.000000Z",
  "trialEndDate": "2026-01-23T10:30:00.000000Z",
  "nextBillingDate": "2026-01-23T10:30:00.000000Z"
}
```

**What happens:**
- ✅ Full access to all Professional features
- ✅ Card on file (validated but not charged)
- ⏰ Trial ends in 30 days
- 📧 Paddle sends reminder emails before trial ends

### After Trial Ends (Day 31)

**Paddle automatically:**
1. Charges the card on file
2. Sends `transaction.completed` webhook
3. Sends `subscription.activated` webhook
4. Updates subscription status to `"active"`

**Your webhook handler:**
```javascript
async function handleSubscriptionActivated(subscriptionData) {
  const companyId = subscriptionData.custom_data?.companyId;

  // Update company status from "trialing" to "active"
  await dynamoOperation('update', {
    TableName: 'construction-expenses-companies',
    Key: { companyId },
    UpdateExpression: 'SET subscriptionStatus = :status',
    ExpressionAttributeValues: {
      ':status': 'active'  // ← Now paid
    }
  });
}
```

### If Card Declined After Trial

**Paddle sends `subscription.past_due` webhook:**

```javascript
async function handleSubscriptionPastDue(subscriptionData) {
  const companyId = subscriptionData.custom_data?.companyId;

  // Update company status to "past_due"
  await dynamoOperation('update', {
    TableName: 'construction-expenses-companies',
    Key: { companyId },
    UpdateExpression: 'SET subscriptionStatus = :status',
    ExpressionAttributeValues: {
      ':status': 'past_due'
    }
  });

  // Paddle automatically:
  // - Sends payment failure email to customer
  // - Retries payment based on dunning settings
  // - Cancels subscription if payment fails multiple times
}
```

**Mobile app should:**
- Show payment error banner
- Disable create/edit actions
- Allow view-only access
- Provide link to update payment method

---

## 🔄 Subscription Lifecycle Events

### All Paddle Webhook Events (`webhookPaddle.js` lines 70-101)

| Event | When | Action |
|-------|------|--------|
| `subscription.created` | Card validated, trial starts | Create company & user records |
| `subscription.activated` | Trial ends, first charge succeeds | Update status to "active" |
| `subscription.updated` | User upgrades/downgrades tier | Update tier & limits |
| `subscription.canceled` | User cancels subscription | Update status to "canceled" |
| `subscription.past_due` | Payment fails | Update status to "past_due", restrict access |
| `transaction.completed` | Payment succeeds | Store payment record |
| `transaction.payment_failed` | Payment fails | Store failed payment record |

---

## 🔐 Security: Webhook Verification

**Critical: Always verify webhook signatures**

```javascript
// webhookPaddle.js lines 105-152
async function verifyPaddleWebhook(body, paddleSignature) {
  // 1. Parse signature header
  // Format: "ts=1234567890;h1=abc123def456..."
  const sigParts = paddleSignature.split(';');
  let timestamp, signature;

  for (const part of sigParts) {
    const [key, value] = part.split('=');
    if (key === 'ts') timestamp = value;
    if (key === 'h1') signature = value;
  }

  // 2. Create signed payload
  const signedPayload = `${timestamp}:${body}`;

  // 3. Calculate expected signature using webhook secret
  const expectedSignature = crypto
    .createHmac('sha256', PADDLE_WEBHOOK_SECRET)
    .update(signedPayload)
    .digest('hex');

  // 4. Timing-safe comparison (prevents timing attacks)
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
}
```

**Why this matters:**
- Prevents fake webhook calls from attackers
- Ensures webhooks are genuinely from Paddle
- Protects against unauthorized company creation

---

## 📱 Mobile Implementation Guide

### Complete React Native Implementation

```javascript
import { useUser, useAuth as useClerkAuth } from '@clerk/clerk-expo';
import { useState, useEffect } from 'react';
import { Linking } from 'react-native';
import { WebView } from 'react-native-webview';

const API_BASE = 'https://2woj5i92td.execute-api.us-east-1.amazonaws.com/prod';

export function useOnboarding() {
  const { user } = useUser();
  const { getToken } = useClerkAuth();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [paddleCheckoutConfig, setPaddleCheckoutConfig] = useState(null);

  // Create Paddle checkout
  const createCheckout = async (companyName, subscriptionTier) => {
    try {
      setLoading(true);
      setError(null);

      const token = await getToken();

      const response = await fetch(`${API_BASE}/create-paddle-checkout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          companyName,
          subscriptionTier
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message || 'Failed to create checkout');
      }

      setPaddleCheckoutConfig(data);
      return data;

    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Poll for company creation after payment
  const waitForCompanyCreation = async () => {
    const maxAttempts = 15;
    let attempts = 0;

    const poll = async () => {
      attempts++;

      try {
        const token = await getToken();

        const response = await fetch(`${API_BASE}/get-company`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        const data = await response.json();

        if (data.companyExists) {
          return data.company;
        } else if (attempts >= maxAttempts) {
          throw new Error('Company creation timeout. Please refresh.');
        } else {
          await new Promise(resolve => setTimeout(resolve, 2000));
          return poll();
        }
      } catch (err) {
        if (attempts >= maxAttempts) {
          throw err;
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
        return poll();
      }
    };

    return poll();
  };

  return {
    loading,
    error,
    paddleCheckoutConfig,
    createCheckout,
    waitForCompanyCreation
  };
}
```

### Onboarding Screen Component

```javascript
import React, { useState } from 'react';
import { View, Text, TextInput, Button, ActivityIndicator } from 'react-native';
import { useOnboarding } from './useOnboarding';

const OnboardingScreen = ({ onComplete }) => {
  const [companyName, setCompanyName] = useState('');
  const [selectedTier, setSelectedTier] = useState('professional');
  const [showCheckout, setShowCheckout] = useState(false);
  const [polling, setPolling] = useState(false);

  const { loading, error, paddleCheckoutConfig, createCheckout, waitForCompanyCreation } = useOnboarding();

  const handleSubmit = async () => {
    try {
      // 1. Create Paddle checkout configuration
      const config = await createCheckout(companyName, selectedTier);

      // 2. Show Paddle checkout
      setShowCheckout(true);
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleCheckoutCompleted = async () => {
    try {
      setShowCheckout(false);
      setPolling(true);

      // Wait for webhook to create company (usually 1-3 seconds)
      const company = await waitForCompanyCreation();

      // ✅ Company created successfully
      onComplete(company);

    } catch (err) {
      alert(`Error: ${err.message}`);
      setPolling(false);
    }
  };

  if (showCheckout && paddleCheckoutConfig) {
    return (
      <PaddleCheckoutView
        config={paddleCheckoutConfig}
        onCompleted={handleCheckoutCompleted}
        onCanceled={() => setShowCheckout(false)}
      />
    );
  }

  if (polling) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
        <Text>מעבד תשלום ויוצר את החברה...</Text>
        <Text>זה יכול לקחת עד 30 שניות</Text>
      </View>
    );
  }

  return (
    <View>
      <Text>ברוך הבא! בוא נגדיר את החברה שלך</Text>

      <TextInput
        placeholder="שם החברה"
        value={companyName}
        onChangeText={setCompanyName}
      />

      <View>
        <Text>בחר תוכנית מנוי:</Text>

        <Button
          title="Starter - ₪100/חודש (ניסיון 30 יום)"
          onPress={() => setSelectedTier('starter')}
          color={selectedTier === 'starter' ? 'blue' : 'gray'}
        />

        <Button
          title="Professional - ₪200/חודש (ניסיון 30 יום)"
          onPress={() => setSelectedTier('professional')}
          color={selectedTier === 'professional' ? 'blue' : 'gray'}
        />

        <Button
          title="Enterprise - ₪300/חודש (ניסיון 30 יום)"
          onPress={() => setSelectedTier('enterprise')}
          color={selectedTier === 'enterprise' ? 'blue' : 'gray'}
        />
      </View>

      <Button
        title={loading ? 'טוען...' : 'המשך לתשלום'}
        onPress={handleSubmit}
        disabled={loading || !companyName}
      />

      {error && <Text style={{ color: 'red' }}>{error}</Text>}
    </View>
  );
};
```

### Paddle Checkout WebView

```javascript
import React from 'react';
import { WebView } from 'react-native-webview';

const PaddleCheckoutView = ({ config, onCompleted, onCanceled }) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <script src="https://cdn.paddle.com/paddle/v2/paddle.js"></script>
      <style>
        body {
          margin: 0;
          padding: 20px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: #f5f5f5;
        }
        .loading {
          text-align: center;
          padding: 40px;
        }
      </style>
    </head>
    <body>
      <div class="loading">
        <h2>פותח תשלום מאובטח...</h2>
        <p>אנא המתן</p>
      </div>

      <script>
        console.log('Initializing Paddle...');

        Paddle.Environment.set("${config.paddleConfig.environment}");
        Paddle.Initialize({
          token: "${config.paddleConfig.token}",
          eventCallback: function(data) {
            console.log('Paddle event:', data.name);

            if (data.name === "checkout.completed") {
              console.log('Checkout completed!', data);
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'completed',
                data: data
              }));
            }

            if (data.name === "checkout.closed") {
              console.log('Checkout closed');
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'canceled'
              }));
            }
          }
        });

        setTimeout(() => {
          console.log('Opening checkout...');
          Paddle.Checkout.open({
            items: [{
              priceId: "${config.paddleConfig.priceId}",
              quantity: 1
            }],
            customer: {
              email: "${config.paddleConfig.customerEmail || ''}"
            },
            customData: ${JSON.stringify(config.paddleConfig.customData)},
            settings: {
              displayMode: "overlay",
              theme: "light",
              locale: "he"
            }
          });
        }, 1000);
      </script>
    </body>
    </html>
  `;

  return (
    <WebView
      source={{ html }}
      onMessage={(event) => {
        const message = JSON.parse(event.nativeEvent.data);

        if (message.type === 'completed') {
          onCompleted(message.data);
        } else if (message.type === 'canceled') {
          onCanceled();
        }
      }}
      style={{ flex: 1 }}
    />
  );
};

export default PaddleCheckoutView;
```

---

## 🔄 Upgrade/Downgrade Flow

### User Wants to Change Tier

```javascript
// Mobile app - User clicks "Upgrade to Enterprise"
const upgradeTier = async (newTier) => {
  try {
    const token = await getToken();

    const response = await fetch(`${API_BASE}/update-paddle-subscription`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        newTier: 'enterprise'  // professional → enterprise
      })
    });

    const data = await response.json();

    if (data.success) {
      // Tier updated!
      console.log('Upgraded to:', data.subscription.currentTier);
      // Refresh company data
      await checkCompany();
    }

  } catch (err) {
    console.error('Upgrade failed:', err);
  }
};
```

**Backend (`updatePaddleSubscription` Lambda):**

```javascript
// 1. Get current subscription from DynamoDB
const subscription = await getCompanySubscription(companyId);

// 2. Map new tier to Paddle Price ID
const newPriceId = SUBSCRIPTION_PLANS[newTier.toUpperCase()].priceId;

// 3. Update subscription via Paddle API
const updated = await paddleApiCall(`subscriptions/${subscription.subscriptionId}`, 'PATCH', {
  items: [{
    price_id: newPriceId,
    quantity: 1
  }],
  proration_billing_mode: subscription.status === 'trialing'
    ? 'do_not_bill'  // Don't charge during trial
    : 'prorated_immediately'  // Charge prorated amount for upgrade
});

// 4. Paddle sends webhook (subscription.updated)
// 5. Webhook handler updates DynamoDB
```

**Proration Example:**
- User on Professional (₪200/mo)
- Upgrades to Enterprise (₪300/mo) on day 15 of billing cycle
- Paddle charges: `(₪300 - ₪200) × (15 days / 30 days) = ₪50`
- Next full charge: ₪300 on next billing date

---

## 🧪 Testing Guide

### Test Credentials

**Paddle Sandbox Mode:**
- Environment: `sandbox`
- Test cards: https://developer.paddle.com/concepts/payment-methods/test-cards

**Test Card Numbers:**
```
✅ Successful Payment:
   4242 4242 4242 4242
   Expiry: Any future date
   CVV: Any 3 digits

❌ Declined Card:
   4000 0000 0000 0002

⏸️ Requires 3D Secure:
   4000 0025 0000 3155
```

### Test Scenarios

1. **New User Flow:**
   - Sign up with Clerk
   - Complete onboarding
   - Use test card `4242 4242 4242 4242`
   - Verify company created with `subscriptionStatus: "trialing"`

2. **Webhook Testing:**
   - Use Paddle webhook simulator in dashboard
   - Send `subscription.created` event manually
   - Verify company appears in DynamoDB

3. **Upgrade/Downgrade:**
   - Create company with Starter tier
   - Upgrade to Professional
   - Verify tier updated in app

4. **Trial Expiration:**
   - Use Paddle API to fast-forward subscription date
   - Verify `subscription.activated` webhook received
   - Verify `subscriptionStatus` changes to `"active"`

5. **Payment Failure:**
   - Use declined test card
   - Verify `transaction.payment_failed` webhook
   - Verify app shows payment error

---

## 🔒 Security Best Practices

### 1. Always Verify Webhook Signatures
```javascript
// ❌ NEVER trust webhooks without verification
if (!verifyPaddleWebhook(body, signature)) {
  return createErrorResponse(401, 'Invalid signature');
}
```

### 2. Use Clerk JWT for All API Calls
```javascript
// ✅ Every request must have valid Clerk token
headers: {
  'Authorization': `Bearer ${await getToken()}`
}
```

### 3. Store Secrets in AWS Secrets Manager
```javascript
// ❌ NEVER hardcode secrets
const PADDLE_API_KEY = 'live_abc123...';  // NO!

// ✅ Load from Secrets Manager
const PADDLE_API_KEY = await getSecret('paddle/api-key');
```

### 4. Validate Custom Data in Webhooks
```javascript
// ✅ Always validate webhook data
const { companyId, userId, companyName } = subscriptionData.custom_data;

if (!companyId || !userId || !companyName) {
  console.error('Invalid webhook data');
  return;
}
```

### 5. Implement Idempotency
```javascript
// ✅ Check if company already exists before creating
const existing = await dynamoOperation('get', {
  TableName: 'companies',
  Key: { companyId }
});

if (!existing.Item) {
  // Create company
} else {
  // Update existing
}
```

---

## 📊 Summary: Clerk + Paddle Integration

| Component | Responsibility |
|-----------|---------------|
| **Clerk** | User authentication, JWT tokens, user identity |
| **Your API (Lambda)** | Check company exists, create Paddle checkout config, handle webhooks |
| **Paddle** | Payment processing, subscription management, card validation |
| **DynamoDB** | Store company, user, subscription, payment records |
| **Mobile App** | User interface, coordinate authentication and payment flows |

**Key Flow:**
1. User signs up with Clerk → JWT token
2. App checks if company exists → NO
3. App shows onboarding → User selects tier
4. App gets Paddle config → Opens Paddle checkout
5. User enters card → Paddle validates (not charged)
6. Paddle sends webhook → Company created in DynamoDB
7. App polls → Detects company → Loads main app
8. After 30 days → Paddle charges card → `subscription.activated`

**Trial Period:**
- All tiers include 30-day trial
- Card required but not charged during trial
- `subscriptionStatus: "trialing"`
- Full feature access during trial
- After trial: Auto-charge or `past_due` if declined

---

## 🔗 API Endpoints Reference

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/get-company` | GET | Check if user has company, get company info |
| `/create-paddle-checkout` | POST | Get Paddle checkout configuration |
| `/webhook-paddle` | POST | Receive Paddle webhook events |
| `/update-paddle-subscription` | POST | Upgrade/downgrade subscription tier |

---

## 📞 Support & Resources

- **Paddle Docs:** https://developer.paddle.com/
- **Clerk Docs:** https://clerk.com/docs
- **Implementation Files:**
  - `/Users/maordaniel/Ofek/lambda/createPaddleCheckout.js`
  - `/Users/maordaniel/Ofek/lambda/webhookPaddle.js`
  - `/Users/maordaniel/Ofek/lambda/shared/paddle-utils.js`
  - `/Users/maordaniel/Ofek/lambda/getCompany.js`

---

*Guide v1.0 - 2025-12-24*
