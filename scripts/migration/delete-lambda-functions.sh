#!/bin/bash

# DELETE MULTI-TABLE LAMBDA FUNCTIONS
#
# This script deletes all Lambda functions from the multi-table architecture
# after successful migration to company-scoped architecture.

set -e

echo "🗑️  DELETING MULTI-TABLE LAMBDA FUNCTIONS"
echo "=========================================="
echo ""

# List of functions to delete
FUNCTIONS=(
  "construction-expenses-multi-table-add-contractor"
  "construction-expenses-multi-table-add-expense"
  "construction-expenses-multi-table-add-project"
  "construction-expenses-multi-table-add-work"
  "construction-expenses-multi-table-delete-contractor"
  "construction-expenses-multi-table-delete-expense"
  "construction-expenses-multi-table-delete-project"
  "construction-expenses-multi-table-delete-work"
  "construction-expenses-multi-table-get-contractors"
  "construction-expenses-multi-table-get-expenses"
  "construction-expenses-multi-table-get-projects"
  "construction-expenses-multi-table-get-works"
  "construction-expenses-multi-table-subscription-manager"
)

SUCCESS=0
FAILED=0

for FUNCTION in "${FUNCTIONS[@]}"; do
  echo "Deleting: $FUNCTION"

  if aws lambda delete-function --function-name "$FUNCTION" --region us-east-1 2>/dev/null; then
    echo "✅ Deleted: $FUNCTION"
    ((SUCCESS++))
  else
    echo "❌ Failed to delete: $FUNCTION"
    ((FAILED++))
  fi

  echo ""
done

echo "=========================================="
echo "📊 DELETION SUMMARY"
echo "=========================================="
echo "Total functions: ${#FUNCTIONS[@]}"
echo "Successfully deleted: $SUCCESS"
echo "Failed: $FAILED"
echo "=========================================="

if [ $FAILED -eq 0 ]; then
  echo "✅ ALL LAMBDA FUNCTIONS DELETED SUCCESSFULLY!"
  exit 0
else
  echo "⚠️  SOME DELETIONS FAILED"
  exit 1
fi
