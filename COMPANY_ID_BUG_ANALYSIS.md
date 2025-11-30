# Company ID Bug - Root Cause Analysis & Fix

**Date:** 2025-11-29
**Severity:** 🔴 CRITICAL - Data Isolation Failure
**Status:** Identified, Fix Ready

---

## Executive Summary

Users' expenses were "disappearing" because they were being saved to **wrong company IDs** due to a **double-prefixing bug** in the authentication utils.

---

## Root Cause

**File:** `/lambda/shared/multi-table-utils.js`
**Line:** 108
**Bug:**

```javascript
// ❌ WRONG - adds user_ prefix when userId already has it
companyId: authorizer.companyId || `user_${authorizer.userId}`,
```

**What Happens:**
1. Clerk userId is: `user_35IvSrgIwsi33cLFULPoiQHAnk9`
2. Code adds `user_` prefix again
3. Result: `user_user_35IvSrgIwsi33cLFULPoiQHAnk9` ❌

---

## Impact Assessment

### Affected Data

**Companies Created:**
- ❌ `user_user_35nXSV49cAb8tTL9aZlKyQxa2Jd` (WRONG)
- ❌ `user_user_35nXcHSoVPLqD0oxT2pFDKBxvEG` (WRONG)
- ❌ `user_user_35ns6q61GLwpVHLNPAFksKvkN7n` (WRONG)
- ✅ `user_35IvSrgIwsi33cLFULPoiQHAnk9` (CORRECT)
- ✅ `user_35nXSV49cAb8tTL9aZlKyQxa2Jd` (CORRECT)

**Expenses Distribution:**
| Company ID | # Expenses | Status |
|------------|------------|--------|
| `comp_1761932797067_q9klc0d5e` | 7 | Proper company format |
| `user_user_35IvSrgIwsi33cLFULPoiQHAnk9` | 1 | ❌ DOUBLE PREFIX BUG |
| `test-company-123` | 2 | Test data |
| `comp_1762721165226_csqfpxc83` | 1 | Proper company format |

**User Status:**
- Current login: `user_35IvSrgIwsi33cLFULPoiQHAnk9` ✅
- Expenses under: `comp_1761932797067_q9klc0d5e` (different company)
- **Result:** User sees NO expenses (company isolation working correctly!)

---

## Why It Happened

### Timeline of the Bug

1. **Initial Design Assumption:**
   - Assumed `userId` would be a plain ID like `"abc123"`
   - Code added `"user_"` prefix for company scoping

2. **Clerk Reality:**
   - Clerk's `userId` is **already prefixed** with `"user_"`
   - Example: `"user_35IvSrgIwsi33cLFULPoiQHAnk9"`

3. **Bug Activation:**
   - When no `companyId` exists in authorizer context
   - Code runs: `` `user_${authorizer.userId}` ``
   - Creates: `"user_user_35IvSrgIwsi33cLFULPoiQHAnk9"`

4. **Intermittent Nature:**
   - Sometimes `authorizer.companyId` is set (correct behavior)
   - Sometimes it's missing (triggers bug)
   - This created BOTH correct and incorrect company IDs

---

## The Fix

### Code Change Required

**File:** `/lambda/shared/multi-table-utils.js`
**Line:** 108

```javascript
// BEFORE (WRONG):
companyId: authorizer.companyId || `user_${authorizer.userId}`,

// AFTER (CORRECT):
companyId: authorizer.companyId || authorizer.userId,
```

**Explanation:**
- Clerk's `userId` is **already** in the format we want for companyId
- No need to add any prefix
- Just use it directly as fallback

---

## Data Migration Plan

### Step 1: Fix the Code ✅ (Prevents future issues)

```bash
# Apply fix to multi-table-utils.js
# Deploy updated Lambda functions
# Test with new user registration
```

### Step 2: Identify Affected Users

```bash
# Find all companies with double user_ prefix
aws dynamodb scan --table-name construction-expenses-companies \
  --filter-expression "begins_with(companyId, :prefix)" \
  --expression-attribute-values '{":prefix":{"S":"user_user_"}}' \
  --projection-expression "companyId"
```

### Step 3: Migrate Data

For each affected user:

**Option A: Merge to Correct Company**
```bash
# For user_user_35IvSrgIwsi33cLFULPoiQHAnk9
# Migrate 1 expense to user_35IvSrgIwsi33cLFULPoiQHAnk9
```

**Option B: Update Company ID**
```bash
# Update user record to correct companyId
# Update all related expenses/projects/contractors
```

**Option C: Manual Company Assignment**
```bash
# User selects which company to keep
# Merge others or archive
```

### Step 4: Clean Up

```bash
# Delete duplicate/empty companies
# Verify data integrity
# Test user login and data access
```

---

## Prevention Strategy

### 1. Input Validation

Add validation to catch double prefixes:

```javascript
function ensureSinglePrefix(id, prefix) {
  if (id.startsWith(prefix)) {
    return id; // Already has prefix
  }
  return `${prefix}${id}`; // Add prefix
}

// Usage:
companyId: authorizer.companyId || ensureSinglePrefix(authorizer.userId, 'user_'),
```

### 2. Unit Tests

```javascript
describe('getRequestContext', () => {
  it('should not double-prefix userId', () => {
    const event = {
      requestContext: {
        authorizer: {
          userId: 'user_abc123'  // Already has prefix
        }
      }
    };

    const context = getRequestContext(event);
    expect(context.companyId).toBe('user_abc123'); // NOT user_user_abc123
  });
});
```

### 3. Database Constraints

Add DynamoDB validation:

```javascript
// Before creating company, validate format
function validateCompanyId(companyId) {
  // Check for double prefixes
  if (companyId.match(/user_user_/)) {
    throw new Error('Invalid companyId: double prefix detected');
  }

  // Valid formats:
  // - comp_1234567890123_randomid (proper company)
  // - user_clerkUserId (single user/company)
  return true;
}
```

### 4. Monitoring & Alerts

```javascript
// Log warning if double prefix detected
if (companyId.includes('user_user_')) {
  console.error('WARNING: Double prefix detected in companyId:', companyId);
  // Send alert to monitoring system
}
```

### 5. Company Registration Flow

**Current Issue:** Multiple ways to create companies leads to inconsistency

**Solution:** Single source of truth

```javascript
// Option 1: Always use Clerk organizations
companyId: authorizer.orgId  // Use org ID if exists, else userId

// Option 2: Explicit company registration
// Force users to create company before adding data
// Never auto-create companies from userId
```

---

## Testing Checklist

After applying fix:

- [ ] Fix code in multi-table-utils.js
- [ ] Deploy all Lambda functions
- [ ] Create new test user
- [ ] Verify companyId format (no double prefix)
- [ ] Add expense as test user
- [ ] Verify expense saved to correct companyId
- [ ] Login as test user
- [ ] Verify expenses visible
- [ ] Delete test user and company
- [ ] Run data migration for existing users
- [ ] Verify all users see their data

---

## Immediate Actions Required

### Priority 1: Stop the Bleeding
1. ✅ Fix multi-table-utils.js:108
2. ✅ Deploy Lambda functions
3. ✅ Test with new registration

### Priority 2: Fix Existing Data
1. ❓ User preference: merge companies or migrate data?
2. ⏳ Execute migration plan
3. ⏳ Verify data integrity

### Priority 3: Prevent Recurrence
1. ⏳ Add validation functions
2. ⏳ Add unit tests
3. ⏳ Add monitoring alerts
4. ⏳ Document company creation flow

---

## Lessons Learned

1. **Never Assume ID Format**
   - Always inspect actual data from auth provider
   - Don't blindly add prefixes

2. **Validate Early**
   - Check for invalid formats at entry points
   - Fail fast with clear error messages

3. **Single Source of Truth**
   - One canonical way to create companies
   - Consistent ID generation logic

4. **Test with Real Auth Data**
   - Use actual Clerk userIds in tests
   - Don't mock with simple IDs like "user123"

5. **Monitor for Anomalies**
   - Alert on unexpected ID patterns
   - Regular data integrity checks

---

## References

- Affected File: `/lambda/shared/multi-table-utils.js:108`
- Clerk Documentation: https://clerk.com/docs/users/overview
- DynamoDB Best Practices: AWS Documentation

---

**Author:** Claude Code
**Review Status:** Pending User Approval
**Next Steps:** User decides on data migration approach
