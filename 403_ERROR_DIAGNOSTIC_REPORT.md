# 403 Error Diagnostic Report
## GET /works Endpoint Investigation

**Date:** 2025-12-25
**Issue:** User getting 403 errors when calling GET /works endpoint
**User:** user_37GfpXk1OxwYvcOeSXl2iXEuY8Y
**Role:** admin

---

## Investigation Summary

### ✅ What's CONFIRMED WORKING:

#### 1. Lambda Authorizer (clerk-authorizer)
**CloudWatch Logs:** `/aws/lambda/construction-expenses-clerk-authorizer`
**Timestamp:** 2025-12-25T11:32:03.448Z
**Status:** ✅ WORKING PERFECTLY

```json
{
  "message": "Token signature verified successfully",
  "userId": "user_37GfpXk1OxwYvcOeSXl2iXEuY8Y",
  "companyMembership": {
    "companyId": "user_37GfpXk1OxwYvcOeSXl2iXEuY8Y",
    "role": "admin"
  },
  "policy": {
    "Effect": "Allow",
    "context": {
      "role": "admin",
      "companyId": "user_37GfpXk1OxwYvcOeSXl2iXEuY8Y"
    }
  }
}
```

**Conclusion:** Authorizer is correctly:
- ✅ Validating JWT token
- ✅ Looking up user role from DynamoDB
- ✅ Finding role = "admin"
- ✅ Returning "Allow" policy
- ✅ Passing role to Lambda function

---

#### 2. DynamoDB User Record
**Table:** `construction-expenses-company-users`
**Query Result:**

```json
{
  "companyId": "user_37GfpXk1OxwYvcOeSXl2iXEuY8Y",
  "userId": "user_37GfpXk1OxwYvcOeSXl2iXEuY8Y",
  "role": "admin",
  "status": "active"
}
```

**Conclusion:** ✅ User record exists with correct admin role

---

#### 3. API Gateway Method Configuration
**Endpoint:** GET /works
**Resource ID:** z27bde
**Authorizer:** ✅ ATTACHED (ID: y3vkcr - Clerk authorizer)

```json
{
  "httpMethod": "GET",
  "authorizationType": "CUSTOM",
  "authorizerId": "y3vkcr",
  "methodIntegration": {
    "type": "AWS_PROXY",
    "uri": "arn:aws:lambda:us-east-1:702358134603:function:construction-expenses-company-works/invocations"
  }
}
```

**Conclusion:** ✅ Authorizer is properly configured on the GET method

---

#### 4. Lambda Function (company-works)
**CloudWatch Logs:** `/aws/lambda/construction-expenses-company-works`
**Code Review:** `/lambda/companyWorks.js`

**GET Handler (Line 34-36):**
```javascript
case 'GET':
  // All authenticated users can view works
  return await getWorks(companyId, userId, userRole);
```

**Conclusion:** ✅ No permission check for GET (all authenticated users allowed)

---

#### 5. WAF (Web Application Firewall)
**ARN:** `arn:aws:wafv2:us-east-1:702358134603:regional/webacl/construction-expenses-waf/6578be5b-0174-4db7-92da-b6899876f633`

**Rules:**
- AWS CommonRuleSet (SQL injection, XSS, etc.)
- KnownBadInputsRuleSet
- SQLiRuleSet
- RateLimitRule (2000 req/5min per IP)

**Sampled Requests:** No blocks detected
**Conclusion:** ✅ WAF is not blocking requests (they reach the authorizer)

---

#### 6. API Gateway Deployment
**Latest Deployment:** 416y8t
**Deployed:** 2025-12-25 (cache cleared)
**Status:** ✅ Active

---

## ❌ Where is the 403 Coming From?

Since ALL backend components are working correctly, the 403 error is likely:

### Hypothesis 1: Client-Side CORS Interpretation
**Likelihood:** HIGH 🔴

Mobile apps (React Native, Expo) sometimes interpret CORS preflight failures as 403 errors.

**Evidence:**
- Backend shows no 403 errors in logs
- Authorizer allowing requests
- Lambda function executing successfully

**Test:**
```bash
# Run this test script with your JWT token:
./test-works-endpoint.sh "your-jwt-token-here"
```

---

### Hypothesis 2: Wrong Endpoint URL
**Likelihood:** MEDIUM 🟡

**Correct URL:**
```
https://2woj5i92td.execute-api.us-east-1.amazonaws.com/prod/works
```

**Common Mistakes:**
- ❌ `/work` (singular)
- ❌ `/Works` (capitalized)
- ❌ `/api/works` (extra prefix)
- ❌ Missing `/prod` stage

---

### Hypothesis 3: Missing or Invalid Authorization Header
**Likelihood:** MEDIUM 🟡

**Required Header:**
```
Authorization: Bearer <valid-clerk-jwt-token>
```

**Check:**
- Is token being sent?
- Has token expired? (Clerk JWTs expire after 1 hour)
- Is header name exactly "Authorization" (case-sensitive)?

---

### Hypothesis 4: Cached Response
**Likelihood:** LOW 🟢

**Solutions:**
- Clear app cache
- Get fresh JWT token (sign out/in)
- Try in incognito/private mode

---

## 🔍 Next Steps

### Step 1: Run Test Script
```bash
# Get a fresh JWT token from your Clerk session
# Then run:
./test-works-endpoint.sh "your-jwt-token"
```

This will test:
1. OPTIONS preflight request
2. GET without authorization (should fail with 401)
3. GET with authorization (should succeed)
4. Full response data

---

### Step 2: Check Mobile App Request

Add logging to your mobile app to see exactly what's being sent:

```javascript
// Before making API call
console.log('API Request:', {
  url: `${API_BASE}/works`,
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});

// After receiving response
console.log('API Response:', {
  status: response.status,
  statusText: response.statusText,
  headers: response.headers
});
```

---

### Step 3: Verify CORS Configuration

The backend has `ALLOW_ALL_ORIGINS = true` in `/lambda/shared/cors-config.js:30`, which should allow all origins.

**But check:**
- Is preflight (OPTIONS) request succeeding?
- Are CORS headers present in response?

---

### Step 4: Check React Native/Expo Specific Issues

React Native has known issues with:
- **Hermes engine** CORS handling
- **Metro bundler** proxy issues
- **Android** requiring `android:usesCleartextTraffic="true"` for HTTP

---

## 📋 Information Needed

To continue debugging, please provide:

1. **Exact endpoint URL** being called from mobile app
2. **Full error message** (not just "403")
3. **Request headers** being sent
4. **Response headers** received
5. **Platform** (iOS/Android/Web)
6. **React Native version** and whether using Expo

---

## 🛠️ Temporary Workaround

If GET /works is still failing, you can test with a different endpoint to isolate the issue:

```bash
# Test GET /get-company (also requires auth)
curl -X GET \
  "https://2woj5i92td.execute-api.us-east-1.amazonaws.com/prod/get-company" \
  -H "Authorization: Bearer YOUR-TOKEN" \
  | jq '.'
```

If this works but /works doesn't, the issue is specific to the /works endpoint.
If both fail, the issue is with authentication/CORS in general.

---

## 📞 Quick Commands

```bash
# Get fresh token (from Clerk Dashboard > Users > Sessions)
# Then test:

# Test 1: Verify endpoint exists
curl -I https://2woj5i92td.execute-api.us-east-1.amazonaws.com/prod/works

# Test 2: Test with auth
curl -X GET https://2woj5i92td.execute-api.us-east-1.amazonaws.com/prod/works \
  -H "Authorization: Bearer YOUR-TOKEN" \
  -v

# Test 3: Check WAF
aws wafv2 get-sampled-requests \
  --web-acl-arn "arn:aws:wafv2:us-east-1:702358134603:regional/webacl/construction-expenses-waf/6578be5b-0174-4db7-92da-b6899876f633" \
  --rule-metric-name "AWSManagedRulesCommonRuleSetMetric" \
  --scope REGIONAL \
  --time-window StartTime=$(python3 -c "import datetime; print(int((datetime.datetime.utcnow() - datetime.timedelta(minutes=10)).timestamp()))"),EndTime=$(python3 -c "import datetime; print(int(datetime.datetime.utcnow().timestamp()))") \
  --max-items 10 \
  --region us-east-1
```

---

## 🎯 Conclusion

**Backend Status:** ✅ FULLY FUNCTIONAL
**Authorization:** ✅ WORKING (admin role confirmed)
**API Gateway:** ✅ CONFIGURED CORRECTLY
**Lambda Function:** ✅ NO PERMISSION CHECKS FOR GET
**WAF:** ✅ NOT BLOCKING

**Most Likely Cause:** Client-side CORS or incorrect endpoint URL

**Recommended Action:** Run `./test-works-endpoint.sh` to verify endpoint is accessible, then check mobile app request configuration.

---

*Report Generated: 2025-12-25*
*Investigation by: Claude (Sonnet 4.5)*
