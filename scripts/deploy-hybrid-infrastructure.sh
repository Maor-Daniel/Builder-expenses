#!/bin/bash

###############################################################################
# Hybrid Infrastructure Deployment Script
#
# Deploys the hybrid infrastructure:
# - CloudFormation: Cognito, S3, CloudFront, IAM, API Gateway
# - AWS CLI: DynamoDB tables and Lambda functions
#
# Usage:
#   ./scripts/deploy-hybrid-infrastructure.sh [OPERATION] [OPTIONS]
#
# Operations:
#   cloudformation  - Deploy only CloudFormation stack
#   tables         - Create/verify DynamoDB tables
#   lambdas        - Deploy Lambda functions
#   full           - Deploy everything (CloudFormation + tables + Lambdas)
#   status         - Show deployment status
#
# Options:
#   --environment=ENV  - Environment (production, staging, dev)
#   --region=REGION    - AWS region (default: us-east-1)
#   --skip-package     - Skip Lambda packaging step
#   --dry-run          - Show what would be deployed without making changes
#
# Examples:
#   ./scripts/deploy-hybrid-infrastructure.sh full
#   ./scripts/deploy-hybrid-infrastructure.sh lambdas --skip-package
#   ./scripts/deploy-hybrid-infrastructure.sh cloudformation --dry-run
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
OPERATION=${1:-"status"}
ENVIRONMENT=${ENVIRONMENT:-"production"}
REGION=${AWS_REGION:-"us-east-1"}
STACK_NAME="construction-expenses-${ENVIRONMENT}"
DRY_RUN=false
SKIP_PACKAGE=false

# Parse arguments
for arg in "$@"; do
  case $arg in
    --environment=*)
      ENVIRONMENT="${arg#*=}"
      STACK_NAME="construction-expenses-${ENVIRONMENT}"
      shift
      ;;
    --region=*)
      REGION="${arg#*=}"
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --skip-package)
      SKIP_PACKAGE=true
      shift
      ;;
  esac
done

# Helper functions
print_header() {
  echo -e "\n${BLUE}========================================${NC}"
  echo -e "${BLUE}$1${NC}"
  echo -e "${BLUE}========================================${NC}\n"
}

print_success() {
  echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
  echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
  echo -e "${RED}✗ $1${NC}"
}

print_info() {
  echo -e "${BLUE}ℹ $1${NC}"
}

# Check if AWS CLI is configured
check_aws_credentials() {
  if ! aws sts get-caller-identity &>/dev/null; then
    print_error "AWS credentials not configured. Run 'aws configure' first."
    exit 1
  fi

  ACCOUNT_ID=$(aws sts get-caller-identity --query 'Account' --output text)
  print_success "AWS credentials configured (Account: ${ACCOUNT_ID})"
}

# Deploy CloudFormation stack
deploy_cloudformation() {
  print_header "Deploying CloudFormation Stack"

  print_info "Stack: ${STACK_NAME}"
  print_info "Region: ${REGION}"
  print_info "Template: infrastructure/cloudformation-hybrid.yaml"

  if [ "$DRY_RUN" = true ]; then
    print_warning "DRY RUN: Would deploy CloudFormation stack"
    aws cloudformation validate-template \
      --template-body file://infrastructure/cloudformation-hybrid.yaml \
      --region "$REGION"
    print_success "Template validation passed"
    return
  fi

  # Check if stack exists
  if aws cloudformation describe-stacks \
      --stack-name "$STACK_NAME" \
      --region "$REGION" &>/dev/null; then

    print_info "Stack exists. Updating..."

    if aws cloudformation update-stack \
        --stack-name "$STACK_NAME" \
        --template-body file://infrastructure/cloudformation-hybrid.yaml \
        --capabilities CAPABILITY_NAMED_IAM \
        --region "$REGION" 2>&1 | grep -q "No updates are to be performed"; then
      print_warning "No CloudFormation updates needed"
    else
      print_info "Waiting for stack update to complete..."
      aws cloudformation wait stack-update-complete \
        --stack-name "$STACK_NAME" \
        --region "$REGION"
      print_success "Stack updated successfully"
    fi
  else
    print_info "Stack does not exist. Creating..."

    aws cloudformation create-stack \
      --stack-name "$STACK_NAME" \
      --template-body file://infrastructure/cloudformation-hybrid.yaml \
      --capabilities CAPABILITY_NAMED_IAM \
      --region "$REGION"

    print_info "Waiting for stack creation to complete..."
    aws cloudformation wait stack-create-complete \
      --stack-name "$STACK_NAME" \
      --region "$REGION"
    print_success "Stack created successfully"
  fi

  # Show outputs
  print_info "Stack Outputs:"
  aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query 'Stacks[0].Outputs[*].[OutputKey,OutputValue]' \
    --output table
}

# Deploy DynamoDB tables
deploy_tables() {
  print_header "Creating/Verifying DynamoDB Tables"

  if [ "$DRY_RUN" = true ]; then
    print_warning "DRY RUN: Would create/verify DynamoDB tables for environment: ${ENVIRONMENT}"
    return
  fi

  if [ ! -f "scripts/create-dynamodb-tables.sh" ]; then
    print_error "Table creation script not found: scripts/create-dynamodb-tables.sh"
    exit 1
  fi

  bash scripts/create-dynamodb-tables.sh "$ENVIRONMENT" "$REGION"
  print_success "DynamoDB tables verified"
}

# Deploy Lambda functions
deploy_lambdas() {
  print_header "Deploying Lambda Functions"

  if [ "$DRY_RUN" = true ]; then
    print_warning "DRY RUN: Would package and deploy Lambda functions"
    return
  fi

  # Package Lambda functions
  if [ "$SKIP_PACKAGE" = false ]; then
    print_info "Packaging Lambda functions..."
    npm run package
    print_success "Lambda functions packaged"
  else
    print_warning "Skipping Lambda packaging (using existing packages)"
  fi

  # Deploy Lambda functions
  print_info "Deploying Lambda functions..."
  bash scripts/deploy-all-lambdas.sh
  print_success "Lambda functions deployed"
}

# Show deployment status
show_status() {
  print_header "Deployment Status"

  # CloudFormation status
  print_info "CloudFormation Stack: ${STACK_NAME}"
  if aws cloudformation describe-stacks \
      --stack-name "$STACK_NAME" \
      --region "$REGION" &>/dev/null; then

    STACK_STATUS=$(aws cloudformation describe-stacks \
      --stack-name "$STACK_NAME" \
      --region "$REGION" \
      --query 'Stacks[0].StackStatus' \
      --output text)

    if [[ "$STACK_STATUS" == *"COMPLETE"* ]]; then
      print_success "Status: ${STACK_STATUS}"
    else
      print_warning "Status: ${STACK_STATUS}"
    fi
  else
    print_error "Stack does not exist"
  fi

  # DynamoDB tables status
  print_info "\nDynamoDB Tables (construction-expenses-*):"
  TABLE_COUNT=$(aws dynamodb list-tables \
    --region "$REGION" \
    --query "length(TableNames[?starts_with(@, 'construction-expenses-')])" \
    --output text)
  print_success "${TABLE_COUNT} tables found"

  # Lambda functions status
  print_info "\nLambda Functions (construction-expenses-*):"
  LAMBDA_COUNT=$(aws lambda list-functions \
    --region "$REGION" \
    --query "length(Functions[?starts_with(FunctionName, 'construction-expenses-')])" \
    --output text)
  print_success "${LAMBDA_COUNT} functions found"

  # Show CloudFormation outputs
  if aws cloudformation describe-stacks \
      --stack-name "$STACK_NAME" \
      --region "$REGION" &>/dev/null; then
    print_info "\nCloudFormation Outputs:"
    aws cloudformation describe-stacks \
      --stack-name "$STACK_NAME" \
      --region "$REGION" \
      --query 'Stacks[0].Outputs[*].[OutputKey,OutputValue]' \
      --output table
  fi
}

# Main deployment logic
main() {
  print_header "Hybrid Infrastructure Deployment"
  print_info "Operation: ${OPERATION}"
  print_info "Environment: ${ENVIRONMENT}"
  print_info "Region: ${REGION}"

  if [ "$DRY_RUN" = true ]; then
    print_warning "DRY RUN MODE - No changes will be made"
  fi

  # Check AWS credentials
  check_aws_credentials

  case "$OPERATION" in
    cloudformation|cf|stack)
      deploy_cloudformation
      ;;

    tables|dynamodb|db)
      deploy_tables
      ;;

    lambdas|lambda|functions)
      deploy_lambdas
      ;;

    full|all)
      deploy_cloudformation
      deploy_tables
      deploy_lambdas
      print_header "Deployment Complete"
      print_success "All components deployed successfully!"
      ;;

    status|info)
      show_status
      ;;

    *)
      print_error "Unknown operation: ${OPERATION}"
      echo ""
      echo "Usage: $0 {cloudformation|tables|lambdas|full|status} [OPTIONS]"
      echo ""
      echo "Operations:"
      echo "  cloudformation - Deploy CloudFormation stack"
      echo "  tables         - Create/verify DynamoDB tables"
      echo "  lambdas        - Deploy Lambda functions"
      echo "  full           - Deploy everything"
      echo "  status         - Show deployment status"
      echo ""
      echo "Options:"
      echo "  --environment=ENV - Environment (production, staging, dev)"
      echo "  --region=REGION   - AWS region (default: us-east-1)"
      echo "  --skip-package    - Skip Lambda packaging"
      echo "  --dry-run         - Show what would be deployed"
      exit 1
      ;;
  esac
}

# Run main function
main
