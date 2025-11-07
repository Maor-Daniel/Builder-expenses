# 🏗️ Paddle Integration Setup Guide

## Phase 1: Complete Setup Checklist

This guide will help you integrate Paddle for subscription management and replace Cognito authentication in your Construction Expenses SAAS.

## 📋 Prerequisites

1. **Paddle Account**: Sign up at [paddle.com](https://paddle.com)
2. **AWS Account**: Access to Lambda, DynamoDB, API Gateway
3. **Domain**: For webhook endpoints (recommended)

## 🎯 Step 1: Paddle Account Setup

### 1.1 Create Paddle Account
1. Go to [paddle.com](https://paddle.com) and sign up
2. Choose "Software/SaaS" as your business type
3. Complete business verification process
4. Note: Verification can take 1-3 business days

### 1.2 Get API Credentials
After account approval, get these from your Paddle dashboard:

```bash
# From Paddle Dashboard > Developer Tools > API Keys
PADDLE_API_KEY=your_api_key_here

# From Paddle Dashboard > Developer Tools > Notifications > Webhook Destinations
PADDLE_WEBHOOK_SECRET=your_webhook_secret_here
```

### 1.3 Create Subscription Products
In your Paddle dashboard, create these subscription plans:

#### Starter Plan
- **Name**: Construction Starter
- **Price**: $29/month or $290/year
- **Description**: Perfect for small contractors
- **Features**: 5 users, 10 projects, basic reporting

#### Professional Plan  
- **Name**: Construction Professional
- **Price**: $79/month or $790/year
- **Description**: For growing construction companies
- **Features**: 25 users, unlimited projects, advanced reporting

#### Enterprise Plan
- **Name**: Construction Enterprise  
- **Price**: $199/month or $1990/year
- **Description**: For large construction firms
- **Features**: Unlimited users, unlimited projects, custom integrations

After creating each plan, note the **Price ID** for each (these start with `pri_`):
```bash
PADDLE_STARTER_PRICE_ID=pri_01234567890abcdef
PADDLE_PRO_PRICE_ID=pri_01234567890abcdef  
PADDLE_ENTERPRISE_PRICE_ID=pri_01234567890abcdef
```

## 🗄️ Step 2: Setup DynamoDB Tables

### 2.1 Deploy CloudFormation Stack
```bash
cd infrastructure
aws cloudformation create-stack \
  --stack-name construction-expenses-paddle-tables \
  --template-body file://paddle-tables.yaml \
  --region us-east-1
```

### 2.2 Verify Tables Created
```bash
aws dynamodb list-tables --region us-east-1 | grep paddle
```

Expected output:
- `construction-expenses-paddle-subscriptions`
- `construction-expenses-paddle-payments`  
- `construction-expenses-paddle-customers`
- `construction-expenses-paddle-webhooks`

## ⚡ Step 3: Deploy Lambda Functions

### 3.1 Package Lambda Functions
```bash
cd lambda

# Package Paddle webhook handler
zip -r dist/paddleWebhook.zip paddleWebhook.js shared/

# Package subscription manager
zip -r dist/subscriptionManager.zip subscriptionManager.js shared/
```

### 3.2 Create Lambda Functions
```bash
# Create webhook handler
aws lambda create-function \
  --function-name construction-expenses-paddle-webhook \
  --runtime nodejs18.x \
  --role arn:aws:iam::YOUR_ACCOUNT:role/construction-expenses-multi-table-lambda-role \
  --handler paddleWebhook.handler \
  --zip-file fileb://dist/paddleWebhook.zip \
  --timeout 30 \
  --environment Variables="{PADDLE_ENVIRONMENT=sandbox,PADDLE_VENDOR_ID=your_vendor_id,PADDLE_API_KEY=your_api_key,PADDLE_PUBLIC_KEY=your_public_key}" \
  --region us-east-1

# Create subscription manager  
aws lambda create-function \
  --function-name construction-expenses-subscription-manager \
  --runtime nodejs18.x \
  --role arn:aws:iam::YOUR_ACCOUNT:role/construction-expenses-multi-table-lambda-role \
  --handler subscriptionManager.handler \
  --zip-file fileb://dist/subscriptionManager.zip \
  --timeout 30 \
  --environment Variables="{PADDLE_ENVIRONMENT=sandbox,PADDLE_VENDOR_ID=your_vendor_id,PADDLE_API_KEY=your_api_key}" \
  --region us-east-1
```

## 🌐 Step 4: Setup API Gateway Endpoints

### 4.1 Add Subscription Endpoints
```bash
# Get your API Gateway REST API ID
API_ID="2woj5i92td"
ROOT_RESOURCE_ID="sp5ue0etie"

# Create /subscription resource
aws apigateway create-resource \
  --rest-api-id $API_ID \
  --parent-id $ROOT_RESOURCE_ID \
  --path-part subscription \
  --region us-east-1

# Get subscription resource ID (save this)
SUBSCRIPTION_RESOURCE_ID="resource_id_here"

# Create subscription endpoints
for path in plans status usage create upgrade update cancel; do
  aws apigateway create-resource \
    --rest-api-id $API_ID \
    --parent-id $SUBSCRIPTION_RESOURCE_ID \
    --path-part $path \
    --region us-east-1
done
```

### 4.2 Add Webhook Endpoint
```bash
# Create /webhook resource  
aws apigateway create-resource \
  --rest-api-id $API_ID \
  --parent-id $ROOT_RESOURCE_ID \
  --path-part webhook \
  --region us-east-1

# Create /webhook/paddle resource
WEBHOOK_RESOURCE_ID="webhook_resource_id"
aws apigateway create-resource \
  --rest-api-id $API_ID \
  --parent-id $WEBHOOK_RESOURCE_ID \
  --path-part paddle \
  --region us-east-1
```

### 4.3 Configure Methods and Integrations
See the detailed API Gateway configuration in `api-gateway-config.md`

## 🔗 Step 5: Configure Webhooks in Paddle

### 5.1 Set Webhook URL
In your Paddle dashboard:
1. Go to Developer Tools > Notifications
2. Create a new webhook destination with URL: `https://2woj5i92td.execute-api.us-east-1.amazonaws.com/prod/webhook/paddle`
3. Select these events:
   - subscription.created
   - subscription.updated  
   - subscription.canceled
   - transaction.completed
   - transaction.payment_failed
   - adjustment.created

### 5.2 Test Webhook
```bash
# Test webhook endpoint
curl -X POST "https://2woj5i92td.execute-api.us-east-1.amazonaws.com/prod/webhook/paddle" \
  -H "Content-Type: application/json" \
  -H "Paddle-Signature: ts=1234567890;h1=test" \
  -d '{"event_type": "test", "notification_id": "ntf_test"}'
```

## 🎨 Step 6: Update Frontend

### 6.1 Configure Paddle in Frontend
Update `/frontend/index.html`:

```javascript
// Update PADDLE_CONFIG with your actual credentials
const PADDLE_CONFIG = {
    environment: 'sandbox', // Change to 'production' when ready
    clientToken: 'your_actual_paddle_client_token'
};

// Initialize Paddle
Paddle.Setup({
    environment: PADDLE_CONFIG.environment,
    token: PADDLE_CONFIG.clientToken
});
```

### 6.2 Add Subscription UI
Add subscription management components (see detailed UI guide in `paddle-ui-components.md`)

## 🔄 Step 7: Migration Strategy

### 7.1 Phase 1: Parallel Systems (Current)
- Keep Cognito authentication running
- Add Paddle subscription management  
- Use environment flags to control which system is active

### 7.2 Phase 2: Gradual Migration
```bash
# Environment variables for gradual rollout
PADDLE_AUTH_ENABLED=false
COGNITO_AUTH_ENABLED=true
PADDLE_ENABLED_COMPANIES=comp_123,comp_456  # Specific companies to migrate
```

### 7.3 Phase 3: Full Paddle
- Migrate all companies to Paddle customers
- Switch authentication to Paddle
- Remove Cognito dependencies

## ✅ Step 8: Testing

### 8.1 Test Subscription Flow
1. Create test subscription in Paddle sandbox
2. Verify webhook receives events
3. Check DynamoDB tables are populated
4. Test subscription limits in app

### 8.2 Test Authentication
1. Create test user with Paddle auth
2. Verify JWT token parsing works
3. Test subscription-based feature access

## 🚀 Step 9: Production Deployment

### 9.1 Switch to Production Environment
```bash
# Update environment variables
PADDLE_ENVIRONMENT=production
# Update all Paddle credentials to production values
```

### 9.2 Update Webhook URLs
- Change webhook URL in Paddle dashboard to production API Gateway endpoint
- Test webhook delivery in production

### 9.3 Go Live Checklist
- [ ] Paddle account approved for production
- [ ] All environment variables updated
- [ ] Webhook endpoints tested
- [ ] Subscription plans configured
- [ ] Payment methods tested
- [ ] Customer portal working
- [ ] Migration script ready (if needed)

## 📞 Support

### Paddle Support
- Documentation: [paddle.com/docs](https://paddle.com/docs)
- Support: Available in Paddle dashboard

### Implementation Support
- Check logs in CloudWatch for Lambda functions
- Monitor DynamoDB for data consistency
- Test webhook delivery in Paddle dashboard

## 🔧 Troubleshooting

### Common Issues

1. **Webhook Signature Verification Fails**
   - Check PADDLE_PUBLIC_KEY is correct
   - Verify webhook URL is accessible
   - Check CloudWatch logs for details

2. **Subscription Limits Not Working**
   - Verify plan limits in `paddle-utils.js`
   - Check company record has correct `currentPlan`
   - Test `validateSubscriptionLimits()` function

3. **Authentication Errors**
   - Ensure JWT parsing works with Paddle tokens
   - Check `PADDLE_AUTH_ENABLED` environment variable
   - Verify company records have `paddleCustomerId`

This completes Phase 1 of Paddle integration. Your system will now support subscription management alongside existing Cognito authentication.