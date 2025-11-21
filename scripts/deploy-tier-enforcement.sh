#!/bin/bash

# Deploy tier enforcement Lambda functions
set -e

echo "🚀 Deploying tier enforcement Lambda functions..."

REGION="us-east-1"

# Function to deploy a lambda
deploy_lambda() {
  local LAMBDA_FILE=$1
  local FUNCTION_NAME=$2
  local ZIP_FILE="dist/${LAMBDA_FILE}.zip"

  echo ""
  echo "📦 Deploying $LAMBDA_FILE to $FUNCTION_NAME..."

  if [ ! -f "$ZIP_FILE" ]; then
    echo "❌ Error: $ZIP_FILE not found"
    return 1
  fi

  # Update function code
  aws lambda update-function-code \
    --function-name "$FUNCTION_NAME" \
    --zip-file "fileb://$ZIP_FILE" \
    --region "$REGION" \
    --output json > /dev/null

  echo "⏳ Waiting for $LAMBDA_FILE to be updated..."
  aws lambda wait function-updated \
    --function-name "$FUNCTION_NAME" \
    --region "$REGION"

  echo "✅ $LAMBDA_FILE deployed successfully!"
}

# Deploy each lambda
deploy_lambda "companyExpenses" "construction-expenses-company-expenses"
deploy_lambda "companyProjects" "construction-expenses-company-projects"
deploy_lambda "sendInvitation" "construction-expenses-send-invitation"
deploy_lambda "acceptInvitation" "construction-expenses-accept-invitation"
deploy_lambda "removeUser" "construction-expenses-remove-user"

echo ""
echo "🎉 All tier enforcement lambdas deployed successfully!"
echo ""
echo "📝 Next steps:"
echo "  1. Test tier enforcement by creating resources"
echo "  2. Verify limit checks are working"
echo "  3. Test usage statistics endpoint"
