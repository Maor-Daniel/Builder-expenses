# Test Data Cleanup Instructions

## Manual Cleanup Required

Due to the critical bugs found during testing (specifically the foreign key validation bypass), some test expenses reference entities that may cause issues if deleted via API. Manual cleanup through the UI is recommended.

## Test Expenses to Delete

Navigate to https://builder-expenses.com/app.html and delete the following expenses by clicking the "מחק" (Delete) button:

### QA Test Expenses (Filter by "QA Test Project" or "QA Test Contractor")

1. **TC-ADD-001: Valid expense test** - ₪15,000 (15.1.2025)
2. **Invalid Date** - ₪1,000 (Shows as "Invalid Date" - BUG #1 evidence)
3. **No Project** - ₪1,000 (15.1.2025) - Has contractor but no project (BUG #2 evidence)
4. **Duplicate test - first** - ₪5,000 (20.1.2025)
5. **Duplicate test - second (should fail)** - ₪3,000 (21.1.2025) - (BUG #3 evidence)
6. **תשלום עבור עבודות שלד - קומה ראשונה** - ₪8,500 (22.1.2025) - Hebrew test
7. Three expenses with ₪1,000 each (23.1.2025) - Payment method tests
8. **Large amount** - ₪9,999,999 (24.1.2025)
9. **Maximum amount** - ₪100,000,000 (24.1.2025)
10. **Over maximum** - ₪100,000,001 (24.1.2025) - (BUG #5 evidence)
11. **Small amount** - ₪0.01 (24.1.2025)

**Total:** 13 test expenses

## Test Project and Contractor

After deleting all test expenses, delete:

1. Navigate to **פרויקטים** (Projects) tab
2. Find and delete **"QA Test Project"**

3. Navigate to **קבלנים** (Contractors) tab
4. Find and delete **"QA Test Contractor"**

## Alternative: API Cleanup Script

If preferred, use the following curl commands (requires fresh JWT token):

```bash
# Get fresh token
JWT_TOKEN="[GET_FROM_BROWSER]"

# Filter by project to get expense IDs
curl -X GET "https://2woj5i92td.execute-api.us-east-1.amazonaws.com/prod/expenses?projectId=proj_1764514539895_zs3ufd0qs" \
  -H "Authorization: Bearer $JWT_TOKEN"

# Delete each expense (repeat for each expenseId)
curl -X DELETE "https://2woj5i92td.execute-api.us-east-1.amazonaws.com/prod/expenses/{expenseId}" \
  -H "Authorization: Bearer $JWT_TOKEN"

# Delete project
curl -X DELETE "https://2woj5i92td.execute-api.us-east-1.amazonaws.com/prod/projects/proj_1764514539895_zs3ufd0qs" \
  -H "Authorization: Bearer $JWT_TOKEN"

# Delete contractor
curl -X DELETE "https://2woj5i92td.execute-api.us-east-1.amazonaws.com/prod/contractors/contr_1764514557856_yx8lrwct4" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

## Verification

After cleanup, verify:
- [ ] No expenses with "QA Test Project" or "QA Test Contractor"
- [ ] Project "QA Test Project" removed from Projects list
- [ ] Contractor "QA Test Contractor" removed from Contractors list
- [ ] Total expenses count reduced by 13
- [ ] Total amount reduced by ₪210,022,501.01

## Important Notes

- Some test expenses have invalid data (invalid dates, non-existent projects) due to bugs found
- These may need special handling or database-level cleanup
- Document any cleanup issues encountered
- Keep screenshots of buggy data before deletion for development team reference

---

**Cleanup Status:** Documented - Ready for manual execution
**Date:** 2025-11-30
**QA Engineer:** Claude Code QA Expert Agent
