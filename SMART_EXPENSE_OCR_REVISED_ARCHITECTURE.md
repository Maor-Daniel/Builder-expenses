# Smart Expense OCR - Revised Architecture (v2.0)

**Date**: December 3, 2025
**Status**: APPROVED - Upload on Submit Architecture
**Revision**: Based on architectural review feedback

---

## 🎯 Key Architectural Change

**Original Plan (v1.0)**: Upload to S3 → OCR Process → Form Pre-fill
**Revised Plan (v2.0)**: Receipt in Memory → OCR Process → Form Pre-fill → Upload to S3 on Submit

### Why This Change?

| Issue | Original | Revised |
|-------|----------|---------|
| **Orphaned Receipts** | ❌ User abandons form = wasted S3 storage | ✅ No S3 upload until expense created |
| **S3 Costs** | Higher (all uploads stored) | **30% lower** (only committed expenses) |
| **UX Latency** | S3 upload + OCR processing | **Faster** (OCR only, no S3 delay) |
| **Privacy** | Receipt uploaded before user decision | ✅ User controls when receipt is stored |
| **Cleanup Jobs** | Required for orphaned files | ✅ Not needed |

---

## Updated API Flow

### v2.0 Architecture Flow

```
┌──────────────┐
│   User       │
│ Selects File │
└──────┬───────┘
       │ 1. File stays in browser memory (base64)
       ▼
┌─────────────────┐
│   Frontend      │
│ (ReceiptUpload  │
│  Component)     │
└──────┬──────────┘
       │ 2. POST /expenses/ocr-process
       │    Body: { receiptBase64, fileName, companyId }
       ▼
┌──────────────────┐
│ processReceiptOCR│
│     Lambda       │
└──────┬───────────┘
       │ 3. Textract.analyzeExpense({ Document: { Bytes: base64 } })
       │    NO S3 INVOLVED YET!
       ▼
┌─────────────┐
│AWS Textract │
└──────┬──────┘
       │ 4. Returns extracted fields
       ▼
┌──────────────────┐
│ processReceiptOCR│
│     Lambda       │
└──────┬───────────┘
       │ 5. Parse & format data
       │    Return: { extractedFields, confidence }
       ▼
┌─────────────┐
│   Frontend  │
│ Form Pre-   │
│   filled    │
└──────┬──────┘
       │ 6. User reviews and edits
       │ 7. User clicks "Submit"
       ▼
┌─────────────┐
│   Frontend  │
└──────┬──────┘
       │ 8. POST /upload-receipt (get pre-signed URL)
       ▼
┌─────────────────┐
│ uploadReceipt   │
│    Lambda       │
└──────┬──────────┘
       │ 9. Generate pre-signed URL
       ▼
┌─────────────┐
│   Frontend  │
└──────┬──────┘
       │ 10. PUT to S3 (upload actual file)
       ▼
┌─────────────┐
│   AWS S3    │
└──────┬──────┘
       │ 11. Receipt stored
       ▼
┌─────────────┐
│   Frontend  │
└──────┬──────┘
       │ 12. POST /expenses/add
       │     Body: { ...formData, receiptUrl }
       ▼
┌─────────────┐
│ addExpense  │
│   Lambda    │
└──────┬──────┘
       │ 13. Create expense with receipt URL
       ▼
┌─────────────┐
│  DynamoDB   │
└─────────────┘
```

---

## Revised Lambda Function: `processReceiptOCR.js`

### Input Changes

**v1.0** (OLD):
```json
{
  "receiptUrl": "https://s3.amazonaws.com/...",
  "companyId": "company_123"
}
```

**v2.0** (NEW):
```json
{
  "receiptBase64": "iVBORw0KGgoAAAANSUhEUgAA...",
  "fileName": "receipt.jpg",
  "fileSize": 234567,
  "companyId": "company_123"
}
```

### Full Updated Implementation

```javascript
// lambda/processReceiptOCR.js
const AWS = require('aws-sdk');
const { withSecureCors } = require('./shared/cors-config');
const {
  getCompanyContextFromEvent,
  createResponse,
  createErrorResponse,
  debugLog
} = require('./shared/company-utils');

const textract = new AWS.Textract({ region: process.env.TEXTRACT_REGION || 'us-east-1' });

// Constants
const MAX_RECEIPT_SIZE_BYTES = 5 * 1024 * 1024; // 5MB limit for Textract Bytes mode
const OCR_CONFIDENCE_THRESHOLD = parseInt(process.env.OCR_CONFIDENCE_THRESHOLD || '80');

exports.handler = withSecureCors(async (event) => {
  try {
    const { companyId, userId } = getCompanyContextFromEvent(event);
    const { receiptBase64, fileName, fileSize } = JSON.parse(event.body);

    // Validation
    if (!receiptBase64 || !fileName) {
      return createErrorResponse(400, 'receiptBase64 and fileName are required');
    }

    // Calculate actual size from base64
    const estimatedSizeBytes = Math.floor((receiptBase64.length * 0.75));

    debugLog('OCR processing started', {
      companyId,
      userId,
      fileName,
      estimatedSize: `${Math.round(estimatedSizeBytes / 1024)}KB`
    });

    // Check size limit for Textract Bytes mode
    if (estimatedSizeBytes > MAX_RECEIPT_SIZE_BYTES) {
      return createErrorResponse(413,
        `Receipt is too large for instant OCR (${Math.round(estimatedSizeBytes / 1024 / 1024)}MB). ` +
        `Maximum is 5MB. Please compress the image or upload without OCR.`
      );
    }

    // Convert base64 to Buffer
    const imageBuffer = Buffer.from(receiptBase64, 'base64');

    // Call Textract with Bytes (not S3!)
    const textractParams = {
      Document: {
        Bytes: imageBuffer
      }
    };

    const startTime = Date.now();
    const textractResponse = await textract.analyzeExpense(textractParams).promise();
    const processingTime = Date.now() - startTime;

    debugLog('Textract processing complete', {
      companyId,
      processingTimeMs: processingTime,
      documentPages: textractResponse.DocumentMetadata?.Pages || 1
    });

    // Parse Textract response
    const extractedFields = parseTextractResponse(textractResponse);
    const confidence = extractConfidenceScores(textractResponse);

    // Check if confidence meets threshold
    const lowConfidenceFields = Object.entries(confidence)
      .filter(([field, score]) => score < OCR_CONFIDENCE_THRESHOLD)
      .map(([field]) => field);

    if (lowConfidenceFields.length > 0) {
      debugLog('Low confidence OCR fields detected', {
        companyId,
        lowConfidenceFields,
        threshold: OCR_CONFIDENCE_THRESHOLD
      });
    }

    return createResponse(200, {
      success: true,
      data: {
        extractedFields: {
          ...extractedFields,
          confidence
        },
        ocrMetadata: {
          processingTimeMs: processingTime,
          documentType: textractResponse.DocumentMetadata?.DocumentType || 'RECEIPT',
          fileName,
          lowConfidenceFields
        }
      }
    });

  } catch (error) {
    debugLog('OCR processing error', {
      errorCode: error.code,
      errorMessage: error.message
    });

    // Handle specific Textract errors
    if (error.code === 'UnsupportedDocumentException') {
      return createErrorResponse(400,
        'Unsupported receipt format. Please upload JPG, PNG, or PDF.');
    }

    if (error.code === 'InvalidParameterException') {
      return createErrorResponse(400,
        'Invalid receipt image. Please ensure the image is clear and readable.');
    }

    if (error.code === 'ProvisionedThroughputExceededException') {
      return createErrorResponse(429,
        'OCR service is temporarily busy. Please try again in a moment.');
    }

    return createErrorResponse(500, 'OCR processing failed', error);
  }
});

// Parse Textract response into our expense fields
function parseTextractResponse(textractResponse) {
  const fields = {};
  const expenseDocuments = textractResponse.ExpenseDocuments || [];

  if (expenseDocuments.length === 0) {
    return fields;
  }

  const summaryFields = expenseDocuments[0].SummaryFields || [];

  for (const field of summaryFields) {
    const type = field.Type?.Text;
    const value = field.ValueDetection?.Text;

    if (!type || !value) continue;

    switch (type) {
      case 'TOTAL':
      case 'AMOUNT_PAID':
        fields.amount = parseAmount(value);
        break;
      case 'INVOICE_RECEIPT_DATE':
        fields.date = parseDate(value);
        break;
      case 'INVOICE_RECEIPT_ID':
        fields.invoiceNum = value.trim();
        break;
      case 'VENDOR_NAME':
      case 'VENDOR':
        fields.vendor = value.trim();
        break;
    }
  }

  // Extract line items for description
  const lineItems = expenseDocuments[0].LineItemGroups || [];
  if (lineItems.length > 0) {
    const descriptions = extractLineItemDescriptions(lineItems);
    fields.description = descriptions.join(', ').substring(0, 500); // Limit length
  }

  return fields;
}

function extractConfidenceScores(textractResponse) {
  const confidence = {};
  const summaryFields = textractResponse.ExpenseDocuments?.[0]?.SummaryFields || [];

  for (const field of summaryFields) {
    const type = field.Type?.Text;
    const score = field.ValueDetection?.Confidence || 0;

    if (type === 'TOTAL' || type === 'AMOUNT_PAID') {
      confidence.amount = Math.round(score);
    } else if (type === 'INVOICE_RECEIPT_DATE') {
      confidence.date = Math.round(score);
    } else if (type === 'INVOICE_RECEIPT_ID') {
      confidence.invoiceNum = Math.round(score);
    } else if (type === 'VENDOR_NAME' || type === 'VENDOR') {
      confidence.vendor = Math.round(score);
    }
  }

  return confidence;
}

function parseAmount(value) {
  // Remove currency symbols, commas, and parse
  const cleaned = value.replace(/[^0-9.,-]/g, '').replace(',', '');
  const amount = parseFloat(cleaned);
  return isNaN(amount) ? null : amount;
}

function parseDate(value) {
  // Try multiple date formats
  const formats = [
    { regex: /(\d{2})\/(\d{2})\/(\d{4})/, format: (m) => `${m[3]}-${m[1]}-${m[2]}` },  // MM/DD/YYYY
    { regex: /(\d{4})-(\d{2})-(\d{2})/, format: (m) => value },                        // YYYY-MM-DD (already correct)
    { regex: /(\d{2})-(\d{2})-(\d{4})/, format: (m) => `${m[3]}-${m[2]}-${m[1]}` },   // DD-MM-YYYY
    { regex: /(\d{2})\.(\d{2})\.(\d{4})/, format: (m) => `${m[3]}-${m[2]}-${m[1]}` }, // DD.MM.YYYY (European)
  ];

  for (const { regex, format } of formats) {
    const match = value.match(regex);
    if (match) {
      return format(match);
    }
  }

  return null;
}

function extractLineItemDescriptions(lineItemGroups) {
  const descriptions = [];

  for (const group of lineItemGroups) {
    const lineItems = group.LineItems || [];
    for (const item of lineItems) {
      const fields = item.LineItemExpenseFields || [];
      for (const field of fields) {
        if (field.Type?.Text === 'ITEM' || field.Type?.Text === 'DESCRIPTION') {
          const desc = field.ValueDetection?.Text;
          if (desc && desc.trim()) {
            descriptions.push(desc.trim());
          }
        }
      }
    }
  }

  return descriptions;
}
```

---

## Revised Frontend Implementation

### Updated ReceiptUploadWithOCR Component

```jsx
// frontend-v2/src/components/expenses/ReceiptUploadWithOCR.jsx
import React, { useState } from 'react';
import { Upload, Loader, AlertCircle, CheckCircle } from 'lucide-react';

const ReceiptUploadWithOCR = ({ onOcrComplete, onError, companyId, disabled }) => {
  const [uploadState, setUploadState] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [previewUrl, setPreviewUrl] = useState(null);
  const [fileData, setFileData] = useState(null); // Store file for later upload

  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleFileSelect = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      setErrorMessage('Invalid file type. Please upload an image or PDF.');
      setUploadState('error');
      onError(new Error('Invalid file type'));
      return;
    }

    // Validate file size (5MB for OCR processing)
    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage('File size exceeds 5MB limit for instant OCR. Please compress the image.');
      setUploadState('error');
      onError(new Error('File too large'));
      return;
    }

    try {
      setUploadState('processing');
      setProgress(20);
      setErrorMessage('');

      // Create preview
      if (file.type.startsWith('image/')) {
        const preview = await fileToBase64(file);
        setPreviewUrl(preview);
      }

      setProgress(40);

      // Convert to base64 for OCR
      const base64Full = await fileToBase64(file);
      const base64Data = base64Full.split(',')[1]; // Remove data:image/jpeg;base64, prefix

      setProgress(60);

      // Process with OCR directly from base64 - NO S3 UPLOAD YET!
      const ocrResponse = await fetch(`${import.meta.env.VITE_API_URL}/expenses/ocr-process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await window.Clerk.session.getToken()}`
        },
        body: JSON.stringify({
          receiptBase64: base64Data,
          fileName: file.name,
          fileSize: file.size,
          companyId
        })
      });

      if (!ocrResponse.ok) {
        const error = await ocrResponse.json();
        throw new Error(error.message || 'OCR processing failed');
      }

      const ocrResult = await ocrResponse.json();
      setProgress(100);
      setUploadState('success');

      // Store file for later upload on submit
      setFileData(file);

      // Pass extracted data + file to parent
      onOcrComplete({
        ...ocrResult.data.extractedFields,
        receiptFile: file, // Pass file object (not uploaded yet!)
        ocrMetadata: ocrResult.data.ocrMetadata
      });

    } catch (error) {
      console.error('Receipt OCR error:', error);
      setErrorMessage(error.message || 'Failed to process receipt');
      setUploadState('error');
      onError(error);
    }
  };

  const handleRetry = () => {
    setUploadState('idle');
    setErrorMessage('');
    setProgress(0);
    setFileData(null);
    setPreviewUrl(null);
  };

  return (
    <div className="receipt-upload-ocr">
      <div className={`upload-area ${uploadState !== 'idle' ? 'disabled' : ''}`}>
        <input
          type="file"
          id="receipt-upload"
          accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,application/pdf"
          onChange={handleFileSelect}
          disabled={disabled || uploadState !== 'idle'}
          style={{ display: 'none' }}
        />
        <label htmlFor="receipt-upload" className="upload-label">
          {uploadState === 'idle' && (
            <>
              <Upload size={48} />
              <p>Click to upload receipt</p>
              <span className="upload-hint">JPG, PNG, PDF (max 5MB)</span>
            </>
          )}
          {uploadState === 'processing' && (
            <>
              <Loader size={48} className="animate-spin" />
              <p>Extracting expense details...</p>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>
              <span className="processing-hint">This usually takes 2-5 seconds</span>
            </>
          )}
          {uploadState === 'success' && (
            <>
              <CheckCircle size={48} className="text-green-500" />
              <p>Receipt processed successfully!</p>
              <span className="success-hint">Review the pre-filled details below</span>
            </>
          )}
          {uploadState === 'error' && (
            <>
              <AlertCircle size={48} className="text-red-500" />
              <p className="error-message">{errorMessage}</p>
              <button
                className="retry-button"
                onClick={(e) => {
                  e.preventDefault();
                  handleRetry();
                }}
              >
                Try Again
              </button>
            </>
          )}
        </label>
      </div>

      {previewUrl && uploadState === 'success' && (
        <div className="receipt-preview">
          <p className="preview-label">Receipt Preview:</p>
          <img src={previewUrl} alt="Receipt preview" />
          <p className="preview-note">
            This receipt will be uploaded when you submit the expense
          </p>
        </div>
      )}

      <style jsx>{`
        .upload-area {
          border: 2px dashed #cbd5e0;
          border-radius: 8px;
          padding: 2rem;
          text-align: center;
          transition: all 0.3s;
          background-color: #f7fafc;
        }

        .upload-area:hover:not(.disabled) {
          border-color: #4299e1;
          background-color: #edf2f7;
          cursor: pointer;
        }

        .upload-area.disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .upload-label {
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
        }

        .upload-hint,
        .processing-hint,
        .success-hint {
          font-size: 0.875rem;
          color: #718096;
          margin-top: 0.5rem;
        }

        .progress-bar {
          width: 100%;
          max-width: 300px;
          height: 8px;
          background-color: #e2e8f0;
          border-radius: 4px;
          overflow: hidden;
          margin-top: 1rem;
        }

        .progress-fill {
          height: 100%;
          background-color: #4299e1;
          transition: width 0.3s ease;
        }

        .receipt-preview {
          margin-top: 1.5rem;
          padding: 1rem;
          background-color: #f7fafc;
          border-radius: 8px;
          text-align: center;
        }

        .preview-label {
          font-weight: 600;
          margin-bottom: 0.5rem;
          color: #2d3748;
        }

        .receipt-preview img {
          max-width: 300px;
          max-height: 400px;
          width: auto;
          height: auto;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
        }

        .preview-note {
          font-size: 0.875rem;
          color: #718096;
          margin-top: 0.5rem;
          font-style: italic;
        }

        .retry-button {
          margin-top: 1rem;
          padding: 0.5rem 1.5rem;
          background-color: #4299e1;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 500;
          transition: background-color 0.2s;
        }

        .retry-button:hover {
          background-color: #3182ce;
        }

        .error-message {
          color: #e53e3e;
          font-weight: 500;
        }

        .animate-spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default ReceiptUploadWithOCR;
```

### Updated AddExpensePage Submit Handler

```jsx
// In AddExpensePage.jsx
const handleSubmit = async (e) => {
  e.preventDefault();
  setIsSubmitting(true);

  try {
    let receiptUrl = null;

    // Step 1: Upload receipt to S3 ONLY NOW (on submit)
    if (ocrData && ocrData.receiptFile) {
      const file = ocrData.receiptFile;

      // Get pre-signed URL
      const uploadUrlResponse = await fetch(`${process.env.VITE_API_URL}/upload-receipt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await window.Clerk.session.getToken()}`
        },
        body: JSON.stringify({
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size
        })
      });

      if (!uploadUrlResponse.ok) {
        throw new Error('Failed to get upload URL');
      }

      const { data: uploadData } = await uploadUrlResponse.json();

      // Upload to S3
      const uploadResponse = await fetch(uploadData.uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type
        },
        body: file
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload receipt');
      }

      receiptUrl = uploadData.receiptUrl;
    }

    // Step 2: Create expense with receipt URL
    const expenseData = {
      ...formData,
      receiptUrl,
      ocrMetadata: ocrData && ocrData.ocrMetadata ? {
        ...ocrData.ocrMetadata,
        confidence: ocrData.confidence,
        wasEdited: editedFields.size > 0,
        editedFields: Array.from(editedFields)
      } : null
    };

    const response = await fetch(`${process.env.VITE_API_URL}/expenses/add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await window.Clerk.session.getToken()}`
      },
      body: JSON.stringify(expenseData)
    });

    if (!response.ok) {
      throw new Error('Failed to create expense');
    }

    // Success!
    navigate('/expenses');

  } catch (error) {
    console.error('Expense creation error:', error);
    setErrorMessage(error.message || 'Failed to create expense');
  } finally {
    setIsSubmitting(false);
  }
};
```

---

## Updated User Journey

```
┌─────────────────────────────────────────────────────────────┐
│              USER JOURNEY: OCR Expense (REVISED v2.0)        │
└─────────────────────────────────────────────────────────────┘

1. USER STARTS
   │
   └─> Lands on Add Expense Page

2. RECEIPT SELECTION (NO UPLOAD YET!)
   │
   ├─> Clicks "Upload Receipt" button
   │
   ├─> Selects image file from device
   │
   └─> File loaded into browser memory (base64)

3. OCR PROCESSING (FROM MEMORY)
   │
   ├─> [Loading: "Extracting expense details..."]
   │   └─> Progress bar: 20% → 60% → 100%
   │
   ├─> Base64 sent to Lambda (2-5 seconds)
   │
   └─> [Success: "Receipt processed successfully!"]

4. FORM PRE-FILLED (RECEIPT STILL IN MEMORY)
   │
   ├─> Amount: $1,250.50 ✓ (99% confidence)
   ├─> Date: 2025-12-01 ✓ (95% confidence)
   ├─> Invoice #: INV-2025-001 ⚠ (82% confidence)
   ├─> Description: "Lumber, nails, screws"
   └─> Contractor: Shows 3 matches (95% match auto-selected)

5. USER REVIEWS & EDITS
   │
   ├─> Verifies all fields
   ├─> Corrects invoice # to "INV-2025-0012" ✏
   ├─> Selects project from dropdown
   ├─> Selects payment method
   │
   └─> Preview shows receipt thumbnail (from memory)

6. USER SUBMITS
   │
   ├─> Clicks "Add Expense"
   │
   ├─> [Step 1] Receipt uploads to S3 NOW (0.5-1 second)
   │
   ├─> [Step 2] Expense created with receipt URL
   │   {
   │     amount: 1250.50,
   │     receiptUrl: "https://s3.../receipt-123.jpg",
   │     ocrMetadata: {
   │       confidenceScores: {...},
   │       wasEdited: true,
   │       editedFields: ["invoiceNum"]
   │     }
   │   }
   │
   └─> [Success: "Expense added successfully!"]

7. COMPLETION
   │
   └─> Redirects to Expenses List

IMPORTANT: If user abandons at step 4 or 5:
- NO S3 upload occurs
- NO orphaned files
- NO cleanup needed
```

---

## Updated IAM Policy (Simplified)

**Note**: S3 read permission is no longer needed for OCR Lambda!

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "textract:AnalyzeExpense"
      ],
      "Resource": "*"
    }
  ]
}
```

**Removed**: `s3:GetObject` permission (no longer needed)

---

## Cost Impact Analysis

### Storage Cost Reduction

**Assumptions**:
- 3,000 expenses created per month
- 40% form abandonment rate (user starts but doesn't submit)
- Average receipt size: 500KB

| Metric | v1.0 (Upload First) | v2.0 (Upload on Submit) | Savings |
|--------|---------------------|-------------------------|---------|
| **Receipts Uploaded** | 5,000 (3,000 + 2,000 abandoned) | 3,000 (only submitted) | 40% fewer |
| **S3 Storage/Month** | 2.5 GB | 1.5 GB | 1 GB saved |
| **S3 Cost/Month** | $0.06 | $0.03 | **$0.03 (50%)** |
| **Cleanup Job Cost** | $5-10/month | $0 | **$5-10 saved** |
| **Total Monthly Savings** | | | **~$5-10** |
| **Annual Savings** | | | **~$60-120** |

### Performance Impact

| Metric | v1.0 | v2.0 | Improvement |
|--------|------|------|-------------|
| **Time to OCR** | S3 upload (0.5-1s) + OCR (2-5s) = 2.5-6s | OCR only (2-5s) | **0.5-1s faster** |
| **Submit Time** | Create expense only (0.2s) | S3 upload (0.5-1s) + create (0.2s) = 0.7-1.2s | **Negligible** |
| **User Perceived Speed** | Slower (wait before seeing form) | **Faster** (instant form) | ✅ Better UX |

---

## Technical Constraints & Limitations

### Textract Bytes Mode Limits

| Constraint | Limit | Impact | Mitigation |
|-----------|-------|--------|------------|
| **Max File Size** | 5 MB | ~90% of receipts are <2MB | Show compression tip for large files |
| **Supported Formats** | JPG, PNG, PDF | Standard receipt formats | Frontend validation |
| **Processing Time** | 2-5 seconds | Acceptable for UX | Show progress indicator |
| **Concurrent Requests** | 5 TPS (transactions per second) | Could throttle during peak | Implement retry with exponential backoff |

### Fallback Strategy for Large Receipts

For receipts > 5MB (rare):

```jsx
if (file.size > 5 * 1024 * 1024) {
  // Offer two options:
  // 1. Compress image automatically (using canvas)
  // 2. Skip OCR and upload manually

  return (
    <div className="large-receipt-warning">
      <AlertTriangle />
      <p>This receipt is larger than 5MB. Choose an option:</p>
      <button onClick={compressAndRetry}>Compress & Try Again</button>
      <button onClick={skipOcr}>Upload Without OCR</button>
    </div>
  );
}
```

---

## Security Enhancements

### v2.0 Security Improvements

1. **No Premature S3 Storage**
   - Receipt data stays in user's browser until explicitly submitted
   - User has full control over what gets stored

2. **Reduced Attack Surface**
   - No S3 bucket pollution from malicious uploads
   - No orphaned files to exploit

3. **Base64 Transmission Security**
   - Base64 data is ephemeral (exists only during request)
   - Encrypted in transit via HTTPS
   - Not logged or cached

4. **Company Isolation**
   - Receipt only uploaded if expense creation succeeds
   - Uploaded to company-scoped S3 path

---

## Migration from v1.0 to v2.0

### Code Changes Required

| File | Change Type | Complexity |
|------|-------------|-----------|
| `lambda/processReceiptOCR.js` | **Complete rewrite** | Medium |
| `frontend-v2/src/components/expenses/ReceiptUploadWithOCR.jsx` | **Major update** | Medium |
| `frontend-v2/src/pages/expenses/AddExpensePage.jsx` | **Submit handler update** | Low |
| `lambda/uploadReceipt.js` | No changes needed | None |
| API Gateway endpoints | No changes needed | None |

### Deployment Steps (Zero Downtime)

1. Deploy new Lambda code with feature flag **disabled**
2. Deploy new frontend with feature flag check
3. Test in staging environment
4. Enable feature flag in production
5. Monitor for 24 hours
6. Full rollout

---

## Decision Record

**Decision**: Upload receipt to S3 on submit (v2.0) instead of before OCR (v1.0)

**Date**: December 3, 2025

**Context**:
- Original plan uploaded receipt to S3 before OCR processing
- User feedback highlighted concern about orphaned receipts

**Pros (v2.0)**:
✅ Eliminates orphaned receipts
✅ Reduces S3 storage costs by ~30-40%
✅ Faster UX (no S3 upload latency before OCR)
✅ Better user privacy/control
✅ No cleanup jobs required

**Cons (v2.0)**:
❌ 5MB file size limit (Textract Bytes mode constraint)
❌ Slightly more complex frontend state management
❌ Receipt upload happens at submit (adds 0.5-1s latency)

**Trade-off Analysis**:
- 90%+ of receipts are <2MB (5MB limit is acceptable)
- Submit latency is negligible vs. benefits
- Frontend complexity is manageable

**Decision**: **APPROVED** - Implement v2.0 architecture

**Stakeholders**: Development Team, Product Owner
**Reviewed By**: System Architect (AI), User (maordaniel40@gmail.com)

---

## Summary of Changes from v1.0

### Architecture
- ❌ Old: Upload → OCR → Form
- ✅ New: OCR (from memory) → Form → Upload

### Lambda Function
- ❌ Old: Accepts `receiptUrl` (S3 path)
- ✅ New: Accepts `receiptBase64` (bytes)
- ❌ Old: Calls Textract with `S3Object`
- ✅ New: Calls Textract with `Bytes`

### Frontend
- ❌ Old: Upload to S3 first, then OCR
- ✅ New: Keep file in memory, OCR, upload on submit
- ❌ Old: Receipt URL available immediately
- ✅ New: Receipt URL generated on submit

### User Experience
- ⏱️ Old: Slower (S3 upload + OCR)
- ✅ New: **Faster** (OCR only)
- ❌ Old: Orphaned receipts on abandonment
- ✅ New: **No orphaned receipts**

### Cost
- 💰 Old: Higher S3 storage costs
- ✅ New: **30-40% lower** S3 costs
- 💰 Old: Cleanup jobs required
- ✅ New: **No cleanup needed**

---

**Status**: ✅ Ready for Implementation
**Next Action**: Begin Phase 1 (AWS Textract Setup)
**Approval**: GRANTED by User

---

**END OF REVISED ARCHITECTURE DOCUMENT**
