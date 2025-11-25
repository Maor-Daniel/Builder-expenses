# Namecheap DNS Setup Guide for builder-expenses.com

**Date**: November 21, 2025
**CloudFront Distribution**: `d6dvynagj630i.cloudfront.net`
**CloudFront ID**: `E3EYFZ54GJKVNL`

---

## Step-by-Step Instructions

### Step 1: Log into Namecheap

1. Go to [namecheap.com](https://www.namecheap.com)
2. Click **Sign In** (top right)
3. Enter your credentials

---

### Step 2: Access Domain Management

1. After logging in, click **Domain List** (left sidebar)
2. Find `builder-expenses.com`
3. Click **Manage** button next to the domain

---

### Step 3: Configure DNS Settings

1. In the domain management page, click the **Advanced DNS** tab
2. You'll see a list of DNS records

---

### Step 4: Add DNS Records

You need to add **2 CNAME records** to point your domain to CloudFront.

#### Option A: Using CNAME Records (Recommended for Namecheap)

**Record 1: Apex Domain (builder-expenses.com)**

Click **Add New Record** and enter:
- **Type**: `CNAME Record`
- **Host**: `@`
- **Value**: `d6dvynagj630i.cloudfront.net`
- **TTL**: `Automatic` (or `300` for faster updates)

**Record 2: WWW Subdomain (www.builder-expenses.com)**

Click **Add New Record** again and enter:
- **Type**: `CNAME Record`
- **Host**: `www`
- **Value**: `d6dvynagj630i.cloudfront.net`
- **TTL**: `Automatic` (or `300` for faster updates)

---

### Step 5: Remove Conflicting Records (If Any)

**IMPORTANT**: You cannot have multiple records for the same host.

If you see any of these existing records, **DELETE them**:
- Any `A Record` with Host `@`
- Any `A Record` with Host `www`
- Any `URL Redirect Record` with Host `@` or `www`
- Namecheap's default parking page record

---

### Step 6: Verify Nameservers

While still in the domain management page:

1. Go to the **Domain** tab
2. Look for **Nameservers** section
3. Make sure it says **Namecheap BasicDNS** or **Namecheap PremiumDNS**

If it shows custom nameservers, you'll need to change them back to Namecheap's:
- Click **Nameservers** dropdown
- Select **Namecheap BasicDNS**
- Click checkmark to save

---

### Step 7: Save Changes

1. Scroll down and click **Save All Changes** button
2. Wait for confirmation message

---

## Expected DNS Configuration

After setup, your DNS records should look like this:

| Type  | Host | Value                        | TTL       |
|-------|------|------------------------------|-----------|
| CNAME | @    | d6dvynagj630i.cloudfront.net | Automatic |
| CNAME | www  | d6dvynagj630i.cloudfront.net | Automatic |

---

## Important Notes

### CNAME Limitations at Apex (@ Record)

Some DNS providers don't allow CNAME records at the apex domain (`@`). If Namecheap gives you an error when adding the `@` CNAME:

**Solution 1: CNAME Flattening**
- Namecheap supports CNAME flattening, so this should work
- If it doesn't, use Solution 2

**Solution 2: Use ALIAS Record (if available)**
- Type: `ALIAS`
- Host: `@`
- Value: `d6dvynagj630i.cloudfront.net`

**Solution 3: Use URL Redirect**
- Keep only the `www` CNAME record
- Add URL Redirect:
  - Type: `URL Redirect Record`
  - Host: `@`
  - Value: `http://www.builder-expenses.com`
  - Redirect Type: `Permanent (301)`

---

## Propagation Time

DNS changes can take time to propagate globally:
- **Fastest**: 5-15 minutes
- **Typical**: 30-60 minutes
- **Maximum**: 24-48 hours

**Why it varies**:
- TTL (Time To Live) settings
- ISP DNS caching
- Geographic location

---

## Verification Steps

### Step 1: Wait 5-10 Minutes
Give DNS time to propagate

### Step 2: Check DNS Propagation

Use online tools to check if DNS has propagated:
- [whatsmydns.net](https://www.whatsmydns.net/)
  - Enter: `builder-expenses.com`
  - Select: `CNAME` record type
  - Click **Search**
  - Should show: `d6dvynagj630i.cloudfront.net`

- [dnschecker.org](https://dnschecker.org/)
  - Enter: `builder-expenses.com`
  - Select: `CNAME`
  - Check global propagation

### Step 3: Test with Command Line

On your computer, run:

```bash
# Check apex domain
nslookup builder-expenses.com

# Check www subdomain
nslookup www.builder-expenses.com

# Or use dig (Mac/Linux)
dig builder-expenses.com
dig www.builder-expenses.com
```

**Expected output**:
```
builder-expenses.com
...
canonical name = d6dvynagj630i.cloudfront.net
```

### Step 4: Test in Browser

Once DNS propagates:

1. Open browser
2. Go to: `https://builder-expenses.com`
3. Should load your application with SSL (padlock icon)
4. Try: `https://www.builder-expenses.com`
5. Both should work

---

## Troubleshooting

### Issue 1: "CNAME Not Allowed at Apex" Error

**Solution**:
- Use URL Redirect for `@` → `www`
- Keep only `www` CNAME record

### Issue 2: DNS Not Propagating After 1 Hour

**Check**:
1. Nameservers are set to Namecheap (not custom)
2. No typos in CloudFront domain
3. Records saved correctly

**Fix**:
- Delete and re-add the records
- Lower TTL to 60 seconds
- Clear your local DNS cache:
  ```bash
  # Mac
  sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder

  # Windows
  ipconfig /flushdns

  # Linux
  sudo systemd-resolve --flush-caches
  ```

### Issue 3: SSL Certificate Error in Browser

**Cause**: DNS not fully propagated or CloudFront not ready

**Solution**:
- Wait 30 more minutes
- Try incognito/private browsing mode
- Clear browser cache

### Issue 4: "This Site Can't Be Reached"

**Possible Causes**:
1. DNS not propagated yet → Wait
2. Wrong CloudFront domain → Verify: `d6dvynagj630i.cloudfront.net`
3. CloudFront distribution disabled → Check AWS Console

---

## Post-Deployment Checks

After DNS propagates, verify:

- [ ] `https://builder-expenses.com` loads
- [ ] `https://www.builder-expenses.com` loads
- [ ] SSL certificate shows "Secure" (padlock)
- [ ] Certificate issued to: `builder-expenses.com`
- [ ] Certificate issuer: Amazon
- [ ] Login with Clerk works
- [ ] Can create projects/expenses/contractors
- [ ] Receipt upload works
- [ ] All API calls succeed (check browser console)

---

## DNS Record Template (Copy/Paste)

If Namecheap support asks for your DNS configuration:

```
Type: CNAME
Host: @
Value: d6dvynagj630i.cloudfront.net
TTL: 300

Type: CNAME
Host: www
Value: d6dvynagj630i.cloudfront.net
TTL: 300
```

---

## Rollback Plan

If something goes wrong and you need to revert:

1. Log into Namecheap
2. Go to **Advanced DNS**
3. Delete the CNAME records
4. Re-enable Namecheap parking page (if needed)
5. DNS will revert within 5-30 minutes

**Note**: Keep this guide handy in case you need to revert!

---

## Next Steps After DNS Setup

1. **Wait for DNS propagation** (5-60 minutes)
2. **Test the site** thoroughly
3. **Implement Priority 1 fixes** from `DeploymentReadyFix.md`:
   - Enable DynamoDB backups
   - Add API throttling
   - Set up CloudWatch alarms
4. **Monitor for 24 hours** for any issues
5. **Soft launch** to limited users
6. **Implement Priority 2 fixes** within first week

---

## Support Contacts

If you encounter issues:

1. **Namecheap Support**:
   - Live Chat: Available 24/7
   - Phone: Check Namecheap website for current number
   - Ticket: Submit through Namecheap dashboard

2. **DNS Propagation**:
   - Usually automatic, no support needed
   - Check online tools: whatsmydns.net

3. **CloudFront/SSL**:
   - Issue is likely DNS, not AWS
   - AWS SSL certificate is already valid

---

## Quick Reference

| Item | Value |
|------|-------|
| **Domain** | builder-expenses.com |
| **CloudFront URL** | d6dvynagj630i.cloudfront.net |
| **CloudFront ID** | E3EYFZ54GJKVNL |
| **SSL Certificate** | arn:aws:acm:us-east-1:702358134603:certificate/d2ed8e9f-1add-4900-9422-8b67518d6013 |
| **API Endpoint** | https://2woj5i92td.execute-api.us-east-1.amazonaws.com/prod |
| **S3 Frontend Bucket** | construction-expenses-production-frontend-702358134603 |

---

**Document Version**: 1.0
**Last Updated**: 2025-11-21
**Status**: Ready to implement
