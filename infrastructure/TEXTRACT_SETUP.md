# AWS Textract Setup Documentation

## Overview

This document describes the AWS Textract configuration for the Construction Expenses Smart OCR feature. Textract is used to extract structured data from expense receipts and invoices using the AnalyzeExpense API.

**Status**: ✅ Phase 1 Complete - Infrastructure Ready
**Date**: December 3, 2025
**Version**: 1.0.0

---

## Architecture

### Service Configuration

- **Service**: AWS Textract
- **Region**: us-east-1
- **API**: AnalyzeExpense (synchronous)
- **Mode**: Bytes (direct image processing, no S3 required)
- **Max Document Size**: 5 MB
- **Supported Formats**: PNG, JPEG, PDF, TIFF

### IAM Policy

**Policy Name**: `ConstructionExpensesTextractPolicy`

**Policy ARN**: `arn:aws:iam::702358134603:policy/ConstructionExpensesTextractPolicy`

**Permissions**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "TextractAnalyzeExpenseAccess",
      "Effect": "Allow",
      "Action": [
        "textract:AnalyzeExpense"
      ],
      "Resource": "*"
    }
  ]
}
```

**Security Notes**:
- ✅ Least privilege principle applied
- ✅ Only AnalyzeExpense permission granted
- ❌ No S3 permissions (Bytes mode only)
- ❌ No async operations (StartExpenseAnalysis) permissions
- ❌ No other Textract APIs allowed

### Lambda Integration

**Execution Role**: Found via CloudFormation stack `construction-expenses-production`

**Role Attachment**: Policy attached to Lambda execution role for all expense functions

**Environment Variables**:
```bash
TEXTRACT_REGION=us-east-1
TEXTRACT_ENABLED=true
```

---

## Cost Analysis

### Pricing Structure

| Service | Cost per Page | Expected Usage | Monthly Cost |
|---------|--------------|----------------|--------------|
| AnalyzeExpense | $0.017 | 3,000 receipts | $51.00 |

**Annual Projection**: ~$612

**Cost Optimization Tips**:
1. Cache results to avoid re-processing
2. Implement client-side validation before OCR
3. Use image compression to reduce API calls
4. Monitor usage via AWS Cost Explorer
5. Set up billing alerts at $50, $75, $100 thresholds

### Free Tier

- First 3 months: 1,000 pages free per month
- After free tier: Full pricing applies

---

## Deployment

### Prerequisites

1. AWS CLI configured with appropriate credentials
2. IAM permissions to create/attach policies
3. Access to Lambda execution role
4. Node.js 18+ for testing scripts

### Installation Steps

#### Step 1: Deploy IAM Policy

```bash
cd /Users/maordaniel/Ofek
./scripts/setup-textract-iam.sh
```

**Expected Output**:
```
======================================
AWS Textract IAM Setup
======================================

Step 1: Verifying AWS CLI access...
✓ AWS Account: 702358134603

Step 2: Checking Textract availability in us-east-1...
✓ Textract CLI is available

Step 3: Validating policy file...
✓ Policy file found

Step 4: Creating/updating IAM policy...
✓ Policy created: arn:aws:iam::702358134603:policy/ConstructionExpensesTextractPolicy

Step 5: Finding Lambda execution role...
✓ Found Lambda execution role: construction-expenses-lambda-execution-role

Step 6: Attaching policy to role...
✓ Policy attached to role

Step 7: Verifying policy attachment...
✓ Policy attachment verified

======================================
Setup Complete!
======================================
```

#### Step 2: Verify Installation

```bash
node scripts/test-textract-access.js
```

**Expected Output**:
```
=====================================
  AWS Textract Access Test
=====================================

[Step 1] Testing AWS Credentials
✓ AWS Account: 702358134603
✓ User ARN: arn:aws:iam::702358134603:user/...

[Step 2] Testing Textract API Access
✓ Generated test image data (68 bytes)
Using region: us-east-1

Calling Textract AnalyzeExpense API...
✓ Textract API call succeeded (1234ms)

[Step 3] Analyzing Textract Response
✓ Response structure is valid

[Step 4] Verifying IAM Permissions
✓ Found Textract policy: ConstructionExpensesTextractPolicy

[Step 5] Generating Test Report

=====================================
    TEXTRACT ACCESS TEST REPORT
=====================================

✓ All tests passed! Textract access is configured correctly.
```

---

## Testing

### Manual Testing

#### Test 1: API Access
```bash
node scripts/test-textract-access.js
```

Expected: Exit code 0, success message

#### Test 2: IAM Permissions
```bash
aws iam list-attached-role-policies \
  --role-name construction-expenses-lambda-execution-role \
  | grep Textract
```

Expected: `ConstructionExpensesTextractPolicy` in output

#### Test 3: Direct API Call
```bash
aws textract analyze-expense \
  --region us-east-1 \
  --document '{"Bytes":"'$(base64 < sample-receipt.png)'"}'
```

Expected: JSON response with ExpenseDocuments array

### CloudWatch Logs

**Log Group**: `/aws/lambda/construction-expenses-*`

**Search for Textract Calls**:
```bash
aws logs filter-log-events \
  --log-group-name /aws/lambda/construction-expenses-production-ocrExpense \
  --filter-pattern "Textract" \
  --start-time $(date -u -d '1 hour ago' +%s)000
```

**Expected Log Entries**:
- `Calling Textract AnalyzeExpense...`
- `Textract processing completed in XXXms`
- `Extracted X fields from receipt`

---

## Troubleshooting

### Common Issues

#### Issue 1: AccessDeniedException

**Symptom**:
```
Error: User: arn:aws:sts::702358134603:assumed-role/... is not authorized to perform: textract:AnalyzeExpense
```

**Solution**:
1. Verify policy is attached:
   ```bash
   aws iam list-attached-role-policies --role-name construction-expenses-lambda-execution-role
   ```

2. Check policy document:
   ```bash
   aws iam get-policy-version \
     --policy-arn arn:aws:iam::702358134603:policy/ConstructionExpensesTextractPolicy \
     --version-id v1
   ```

3. Re-run setup script:
   ```bash
   ./scripts/setup-textract-iam.sh
   ```

#### Issue 2: InvalidParameterException

**Symptom**:
```
Error: Request has Invalid Parameters
```

**Causes**:
- Image data is corrupted or invalid
- Image size exceeds 5 MB
- Unsupported image format

**Solution**:
1. Validate image format (PNG, JPEG, PDF, TIFF only)
2. Check image size: `ls -lh receipt.png`
3. Test with known-good receipt image
4. Verify base64 encoding is correct

#### Issue 3: ProvisionedThroughputExceededException

**Symptom**:
```
Error: The request was denied due to request throttling
```

**Solution**:
1. Implement exponential backoff in Lambda function
2. Add retry logic with jitter
3. Request limit increase via AWS Support
4. Consider batching if processing multiple receipts

#### Issue 4: High Costs

**Symptom**: Unexpected AWS bill for Textract

**Solution**:
1. Check usage:
   ```bash
   aws ce get-cost-and-usage \
     --time-period Start=2025-12-01,End=2025-12-31 \
     --granularity MONTHLY \
     --metrics BlendedCost \
     --group-by Type=DIMENSION,Key=SERVICE \
     --filter file://<(echo '{"Dimensions":{"Key":"SERVICE","Values":["Amazon Textract"]}}')
   ```

2. Review CloudWatch metrics for API call frequency
3. Check for retry loops or duplicate processing
4. Implement caching to avoid re-processing same receipts
5. Add budget alerts

### Debug Commands

#### Check Role Permissions
```bash
aws iam get-role \
  --role-name construction-expenses-lambda-execution-role \
  | jq '.Role.AssumeRolePolicyDocument'
```

#### List All Attached Policies
```bash
aws iam list-attached-role-policies \
  --role-name construction-expenses-lambda-execution-role
```

#### Get Policy Details
```bash
aws iam get-policy \
  --policy-arn arn:aws:iam::702358134603:policy/ConstructionExpensesTextractPolicy
```

#### Test Textract Service Health
```bash
aws textract help | head -10
```

---

## Rollback Procedure

### Complete Rollback

If you need to remove Textract integration entirely:

#### Step 1: Detach Policy from Role
```bash
aws iam detach-role-policy \
  --role-name construction-expenses-lambda-execution-role \
  --policy-arn arn:aws:iam::702358134603:policy/ConstructionExpensesTextractPolicy
```

#### Step 2: Delete Policy
```bash
aws iam delete-policy \
  --policy-arn arn:aws:iam::702358134603:policy/ConstructionExpensesTextractPolicy
```

#### Step 3: Remove Environment Variables

Edit `.env.production` and remove:
```bash
TEXTRACT_REGION=us-east-1
TEXTRACT_ENABLED=true
```

#### Step 4: Verify Removal
```bash
aws iam list-attached-role-policies \
  --role-name construction-expenses-lambda-execution-role \
  | grep -i textract
```

Expected: No output

### Partial Rollback (Keep Policy, Disable Feature)

To disable Textract without removing IAM setup:

1. Update `.env.production`:
   ```bash
   TEXTRACT_ENABLED=false
   ```

2. Redeploy Lambda functions with updated environment

---

## Monitoring

### CloudWatch Metrics

**Namespace**: `AWS/Textract`

**Key Metrics**:
- `UserErrorCount` - Client errors (4xx)
- `SystemErrorCount` - Server errors (5xx)
- `SuccessfulRequestCount` - Successful API calls
- `ThrottledCount` - Throttled requests

**Custom Metrics** (to implement in Lambda):
- `OCRProcessingTime` - Time to process receipt
- `OCRFieldsExtracted` - Number of fields extracted
- `OCRConfidenceScore` - Average confidence of extractions

### CloudWatch Alarms

**Recommended Alarms**:

1. **High Error Rate**:
   ```bash
   aws cloudwatch put-metric-alarm \
     --alarm-name textract-high-error-rate \
     --metric-name UserErrorCount \
     --namespace AWS/Textract \
     --statistic Sum \
     --period 300 \
     --threshold 10 \
     --comparison-operator GreaterThanThreshold
   ```

2. **Cost Alert** (via Budgets):
   ```bash
   aws budgets create-budget \
     --account-id 702358134603 \
     --budget file://textract-budget.json
   ```

### Log Insights Queries

**Query 1: Success Rate**
```
fields @timestamp, @message
| filter @message like /Textract/
| stats count(*) as total, count(@message like /succeeded/) as success
| stats success / total * 100 as success_rate
```

**Query 2: Average Processing Time**
```
fields @timestamp, @message
| filter @message like /Textract processing completed/
| parse @message /completed in (?<duration>\d+)ms/
| stats avg(duration) as avg_ms, max(duration) as max_ms, min(duration) as min_ms
```

---

## Security Considerations

### Least Privilege Compliance

✅ **Only required permission granted**: `textract:AnalyzeExpense`
✅ **No S3 access**: Bytes mode eliminates S3 dependency
✅ **No async permissions**: Synchronous processing only
✅ **Resource scoped**: Limited to Textract service

### Data Privacy

⚠️ **PII in Receipts**: Receipts may contain:
- Vendor names and addresses
- Credit card numbers (last 4 digits)
- Employee names
- Project details

**Recommendations**:
1. Enable CloudTrail logging for audit
2. Implement data retention policies
3. Encrypt processed data at rest
4. Redact sensitive fields in logs
5. Review Textract data handling: https://aws.amazon.com/textract/compliance/

### Compliance

**AWS Textract Compliance Certifications**:
- SOC 1, 2, 3
- ISO 27001, 27017, 27018
- PCI DSS Level 1
- HIPAA eligible
- GDPR compliant

**Data Residency**: All processing in us-east-1 (Virginia)

---

## Next Steps

### Phase 2: Lambda Implementation

1. Create `lambda/ocrExpense.js` function
2. Implement AnalyzeExpense API call with error handling
3. Parse Textract response into structured expense data
4. Add retry logic with exponential backoff
5. Implement confidence score filtering
6. Add CloudWatch custom metrics

### Phase 3: Integration

1. Update expense creation flow to use OCR
2. Add user review interface for extracted data
3. Implement field validation and correction
4. Add batch processing for multiple receipts
5. Create audit trail for OCR results

### Phase 4: Optimization

1. Implement caching strategy (DynamoDB)
2. Add image preprocessing (compression, rotation)
3. Fine-tune confidence thresholds
4. Optimize cost with smart batching
5. Add A/B testing for OCR vs manual entry

---

## References

### AWS Documentation

- [Textract AnalyzeExpense API](https://docs.aws.amazon.com/textract/latest/dg/API_AnalyzeExpense.html)
- [Textract Best Practices](https://docs.aws.amazon.com/textract/latest/dg/best-practices.html)
- [Textract Pricing](https://aws.amazon.com/textract/pricing/)
- [IAM Policy Examples](https://docs.aws.amazon.com/textract/latest/dg/security_iam_id-based-policy-examples.html)

### Internal Documentation

- `/Users/maordaniel/Ofek/infrastructure/textract-policy.json` - IAM policy definition
- `/Users/maordaniel/Ofek/scripts/setup-textract-iam.sh` - Deployment script
- `/Users/maordaniel/Ofek/scripts/test-textract-access.js` - Test script
- `/Users/maordaniel/Ofek/.env.production` - Environment configuration

---

## Change Log

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2025-12-03 | 1.0.0 | Initial setup - Phase 1 complete | Cloud Architect |

---

## Support

For issues or questions:

1. Check troubleshooting section above
2. Review CloudWatch logs for error details
3. Run diagnostic: `node scripts/test-textract-access.js`
4. Check AWS Service Health Dashboard
5. Contact team lead for escalation

---

**Document Status**: ✅ Complete and Production Ready
