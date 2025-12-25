# RBAC (Role-Based Access Control) System - Complete Guide

**How Permissions & Roles Work in the Application**

---

## 🎯 Overview

The application uses a **fine-grained Role-Based Access Control (RBAC)** system to manage what users can do based on their role within a company. RBAC controls access to features like creating expenses, managing users, viewing reports, etc.

### Key Concepts

- **Role** = Job title/responsibility (admin, manager, editor, viewer)
- **Permission** = Specific action allowed (create_expenses, delete_projects, manage_users)
- **User** = Person authenticated via Clerk with a role in a company
- **Company** = Multi-tenant isolation (users only access their company's data)

---

## 👥 User Roles

### Role Hierarchy (from `company-utils.js` lines 114-120)

```javascript
const USER_ROLES = {
  ADMIN: 'admin',        // Full control
  MANAGER: 'manager',    // Manage operations (no billing/users)
  EDITOR: 'editor',      // Create & edit own items
  VIEWER: 'viewer',      // Read-only access
  USER: 'user'           // Legacy role (same as EDITOR)
};
```

### Role Descriptions

| Role | Hebrew | Description | Typical User |
|------|--------|-------------|--------------|
| **admin** | מנהל | Company owner/administrator with full control | Business owner, CEO |
| **manager** | מנהל תפעול | Operations manager - can manage all data but NOT users/billing | Site manager, foreman |
| **editor** | עורך | Can create and edit their own items only | Field worker, bookkeeper |
| **viewer** | צופה | Read-only access to reports and data | Accountant, auditor |

---

## 🔐 Permissions System

### Permission Categories (from `company-utils.js` lines 122-165)

#### **1. Billing & Company Management**
```javascript
MANAGE_BILLING: "manage_billing"      // Change subscription, update payment
MANAGE_COMPANY: "manage_company"      // Edit company profile, settings
```

#### **2. User Management**
```javascript
INVITE_USERS: "invite_users"          // Send invitations
MANAGE_USERS: "manage_users"          // Edit/remove users
VIEW_USERS: "view_users"              // See user list
```

#### **3. Projects**
```javascript
MANAGE_PROJECTS: "manage_projects"            // Full project management
CREATE_PROJECTS: "create_projects"            // Create new projects
EDIT_ALL_PROJECTS: "edit_all_projects"        // Edit any project
EDIT_OWN_PROJECTS: "edit_own_projects"        // Edit only own projects
DELETE_PROJECTS: "delete_projects"            // Delete projects
```

#### **4. Contractors**
```javascript
MANAGE_CONTRACTORS: "manage_contractors"
CREATE_CONTRACTORS: "create_contractors"
EDIT_ALL_CONTRACTORS: "edit_all_contractors"
EDIT_OWN_CONTRACTORS: "edit_own_contractors"
DELETE_CONTRACTORS: "delete_contractors"
```

#### **5. Works (Labor/Services)**
```javascript
MANAGE_WORKS: "manage_works"
CREATE_WORKS: "create_works"
EDIT_ALL_WORKS: "edit_all_works"
EDIT_OWN_WORKS: "edit_own_works"
DELETE_WORKS: "delete_works"
```

#### **6. Expenses**
```javascript
MANAGE_EXPENSES: "manage_expenses"
CREATE_EXPENSES: "create_expenses"
EDIT_ALL_EXPENSES: "edit_all_expenses"
EDIT_OWN_EXPENSES: "edit_own_expenses"  // ← Key permission for editors
DELETE_EXPENSES: "delete_expenses"
```

#### **7. Reports & Data**
```javascript
VIEW_ALL_DATA: "view_all_data"        // See all company data
EXPORT_DATA: "export_data"            // Export to PDF/Excel
VIEW_REPORTS: "view_reports"          // Access reports dashboard
```

### Permission Naming Pattern

- **MANAGE_** = Full control (create, read, update, delete)
- **CREATE_** = Can create new items
- **EDIT_ALL_** = Can edit any item in the company
- **EDIT_OWN_** = Can only edit items they created
- **DELETE_** = Can delete items
- **VIEW_** = Read-only access

---

## 🎭 Role-to-Permission Mapping

### Admin Role (lines 169-194)
**Full access to everything:**

```javascript
ROLE_PERMISSIONS[USER_ROLES.ADMIN] = [
  // Billing & Company
  MANAGE_BILLING,
  MANAGE_COMPANY,

  // Users
  INVITE_USERS,
  MANAGE_USERS,
  VIEW_USERS,

  // All data operations
  MANAGE_PROJECTS,
  CREATE_PROJECTS,
  EDIT_ALL_PROJECTS,
  DELETE_PROJECTS,

  MANAGE_CONTRACTORS,
  CREATE_CONTRACTORS,
  EDIT_ALL_CONTRACTORS,
  DELETE_CONTRACTORS,

  MANAGE_WORKS,
  CREATE_WORKS,
  EDIT_ALL_WORKS,
  DELETE_WORKS,

  MANAGE_EXPENSES,
  CREATE_EXPENSES,
  EDIT_ALL_EXPENSES,
  DELETE_EXPENSES,

  // Reports
  VIEW_ALL_DATA,
  EXPORT_DATA,
  VIEW_REPORTS
];
```

**Can do:**
- ✅ Everything (full control)
- ✅ Manage billing & subscriptions
- ✅ Invite/remove users
- ✅ Create, edit, delete all data
- ✅ View all reports

**Cannot do:**
- ❌ Nothing is restricted

---

### Manager Role (lines 195-216)
**Operations manager - everything except billing/users:**

```javascript
ROLE_PERMISSIONS[USER_ROLES.MANAGER] = [
  VIEW_USERS,  // ← Can see users but not manage them

  MANAGE_PROJECTS,
  CREATE_PROJECTS,
  EDIT_ALL_PROJECTS,
  DELETE_PROJECTS,

  MANAGE_CONTRACTORS,
  CREATE_CONTRACTORS,
  EDIT_ALL_CONTRACTORS,
  DELETE_CONTRACTORS,

  MANAGE_WORKS,
  CREATE_WORKS,
  EDIT_ALL_WORKS,
  DELETE_WORKS,

  MANAGE_EXPENSES,
  CREATE_EXPENSES,
  EDIT_ALL_EXPENSES,
  DELETE_EXPENSES,

  VIEW_ALL_DATA,
  EXPORT_DATA,
  VIEW_REPORTS
];
```

**Can do:**
- ✅ Create, edit, delete ALL projects/contractors/works/expenses
- ✅ View all company data
- ✅ Export reports
- ✅ See user list

**Cannot do:**
- ❌ Manage billing/subscription
- ❌ Invite or remove users
- ❌ Edit company settings

---

### Editor Role (lines 217-227)
**Can create and edit own items only:**

```javascript
ROLE_PERMISSIONS[USER_ROLES.EDITOR] = [
  CREATE_PROJECTS,
  EDIT_OWN_PROJECTS,  // ← Only own projects

  CREATE_CONTRACTORS,
  EDIT_OWN_CONTRACTORS,

  CREATE_WORKS,
  EDIT_OWN_WORKS,

  CREATE_EXPENSES,
  EDIT_OWN_EXPENSES,  // ← Only own expenses

  VIEW_REPORTS
];
```

**Can do:**
- ✅ Create projects, contractors, works, expenses
- ✅ Edit **only their own** items (ownership checked)
- ✅ View reports

**Cannot do:**
- ❌ Edit other users' items
- ❌ Delete anything
- ❌ Manage users
- ❌ Export data

---

### Viewer Role (lines 228-230)
**Read-only access:**

```javascript
ROLE_PERMISSIONS[USER_ROLES.VIEWER] = [
  VIEW_REPORTS  // ← Only this
];
```

**Can do:**
- ✅ View reports and dashboards

**Cannot do:**
- ❌ Create anything
- ❌ Edit anything
- ❌ Delete anything
- ❌ Export data
- ❌ See full data lists (limited view)

---

## 🔄 RBAC Flow: From Login to Permission Check

### Step 1: User Authenticates with Clerk

```javascript
// Mobile app - User logs in
import { useSignIn } from '@clerk/clerk-expo';

const { signIn, setActive } = useSignIn();

await signIn.create({
  identifier: "user@example.com",
  password: "password123"
});

await setActive({ session: signIn.createdSessionId });

// ✅ User now has Clerk JWT token
const token = await getToken();
// JWT contains: { sub: "user_123", email: "user@example.com", ... }
```

**What happens:**
- User provides credentials
- Clerk validates and issues JWT token
- JWT contains user ID (`sub`) and email
- **JWT does NOT contain role yet** (role stored in DynamoDB)

---

### Step 2: Lambda Authorizer Enriches JWT with Role

Every API request goes through the **Lambda Authorizer** first (`clerk-authorizer.js`):

```javascript
// Lambda Authorizer (runs before every API request)
exports.handler = async (event) => {
  // 1. Extract JWT from Authorization header
  const token = event.authorizationToken.replace('Bearer ', '');

  // 2. Verify token with Clerk
  const payload = await verifyToken(token, { secretKey: CLERK_SECRET_KEY });
  const userId = payload.sub;  // "user_123"

  // 3. Look up user's role in DynamoDB
  const membership = await findUserCompanyMembership(userId);
  const companyId = membership.companyId;  // "comp_abc"
  const role = membership.role;            // "editor"

  // 4. Generate IAM policy with role context
  return generatePolicy(userId, 'Allow', event.methodArn, {
    userId: userId,
    companyId: companyId,
    role: role,            // ← Role added to context
    email: payload.email
  });
};
```

**Result:** API Gateway adds this context to every request:
```javascript
event.requestContext.authorizer = {
  userId: "user_123",
  companyId: "comp_abc",
  role: "editor",         // ← Available to Lambda functions
  email: "user@example.com"
};
```

---

### Step 3: Extract User Context in Lambda Function

Every Lambda function extracts user context using `getCompanyUserFromEvent()`:

```javascript
// companyExpenses.js (lines 302-327)
function getCompanyUserFromEvent(event) {
  const authorizer = event.requestContext.authorizer;

  const companyId = authorizer.companyId;  // "comp_abc"
  const userId = authorizer.userId;        // "user_123"
  const userRole = authorizer.role;        // "editor"
  const userEmail = authorizer.email;      // "user@example.com"

  return { companyId, userId, userRole, userEmail };
}

// Usage in handler
exports.handler = async (event) => {
  const { companyId, userId, userRole } = getCompanyUserFromEvent(event);

  // Now we know:
  // - WHO the user is (userId)
  // - WHICH company they belong to (companyId)
  // - WHAT role they have (userRole)
};
```

---

### Step 4: Check Permission Before Action

#### **Approach 1: Direct Permission Check**

```javascript
// companyExpenses.js (lines 149-152)
if (!hasPermission(userRole, PERMISSIONS.CREATE_EXPENSES)) {
  return createErrorResponse(403, 'You do not have permission to create expenses');
}

// Helper function (company-utils.js lines 701-704)
function hasPermission(userRole, permission) {
  const permissions = getUserPermissions(userRole);  // Get all permissions for role
  return permissions.includes(permission);           // Check if permission exists
}
```

**Example:**
```javascript
// User with "editor" role tries to create expense
hasPermission("editor", "create_expenses")
  → getUserPermissions("editor")
  → [
      "create_projects",
      "edit_own_projects",
      "create_contractors",
      "create_expenses",  ← Found!
      ...
    ]
  → true  ✅ Allowed
```

---

#### **Approach 2: Middleware-Based Permission Check**

The system provides middleware wrappers for automatic permission checking:

##### **A. `withCompanyAuth` - Any Authenticated User**

```javascript
// Just requires authentication, no specific permission
exports.handler = withCompanyAuth(async (event, context) => {
  // event.authContext is automatically added:
  // {
  //   companyId: "comp_abc",
  //   userId: "user_123",
  //   userRole: "editor",
  //   permissions: [...all editor permissions...],
  //   hasPermission: (permission) => boolean
  // }

  // All authenticated users can access this
  return createResponse(200, { message: "Hello!" });
});
```

---

##### **B. `withPermission` - Specific Permission Required**

```javascript
// Require specific permission
exports.handler = withPermission(PERMISSIONS.MANAGE_USERS, async (event, context) => {
  // Only users with MANAGE_USERS permission can reach here
  // (admins only)

  const users = await getAllUsers();
  return createResponse(200, { users });
});
```

**How it works (`company-utils.js` lines 786-823):**
```javascript
function withPermission(requiredPermission, handler) {
  return withSecureCors(async (event, context) => {
    // 1. Get user context
    const { companyId, userId, userRole } = getCompanyUserFromEvent(event);

    // 2. Check permission
    if (!hasPermission(userRole, requiredPermission)) {
      return createErrorResponse(403, `Access denied. Required permission: ${requiredPermission}`);
    }

    // 3. Add permission context to event
    event.permissionContext = {
      companyId,
      userId,
      userRole,
      permissions: getUserPermissions(userRole),
      hasPermission: (permission) => hasPermission(userRole, permission)
    };

    // 4. Call actual handler
    return await handler(event, context);
  });
}
```

---

##### **C. `withAdminRole` - Admin Only**

```javascript
// Shortcut for admin-only operations
exports.handler = withAdminRole(async (event, context) => {
  // Only admins can reach here

  await deleteAllData();  // Dangerous operation
  return createResponse(200, { message: "Data deleted" });
});

// Implementation (company-utils.js lines 828-830)
function withAdminRole(handler) {
  return withPermission(PERMISSIONS.MANAGE_USERS, handler);
}
```

---

### Step 5: Ownership Check for "OWN" Permissions

For permissions like `EDIT_OWN_EXPENSES`, the system checks **ownership**:

```javascript
// companyExpenses.js (lines 519-524)
async function updateExpense(event, companyId, userId, userRole) {
  const expenseId = requestBody.expenseId;

  // Fetch existing expense
  const existingExpense = await getExpense(companyId, expenseId);

  // Check if user has EDIT_ALL permission
  if (!hasPermission(userRole, PERMISSIONS.EDIT_ALL_EXPENSES)) {
    // No? Check if they have EDIT_OWN and they own this expense
    if (existingExpense.userId !== userId) {
      return createErrorResponse(403, 'You can only edit expenses you created');
    }
  }

  // Permission check passed, proceed with update
  await updateExpenseInDB(expense);
}
```

**Logic:**
```
IF user has "edit_all_expenses":
  ✅ Can edit any expense
ELSE IF user has "edit_own_expenses":
  IF expense.userId === currentUserId:
    ✅ Can edit (owns it)
  ELSE:
    ❌ Cannot edit (doesn't own it)
ELSE:
  ❌ No permission at all
```

---

## 📱 Mobile App Integration

### Check User Role After Login

```javascript
// Mobile app - After authentication
import { useAuth } from '@clerk/clerk-expo';

const { getToken } = useAuth();

// Get company info (includes user role)
const response = await fetch(
  'https://api.example.com/get-company',
  {
    headers: {
      'Authorization': `Bearer ${await getToken()}`,
      'Content-Type': 'application/json'
    }
  }
);

const data = await response.json();
console.log(data.userInfo.role);  // "editor"
console.log(data.userInfo.isAdmin);  // false

// {
//   "success": true,
//   "companyExists": true,
//   "company": { ... },
//   "userInfo": {
//     "role": "editor",      // ← User's role
//     "isAdmin": false
//   }
// }
```

---

### Conditional UI Based on Role

```javascript
import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-expo';

function ExpenseScreen() {
  const [userRole, setUserRole] = useState(null);
  const { getToken } = useAuth();

  useEffect(() => {
    async function fetchRole() {
      const token = await getToken();
      const response = await fetch('https://api.example.com/get-company', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      setUserRole(data.userInfo.role);
    }
    fetchRole();
  }, []);

  return (
    <View>
      <Text>Expenses</Text>

      {/* All users can view */}
      <ExpenseList />

      {/* Only editors, managers, admins can create */}
      {['editor', 'manager', 'admin'].includes(userRole) && (
        <Button title="Add Expense" onPress={createExpense} />
      )}

      {/* Only admins and managers can delete */}
      {['admin', 'manager'].includes(userRole) && (
        <Button title="Delete" onPress={deleteExpense} color="red" />
      )}

      {/* Only admins can invite users */}
      {userRole === 'admin' && (
        <Button title="Invite User" onPress={inviteUser} />
      )}
    </View>
  );
}
```

---

### Handle Permission Errors Gracefully

```javascript
async function createExpense(expenseData) {
  try {
    const token = await getToken();

    const response = await fetch('https://api.example.com/expenses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(expenseData)
    });

    const result = await response.json();

    if (response.status === 403) {
      // Permission denied
      Alert.alert(
        'אין הרשאה',
        'אין לך הרשאה ליצור הוצאות. פנה למנהל המערכת.',
        [{ text: 'אישור' }]
      );
      return;
    }

    if (result.success) {
      Alert.alert('הצלחה', 'ההוצאה נוצרה בהצלחה');
    }

  } catch (error) {
    Alert.alert('שגיאה', error.message);
  }
}
```

---

## 🔒 Data Filtering by Role

### Viewers See Limited Data

```javascript
// companyExpenses.js (lines 215-218)
async function getExpenses(companyId, userId, userRole, event) {
  // Fetch all expenses
  const result = await dynamoOperation('query', {
    TableName: 'expenses',
    KeyConditionExpression: 'companyId = :companyId',
    ExpressionAttributeValues: { ':companyId': companyId }
  });

  let filteredExpenses = result.Items || [];

  // Filter data based on user role
  if (userRole === USER_ROLES.EDITOR) {
    // Editors only see expenses they created
    filteredExpenses = filteredExpenses.filter(expense =>
      expense.userId === userId
    );
  }
  // Admins, managers, viewers see all expenses

  return createResponse(200, { expenses: filteredExpenses });
}
```

**Result:**
- **Admin**: Sees all 100 expenses
- **Manager**: Sees all 100 expenses
- **Editor** (userId: `user_123`): Sees only 15 expenses they created
- **Viewer**: Sees all 100 expenses (read-only)

---

## 📊 Permission Matrix

| Action | Admin | Manager | Editor | Viewer |
|--------|-------|---------|--------|--------|
| **Billing & Users** |
| Change subscription | ✅ | ❌ | ❌ | ❌ |
| Invite users | ✅ | ❌ | ❌ | ❌ |
| Remove users | ✅ | ❌ | ❌ | ❌ |
| View user list | ✅ | ✅ | ❌ | ❌ |
| **Projects** |
| Create project | ✅ | ✅ | ✅ | ❌ |
| Edit any project | ✅ | ✅ | ❌ | ❌ |
| Edit own project | ✅ | ✅ | ✅ | ❌ |
| Delete project | ✅ | ✅ | ❌ | ❌ |
| **Contractors** |
| Create contractor | ✅ | ✅ | ✅ | ❌ |
| Edit any contractor | ✅ | ✅ | ❌ | ❌ |
| Edit own contractor | ✅ | ✅ | ✅ | ❌ |
| Delete contractor | ✅ | ✅ | ❌ | ❌ |
| **Expenses** |
| Create expense | ✅ | ✅ | ✅ | ❌ |
| Edit any expense | ✅ | ✅ | ❌ | ❌ |
| Edit own expense | ✅ | ✅ | ✅ | ❌ |
| Delete expense | ✅ | ✅ | ❌ | ❌ |
| **Reports** |
| View reports | ✅ | ✅ | ✅ | ✅ |
| Export to PDF/Excel | ✅ | ✅ | ❌ | ❌ |
| View all data | ✅ | ✅ | ❌ | ❌ |

---

## 🧪 Testing RBAC

### Test User Creation

```javascript
// Create test users with different roles
const testUsers = [
  {
    email: "admin@test.com",
    role: "admin",
    password: "AdminPass123"
  },
  {
    email: "manager@test.com",
    role: "manager",
    password: "ManagerPass123"
  },
  {
    email: "editor@test.com",
    role: "editor",
    password: "EditorPass123"
  },
  {
    email: "viewer@test.com",
    role: "viewer",
    password: "ViewerPass123"
  }
];
```

### Test Scenarios

#### **1. Admin Can Do Everything**
```bash
# Login as admin
TOKEN=$(get_token "admin@test.com" "AdminPass123")

# Create expense - ✅ Should succeed
curl -X POST https://api.example.com/expenses \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"amount": 1000, ...}'

# Delete expense - ✅ Should succeed
curl -X DELETE https://api.example.com/expenses/exp_123 \
  -H "Authorization: Bearer $TOKEN"

# Invite user - ✅ Should succeed
curl -X POST https://api.example.com/invite-user \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"email": "new@test.com", "role": "editor"}'
```

#### **2. Manager Cannot Invite Users**
```bash
# Login as manager
TOKEN=$(get_token "manager@test.com" "ManagerPass123")

# Create expense - ✅ Should succeed
curl -X POST https://api.example.com/expenses \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"amount": 1000, ...}'

# Invite user - ❌ Should fail with 403
curl -X POST https://api.example.com/invite-user \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"email": "new@test.com", "role": "editor"}'
# Response: {"error": "Admin privileges required"}
```

#### **3. Editor Can Only Edit Own Expenses**
```bash
# Login as editor (userId: user_editor_123)
TOKEN=$(get_token "editor@test.com" "EditorPass123")

# Create expense - ✅ Should succeed
curl -X POST https://api.example.com/expenses \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"amount": 1000, ...}'
# Response: {"expenseId": "exp_999", "userId": "user_editor_123"}

# Edit own expense - ✅ Should succeed
curl -X PUT https://api.example.com/expenses \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"expenseId": "exp_999", "amount": 1500}'

# Edit someone else's expense - ❌ Should fail with 403
curl -X PUT https://api.example.com/expenses \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"expenseId": "exp_555", "amount": 1500}'
# Response: {"error": "You can only edit expenses you created"}

# Delete expense - ❌ Should fail with 403
curl -X DELETE https://api.example.com/expenses/exp_999 \
  -H "Authorization: Bearer $TOKEN"
# Response: {"error": "You do not have permission to delete expenses"}
```

#### **4. Viewer Can Only View**
```bash
# Login as viewer
TOKEN=$(get_token "viewer@test.com" "ViewerPass123")

# View expenses - ✅ Should succeed (read-only)
curl https://api.example.com/expenses \
  -H "Authorization: Bearer $TOKEN"

# Create expense - ❌ Should fail with 403
curl -X POST https://api.example.com/expenses \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"amount": 1000, ...}'
# Response: {"error": "You do not have permission to create expenses"}
```

---

## 🔧 Implementation Checklist for Mobile

- [ ] Store user role after login (`GET /get-company`)
- [ ] Conditionally render UI based on role
- [ ] Handle 403 errors gracefully with Hebrew messages
- [ ] Show appropriate error messages:
  - Viewer: "אין לך הרשאה ליצור/לערוך. התפקיד שלך הוא צופה בלבד"
  - Editor trying to edit others: "אתה יכול לערוך רק פריטים שיצרת"
  - Manager trying to manage users: "רק מנהלים יכולים להזמין משתמשים"
- [ ] Test all role scenarios
- [ ] Implement role badge in UI (Admin tag, etc.)
- [ ] Show "Upgrade needed" message when appropriate

---

## 📚 API Reference

### Get User Role

```http
GET /get-company
Authorization: Bearer <CLERK_JWT>
```

**Response:**
```json
{
  "success": true,
  "companyExists": true,
  "company": { ... },
  "userInfo": {
    "role": "editor",
    "isAdmin": false
  }
}
```

---

### Common Error Responses

#### **403 - Forbidden (No Permission)**
```json
{
  "error": true,
  "message": "You do not have permission to create expenses. Contact an admin to upgrade your role.",
  "timestamp": "2025-12-24T10:30:00.000Z"
}
```

#### **403 - Ownership Check Failed**
```json
{
  "error": true,
  "message": "You can only edit expenses you created",
  "timestamp": "2025-12-24T10:30:00.000Z"
}
```

#### **403 - Admin Only**
```json
{
  "error": true,
  "message": "Admin privileges required to invite users",
  "timestamp": "2025-12-24T10:30:00.000Z"
}
```

---

## 🔗 Files Reference

- **Role & Permission Definitions:** `/Users/maordaniel/Ofek/lambda/shared/company-utils.js`
- **Lambda Authorizer (adds role to context):** `/Users/maordaniel/Ofek/lambda/clerk-authorizer.js`
- **Example: Expenses with ownership checks:** `/Users/maordaniel/Ofek/lambda/companyExpenses.js`
- **Example: Admin-only user invitation:** `/Users/maordaniel/Ofek/lambda/inviteUser.js`

---

*RBAC Guide v1.0 - 2025-12-24*
