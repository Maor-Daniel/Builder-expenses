#!/bin/bash

# AWS Secrets Manager Setup Script
# This script creates all necessary secrets for the Construction Expenses application
# in AWS Secrets Manager with proper naming convention and descriptions.

set -e  # Exit on any error

# Configuration
AWS_REGION="us-east-1"
AWS_ACCOUNT="702358134603"
SECRET_PREFIX="construction-expenses"

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

# Function to check if a secret exists
secret_exists() {
    local secret_name=$1
    aws secretsmanager describe-secret \
        --secret-id "$secret_name" \
        --region "$AWS_REGION" \
        >/dev/null 2>&1
    return $?
}

# Function to create or update a secret
create_or_update_secret() {
    local secret_name=$1
    local secret_value=$2
    local description=$3

    if secret_exists "$secret_name"; then
        print_warning "Secret '$secret_name' already exists. Updating..."
        aws secretsmanager update-secret \
            --secret-id "$secret_name" \
            --secret-string "$secret_value" \
            --region "$AWS_REGION"
        print_info "Secret '$secret_name' updated successfully"
    else
        print_info "Creating secret '$secret_name'..."
        aws secretsmanager create-secret \
            --name "$secret_name" \
            --description "$description" \
            --secret-string "$secret_value" \
            --region "$AWS_REGION"
        print_info "Secret '$secret_name' created successfully"
    fi
}

# Function to prompt for secret value (hidden input)
prompt_for_secret() {
    local prompt=$1
    local secret_var
    echo -n "$prompt: "
    read -s secret_var
    echo  # New line after hidden input
    echo "$secret_var"
}

# Main script
print_info "======================================"
print_info "AWS Secrets Manager Setup"
print_info "======================================"
print_info ""
print_info "AWS Region: $AWS_REGION"
print_info "AWS Account: $AWS_ACCOUNT"
print_info "Secret Prefix: $SECRET_PREFIX"
print_info ""

# Verify AWS credentials
print_info "Verifying AWS credentials..."
if ! aws sts get-caller-identity --region "$AWS_REGION" >/dev/null 2>&1; then
    print_error "AWS credentials not configured. Please run 'aws configure' first."
    exit 1
fi
print_info "AWS credentials verified"
print_info ""

# Check which secrets already exist
print_info "Checking existing secrets..."
CLERK_SECRET_EXISTS=false
CLERK_WEBHOOK_EXISTS=false
PADDLE_CLIENT_TOKEN_EXISTS=false
SENTRY_DSN_EXISTS=false

if secret_exists "$SECRET_PREFIX/clerk/secret-key"; then
    CLERK_SECRET_EXISTS=true
    print_warning "Clerk secret key already exists"
fi

if secret_exists "$SECRET_PREFIX/clerk/webhook-secret"; then
    CLERK_WEBHOOK_EXISTS=true
    print_warning "Clerk webhook secret already exists"
fi

if secret_exists "$SECRET_PREFIX/paddle/client-token"; then
    PADDLE_CLIENT_TOKEN_EXISTS=true
    print_warning "Paddle client token already exists"
fi

if secret_exists "$SECRET_PREFIX/sentry/dsn"; then
    SENTRY_DSN_EXISTS=true
    print_info "Sentry DSN already exists (no action needed)"
fi

print_info ""

# Setup mode selection
echo "Select setup mode:"
echo "1) Interactive - Prompt for each secret value"
echo "2) Environment Variables - Read from environment"
echo "3) Dry Run - Show what would be created without making changes"
echo ""
read -p "Enter choice [1-3]: " SETUP_MODE

case $SETUP_MODE in
    1)
        print_info "Starting interactive setup..."
        print_info ""

        # Clerk Secret Key
        if [ "$CLERK_SECRET_EXISTS" = false ]; then
            print_info "Setting up Clerk Secret Key..."
            print_info "This is your Clerk API Secret Key (starts with sk_live_ or sk_test_)"
            CLERK_SECRET_KEY=$(prompt_for_secret "Enter Clerk Secret Key")
            create_or_update_secret \
                "$SECRET_PREFIX/clerk/secret-key" \
                "$CLERK_SECRET_KEY" \
                "Clerk API Secret Key for authentication"
            print_info ""
        fi

        # Clerk Webhook Secret
        if [ "$CLERK_WEBHOOK_EXISTS" = false ]; then
            print_info "Setting up Clerk Webhook Secret..."
            print_info "This is your Clerk Webhook Secret (starts with whsec_)"
            CLERK_WEBHOOK_SECRET=$(prompt_for_secret "Enter Clerk Webhook Secret")
            create_or_update_secret \
                "$SECRET_PREFIX/clerk/webhook-secret" \
                "$CLERK_WEBHOOK_SECRET" \
                "Clerk Webhook Secret for verifying webhook signatures"
            print_info ""
        fi

        # Paddle Client Token
        if [ "$PADDLE_CLIENT_TOKEN_EXISTS" = false ]; then
            print_info "Setting up Paddle Client Token..."
            print_info "This is your Paddle Client Token for frontend checkout"
            PADDLE_CLIENT_TOKEN=$(prompt_for_secret "Enter Paddle Client Token")
            create_or_update_secret \
                "$SECRET_PREFIX/paddle/client-token" \
                "$PADDLE_CLIENT_TOKEN" \
                "Paddle Client Token for frontend checkout initialization"
            print_info ""
        fi
        ;;

    2)
        print_info "Reading from environment variables..."
        print_info ""

        # Clerk Secret Key
        if [ "$CLERK_SECRET_EXISTS" = false ]; then
            if [ -z "$CLERK_SECRET_KEY" ]; then
                print_error "Environment variable CLERK_SECRET_KEY not set"
                exit 1
            fi
            create_or_update_secret \
                "$SECRET_PREFIX/clerk/secret-key" \
                "$CLERK_SECRET_KEY" \
                "Clerk API Secret Key for authentication"
        fi

        # Clerk Webhook Secret
        if [ "$CLERK_WEBHOOK_EXISTS" = false ]; then
            if [ -z "$CLERK_WEBHOOK_SECRET" ]; then
                print_error "Environment variable CLERK_WEBHOOK_SECRET not set"
                exit 1
            fi
            create_or_update_secret \
                "$SECRET_PREFIX/clerk/webhook-secret" \
                "$CLERK_WEBHOOK_SECRET" \
                "Clerk Webhook Secret for verifying webhook signatures"
        fi

        # Paddle Client Token
        if [ "$PADDLE_CLIENT_TOKEN_EXISTS" = false ]; then
            if [ -z "$PADDLE_CLIENT_TOKEN" ]; then
                print_error "Environment variable PADDLE_CLIENT_TOKEN not set"
                exit 1
            fi
            create_or_update_secret \
                "$SECRET_PREFIX/paddle/client-token" \
                "$PADDLE_CLIENT_TOKEN" \
                "Paddle Client Token for frontend checkout initialization"
        fi
        ;;

    3)
        print_info "DRY RUN MODE - No changes will be made"
        print_info ""
        print_info "Would create the following secrets:"
        print_info "  - $SECRET_PREFIX/clerk/secret-key"
        print_info "  - $SECRET_PREFIX/clerk/webhook-secret"
        print_info "  - $SECRET_PREFIX/paddle/client-token"
        print_info ""
        print_info "Existing secrets (already configured):"
        if [ "$SENTRY_DSN_EXISTS" = true ]; then
            print_info "  - $SECRET_PREFIX/sentry/dsn (already exists)"
        fi
        print_info "  - $SECRET_PREFIX/paddle/api-key (already exists)"
        print_info "  - $SECRET_PREFIX/paddle/webhook-secret (already exists)"
        exit 0
        ;;

    *)
        print_error "Invalid choice. Exiting."
        exit 1
        ;;
esac

# Summary
print_info ""
print_info "======================================"
print_info "Setup Complete!"
print_info "======================================"
print_info ""
print_info "Secrets created/updated in AWS Secrets Manager:"

# List all secrets
aws secretsmanager list-secrets \
    --region "$AWS_REGION" \
    --filters Key=name,Values="$SECRET_PREFIX/" \
    --query 'SecretList[*].[Name,Description]' \
    --output table

print_info ""
print_info "Next steps:"
print_info "1. Verify secrets in AWS Console: https://console.aws.amazon.com/secretsmanager/"
print_info "2. Update Lambda IAM policies to grant access to these secrets"
print_info "3. Deploy Lambda functions with updated code"
print_info "4. Test authentication and webhook verification"
print_info ""
print_warning "IMPORTANT: Keep your secret values secure and never commit them to git"
print_info ""
