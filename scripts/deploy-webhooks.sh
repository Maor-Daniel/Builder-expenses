#!/bin/bash
# scripts/deploy-webhooks.sh
# Deploy Paddle and Clerk webhook Lambda functions

set -e  # Exit on error

echo "======================================"
echo "Webhook Lambda Deployment Script"
echo "======================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
REGION="us-east-1"
ROLE_ARN="arn:aws:iam::702358134603:role/lambda-execution-role"
DIST_DIR="dist"
API_ID="2woj5i92td"
TABLE_NAME="construction-expenses-production-table"

# Read environment variables from .env.production
if [ -f ".env.production" ]; then
    source <(grep -v '^#' .env.production | sed 's/^/export /')
else
    echo -e "${RED}ERROR: .env.production not found${NC}"
    exit 1
fi

echo -e "${BLUE}Step 1: Validating credentials...${NC}"

# Validate Paddle credentials
if [ "$PADDLE_API_KEY" == "your_paddle_api_key_here" ] || [ -z "$PADDLE_API_KEY" ]; then
    echo -e "${RED}ERROR: PADDLE_API_KEY not set in .env.production${NC}"
    echo "Please get your API Key from: https://sandbox-vendors.paddle.com/authentication"
    exit 1
fi

if [ "$PADDLE_WEBHOOK_SECRET" == "your_paddle_webhook_secret_here" ] || [ -z "$PADDLE_WEBHOOK_SECRET" ]; then
    echo -e "${RED}ERROR: PADDLE_WEBHOOK_SECRET not set in .env.production${NC}"
    echo "Please get your Webhook Secret from: https://sandbox-vendors.paddle.com/notifications/webhooks"
    exit 1
fi

if [ "$PADDLE_CLIENT_TOKEN" == "your_paddle_client_token_here" ] || [ -z "$PADDLE_CLIENT_TOKEN" ]; then
    echo -e "${YELLOW}WARNING: PADDLE_CLIENT_TOKEN not set (optional for webhooks)${NC}"
fi

# Validate Clerk webhook secret
if [ -z "$CLERK_WEBHOOK_SECRET" ]; then
    echo -e "${YELLOW}WARNING: CLERK_WEBHOOK_SECRET not set${NC}"
    echo "You'll need to set this after creating the webhook endpoint in Clerk Dashboard"
fi

echo -e "${GREEN}✓ Credentials validated${NC}"
echo ""

echo -e "${BLUE}Step 2: Creating DynamoDB tables for Paddle data...${NC}"

# Function to create DynamoDB table
create_table() {
    local TABLE_NAME=$1
    local KEY_SCHEMA=$2
    local ATTRIBUTE_DEFINITIONS=$3

    if aws dynamodb describe-table --table-name "$TABLE_NAME" --region "$REGION" >/dev/null 2>&1; then
        echo -e "${YELLOW}  Table $TABLE_NAME already exists${NC}"
    else
        echo -e "${BLUE}  Creating table $TABLE_NAME...${NC}"
        aws dynamodb create-table \
            --table-name "$TABLE_NAME" \
            --key-schema $KEY_SCHEMA \
            --attribute-definitions $ATTRIBUTE_DEFINITIONS \
            --billing-mode PAY_PER_REQUEST \
            --region "$REGION" >/dev/null

        # Wait for table to be active
        aws dynamodb wait table-exists --table-name "$TABLE_NAME" --region "$REGION"
        echo -e "${GREEN}  ✓ Table $TABLE_NAME created${NC}"
    fi
}

# Create Paddle tables
create_table "construction-expenses-paddle-subscriptions" \
    "AttributeName=companyId,KeyType=HASH" \
    "AttributeName=companyId,AttributeType=S"

create_table "construction-expenses-paddle-customers" \
    "AttributeName=companyId,KeyType=HASH" \
    "AttributeName=companyId,AttributeType=S"

create_table "construction-expenses-paddle-payments" \
    "AttributeName=paymentId,KeyType=HASH" \
    "AttributeName=paymentId,AttributeType=S"

create_table "construction-expenses-paddle-webhooks" \
    "AttributeName=webhookId,KeyType=HASH" \
    "AttributeName=webhookId,AttributeType=S"

# Enable TTL on webhooks table
echo -e "${BLUE}  Enabling TTL on webhooks table...${NC}"
aws dynamodb update-time-to-live \
    --table-name construction-expenses-paddle-webhooks \
    --time-to-live-specification "Enabled=true, AttributeName=ttl" \
    --region "$REGION" >/dev/null 2>&1 || echo -e "${YELLOW}  TTL already enabled or not supported${NC}"

echo -e "${GREEN}✓ DynamoDB tables ready${NC}"
echo ""

echo -e "${BLUE}Step 3: Deploying webhook Lambda functions...${NC}"

# Deploy webhookPaddle
echo -e "${BLUE}  Deploying webhookPaddle...${NC}"
if aws lambda get-function --function-name construction-expenses-webhook-paddle --region "$REGION" >/dev/null 2>&1; then
    # Update existing function
    aws lambda update-function-code \
        --function-name construction-expenses-webhook-paddle \
        --zip-file fileb://$DIST_DIR/webhookPaddle.zip \
        --region "$REGION" >/dev/null
    echo -e "${GREEN}  ✓ webhookPaddle updated${NC}"
else
    # Create new function
    aws lambda create-function \
        --function-name construction-expenses-webhook-paddle \
        --runtime nodejs18.x \
        --role "$ROLE_ARN" \
        --handler index.handler \
        --zip-file fileb://$DIST_DIR/webhookPaddle.zip \
        --timeout 30 \
        --memory-size 512 \
        --region "$REGION" >/dev/null
    echo -e "${GREEN}  ✓ webhookPaddle created${NC}"
fi

# Set environment variables for webhookPaddle
aws lambda update-function-configuration \
    --function-name construction-expenses-webhook-paddle \
    --environment "Variables={
        PADDLE_WEBHOOK_SECRET=$PADDLE_WEBHOOK_SECRET,
        TABLE_NAME=$TABLE_NAME,
        AWS_REGION=$REGION,
        NODE_ENV=production
    }" \
    --region "$REGION" >/dev/null

echo -e "${GREEN}  ✓ webhookPaddle environment variables set${NC}"

# Deploy webhookClerk
echo -e "${BLUE}  Deploying webhookClerk...${NC}"
if aws lambda get-function --function-name construction-expenses-webhook-clerk --region "$REGION" >/dev/null 2>&1; then
    # Update existing function
    aws lambda update-function-code \
        --function-name construction-expenses-webhook-clerk \
        --zip-file fileb://$DIST_DIR/webhookClerk.zip \
        --region "$REGION" >/dev/null
    echo -e "${GREEN}  ✓ webhookClerk updated${NC}"
else
    # Create new function
    aws lambda create-function \
        --function-name construction-expenses-webhook-clerk \
        --runtime nodejs18.x \
        --role "$ROLE_ARN" \
        --handler index.handler \
        --zip-file fileb://$DIST_DIR/webhookClerk.zip \
        --timeout 30 \
        --memory-size 512 \
        --region "$REGION" >/dev/null
    echo -e "${GREEN}  ✓ webhookClerk created${NC}"
fi

# Set environment variables for webhookClerk
if [ -n "$CLERK_WEBHOOK_SECRET" ]; then
    aws lambda update-function-configuration \
        --function-name construction-expenses-webhook-clerk \
        --environment "Variables={
            CLERK_WEBHOOK_SECRET=$CLERK_WEBHOOK_SECRET,
            TABLE_NAME=$TABLE_NAME,
            AWS_REGION=$REGION,
            NODE_ENV=production
        }" \
        --region "$REGION" >/dev/null
    echo -e "${GREEN}  ✓ webhookClerk environment variables set${NC}"
else
    aws lambda update-function-configuration \
        --function-name construction-expenses-webhook-clerk \
        --environment "Variables={
            TABLE_NAME=$TABLE_NAME,
            AWS_REGION=$REGION,
            NODE_ENV=production
        }" \
        --region "$REGION" >/dev/null
    echo -e "${YELLOW}  ⚠ webhookClerk deployed without CLERK_WEBHOOK_SECRET${NC}"
    echo -e "${YELLOW}    Set it later after configuring webhook in Clerk Dashboard${NC}"
fi

echo ""
echo -e "${GREEN}✓ Lambda functions deployed${NC}"
echo ""

echo -e "${BLUE}Step 4: Getting Lambda ARNs...${NC}"

PADDLE_LAMBDA_ARN=$(aws lambda get-function \
    --function-name construction-expenses-webhook-paddle \
    --region "$REGION" \
    --query 'Configuration.FunctionArn' \
    --output text)

CLERK_LAMBDA_ARN=$(aws lambda get-function \
    --function-name construction-expenses-webhook-clerk \
    --region "$REGION" \
    --query 'Configuration.FunctionArn' \
    --output text)

echo -e "${GREEN}✓ Lambda ARNs retrieved${NC}"
echo ""

echo "======================================"
echo -e "${GREEN}Deployment Complete!${NC}"
echo "======================================"
echo ""
echo "📋 Next Steps:"
echo ""
echo "1. Configure Paddle Webhook:"
echo "   URL: https://$API_ID.execute-api.$REGION.amazonaws.com/prod/webhook/paddle"
echo "   Go to: https://sandbox-vendors.paddle.com/notifications/webhooks"
echo "   Events: subscription.created, subscription.activated, subscription.updated,"
echo "           subscription.canceled, subscription.past_due,"
echo "           transaction.completed, transaction.payment_failed"
echo ""
echo "2. Configure Clerk Webhook:"
echo "   URL: https://$API_ID.execute-api.$REGION.amazonaws.com/prod/webhook/clerk"
echo "   Go to: https://dashboard.clerk.com/.../webhooks"
echo "   Events: user.deleted (required), user.created, user.updated"
echo "   Then update CLERK_WEBHOOK_SECRET in .env.production and re-run this script"
echo ""
echo "3. Configure API Gateway Routes:"
echo "   Run: bash scripts/configure-api-gateway-webhooks.sh"
echo ""
echo "Lambda Functions Deployed:"
echo "  - construction-expenses-webhook-paddle"
echo "  - construction-expenses-webhook-clerk"
echo ""
echo "DynamoDB Tables Created:"
echo "  - construction-expenses-paddle-subscriptions"
echo "  - construction-expenses-paddle-customers"
echo "  - construction-expenses-paddle-payments"
echo "  - construction-expenses-paddle-webhooks"
echo ""
