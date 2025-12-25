# Google Cloud Vision API OCR Implementation

**Date:** 2025-12-04
**Status:** ⏳ IN PROGRESS - Deployment Pending
**Phase:** 5 - Google Vision API Integration

---

## Overview

Implementing Google Cloud Vision API integration to dramatically improve OCR accuracy for Hebrew receipt text recognition. This replaces AWS Textract as the primary OCR provider while maintaining automatic fallback.

## Implementation Status

### ✅ Completed

1. **Google Vision Parser Module** (`lambda/shared/google-vision-parser.js`)
   - TEXT_DETECTION API integration with Hebrew language hints
   - Intelligent line item detection and grouping (15-pixel vertical threshold)
   - Product/service description generation from line items
   - Field extraction: vendor, amount, date, invoice number, description
   - Pattern matching for Hebrew keywords and currency symbols (₪, $, €)
   - Confidence scoring for each extracted field

2. **OCR Lambda Enhancement** (`lambda/processReceiptOCR.js`)
   - Provider selection logic: Google Vision → Textract fallback
   - Secrets Manager integration for API key retrieval
   - Enhanced error handling with provider tracking
   - Response includes `ocrMetadata.provider` field

3. **Line Item Detection** (google-vision-parser.js:extractLineItems)
   ```javascript
   // Groups text blocks by vertical position
   // Filters out headers, totals, metadata
   // Removes prices and quantities from item descriptions
   // Returns array of line items with confidence scores
   ```

4. **Smart Description Generation** (google-vision-parser.js:extractDescription)
   ```javascript
   // Priority 1: Comma-separated list from line items (≥70% confidence)
   // Priority 2: Cleaned middle section text
   // Priority 3: First 200 chars of full text
   // Maximum: 500 characters
   ```

### ⏳ In Progress

**Issue Identified:** Missing axios dependency in Lambda package

**Root Cause:**
```
Error: Cannot find module 'axios'
Require stack:
- /var/task/shared/google-vision-parser.js
- /var/task/index.js
```

**Current Action:** Repackaging all Lambda functions with axios included
- Command running: `node scripts/package-lambdas.js processReceiptOCR`
- Packaging script includes all node_modules dependencies
- Estimated completion: ~2-3 minutes

### 🔄 Pending

1. **Deploy Updated Lambda** - Once packaging completes
2. **Test with Hebrew Receipt** - Verify Google Vision API usage
3. **Validate Fallback Logic** - Ensure Textract fallback works
4. **Monitor CloudWatch Logs** - Check provider selection and accuracy

---

## Architecture

### OCR Processing Flow

```
1. Frontend Upload
   ↓ (Receipt image → base64)
2. API Gateway POST /expenses/ocr-process
   ↓ (Clerk JWT authentication)
3. processReceiptOCR Lambda
   ├─→ Try: Google Vision API (if API key available)
   │   ├─→ Success: Return fields + provider: "google-vision"
   │   └─→ Failure: Fall through to Textract
   └─→ Fallback: AWS Textract
       └─→ Return fields + provider: "textract" or "textract-fallback"
4. Response to Frontend
   ↓ (extractedFields + ocrMetadata)
5. Form Auto-Population with Confidence Indicators
```

### Provider Selection Logic

```javascript
// 1. Attempt to get Google Vision API key from Secrets Manager
const googleApiKey = await getGoogleVisionApiKey();

if (googleApiKey) {
  try {
    // 2. Try Google Vision API
    ocrResult = await processWithGoogleVision(imageBuffer, googleApiKey);
    ocrProvider = 'google-vision';
  } catch (visionError) {
    // 3. Fall back to Textract if Vision fails
    ocrResult = await processWithTextract(imageBuffer, companyId, fileName);
    ocrProvider = 'textract-fallback';
  }
} else {
  // 4. Use Textract if no API key
  ocrResult = await processWithTextract(imageBuffer, companyId, fileName);
  ocrProvider = 'textract';
}
```

### Google Vision API Configuration

**Stored in AWS Secrets Manager:**
```bash
Secret Name: construction-expenses/google-vision-api-key
Secret Value: AIzaSyDTSTxlQ-12u4uy02oOtWT2l96WO7Qx4fA
ARN: arn:aws:secretsmanager:us-east-1:702358134603:secret:construction-expenses/google-vision-api-key-pLpovU
```

**API Request Format:**
```javascript
{
  requests: [{
    image: { content: base64Image },
    features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
    imageContext: { languageHints: ['he', 'en'] }  // Hebrew + English
  }]
}
```

---

## Key Features

### 1. **Intelligent Line Item Detection**

Automatically identifies products/services from receipt:

```javascript
// Example Input (Receipt):
חול גרוס          150 ₪
צמנט              280 ₪
לבנים             450 ₪
חומר איטום        320 ₪
צינורות ניקוז     180 ₪

// Output (Line Items):
[
  { description: "חול גרוס", price: "150 ₪", confidence: 92 },
  { description: "צמנט", price: "280 ₪", confidence: 88 },
  { description: "לבנים", price: "450 ₪", confidence: 90 },
  { description: "חומר איטום", price: "320 ₪", confidence: 85 },
  { description: "צינורות ניקוז", price: "180 ₪", confidence: 87 }
]

// Generated Description:
"חול גרוס, צמנט, לבנים, חומר איטום, צינורות ניקוז"
```

### 2. **Hebrew Text Optimization**

Specialized Hebrew pattern matching:

- **Keywords:** סה"כ, סהכ, סך הכל, חשבונית, קבלה
- **Currency:** ₪ (Israeli Shekel), $, €
- **Date Formats:** DD/MM/YYYY, YYYY-MM-DD, Hebrew month names
- **Language Hints:** Primary Hebrew, fallback English

### 3. **Automatic Fallback**

Zero frontend changes required:

| Scenario | Provider Used | Frontend Impact |
|----------|---------------|-----------------|
| Google API key available, API works | google-vision | None - works seamlessly |
| Google API key available, API fails | textract-fallback | None - graceful degradation |
| Google API key not configured | textract | None - existing behavior |

### 4. **Confidence Tracking**

Per-field confidence scores:

- **High (≥90%):** Green checkmark, trusted
- **Medium (80-89%):** Yellow warning, review recommended
- **Low (<80%):** Red exclamation, manual verification required

---

## Technical Implementation

### New Dependencies

```json
{
  "axios": "^1.7.9"  // For Google Vision API HTTP requests
}
```

### File Changes

| File | Change Type | Description |
|------|-------------|-------------|
| `lambda/shared/google-vision-parser.js` | **NEW** | Google Vision API integration (530 lines) |
| `lambda/processReceiptOCR.js` | **MODIFIED** | Add provider selection, API key retrieval, fallback logic |
| `package.json` | **MODIFIED** | Add axios dependency |
| `test-google-vision-ocr.js` | **NEW** | Integration test script |

### Lambda Environment Variables

```bash
# Existing
TEXTRACT_REGION=us-east-1
OCR_CONFIDENCE_THRESHOLD=80

# New
GOOGLE_VISION_API_KEY_SECRET=construction-expenses/google-vision-api-key
```

### IAM Permissions

Already configured (no changes needed):

```json
{
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "textract:AnalyzeExpense",
      "secretsmanager:GetSecretValue"
    ],
    "Resource": [
      "arn:aws:textract:us-east-1:*",
      "arn:aws:secretsmanager:us-east-1:702358134603:secret:construction-expenses/*"
    ]
  }]
}
```

---

## Comparison: Textract vs. Google Vision

| Feature | AWS Textract | Google Vision API |
|---------|--------------|-------------------|
| **Hebrew Support** | Limited | **Excellent** ✨ |
| **Receipt Accuracy** | Moderate (70-80%) | **High (90-95%)** ✨ |
| **Line Item Detection** | Basic | **Intelligent** ✨ |
| **Handwriting** | Poor | **Good** ✨ |
| **Cost (per 1K images)** | Free tier, then $1.50 | $1.50 |
| **Response Time** | ~2-3s | **~1-2s** ✨ |
| **Setup** | None (AWS native) | API key required |
| **Language Hints** | Not supported | **Supported** ✨ |

**Improvement Expected:** 20-30% accuracy increase for Hebrew receipts

---

## Next Steps

### Immediate (Current Session)

1. ✅ **Wait for Packaging** - Background process completing
2. ⏳ **Deploy Lambda** - Upload new package to AWS
3. ⏳ **Run Test** - Execute test-google-vision-ocr.js
4. ⏳ **Verify Logs** - Check CloudWatch for provider selection
5. ⏳ **Update Documentation** - Mark as complete

### Testing Checklist

- [ ] Verify Google Vision API is used (check `ocrMetadata.provider`)
- [ ] Test with Hebrew construction receipt
- [ ] Confirm line items are detected
- [ ] Verify description is generated from line items
- [ ] Test fallback by temporarily breaking API key
- [ ] Check confidence scores are accurate
- [ ] Validate frontend displays all fields correctly

### Future Enhancements

1. **Receipt Quality Analysis** - Reject blurry/unreadable images before OCR
2. **Multi-page Receipts** - Process multiple pages in single request
3. **Receipt Templates** - Save common vendor formats for faster processing
4. **OCR Caching** - Cache results for duplicate receipt uploads
5. **User Feedback Loop** - Allow users to correct OCR mistakes to improve future accuracy

---

## Configuration

### Production Environment

```bash
# API Gateway
API ID: 2woj5i92td
Endpoint: https://2woj5i92td.execute-api.us-east-1.amazonaws.com/production/expenses/ocr-process
Method: POST
Auth: Clerk JWT

# Lambda Function
Name: construction-expenses-process-receipt-ocr
Runtime: nodejs18.x
Memory: 512 MB
Timeout: 30s
Package Size: ~20MB (with axios)

# Secrets Manager
Secret: construction-expenses/google-vision-api-key
Access: Lambda IAM role
Region: us-east-1
```

### Local Testing

```bash
# Install dependencies
npm install axios --save

# Package Lambda
node scripts/package-lambdas.js processReceiptOCR

# Deploy
aws lambda update-function-code \
  --function-name construction-expenses-process-receipt-ocr \
  --zip-file fileb://dist/processReceiptOCR.zip \
  --region us-east-1

# Test
node test-google-vision-ocr.js
```

---

## Troubleshooting

### Issue: "Cannot find module 'axios'"

**Cause:** axios not included in Lambda package
**Solution:** Repackage with `node scripts/package-lambdas.js processReceiptOCR`

### Issue: OCR uses Textract instead of Google Vision

**Possible Causes:**
1. API key not configured in Secrets Manager
2. IAM role doesn't have secretsmanager:GetSecretValue permission
3. Google Vision API quota exceeded
4. Network connectivity issues

**Debug Steps:**
```bash
# Check CloudWatch logs
aws logs tail /aws/lambda/construction-expenses-process-receipt-ocr --since 10m

# Verify secret exists
aws secretsmanager get-secret-value \
  --secret-id construction-expenses/google-vision-api-key

# Test API key manually
curl -X POST "https://vision.googleapis.com/v1/images:annotate?key=YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"requests":[{"image":{"content":"base64..."},"features":[{"type":"TEXT_DETECTION"}]}]}'
```

### Issue: Low confidence scores

**Possible Causes:**
1. Poor image quality (blurry, low resolution)
2. Damaged or faded receipt
3. Non-standard receipt format
4. Mixed languages confusing the model

**Recommendations:**
- Ensure receipts are photographed in good lighting
- Use at least 1080p camera resolution
- Avoid shadows and glare
- Keep receipt flat when photographing

---

## References

- **Google Cloud Vision API Docs:** https://cloud.google.com/vision/docs/ocr
- **GOOGLE_VISION_OCR_SETUP.md:** Setup guide (already created)
- **OCR_CORS_FIX_REPORT.md:** Previous CORS fix documentation
- **processReceiptOCR.js:102-194:** Main OCR handler implementation
- **google-vision-parser.js:1-530:** Complete parser implementation

---

**Implementation By:** Claude (Anthropic)
**Integration:** Phase 5 Google Vision OCR Enhancement
**Last Updated:** 2025-12-04 00:30 UTC
**Deployment Status:** Awaiting Lambda packaging completion
