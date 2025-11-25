# API Mismatch Analysis

**Date:** 2025-11-11
**Issue:** Frontend forms don't match backend Lambda API contracts
**Status:** ✅ RESOLVED - All forms aligned with backend APIs
**Completion Date:** 2025-11-11

---

## Summary of Mismatches

### 1. Contractors ✅ RESOLVED

**Backend API (`addContractor.js`) expects:**
- `name` (required) - Contractor name
- `phone` (optional) - Phone number

**Frontend form now has:**
- `name` ✅
- `phone` ✅

**Resolution:** Removed specialty, email, hourlyRate, and notes fields
**File:** `src/pages/Contractors.jsx`
**Lines Modified:** 103-325

---

### 2. Works ✅ RESOLVED

**Backend API (`addWork.js`) expects:**
- `projectId` (required)
- `contractorId` (required)
- `WorkName` (required) - Name of the work
- `TotalWorkCost` (required) - Total cost as number
- `description` (optional) - Additional description
- `status` (optional) - Default: 'planned'
- `expenseId` (optional) - Link to expense

**Frontend form now has:**
- `WorkName` ✅ (corrected)
- `projectId` ✅
- `contractorId` ✅
- `TotalWorkCost` ✅ (corrected, direct input)
- `description` ✅ (corrected)
- `status` ✅ (corrected to 'planned', 'in-progress', 'completed')

**Resolution:** Complete file rewrite with correct field names and removed automatic calculation
**File:** `src/pages/Works.jsx`
**Lines Modified:** Full file (1-384)

---

### 3. Projects ✅ RESOLVED

**Backend API (`addProject.js`) expects:**
- `companyId` (from auth context)
- `name` (required)
- `startDate` (required)
- `description` (optional)
- `status` (optional) - Default: 'active'
- `spentAmount` (optional) - Default: 0
- `budget` (optional)
- `assignedTo` (optional array) - Default: [userId]
- `isPublic` (optional boolean) - Default: true

**Frontend form now has:**
- `name` ✅
- `status` ✅
- `budget` ✅
- `startDate` ✅
- `description` ✅

**Resolution:** Removed location and endDate fields
**File:** `src/pages/Projects.jsx`
**Lines Modified:** 30-42, 139-143, 224, 257-377

---

### 4. Expenses ✅ RESOLVED

**Backend API (`addExpense.js`) expects:**
- `projectId` (required) - FK to project
- `contractorId` (required) - FK to contractor
- `invoiceNum` (required) - Invoice number
- `amount` (required) - Expense amount
- `paymentMethod` (required) - Payment method
- `date` (required) - Expense date
- `description` (optional) - Additional notes
- `receiptImage` (optional) - Image data object

**Frontend form now has:**
- `projectId` ✅ (added)
- `contractorId` ✅ (added)
- `invoiceNum` ✅ (added)
- `amount` ✅
- `paymentMethod` ✅ (added, replaces category)
- `date` ✅
- `description` ✅ (corrected from notes)

**Resolution:** Complete file rewrite with all required fields and payment methods dropdown
**File:** `src/pages/Expenses.jsx`
**Lines Modified:** Full file (1-444)

---

## Resolution Summary

### ALL FORMS ALIGNED ✅

1. ✅ **Contractors form** - Removed unsupported fields (specialty, email, hourlyRate, notes)
2. ✅ **Works form** - Complete restructure with correct field names (WorkName, TotalWorkCost)
3. ✅ **Expenses form** - Added required fields (projectId, contractorId, invoiceNum, paymentMethod)
4. ✅ **Projects form** - Removed unsupported fields (location, endDate)

---

## Recommended Changes

### Contractors Form
```javascript
// Keep only these fields:
{
  name: '',      // Required
  phone: ''      // Optional
}
```

### Works Form
```javascript
// Change to these fields:
{
  WorkName: '',           // Required - Name of the work
  projectId: '',          // Required - Dropdown from projects
  contractorId: '',       // Required - Dropdown from contractors
  TotalWorkCost: 0,       // Required - Direct cost input (not calculated!)
  description: '',        // Optional - Additional notes
  status: 'planned',      // Optional - Values: 'planned', 'in-progress', 'completed'
  expenseId: ''           // Optional - Link to expense
}
```

### Projects Form
```javascript
// Remove location and endDate:
{
  name: '',          // Required
  startDate: '',     // Required
  description: '',   // Optional
  status: 'active',  // Optional
  budget: null,      // Optional
  spentAmount: 0,    // Optional (read-only, managed by backend)
  assignedTo: [],    // Optional
  isPublic: true     // Optional
}
```

### Expenses Form
```javascript
// Add missing required fields:
{
  projectId: '',       // Required - Dropdown from projects
  contractorId: '',    // Required - Dropdown from contractors
  invoiceNum: '',      // Required - Text input
  amount: 0,           // Required - Number input
  paymentMethod: '',   // Required - Dropdown (cash, check, transfer, etc.)
  date: '',            // Required - Date picker
  description: '',     // Optional - Textarea
  receiptImage: null   // Optional - File upload
}
```

---

## Next Steps

1. Update frontend forms to match backend API exactly
2. Update service layer to send correct field names
3. Update table column rendering to display correct fields
4. Update validation to match backend requirements
5. Test all CRUD operations
6. Update documentation
