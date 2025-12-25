# Paddle + Clerk Integration - Quick Reference

**Payment Flow Cheat Sheet**

---

## 🚀 Quick Flow

```
1. User signs up (Clerk)
2. GET /get-company → companyExists: false
3. POST /create-paddle-checkout → Get config
4. Open Paddle checkout (WebView)
5. User enters card → Paddle validates
6. Webhook fires → Company created
7. Poll GET /get-company → companyExists: true
8. Load main app
```

---

## 📋 API Endpoints

### 1. Check Company Exists
```http
GET /get-company
Authorization: Bearer <CLERK_JWT>
```

**Response (No Company):**
```json
{
  "success": true,
  "companyExists": false
}
```

**Response (Has Company):**
```json
{
  "success": true,
  "companyExists": true,
  "company": {
    "subscriptionTier": "professional",
    "subscriptionStatus": "trialing"
  }
}
```

---

### 2. Create Paddle Checkout
```http
POST /create-paddle-checkout
Authorization: Bearer <CLERK_JWT>
Content-Type: application/json

{
  "companyName": "חברת בניין בע\"מ",
  "subscriptionTier": "professional"
}
```

**Response:**
```json
{
  "success": true,
  "paddleConfig": {
    "token": "test_db12c8b3a07159acbe3dff44dba",
    "priceId": "pri_01k9f1y03zd5f3cxwnnza118r2",
    "environment": "sandbox",
    "customerEmail": "user@example.com",
    "customData": {
      "companyId": "user_123",
      "userId": "user_123",
      "companyName": "חברת בניין בע\"מ",
      "subscriptionTier": "professional"
    }
  },
  "plan": {
    "name": "Professional",
    "price": 200,
    "currency": "ILS",
    "trialDays": 30
  }
}
```

---

### 3. Upgrade/Downgrade Tier
```http
POST /update-paddle-subscription
Authorization: Bearer <CLERK_JWT>
Content-Type: application/json

{
  "newTier": "enterprise"
}
```

---

## 💰 Subscription Tiers

| Tier | Price | Trial | Users | Projects | Expenses |
|------|-------|-------|-------|----------|----------|
| **starter** | ₪100/mo | 30 days | 1 | 3 | 50/month |
| **professional** | ₪200/mo | 30 days | 3 | 10 | Unlimited |
| **enterprise** | ₪300/mo | 30 days | 10 | Unlimited | Unlimited |

---

## 🔄 Subscription Statuses

| Status | Meaning | User Access |
|--------|---------|-------------|
| `trialing` | 30-day trial (card not charged) | ✅ Full access |
| `active` | Paid subscription | ✅ Full access |
| `past_due` | Payment failed | ⚠️ Read-only |
| `canceled` | Subscription canceled | ❌ Access until end of period |

---

## 📱 React Native Implementation

### Onboarding Hook
```javascript
import { useUser, useAuth } from '@clerk/clerk-expo';

const API_BASE = 'https://2woj5i92td.execute-api.us-east-1.amazonaws.com/prod';

export function useOnboarding() {
  const { getToken } = useAuth();

  const createCheckout = async (companyName, tier) => {
    const token = await getToken();

    const response = await fetch(`${API_BASE}/create-paddle-checkout`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        companyName,
        subscriptionTier: tier
      })
    });

    return await response.json();
  };

  const waitForCompany = async () => {
    let attempts = 0;
    const maxAttempts = 15;

    while (attempts < maxAttempts) {
      const token = await getToken();

      const response = await fetch(`${API_BASE}/get-company`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const data = await response.json();

      if (data.companyExists) {
        return data.company;
      }

      await new Promise(r => setTimeout(r, 2000));
      attempts++;
    }

    throw new Error('Timeout waiting for company creation');
  };

  return { createCheckout, waitForCompany };
}
```

---

### Paddle Checkout WebView
```javascript
import React from 'react';
import { WebView } from 'react-native-webview';

const PaddleCheckout = ({ config, onComplete, onCancel }) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <script src="https://cdn.paddle.com/paddle/v2/paddle.js"></script>
    </head>
    <body>
      <script>
        Paddle.Environment.set("${config.paddleConfig.environment}");
        Paddle.Initialize({
          token: "${config.paddleConfig.token}",
          eventCallback: function(data) {
            if (data.name === "checkout.completed") {
              window.ReactNativeWebView.postMessage('completed');
            }
            if (data.name === "checkout.closed") {
              window.ReactNativeWebView.postMessage('canceled');
            }
          }
        });

        Paddle.Checkout.open({
          items: [{ priceId: "${config.paddleConfig.priceId}", quantity: 1 }],
          customer: { email: "${config.paddleConfig.customerEmail}" },
          customData: ${JSON.stringify(config.paddleConfig.customData)},
          settings: { locale: "he" }
        });
      </script>
    </body>
    </html>
  `;

  return (
    <WebView
      source={{ html }}
      onMessage={(e) => {
        e.nativeEvent.data === 'completed' ? onComplete() : onCancel();
      }}
    />
  );
};
```

---

## 🔐 Webhook Events

| Event | When | Action |
|-------|------|--------|
| `subscription.created` | Trial starts | Create company |
| `subscription.activated` | Trial ends, payment succeeds | Update to "active" |
| `subscription.updated` | Tier change | Update tier |
| `subscription.canceled` | User cancels | Mark canceled |
| `subscription.past_due` | Payment fails | Restrict access |
| `transaction.completed` | Payment succeeds | Store payment record |

---

## ⏰ Timing

| Phase | Duration |
|-------|----------|
| Paddle checkout | 30-60 seconds (user enters card) |
| Webhook processing | 1-3 seconds |
| Company creation | 1-3 seconds |
| Total onboarding | ~1-2 minutes |

---

## 🧪 Test Cards (Sandbox)

```
✅ Success:
   4242 4242 4242 4242

❌ Declined:
   4000 0000 0000 0002

⏸️ 3D Secure:
   4000 0025 0000 3155
```

**All test cards:**
- Expiry: Any future date
- CVV: Any 3 digits
- ZIP: Any valid ZIP

---

## 🔒 Security Checklist

- [x] Verify Paddle webhook signatures (HMAC SHA256)
- [x] Use Clerk JWT for all API calls
- [x] Store secrets in AWS Secrets Manager (not code)
- [x] Validate `customData` in webhooks
- [x] Implement idempotent webhook handlers
- [x] Use HTTPS for all endpoints
- [x] Rate limit webhook endpoint

---

## ❌ Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| 401 Unauthorized | Invalid/expired JWT | Re-authenticate with Clerk |
| 400 Bad Request | Invalid tier | Use starter/professional/enterprise |
| Timeout polling | Webhook delayed | Increase max attempts to 20 |
| Paddle not loaded | Script failed | Check internet, reload page |

---

## 📊 Data Flow

```
┌──────────┐   JWT    ┌─────────┐  Checkout   ┌─────────┐
│  Mobile  │ ──────> │ Your API│  ──────────> │ Paddle  │
└──────────┘         └─────────┘              └─────────┘
     ↑                    ↑                        │
     │                    │                        │
     │ Poll               │ Webhook                │
     │                    │                        │
     └────────────────────┴────────────────────────┘
                    Company Created
```

---

## 💡 Pro Tips

1. **Always poll after checkout** - Webhooks can take 1-3 seconds
2. **Show loading state** - "Processing payment, please wait..."
3. **Handle webhook idempotency** - Check if company exists before creating
4. **Test webhook signatures** - Use Paddle webhook simulator
5. **Use environment variables** - Never hardcode Paddle keys
6. **Monitor webhook failures** - Set up CloudWatch alarms
7. **Trial = Full Access** - Don't restrict features during trial

---

## 🔗 Quick Links

- **Paddle Dashboard:** https://vendors.paddle.com/
- **Paddle API Docs:** https://developer.paddle.com/
- **Test Cards:** https://developer.paddle.com/concepts/payment-methods/test-cards
- **Webhook Events:** https://developer.paddle.com/webhooks/overview

---

## 📞 Support

**Implementation Files:**
- `/Users/maordaniel/Ofek/lambda/createPaddleCheckout.js`
- `/Users/maordaniel/Ofek/lambda/webhookPaddle.js`
- `/Users/maordaniel/Ofek/lambda/shared/paddle-utils.js`

**Full Guide:** `/Users/maordaniel/Ofek/MOBILE_PADDLE_CLERK_INTEGRATION_GUIDE.md`

---

*Quick Reference v1.0 - 2025-12-24*
