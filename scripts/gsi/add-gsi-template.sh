#!/bin/bash
# scripts/gsi/add-gsi-template.sh
# Template script for adding Global Secondary Indexes (GSIs) to DynamoDB tables
#
# DynamoDB Limitation: Only ONE GSI can be created/modified at a time
# This script handles that limitation by:
# - Creating one GSI per execution
# - Waiting for the GSI to become ACTIVE before completing
# - Providing status updates during creation
# - Being idempotent (safe to run multiple times)
#
# Usage:
#   # Basic usage - modify the configuration section below
#   ./scripts/gsi/add-gsi-template.sh
#
#   # Or pass parameters via environment variables
#   TABLE_NAME=construction-expenses-companies \
#   INDEX_NAME=by-email \
#   PARTITION_KEY=email \
#   PARTITION_KEY_TYPE=S \
#   ./scripts/gsi/add-gsi-template.sh
#
#   # With sort key
#   TABLE_NAME=construction-expenses-company-expenses \
#   INDEX_NAME=by-company-and-date \
#   PARTITION_KEY=companyId \
#   PARTITION_KEY_TYPE=S \
#   SORT_KEY=createdAt \
#   SORT_KEY_TYPE=N \
#   ./scripts/gsi/add-gsi-template.sh
#
# Requirements:
#   - AWS CLI configured with appropriate credentials
#   - DynamoDB index creation permissions
#   - Table must exist and be in ACTIVE state

set -e

# ===================================================================
# CONFIGURATION - Modify these values for your specific use case
# ===================================================================

# Table configuration
TABLE_NAME="${TABLE_NAME:-construction-expenses-companies}"
REGION="${AWS_REGION:-us-east-1}"

# GSI configuration
INDEX_NAME="${INDEX_NAME:-by-email}"
PARTITION_KEY="${PARTITION_KEY:-email}"
PARTITION_KEY_TYPE="${PARTITION_KEY_TYPE:-S}"  # S=String, N=Number, B=Binary

# Optional: Sort key for composite GSI
SORT_KEY="${SORT_KEY:-}"
SORT_KEY_TYPE="${SORT_KEY_TYPE:-N}"  # S=String, N=Number, B=Binary

# Projection type: ALL, KEYS_ONLY, or INCLUDE
PROJECTION_TYPE="${PROJECTION_TYPE:-ALL}"
# If PROJECTION_TYPE=INCLUDE, specify attributes to include
PROJECTION_ATTRIBUTES="${PROJECTION_ATTRIBUTES:-}"  # Comma-separated: "attr1,attr2,attr3"

# ===================================================================
# Script Logic - No need to modify below this line
# ===================================================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "=================================================="
echo "DynamoDB GSI Addition Tool"
echo "=================================================="
echo "Table: ${TABLE_NAME}"
echo "Region: ${REGION}"
echo "Index: ${INDEX_NAME}"
echo "Partition Key: ${PARTITION_KEY} (${PARTITION_KEY_TYPE})"
if [ -n "${SORT_KEY}" ]; then
  echo "Sort Key: ${SORT_KEY} (${SORT_KEY_TYPE})"
fi
echo "Projection: ${PROJECTION_TYPE}"
if [ "${PROJECTION_TYPE}" = "INCLUDE" ] && [ -n "${PROJECTION_ATTRIBUTES}" ]; then
  echo "Included Attributes: ${PROJECTION_ATTRIBUTES}"
fi
echo ""

# Check if table exists
echo "Checking if table exists..."
if ! aws dynamodb describe-table --table-name "${TABLE_NAME}" --region "${REGION}" > /dev/null 2>&1; then
  echo -e "${RED}ERROR: Table '${TABLE_NAME}' does not exist${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Table exists${NC}"
echo ""

# Check if GSI already exists
echo "Checking if GSI already exists..."
EXISTING_GSI=$(aws dynamodb describe-table \
  --table-name "${TABLE_NAME}" \
  --region "${REGION}" \
  --query "Table.GlobalSecondaryIndexes[?IndexName=='${INDEX_NAME}'].IndexName" \
  --output text 2>&1 || echo "")

if [ -n "${EXISTING_GSI}" ]; then
  # Get GSI status
  GSI_STATUS=$(aws dynamodb describe-table \
    --table-name "${TABLE_NAME}" \
    --region "${REGION}" \
    --query "Table.GlobalSecondaryIndexes[?IndexName=='${INDEX_NAME}'].IndexStatus" \
    --output text)

  if [ "${GSI_STATUS}" = "ACTIVE" ]; then
    echo -e "${YELLOW}GSI '${INDEX_NAME}' already exists and is ACTIVE${NC}"
    echo "No action needed."
    exit 0
  elif [ "${GSI_STATUS}" = "CREATING" ]; then
    echo -e "${YELLOW}GSI '${INDEX_NAME}' is currently being created${NC}"
    echo "Waiting for GSI to become ACTIVE..."
    # Skip to wait section
  else
    echo -e "${YELLOW}GSI '${INDEX_NAME}' exists with status: ${GSI_STATUS}${NC}"
    echo "Please check the table manually."
    exit 1
  fi
else
  # Build KeySchema for GSI
  if [ -n "${SORT_KEY}" ]; then
    KEY_SCHEMA="[
      {\"AttributeName\":\"${PARTITION_KEY}\",\"KeyType\":\"HASH\"},
      {\"AttributeName\":\"${SORT_KEY}\",\"KeyType\":\"RANGE\"}
    ]"
  else
    KEY_SCHEMA="[
      {\"AttributeName\":\"${PARTITION_KEY}\",\"KeyType\":\"HASH\"}
    ]"
  fi

  # Build AttributeDefinitions
  if [ -n "${SORT_KEY}" ]; then
    ATTRIBUTE_DEFINITIONS="[
      {\"AttributeName\":\"${PARTITION_KEY}\",\"AttributeType\":\"${PARTITION_KEY_TYPE}\"},
      {\"AttributeName\":\"${SORT_KEY}\",\"AttributeType\":\"${SORT_KEY_TYPE}\"}
    ]"
  else
    ATTRIBUTE_DEFINITIONS="[
      {\"AttributeName\":\"${PARTITION_KEY}\",\"AttributeType\":\"${PARTITION_KEY_TYPE}\"}
    ]"
  fi

  # Build Projection
  if [ "${PROJECTION_TYPE}" = "INCLUDE" ] && [ -n "${PROJECTION_ATTRIBUTES}" ]; then
    # Convert comma-separated list to JSON array
    IFS=',' read -ra ATTRS <<< "${PROJECTION_ATTRIBUTES}"
    NON_KEY_ATTRS="["
    for i in "${!ATTRS[@]}"; do
      if [ $i -gt 0 ]; then
        NON_KEY_ATTRS="${NON_KEY_ATTRS},"
      fi
      NON_KEY_ATTRS="${NON_KEY_ATTRS}\"${ATTRS[$i]}\""
    done
    NON_KEY_ATTRS="${NON_KEY_ATTRS}]"

    PROJECTION="{
      \"ProjectionType\":\"${PROJECTION_TYPE}\",
      \"NonKeyAttributes\":${NON_KEY_ATTRS}
    }"
  else
    PROJECTION="{\"ProjectionType\":\"${PROJECTION_TYPE}\"}"
  fi

  # Build GlobalSecondaryIndexUpdates
  GSI_UPDATE="[{
    \"Create\": {
      \"IndexName\": \"${INDEX_NAME}\",
      \"KeySchema\": ${KEY_SCHEMA},
      \"Projection\": ${PROJECTION}
    }
  }]"

  echo "Creating GSI..."
  echo ""

  # Execute GSI creation
  if aws dynamodb update-table \
    --table-name "${TABLE_NAME}" \
    --region "${REGION}" \
    --attribute-definitions "${ATTRIBUTE_DEFINITIONS}" \
    --global-secondary-index-updates "${GSI_UPDATE}" > /dev/null 2>&1; then

    echo -e "${GREEN}✓ GSI creation initiated${NC}"
  else
    echo -e "${RED}✗ Failed to create GSI${NC}"
    echo "This could be due to:"
    echo "  1. Another GSI is currently being created/updated"
    echo "  2. The attribute is not already defined in the table"
    echo "  3. Insufficient permissions"
    exit 1
  fi
fi

# Wait for GSI to become ACTIVE
echo ""
echo "Waiting for GSI to become ACTIVE..."
echo "This may take several minutes depending on table size..."
echo ""

WAIT_COUNT=0
MAX_WAIT=60  # 10 minutes (60 * 10 seconds)

while [ ${WAIT_COUNT} -lt ${MAX_WAIT} ]; do
  GSI_STATUS=$(aws dynamodb describe-table \
    --table-name "${TABLE_NAME}" \
    --region "${REGION}" \
    --query "Table.GlobalSecondaryIndexes[?IndexName=='${INDEX_NAME}'].IndexStatus" \
    --output text 2>&1 || echo "ERROR")

  if [ "${GSI_STATUS}" = "ACTIVE" ]; then
    echo -e "${GREEN}✓ GSI is now ACTIVE${NC}"
    break
  elif [ "${GSI_STATUS}" = "CREATING" ]; then
    echo -n "."
    sleep 10
    WAIT_COUNT=$((WAIT_COUNT + 1))
  else
    echo ""
    echo -e "${RED}✗ Unexpected GSI status: ${GSI_STATUS}${NC}"
    exit 1
  fi
done

echo ""

if [ ${WAIT_COUNT} -ge ${MAX_WAIT} ]; then
  echo -e "${RED}✗ Timeout waiting for GSI to become ACTIVE${NC}"
  echo "The GSI is still being created. Check AWS Console for status."
  exit 1
fi

# Display final GSI information
echo ""
echo "=================================================="
echo "GSI Creation Complete"
echo "=================================================="
aws dynamodb describe-table \
  --table-name "${TABLE_NAME}" \
  --region "${REGION}" \
  --query "Table.GlobalSecondaryIndexes[?IndexName=='${INDEX_NAME}']" \
  --output json | jq -r '.[0] | "
Index Name: \(.IndexName)
Status: \(.IndexStatus)
Partition Key: \(.KeySchema[] | select(.KeyType==\"HASH\") | .AttributeName)
Sort Key: \(.KeySchema[] | select(.KeyType==\"RANGE\") | .AttributeName // "none")
Projection Type: \(.Projection.ProjectionType)
Item Count: \(.ItemCount // 0)
Index Size: \((.IndexSizeBytes // 0) / 1024 / 1024 | floor) MB
"'

echo ""
echo -e "${GREEN}GSI successfully added and is ready to use!${NC}"
