# Fix CSP Violations - Production Standard

## 🚨 Current Issue

**Console Warnings:**
```
Connecting to 'https://cdn.jsdelivr.net/...' violates CSP connect-src directive
```

**Impact:**
- Non-critical (source maps are for debugging only)
- But violates our production standard: **ZERO console warnings**

---

## 🔧 Solution: Add jsdelivr to CSP

### Where CSP is Configured:

CSP (Content Security Policy) is typically configured in one of these locations:

1. **CloudFront Response Headers** (most likely)
2. **API Gateway Response Headers**
3. **Lambda@Edge function**
4. **HTML meta tag** (least likely)

---

## 📝 Fix Instructions

### Option 1: CloudFront Response Headers Policy

1. Go to AWS Console → CloudFront → Response Headers Policies
2. Find your current policy (or create new one)
3. Update `connect-src` directive:

```
connect-src 'self'
  https://*.execute-api.us-east-1.amazonaws.com
  https://*.s3.amazonaws.com
  https://*.s3.us-east-1.amazonaws.com
  https://*.clerk.accounts.dev
  https://*.clerk.com
  https://clerk.builder-expenses.com
  https://accounts.builder-expenses.com
  wss://*.clerk.accounts.dev
  wss://clerk.builder-expenses.com
  https://*.paddle.com
  https://challenges.cloudflare.com
  https://cdn.jsdelivr.net              # ADD THIS LINE
```

4. Save and wait for CloudFront to propagate (5-10 minutes)
5. Test: Refresh app, check DevTools Console (warnings should be gone)

---

### Option 2: Lambda Response Headers

If CSP is set in Lambda functions:

**File:** `lambda/shared/cors-config.js` or response headers

Add header:
```javascript
headers: {
  'Content-Security-Policy': `
    connect-src 'self'
      https://*.execute-api.us-east-1.amazonaws.com
      https://cdn.jsdelivr.net
      ...
  `
}
```

---

### Option 3: HTML Meta Tag (Quick Fix)

**File:** `frontend/app.html`

Add to `<head>`:
```html
<meta http-equiv="Content-Security-Policy" content="
  connect-src 'self'
    https://*.execute-api.us-east-1.amazonaws.com
    https://*.s3.amazonaws.com
    https://*.clerk.accounts.dev
    https://*.paddle.com
    https://cdn.jsdelivr.net
    wss://*.clerk.accounts.dev;
  script-src 'self' 'unsafe-inline' 'unsafe-eval'
    https://cdn.jsdelivr.net
    https://*.clerk.accounts.dev
    https://*.paddle.com;
  style-src 'self' 'unsafe-inline'
    https://cdn.jsdelivr.net
    https://fonts.googleapis.com;
  img-src 'self' data: blob:
    https://*.s3.amazonaws.com;
  font-src 'self'
    https://fonts.gstatic.com;
">
```

---

## ✅ Verification

After applying fix:

1. Clear browser cache
2. Refresh app (`Cmd+Shift+R` or `Ctrl+Shift+F5`)
3. Open DevTools Console
4. **Expected:** ZERO CSP warnings
5. **Verify:** Chart.js still loads and works

---

## 🎯 Production Standard Compliance

**Before Fix:**
```
❌ CSP violations in console
❌ Warnings visible to developers
```

**After Fix:**
```
✅ Zero console warnings
✅ Zero CSP violations
✅ Production standard met
```

---

## 📊 Related Files

If CSP needs to be updated, check these locations:
- CloudFront distribution settings
- `infrastructure/cloudfront-config.json` (if using IaC)
- `lambda/shared/cors-config.js`
- Response header policies in AWS Console

---

**Priority:** Medium (non-breaking, but violates production standards)
**Effort:** 10 minutes
**Impact:** Clean console, better debugging experience
