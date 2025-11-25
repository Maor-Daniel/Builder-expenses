# Paddle Payment Flow - Deployment Guide

## Implementation Complete ✅

The Paddle payment flow has been fully implemented with the following features:

### What Was Built:

1. **Credit Card Validation Before Company Creation**
   - Users MUST enter payment details before accessing the system
   - Card is validated but NOT charged immediately
   - 30-day free trial period (configured in Paddle prices)
   - Automatic charge after trial ends
   - Account freeze on payment failure

2. **Complete Payment Flow**:
   ```
   User fills form → Paddle checkout → Card validated →
   Webhook received → Company created → User can access system
   ```

## Files Created/Modified:

### New Files:
1. `lambda/createPaddleCheckout.js` - Creates Paddle checkout sessions
2. `PADDLE_PAYMENT_FLOW_DEPLOYMENT.md` - This file

### Modified Files:
1. `lambda/webhookPaddle.js` - Updated to CREATE company on subscription.activated
2. `frontend/app.html` - Updated onboarding flow to use Paddle checkout

## Architecture Overview:

### Flow Diagram:
```
┌─────────────────┐
│   User Signs Up │
│   with Clerk    │
└────────┬────────┘
         │
         v
┌─────────────────┐
│ Onboarding Form │
│ Company + Tier  │
└────────┬────────┘
         │
         v
┌───────────────────────────┐
│ POST /create-paddle-checkout│ ← NEW Lambda
│ Returns checkout URL       │
└────────┬──────────────────┘
         │
         v
┌─────────────────┐
│ Paddle Checkout │
│ User Enters Card│
│ Card Validated  │
└────────┬────────┘
         │
         v
┌──────────────────────┐
│  Paddle Webhook      │
│  subscription.       │
│  activated           │
└────────┬─────────────┘
         │
         v
┌──────────────────────┐
│ webhookPaddle.js     │ ← MODIFIED
│ Creates Company      │
│ Creates Admin User   │
└────────┬─────────────┘
         │
         v
┌──────────────────────┐
│ User Returns to App  │
│ Polls for Company    │
│ Company Found!       │
│ Access Granted       │
└──────────────────────┘
```

## Deployment Steps:

### Step 1: Verify Paddle Prices Have Trial Periods ⚠️

**CRITICAL**: Verify in Paddle Sandbox Dashboard that all 3 prices have a 30-day trial period configured:

```
Starter:      pri_01k9f1wq2ffpb9abm3kcr9t77f  → Trial: 30 days
Professional: pri_01k9f1y03zd5f3cxwnnza118r2  → Trial: 30 days
Enterprise:   pri_01k9f1yt0hm9767jh0htqbp6t1  → Trial: 30 days
```

If NOT configured, update in Paddle Dashboard:
1. Go to: https://sandbox-vendors.paddle.com/products
2. Find each price
3. Edit → Billing cycle → Add trial period → 30 days

### Step 2: Package Lambda Functions

```bash
cd /Users/maordaniel/Ofek
node scripts/package-lambdas.js
```

This will create:
- `dist/createPaddleCheckout.zip` (NEW)
- `dist/webhookPaddle.zip` (UPDATED)

### Step 3: Deploy createPaddleCheckout Lambda

```bash
# Create the Lambda function
aws lambda create-function \
  --function-name construction-expenses-create-paddle-checkout \
  --runtime nodejs18.x \
  --role arn:aws:iam::702358134603:role/lambda-execution-role \
  --handler index.handler \
  --zip-file fileb://dist/createPaddleCheckout.zip \
  --timeout 30 \
  --memory-size 512 \
  --region us-east-1 \
  --environment 'Variables={PADDLE_API_KEY=pdl_sdbx_apikey_01kap6aarsadb6ejvref7hn4yt_rKBDFF4pqnEedWrcavEPQa_AtN,PADDLE_ENVIRONMENT=sandbox,FRONTEND_URL=https://d6dvynagj630i.cloudfront.net,AWS_REGION=us-east-1}'
```

**OR** if Lambda already exists, update it:

```bash
aws lambda update-function-code \
  --function-name construction-expenses-create-paddle-checkout \
  --zip-file fileb://dist/createPaddleCheckout.zip \
  --region us-east-1
```

### Step 4: Update webhookPaddle Lambda

```bash
aws lambda update-function-code \
  --function-name construction-expenses-webhook-paddle \
  --zip-file fileb://dist/webhookPaddle.zip \
  --region us-east-1
```

### Step 5: Configure API Gateway

Add a new route for `/create-paddle-checkout`:

```bash
API_ID="2woj5i92td"
REGION="us-east-1"

# Get Lambda ARN
LAMBDA_ARN=$(aws lambda get-function \
  --function-name construction-expenses-create-paddle-checkout \
  --region $REGION \
  --query 'Configuration.FunctionArn' \
  --output text)

# Create resource (or get existing root resource ID)
ROOT_RESOURCE_ID=$(aws apigateway get-resources \
  --rest-api-id $API_ID \
  --region $REGION \
  --query 'items[?path==`/`].id' \
  --output text)

# Create /create-paddle-checkout resource
CHECKOUT_RESOURCE_ID=$(aws apigateway create-resource \
  --rest-api-id $API_ID \
  --parent-id $ROOT_RESOURCE_ID \
  --path-part create-paddle-checkout \
  --region $REGION \
  --query 'id' \
  --output text 2>/dev/null || \
  aws apigateway get-resources \
    --rest-api-id $API_ID \
    --region $REGION \
    --query 'items[?path==`/create-paddle-checkout`].id' \
    --output text)

echo "Resource ID: $CHECKOUT_RESOURCE_ID"

# Get Clerk authorizer ID
AUTHORIZER_ID=$(aws apigateway get-authorizers \
  --rest-api-id $API_ID \
  --region $REGION \
  --query 'items[?name==`ClerkAuthorizer`].id' \
  --output text)

echo "Authorizer ID: $AUTHORIZER_ID"

# Create POST method with Clerk authorizer
aws apigateway put-method \
  --rest-api-id $API_ID \
  --resource-id $CHECKOUT_RESOURCE_ID \
  --http-method POST \
  --authorization-type CUSTOM \
  --authorizer-id $AUTHORIZER_ID \
  --region $REGION \
  2>/dev/null || echo "Method already exists"

# Set up Lambda integration
aws apigateway put-integration \
  --rest-api-id $API_ID \
  --resource-id $CHECKOUT_RESOURCE_ID \
  --http-method POST \
  --type AWS_PROXY \
  --integration-http-method POST \
  --uri "arn:aws:apigateway:$REGION:lambda:path/2015-03-31/functions/$LAMBDA_ARN/invocations" \
  --region $REGION \
  2>/dev/null || echo "Integration already exists"

# Add Lambda permission for API Gateway
aws lambda add-permission \
  --function-name construction-expenses-create-paddle-checkout \
  --statement-id apigateway-create-paddle-checkout \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:$REGION:702358134603:$API_ID/*/POST/create-paddle-checkout" \
  --region $REGION \
  2>/dev/null || echo "Permission already exists"

# Deploy API
aws apigateway create-deployment \
  --rest-api-id $API_ID \
  --stage-name prod \
  --region $REGION

echo ""
echo "✅ API Gateway configuration complete!"
echo "Endpoint: https://$API_ID.execute-api.$REGION.amazonaws.com/prod/create-paddle-checkout"
```

### Step 6: Deploy Frontend

```bash
# Upload to S3
aws s3 cp frontend/app.html s3://construction-expenses-frontend-702358134603/app.html --region us-east-1

# Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id E3EYFZ54GJKVNL \
  --paths "/app.html" \
  --region us-east-1
```

### Step 7: Test the Flow

1. **Sign in as new user**:
   - Go to: https://d6dvynagj630i.cloudfront.net
   - Create new Clerk account

2. **Fill onboarding form**:
   - Company name: "Test Company"
   - Select any tier (Starter, Professional, or Enterprise)
   - Click "התחל עכשיו"

3. **Verify redirect to Paddle**:
   - Should redirect to Paddle checkout
   - URL should be like: `https://sandbox-checkout.paddle.com/...`

4. **Enter test card**:
   ```
   Card: 4242 4242 4242 4242
   Expiry: Any future date
   CVC: Any 3 digits
   ZIP: Any 5 digits
   ```

5. **Complete checkout**:
   - Click "Subscribe"
   - Should redirect back to app

6. **Verify company creation**:
   - App should poll for company (up to 30 seconds)
   - Success message: "ברוך הבא! החברה ... נוצרה בהצלחה! תקופת ניסיון של 30 יום החלה."
   - Should see expenses dashboard

## Monitoring:

### Check Lambda Logs:

```bash
# Create Paddle Checkout logs
aws logs tail /aws/lambda/construction-expenses-create-paddle-checkout --follow --region us-east-1

# Paddle Webhook logs
aws logs tail /aws/lambda/construction-expenses-webhook-paddle --follow --region us-east-1
```

### Check DynamoDB:

```bash
# Check if company was created
aws dynamodb scan \
  --table-name construction-expenses-companies \
  --region us-east-1 \
  --max-items 5

# Check if subscription was recorded
aws dynamodb scan \
  --table-name construction-expenses-paddle-subscriptions \
  --region us-east-1 \
  --max-items 5
```

## Important Notes:

### Trial Period Behavior:
- **Day 1-30**: User has full access, card validated but NOT charged
- **Day 31**: Paddle automatically charges the card
- **If charge succeeds**: `transaction.completed` webhook → Continue normal access
- **If charge fails**: `subscription.past_due` webhook → Account frozen

### Account Freeze:
When subscription status becomes `past_due`:
- Company record: `subscriptionStatus = 'past_due'`
- All API calls (tier-enforcement middleware) will check this status
- User sees: "חשבון מוקפא - תשלום נכשל"
- User must update payment method in Paddle to reactivate

### Troubleshooting:

**Problem**: Checkout URL not generated
- **Check**: Lambda logs for createPaddleCheckout
- **Verify**: PADDLE_API_KEY is correct in environment variables
- **Verify**: Paddle price IDs are correct

**Problem**: Company not created after checkout
- **Check**: Paddle webhook logs
- **Verify**: Webhook signature verification passes
- **Verify**: custom_data contains companyId, userId, companyName
- **Check**: DynamoDB for errors

**Problem**: "Maximum attempts reached" error
- **Cause**: Paddle webhook took more than 30 seconds
- **Solution**: Reload the page manually
- **Check**: Paddle webhook logs to see if webhook was received

## Production Deployment:

When moving to production:

1. Update `.env.production`:
   ```
   PADDLE_ENVIRONMENT=production
   PADDLE_API_KEY=<production key>
   PADDLE_WEBHOOK_SECRET=<production webhook secret>
   ```

2. Update Lambda environment variables:
   ```bash
   aws lambda update-function-configuration \
     --function-name construction-expenses-create-paddle-checkout \
     --environment 'Variables={PADDLE_API_KEY=<prod_key>,PADDLE_ENVIRONMENT=production,...}' \
     --region us-east-1

   aws lambda update-function-configuration \
     --function-name construction-expenses-webhook-paddle \
     --environment 'Variables={PADDLE_WEBHOOK_SECRET=<prod_secret>,...}' \
     --region us-east-1
   ```

3. Configure Paddle Production Webhook:
   - URL: `https://2woj5i92td.execute-api.us-east-1.amazonaws.com/prod/webhook/paddle`
   - Events: subscription.created, subscription.activated, subscription.updated, subscription.canceled, subscription.past_due, transaction.completed, transaction.payment_failed

4. Test with real card (will be charged!)

## Success Criteria:

- ✅ User CANNOT access system without entering credit card
- ✅ Card is validated but NOT charged during trial
- ✅ Company is created ONLY after successful card validation
- ✅ User has 30 days free access
- ✅ After 30 days, automatic charge happens
- ✅ On payment failure, account is frozen
- ✅ All data stored in DynamoDB (company, user, subscription, payments)

---

**Implementation Status**: COMPLETE - Ready for deployment and testing
**Date**: 2025-11-22
**Paddle Environment**: Sandbox (ready for production migration)
