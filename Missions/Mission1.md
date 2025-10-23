# Mission 1: Multi-Table Database Design for Ofek Construction App

## 📋 Mission Overview
Transform the current single-table DynamoDB design into a normalized multi-table architecture to improve data integrity, query performance, and maintainability.

## 🔍 Current State Analysis

### Single-Table Design Limitations
Our current implementation uses one DynamoDB table for all entities:

```
ExpensesTable:
├── Expenses (userId + expenseId)
├── Projects (userId + projectId) 
├── Contractors (userId + contractorId)
└── Works (userId + workId)
```

**Problems Identified:**
- **Complex Queries**: Need to scan/filter across different entity types
- **Data Integrity**: No foreign key constraints between related entities
- **Schema Flexibility**: Hard to add entity-specific attributes
- **Query Performance**: Limited GSI effectiveness across mixed data
- **Maintenance**: Complex filtering logic in application code

## 🎯 Multi-Table Design Solution

### Proposed Table Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   UsersTable    │    │ ProjectsTable   │    │ContractorsTable │
│                 │    │                 │    │                 │
│ PK: userId      │    │ PK: userId      │    │ PK: userId      │
│                 │    │ SK: projectId   │    │ SK: contractorId│
│ - email         │    │ - name          │    │ - name          │
│ - name          │    │ - startDate     │    │ - phone         │
│ - createdAt     │    │ - description   │    │ - createdAt     │
│ - updatedAt     │    │ - status        │    │ - updatedAt     │
└─────────────────┘    │ - SpentAmount   │    └─────────────────┘
                       │ - createdAt     │           │
                       │ - updatedAt     │           │
                       └─────────────────┘           │
                              │                      │
                              │                      │
                       ┌─────────────────────────────────────────┐
                       │              ExpensesTable              │
                       │                                         │
                       │ PK: userId                              │
                       │ SK: expenseId                           │
                       │                                         │
                       │ - projectId (FK → ProjectsTable)       │
                       │ - contractorId (FK → ContractorsTable) │
                       │ - invoiceNum                            │
                       │ - amount                                │
                       │ - paymentMethod                         │
                       │ - date                                  │
                       │ - description                           │
                       │ - receiptImage                          │
                       │ - contractorSignature                   │
                       │ - createdAt                             │
                       │ - updatedAt                             │
                       └─────────────────────────────────────────┘
                                        │
                                        │
                               ┌─────────────────┐
                               │   WorksTable    │
                               │                 │
                               │ PK: userId      │
                               │ SK: workId      │
                               │                 │
                               │ - expenseId (FK)│
                               │ - projectId (FK)│
                               │ - contractorId  │
                               │ - WorkName      │
                               │ - description   │
                               │ - TotalWorkCost │
                               │ - status        │
                               │ - createdAt     │
                               │ - updatedAt     │
                               └─────────────────┘
```

## 📊 Detailed Table Specifications

### 1. UsersTable
**Purpose**: Store user account information and metadata

```yaml
Table: construction-expenses-users
PrimaryKey: userId (String)
Attributes:
  - email: String
  - name: String
  - createdAt: String (ISO timestamp)
  - updatedAt: String (ISO timestamp)

GSI-1: email-index
  PK: email
  Purpose: Login by email lookup

Point-in-Time Recovery: Enabled
Billing Mode: PAY_PER_REQUEST
```

### 2. ProjectsTable
**Purpose**: Master data for construction projects

```yaml
Table: construction-expenses-projects
PrimaryKey: 
  - userId (String) - Hash Key
  - projectId (String) - Range Key

Attributes:
  - name: String
  - startDate: String (YYYY-MM-DD)
  - description: String (optional)
  - status: String
  - SpentAmount: Number
  - createdAt: String (ISO timestamp)
  - updatedAt: String (ISO timestamp)

GSI-1: status-date-index
  PK: userId
  SK: status#startDate
  Purpose: Query projects by status and date range

LSI-1: name-index
  PK: userId
  SK: name
  Purpose: Sort projects alphabetically

Point-in-Time Recovery: Enabled
Billing Mode: PAY_PER_REQUEST
```

### 3. ContractorsTable
**Purpose**: Master data for contractors and service providers

```yaml
Table: construction-expenses-contractors
PrimaryKey:
  - userId (String) - Hash Key  
  - contractorId (String) - Range Key

Attributes:
  - name: String
  - phone: String
  - createdAt: String (ISO timestamp)
  - updatedAt: String (ISO timestamp)

LSI-1: name-index
  PK: userId
  SK: name
  Purpose: Sort contractors alphabetically

Point-in-Time Recovery: Enabled
Billing Mode: PAY_PER_REQUEST
```

### 4. ExpensesTable (Updated)
**Purpose**: Financial transactions and expense records

```yaml
Table: construction-expenses-expenses
PrimaryKey:
  - userId (String) - Hash Key
  - expenseId (String) - Range Key

Attributes:
  - projectId: String (FK to ProjectsTable)
  - contractorId: String (FK to ContractorsTable)
  - invoiceNum: String
  - amount: Number
  - paymentMethod: String
  - date: String (YYYY-MM-DD)
  - description: String (optional)
  - receiptImage: Map (optional)
  - contractorSignature: Map (optional)
  - createdAt: String (ISO timestamp)
  - updatedAt: String (ISO timestamp)

GSI-1: project-date-index
  PK: userId#projectId
  SK: date
  Purpose: Query expenses by project and date

GSI-2: contractor-date-index
  PK: userId#contractorId
  SK: date
  Purpose: Query expenses by contractor and date

GSI-3: invoice-index
  PK: userId
  SK: invoiceNum
  Purpose: Unique invoice number validation

LSI-1: amount-index
  PK: userId
  SK: amount
  Purpose: Sort expenses by amount

Point-in-Time Recovery: Enabled
Billing Mode: PAY_PER_REQUEST
```

### 5. WorksTable (Updated)
**Purpose**: Track specific work items and labor records

```yaml
Table: construction-expenses-works
PrimaryKey:
  - userId (String) - Hash Key
  - workId (String) - Range Key

Attributes:
  - projectId: String (FK to ProjectsTable)
  - contractorId: String (FK to ContractorsTable)
  - expenseId: String (FK to ExpensesTable, optional)
  - WorkName: String
  - description: String
  - TotalWorkCost: Number
  - status: String
  - createdAt: String (ISO timestamp)
  - updatedAt: String (ISO timestamp)

GSI-1: project-status-index
  PK: userId#projectId
  SK: status#WorkName
  Purpose: Query work items by project and status

GSI-2: contractor-index
  PK: userId#contractorId
  SK: WorkName
  Purpose: Query work items by contractor

Point-in-Time Recovery: Enabled
Billing Mode: PAY_PER_REQUEST
```

## 🔗 Data Relationships and Integrity

### Foreign Key Relationships
```
Users (1) ←→ (∞) Projects
Users (1) ←→ (∞) Contractors  
Users (1) ←→ (∞) Expenses
Projects (1) ←→ (∞) Expenses
Contractors (1) ←→ (∞) Expenses
Projects (1) ←→ (∞) Works
Contractors (1) ←→ (∞) Works
Expenses (1) ←→ (∞) Works (optional)
```

### Data Consistency Rules
1. **Referential Integrity**: Application-level checks for FK validity
2. **Cascade Deletes**: Define behavior when parent records are deleted
3. **Unique Constraints**: Enforce unique invoice numbers per user
4. **Status Validation**: Ensure valid status transitions

## 📈 Query Patterns and Performance

### Common Query Patterns

1. **Get all expenses for a project**
   ```
   GSI-1: project-date-index
   PK: userId#projectId
   Filter by date range if needed
   ```

2. **Find expenses by contractor**
   ```
   GSI-2: contractor-date-index  
   PK: userId#contractorId
   Sort by date
   ```

3. **Validate unique invoice number**
   ```
   GSI-3: invoice-index
   PK: userId
   SK: invoiceNum
   ```

4. **Get works for a project**
   ```
   GSI-1: project-status-index
   PK: userId#projectId
   ```

5. **Project dashboard with all related data**
   ```
   Batch operations:
   1. Get project details (including SpentAmount)
   2. Get project expenses 
   3. Get project works (with TotalWorkCost)
   4. Get contractor details for each expense
   ```

## 🚀 Migration Strategy

### Phase 1: Preparation (Week 1)
1. **Create new table schemas** in CloudFormation
2. **Deploy parallel infrastructure** (new tables alongside existing)
3. **Update Lambda layer** with new data access patterns
4. **Create migration scripts** for data transfer

### Phase 2: Data Migration (Week 2)
1. **Export existing data** from single table
2. **Transform and clean data** according to new schema
3. **Load data into new tables** with proper relationships
4. **Validate data integrity** and referential constraints
5. **Run parallel operations** (write to both old and new)

### Phase 3: Application Update (Week 3)
1. **Update Lambda functions** to use new table structure
2. **Implement new query patterns** with improved performance
3. **Add data validation** for foreign key relationships
4. **Update error handling** for multi-table operations
5. **Deploy and test** in staging environment

### Phase 4: Cutover (Week 4)
1. **Production deployment** with new table structure
2. **Monitor performance** and error rates
3. **Disable old table access** after validation
4. **Clean up old resources** after successful migration

## 💻 Implementation Steps

### Step 1: CloudFormation Updates

Create new CloudFormation template `multi-table-infrastructure.yaml`:

```yaml
# Add 5 new DynamoDB tables
# Update IAM permissions
# Modify Lambda environment variables
# Add new GSIs and LSIs
```

### Step 2: Lambda Layer Updates

Create new shared utilities:
- Multi-table data access layer
- Relationship validation functions  
- Batch operation helpers
- Error handling improvements

### Step 3: Function Refactoring

Update each Lambda function:
- Change database queries to use specific tables
- Add foreign key validation
- Implement batch operations for related data
- Improve error messages and logging

### Step 4: Testing Strategy

Comprehensive testing approach:
- Unit tests for new data access patterns
- Integration tests for cross-table operations
- Performance tests comparing old vs new
- Data consistency validation tests

## 📊 Benefits of Multi-Table Design

### Performance Improvements
- **Faster queries**: Table-specific indexes
- **Reduced data transfer**: Query only needed attributes
- **Better caching**: Smaller, focused datasets
- **Parallel operations**: Independent table access

### Maintainability Benefits
- **Clear data relationships**: Explicit foreign keys
- **Schema flexibility**: Easy to add table-specific fields
- **Easier debugging**: Focused query patterns
- **Better documentation**: Clear entity boundaries

### Scalability Advantages
- **Independent scaling**: Each table scales based on usage
- **Targeted optimization**: Index and optimize per use case
- **Reduced hot partitions**: Better key distribution
- **Future-proof**: Easy to add new entity types

## ⚠️ Considerations and Risks

### Complexity Trade-offs
- **More tables to manage**: Increased operational overhead
- **Cross-table queries**: May require multiple operations
- **Data consistency**: Application-level referential integrity
- **Migration complexity**: Careful planning required

### Cost Implications
- **More DynamoDB tables**: Slightly higher base costs
- **Additional GSIs**: More read/write capacity units
- **Migration costs**: Temporary dual-write overhead
- **Monitoring costs**: More CloudWatch metrics

### Mitigation Strategies
- **Gradual migration**: Phase-by-phase implementation
- **Comprehensive testing**: Validate all scenarios
- **Rollback plan**: Quick revert if issues arise
- **Performance monitoring**: Track query performance

## ✅ Success Criteria

### Performance Metrics
- Query response time < 100ms for single-table operations
- Batch operations complete within 2 seconds
- 99.9% availability during migration
- Zero data loss during transition

### Functional Requirements
- All existing features work identically
- New query capabilities enabled
- Data integrity maintained
- Foreign key relationships enforced

### Quality Gates
- 100% test coverage for new data access layer
- Performance tests pass for all query patterns
- Security review completed
- Documentation updated

## 🎯 Next Steps

1. **Review and approve** this multi-table design
2. **Create detailed CloudFormation** templates
3. **Develop migration scripts** and testing strategy
4. **Set up staging environment** for validation
5. **Begin Phase 1 implementation**

This mission will transform our database from a basic single-table design to a robust, scalable multi-table architecture that supports complex queries, maintains data integrity, and provides a foundation for future growth.

---
**Mission Status**: Ready for Implementation  
**Estimated Timeline**: 4 weeks  
**Risk Level**: Medium (with proper planning and testing)  
**Business Impact**: High (improved performance and maintainability)