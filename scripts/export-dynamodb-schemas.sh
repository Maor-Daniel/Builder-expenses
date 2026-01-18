#!/bin/bash
# scripts/export-dynamodb-schemas.sh
# Exports all production DynamoDB table schemas to infrastructure/schemas/
#
# This script documents the existing production table schemas by exporting:
# - Key schema (partition key, sort key)
# - Attribute definitions
# - Global Secondary Indexes (GSIs)
# - Provisioned throughput settings
# - Stream specifications
# - TTL settings
#
# Usage:
#   ./scripts/export-dynamodb-schemas.sh
#
# Requirements:
#   - AWS CLI configured with appropriate credentials
#   - Read access to DynamoDB tables
#
# Output:
#   - Creates infrastructure/schemas/{table-name}.json for each table
#   - Creates infrastructure/schemas/table-summary.txt with overview

set -e

# Configuration
TABLE_PREFIX="${TABLE_PREFIX:-construction-expenses}"
SCHEMA_DIR="infrastructure/schemas"
REGION="${AWS_REGION:-us-east-1}"

# All 13 production tables
TABLES=(
  "companies"
  "company-users"
  "company-expenses"
  "company-projects"
  "company-contractors"
  "company-works"
  "invitations"
  "paddle-subscriptions"
  "paddle-customers"
  "paddle-payments"
  "paddle-webhooks"
  "paddle-webhook-dlq"
  "pending-payments"
)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=================================================="
echo "DynamoDB Schema Export Tool"
echo "=================================================="
echo "Table Prefix: ${TABLE_PREFIX}"
echo "Schema Directory: ${SCHEMA_DIR}"
echo "Region: ${REGION}"
echo "Tables to export: ${#TABLES[@]}"
echo ""

# Create schema directory if it doesn't exist
mkdir -p "${SCHEMA_DIR}"

# Summary file
SUMMARY_FILE="${SCHEMA_DIR}/table-summary.txt"
echo "DynamoDB Table Schema Summary" > "${SUMMARY_FILE}"
echo "Generated: $(date)" >> "${SUMMARY_FILE}"
echo "Table Prefix: ${TABLE_PREFIX}" >> "${SUMMARY_FILE}"
echo "Region: ${REGION}" >> "${SUMMARY_FILE}"
echo "" >> "${SUMMARY_FILE}"

# Export each table
EXPORTED_COUNT=0
FAILED_COUNT=0
FAILED_TABLES=()

for TABLE_SUFFIX in "${TABLES[@]}"; do
  TABLE_NAME="${TABLE_PREFIX}-${TABLE_SUFFIX}"
  SCHEMA_FILE="${SCHEMA_DIR}/${TABLE_SUFFIX}.json"

  echo -n "Exporting ${TABLE_NAME}... "

  # Check if table exists
  if ! aws dynamodb describe-table --table-name "${TABLE_NAME}" --region "${REGION}" > /dev/null 2>&1; then
    echo -e "${RED}NOT FOUND${NC}"
    echo "  ✗ ${TABLE_NAME} - NOT FOUND" >> "${SUMMARY_FILE}"
    FAILED_COUNT=$((FAILED_COUNT + 1))
    FAILED_TABLES+=("${TABLE_NAME}")
    continue
  fi

  # Export table schema
  if aws dynamodb describe-table \
    --table-name "${TABLE_NAME}" \
    --region "${REGION}" \
    --output json > "${SCHEMA_FILE}" 2>&1; then

    echo -e "${GREEN}SUCCESS${NC}"

    # Extract key information for summary
    PARTITION_KEY=$(jq -r '.Table.KeySchema[] | select(.KeyType=="HASH") | .AttributeName' "${SCHEMA_FILE}")
    SORT_KEY=$(jq -r '.Table.KeySchema[] | select(.KeyType=="RANGE") | .AttributeName // "none"' "${SCHEMA_FILE}")
    GSI_COUNT=$(jq -r '.Table.GlobalSecondaryIndexes // [] | length' "${SCHEMA_FILE}")
    BILLING_MODE=$(jq -r '.Table.BillingModeSummary.BillingMode // "PROVISIONED"' "${SCHEMA_FILE}")
    ITEM_COUNT=$(jq -r '.Table.ItemCount // 0' "${SCHEMA_FILE}")
    TABLE_SIZE_MB=$(jq -r '.Table.TableSizeBytes // 0' "${SCHEMA_FILE}" | awk '{printf "%.2f", $1/1024/1024}')

    # Write to summary
    echo "  ✓ ${TABLE_NAME}" >> "${SUMMARY_FILE}"
    echo "    - Partition Key: ${PARTITION_KEY}" >> "${SUMMARY_FILE}"
    echo "    - Sort Key: ${SORT_KEY}" >> "${SUMMARY_FILE}"
    echo "    - GSI Count: ${GSI_COUNT}" >> "${SUMMARY_FILE}"
    echo "    - Billing Mode: ${BILLING_MODE}" >> "${SUMMARY_FILE}"
    echo "    - Item Count: ${ITEM_COUNT}" >> "${SUMMARY_FILE}"
    echo "    - Table Size: ${TABLE_SIZE_MB} MB" >> "${SUMMARY_FILE}"
    echo "    - Schema File: ${SCHEMA_FILE}" >> "${SUMMARY_FILE}"
    echo "" >> "${SUMMARY_FILE}"

    EXPORTED_COUNT=$((EXPORTED_COUNT + 1))
  else
    echo -e "${RED}FAILED${NC}"
    echo "  ✗ ${TABLE_NAME} - EXPORT FAILED" >> "${SUMMARY_FILE}"
    FAILED_COUNT=$((FAILED_COUNT + 1))
    FAILED_TABLES+=("${TABLE_NAME}")
  fi
done

echo ""
echo "=================================================="
echo "Export Summary"
echo "=================================================="
echo -e "${GREEN}Successfully exported: ${EXPORTED_COUNT}${NC}"
if [ ${FAILED_COUNT} -gt 0 ]; then
  echo -e "${RED}Failed: ${FAILED_COUNT}${NC}"
  echo ""
  echo "Failed tables:"
  for FAILED_TABLE in "${FAILED_TABLES[@]}"; do
    echo "  - ${FAILED_TABLE}"
  done
fi
echo ""
echo "Schema files saved to: ${SCHEMA_DIR}"
echo "Summary saved to: ${SUMMARY_FILE}"
echo ""

# Display summary content
echo "=================================================="
echo "Table Summary"
echo "=================================================="
cat "${SUMMARY_FILE}"

# Exit with error if any tables failed
if [ ${FAILED_COUNT} -gt 0 ]; then
  exit 1
fi

echo ""
echo -e "${GREEN}All table schemas exported successfully!${NC}"
