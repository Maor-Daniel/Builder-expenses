# Lambda Function Inventory
## Database Architecture Analysis

### Summary Statistics
- **Total Lambda Functions:** 47
- **Multi-Table Functions:** 13 (to be deprecated)
- **Company-Scoped Functions:** 4 (to be retained)
- **Production Functions:** 13 (to be deprecated)
- **Supporting Functions:** 17 (to be retained)

---

## Multi-Table Architecture Functions (TO BE DEPRECATED)

| Function Name | Table(s) Used | Purpose | Migration Priority | Migration Effort |
|---------------|---------------|---------|-------------------|------------------|
| construction-expenses-multi-table-add-expense | multi-table-expenses | Create new expense | **HIGH** | Medium - Data mapping required |
| construction-expenses-multi-table-get-expenses | multi-table-expenses | Query expenses with filtering | **HIGH** | Medium - Query pattern change |
| construction-expenses-multi-table-delete-expense | multi-table-expenses | Delete expense by ID | **HIGH** | Low - Simple migration |
| construction-expenses-multi-table-add-project | multi-table-projects | Create new project | **HIGH** | Medium - Data mapping required |
| construction-expenses-multi-table-get-projects | multi-table-projects | Query all projects | **HIGH** | Medium - Query pattern change |
| construction-expenses-multi-table-delete-project | multi-table-projects | Delete project by ID | **HIGH** | Low - Simple migration |
| construction-expenses-multi-table-add-contractor | multi-table-contractors | Create new contractor | **MEDIUM** | Medium - Data mapping required |
| construction-expenses-multi-table-get-contractors | multi-table-contractors | Query all contractors | **MEDIUM** | Medium - Query pattern change |
| construction-expenses-multi-table-delete-contractor | multi-table-contractors | Delete contractor by ID | **MEDIUM** | Low - Simple migration |
| construction-expenses-multi-table-add-work | multi-table-works | Create new work entry | **MEDIUM** | Medium - Data mapping required |
| construction-expenses-multi-table-get-works | multi-table-works | Query all works | **MEDIUM** | Medium - Query pattern change |
| construction-expenses-multi-table-delete-work | multi-table-works | Delete work by ID | **MEDIUM** | Low - Simple migration |
| construction-expenses-multi-table-subscription-manager | multi-table-users | Manage user subscriptions | **LOW** | High - Complex refactor |

**Total Tables Used:** 5 (expenses, projects, contractors, works, users)
**Deployment Package:** Uses shared `multi-table-utils.js`

---

## Company-Scoped Architecture Functions (TO BE RETAINED & ENHANCED)

| Function Name | Table(s) Used | Purpose | Status | Enhancement Needed |
|---------------|---------------|---------|--------|-------------------|
| construction-expenses-company-expenses | company-expenses | Full CRUD for expenses | **ACTIVE** | Add migration logic for dual-write |
| construction-expenses-company-projects | company-projects | Full CRUD for projects | **ACTIVE** | Add migration logic for dual-write |
| construction-expenses-company-contractors | company-contractors | Full CRUD for contractors | **ACTIVE** | Add migration logic for dual-write |
| construction-expenses-company-works | company-works | Full CRUD for works | **ACTIVE** | Add migration logic for dual-write |

**Key Features:**
- ✅ Consolidated CRUD operations in single function
- ✅ Company-level data isolation
- ✅ JWT token validation with Clerk
- ✅ Proper error handling and logging
- ✅ Uses shared `company-utils.js`

---

## Production Architecture Functions (TO BE DEPRECATED)

| Function Name | Purpose | Status | Notes |
|---------------|---------|--------|-------|
| construction-expenses-production-add-expense | Create expense | **UNCLEAR** | Appears unused, minimal data |
| construction-expenses-production-get-expenses | Query expenses | **UNCLEAR** | Only 4 items in production table |
| construction-expenses-production-update-expense | Update expense | **UNCLEAR** | Single update function |
| construction-expenses-production-delete-expense | Delete expense | **UNCLEAR** | Redundant with multi-table |
| construction-expenses-production-add-project | Create project | **UNCLEAR** | Duplicate functionality |
| construction-expenses-production-get-projects | Query projects | **UNCLEAR** | Duplicate functionality |
| construction-expenses-production-delete-project | Delete project | **UNCLEAR** | Duplicate functionality |
| construction-expenses-production-add-contractor | Create contractor | **UNCLEAR** | Duplicate functionality |
| construction-expenses-production-get-contractors | Query contractors | **UNCLEAR** | Duplicate functionality |
| construction-expenses-production-delete-contractor | Delete contractor | **UNCLEAR** | Duplicate functionality |
| construction-expenses-production-add-work | Create work | **UNCLEAR** | Duplicate functionality |
| construction-expenses-production-get-works | Query works | **UNCLEAR** | Duplicate functionality |
| construction-expenses-production-delete-work | Delete work | **UNCLEAR** | Duplicate functionality |

**Assessment:** These appear to be an incomplete migration attempt. With only 4 items in the production table, these can be safely deprecated.

---

## Supporting Functions (TO BE RETAINED)

### Authentication & Authorization
| Function Name | Purpose | Dependencies | Status |
|---------------|---------|--------------|--------|
| construction-expenses-clerk-authorizer | Validate JWT tokens | Clerk API | **ACTIVE** |
| construction-expenses-webhook-clerk | Handle Clerk webhooks | Clerk | **ACTIVE** |
| construction-expenses-register-company-clerk | Register new company | Companies table | **ACTIVE** |

### User Management
| Function Name | Purpose | Dependencies | Status |
|---------------|---------|--------------|--------|
| construction-expenses-invite-user | Send user invitation | Invitations table | **ACTIVE** |
| construction-expenses-accept-invitation | Accept invitation | Invitations, Users tables | **ACTIVE** |
| construction-expenses-cancel-invitation | Cancel invitation | Invitations table | **ACTIVE** |
| construction-expenses-resend-invitation | Resend invitation | Invitations table | **ACTIVE** |
| construction-expenses-list-invitations | List all invitations | Invitations table | **ACTIVE** |
| construction-expenses-list-users | List company users | Users table | **ACTIVE** |
| construction-expenses-update-user | Update user details | Users table | **ACTIVE** |
| construction-expenses-remove-user | Remove user from company | Users table | **ACTIVE** |

### Company Management
| Function Name | Purpose | Dependencies | Status |
|---------------|---------|--------------|--------|
| construction-expenses-register-company | Register new company | Companies table | **ACTIVE** |
| construction-expenses-get-company | Get company details | Companies table | **ACTIVE** |
| construction-expenses-update-company | Update company info | Companies table | **ACTIVE** |

### Billing & Subscriptions
| Function Name | Purpose | Dependencies | Status |
|---------------|---------|--------------|--------|
| construction-expenses-paddle-webhook | Handle Paddle webhooks | Paddle tables | **ACTIVE** |
| construction-expenses-webhook-paddle | Duplicate webhook handler | Paddle tables | **REVIEW** |
| construction-expenses-create-paddle-checkout | Create checkout session | Paddle API | **ACTIVE** |
| construction-expenses-update-paddle-subscription | Update subscription | Paddle tables | **ACTIVE** |
| construction-expenses-subscription-manager | Manage subscriptions | Subscriptions table | **ACTIVE** |

### File Management
| Function Name | Purpose | Dependencies | Status |
|---------------|---------|--------------|--------|
| construction-expenses-upload-receipt | Upload expense receipts | S3 bucket | **ACTIVE** |
| construction-expenses-upload-logo | Upload company logo | S3 bucket | **ACTIVE** |

---

## Migration Priority Matrix

### Priority 1: Core Business Functions (Day 1-2)
1. **Expenses** - 7 records to migrate
   - Multi-table → Company-scoped
   - Update 4 Lambda functions → 1 consolidated function

2. **Projects** - 1 record to migrate
   - Multi-table → Company-scoped
   - Update 3 Lambda functions → 1 consolidated function

3. **Contractors** - 1 record to migrate
   - Multi-table → Company-scoped
   - Update 3 Lambda functions → 1 consolidated function

4. **Works** - 1 record to migrate
   - Multi-table → Company-scoped
   - Update 3 Lambda functions → 1 consolidated function

### Priority 2: Cleanup (Day 3)
1. Delete all multi-table Lambda functions (13 total)
2. Delete all production Lambda functions (13 total)
3. Remove duplicate webhook handlers
4. Clean up unused tables

### Priority 3: Optimization (Post-migration)
1. Consolidate duplicate webhook handlers
2. Optimize query patterns
3. Implement caching layer
4. Add comprehensive monitoring

---

## Function Dependencies Analysis

### Shared Code Libraries
```
lambda/shared/
├── multi-table-utils.js (TO BE DEPRECATED)
│   └── Used by: All multi-table functions
├── company-utils.js (TO BE RETAINED)
│   └── Used by: All company-scoped functions
├── auth-utils.js (TO BE RETAINED)
│   └── Used by: Authorization functions
├── limit-checker.js (TO BE RETAINED)
│   └── Used by: Functions with usage limits
└── sentry.js (TO BE RETAINED)
    └── Used by: Error tracking
```

### API Gateway Integration
```
API: construction-expenses-multi-table-api
├── /expenses
│   ├── GET → multi-table-get-expenses (DEPRECATE)
│   ├── POST → multi-table-add-expense (DEPRECATE)
│   └── DELETE → multi-table-delete-expense (DEPRECATE)
├── /projects
│   ├── GET → multi-table-get-projects (DEPRECATE)
│   ├── POST → multi-table-add-project (DEPRECATE)
│   └── DELETE → multi-table-delete-project (DEPRECATE)
├── /contractors
│   ├── GET → multi-table-get-contractors (DEPRECATE)
│   ├── POST → multi-table-add-contractor (DEPRECATE)
│   └── DELETE → multi-table-delete-contractor (DEPRECATE)
└── /works
    ├── GET → multi-table-get-works (DEPRECATE)
    ├── POST → multi-table-add-work (DEPRECATE)
    └── DELETE → multi-table-delete-work (DEPRECATE)

NEW ENDPOINTS (Company-Scoped):
├── /company/expenses → company-expenses (ALL METHODS)
├── /company/projects → company-projects (ALL METHODS)
├── /company/contractors → company-contractors (ALL METHODS)
└── /company/works → company-works (ALL METHODS)
```

---

## Cost Impact Analysis

### Current State (Monthly)
| Component | Count | Unit Cost | Total |
|-----------|-------|-----------|-------|
| Multi-table Functions | 13 | ~$0.10 | $1.30 |
| Production Functions | 13 | ~$0.10 | $1.30 |
| Company Functions | 4 | ~$0.10 | $0.40 |
| Support Functions | 17 | ~$0.10 | $1.70 |
| **TOTAL** | **47** | - | **$4.70** |

### Target State (Monthly)
| Component | Count | Unit Cost | Total |
|-----------|-------|-----------|-------|
| Company Functions | 4 | ~$0.10 | $0.40 |
| Support Functions | 17 | ~$0.10 | $1.70 |
| **TOTAL** | **21** | - | **$2.10** |

### Savings
- **Functions Removed:** 26 (55% reduction)
- **Monthly Savings:** $2.60 (55% reduction)
- **Annual Savings:** $31.20
- **Simplified Operations:** Single codebase to maintain

---

## Migration Validation Checklist

### Pre-Migration
- [ ] All Lambda functions inventoried
- [ ] Dependencies mapped
- [ ] API Gateway routes documented
- [ ] Shared code analyzed
- [ ] Cost analysis completed

### During Migration
- [ ] Feature flags deployed
- [ ] Dual-write implemented
- [ ] Monitoring active
- [ ] Rollback ready

### Post-Migration
- [ ] All multi-table functions deleted
- [ ] All production functions deleted
- [ ] API Gateway updated
- [ ] Documentation updated
- [ ] Team trained

---

## Risk Assessment

### High Risk Functions
1. **subscription-manager** - Complex business logic
2. **paddle-webhook** - Financial transactions
3. **clerk-authorizer** - Security critical

### Medium Risk Functions
1. Core CRUD operations - Business critical but simple
2. User management - Important but well-tested

### Low Risk Functions
1. File uploads - Independent of database
2. Read-only operations - No data modification

---

## Recommendations

### Immediate Actions
1. **Freeze multi-table development** - No new features
2. **Focus on company-scoped** - All new development here
3. **Begin migration planning** - Start with test environment

### Short-term (1-2 weeks)
1. Execute migration plan
2. Delete deprecated functions
3. Update documentation
4. Train team

### Long-term (1-3 months)
1. Optimize consolidated functions
2. Implement caching
3. Add analytics
4. Consider further consolidation

---

## Appendix: Function Metrics

### Usage Statistics (Last 30 days)
*Note: These would need to be pulled from CloudWatch*
- Average invocations per function
- Error rates
- Duration metrics
- Cost per function

### CloudWatch Log Groups
Each Lambda function has an associated log group:
```
/aws/lambda/construction-expenses-[function-name]
```
Total: 47 log groups (26 to be deleted)

### IAM Roles
Each Lambda function has an execution role:
```
construction-expenses-[function-name]-role
```
Total: 47 roles (26 to be deleted)