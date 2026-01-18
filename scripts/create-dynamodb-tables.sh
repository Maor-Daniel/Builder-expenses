#!/bin/bash
# scripts/create-dynamodb-tables.sh
# Creates all 13 DynamoDB tables for the construction-expenses application
#
# This script is idempotent - safe to run multiple times.
# It will skip tables that already exist and only create missing tables.
#
# Features:
# - Environment-aware table naming (production, staging, dev)
# - Reads schema definitions from infrastructure/schemas/
# - Creates tables with proper keys, attributes, and GSIs
# - On-demand billing mode (cost-effective for variable workloads)
# - Point-in-time recovery enabled
# - Server-side encryption enabled
# - TTL configured where applicable
#
# Usage:
#   # Production (default)
#   ./scripts/create-dynamodb-tables.sh
#
#   # Staging environment
#   ENVIRONMENT=staging ./scripts/create-dynamodb-tables.sh
#
#   # Development environment with custom prefix
#   ENVIRONMENT=dev TABLE_PREFIX=my-app ./scripts/create-dynamodb-tables.sh
#
# Requirements:
#   - AWS CLI configured with appropriate credentials
#   - DynamoDB table creation permissions
#   - Schema files in infrastructure/schemas/ (run export-dynamodb-schemas.sh first)

set -e

# Configuration
ENVIRONMENT="${ENVIRONMENT:-production}"
TABLE_PREFIX="${TABLE_PREFIX:-construction-expenses}"
REGION="${AWS_REGION:-us-east-1}"
SCHEMA_DIR="infrastructure/schemas"

# Generate environment-aware table name
# Production: construction-expenses-{suffix}
# Staging/Dev: construction-expenses-{environment}-{suffix}
get_table_name() {
  local suffix=$1
  if [ "${ENVIRONMENT}" = "production" ]; then
    echo "${TABLE_PREFIX}-${suffix}"
  else
    echo "${TABLE_PREFIX}-${ENVIRONMENT}-${suffix}"
  fi
}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "=================================================="
echo "DynamoDB Table Creation Tool"
echo "=================================================="
echo "Environment: ${ENVIRONMENT}"
echo "Table Prefix: ${TABLE_PREFIX}"
echo "Region: ${REGION}"
echo "Schema Directory: ${SCHEMA_DIR}"
echo ""

# Check if schema directory exists
if [ ! -d "${SCHEMA_DIR}" ]; then
  echo -e "${RED}ERROR: Schema directory not found: ${SCHEMA_DIR}${NC}"
  echo "Please run ./scripts/export-dynamodb-schemas.sh first to export production schemas"
  exit 1
fi

# Table definitions with schema references
# Each table maps to a schema file in infrastructure/schemas/
declare -A TABLE_DEFINITIONS=(
  ["companies"]="companies.json"
  ["company-users"]="company-users.json"
  ["company-expenses"]="company-expenses.json"
  ["company-projects"]="company-projects.json"
  ["company-contractors"]="company-contractors.json"
  ["company-works"]="company-works.json"
  ["invitations"]="invitations.json"
  ["paddle-subscriptions"]="paddle-subscriptions.json"
  ["paddle-customers"]="paddle-customers.json"
  ["paddle-payments"]="paddle-payments.json"
  ["paddle-webhooks"]="paddle-webhooks.json"
  ["paddle-webhook-dlq"]="paddle-webhook-dlq.json"
  ["pending-payments"]="pending-payments.json"
)

# Track creation stats
CREATED_COUNT=0
SKIPPED_COUNT=0
FAILED_COUNT=0
TOTAL_COUNT=${#TABLE_DEFINITIONS[@]}

echo "Creating ${TOTAL_COUNT} tables..."
echo ""

# Create each table
for TABLE_SUFFIX in "${!TABLE_DEFINITIONS[@]}"; do
  TABLE_NAME=$(get_table_name "${TABLE_SUFFIX}")
  SCHEMA_FILE="${SCHEMA_DIR}/${TABLE_DEFINITIONS[$TABLE_SUFFIX]}"

  echo "---------------------------------------------------"
  echo "Table: ${TABLE_NAME}"
  echo "Schema: ${SCHEMA_FILE}"

  # Check if table already exists
  if aws dynamodb describe-table --table-name "${TABLE_NAME}" --region "${REGION}" > /dev/null 2>&1; then
    echo -e "${YELLOW}Status: ALREADY EXISTS - SKIPPING${NC}"
    SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
    continue
  fi

  # Check if schema file exists
  if [ ! -f "${SCHEMA_FILE}" ]; then
    echo -e "${RED}Status: SCHEMA FILE NOT FOUND - SKIPPING${NC}"
    echo "Please run ./scripts/export-dynamodb-schemas.sh first"
    FAILED_COUNT=$((FAILED_COUNT + 1))
    continue
  fi

  # Extract key schema and attribute definitions from production schema
  KEY_SCHEMA=$(jq -c '.Table.KeySchema' "${SCHEMA_FILE}")
  ATTRIBUTE_DEFINITIONS=$(jq -c '.Table.AttributeDefinitions' "${SCHEMA_FILE}")

  # Build create-table command
  echo "Creating table..."

  # Start with basic table creation
  CREATE_CMD="aws dynamodb create-table \
    --table-name ${TABLE_NAME} \
    --region ${REGION} \
    --key-schema '${KEY_SCHEMA}' \
    --attribute-definitions '${ATTRIBUTE_DEFINITIONS}' \
    --billing-mode PAY_PER_REQUEST"

  # Add GSIs if they exist in the schema
  GSI_COUNT=$(jq -r '.Table.GlobalSecondaryIndexes // [] | length' "${SCHEMA_FILE}")
  if [ "${GSI_COUNT}" -gt 0 ]; then
    echo "  - Adding ${GSI_COUNT} Global Secondary Index(es)"

    # Extract GSIs and convert to create-table format (remove IndexStatus, IndexArn, etc.)
    GSIS=$(jq -c '[.Table.GlobalSecondaryIndexes[] | {
      IndexName: .IndexName,
      KeySchema: .KeySchema,
      Projection: .Projection
    }]' "${SCHEMA_FILE}")

    CREATE_CMD="${CREATE_CMD} --global-secondary-indexes '${GSIS}'"
  fi

  # Add SSE (Server-Side Encryption)
  CREATE_CMD="${CREATE_CMD} --sse-specification Enabled=true"

  # Add tags
  TAGS="[
    {\"Key\":\"Environment\",\"Value\":\"${ENVIRONMENT}\"},
    {\"Key\":\"Application\",\"Value\":\"construction-expenses\"},
    {\"Key\":\"ManagedBy\",\"Value\":\"script\"},
    {\"Key\":\"CreatedAt\",\"Value\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}
  ]"
  CREATE_CMD="${CREATE_CMD} --tags '${TAGS}'"

  # Execute table creation
  if eval ${CREATE_CMD} > /dev/null 2>&1; then
    echo -e "${GREEN}Status: CREATED${NC}"

    # Wait for table to become active
    echo "  - Waiting for table to become active..."
    aws dynamodb wait table-exists --table-name "${TABLE_NAME}" --region "${REGION}"

    # Enable Point-in-Time Recovery
    echo "  - Enabling point-in-time recovery..."
    aws dynamodb update-continuous-backups \
      --table-name "${TABLE_NAME}" \
      --region "${REGION}" \
      --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true > /dev/null 2>&1

    # Configure TTL if this is the pending-payments table
    if [ "${TABLE_SUFFIX}" = "pending-payments" ]; then
      echo "  - Configuring TTL on expiresAt field..."
      aws dynamodb update-time-to-live \
        --table-name "${TABLE_NAME}" \
        --region "${REGION}" \
        --time-to-live-specification "Enabled=true,AttributeName=expiresAt" > /dev/null 2>&1
    fi

    # Configure TTL if this is paddle-webhook-dlq table
    if [ "${TABLE_SUFFIX}" = "paddle-webhook-dlq" ]; then
      echo "  - Configuring TTL on ttl field..."
      aws dynamodb update-time-to-live \
        --table-name "${TABLE_NAME}" \
        --region "${REGION}" \
        --time-to-live-specification "Enabled=true,AttributeName=ttl" > /dev/null 2>&1
    fi

    CREATED_COUNT=$((CREATED_COUNT + 1))
  else
    echo -e "${RED}Status: CREATION FAILED${NC}"
    FAILED_COUNT=$((FAILED_COUNT + 1))
  fi
done

echo ""
echo "=================================================="
echo "Creation Summary"
echo "=================================================="
echo -e "Total tables: ${TOTAL_COUNT}"
echo -e "${GREEN}Successfully created: ${CREATED_COUNT}${NC}"
echo -e "${YELLOW}Skipped (already exist): ${SKIPPED_COUNT}${NC}"
if [ ${FAILED_COUNT} -gt 0 ]; then
  echo -e "${RED}Failed: ${FAILED_COUNT}${NC}"
fi
echo ""

# Display created tables
if [ ${CREATED_COUNT} -gt 0 ]; then
  echo "Newly created tables:"
  aws dynamodb list-tables --region "${REGION}" --output json | \
    jq -r ".TableNames[] | select(startswith(\"$(get_table_name '')\"))" | \
    while read -r table; do
      echo -e "  ${GREEN}✓${NC} ${table}"
    done
  echo ""
fi

# Exit with appropriate code
if [ ${FAILED_COUNT} -gt 0 ]; then
  echo -e "${RED}Some tables failed to create. Please check the errors above.${NC}"
  exit 1
fi

if [ ${CREATED_COUNT} -eq 0 ] && [ ${SKIPPED_COUNT} -eq ${TOTAL_COUNT} ]; then
  echo -e "${BLUE}All tables already exist. No action needed.${NC}"
  exit 0
fi

echo -e "${GREEN}Table creation completed successfully!${NC}"
