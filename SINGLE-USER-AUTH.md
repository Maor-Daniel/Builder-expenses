# 🔒 Single-User Authentication Setup

## Overview

Your Construction Expenses Tracker is now protected with **HTTP Basic Authentication** via AWS CloudFront and Lambda@Edge. This provides a simple, secure password protection for single-user access.

## How It Works

1. **CloudFront Distribution** serves your frontend with global caching
2. **Lambda@Edge** function runs at CloudFront edge locations worldwide  
3. **Basic Auth** prompts for username/password before allowing access
4. **Secure & Fast** - Authentication happens at the edge (closest to users)

## 🚀 Deployment

When you deploy with `npm run deploy`, you'll get:

### ✅ Two URLs:
- **S3 Direct URL**: `http://bucket-name.s3-website-region.amazonaws.com` (⚠️ NOT PROTECTED)
- **CloudFront URL**: `https://d1234567890.cloudfront.net` (🔒 PROTECTED)

**Always use the CloudFront URL for secure access!**

### 🔐 Default Credentials:
- **Username**: `Levi`
- **Password**: `Levi2000`

## 🛠 Managing Authentication

### Change Password
```bash
# Generate random strong password for 'Levi'
npm run update-password Levi

# Set specific username and password  
npm run update-password Levi MySecurePass123!

# Generate random password for specific username
npm run update-password myuser
```

### View Current Credentials
After updating, credentials are saved to `basic-auth-credentials.txt` (not committed to git).

### Important Notes
- ⏱️ **Password changes take 15-30 minutes** to propagate globally (Lambda@Edge limitation)
- 🔒 Browser will remember credentials until you clear them
- 🌍 Works globally with low latency (CloudFront edge locations)

## 🎯 User Experience

1. **First Visit**: Browser shows login prompt
2. **Enter Credentials**: Username and password
3. **Access Granted**: Normal app functionality
4. **Subsequent Visits**: Browser remembers credentials

### Login Prompt
```
┌─────────────────────────────────────┐
│ 🔒 Authentication Required          │
│                                     │
│ The site says:                      │
│ "Construction Expenses Tracker"     │
│                                     │
│ Username: [____________]            │
│ Password: [____________]            │
│                                     │
│  [ Cancel ]  [ Sign In ]           │
└─────────────────────────────────────┘
```

## 🔧 Advanced Configuration

### Custom Login Page
The Lambda@Edge function returns a custom HTML page for unauthorized users. You can modify this in the CloudFormation template or Lambda function code.

### HTTPS Only
CloudFront automatically redirects HTTP to HTTPS for security.

### Regional Deployment
Lambda@Edge must be deployed to `us-east-1` (N. Virginia) region, but works globally.

## 📊 Cost Estimation (Single User)

**Extremely cost-effective for single user:**
- CloudFront: ~$0.01-0.10/month (minimal traffic)
- Lambda@Edge: ~$0.01/month (few executions)
- S3: ~$0.01/month (small static site)

**Total: ~$0.05-0.15/month** 💰

## 🔒 Security Features

- ✅ **HTTPS Only** - All traffic encrypted
- ✅ **Global Protection** - Authentication at every edge location  
- ✅ **No Database** - Credentials stored in Lambda code (more secure than DB for single user)
- ✅ **No Session Management** - Browser handles credential caching
- ✅ **Strong Password Support** - Automatic generation available

## 🚨 Alternative Options (if needed later)

### Option 1: Custom Login Form (More Complex)
If you want a custom login form instead of browser popup:
- Add login page to frontend
- Use JWT tokens
- Store token in localStorage

### Option 2: IP Whitelisting (AWS WAF)
Restrict access to specific IP addresses only:
- AWS WAF rules
- Block all except your IP
- Good for static IP users

### Option 3: VPN Access Only
Most secure for sensitive data:
- AWS Client VPN
- Private subnet deployment
- No public internet access

## 📋 Deployment Checklist

### Pre-Deployment:
- [ ] Review default credentials in CloudFormation template
- [ ] Consider changing default password before first deployment

### Post-Deployment:
- [ ] Test CloudFront URL with default credentials
- [ ] Change password using `npm run update-password`
- [ ] Save new credentials securely
- [ ] Test new password (wait 15-30 minutes for propagation)
- [ ] Bookmark the CloudFront URL (not S3 URL)

## 🆘 Troubleshooting

### "Still Asking for Password"
- Wait 15-30 minutes for Lambda@Edge propagation
- Clear browser cache and cookies
- Try incognito/private browsing mode

### "Wrong Password"
- Verify credentials in `basic-auth-credentials.txt`
- Check if you're using CloudFront URL (not S3 URL)
- Wait for propagation if recently changed

### "Can't Access Site"
- Ensure you're using `https://` CloudFront URL
- Check CloudFormation stack deployed successfully
- Verify Lambda@Edge function exists in us-east-1

---

**🎉 Your Construction Expenses Tracker is now securely protected with single-user authentication!**

Use the CloudFront URL with your credentials to access the protected application.