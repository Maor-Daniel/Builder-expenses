# DynamoDB GSI Optimization - Deployment Checklist

## Pre-Deployment Verification

- [x] GSI 'invoiceNum-index' created on DynamoDB table
- [x] GSI status is ACTIVE
- [x] Code updated in companyExpenses.js
- [x] Lambda function packaged
- [x] Performance tests created
- [x] Documentation complete

## Deployment Steps

### 1. Deploy Updated Lambda Function

```bash
# Upload to AWS Lambda
aws lambda update-function-code \
  --function-name companyExpenses \
  --zip-file fileb://dist/companyExpenses.zip \
  --region us-east-1
```

### 2. Verify Deployment

```bash
# Check function configuration
aws lambda get-function-configuration \
  --function-name companyExpenses \
  --region us-east-1 \
  --query 'LastModified'
```

### 3. Test in Production

**Test duplicate invoice detection:**

1. Create an expense with invoice number "TEST-001"
2. Try to create another expense with same invoice "TEST-001"
3. Should receive 409 error: "Invoice number TEST-001 already exists"
4. Delete test expense

### 4. Monitor CloudWatch Logs

```bash
# Stream logs
aws logs tail /aws/lambda/companyExpenses --follow --region us-east-1
```

Look for:
- ✅ No errors related to invoiceNum-index
- ✅ Successful Query operations
- ✅ Correct 409 responses for duplicates

### 5. Check Performance Metrics

**CloudWatch Metrics to monitor:**

- Lambda Duration: Should remain < 1000ms
- Lambda Errors: Should be 0
- Lambda Throttles: Should be 0
- DynamoDB ConsumedReadCapacity: Should decrease significantly

## Post-Deployment Validation

### Functional Tests

- [ ] Create expense with unique invoice number → Success (201)
- [ ] Create expense with duplicate invoice number → Error (409)
- [ ] Update expense → Success (200)
- [ ] Delete expense → Success (200)
- [ ] List expenses → Success (200)

### Performance Tests

Run from local environment:

```bash
node test-scan-vs-query-performance.js
```

Expected:
- ✅ Query operation completes successfully
- ✅ Consistent response times
- ✅ Fewer records scanned (1 vs ALL)

### Rollback Plan (if needed)

If issues occur:

1. **Revert Lambda Code:**
   ```bash
   # Get previous version ARN
   aws lambda list-versions-by-function \
     --function-name companyExpenses \
     --region us-east-1 \
     --max-items 5
   
   # Promote previous version
   aws lambda update-alias \
     --function-name companyExpenses \
     --name PROD \
     --function-version <PREVIOUS_VERSION> \
     --region us-east-1
   ```

2. **Verify rollback:**
   - Test duplicate detection still works
   - Monitor CloudWatch for errors

3. **Investigate issue:**
   - Check CloudWatch logs
   - Verify GSI status
   - Review error messages

## Success Criteria

All checks must pass:

- ✅ Lambda deploys without errors
- ✅ Duplicate invoice detection works correctly
- ✅ No increase in error rates
- ✅ Response times remain acceptable
- ✅ CloudWatch logs show no GSI-related errors

## Timeline

- **Estimated deployment time:** 5 minutes
- **Monitoring period:** 24 hours post-deployment
- **Full validation:** 1 week

## Contact

For issues or questions:
- Check `/Users/maordaniel/Ofek/DYNAMODB_GSI_OPTIMIZATION.md`
- Review test results in `/Users/maordaniel/Ofek/test-*.js`
- CloudWatch logs: `/aws/lambda/companyExpenses`

---

**Status:** Ready for deployment
**Risk Level:** LOW (backward compatible, GSI already active)
**Rollback Complexity:** EASY (single Lambda version revert)
