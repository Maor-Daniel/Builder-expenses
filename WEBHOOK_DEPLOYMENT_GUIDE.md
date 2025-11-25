# Webhook Deployment Guide

## Current Status

✅ **Completed**:
- Webhook handlers created (webhookPaddle.js, webhookClerk.js)
- Code updated with correct Enterprise Price ID
- Packages created (dist/webhookPaddle.zip, dist/webhookClerk.zip)
- Paddle credentials added to .env.production

## Step-by-Step Deployment

### Step 1: Create DynamoDB Tables

Run these commands to create the required tables:

```bash
# Create Paddle subscriptions table
aws dynamodb create-table \
  --table-name construction-expenses-paddle-subscriptions \
  --key-schema AttributeName=companyId,KeyType=HASH \
  --attribute-definitions AttributeName=companyId,AttributeType=S \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1

# Create Paddle customers table
aws dynamodb create-table \
  --table-name construction-expenses-paddle-customers \
  --key-schema AttributeName=companyId,KeyType=HASH \
  --attribute-definitions AttributeName=companyId,AttributeType=S \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1

# Create Paddle payments table
aws dynamodb create-table \
  --table-name construction-expenses-paddle-payments \
  --key-schema AttributeName=paymentId,KeyType=HASH \
  --attribute-definitions AttributeName=paymentId,AttributeType=S \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1

# Create Paddle webhooks table (with TTL for automatic cleanup)
aws dynamodb create-table \
  --table-name construction-expenses-paddle-webhooks \
  --key-schema AttributeName=webhookId,KeyType=HASH \
  --attribute-definitions AttributeName=webhookId,AttributeType=S \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1

# Enable TTL on webhooks table (90-day auto-cleanup)
aws dynamodb update-time-to-live \
  --table-name construction-expenses-paddle-webhooks \
  --time-to-live-specification Enabled=true,AttributeName=ttl \
  --region us-east-1
```

### Step 2: Deploy webhookPaddle Lambda

```bash
cd /Users/maordaniel/Ofek

# Create the Lambda function
aws lambda create-function \
  --function-name construction-expenses-webhook-paddle \
  --runtime nodejs18.x \
  --role arn:aws:iam::702358134603:role/lambda-execution-role \
  --handler index.handler \
  --zip-file fileb://dist/webhookPaddle.zip \
  --timeout 30 \
  --memory-size 512 \
  --region us-east-1

# Set environment variables (USE YOUR ACTUAL VALUES)
aws lambda update-function-configuration \
  --function-name construction-expenses-webhook-paddle \
  --environment 'Variables={PADDLE_WEBHOOK_SECRET=whsec_DWBSZQEZ4eUy1eeoXb+DUZfd/2lmg6rV,TABLE_NAME=construction-expenses-production-table,AWS_REGION=us-east-1,NODE_ENV=production}' \
  --region us-east-1
```

### Step 3: Deploy webhookClerk Lambda

```bash
# Create the Lambda function
aws lambda create-function \
  --function-name construction-expenses-webhook-clerk \
  --runtime nodejs18.x \
  --role arn:aws:iam::702358134603:role/lambda-execution-role \
  --handler index.handler \
  --zip-file fileb://dist/webhookClerk.zip \
  --timeout 30 \
  --memory-size 512 \
  --region us-east-1

# Set environment variables (you'll need to add CLERK_WEBHOOK_SECRET after creating the webhook in Clerk Dashboard)
aws lambda update-function-configuration \
  --function-name construction-expenses-webhook-clerk \
  --environment 'Variables={TABLE_NAME=construction-expenses-production-table,AWS_REGION=us-east-1,NODE_ENV=production}' \
  --region us-east-1
```

### Step 4: Create API Gateway Routes

#### Option A: Using AWS Console
1. Go to API Gateway console
2. Select API: `2woj5i92td`
3. Create resource: `/webhook`
4. Create child resource: `/paddle`
5. Create POST method, integrate with `construction-expenses-webhook-paddle` Lambda
6. Create child resource under `/webhook`: `/clerk`
7. Create POST method, integrate with `construction-expenses-webhook-clerk` Lambda
8. Deploy to `prod` stage

#### Option B: Using AWS CLI (coming soon)
We can create a script for this if needed.

### Step 5: Configure Paddle Webhook

1. Go to: https://sandbox-vendors.paddle.com/notifications/webhooks
2. Click "Add Webhook Endpoint"
3. **URL**: `https://2woj5i92td.execute-api.us-east-1.amazonaws.com/prod/webhook/paddle`
4. **Events to enable**:
   - subscription.created
   - subscription.activated
   - subscription.updated
   - subscription.canceled
   - subscription.past_due
   - transaction.completed
   - transaction.payment_failed
5. **Save** and copy the webhook secret
6. **Important**: The secret is already in your Lambda environment variables (set in Step 2)

### Step 6: Configure Clerk Webhook

1. Go to: https://dashboard.clerk.com/apps/app_35IahsH8vYhNw77SsrN4YUgvKk5/instances/ins_35Iahumb9tGAVN9dnypW3oaFPbk/webhooks
2. Click "Add Endpoint"
3. **URL**: `https://2woj5i92td.execute-api.us-east-1.amazonaws.com/prod/webhook/clerk`
4. **Events to enable**:
   - user.deleted (REQUIRED - removes deleted users from companies)
   - user.created (optional - for analytics)
   - user.updated (optional - syncs profile changes)
5. **Save** and copy the signing secret
6. **Update the Lambda environment variable**:

```bash
aws lambda update-function-configuration \
  --function-name construction-expenses-webhook-clerk \
  --environment 'Variables={CLERK_WEBHOOK_SECRET=YOUR_CLERK_SIGNING_SECRET_HERE,TABLE_NAME=construction-expenses-production-table,AWS_REGION=us-east-1,NODE_ENV=production}' \
  --region us-east-1
```

Replace `YOUR_CLERK_SIGNING_SECRET_HERE` with the actual secret from Clerk Dashboard.

### Step 7: Test Webhooks

#### Test Paddle Webhook:
```bash
# Check Lambda logs
aws logs tail /aws/lambda/construction-expenses-webhook-paddle --follow --region us-east-1
```

Then trigger a test event from Paddle Dashboard.

#### Test Clerk Webhook:
```bash
# Check Lambda logs
aws logs tail /aws/lambda/construction-expenses-webhook-clerk --follow --region us-east-1
```

Then trigger a test event from Clerk Dashboard (or create/update a user).

## Webhook URLs

- **Paddle**: `https://2woj5i92td.execute-api.us-east-1.amazonaws.com/prod/webhook/paddle`
- **Clerk**: `https://2woj5i92td.execute-api.us-east-1.amazonaws.com/prod/webhook/clerk`

## Troubleshooting

### Lambda not receiving webhooks
- Check API Gateway integration
- Verify Lambda permissions (API Gateway should be able to invoke it)
- Check CloudWatch Logs for errors

### Webhook signature verification fails
- Ensure PADDLE_WEBHOOK_SECRET is correctly set
- Ensure CLERK_WEBHOOK_SECRET is correctly set
- Check for extra spaces or quotes in environment variables

### Database errors
- Verify DynamoDB tables exist
- Check Lambda IAM role has DynamoDB permissions

## Summary of Credentials Needed

From your `.env.production`:
- ✅ PADDLE_API_KEY: `pdl_sdbx_apikey_01kap6aarsadb6ejvref7hn4yt_rKBDFF4pqnEedWrcavEPQa_AtN`
- ✅ PADDLE_WEBHOOK_SECRET: `whsec_DWBSZQEZ4eUy1eeoXb+DUZfd/2lmg6rV`
- ❓ CLERK_WEBHOOK_SECRET: (Get this after creating Clerk webhook endpoint)

## Price IDs Now Configured

- Starter: `pri_01k9f1wq2ffpb9abm3kcr9t77f` (100 ILS/month)
- Professional: `pri_01k9f1y03zd5f3cxwnnza118r2` (200 ILS/month)
- Enterprise: `pri_01k9f1yt0hm9767jh0htqbp6t1` (300 ILS/month)
