# User Management Implementation Plan

## 🎯 **Executive Summary**

Transform the current single-user system into a multi-user, company-centric architecture with Paddle subscription management, role-based permissions, and collaborative project management.

---

## 📊 **Current System Analysis**

### **What We Have**
- ✅ Single-user Cognito authentication
- ✅ Individual user data isolation (`userId` scoping)
- ✅ Paddle billing per individual user
- ✅ Projects, contractors, works, expenses tied to individual users
- ✅ Basic subscription management

### **What We Need to Change**
- 🔄 Multi-user companies with shared data
- 🔄 Company-level Paddle subscriptions
- 🔄 Role-based access control
- 🔄 User invitation and management system
- 🔄 Permission-based UI and API access

---

## 🏗️ **Architecture Overview**

### **Data Model Transformation**
```
BEFORE: User → Projects/Contractors/Works/Expenses
AFTER:  Company → Users (with roles) → Shared Projects/Contractors/Works/Expenses
```

### **User Hierarchy**
```
Company (Paddle Customer)
├── Admin Users (billing owners)
├── Manager Users (project managers)  
├── Editor Users (data entry)
└── Viewer Users (read-only)
```

---

## 🗄️ **Database Schema Requirements**

### **1. New Tables Needed**

#### **Companies Table** (`construction-expenses-companies`)
```javascript
{
  PK: "companyId",                    // "comp_1234567890_abcdef"
  SK: "COMPANY",                      // Sort key for GSI
  companyName: "ABC Construction Ltd",
  companyAddress: "123 Main St, Tel Aviv",
  companyPhone: "+972-50-123-4567",
  companyEmail: "admin@abc-construction.com",
  
  // Paddle Integration
  paddleCustomerId: "ctm_01h1234567890",
  paddleSubscriptionId: "sub_01h1234567890",
  subscriptionStatus: "active",
  subscriptionPlan: "business_pro",
  maxUsers: 10,
  currentUserCount: 7,
  
  // Metadata
  createdAt: "2024-01-01T00:00:00Z",
  createdBy: "usr_admin_001",
  updatedAt: "2024-01-15T10:30:00Z",
  isActive: true
}
```

#### **Company Users Table** (`construction-expenses-company-users`)
```javascript
{
  PK: "companyId",                    // Links to company
  SK: "userId",                       // Cognito user ID
  
  // User Info
  email: "user@company.com",
  displayName: "John Doe",
  phone: "+972-50-987-6543",
  
  // Role & Permissions
  role: "ADMIN|MANAGER|EDITOR|VIEWER",
  permissions: [                      // Flexible permission array
    "manage_billing",
    "invite_users", 
    "manage_projects",
    "view_all_data",
    "export_data"
  ],
  
  // Status
  status: "active|inactive|pending",
  invitedBy: "adminUserId",
  invitedAt: "2024-01-01T00:00:00Z",
  joinedAt: "2024-01-02T14:20:00Z",
  lastLogin: "2024-01-15T09:45:00Z",
  
  // Metadata
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-15T10:30:00Z"
}

// GSI: email-index (for login lookup)
// GSI: company-role-index (for permission queries)
```

#### **Invitations Table** (`construction-expenses-invitations`)
```javascript
{
  PK: "companyId",
  SK: "invitationToken",              // Secure random token
  
  // Invitation Details
  email: "newuser@company.com",
  role: "EDITOR",
  permissions: ["create_projects", "edit_own"],
  
  // Status & Timing
  status: "PENDING|ACCEPTED|EXPIRED|CANCELLED",
  expiresAt: "2024-01-08T00:00:00Z", // 7 days from creation
  
  // Tracking
  invitedBy: "adminUserId",
  invitedAt: "2024-01-01T00:00:00Z",
  acceptedAt: null,
  acceptedBy: null,
  
  // Email tracking
  emailSent: true,
  lastEmailSent: "2024-01-01T00:00:00Z",
  emailAttempts: 1
}

// GSI: email-index (for duplicate invitation checking)
// GSI: status-expires-index (for cleanup jobs)
```

### **2. Existing Tables Modifications**

#### **Users Table** (extend existing)
```javascript
// ADD these fields to existing users table:
{
  // ... existing fields ...
  
  // Company Association
  primaryCompanyId: "comp_1234567890_abcdef",
  companies: [                        // Support multiple company membership
    {
      companyId: "comp_1234567890_abcdef",
      role: "ADMIN",
      joinedAt: "2024-01-01T00:00:00Z"
    }
  ],
  
  // Migration support
  migratedFromIndividual: true,
  migrationDate: "2024-01-15T00:00:00Z"
}
```

#### **Projects/Contractors/Works/Expenses Tables** (add company scoping)
```javascript
// CHANGE: Replace userId with companyId in primary key structure
// BEFORE: PK: userId, SK: projectId
// AFTER:  PK: companyId, SK: projectId

// ADD these fields:
{
  companyId: "comp_1234567890_abcdef", // Primary company association
  createdBy: "usr_123",                // User who created it
  lastModifiedBy: "usr_456",           // User who last modified
  assignedTo: ["usr_123", "usr_456"],  // Users with access (optional)
  
  // Permission metadata
  isPublic: true,                      // Visible to all company users
  restrictedTo: [],                    // Specific user IDs (if not public)
}

// GSI: company-created-index (for user activity tracking)
```

---

## 🔌 **API Endpoints Required**

### **1. Company Management**

#### **GET /api/company**
- Get current user's company information
- Returns: Company details, subscription status, user limits

#### **PUT /api/company**
- Update company information (admin only)
- Body: companyName, address, phone, email

#### **POST /api/company/create**
- Create new company (for new registrations)
- Body: Company details + initial admin user

### **2. User Management**

#### **GET /api/company/users**
- List all users in current company
- Query params: role, status, sortBy
- Returns: User list with roles, last login, activity stats

#### **POST /api/company/users/invite**
- Send invitation to new user
- Body: email, role, permissions, personalMessage
- Checks: subscription limits, duplicate emails

#### **GET /api/company/users/invitations**
- List pending invitations
- Returns: Invitation details, expiry status

#### **POST /api/company/users/invitations/{token}/resend**
- Resend invitation email

#### **DELETE /api/company/users/invitations/{token}**
- Cancel pending invitation

#### **PUT /api/company/users/{userId}**
- Update user role/permissions (admin only)
- Body: role, permissions, isActive

#### **DELETE /api/company/users/{userId}**
- Remove user from company (admin only)
- Handles: Data reassignment, billing adjustment

#### **POST /api/company/users/transfer-ownership**
- Transfer admin rights to another user
- Body: newAdminUserId
- Security: Requires current admin confirmation

### **3. Invitation Handling**

#### **POST /api/invitations/validate**
- Validate invitation token
- Body: token
- Returns: Invitation details if valid

#### **POST /api/invitations/accept**
- Accept invitation and join company
- Body: token, userDetails (name, password)
- Creates: New user account + company association

### **4. Permission System**

#### **GET /api/permissions/check**
- Check if user has specific permission
- Query: permission, resourceId (optional)
- Returns: boolean + reason if denied

#### **GET /api/permissions/matrix**
- Get all available permissions and role assignments
- Returns: Full permission matrix for admin UI

---

## 🎨 **Frontend Components Required**

### **1. User Management Dashboard**

#### **UserManagementMain.vue/jsx**
```javascript
// Main container component
<UserManagementMain>
  <SubscriptionStatus />
  <UsersList />
  <PendingInvitations />
  <InviteUserModal />
</UserManagementMain>
```

#### **SubscriptionStatus Component**
```javascript
// Shows Paddle subscription info
{
  planName: "Business Pro",
  userCount: "7/10 users",
  nextBilling: "Jan 15, 2025",
  amount: "$70.00",
  status: "active",
  actions: ["Upgrade Plan", "Manage Billing", "Usage Reports"]
}
```

#### **UsersList Component**
```javascript
// Sortable, filterable user list
{
  users: [
    {
      id, name, email, role, lastLogin,
      status, projectCount, expenseCount,
      actions: ["Edit", "Remove", "View Activity"]
    }
  ],
  sorting: ["name", "role", "lastLogin", "activity"],
  filtering: ["role", "status"],
  bulkActions: ["Export", "Send Message"]
}
```

#### **InviteUserModal Component**
```javascript
// Form for inviting new users
{
  email: "",
  role: "EDITOR",
  permissions: [],
  personalMessage: "",
  validation: {
    checkDuplicates: true,
    validateEmail: true,
    checkLimits: true
  }
}
```

### **2. Role Management**

#### **RoleSelector Component**
```javascript
// Reusable role selection dropdown
{
  roles: ["ADMIN", "MANAGER", "EDITOR", "VIEWER"],
  descriptions: {
    ADMIN: "Full access including billing",
    MANAGER: "Project management and user oversight", 
    // ... etc
  },
  onChange: (role) => updatePermissions(role)
}
```

#### **PermissionMatrix Component**
```javascript
// Visual permission comparison table
{
  permissions: [
    "manage_billing", "invite_users", "manage_projects",
    "view_all_data", "export_data", "delete_data"
  ],
  roles: {
    ADMIN: [true, true, true, true, true, true],
    MANAGER: [false, true, true, true, true, false],
    // ... etc
  }
}
```

### **3. Company Settings**

#### **CompanyProfile Component**
```javascript
// Company information form
{
  companyName: "",
  address: "", 
  phone: "",
  email: "",
  logo: null,
  timezone: "Asia/Jerusalem",
  currency: "ILS"
}
```

### **4. Navigation Updates**

#### **UserMenu Component** (update existing)
```javascript
// Add company context to user menu
{
  currentUser: "John Doe",
  currentCompany: "ABC Construction", 
  companies: [                        // If multi-company support
    { id: "comp_1", name: "ABC Construction", role: "ADMIN" },
    { id: "comp_2", name: "XYZ Builders", role: "EDITOR" }
  ],
  actions: ["Switch Company", "Settings", "Logout"]
}
```

---

## 🔐 **Security & Permission System**

### **1. Permission Definitions**
```javascript
const PERMISSIONS = {
  // Billing & Company
  MANAGE_BILLING: "manage_billing",
  MANAGE_COMPANY: "manage_company",
  
  // User Management  
  INVITE_USERS: "invite_users",
  MANAGE_USERS: "manage_users",
  VIEW_USERS: "view_users",
  
  // Data Management
  MANAGE_PROJECTS: "manage_projects", 
  CREATE_PROJECTS: "create_projects",
  EDIT_ALL_PROJECTS: "edit_all_projects",
  EDIT_OWN_PROJECTS: "edit_own_projects",
  DELETE_PROJECTS: "delete_projects",
  
  // Similar for contractors, works, expenses...
  
  // System
  VIEW_ALL_DATA: "view_all_data",
  EXPORT_DATA: "export_data",
  VIEW_REPORTS: "view_reports"
}
```

### **2. Middleware Functions**
```javascript
// API middleware for permission checking
async function requirePermission(permission) {
  return async (req, res, next) => {
    const user = await getCurrentUser(req);
    const hasPermission = await checkUserPermission(user.id, permission, req.params);
    
    if (!hasPermission) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    
    next();
  }
}

// Usage:
app.get('/api/company/users', requirePermission('view_users'), getUsersList);
app.post('/api/projects', requirePermission('create_projects'), createProject);
```

### **3. Data Filtering**
```javascript
// Automatic data scoping by company
async function getProjectsForUser(userId) {
  const user = await getUser(userId);
  const company = user.primaryCompanyId;
  
  let projects = await getCompanyProjects(company);
  
  // Apply permission-based filtering
  if (!user.permissions.includes('view_all_data')) {
    projects = projects.filter(p => 
      p.createdBy === userId || 
      p.assignedTo.includes(userId)
    );
  }
  
  return projects;
}
```

---

## 🏷️ **Paddle Integration Points**

### **1. Subscription Migration**
```javascript
// Migrate individual subscriptions to company subscriptions
async function migrateUserToCompany(userId, companyId) {
  // Get user's current Paddle subscription
  const userSubscription = await paddle.getSubscription(userId);
  
  // Get/create company subscription
  let companySubscription = await getCompanySubscription(companyId);
  
  if (!companySubscription) {
    // Create company subscription
    companySubscription = await paddle.createSubscription({
      customerId: companyId,
      planId: "company_plan_id",
      quantity: 1
    });
  } else {
    // Increment user count
    await paddle.updateSubscription({
      subscriptionId: companySubscription.id,
      quantity: companySubscription.quantity + 1
    });
  }
  
  // Cancel individual subscription
  await paddle.cancelSubscription(userSubscription.id);
}
```

### **2. Usage Enforcement**
```javascript
// Check subscription limits before inviting users
async function canInviteUser(companyId) {
  const company = await getCompany(companyId);
  const subscription = await paddle.getSubscription(company.paddleSubscriptionId);
  
  return {
    canInvite: company.currentUserCount < company.maxUsers,
    currentUsers: company.currentUserCount,
    maxUsers: company.maxUsers,
    planName: subscription.plan.name,
    upgradeRequired: company.currentUserCount >= company.maxUsers
  };
}
```

### **3. Billing Events Handling**
```javascript
// Webhook handler for Paddle events
app.post('/webhooks/paddle', async (req, res) => {
  const event = req.body;
  
  switch(event.event_type) {
    case 'subscription.cancelled':
      await handleSubscriptionCancelled(event.data);
      break;
      
    case 'subscription.updated':
      await handleSubscriptionUpdated(event.data);
      break;
      
    case 'payment.failed':
      await handlePaymentFailed(event.data);
      break;
  }
  
  res.status(200).send('OK');
});

async function handleSubscriptionCancelled(data) {
  const company = await getCompanyByPaddleId(data.subscription_id);
  
  // Disable company access
  await updateCompany(company.id, { 
    subscriptionStatus: 'cancelled',
    accessEnabled: false 
  });
  
  // Notify all users
  await sendCancellationNotification(company.id);
}
```

---

## 📋 **Implementation Phases**

### **Phase 1: Foundation (Week 1-2)**
- [ ] Create new database tables (Companies, Company Users, Invitations)
- [ ] Implement basic company creation and user association
- [ ] Create company registration flow for new users
- [ ] Basic user management API endpoints

### **Phase 2: User Management (Week 2-3)**
- [ ] User invitation system (email sending)
- [ ] Invitation acceptance flow
- [ ] Basic role assignment (no permissions yet)
- [ ] User list and management UI components

### **Phase 3: Permissions & Security (Week 3-4)**  
- [ ] Permission system implementation
- [ ] API middleware for permission checking
- [ ] Role-based UI hiding/showing
- [ ] Data filtering by company and permissions

### **Phase 4: Paddle Integration (Week 4-5)**
- [ ] Migrate subscription model from user-based to company-based
- [ ] Implement usage limits and enforcement
- [ ] Billing management UI for admins
- [ ] Subscription upgrade/downgrade flows

### **Phase 5: Data Migration (Week 5-6)**
- [ ] Migrate existing users to company structure
- [ ] Migrate existing data (projects/contractors/etc) to company-scoped
- [ ] Backward compatibility handling
- [ ] Data validation and cleanup

### **Phase 6: Advanced Features (Week 6-7)**
- [ ] Activity logging and audit trails
- [ ] Advanced permission matrix UI
- [ ] Bulk user operations
- [ ] Usage analytics and reporting

### **Phase 7: Testing & Polish (Week 7-8)**
- [ ] Comprehensive testing (unit, integration, e2e)
- [ ] Performance optimization
- [ ] Security audit
- [ ] Documentation and training materials

---

## 🧪 **Testing Requirements**

### **1. Unit Tests**
- Permission checking functions
- Data filtering logic  
- Invitation token generation/validation
- Paddle webhook handlers

### **2. Integration Tests**
- Complete user invitation flow
- Company creation and user assignment
- Subscription limit enforcement
- Data migration scripts

### **3. End-to-End Tests**
- Multi-user company workflows
- Role-based access scenarios
- Billing integration flows
- Cross-browser compatibility

### **4. Security Tests**
- Data isolation between companies
- Permission bypass attempts
- Invitation token security
- API authentication edge cases

### **5. Performance Tests**
- Large company user lists
- Permission checking at scale
- Database query optimization
- Frontend rendering with many users

---

## 🚨 **Critical Considerations**

### **1. Data Migration Risks**
- **Risk**: Loss of existing user data during migration
- **Mitigation**: Comprehensive backup strategy + rollback plan
- **Testing**: Shadow mode with parallel systems

### **2. Billing Disruption**
- **Risk**: Users losing access during Paddle subscription migration  
- **Mitigation**: Gradual migration with overlap period
- **Communication**: Clear timeline and expectations

### **3. Permission Escalation**
- **Risk**: Users gaining unauthorized access to company data
- **Mitigation**: Thorough permission validation at API and UI levels
- **Monitoring**: Audit logs for all permission changes

### **4. Invitation Security**
- **Risk**: Unauthorized users joining companies via stolen tokens
- **Mitigation**: Time-limited tokens + email domain verification
- **Monitoring**: Track invitation usage patterns

### **5. Company Data Isolation**
- **Risk**: Data leakage between companies
- **Mitigation**: Database-level constraints + application-level validation
- **Testing**: Automated cross-company access tests

---

## 📊 **Success Metrics**

### **Technical Metrics**
- [ ] Zero data leakage incidents between companies
- [ ] <500ms API response times for user management operations  
- [ ] 99.9% uptime during migration period
- [ ] All existing functionality maintains backward compatibility

### **Business Metrics**
- [ ] 90%+ successful invitation acceptance rate
- [ ] <5% support tickets related to user management
- [ ] Successful migration of 100% existing users
- [ ] Paddle subscription conversion rate >80%

### **User Experience Metrics**
- [ ] Intuitive user management (measured by support tickets)
- [ ] Clear permission understanding (user feedback)
- [ ] Smooth onboarding for new team members
- [ ] Admin efficiency in managing company users

---

## 📝 **Next Steps**

1. **Review and approve** this implementation plan
2. **Define role permissions** matrix (user decision)
3. **Set up development environment** for multi-table DynamoDB  
4. **Create test Paddle environment** for company subscriptions
5. **Begin Phase 1 implementation** with database schema setup

---

*This document should be reviewed and updated as requirements evolve during implementation.*