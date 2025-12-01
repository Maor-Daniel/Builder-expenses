# Database Migration Scripts
## Multi-Table to Company-Scoped Architecture Migration

### Overview
This directory contains scripts for migrating from the multi-table architecture to the company-scoped architecture. The migration involves transforming data schemas, mapping user IDs to company IDs, and ensuring zero data loss.

---

## Script Inventory

### 1. `analyze-data-volume.js`
**Purpose:** Analyze current data volumes and identify migration scope

**Functions:**
- Count records in each table
- Identify data patterns
- Generate migration statistics
- Estimate migration time

**Usage:**
```bash
node analyze-data-volume.js [--dry-run] [--verbose]
```

**Output:**
```json
{
  "multi-table": {
    "expenses": { "count": 7, "size": 282189 },
    "projects": { "count": 1, "size": 188 },
    "contractors": { "count": 1, "size": 140 },
    "works": { "count": 1, "size": 259 }
  },
  "company-scoped": {
    "expenses": { "count": 37, "size": 14152 },
    "projects": { "count": 23, "size": 6938 },
    "contractors": { "count": 18, "size": 5581 },
    "works": { "count": 12, "size": 4443 }
  },
  "migration-needed": {
    "expenses": 7,
    "projects": 1,
    "contractors": 1,
    "works": 1
  }
}
```

---

### 2. `validate-schema-compatibility.js`
**Purpose:** Check schema differences and compatibility between architectures

**Functions:**
- Compare table schemas
- Identify missing fields
- Detect type mismatches
- Validate relationships

**Key Validations:**
```javascript
const schemaValidations = {
  expenses: {
    multiTable: ['userId', 'expenseId', 'amount', 'date'],
    companyScoped: ['companyId', 'expenseId', 'amount', 'date', 'createdBy'],
    transformations: {
      'userId': 'createdBy',  // Preserve original user
      'companyId': 'LOOKUP_REQUIRED'  // Need to map user to company
    }
  }
};
```

**Usage:**
```bash
node validate-schema-compatibility.js [--table expenses|projects|contractors|works]
```

---

### 3. `create-user-company-mapping.js`
**Purpose:** Create mapping between userIds and companyIds

**Algorithm:**
1. Scan company-users table for existing mappings
2. Query companies table for user memberships
3. Create mapping file for orphaned users
4. Generate company assignment for unmapped users

**Data Structure:**
```javascript
const userCompanyMapping = {
  "user_123": {
    companyId: "comp_789",
    companyName: "ABC Construction",
    userRole: "admin",
    mappingSource: "company-users-table"
  },
  "user_456": {
    companyId: "comp_789",
    companyName: "ABC Construction",
    userRole: "member",
    mappingSource: "company-users-table"
  },
  "orphaned_user_789": {
    companyId: "generated_comp_001",
    companyName: "Migrated Company",
    userRole: "admin",
    mappingSource: "auto-generated"
  }
};
```

**Usage:**
```bash
node create-user-company-mapping.js [--output mapping.json]
```

---

### 4. `migrate-expenses.js`
**Purpose:** Migrate expense records from multi-table to company-scoped

**Migration Logic:**
```javascript
async function migrateExpense(multiTableExpense, userCompanyMap) {
  const mapping = userCompanyMap[multiTableExpense.userId];

  if (!mapping) {
    throw new Error(`No company mapping for user ${multiTableExpense.userId}`);
  }

  return {
    // Primary keys
    companyId: mapping.companyId,
    expenseId: multiTableExpense.expenseId || generateExpenseId(),

    // Core fields
    amount: multiTableExpense.amount,
    description: multiTableExpense.description || '',
    date: multiTableExpense.date,
    category: multiTableExpense.category || 'general',

    // Relationships
    projectId: multiTableExpense.projectId || null,
    contractorId: multiTableExpense.contractorId || null,
    workId: multiTableExpense.workId || null,

    // Metadata
    createdBy: multiTableExpense.userId,
    createdAt: multiTableExpense.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),

    // Additional fields
    invoiceNum: multiTableExpense.invoiceNum || null,
    receiptUrl: multiTableExpense.receiptUrl || null,
    notes: multiTableExpense.notes || null,
    status: multiTableExpense.status || 'active',

    // Migration tracking
    migrationMetadata: {
      sourceTable: 'multi-table-expenses',
      migrationDate: new Date().toISOString(),
      originalUserId: multiTableExpense.userId
    }
  };
}
```

**Usage:**
```bash
node migrate-expenses.js [--batch-size 25] [--dry-run] [--mapping mapping.json]
```

**Features:**
- Batch processing for large datasets
- Progress tracking
- Error recovery
- Validation checks
- Rollback support

---

### 5. `migrate-projects.js`
**Purpose:** Migrate project records

**Schema Transformation:**
```javascript
const projectTransformation = {
  // Multi-table schema
  source: {
    userId: 'string',
    projectId: 'string',
    name: 'string',
    client: 'string',
    startDate: 'string',
    endDate: 'string',
    budget: 'number'
  },

  // Company-scoped schema
  target: {
    companyId: 'string',  // From mapping
    projectId: 'string',
    name: 'string',
    client: 'string',
    startDate: 'string',
    endDate: 'string',
    budget: 'number',
    createdBy: 'string',  // Original userId
    status: 'string',     // Default: 'active'
    createdAt: 'string',
    updatedAt: 'string'
  }
};
```

**Usage:**
```bash
node migrate-projects.js [--batch-size 25] [--dry-run] [--mapping mapping.json]
```

---

### 6. `migrate-contractors.js`
**Purpose:** Migrate contractor records

**Special Considerations:**
- Check for duplicate contractors in company scope
- Merge duplicate records if found
- Preserve relationships with expenses

**Deduplication Logic:**
```javascript
async function checkDuplicateContractor(companyId, contractor) {
  const existingContractors = await queryCompanyContractors(companyId);

  return existingContractors.find(existing =>
    existing.name.toLowerCase() === contractor.name.toLowerCase() ||
    existing.email === contractor.email ||
    existing.phone === contractor.phone
  );
}
```

**Usage:**
```bash
node migrate-contractors.js [--merge-duplicates] [--mapping mapping.json]
```

---

### 7. `migrate-works.js`
**Purpose:** Migrate work entry records

**Relationship Validation:**
```javascript
async function validateWorkRelationships(work) {
  const validations = {
    projectExists: await checkProjectExists(work.projectId),
    contractorExists: await checkContractorExists(work.contractorId),
    expensesLinked: await checkLinkedExpenses(work.workId)
  };

  if (!validations.projectExists) {
    console.warn(`Project ${work.projectId} not found for work ${work.workId}`);
  }

  return validations;
}
```

**Usage:**
```bash
node migrate-works.js [--validate-relationships] [--mapping mapping.json]
```

---

### 8. `validate-migration.js`
**Purpose:** Comprehensive validation of migrated data

**Validation Checks:**
1. **Record Count Validation**
   ```javascript
   const validateCounts = () => {
     const sourceCount = await getMultiTableCount();
     const targetCount = await getCompanyScopedCount();
     return sourceCount === targetCount;
   };
   ```

2. **Data Integrity Validation**
   ```javascript
   const validateIntegrity = async () => {
     // Check primary keys
     // Verify relationships
     // Validate required fields
     // Check data types
   };
   ```

3. **Business Logic Validation**
   ```javascript
   const validateBusinessLogic = async () => {
     // Expenses sum correctly
     // Projects have valid dates
     // Contractors have unique identifiers
     // Works link to valid projects
   };
   ```

**Usage:**
```bash
node validate-migration.js [--detailed] [--fix-issues]
```

**Output Report:**
```json
{
  "validation": {
    "status": "SUCCESS",
    "timestamp": "2024-12-01T10:00:00Z",
    "checks": {
      "recordCounts": { "passed": true, "details": {...} },
      "dataIntegrity": { "passed": true, "details": {...} },
      "businessLogic": { "passed": true, "details": {...} },
      "relationships": { "passed": true, "details": {...} }
    },
    "issues": [],
    "warnings": [
      "3 expenses missing invoice numbers",
      "1 contractor without email"
    ]
  }
}
```

---

### 9. `cleanup-old-tables.js`
**Purpose:** Remove deprecated tables after successful migration

**Safety Checks:**
```javascript
const safetyChecks = async () => {
  // 1. Verify migration completed
  const migrationComplete = await validateMigration();

  // 2. Check backup exists
  const backupExists = await checkBackups();

  // 3. Confirm no active connections
  const noActiveConnections = await checkTableConnections();

  // 4. Require manual confirmation
  const userConfirmed = await promptConfirmation();

  return migrationComplete && backupExists &&
         noActiveConnections && userConfirmed;
};
```

**Cleanup Process:**
1. Create final backup
2. Archive table data to S3
3. Delete Lambda functions
4. Remove API Gateway resources
5. Delete DynamoDB tables
6. Clean up IAM roles
7. Remove CloudWatch log groups

**Usage:**
```bash
node cleanup-old-tables.js [--confirm] [--archive-to-s3 bucket-name]
```

---

### 10. `rollback-migration.js`
**Purpose:** Emergency rollback if migration fails

**Rollback Strategies:**
```javascript
const rollbackStrategies = {
  FULL: 'Restore all tables from backup',
  PARTIAL: 'Restore specific tables only',
  DATA_ONLY: 'Restore data, keep infrastructure',
  FUNCTIONS_ONLY: 'Restore Lambda functions only'
};
```

**Usage:**
```bash
node rollback-migration.js --strategy [FULL|PARTIAL|DATA_ONLY|FUNCTIONS_ONLY] --backup-id [backup-id]
```

---

## Utility Scripts

### `dual-write-enabler.js`
**Purpose:** Enable/disable dual-write mode for Lambda functions

```bash
node dual-write-enabler.js --enable [--functions expense,project,contractor,work]
node dual-write-enabler.js --disable
```

### `migration-monitor.js`
**Purpose:** Real-time monitoring during migration

```bash
node migration-monitor.js [--dashboard] [--alerts]
```

**Displays:**
- Migration progress
- Error rates
- Performance metrics
- Data consistency checks

### `generate-migration-report.js`
**Purpose:** Generate comprehensive migration report

```bash
node generate-migration-report.js --output migration-report.html
```

---

## Common Functions Library (`lib/migration-utils.js`)

### Core Functions:
```javascript
// DynamoDB operations
async function scanTable(tableName, limit = null)
async function batchWriteItems(tableName, items)
async function queryByPartitionKey(tableName, partitionKey)

// ID generators
function generateExpenseId()
function generateProjectId()
function generateContractorId()
function generateWorkId()
function generateCompanyId()

// Data transformations
function transformUserId(userId, mapping)
function addMetadata(item, source)
function validateRequiredFields(item, schema)

// Progress tracking
class MigrationProgress {
  constructor(totalItems)
  update(processedItems)
  getEstimatedTimeRemaining()
  displayProgress()
}

// Error handling
class MigrationError extends Error {
  constructor(message, item, retryable = false)
}

// Logging
function logMigration(level, message, data)
function createAuditLog(operation, item)
```

---

## Configuration File (`migration-config.json`)

```json
{
  "source": {
    "tables": {
      "expenses": "construction-expenses-multi-table-expenses",
      "projects": "construction-expenses-multi-table-projects",
      "contractors": "construction-expenses-multi-table-contractors",
      "works": "construction-expenses-multi-table-works"
    }
  },
  "target": {
    "tables": {
      "expenses": "construction-expenses-company-expenses",
      "projects": "construction-expenses-company-projects",
      "contractors": "construction-expenses-company-contractors",
      "works": "construction-expenses-company-works"
    }
  },
  "migration": {
    "batchSize": 25,
    "retryAttempts": 3,
    "retryDelay": 1000,
    "validateData": true,
    "createBackups": true,
    "dryRun": false
  },
  "aws": {
    "region": "us-east-1",
    "profile": "default"
  },
  "monitoring": {
    "cloudwatchNamespace": "MigrationMetrics",
    "alertEmail": "ops@construction-expenses.com"
  }
}
```

---

## Running the Migration

### Prerequisites:
1. AWS CLI configured with appropriate credentials
2. Node.js 18.x or higher
3. All dependencies installed (`npm install`)
4. Backup of all tables completed

### Step-by-Step Process:

```bash
# 1. Analyze current state
node analyze-data-volume.js

# 2. Validate schemas
node validate-schema-compatibility.js

# 3. Create user-company mapping
node create-user-company-mapping.js --output mapping.json

# 4. Run migration in dry-run mode
node migrate-expenses.js --dry-run --mapping mapping.json
node migrate-projects.js --dry-run --mapping mapping.json
node migrate-contractors.js --dry-run --mapping mapping.json
node migrate-works.js --dry-run --mapping mapping.json

# 5. Execute actual migration
node migrate-expenses.js --mapping mapping.json
node migrate-projects.js --mapping mapping.json
node migrate-contractors.js --mapping mapping.json
node migrate-works.js --mapping mapping.json

# 6. Validate migration
node validate-migration.js --detailed

# 7. Enable dual-write mode
node dual-write-enabler.js --enable

# 8. Monitor for 24 hours
node migration-monitor.js --dashboard

# 9. Cleanup old resources (after validation)
node cleanup-old-tables.js --confirm --archive-to-s3 migration-archives

# 10. Generate final report
node generate-migration-report.js --output final-migration-report.html
```

---

## Error Recovery

### Common Issues and Solutions:

1. **Mapping Error: User not found in company**
   ```bash
   # Re-run mapping with auto-generation
   node create-user-company-mapping.js --auto-generate-companies --output mapping.json
   ```

2. **Duplicate Key Error**
   ```bash
   # Check for duplicates and merge
   node migrate-contractors.js --merge-duplicates --mapping mapping.json
   ```

3. **Network Timeout**
   ```bash
   # Reduce batch size and retry
   node migrate-expenses.js --batch-size 10 --resume-from-checkpoint
   ```

4. **Validation Failure**
   ```bash
   # Run detailed validation and fix issues
   node validate-migration.js --detailed --fix-issues
   ```

---

## Testing

### Unit Tests:
```bash
npm test
```

### Integration Tests:
```bash
npm run test:integration
```

### Load Testing:
```bash
npm run test:load
```

---

## Monitoring and Alerts

### CloudWatch Metrics:
- Migration progress percentage
- Error rate
- Items processed per second
- Failed item count

### Alarms:
- Error rate > 1%
- Migration stalled > 5 minutes
- Disk space < 10%
- Memory usage > 80%

---

## Support and Troubleshooting

### Log Files:
- `./logs/migration-[date].log` - Main migration log
- `./logs/errors-[date].log` - Error details
- `./logs/audit-[date].log` - Audit trail

### Debug Mode:
```bash
DEBUG=migration:* node migrate-expenses.js --verbose
```

### Contact:
- Migration Lead: [Contact]
- DevOps Team: [Contact]
- Emergency: [Contact]