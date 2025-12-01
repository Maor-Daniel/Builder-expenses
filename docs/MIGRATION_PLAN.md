# Database Architecture Migration Plan
## From Multi-Table to Company-Scoped Architecture

### Executive Summary
This document outlines the complete migration strategy to consolidate three parallel database architectures into a single, company-scoped architecture. The migration will eliminate technical debt, reduce costs by 50%, and improve system maintainability.

---

## 1. Current State Assessment

### Database Inventory

#### Multi-Table Architecture (To be deprecated)
| Table Name | Item Count | Size (bytes) | Status |
|------------|------------|--------------|--------|
| construction-expenses-multi-table-expenses | 7 | 282,189 | Active - Contains legacy data |
| construction-expenses-multi-table-contractors | 1 | 140 | Minimal data |
| construction-expenses-multi-table-projects | 1 | 188 | Minimal data |
| construction-expenses-multi-table-works | 1 | 259 | Minimal data |
| construction-expenses-multi-table-users | 0 | 0 | Empty |

#### Company-Scoped Architecture (Target - To be retained)
| Table Name | Item Count | Size (bytes) | Status |
|------------|------------|--------------|--------|
| construction-expenses-company-expenses | 37 | 14,152 | Active - Primary |
| construction-expenses-company-contractors | 18 | 5,581 | Active - Primary |
| construction-expenses-company-projects | 23 | 6,938 | Active - Primary |
| construction-expenses-company-works | 12 | 4,443 | Active - Primary |
| construction-expenses-company-users | 6 | 1,076 | Active - Primary |
| construction-expenses-companies | 5 | 1,889 | Active - Primary |

#### Supporting Tables (To be retained)
| Table Name | Item Count | Size (bytes) | Purpose |
|------------|------------|--------------|---------|
| construction-expenses-invitations | 5 | 2,118 | User invitations |
| construction-expenses-paddle-subscriptions | 3 | 1,009 | Billing |
| construction-expenses-paddle-customers | 0 | 0 | Billing |
| construction-expenses-paddle-payments | 4 | 891 | Billing |
| construction-expenses-paddle-webhooks | 15 | 40,746 | Billing webhooks |

#### Production Table (To be deprecated)
| Table Name | Item Count | Size (bytes) | Status |
|------------|------------|--------------|--------|
| construction-expenses-production-table | 4 | 782 | Unclear purpose - Deprecate |

### Lambda Function Inventory

#### Multi-Table Functions (13 functions - To be deprecated)
- construction-expenses-multi-table-add-contractor
- construction-expenses-multi-table-add-expense
- construction-expenses-multi-table-add-project
- construction-expenses-multi-table-add-work
- construction-expenses-multi-table-delete-contractor
- construction-expenses-multi-table-delete-expense
- construction-expenses-multi-table-delete-project
- construction-expenses-multi-table-delete-work
- construction-expenses-multi-table-get-contractors
- construction-expenses-multi-table-get-expenses
- construction-expenses-multi-table-get-projects
- construction-expenses-multi-table-get-works
- construction-expenses-multi-table-subscription-manager

#### Company-Scoped Functions (4 functions - To be retained)
- construction-expenses-company-contractors (Consolidated CRUD)
- construction-expenses-company-expenses (Consolidated CRUD)
- construction-expenses-company-projects (Consolidated CRUD)
- construction-expenses-company-works (Consolidated CRUD)

#### Production Functions (13 functions - To be deprecated)
- construction-expenses-production-add-contractor
- construction-expenses-production-add-expense
- construction-expenses-production-add-project
- construction-expenses-production-add-work
- construction-expenses-production-delete-contractor
- construction-expenses-production-delete-expense
- construction-expenses-production-delete-project
- construction-expenses-production-delete-work
- construction-expenses-production-get-contractors
- construction-expenses-production-get-expenses
- construction-expenses-production-get-projects
- construction-expenses-production-get-works
- construction-expenses-production-update-expense

#### Supporting Functions (To be retained)
- Authentication & Authorization (3)
- User Management (8)
- Billing & Subscriptions (6)
- File Uploads (2)

### Cost Analysis

#### Current State (Monthly)
- **DynamoDB Tables:** 17 tables × $0.25 = $4.25
- **Lambda Functions:** 30+ functions × minimal invocations = ~$2
- **CloudWatch Logs:** 30+ log groups × $0.50 = ~$15
- **API Gateway:** Multiple APIs = ~$3.50
- **Total:** ~$25/month

#### Target State (Monthly)
- **DynamoDB Tables:** 10 tables × $0.25 = $2.50
- **Lambda Functions:** 10 functions × minimal invocations = ~$0.70
- **CloudWatch Logs:** 10 log groups × $0.50 = ~$5
- **API Gateway:** Single API = ~$3.50
- **Total:** ~$12/month
- **Savings:** ~52% reduction ($13/month)

---

## 2. Target State Architecture

### Final Database Structure

#### Primary Tables (Company-Scoped)
```
construction-expenses-company-expenses
  ├── Partition Key: companyId (String)
  ├── Sort Key: expenseId (String)
  └── GSI: invoiceNum-index

construction-expenses-company-projects
  ├── Partition Key: companyId (String)
  └── Sort Key: projectId (String)

construction-expenses-company-contractors
  ├── Partition Key: companyId (String)
  └── Sort Key: contractorId (String)

construction-expenses-company-works
  ├── Partition Key: companyId (String)
  └── Sort Key: workId (String)

construction-expenses-company-users
  ├── Partition Key: companyId (String)
  └── Sort Key: userId (String)

construction-expenses-companies
  ├── Partition Key: companyId (String)
  └── Attributes: name, settings, subscription, etc.
```

### Access Patterns
1. **Company-Level Queries:** All queries scoped by companyId
2. **User Access:** Users access data through company membership
3. **Cross-Entity Relationships:** Maintained through IDs
4. **Multi-Tenancy:** Natural isolation by companyId partition

### Security Model
- JWT tokens contain both userId and companyId
- All operations validate company membership
- Row-level security through companyId filtering
- No cross-company data access possible

---

## 3. Migration Phases

### Phase 1: Preparation and Analysis (Day 1, Morning)

#### Tasks:
1. **Create full backup of all tables**
   ```bash
   aws dynamodb create-backup --table-name [TABLE_NAME] --backup-name pre-migration-[DATE]
   ```

2. **Set up migration monitoring dashboard**
   - CloudWatch dashboard for migration metrics
   - Alarms for error rates
   - Data consistency checks

3. **Create data mapping document**
   - userId to companyId mapping strategy
   - Schema transformation rules
   - Default values for missing fields

4. **Deploy feature flags**
   ```javascript
   const MIGRATION_FLAGS = {
     DUAL_WRITE_ENABLED: false,
     READ_FROM_COMPANY_SCOPED: false,
     MULTI_TABLE_DEPRECATED: false
   };
   ```

#### Deliverables:
- [ ] All tables backed up
- [ ] Monitoring dashboard live
- [ ] Mapping document completed
- [ ] Feature flags deployed

### Phase 2: Data Migration Scripts (Day 1, Afternoon)

#### Script Development:
1. **analyze-data-volume.js** - Verify current data state
2. **create-user-company-mapping.js** - Map userIds to companyIds
3. **migrate-expenses.js** - Migrate expense records
4. **migrate-projects.js** - Migrate project records
5. **migrate-contractors.js** - Migrate contractor records
6. **migrate-works.js** - Migrate work records
7. **validate-migration.js** - Compare source and target data

#### Migration Logic:
```javascript
// Example: Expense migration
async function migrateExpense(item) {
  // Map userId to companyId
  const companyId = await getCompanyIdForUser(item.userId);

  // Transform schema
  const companyExpense = {
    companyId: companyId,
    expenseId: item.expenseId,
    amount: item.amount,
    description: item.description,
    date: item.date,
    projectId: item.projectId,
    contractorId: item.contractorId,
    // Add new required fields
    createdBy: item.userId,
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  return companyExpense;
}
```

#### Testing:
- Run scripts in dry-run mode
- Validate data transformation
- Check for data loss
- Verify relationships maintained

### Phase 3: Dual-Write Period (Day 2, Morning)

#### Implementation:
1. **Update Lambda functions for dual-write**
   ```javascript
   // In each Lambda function
   if (MIGRATION_FLAGS.DUAL_WRITE_ENABLED) {
     await Promise.all([
       writeToMultiTable(data),
       writeToCompanyScoped(data)
     ]);
   }
   ```

2. **Deploy updated functions**
   - Start with read-heavy functions
   - Monitor error rates
   - Gradual rollout

3. **Validation checks**
   - Compare write counts
   - Verify data consistency
   - Check for failures

#### Monitoring:
- Track dual-write success rate
- Monitor latency impact
- Alert on consistency issues

### Phase 4: Read Migration (Day 2, Afternoon)

#### Steps:
1. **Switch read operations to company-scoped**
   ```javascript
   if (MIGRATION_FLAGS.READ_FROM_COMPANY_SCOPED) {
     return readFromCompanyScoped(companyId, entityId);
   } else {
     return readFromMultiTable(userId, entityId);
   }
   ```

2. **Gradual rollout**
   - 10% traffic initially
   - Monitor error rates
   - Increase to 50%, then 100%

3. **Performance validation**
   - Compare response times
   - Check query efficiency
   - Validate data completeness

#### Rollback trigger points:
- Error rate > 1%
- Response time increase > 20%
- Data inconsistency detected

### Phase 5: Cleanup and Deprecation (Day 3)

#### Tasks:
1. **Remove dual-write logic**
   - Update all Lambda functions
   - Remove multi-table references
   - Clean up unused code

2. **Delete deprecated resources**
   ```bash
   # Delete Lambda functions
   aws lambda delete-function --function-name [FUNCTION_NAME]

   # Archive and delete tables (after final backup)
   aws dynamodb create-backup --table-name [TABLE_NAME] --backup-name final-[DATE]
   aws dynamodb delete-table --table-name [TABLE_NAME]
   ```

3. **Update infrastructure**
   - Remove unused API Gateway resources
   - Delete CloudWatch log groups
   - Update IAM policies

4. **Documentation updates**
   - Update API documentation
   - Update deployment guides
   - Archive migration artifacts

---

## 4. Risk Assessment and Mitigation

### Critical Risks

#### Risk 1: Data Loss During Migration
- **Probability:** Low
- **Impact:** Critical
- **Mitigation:**
  - Complete backups before migration
  - Dual-write period ensures no data loss
  - Validation scripts run continuously
  - Point-in-time recovery enabled

#### Risk 2: Production Downtime
- **Probability:** Very Low
- **Impact:** High
- **Mitigation:**
  - Zero-downtime migration strategy
  - Feature flags for instant rollback
  - Gradual traffic shifting
  - Health checks at each phase

#### Risk 3: Performance Degradation
- **Probability:** Low
- **Impact:** Medium
- **Mitigation:**
  - Load testing before migration
  - Monitoring dashboard for metrics
  - Gradual rollout with monitoring
  - Capacity planning completed

#### Risk 4: Incomplete Migration
- **Probability:** Medium
- **Impact:** Medium
- **Mitigation:**
  - Comprehensive inventory completed
  - Automated validation scripts
  - Checklist-driven process
  - Post-migration audit planned

### Rollback Strategy

#### Phase-Specific Rollback:

**Phase 1-2:** No production impact, safe to restart

**Phase 3 (Dual-Write):**
```javascript
// Disable dual-write immediately
MIGRATION_FLAGS.DUAL_WRITE_ENABLED = false;
// Continue with multi-table only
```

**Phase 4 (Read Migration):**
```javascript
// Switch back to multi-table reads
MIGRATION_FLAGS.READ_FROM_COMPANY_SCOPED = false;
// Investigate issues before retry
```

**Phase 5 (Cleanup):**
- Do not delete resources until validation complete
- Keep backups for 30 days
- Maintain ability to restore

---

## 5. Data Migration Strategy

### UserId to CompanyId Mapping

#### Strategy:
1. Check construction-expenses-company-users table
2. Query construction-expenses-companies for user membership
3. Create new company if orphaned user found
4. Log all mappings for audit

### Schema Transformations

#### Expense Records:
```javascript
// Multi-Table Schema
{
  userId: "user123",
  expenseId: "exp456",
  amount: 1500,
  description: "Materials",
  date: "2024-01-15"
}

// Company-Scoped Schema
{
  companyId: "comp789",
  expenseId: "exp456",
  amount: 1500,
  description: "Materials",
  date: "2024-01-15",
  createdBy: "user123",  // Preserve original user
  createdAt: "2024-01-15T10:00:00Z",
  updatedAt: "2024-12-01T10:00:00Z"
}
```

### Data Validation Approach

#### Validation Checks:
1. **Record count validation**
   - Source count must equal target count
   - Check for duplicates

2. **Field validation**
   - All required fields present
   - Data types correct
   - Relationships maintained

3. **Business logic validation**
   - Amounts sum correctly
   - Date ranges preserved
   - Status fields valid

### Migration Script Framework

```javascript
// Base migration framework
class DataMigrator {
  constructor(sourceTable, targetTable) {
    this.sourceTable = sourceTable;
    this.targetTable = targetTable;
    this.errors = [];
    this.succeeded = 0;
    this.failed = 0;
  }

  async migrate() {
    const items = await this.scanSourceTable();

    for (const item of items) {
      try {
        const transformed = await this.transform(item);
        await this.writeToTarget(transformed);
        this.succeeded++;
      } catch (error) {
        this.errors.push({ item, error });
        this.failed++;
      }
    }

    return this.generateReport();
  }

  async validate() {
    // Post-migration validation
    const sourceCount = await this.getSourceCount();
    const targetCount = await this.getTargetCount();

    return {
      valid: sourceCount === targetCount,
      sourceCount,
      targetCount,
      errors: this.errors
    };
  }
}
```

---

## 6. Lambda Function Migration

### Functions to Update (Priority Order)

#### High Priority (Core Business Logic):
1. **Expense Management**
   - From: 4 multi-table functions
   - To: 1 company-scoped function
   - Endpoint: /company/expenses

2. **Project Management**
   - From: 4 multi-table functions
   - To: 1 company-scoped function
   - Endpoint: /company/projects

3. **Contractor Management**
   - From: 4 multi-table functions
   - To: 1 company-scoped function
   - Endpoint: /company/contractors

4. **Work Management**
   - From: 4 multi-table functions
   - To: 1 company-scoped function
   - Endpoint: /company/works

### API Gateway Updates

#### Current Endpoints (To be deprecated):
```
/expenses (GET, POST) -> multi-table-get/add-expenses
/expenses/{id} (DELETE, PUT) -> multi-table-delete/update-expense
/projects (GET, POST) -> multi-table-get/add-projects
/projects/{id} (DELETE) -> multi-table-delete-project
/contractors (GET, POST) -> multi-table-get/add-contractors
/contractors/{id} (DELETE) -> multi-table-delete-contractor
/works (GET, POST) -> multi-table-get/add-works
/works/{id} (DELETE) -> multi-table-delete-work
```

#### Target Endpoints (Company-scoped):
```
/company/expenses (GET, POST, PUT, DELETE) -> company-expenses
/company/projects (GET, POST, PUT, DELETE) -> company-projects
/company/contractors (GET, POST, PUT, DELETE) -> company-contractors
/company/works (GET, POST, PUT, DELETE) -> company-works
```

### Deployment Sequence

1. **Deploy updated Lambda functions with feature flags**
2. **Update API Gateway with new routes**
3. **Test new endpoints thoroughly**
4. **Update frontend to use new endpoints**
5. **Monitor old endpoint usage**
6. **Deprecate old endpoints after validation**

---

## 7. Rollback Plan

### Decision Criteria for Rollback

Initiate rollback if:
- Data corruption detected
- Error rate exceeds 1%
- Performance degradation > 20%
- Critical business function fails

### Rollback Procedures

#### Immediate Actions:
1. **Disable feature flags**
   ```javascript
   MIGRATION_FLAGS.DUAL_WRITE_ENABLED = false;
   MIGRATION_FLAGS.READ_FROM_COMPANY_SCOPED = false;
   ```

2. **Revert Lambda functions**
   ```bash
   aws lambda update-function-code \
     --function-name [FUNCTION_NAME] \
     --s3-bucket [BACKUP_BUCKET] \
     --s3-key [PREVIOUS_VERSION]
   ```

3. **Restore API Gateway**
   ```bash
   aws apigateway put-rest-api \
     --rest-api-id [API_ID] \
     --body file://backup-api-definition.json
   ```

#### Data Restoration:
1. **If data corrupted in company-scoped tables:**
   ```bash
   aws dynamodb restore-table-from-backup \
     --target-table-name [TABLE_NAME] \
     --backup-arn [BACKUP_ARN]
   ```

2. **Re-sync from multi-table if needed**
   - Run migration scripts in reverse
   - Validate data integrity
   - Resume normal operations

### Post-Rollback Actions:
1. Incident report creation
2. Root cause analysis
3. Update migration plan
4. Schedule retry with fixes

---

## 8. Timeline and Milestones

### Day 1: Preparation and Script Development
- **09:00-10:00:** Create backups and monitoring
- **10:00-12:00:** Develop migration scripts
- **13:00-15:00:** Test migration scripts
- **15:00-16:00:** Deploy feature flags
- **16:00-17:00:** Final preparation checklist

**Milestone:** All scripts tested, backups complete, ready for migration

### Day 2: Migration Execution
- **09:00-10:00:** Enable dual-write mode
- **10:00-12:00:** Monitor dual-write, fix issues
- **13:00-14:00:** Migrate historical data
- **14:00-15:00:** Enable read from company-scoped (10%)
- **15:00-16:00:** Increase to 50% traffic
- **16:00-17:00:** Full traffic migration

**Milestone:** All traffic on company-scoped architecture

### Day 3: Cleanup and Validation
- **09:00-10:00:** Final validation checks
- **10:00-11:00:** Remove dual-write logic
- **11:00-12:00:** Delete deprecated Lambda functions
- **13:00-14:00:** Archive and delete old tables
- **14:00-15:00:** Update documentation
- **15:00-16:00:** Post-migration audit
- **16:00-17:00:** Stakeholder communication

**Milestone:** Migration complete, old architecture removed

### Go/No-Go Criteria

#### Before Phase 3 (Dual-Write):
- [ ] All backups verified
- [ ] Migration scripts tested
- [ ] Monitoring dashboard operational
- [ ] Rollback plan documented
- **Decision:** ___________

#### Before Phase 4 (Read Migration):
- [ ] Dual-write success rate > 99.9%
- [ ] No data inconsistencies detected
- [ ] Performance metrics acceptable
- [ ] Team ready for migration
- **Decision:** ___________

#### Before Phase 5 (Cleanup):
- [ ] All traffic on new architecture for 24 hours
- [ ] Zero errors in past 12 hours
- [ ] All features validated
- [ ] Stakeholder approval received
- **Decision:** ___________

---

## 9. Success Criteria

### Technical Metrics
- ✅ **Zero data loss** - All records migrated successfully
- ✅ **99.99% uptime** maintained during migration
- ✅ **Response time** equal or better than baseline
- ✅ **Error rate** < 0.01%
- ✅ **All tests passing** - Unit, integration, and E2E

### Business Metrics
- ✅ **No user-reported issues** during migration
- ✅ **All features functional** post-migration
- ✅ **Cost reduction achieved** - 50% infrastructure cost reduction
- ✅ **Improved maintainability** - Single codebase

### Operational Metrics
- ✅ **26 Lambda functions removed** (from 30 to 4 for core entities)
- ✅ **7 DynamoDB tables removed** (from 17 to 10)
- ✅ **Monitoring simplified** - Single dashboard for all operations
- ✅ **Deployment time reduced** by 70%

### Data Validation Criteria
```javascript
// Validation checks
const validationResults = {
  recordCounts: {
    expenses: { source: 7, target: 7, match: true },
    projects: { source: 1, target: 1, match: true },
    contractors: { source: 1, target: 1, match: true },
    works: { source: 1, target: 1, match: true }
  },
  dataIntegrity: {
    checksum: true,
    relationships: true,
    requiredFields: true
  },
  performance: {
    avgResponseTime: "45ms", // Target: < 100ms
    p99ResponseTime: "120ms", // Target: < 500ms
    errorRate: "0.00%"  // Target: < 0.01%
  }
};
```

---

## 10. Post-Migration Tasks

### Documentation Updates
1. Update API documentation with new endpoints
2. Update infrastructure diagrams
3. Create migration retrospective document
4. Update runbooks and operational procedures

### Monitoring Setup
1. Create unified CloudWatch dashboard
2. Set up alerts for company-scoped architecture
3. Remove old metric filters and alarms
4. Document new monitoring procedures

### Knowledge Transfer
1. Team training on new architecture
2. Update onboarding documentation
3. Create troubleshooting guide
4. Document lessons learned

### Future Improvements
1. Consider single-table design for further optimization
2. Implement caching layer for frequently accessed data
3. Add data analytics pipeline
4. Implement automated backup strategy

---

## Appendix A: Command Reference

### Backup Commands
```bash
# Create backup
aws dynamodb create-backup \
  --table-name construction-expenses-multi-table-expenses \
  --backup-name pre-migration-2024-12-01 \
  --region us-east-1

# List backups
aws dynamodb list-backups \
  --table-name construction-expenses-multi-table-expenses \
  --region us-east-1

# Restore from backup
aws dynamodb restore-table-from-backup \
  --target-table-name restored-expenses \
  --backup-arn arn:aws:dynamodb:... \
  --region us-east-1
```

### Lambda Commands
```bash
# Update function code
aws lambda update-function-code \
  --function-name construction-expenses-company-expenses \
  --zip-file fileb://function.zip \
  --region us-east-1

# Update environment variables
aws lambda update-function-configuration \
  --function-name construction-expenses-company-expenses \
  --environment Variables={DUAL_WRITE=true} \
  --region us-east-1

# Delete function
aws lambda delete-function \
  --function-name construction-expenses-multi-table-add-expense \
  --region us-east-1
```

### DynamoDB Commands
```bash
# Scan table
aws dynamodb scan \
  --table-name construction-expenses-multi-table-expenses \
  --region us-east-1 \
  --output json > expenses-backup.json

# Delete table
aws dynamodb delete-table \
  --table-name construction-expenses-multi-table-expenses \
  --region us-east-1
```

---

## Appendix B: Contact Information

### Migration Team
- **Migration Lead:** [Name]
- **DevOps Lead:** [Name]
- **QA Lead:** [Name]
- **Product Owner:** [Name]

### Escalation Path
1. Technical Issues: Migration Lead
2. Business Impact: Product Owner
3. Critical Decisions: CTO

### Communication Channels
- **Slack Channel:** #database-migration
- **Status Page:** status.construction-expenses.com
- **War Room:** Conference Room A / Zoom Link

---

## Sign-off Checklist

### Pre-Migration Approval
- [ ] CTO Approval
- [ ] Product Owner Approval
- [ ] DevOps Team Ready
- [ ] QA Team Ready
- **Date:** ___________

### Post-Migration Validation
- [ ] Migration Complete
- [ ] Success Criteria Met
- [ ] Documentation Updated
- [ ] Team Trained
- **Date:** ___________

### Final Sign-off
- [ ] 7-Day Stability Confirmed
- [ ] Cleanup Completed
- [ ] Lessons Learned Documented
- [ ] Project Closed
- **Date:** ___________