# RBAC System - Quick Reference

**Role-Based Access Control Cheat Sheet**

---

## 👥 Roles

| Role | Hebrew | Description |
|------|--------|-------------|
| `admin` | מנהל | Full control - everything |
| `manager` | מנהל תפעול | All operations (no users/billing) |
| `editor` | עורך | Create & edit own items only |
| `viewer` | צופה | Read-only access |

---

## 🔐 Quick Permission Check

### Check User Role

```javascript
// GET /get-company returns user role
const response = await fetch(API_URL + '/get-company', {
  headers: { 'Authorization': `Bearer ${token}` }
});

const data = await response.json();
console.log(data.userInfo.role);  // "editor"
console.log(data.userInfo.isAdmin);  // false
```

---

## 📊 Permission Matrix

| Action | Admin | Manager | Editor | Viewer |
|--------|:-----:|:-------:|:------:|:------:|
| **Users** |
| Invite users | ✅ | ❌ | ❌ | ❌ |
| Remove users | ✅ | ❌ | ❌ | ❌ |
| View users | ✅ | ✅ | ❌ | ❌ |
| **Billing** |
| Change subscription | ✅ | ❌ | ❌ | ❌ |
| **Expenses** |
| Create | ✅ | ✅ | ✅ | ❌ |
| Edit all | ✅ | ✅ | ❌ | ❌ |
| Edit own | ✅ | ✅ | ✅ | ❌ |
| Delete | ✅ | ✅ | ❌ | ❌ |
| **Projects** |
| Create | ✅ | ✅ | ✅ | ❌ |
| Edit all | ✅ | ✅ | ❌ | ❌ |
| Edit own | ✅ | ✅ | ✅ | ❌ |
| Delete | ✅ | ✅ | ❌ | ❌ |
| **Reports** |
| View | ✅ | ✅ | ✅ | ✅ |
| Export | ✅ | ✅ | ❌ | ❌ |

---

## 💻 React Native Implementation

### Store User Role

```javascript
import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-expo';

function useUserRole() {
  const [role, setRole] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const { getToken } = useAuth();

  useEffect(() => {
    async function fetchRole() {
      const token = await getToken();
      const response = await fetch(`${API_URL}/get-company`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      setRole(data.userInfo.role);
      setIsAdmin(data.userInfo.isAdmin);
    }
    fetchRole();
  }, []);

  return { role, isAdmin };
}
```

---

### Conditional UI

```javascript
function ExpenseScreen() {
  const { role } = useUserRole();

  return (
    <View>
      {/* Everyone can view */}
      <ExpenseList />

      {/* Editors, managers, admins can create */}
      {['editor', 'manager', 'admin'].includes(role) && (
        <Button title="הוסף הוצאה" onPress={createExpense} />
      )}

      {/* Only admins and managers can delete */}
      {['admin', 'manager'].includes(role) && (
        <Button title="מחק" onPress={deleteExpense} color="red" />
      )}

      {/* Only admins */}
      {role === 'admin' && (
        <Button title="הזמן משתמש" onPress={inviteUser} />
      )}
    </View>
  );
}
```

---

## 🔄 RBAC Flow

```
1. User logs in (Clerk)
   ↓
2. JWT token issued (no role yet)
   ↓
3. API request with JWT
   ↓
4. Lambda Authorizer runs:
   - Validates JWT
   - Looks up user's role in DynamoDB
   - Adds role to request context
   ↓
5. Lambda function checks permission:
   - getUserPermissions(role)
   - hasPermission(role, permission)
   ↓
6. Action allowed or denied (403)
```

---

## ❌ Error Handling

### Handle Permission Errors

```javascript
async function createExpense(data) {
  try {
    const response = await fetch(`${API_URL}/expenses`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${await getToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    if (response.status === 403) {
      const error = await response.json();

      // Show Hebrew error message
      Alert.alert('אין הרשאה', error.message);
      return;
    }

    const result = await response.json();
    return result;

  } catch (error) {
    Alert.alert('שגיאה', error.message);
  }
}
```

---

## 📝 Common Error Messages

| Status | Error | Hebrew Message |
|--------|-------|----------------|
| 403 | No CREATE permission | אין לך הרשאה ליצור הוצאות |
| 403 | No EDIT_ALL permission | אין לך הרשאה לערוך הוצאות אחרות |
| 403 | No DELETE permission | אין לך הרשאה למחוק הוצאות |
| 403 | Not own item (editor) | אתה יכול לערוך רק פריטים שיצרת |
| 403 | Not admin | רק מנהלים יכולים לבצע פעולה זו |

---

## 🎯 Permission List

### Admin Permissions (All)
```
✅ manage_billing
✅ manage_company
✅ invite_users
✅ manage_users
✅ create_expenses
✅ edit_all_expenses
✅ delete_expenses
✅ export_data
... (everything)
```

### Manager Permissions
```
✅ create_expenses
✅ edit_all_expenses
✅ delete_expenses
✅ view_users
✅ export_data
❌ invite_users
❌ manage_billing
```

### Editor Permissions
```
✅ create_expenses
✅ edit_own_expenses  ← Only own
❌ edit_all_expenses
❌ delete_expenses
❌ export_data
```

### Viewer Permissions
```
✅ view_reports
❌ create_expenses
❌ edit_expenses
❌ delete_expenses
❌ export_data
```

---

## 🔍 Ownership Check

```javascript
// For "EDIT_OWN" permissions
// Backend checks: expense.userId === currentUserId

if (!hasPermission(role, 'edit_all_expenses')) {
  // User has only "edit_own_expenses"
  if (expense.userId !== currentUserId) {
    return 403;  // Not your expense
  }
}
```

---

## 🧪 Test Scenarios

### Test Users
```javascript
const testUsers = [
  { email: "admin@test.com", role: "admin" },
  { email: "manager@test.com", role: "manager" },
  { email: "editor@test.com", role: "editor" },
  { email: "viewer@test.com", role: "viewer" }
];
```

### Test Cases
- ✅ Admin can delete expense
- ✅ Manager can delete expense
- ❌ Editor cannot delete expense → 403
- ❌ Viewer cannot create expense → 403
- ❌ Editor cannot edit other's expense → 403
- ❌ Manager cannot invite users → 403

---

## 📞 Support

**Full Guide:** `/Users/maordaniel/Ofek/MOBILE_RBAC_SYSTEM_GUIDE.md`

**Files:**
- Roles & permissions: `/lambda/shared/company-utils.js`
- Authorizer: `/lambda/clerk-authorizer.js`
- Example: `/lambda/companyExpenses.js`

---

*Quick Reference v1.0 - 2025-12-24*
