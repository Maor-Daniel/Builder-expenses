# DynamoDB Management Scripts

This directory contains scripts for managing DynamoDB tables for the construction-expenses application.

## Overview

The application uses 13 DynamoDB tables:
- 7 company-related tables
- 5 Paddle payment tables
- 1 pending payments table

All scripts are:
- **Idempotent** - Safe to run multiple times
- **Environment-aware** - Support production, staging, and development
- **Configuration-driven** - Use environment variables, no hardcoded values

## Scripts

### 1. Export Table Schemas

**Script**: `export-dynamodb-schemas.sh`

Exports all production DynamoDB table schemas to `infrastructure/schemas/`.

```bash
# Export all production table schemas
./scripts/export-dynamodb-schemas.sh

# Export with custom prefix
TABLE_PREFIX=my-app ./scripts/export-dynamodb-schemas.sh

# Export from different region
AWS_REGION=us-west-2 ./scripts/export-dynamodb-schemas.sh
```

**What it does:**
- Exports complete table definitions (keys, attributes, GSIs, TTL)
- Creates individual JSON file for each table
- Generates summary report with table statistics
- Safe to run - only reads, never modifies tables

**Output:**
- `infrastructure/schemas/{table-name}.json` - Full schema for each table
- `infrastructure/schemas/table-summary.txt` - Overview of all tables

**Use this when:**
- Documenting current production schema
- Preparing to create tables in new environment
- Backing up table definitions before changes

---

### 2. Create DynamoDB Tables

**Script**: `create-dynamodb-tables.sh`

Creates all 13 DynamoDB tables in a new environment based on exported schemas.

```bash
# Create production tables (default)
./scripts/create-dynamodb-tables.sh

# Create staging tables
ENVIRONMENT=staging ./scripts/create-dynamodb-tables.sh

# Create development tables with custom prefix
ENVIRONMENT=dev TABLE_PREFIX=my-app ./scripts/create-dynamodb-tables.sh

# Create in different region
AWS_REGION=us-west-2 ./scripts/create-dynamodb-tables.sh
```

**What it does:**
- Creates all 13 tables with correct schemas
- Adds all Global Secondary Indexes (GSIs)
- Configures TTL on applicable tables (pending-payments, paddle-webhook-dlq)
- Enables Point-in-Time Recovery (PITR)
- Enables Server-Side Encryption (SSE)
- Uses on-demand billing (PAY_PER_REQUEST)
- Skips tables that already exist
- Adds environment tags

**Environment-aware naming:**
- Production: `construction-expenses-{table-name}`
- Staging: `construction-expenses-staging-{table-name}`
- Dev: `construction-expenses-dev-{table-name}`

**Prerequisites:**
- Must run `export-dynamodb-schemas.sh` first to generate schema files
- Requires AWS CLI with table creation permissions

**Use this when:**
- Setting up new environment (staging, development)
- Disaster recovery (recreating tables)
- Creating test environment for CI/CD

---

### 3. Add Global Secondary Index (GSI)

**Script**: `gsi/add-gsi-template.sh`

Template script for adding a single Global Secondary Index to a table.

```bash
# Basic usage - edit configuration in script first
./scripts/gsi/add-gsi-template.sh

# Or pass via environment variables
TABLE_NAME=construction-expenses-companies \
INDEX_NAME=by-email \
PARTITION_KEY=email \
PARTITION_KEY_TYPE=S \
./scripts/gsi/add-gsi-template.sh

# With sort key (composite GSI)
TABLE_NAME=construction-expenses-company-expenses \
INDEX_NAME=by-company-and-date \
PARTITION_KEY=companyId \
PARTITION_KEY_TYPE=S \
SORT_KEY=createdAt \
SORT_KEY_TYPE=N \
./scripts/gsi/add-gsi-template.sh
```

**Configuration Options:**

| Variable | Description | Example |
|----------|-------------|---------|
| `TABLE_NAME` | Full table name | `construction-expenses-companies` |
| `INDEX_NAME` | GSI name | `by-email` |
| `PARTITION_KEY` | GSI partition key attribute | `email` |
| `PARTITION_KEY_TYPE` | Attribute type (S/N/B) | `S` |
| `SORT_KEY` | Optional sort key | `createdAt` |
| `SORT_KEY_TYPE` | Sort key type (S/N/B) | `N` |
| `PROJECTION_TYPE` | ALL, KEYS_ONLY, INCLUDE | `ALL` |
| `PROJECTION_ATTRIBUTES` | If INCLUDE, comma list | `attr1,attr2` |

**What it does:**
- Adds one GSI to a table (DynamoDB limitation: one at a time)
- Waits for GSI to become ACTIVE (may take minutes)
- Skips if GSI already exists
- Provides status updates during creation

**DynamoDB GSI Limitations:**
- Only ONE GSI can be created/modified at a time per table
- Must wait for GSI to be ACTIVE before adding another
- This script handles the wait automatically

**Use this when:**
- Adding new query pattern requires a GSI
- Optimizing queries on existing tables
- Following architecture updates

---

## Common Workflows

### Setting Up a New Environment

```bash
# 1. Export production schemas (one-time)
./scripts/export-dynamodb-schemas.sh

# 2. Create staging tables
ENVIRONMENT=staging ./scripts/create-dynamodb-tables.sh

# 3. Verify tables created
aws dynamodb list-tables --output table | grep staging
```

### Adding a New GSI to Production

```bash
# 1. Create a copy of the template for your specific GSI
cp scripts/gsi/add-gsi-template.sh scripts/gsi/add-by-email-index.sh

# 2. Edit the configuration section
# Set TABLE_NAME, INDEX_NAME, PARTITION_KEY, etc.

# 3. Run the script
./scripts/gsi/add-by-email-index.sh

# 4. Wait for GSI to become ACTIVE (script handles this)

# 5. Re-export schema to document the change
./scripts/export-dynamodb-schemas.sh
```

### Disaster Recovery

```bash
# 1. Ensure you have latest schema export
./scripts/export-dynamodb-schemas.sh

# 2. Recreate all tables
./scripts/create-dynamodb-tables.sh

# 3. Restore data from backup (separate process)
# Use AWS Backup, Point-in-Time Recovery, or S3 exports
```

## Environment Variables

All scripts support these environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `ENVIRONMENT` | `production` | Environment name (production/staging/dev) |
| `TABLE_PREFIX` | `construction-expenses` | Table name prefix |
| `AWS_REGION` | `us-east-1` | AWS region for DynamoDB |

## Table Naming Convention

Tables follow environment-aware naming:

```javascript
// From lambda/shared/table-config.js
function getTableName(tableSuffix) {
  if (ENVIRONMENT === 'production') {
    return `${TABLE_PREFIX}-${tableSuffix}`;
  }
  return `${TABLE_PREFIX}-${ENVIRONMENT}-${tableSuffix}`;
}
```

Examples:
- Production: `construction-expenses-companies`
- Staging: `construction-expenses-staging-companies`
- Dev: `construction-expenses-dev-companies`

## Prerequisites

All scripts require:
- AWS CLI installed and configured
- Appropriate AWS credentials with DynamoDB permissions
- jq (JSON processor) installed

### Required IAM Permissions

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:DescribeTable",
        "dynamodb:CreateTable",
        "dynamodb:UpdateTable",
        "dynamodb:UpdateContinuousBackups",
        "dynamodb:UpdateTimeToLive",
        "dynamodb:TagResource",
        "dynamodb:ListTables"
      ],
      "Resource": "arn:aws:dynamodb:*:*:table/construction-expenses-*"
    }
  ]
}
```

## Troubleshooting

### Script fails with "table already exists"
This is normal - scripts are idempotent. The script will skip existing tables and continue.

### GSI creation times out
GSI creation can take 10+ minutes for large tables. Increase `MAX_WAIT` in the script or check AWS Console.

### Schema file not found
Run `export-dynamodb-schemas.sh` first to generate schema files.

### Permission denied
Ensure:
1. Script is executable: `chmod +x scripts/*.sh`
2. AWS credentials are configured: `aws configure`
3. IAM role has necessary permissions

## Safety Features

All scripts include:
- **Dry-run capabilities** - Check before modifying
- **Idempotency** - Safe to run multiple times
- **Error handling** - Clear error messages
- **Status reporting** - Progress updates during execution
- **Validation** - Checks prerequisites before running

## Next Steps

After Phase 2 (DynamoDB Table Management), proceed to:
- **Phase 3**: Lambda Configuration Management
- **Phase 4**: CloudFormation Integration
- **Phase 5**: Complete Infrastructure as Code

## References

- [DynamoDB Best Practices](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html)
- [Global Secondary Indexes](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/GSI.html)
- [Time to Live (TTL)](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/TTL.html)
- Table Configuration: `lambda/shared/table-config.js`
