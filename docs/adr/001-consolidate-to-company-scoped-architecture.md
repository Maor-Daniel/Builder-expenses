# ADR 001: Consolidate to Company-Scoped Database Architecture

## Status
Proposed

## Context

The construction expenses tracking system currently maintains **THREE parallel database architectures**, creating significant technical debt, operational complexity, and increased costs:

1. **Multi-Table Architecture** (Legacy)
   - Pattern: Separate DynamoDB tables per entity type with userId-based partitioning
   - 13 Lambda functions
   - 5 tables with minimal data (7 expenses, 1 contractor, 1 project, 1 work)
   - Estimated monthly cost: ~$5 for tables + Lambda invocations

2. **Company-Scoped Architecture** (Current)
   - Pattern: Single table per entity with companyId-based partitioning
   - 4 Lambda functions (consolidated CRUD operations)
   - 6 tables with growing data (37 expenses, 18 contractors, 23 projects, 12 works)
   - Better multi-tenancy support
   - Estimated monthly cost: ~$5 for tables + Lambda invocations

3. **Production Table Architecture** (Transitional)
   - Pattern: Appears to be a hybrid approach
   - 13 Lambda functions
   - Single consolidated table
   - Minimal data (4 items)

This fragmentation results in:
- **Triple maintenance burden**: Every feature must be implemented three times
- **Data inconsistency**: Same entities exist in multiple tables with different schemas
- **Increased costs**: Paying for 17 DynamoDB tables instead of 6-7
- **Developer confusion**: Unclear which architecture to use for new features
- **Deployment complexity**: Managing 30+ Lambda functions instead of ~10
- **API complexity**: Multiple API Gateway endpoints for same operations

### Cost Analysis
Current state (monthly):
- DynamoDB tables: 17 tables × ~$0.25/table = ~$4.25
- Lambda invocations: Minimal but duplicated
- Storage: ~350KB across all tables (minimal cost)
- **Total: ~$10-15/month** (with overhead and requests)

Target state (company-scoped only):
- DynamoDB tables: 10 tables × ~$0.25/table = ~$2.50
- Lambda invocations: Reduced by 70%
- Storage: Same ~350KB
- **Total: ~$5-7/month**
- **Savings: ~50% reduction**

## Decision

We will **consolidate all database operations to use the Company-Scoped Architecture** and deprecate both the Multi-Table and Production Table architectures.

The Company-Scoped Architecture will be the single source of truth for all data operations going forward.

## Rationale

### Why Company-Scoped is Better:

1. **Multi-Tenancy by Design**
   - CompanyId as partition key enables natural data isolation
   - Supports B2B SaaS model with multiple users per company
   - Simplified access control at company level
   - Better alignment with Paddle billing (company-level subscriptions)

2. **Operational Efficiency**
   - Single Lambda per entity type (4 functions vs 13)
   - Consolidated CRUD operations in one handler
   - Reduced cold starts and better performance
   - Easier monitoring and debugging

3. **Cost Efficiency**
   - 50% reduction in table count
   - 70% reduction in Lambda functions
   - Lower CloudWatch logs volume
   - Reduced API Gateway complexity

4. **Scalability**
   - Better partition key distribution (companyId vs userId)
   - Natural sharding boundary for future growth
   - Supports company-level features (teams, permissions, reports)
   - Ready for enterprise features

5. **Maintenance Simplicity**
   - Single codebase to maintain
   - Consistent patterns across all entities
   - Unified error handling and logging
   - Single deployment pipeline

### Why NOT Multi-Table:

1. **Poor Multi-Tenancy Support**
   - UserId-based partitioning doesn't support company structure
   - Complex to implement team features
   - Difficult to enforce company-level permissions

2. **Excessive Infrastructure**
   - 13 Lambda functions for 4 entity types
   - Separate function for each CRUD operation
   - Higher operational overhead

3. **Limited Business Model Alignment**
   - Doesn't match company-based billing model
   - Complex to implement company-wide features
   - Poor support for user management within companies

### Why NOT Production Table:

1. **Unclear Purpose**
   - Appears to be incomplete migration attempt
   - Hybrid of both approaches without clear benefits
   - Minimal data suggests it was never fully adopted

## Consequences

### Positive:
- **50% cost reduction** in infrastructure
- **70% reduction** in Lambda functions to maintain
- **Unified data model** across all operations
- **Improved developer experience** with single architecture
- **Better performance** with consolidated functions
- **Simplified monitoring** with fewer components
- **Ready for scale** with proper multi-tenancy

### Negative:
- **Migration effort** required (estimated 2-3 days)
- **Testing overhead** for migration validation
- **Temporary dual-write period** during migration
- **Risk of data loss** if migration not properly executed

### Neutral:
- Existing API contracts can be maintained
- Frontend changes minimal (endpoint updates only)
- Authentication/authorization model unchanged

## Migration Strategy

### Phase 1: Preparation (Day 1)
- Complete data inventory and validation
- Create migration scripts
- Set up monitoring and alerting
- Create rollback procedures

### Phase 2: Dual-Write Implementation (Day 1-2)
- Update Lambda functions to write to both architectures
- Validate data consistency
- Monitor for issues

### Phase 3: Read Migration (Day 2)
- Switch read operations to company-scoped architecture
- Validate all features working
- Performance testing

### Phase 4: Write Consolidation (Day 2-3)
- Remove dual-write logic
- Update all Lambda functions to use company-scoped only
- Final validation

### Phase 5: Cleanup (Day 3)
- Delete deprecated Lambda functions
- Delete empty multi-table DynamoDB tables
- Update documentation
- Archive old code

## Alternatives Considered

### 1. Migrate to Multi-Table Architecture
**Rejected because:**
- Poor multi-tenancy support
- Higher operational overhead
- Doesn't align with business model

### 2. Create New Single-Table Design
**Rejected because:**
- Company-scoped already provides good design
- Would require complete rewrite
- No significant benefits over company-scoped

### 3. Keep All Three Architectures
**Rejected because:**
- Triple maintenance burden
- Continued confusion
- Increasing technical debt
- Higher costs

## Implementation Notes

### Critical Success Factors:
1. **Zero data loss** during migration
2. **No production downtime**
3. **Maintain API compatibility**
4. **Complete rollback capability**

### Prerequisites:
- Full backup of all DynamoDB tables
- Comprehensive test suite
- Monitoring dashboard for migration
- Stakeholder communication plan

## Review and Approval

**Proposed by:** Architecture Review Team
**Date:** 2024-12-01
**Review Required by:**
- Development Team Lead
- DevOps Team
- Product Owner

**Approval Status:** [ ] Approved [ ] Rejected [ ] Needs Revision