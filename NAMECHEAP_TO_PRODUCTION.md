# Namecheap Domain to Production - Complete Setup Guide

**Date**: 2025-11-09
**Domain**: builder-expenses.com (purchased at Namecheap)
**Status**: In Progress - Following final steps

---

## ✅ What's Done

- ✅ Domain purchased at Namecheap
- ✅ Route53 A records created (PENDING propagation)
- ✅ SSL certificate ready (PENDING validation)
- ✅ CloudFront distribution ready (needs custom domain config)

---

## ⏳ What You Need To Do NOW (5 minutes)

### Step 1: Update Nameservers in Namecheap

**Login to Namecheap and follow these steps:**

1. Go to **Namecheap Dashboard** (namecheap.com)
2. Find **builder-expenses.com** and click **Manage**
3. On the left sidebar, click **Nameservers**
4. Change from **Namecheap BasicDNS** to **Custom DNS**
5. Enter these 4 nameservers (replace existing ones):
   ```
   ns-1808.awsdns-34.co.uk
   ns-283.awsdns-35.com
   ns-1519.awsdns-61.org
   ns-559.awsdns-05.net
   ```
6. Click **Save Changes** / **Apply**

**Screenshot Location in Namecheap:**
- Dashboard → Your Domain → Manage → Domain Settings → Nameservers

---

## 🔄 What Happens Automatically (10-20 minutes after Step 1)

### Timeline

```
Nameserver Update in Namecheap
            ↓ (5-10 min DNS propagation)
Route53 Nameservers Active
            ↓
SSL Certificate Auto-Validates
            ↓ (immediate)
System LIVE at https://builder-expenses.com
```

---

## 📋 Verification Steps

### Check 1: Verify Nameservers Updated (5-10 minutes after update)

```bash
nslookup builder-expenses.com
# Should show Route53 nameservers
```

### Check 2: Verify Domain Resolution (5-10 minutes)

```bash
# Should resolve to CloudFront IP
dig builder-expenses.com
```

### Check 3: Check SSL Certificate Status

```bash
aws acm describe-certificate \
  --certificate-arn arn:aws:acm:us-east-1:702358134603:certificate/d2ed8e9f-1add-4900-9422-8b67518d6013 \
  --region us-east-1 \
  --query 'Certificate.Status' \
  --output text
# Should change from PENDING_VALIDATION to ISSUED
```

---

## What I've Already Done For You

✅ Created Route53 hosted zone (Z04591712YU2SIR3FUZZM)
✅ Created Route53 A records pointing to CloudFront
✅ Requested SSL certificate
✅ Created DNS validation records
✅ Deployed CloudFront distribution
✅ All Lambda functions deployed
✅ Frontend deployed to S3

---

## What I'll Do After Nameserver Update

Once you update the nameservers in Namecheap and confirm, I will:

1. **Verify SSL certificate validation** (automatic, 5-10 minutes)
2. **Update CloudFront distribution** with:
   - Custom domain: builder-expenses.com
   - SSL certificate: attached
   - HTTPS forced
3. **Create final Route53 records** if needed
4. **Test everything** (all URLs, HTTPS, API endpoints)
5. **Confirm production launch**

---

## Current System Status

✅ **CloudFront URL** (works now):
```
https://d6dvynagj630i.cloudfront.net
```

✅ **Custom Domain** (will work after nameserver update):
```
https://builder-expenses.com
https://www.builder-expenses.com
```

---

## Estimated Timeline

| Action | Time | Status |
|--------|------|--------|
| Update nameservers (you) | 5 min | ⏳ TODO |
| DNS propagation (automatic) | 5-10 min | ⏳ Pending |
| Certificate validates (automatic) | 5-10 min | ⏳ Pending |
| CloudFront update (our team) | 5 min | ⏳ Pending |
| Final testing (our team) | 10 min | ⏳ Pending |
| **TOTAL** | **30-40 min** | ⏳ |

---

## Troubleshooting

### Issue: "Nameserver change took too long"
- Nameserver propagation can take up to 48 hours (usually 5-30 minutes)
- You can check status with: `nslookup builder-expenses.com`
- Certificate will auto-validate once propagated

### Issue: "Certificate still PENDING after 30 minutes"
- Check if nameservers are properly updated in Namecheap
- Verify with: `nslookup builder-expenses.com`
- If nameservers still showing old ones, wait longer or contact Namecheap

### Issue: "Domain works but HTTPS shows error"
- Usually means certificate validation is still in progress
- Wait 5-10 more minutes and refresh browser
- Clear browser cache (Ctrl+Shift+Delete)

---

## Next Steps

### 1. **NOW** - Update Nameservers
Go to Namecheap and update nameservers to Route53 ones (listed above)

### 2. **In 5 minutes** - Tell Me When Done
Reply with: "Nameservers updated in Namecheap"

### 3. **In 10-20 minutes** - I'll Verify & Complete
I'll:
- Verify certificate validation
- Update CloudFront
- Run final tests
- Confirm production launch

### 4. **In 30-40 minutes** - LIVE!
System live at https://builder-expenses.com with green padlock!

---

## Important Information

| Item | Value |
|------|-------|
| **Domain** | builder-expenses.com |
| **Hosted Zone ID** | Z04591712YU2SIR3FUZZM |
| **CloudFront ID** | E3EYFZ54GJKVNL |
| **SSL Certificate ARN** | arn:aws:acm:us-east-1:702358134603:certificate/d2ed8e9f-1add-4900-9422-8b67518d6013 |
| **Certificate Status** | PENDING_VALIDATION → ISSUED (auto) |
| **A Records** | Created (PENDING propagation) |
| **Region** | us-east-1 |

---

## Support

**If you get stuck:**
- Check that you entered all 4 nameservers correctly
- Give DNS 5-10 minutes to propagate
- Check browser cache (might be cached)
- Contact us if issues persist after 30 minutes

---

## Summary

You're almost there! Just update the nameservers in Namecheap and everything else is automatic!

**Time to complete: 5 minutes (just updating Namecheap)**
**Time until LIVE: 30-40 minutes total**

Go ahead and update those nameservers! 🚀
