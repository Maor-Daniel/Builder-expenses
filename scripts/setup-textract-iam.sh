#!/bin/bash

# Setup AWS Textract IAM Policy and Permissions
# This script creates and attaches the Textract policy to the Lambda execution role

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
REGION="us-east-1"
POLICY_NAME="ConstructionExpensesTextractPolicy"
STACK_NAME="construction-expenses-production"
POLICY_FILE="infrastructure/textract-policy.json"

echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}AWS Textract IAM Setup${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""

# Step 1: Check AWS CLI access
echo -e "${YELLOW}Step 1: Verifying AWS CLI access...${NC}"
if ! aws sts get-caller-identity --region $REGION > /dev/null 2>&1; then
    echo -e "${RED}Error: AWS CLI is not configured or credentials are invalid${NC}"
    exit 1
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo -e "${GREEN}✓ AWS Account: $ACCOUNT_ID${NC}"
echo ""

# Step 2: Check if Textract is available in the region
echo -e "${YELLOW}Step 2: Checking Textract availability in $REGION...${NC}"
if ! aws textract help > /dev/null 2>&1; then
    echo -e "${RED}Error: AWS Textract CLI is not available${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Textract CLI is available${NC}"
echo ""

# Step 3: Check if policy file exists
echo -e "${YELLOW}Step 3: Validating policy file...${NC}"
if [ ! -f "$POLICY_FILE" ]; then
    echo -e "${RED}Error: Policy file not found at $POLICY_FILE${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Policy file found${NC}"
echo ""

# Step 4: Create or update IAM policy
echo -e "${YELLOW}Step 4: Creating/updating IAM policy...${NC}"
POLICY_ARN="arn:aws:iam::${ACCOUNT_ID}:policy/${POLICY_NAME}"

# Check if policy already exists
if aws iam get-policy --policy-arn "$POLICY_ARN" > /dev/null 2>&1; then
    echo -e "${YELLOW}Policy already exists. Creating new version...${NC}"

    # Get current default version
    CURRENT_VERSION=$(aws iam get-policy --policy-arn "$POLICY_ARN" --query 'Policy.DefaultVersionId' --output text)

    # Create new policy version
    NEW_VERSION=$(aws iam create-policy-version \
        --policy-arn "$POLICY_ARN" \
        --policy-document file://$POLICY_FILE \
        --set-as-default \
        --query 'PolicyVersion.VersionId' \
        --output text)

    echo -e "${GREEN}✓ Policy updated (Version: $NEW_VERSION)${NC}"

    # Delete old version if there are too many versions (max 5 allowed)
    VERSION_COUNT=$(aws iam list-policy-versions --policy-arn "$POLICY_ARN" --query 'length(Versions)' --output text)
    if [ "$VERSION_COUNT" -ge 5 ]; then
        # Get oldest non-default version
        OLDEST_VERSION=$(aws iam list-policy-versions \
            --policy-arn "$POLICY_ARN" \
            --query 'Versions[?IsDefaultVersion==`false`]|[0].VersionId' \
            --output text)

        if [ "$OLDEST_VERSION" != "None" ] && [ ! -z "$OLDEST_VERSION" ]; then
            aws iam delete-policy-version \
                --policy-arn "$POLICY_ARN" \
                --version-id "$OLDEST_VERSION"
            echo -e "${GREEN}✓ Cleaned up old policy version: $OLDEST_VERSION${NC}"
        fi
    fi
else
    echo -e "${YELLOW}Creating new policy...${NC}"
    aws iam create-policy \
        --policy-name "$POLICY_NAME" \
        --policy-document file://$POLICY_FILE \
        --description "Allows Lambda functions to use AWS Textract AnalyzeExpense API for OCR processing" \
        > /dev/null

    echo -e "${GREEN}✓ Policy created: $POLICY_ARN${NC}"
fi
echo ""

# Step 5: Find Lambda execution role
echo -e "${YELLOW}Step 5: Finding Lambda execution role...${NC}"

# Try to get role from CloudFormation stack
ROLE_NAME=$(aws cloudformation describe-stack-resources \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query "StackResources[?ResourceType=='AWS::IAM::Role'].PhysicalResourceId" \
    --output text 2>/dev/null | head -n1)

if [ -z "$ROLE_NAME" ]; then
    # Fallback: Try common naming patterns
    echo -e "${YELLOW}CloudFormation lookup failed, trying common naming patterns...${NC}"

    POSSIBLE_ROLES=(
        "construction-expenses-lambda-execution-role"
        "construction-expenses-production-LambdaExecutionRole"
        "ConstructionExpensesLambdaExecutionRole"
    )

    for ROLE in "${POSSIBLE_ROLES[@]}"; do
        if aws iam get-role --role-name "$ROLE" > /dev/null 2>&1; then
            ROLE_NAME="$ROLE"
            break
        fi
    done
fi

if [ -z "$ROLE_NAME" ]; then
    echo -e "${RED}Error: Could not find Lambda execution role${NC}"
    echo -e "${YELLOW}Please specify the role name manually:${NC}"
    echo -e "${YELLOW}  aws iam attach-role-policy --role-name YOUR_ROLE_NAME --policy-arn $POLICY_ARN${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Found Lambda execution role: $ROLE_NAME${NC}"
echo ""

# Step 6: Attach policy to role
echo -e "${YELLOW}Step 6: Attaching policy to role...${NC}"

# Check if already attached
if aws iam list-attached-role-policies --role-name "$ROLE_NAME" \
    --query "AttachedPolicies[?PolicyArn=='$POLICY_ARN'].PolicyName" \
    --output text | grep -q "$POLICY_NAME"; then
    echo -e "${YELLOW}Policy is already attached to role${NC}"
else
    aws iam attach-role-policy \
        --role-name "$ROLE_NAME" \
        --policy-arn "$POLICY_ARN"

    echo -e "${GREEN}✓ Policy attached to role${NC}"
fi
echo ""

# Step 7: Verify attachment
echo -e "${YELLOW}Step 7: Verifying policy attachment...${NC}"
ATTACHED=$(aws iam list-attached-role-policies \
    --role-name "$ROLE_NAME" \
    --query "AttachedPolicies[?PolicyArn=='$POLICY_ARN'].PolicyName" \
    --output text)

if [ "$ATTACHED" = "$POLICY_NAME" ]; then
    echo -e "${GREEN}✓ Policy attachment verified${NC}"
else
    echo -e "${RED}Error: Policy attachment verification failed${NC}"
    exit 1
fi
echo ""

# Step 8: Display summary
echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}Setup Complete!${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""
echo -e "Policy ARN: ${GREEN}$POLICY_ARN${NC}"
echo -e "Role Name: ${GREEN}$ROLE_NAME${NC}"
echo -e "Region: ${GREEN}$REGION${NC}"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo -e "1. Run the test script: ${GREEN}node scripts/test-textract-access.js${NC}"
echo -e "2. Check CloudWatch logs for Textract API calls"
echo -e "3. Verify no errors in Lambda execution"
echo ""
echo -e "${YELLOW}Rollback Instructions:${NC}"
echo -e "To remove this policy attachment, run:"
echo -e "${GREEN}aws iam detach-role-policy --role-name $ROLE_NAME --policy-arn $POLICY_ARN${NC}"
echo ""
echo -e "To delete the policy entirely, run:"
echo -e "${GREEN}aws iam detach-role-policy --role-name $ROLE_NAME --policy-arn $POLICY_ARN${NC}"
echo -e "${GREEN}aws iam delete-policy --policy-arn $POLICY_ARN${NC}"
echo ""
echo -e "${YELLOW}Cost Monitoring:${NC}"
echo -e "Textract AnalyzeExpense costs \$0.017 per page"
echo -e "Expected: 3,000 receipts/month = ~\$51/month"
echo -e "Monitor usage: ${GREEN}aws ce get-cost-and-usage --time-period Start=2025-12-01,End=2025-12-31 --granularity MONTHLY --metrics BlendedCost --filter file://<(echo '{\"Dimensions\":{\"Key\":\"SERVICE\",\"Values\":[\"Amazon Textract\"]}}')${NC}"
echo ""
