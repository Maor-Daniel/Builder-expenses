#!/bin/bash

# Script to attach Secrets Manager policy to Lambda execution role
# This grants Lambda functions permission to read secrets from AWS Secrets Manager

set -e  # Exit on any error

# Configuration
AWS_REGION="us-east-1"
AWS_ACCOUNT="702358134603"
STACK_NAME="construction-expenses-production"
POLICY_NAME="SecretsManagerAccessPolicy"
POLICY_FILE="../infrastructure/secrets-manager-iam-policy.json"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_info "======================================"
print_info "Lambda IAM Policy Update"
print_info "======================================"
print_info ""

# Verify AWS credentials
print_info "Verifying AWS credentials..."
if ! aws sts get-caller-identity --region "$AWS_REGION" >/dev/null 2>&1; then
    print_error "AWS credentials not configured. Please run 'aws configure' first."
    exit 1
fi
print_info "AWS credentials verified"
print_info ""

# Get the Lambda execution role from CloudFormation stack
print_info "Getting Lambda execution role from CloudFormation stack..."
LAMBDA_ROLE_NAME=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`LambdaExecutionRoleName`].OutputValue' \
    --output text 2>/dev/null || echo "")

if [ -z "$LAMBDA_ROLE_NAME" ]; then
    print_warning "Could not find Lambda role from CloudFormation outputs."
    print_info "Attempting to find role by naming convention..."

    # Try to find the role by common naming pattern
    LAMBDA_ROLE_NAME=$(aws iam list-roles \
        --query "Roles[?contains(RoleName, 'construction-expenses') && contains(RoleName, 'LambdaExecutionRole')].RoleName" \
        --output text | head -n1)

    if [ -z "$LAMBDA_ROLE_NAME" ]; then
        print_error "Could not find Lambda execution role."
        print_error "Please specify the role name manually:"
        read -p "Lambda Execution Role Name: " LAMBDA_ROLE_NAME

        if [ -z "$LAMBDA_ROLE_NAME" ]; then
            print_error "No role name provided. Exiting."
            exit 1
        fi
    fi
fi

print_info "Found Lambda execution role: $LAMBDA_ROLE_NAME"
print_info ""

# Check if policy file exists
if [ ! -f "$POLICY_FILE" ]; then
    print_error "Policy file not found: $POLICY_FILE"
    exit 1
fi

print_info "Policy file: $POLICY_FILE"
print_info ""

# Show policy content
print_info "Policy content:"
cat "$POLICY_FILE"
print_info ""

# Create managed policy if it doesn't exist
POLICY_ARN="arn:aws:iam::${AWS_ACCOUNT}:policy/${POLICY_NAME}"

if aws iam get-policy --policy-arn "$POLICY_ARN" >/dev/null 2>&1; then
    print_warning "Policy '$POLICY_NAME' already exists."
    print_info "Updating policy with new version..."

    # Get current default version
    CURRENT_VERSION=$(aws iam get-policy \
        --policy-arn "$POLICY_ARN" \
        --query 'Policy.DefaultVersionId' \
        --output text)

    print_info "Current version: $CURRENT_VERSION"

    # Create new policy version
    NEW_VERSION=$(aws iam create-policy-version \
        --policy-arn "$POLICY_ARN" \
        --policy-document "file://$POLICY_FILE" \
        --set-as-default \
        --query 'PolicyVersion.VersionId' \
        --output text)

    print_info "Created new version: $NEW_VERSION (set as default)"

    # Delete old version if there are too many
    VERSION_COUNT=$(aws iam list-policy-versions \
        --policy-arn "$POLICY_ARN" \
        --query 'length(Versions)' \
        --output text)

    if [ "$VERSION_COUNT" -gt 3 ]; then
        print_warning "Too many policy versions ($VERSION_COUNT). Cleaning up old versions..."
        # Delete the oldest non-default version
        OLDEST_VERSION=$(aws iam list-policy-versions \
            --policy-arn "$POLICY_ARN" \
            --query 'Versions[?IsDefaultVersion==`false`] | [0].VersionId' \
            --output text)

        if [ -n "$OLDEST_VERSION" ]; then
            aws iam delete-policy-version \
                --policy-arn "$POLICY_ARN" \
                --version-id "$OLDEST_VERSION"
            print_info "Deleted old version: $OLDEST_VERSION"
        fi
    fi
else
    print_info "Creating new managed policy '$POLICY_NAME'..."
    POLICY_ARN=$(aws iam create-policy \
        --policy-name "$POLICY_NAME" \
        --policy-document "file://$POLICY_FILE" \
        --description "Grants Lambda functions access to Construction Expenses secrets in AWS Secrets Manager" \
        --query 'Policy.Arn' \
        --output text)

    print_info "Created policy: $POLICY_ARN"
fi

print_info ""

# Attach policy to Lambda role
if aws iam list-attached-role-policies \
    --role-name "$LAMBDA_ROLE_NAME" \
    --query "AttachedPolicies[?PolicyArn=='$POLICY_ARN']" \
    --output text | grep -q "$POLICY_NAME"; then
    print_info "Policy already attached to role '$LAMBDA_ROLE_NAME'"
else
    print_info "Attaching policy to Lambda role..."
    aws iam attach-role-policy \
        --role-name "$LAMBDA_ROLE_NAME" \
        --policy-arn "$POLICY_ARN"
    print_info "Policy attached successfully"
fi

print_info ""

# Verify attachment
print_info "Verifying policy attachment..."
if aws iam list-attached-role-policies \
    --role-name "$LAMBDA_ROLE_NAME" \
    --query "AttachedPolicies[?PolicyArn=='$POLICY_ARN']" \
    --output text | grep -q "$POLICY_NAME"; then
    print_info "✓ Policy is attached to role"
else
    print_error "✗ Policy is NOT attached to role"
    exit 1
fi

print_info ""
print_info "======================================"
print_info "Update Complete!"
print_info "======================================"
print_info ""
print_info "Lambda role: $LAMBDA_ROLE_NAME"
print_info "Policy ARN: $POLICY_ARN"
print_info ""
print_info "Lambda functions can now access secrets in AWS Secrets Manager"
print_info ""
print_info "Next steps:"
print_info "1. Deploy updated Lambda functions"
print_info "2. Test authentication and webhook verification"
print_info "3. Monitor CloudWatch logs for any errors"
print_info ""
