# Phase 2: DynamoDB Management - Quick Reference

**Status**: ✅ COMPLETE | **All Checks**: 38/38 Passed | **Production Impact**: None

---

## Quick Commands

### Export Production Schemas
```bash
./scripts/export-dynamodb-schemas.sh
```
- Exports all 13 table schemas to `infrastructure/schemas/`
- Creates summary report
- Safe to run anytime (read-only)

### Create Staging Environment
```bash
ENVIRONMENT=staging ./scripts/create-dynamodb-tables.sh
```
- Creates all 13 tables with prefix: `construction-expenses-staging-`
- Skips existing tables
- Configures TTL, PITR, SSE

### Create Development Environment
```bash
ENVIRONMENT=dev ./scripts/create-dynamodb-tables.sh
```
- Creates all 13 tables with prefix: `construction-expenses-dev-`
- Idempotent (safe to run multiple times)

### Add New GSI
```bash
# Edit configuration in the script first
cp scripts/gsi/add-gsi-template.sh scripts/gsi/add-my-index.sh
nano scripts/gsi/add-my-index.sh  # Edit TABLE_NAME, INDEX_NAME, etc.
./scripts/gsi/add-my-index.sh
```

### Verify Phase 2 Completion
```bash
./scripts/verify-phase2.sh
```
- Checks all scripts exist and are executable
- Validates all 13 schema files
- Confirms documentation is complete

---

## File Locations

### Scripts
- `scripts/export-dynamodb-schemas.sh` - Export production schemas
- `scripts/create-dynamodb-tables.sh` - Create all tables
- `scripts/gsi/add-gsi-template.sh` - Add GSI to table
- `scripts/verify-phase2.sh` - Verify completion

### Documentation
- `scripts/README-DYNAMODB-SCRIPTS.md` - Complete script documentation
- `infrastructure/schemas/README.md` - Schema files overview
- `infrastructure/PHASE2-DYNAMODB-MANAGEMENT-COMPLETE.md` - Phase completion report

### Schema Files
- `infrastructure/schemas/*.json` - All 13 table schemas
- `infrastructure/schemas/table-summary.txt` - Quick reference

---

## Production Tables (13)

### Company Tables (7)
1. `companies` - Partition: companyId | GSIs: 1
2. `company-users` - Partition: companyId, Sort: userId | GSIs: 2
3. `company-expenses` - Partition: companyId, Sort: expenseId | GSIs: 2
4. `company-projects` - Partition: companyId, Sort: projectId | GSIs: 0
5. `company-contractors` - Partition: companyId, Sort: contractorId | GSIs: 0
6. `company-works` - Partition: companyId, Sort: workId | GSIs: 0
7. `invitations` - Partition: companyId, Sort: invitationId | GSIs: 1

### Paddle Tables (5)
8. `paddle-subscriptions` - Partition: companyId | GSIs: 2
9. `paddle-customers` - Partition: paddleCustomerId | GSIs: 2
10. `paddle-payments` - Partition: paymentId | GSIs: 1
11. `paddle-webhooks` - Partition: webhookId | GSIs: 1
12. `paddle-webhook-dlq` - Partition: dlqEntryId | GSIs: 1 | TTL: enabled

### Payment Tables (1)
13. `pending-payments` - Partition: userId | GSIs: 0 | TTL: enabled

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ENVIRONMENT` | `production` | production/staging/dev |
| `TABLE_PREFIX` | `construction-expenses` | Table name prefix |
| `AWS_REGION` | `us-east-1` | AWS region |

---

## Common Workflows

### Setting Up Staging
```bash
# 1. Ensure schemas are current
./scripts/export-dynamodb-schemas.sh

# 2. Create staging tables
ENVIRONMENT=staging ./scripts/create-dynamodb-tables.sh

# 3. Verify creation
aws dynamodb list-tables | grep staging
```

### Adding Production GSI
```bash
# 1. Copy template
cp scripts/gsi/add-gsi-template.sh scripts/gsi/add-email-index.sh

# 2. Edit configuration
nano scripts/gsi/add-email-index.sh
# Set: TABLE_NAME, INDEX_NAME, PARTITION_KEY, etc.

# 3. Run (waits for ACTIVE)
./scripts/gsi/add-email-index.sh

# 4. Document change
./scripts/export-dynamodb-schemas.sh
```

### Disaster Recovery
```bash
# 1. Have latest schemas
./scripts/export-dynamodb-schemas.sh

# 2. Recreate all tables
./scripts/create-dynamodb-tables.sh

# 3. Restore data from AWS Backup/PITR
# (separate process)
```

---

## Safety Features

- **Idempotent**: All scripts safe to run multiple times
- **Read-Only Export**: Never modifies production
- **Skip Existing**: Create script skips existing tables
- **Environment Aware**: Proper naming for each environment
- **No Hardcodes**: All config via environment variables
- **Validation**: Scripts check prerequisites before running

---

## Next Phase

**Phase 3**: Lambda Configuration Management
- Export Lambda configurations
- Create deployment scripts
- Document environment variables
- IAM role templates

---

## Support

- Full Documentation: `scripts/README-DYNAMODB-SCRIPTS.md`
- Schema Details: `infrastructure/schemas/README.md`
- Table Config: `lambda/shared/table-config.js`
- Completion Report: `infrastructure/PHASE2-DYNAMODB-MANAGEMENT-COMPLETE.md`
