#!/bin/bash

# Deploy all Lambda functions to AWS
# Maps camelCase zip files to kebab-case AWS function names
# Uses CloudFormation-managed IAM role and environment variables

set -e

REGION="us-east-1"
STACK_NAME="construction-expenses-production"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="${PROJECT_ROOT}/dist"
ENV_CONFIG_FILE="${PROJECT_ROOT}/infrastructure/lambda-env-config.json"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}   Lambda Deployment - CloudFormation Integration${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}\n"

# Retrieve CloudFormation IAM Role ARN
echo -e "${BLUE}🔍 Retrieving CloudFormation IAM Role ARN...${NC}"
LAMBDA_ROLE_ARN=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --query 'Stacks[0].Outputs[?OutputKey==`LambdaExecutionRoleArn`].OutputValue' \
    --output text \
    --region "$REGION")

if [ -z "$LAMBDA_ROLE_ARN" ]; then
    echo -e "${RED}❌ Failed to retrieve Lambda Role ARN from CloudFormation stack${NC}"
    echo -e "${YELLOW}💡 Ensure stack '$STACK_NAME' exists and has LambdaExecutionRoleArn output${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Lambda Role ARN: ${LAMBDA_ROLE_ARN}${NC}\n"

# Check if environment config file exists
if [ ! -f "$ENV_CONFIG_FILE" ]; then
    echo -e "${RED}❌ Environment config file not found: $ENV_CONFIG_FILE${NC}"
    exit 1
fi

# Function to get environment variables for a specific Lambda function
get_env_vars() {
    local function_name=$1

    # Extract common variables
    local common_vars=$(jq -r '.common | to_entries | map("\(.key)=\(.value)") | join(",")' "$ENV_CONFIG_FILE")

    # Extract function-specific variables and substitute environment variables
    local function_vars=$(jq -r --arg fn "$function_name" '
        .functions[$fn] // {} |
        to_entries |
        map(
            if (.value | type) == "string" and (.value | startswith("${")) then
                .key + "=" + (env[.value[2:-1]] // .value)
            else
                .key + "=" + (.value | tostring)
            end
        ) |
        join(",")
    ' "$ENV_CONFIG_FILE")

    # Combine common and function-specific variables
    if [ -n "$function_vars" ]; then
        echo "${common_vars},${function_vars}"
    else
        echo "${common_vars}"
    fi
}

# Function to create or update Lambda function
deploy_lambda() {
    local zip_file=$1
    local function_name=$2

    echo -e "${YELLOW}📤 Deploying ${function_name}...${NC}"

    # Check if zip file exists
    if [ ! -f "${DIST_DIR}/${zip_file}.zip" ]; then
        echo -e "${RED}❌ Zip file not found: ${DIST_DIR}/${zip_file}.zip${NC}"
        return 1
    fi

    # Get environment variables for this function
    local env_vars=$(get_env_vars "$function_name")

    # Try to update function code first
    if aws lambda update-function-code \
        --function-name "$function_name" \
        --zip-file "fileb://${DIST_DIR}/${zip_file}.zip" \
        --region "$REGION" \
        --output json &> /dev/null; then

        # Wait for function to be updated
        aws lambda wait function-updated \
            --function-name "$function_name" \
            --region "$REGION" 2>/dev/null || true

        # Update function configuration (role and environment variables)
        if [ -n "$env_vars" ]; then
            aws lambda update-function-configuration \
                --function-name "$function_name" \
                --role "$LAMBDA_ROLE_ARN" \
                --environment "Variables={${env_vars}}" \
                --region "$REGION" \
                --output json &> /dev/null
        else
            aws lambda update-function-configuration \
                --function-name "$function_name" \
                --role "$LAMBDA_ROLE_ARN" \
                --region "$REGION" \
                --output json &> /dev/null
        fi

        echo -e "${GREEN}✅ ${function_name} updated successfully${NC}"
        return 0
    else
        # Function doesn't exist, create it
        echo -e "${CYAN}   Creating new function ${function_name}...${NC}"

        if [ -n "$env_vars" ]; then
            aws lambda create-function \
                --function-name "$function_name" \
                --runtime nodejs18.x \
                --role "$LAMBDA_ROLE_ARN" \
                --handler "index.handler" \
                --zip-file "fileb://${DIST_DIR}/${zip_file}.zip" \
                --timeout 30 \
                --memory-size 512 \
                --environment "Variables={${env_vars}}" \
                --region "$REGION" \
                --output json &> /dev/null
        else
            aws lambda create-function \
                --function-name "$function_name" \
                --runtime nodejs18.x \
                --role "$LAMBDA_ROLE_ARN" \
                --handler "index.handler" \
                --zip-file "fileb://${DIST_DIR}/${zip_file}.zip" \
                --timeout 30 \
                --memory-size 512 \
                --region "$REGION" \
                --output json &> /dev/null
        fi

        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✅ ${function_name} created successfully${NC}"
            return 0
        else
            echo -e "${RED}❌ ${function_name} deployment failed${NC}"
            return 1
        fi
    fi
}

# Deployment mapping (zip_file => aws_function_name)
DEPLOYED=0
FAILED=0

# Core expense tracking functions
deploy_lambda "getExpenses" "construction-expenses-get-expenses" && ((DEPLOYED++)) || ((FAILED++))
deploy_lambda "addExpense" "construction-expenses-add-expense" && ((DEPLOYED++)) || ((FAILED++))
deploy_lambda "updateExpense" "construction-expenses-update-expense" && ((DEPLOYED++)) || ((FAILED++))
deploy_lambda "deleteExpense" "construction-expenses-delete-expense" && ((DEPLOYED++)) || ((FAILED++))

# Project functions
deploy_lambda "getProjects" "construction-expenses-get-projects" && ((DEPLOYED++)) || ((FAILED++))
deploy_lambda "addProject" "construction-expenses-add-project" && ((DEPLOYED++)) || ((FAILED++))
deploy_lambda "deleteProject" "construction-expenses-delete-project" && ((DEPLOYED++)) || ((FAILED++))
deploy_lambda "deleteProjectClerk" "construction-expenses-delete-project-clerk" && ((DEPLOYED++)) || ((FAILED++))

# Contractor functions
deploy_lambda "getContractors" "construction-expenses-get-contractors" && ((DEPLOYED++)) || ((FAILED++))
deploy_lambda "addContractor" "construction-expenses-add-contractor" && ((DEPLOYED++)) || ((FAILED++))
deploy_lambda "deleteContractor" "construction-expenses-delete-contractor" && ((DEPLOYED++)) || ((FAILED++))
deploy_lambda "deleteContractorClerk" "construction-expenses-delete-contractor-clerk" && ((DEPLOYED++)) || ((FAILED++))

# Work functions
deploy_lambda "getWorks" "construction-expenses-get-works" && ((DEPLOYED++)) || ((FAILED++))
deploy_lambda "addWork" "construction-expenses-add-work" && ((DEPLOYED++)) || ((FAILED++))
deploy_lambda "deleteWork" "construction-expenses-delete-work" && ((DEPLOYED++)) || ((FAILED++))
deploy_lambda "deleteWorkClerk" "construction-expenses-delete-work-clerk" && ((DEPLOYED++)) || ((FAILED++))

# Company functions (kebab-case in AWS)
deploy_lambda "companyExpenses" "construction-expenses-company-expenses" && ((DEPLOYED++)) || ((FAILED++))
deploy_lambda "companyProjects" "construction-expenses-company-projects" && ((DEPLOYED++)) || ((FAILED++))
deploy_lambda "companyContractors" "construction-expenses-company-contractors" && ((DEPLOYED++)) || ((FAILED++))
deploy_lambda "companyWorks" "construction-expenses-company-works" && ((DEPLOYED++)) || ((FAILED++))
deploy_lambda "getCompany" "construction-expenses-get-company" && ((DEPLOYED++)) || ((FAILED++))
deploy_lambda "getCompanyUsage" "construction-expenses-get-company-usage" && ((DEPLOYED++)) || ((FAILED++))
deploy_lambda "updateCompany" "construction-expenses-update-company" && ((DEPLOYED++)) || ((FAILED++))
deploy_lambda "uploadCompanyLogo" "construction-expenses-upload-logo" && ((DEPLOYED++)) || ((FAILED++))
deploy_lambda "uploadReceipt" "construction-expenses-upload-receipt" && ((DEPLOYED++)) || ((FAILED++))
deploy_lambda "registerCompany" "construction-expenses-register-company" && ((DEPLOYED++)) || ((FAILED++))
deploy_lambda "registerCompanyClerk" "construction-expenses-register-company-clerk" && ((DEPLOYED++)) || ((FAILED++))

# Paddle/Subscription functions
deploy_lambda "subscriptionManager" "construction-expenses-subscription-manager" && ((DEPLOYED++)) || ((FAILED++))
deploy_lambda "paddleWebhook" "construction-expenses-paddle-webhook" && ((DEPLOYED++)) || ((FAILED++))
deploy_lambda "createPaddleCheckout" "construction-expenses-create-paddle-checkout" && ((DEPLOYED++)) || ((FAILED++))
deploy_lambda "updatePaddleSubscription" "construction-expenses-update-paddle-subscription" && ((DEPLOYED++)) || ((FAILED++))
deploy_lambda "webhookPaddle" "construction-expenses-webhook-paddle" && ((DEPLOYED++)) || ((FAILED++))
deploy_lambda "requestPaymentEmail" "construction-expenses-request-payment-email" && ((DEPLOYED++)) || ((FAILED++))

# Subscription detail endpoints (for mobile app)
deploy_lambda "subscriptionDetails" "construction-expenses-subscriptionDetails" && ((DEPLOYED++)) || ((FAILED++))
deploy_lambda "createCustomerPortalSession" "construction-expenses-createCustomerPortalSession" && ((DEPLOYED++)) || ((FAILED++))
deploy_lambda "paymentHistory" "construction-expenses-paymentHistory" && ((DEPLOYED++)) || ((FAILED++))

# Clerk webhook and authorizer
deploy_lambda "webhookClerk" "construction-expenses-webhook-clerk" && ((DEPLOYED++)) || ((FAILED++))
deploy_lambda "clerk-authorizer" "construction-expenses-clerk-authorizer" && ((DEPLOYED++)) || ((FAILED++))

# User management functions
deploy_lambda "listUsers" "construction-expenses-list-users" && ((DEPLOYED++)) || ((FAILED++))
deploy_lambda "updateUser" "construction-expenses-update-user" && ((DEPLOYED++)) || ((FAILED++))
deploy_lambda "removeUser" "construction-expenses-remove-user" && ((DEPLOYED++)) || ((FAILED++))

# Invitation functions
deploy_lambda "inviteUser" "construction-expenses-invite-user" && ((DEPLOYED++)) || ((FAILED++))
deploy_lambda "sendInvitation" "construction-expenses-send-invitation" && ((DEPLOYED++)) || ((FAILED++))
deploy_lambda "listInvitations" "construction-expenses-list-invitations" && ((DEPLOYED++)) || ((FAILED++))
deploy_lambda "acceptInvitation" "construction-expenses-accept-invitation" && ((DEPLOYED++)) || ((FAILED++))
deploy_lambda "resendInvitation" "construction-expenses-resend-invitation" && ((DEPLOYED++)) || ((FAILED++))
deploy_lambda "cancelInvitation" "construction-expenses-cancel-invitation" && ((DEPLOYED++)) || ((FAILED++))

# OCR Processing
deploy_lambda "processReceiptOCR" "construction-expenses-process-receipt-ocr" && ((DEPLOYED++)) || ((FAILED++))

# Check pending invitations (signup flow)
deploy_lambda "checkPendingInvitations" "construction-expenses-checkPendingInvitations" && ((DEPLOYED++)) || ((FAILED++))

# Apple IAP functions
deploy_lambda "verifyApplePurchase" "construction-expenses-verifyApplePurchase" && ((DEPLOYED++)) || ((FAILED++))
deploy_lambda "appleWebhook" "construction-expenses-appleWebhook" && ((DEPLOYED++)) || ((FAILED++))

echo -e "\n${CYAN}═══════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}   Deployment Summary${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Successfully deployed: ${DEPLOYED} functions${NC}"
echo -e "${BLUE}📦 Using CloudFormation IAM Role: ${LAMBDA_ROLE_ARN}${NC}"
echo -e "${BLUE}🔧 Environment variables configured from: ${ENV_CONFIG_FILE}${NC}"

if [ $FAILED -gt 0 ]; then
    echo -e "${RED}❌ Failed deployments: ${FAILED} functions${NC}"
    echo -e "${YELLOW}💡 Check the error messages above for details${NC}"
    exit 1
else
    echo -e "\n${GREEN}🎉 All Lambda functions deployed successfully!${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}\n"
    exit 0
fi
