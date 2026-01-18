# DynamoDB Table Schemas

This directory contains the exported schemas for all 13 production DynamoDB tables used by the construction-expenses application.

## Table Overview

All tables use the prefix: `construction-expenses-`

### Company-Related Tables (7 tables)
1. **companies** - Main company records
   - Partition Key: `companyId`
   - GSI: `appleSubscriptionId-index`

2. **company-users** - Company user associations
   - Partition Key: `companyId`, Sort Key: `userId`
   - GSIs: `userId-index`, `email-index`

3. **company-expenses** - Expense records
   - Partition Key: `companyId`, Sort Key: `expenseId`
   - GSIs: `expenseId-index`, `userId-index`

4. **company-projects** - Project records
   - Partition Key: `companyId`, Sort Key: `projectId`
   - No GSIs

5. **company-contractors** - Contractor records
   - Partition Key: `companyId`, Sort Key: `contractorId`
   - No GSIs

6. **company-works** - Work records
   - Partition Key: `companyId`, Sort Key: `workId`
   - No GSIs

7. **invitations** - Company invitations
   - Partition Key: `companyId`, Sort Key: `invitationId`
   - GSI: `invitationCode-index`

### Paddle Payment Tables (5 tables)
8. **paddle-subscriptions** - Subscription records
   - Partition Key: `companyId`
   - GSIs: `subscriptionId-index`, `customerId-index`

9. **paddle-customers** - Customer records
   - Partition Key: `paddleCustomerId`
   - GSIs: `clerkUserId-index`, `email-index`

10. **paddle-payments** - Payment transaction records
    - Partition Key: `paymentId`
    - GSI: `subscriptionId-index`

11. **paddle-webhooks** - Webhook event log
    - Partition Key: `webhookId`
    - GSI: `eventId-index`

12. **paddle-webhook-dlq** - Dead letter queue for failed webhooks
    - Partition Key: `dlqEntryId`
    - GSI: `webhookId-index`
    - TTL: `ttl` field (auto-deletes old entries)

### Payment Processing Tables (1 table)
13. **pending-payments** - Temporary payment checkout tracking
    - Partition Key: `userId`
    - No GSIs
    - TTL: `expiresAt` field (auto-deletes after 24 hours)

## Schema Files

Each table has a corresponding JSON file containing the complete DynamoDB table description:
- `{table-name}.json` - Full table schema including:
  - Key schema (partition and sort keys)
  - Attribute definitions
  - Global Secondary Indexes (GSIs)
  - Billing mode
  - Encryption settings
  - Stream settings
  - TTL configuration

## Table Summary

See `table-summary.txt` for a quick overview of all tables including:
- Partition and sort keys
- GSI count
- Billing mode
- Current item count
- Table size

## Usage

These schemas are used by:
1. `scripts/create-dynamodb-tables.sh` - Create all tables in a new environment
2. `scripts/gsi/add-gsi-template.sh` - Add new GSIs to existing tables
3. Infrastructure as Code (future CloudFormation integration)

## Updating Schemas

When production table schemas change:

```bash
# Re-export all table schemas
./scripts/export-dynamodb-schemas.sh

# This will update all .json files in this directory
```

## Production vs Staging

- **Production**: Tables use prefix `construction-expenses-{table-name}`
- **Staging**: Tables use prefix `construction-expenses-staging-{table-name}`
- **Development**: Tables use prefix `construction-expenses-dev-{table-name}`

See `lambda/shared/table-config.js` for environment-aware table naming logic.
