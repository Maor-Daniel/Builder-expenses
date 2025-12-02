#!/bin/bash

# Deploy all Lambda functions to AWS
# Maps camelCase zip files to kebab-case AWS function names

set -e

REGION="us-east-1"
DIST_DIR="/Users/maordaniel/Ofek/dist"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🚀 Deploying all Lambda functions to AWS...${NC}\n"

# Function to deploy a Lambda
deploy_lambda() {
    local zip_file=$1
    local function_name=$2

    echo -e "${YELLOW}📤 Deploying ${function_name}...${NC}"

    if aws lambda update-function-code \
        --function-name "$function_name" \
        --zip-file "fileb://${DIST_DIR}/${zip_file}.zip" \
        --region "$REGION" \
        --output text &> /dev/null; then
        echo -e "${GREEN}✅ ${function_name} deployed successfully${NC}"
        return 0
    else
        echo -e "${RED}❌ ${function_name} deployment failed${NC}"
        return 1
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

echo -e "\n${YELLOW}📊 Deployment Summary:${NC}"
echo -e "${GREEN}✅ Successfully deployed: ${DEPLOYED} functions${NC}"

if [ $FAILED -gt 0 ]; then
    echo -e "${RED}❌ Failed deployments: ${FAILED} functions${NC}"
    exit 1
else
    echo -e "\n${GREEN}🎉 All Lambda functions deployed successfully!${NC}"
    exit 0
fi
