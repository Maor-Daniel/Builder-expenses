# Mobile App Deep Linking Setup for Paddle Checkout
**Date:** 2026-01-03
**For:** Mobile Development Team
**Status:** Web URL Temporary Fix Applied - Mobile Deep Linking Requires Paddle Approval

---

## Current Situation

### ✅ What's Working NOW (Temporary Fix)
- **Redirect URL:** `https://www.builder-expenses.com/checkout-success`
- **Works for:** Web and mobile browsers
- **User experience:** After payment, users see success page on web, must manually return to app
- **Status:** Production checkout is WORKING - users can subscribe

### ⚠️ What's NOT Working (Needs Mobile Team Action)
- **Deep linking:** `builderexpenses://checkout-success` redirect
- **Issue:** Paddle requires **manual approval** for custom URL schemes on production accounts
- **Impact:** Mobile app doesn't auto-redirect users back after successful payment

---

## Why This Happened

Paddle has two tiers of checkout access:

1. **Sandbox accounts:** Custom URL schemes work immediately (no approval needed)
2. **Production accounts:** Custom URL schemes require approval from Paddle Support

Our app is now in **production mode**, so the deep link `builderexpenses://checkout-success` is blocked until Paddle approves it.

---

## How to Fix Mobile Deep Linking (For Mobile Dev Team)

### Step 1: Request Paddle Mobile App Approval

**📧 Contact Paddle Support:**
- Go to Paddle Dashboard → Support/Help
- Subject: "Request Mobile App Hosted Checkout Approval"
- Message template:

```
Hello Paddle Support,

We need approval to use custom URL scheme deep linking for our mobile app checkout.

App Details:
- App Name: Builder Expenses
- Platform: iOS / Android (specify yours)
- Custom URL Scheme: builderexpenses://
- Redirect URL: builderexpenses://checkout-success
- App Store Link: [Your app store URL when published]
- Company: [Your company name]
- Account Email: [Your Paddle account email]

Use Case:
After users complete a Paddle hosted checkout in a webview/browser, we need to deep link them back to our mobile app using the custom URL scheme.

Current Status:
We're currently using a web URL fallback (https://www.builder-expenses.com/checkout-success) but would like to provide a better mobile UX with deep linking.

Thank you!
```

**Timeline:** Paddle typically approves within 2-5 business days.

---

### Step 2: Configure Mobile App URL Scheme

While waiting for Paddle approval, ensure your mobile app is configured to handle the deep link:

#### iOS (Swift/SwiftUI)

**1. Add URL Scheme to Info.plist:**
```xml
<key>CFBundleURLTypes</key>
<array>
    <dict>
        <key>CFBundleURLSchemes</key>
        <array>
            <string>builderexpenses</string>
        </array>
        <key>CFBundleURLName</key>
        <string>com.builderexpenses.app</string>
    </dict>
</array>
```

**2. Handle Deep Link in App:**
```swift
// SwiftUI
.onOpenURL { url in
    if url.scheme == "builderexpenses" && url.host == "checkout-success" {
        // Extract transaction ID from query parameters
        if let components = URLComponents(url: url, resolvingAgainstBaseURL: true),
           let transactionId = components.queryItems?.first(where: { $0.name == "_ptxn" })?.value {
            // Handle successful checkout
            handleCheckoutSuccess(transactionId: transactionId)
        }
    }
}

// UIKit
func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey : Any] = [:]) -> Bool {
    if url.scheme == "builderexpenses" && url.host == "checkout-success" {
        // Handle checkout success
        return true
    }
    return false
}
```

**3. Universal Links (Alternative - Recommended):**
Instead of custom URL schemes, consider using **Universal Links** which work better:

```json
// apple-app-site-association (host at https://www.builder-expenses.com/.well-known/)
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "TEAMID.com.builderexpenses.app",
        "paths": ["/checkout-success"]
      }
    ]
  }
}
```

#### Android (Kotlin)

**1. Add Intent Filter to AndroidManifest.xml:**
```xml
<activity android:name=".MainActivity">
    <intent-filter>
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />

        <data
            android:scheme="builderexpenses"
            android:host="checkout-success" />
    </intent-filter>
</activity>
```

**2. Handle Deep Link in Activity:**
```kotlin
class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        intent?.data?.let { uri ->
            if (uri.scheme == "builderexpenses" && uri.host == "checkout-success") {
                val transactionId = uri.getQueryParameter("_ptxn")
                // Handle successful checkout
                handleCheckoutSuccess(transactionId)
            }
        }
    }
}
```

**3. App Links (Alternative - Recommended):**
```xml
<!-- AndroidManifest.xml -->
<intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />

    <data
        android:scheme="https"
        android:host="www.builder-expenses.com"
        android:pathPrefix="/checkout-success" />
</intent-filter>
```

---

### Step 3: Test Deep Linking (After Paddle Approval)

Once Paddle approves your custom URL scheme:

**1. Backend Update Required:**
Contact backend team to update Lambda environment variable:
```bash
CHECKOUT_SUCCESS_URL=builderexpenses://checkout-success
```

Or if using client-side checkout, pass in the API call:
```javascript
{
  companyName: "Test Company",
  subscriptionTier: "starter",
  successUrl: "builderexpenses://checkout-success"  // Override default
}
```

**2. Test Flow:**
1. Open mobile app
2. Start checkout process
3. Complete payment in Paddle hosted checkout
4. Verify app receives deep link callback
5. Extract transaction ID from URL parameters
6. Verify webhook completes company creation
7. Show success UI in app

---

### Step 4: Handle Checkout Success in Your App

When users return to your app via deep link, you should:

**1. Extract Transaction ID:**
```javascript
// URL format: builderexpenses://checkout-success?_ptxn=txn_abc123
const transactionId = getQueryParam(url, '_ptxn');
```

**2. Wait for Webhook Completion:**
```javascript
// Poll backend to check if company is created
async function waitForCompanyCreation(userId) {
  for (let i = 0; i < 10; i++) {
    const company = await getCompany(userId);
    if (company) {
      // Company created by webhook - success!
      return company;
    }
    await sleep(2000); // Wait 2 seconds between polls
  }
  throw new Error('Company creation timeout');
}
```

**3. Show Success UI:**
```javascript
// Navigate to main app screen
navigation.navigate('Dashboard', {
  newUser: true,
  subscriptionTier: company.subscriptionTier
});
```

---

## Recommended Approach: Universal/App Links (Better than Deep Links)

Instead of custom URL schemes (`builderexpenses://`), we recommend using **Universal Links (iOS)** and **App Links (Android)**:

### Benefits:
✅ No Paddle approval needed (uses HTTPS URLs)
✅ Fallback to web if app not installed
✅ More secure (verified domain ownership)
✅ Better user experience

### Implementation:
1. **Backend:** Already configured! `https://www.builder-expenses.com/checkout-success` is live
2. **Mobile:** Configure universal/app links (see code samples above)
3. **Result:** Works immediately, no Paddle approval needed

### How it works:
- User completes checkout → redirects to `https://www.builder-expenses.com/checkout-success`
- If app installed → OS opens app instead of browser
- If app not installed → Shows web success page
- Best of both worlds! 🎉

---

## Current Backend Configuration

### Lambda Function: `construction-expenses-create-paddle-checkout`

**Current redirect URL (as of 2026-01-03):**
```javascript
const checkoutSuccessUrl = successUrl ||
                            process.env.CHECKOUT_SUCCESS_URL ||
                            'https://www.builder-expenses.com/checkout-success';
```

**To switch to deep linking (after Paddle approval):**

Option 1: Set environment variable:
```bash
aws lambda update-function-configuration \
  --function-name construction-expenses-create-paddle-checkout \
  --environment Variables="{CHECKOUT_SUCCESS_URL=builderexpenses://checkout-success,...}" \
  --region us-east-1
```

Option 2: Pass in API request:
```javascript
POST /create-paddle-checkout
{
  "companyName": "Test Company",
  "subscriptionTier": "starter",
  "successUrl": "builderexpenses://checkout-success"
}
```

---

## Testing Checklist

After Paddle approves custom URL scheme and backend is updated:

### iOS Testing:
- [ ] Deep link registered in Info.plist
- [ ] URL scheme handler implemented
- [ ] Test with real device (simulators may behave differently)
- [ ] Verify transaction ID extraction
- [ ] Verify company creation after webhook
- [ ] Test with both sandbox and production checkouts

### Android Testing:
- [ ] Intent filter added to AndroidManifest.xml
- [ ] Deep link handler implemented in Activity
- [ ] Test with real device
- [ ] Verify transaction ID extraction
- [ ] Verify company creation after webhook
- [ ] Test with both sandbox and production checkouts

---

## Troubleshooting

### Deep Link Not Working After Paddle Approval?

**Check 1: Paddle Dashboard Configuration**
- Verify `builderexpenses://checkout-success` is in approved redirect URLs
- Check both sandbox AND production environments

**Check 2: Backend Configuration**
```bash
# Verify Lambda environment variable
aws lambda get-function-configuration \
  --function-name construction-expenses-create-paddle-checkout \
  --region us-east-1 \
  --query 'Environment.Variables.CHECKOUT_SUCCESS_URL'
```

**Check 3: Mobile App Configuration**
- iOS: Check Info.plist has URL scheme
- Android: Check AndroidManifest.xml has intent filter
- Verify URL scheme is exactly `builderexpenses` (no typos!)

**Check 4: Test with Safari/Chrome**
Type in browser address bar: `builderexpenses://checkout-success?_ptxn=test123`
- Should prompt to open your app
- If not → App configuration issue

---

## Contact & Support

**Backend Team:**
- Redirect URL already updated to web URL: ✅
- Ready to switch to deep linking when Paddle approves: ✅
- Lambda function: `construction-expenses-create-paddle-checkout`

**Paddle Support:**
- Dashboard: https://vendors.paddle.com
- Docs: https://developer.paddle.com/build/mobile-apps/link-out-mobile-app-hosted-checkout-app

**Questions?**
Contact backend team or check CloudWatch logs:
```bash
aws logs tail /aws/lambda/construction-expenses-create-paddle-checkout --since 30m --region us-east-1
```

---

## Timeline

- **Today (2026-01-03):** ✅ Web URL fix deployed - checkout working
- **Mobile Team:** Submit Paddle approval request (2-5 days)
- **After Approval:** Update backend environment variable
- **Then:** Test deep linking on real devices
- **Launch:** Full mobile deep linking experience! 🚀

---

## Summary for Mobile Dev Team

### What You Need to Do:

1. ✅ **DONE:** Backend fixed checkout - now using web URL
2. 📧 **TODO:** Contact Paddle Support to request mobile app approval
3. 📱 **TODO:** Configure URL scheme in your mobile app (iOS/Android)
4. 🧪 **TODO:** Implement deep link handlers
5. ⏳ **WAIT:** For Paddle approval (2-5 days)
6. 🔄 **TODO:** Notify backend team when approved (we'll update Lambda)
7. ✅ **TEST:** End-to-end checkout with deep linking

**Recommended:** Consider Universal Links/App Links instead of custom URL scheme for better UX and no Paddle approval needed!

Good luck! 🎉
