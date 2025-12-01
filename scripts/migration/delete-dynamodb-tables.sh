#!/bin/bash

# DELETE MULTI-TABLE DYNAMODB TABLES
#
# This script deletes all DynamoDB tables from the multi-table architecture
# after successful migration and validation.

set -e

echo "🗑️  DELETING MULTI-TABLE DYNAMODB TABLES"
echo "=========================================="
echo ""

# List of tables to delete
TABLES=(
  "construction-expenses-multi-table-expenses"
  "construction-expenses-multi-table-projects"
  "construction-expenses-multi-table-contractors"
  "construction-expenses-multi-table-works"
  "construction-expenses-multi-table-users"
)

SUCCESS=0
FAILED=0

for TABLE in "${TABLES[@]}"; do
  echo "Deleting: $TABLE"

  if aws dynamodb delete-table --table-name "$TABLE" --region us-east-1 2>/dev/null; then
    echo "✅ Deleted: $TABLE"
    ((SUCCESS++))
  else
    echo "❌ Failed to delete: $TABLE"
    ((FAILED++))
  fi

  echo ""
done

echo "=========================================="
echo "📊 DELETION SUMMARY"
echo "=========================================="
echo "Total tables: ${#TABLES[@]}"
echo "Successfully deleted: $SUCCESS"
echo "Failed: $FAILED"
echo "=========================================="

if [ $FAILED -eq 0 ]; then
  echo "✅ ALL DYNAMODB TABLES DELETED SUCCESSFULLY!"
  exit 0
else
  echo "⚠️  SOME DELETIONS FAILED"
  exit 1
fi
