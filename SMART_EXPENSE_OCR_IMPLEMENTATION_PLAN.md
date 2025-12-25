# Smart Expense Upload with OCR - Implementation Plan

**Version**: 1.0
**Date**: December 3, 2025
**Status**: Planning Phase
**Estimated Timeline**: 2-3 weeks

---

## Executive Summary

This document outlines the implementation plan for adding OCR (Optical Character Recognition) capabilities to the expense upload workflow. The feature will allow users to upload receipt images, automatically extract expense details, and pre-fill the expense form with the extracted data.

### Key Objectives
- Reduce manual data entry time by ~75% (1.5 minutes saved per expense)
- Improve data accuracy by eliminating transcription errors
- Maintain existing security and validation standards
- Zero-downtime deployment with feature flag support

### Technology Selection
**AWS Textract** (AnalyzeExpense API) - Selected for:
- Native AWS integration (no data sovereignty issues)
- Specialized receipt/invoice analysis with structured output
- High accuracy (~95%+) for financial documents
- Automatic field confidence scoring
- Pay-per-use pricing (~$0.017/page)

### Cost Estimation
- **OCR Processing**: $51/month for 3,000 receipts
- **S3 Storage**: Minimal increase (receipts already stored)
- **Lambda Execution**: ~$5/month increase
- **Total**: ~$56/month for 3,000 expenses

### Timeline
- **Phase 1** (AWS Setup): 2-3 days
- **Phase 2** (Backend): 4-5 days
- **Phase 3** (Frontend): 5-6 days
- **Phase 4** (Testing): 3-4 days
- **Phase 5** (Deployment): 1 day
- **Total**: 15-19 days

---

## Phase 1: OCR Service Integration

### 1.1 AWS Textract Setup

#### IAM Policy Configuration
Create IAM policy for Lambda to access Textract:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "textract:AnalyzeExpense",
        "textract:GetExpenseAnalysis",
        "textract:StartExpenseAnalysis"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject"
      ],
      "Resource": "arn:aws:s3:::construction-expenses-receipts-702358134603/*"
    }
  ]
}
```

**Action Items**:
1. Create policy named `TextractExpenseAnalysisPolicy`
2. Attach to existing Lambda execution role
3. Verify permissions with test invocation

#### Environment Variables
Add to `.env.production`:
```bash
# OCR Configuration
OCR_ENABLED=true
TEXTRACT_REGION=us-east-1
OCR_CONFIDENCE_THRESHOLD=80  # Minimum confidence score (0-100)
OCR_TIMEOUT_MS=30000  # 30 seconds
OCR_MAX_RETRIES=3
```

### 1.2 Textract API Integration Design

#### API Flow
```
User uploads image → S3 → Lambda triggers Textract → Parse results → Return structured data
```

#### Textract Response Parsing Strategy
AWS Textract returns structured expense data:
- **VENDOR**: Supplier/contractor name
- **INVOICE_RECEIPT_ID**: Invoice number
- **TOTAL**: Total amount
- **INVOICE_RECEIPT_DATE**: Transaction date
- **ITEM**: Line items with descriptions

#### Field Mapping
| Textract Field | System Field | Transformation |
|---------------|--------------|----------------|
| TOTAL | amount | Parse to float, validate < 100M |
| INVOICE_RECEIPT_DATE | date | Convert to YYYY-MM-DD |
| INVOICE_RECEIPT_ID | invoiceNum | Extract alphanumeric |
| VENDOR | contractorId | Fuzzy match to contractors table |
| ITEM | description | Concatenate line items |

---

## Phase 2: Backend Implementation

### 2.1 New Lambda Functions

#### Function 1: `processReceiptOCR.js`

**Purpose**: Process uploaded receipt image with AWS Textract and extract expense data

**Endpoint**: `POST /expenses/ocr-process`

**Authentication**: Clerk JWT (withSecureCors)

**Input**:
```json
{
  "receiptUrl": "https://construction-expenses-receipts-702358134603.s3.amazonaws.com/company123/receipts/receipt-123.jpg",
  "companyId": "company_123"
}
```

**Output**:
```json
{
  "success": true,
  "data": {
    "extractedFields": {
      "amount": 1250.50,
      "date": "2025-12-01",
      "invoiceNum": "INV-2025-001",
      "vendor": "ABC Supplies",
      "description": "Lumber, nails, screws",
      "confidence": {
        "amount": 99,
        "date": 95,
        "invoiceNum": 88,
        "vendor": 92
      }
    },
    "receiptUrl": "https://...",
    "ocrMetadata": {
      "textractJobId": "job-123",
      "processingTimeMs": 2341,
      "documentType": "RECEIPT"
    }
  }
}
```

**Implementation Outline**:
```javascript
// lambda/processReceiptOCR.js
const AWS = require('aws-sdk');
const { withSecureCors } = require('./shared/cors-config');
const { getCompanyContextFromEvent, createResponse, createErrorResponse } = require('./shared/company-utils');

const textract = new AWS.Textract({ region: process.env.TEXTRACT_REGION || 'us-east-1' });

exports.handler = withSecureCors(async (event) => {
  try {
    const { companyId, userId } = getCompanyContextFromEvent(event);
    const { receiptUrl } = JSON.parse(event.body);

    // Validate receipt URL belongs to this company
    if (!receiptUrl.includes(`/${companyId}/receipts/`)) {
      return createErrorResponse(403, 'Receipt does not belong to this company');
    }

    // Extract S3 key from URL
    const s3Key = extractS3KeyFromUrl(receiptUrl);

    // Call Textract AnalyzeExpense
    const textractParams = {
      Document: {
        S3Object: {
          Bucket: process.env.RECEIPTS_BUCKET,
          Name: s3Key
        }
      }
    };

    const startTime = Date.now();
    const textractResponse = await textract.analyzeExpense(textractParams).promise();
    const processingTime = Date.now() - startTime;

    // Parse Textract response
    const extractedFields = parseTextractResponse(textractResponse);

    // Add confidence scores
    const confidence = extractConfidenceScores(textractResponse);

    return createResponse(200, {
      success: true,
      data: {
        extractedFields: {
          ...extractedFields,
          confidence
        },
        receiptUrl,
        ocrMetadata: {
          textractJobId: textractResponse.JobId,
          processingTimeMs: processingTime,
          documentType: textractResponse.DocumentMetadata?.DocumentType || 'RECEIPT'
        }
      }
    });

  } catch (error) {
    if (error.code === 'InvalidS3ObjectException') {
      return createErrorResponse(400, 'Receipt image not found in S3');
    }
    if (error.code === 'UnsupportedDocumentException') {
      return createErrorResponse(400, 'Unsupported receipt format');
    }
    return createErrorResponse(500, 'OCR processing failed', error);
  }
});

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
    fields.description = descriptions.join(', ');
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
  // Remove currency symbols and parse
  const cleaned = value.replace(/[^0-9.,-]/g, '');
  const amount = parseFloat(cleaned.replace(',', ''));
  return isNaN(amount) ? null : amount;
}

function parseDate(value) {
  // Try multiple date formats
  const formats = [
    /(\d{2})\/(\d{2})\/(\d{4})/,  // MM/DD/YYYY
    /(\d{4})-(\d{2})-(\d{2})/,    // YYYY-MM-DD
    /(\d{2})-(\d{2})-(\d{4})/     // DD-MM-YYYY
  ];

  for (const format of formats) {
    const match = value.match(format);
    if (match) {
      // Convert to YYYY-MM-DD
      if (format === formats[0]) {
        return `${match[3]}-${match[1]}-${match[2]}`;
      } else if (format === formats[1]) {
        return value;
      } else {
        return `${match[3]}-${match[2]}-${match[1]}`;
      }
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

function extractS3KeyFromUrl(url) {
  const urlObj = new URL(url);
  return urlObj.pathname.substring(1); // Remove leading slash
}
```

**API Gateway Configuration**:
```yaml
Method: POST
Path: /expenses/ocr-process
Authorization: clerk-authorizer
CORS: Enabled (withSecureCors)
Timeout: 30 seconds
Memory: 512 MB
```

---

#### Function 2: `matchContractor.js`

**Purpose**: Fuzzy match extracted vendor name to existing contractors in company

**Endpoint**: `POST /expenses/match-contractor`

**Authentication**: Clerk JWT (withSecureCors)

**Input**:
```json
{
  "vendorName": "ABC Supplies",
  "companyId": "company_123"
}
```

**Output**:
```json
{
  "success": true,
  "data": {
    "matches": [
      {
        "contractorId": "contractor_456",
        "contractorName": "ABC Supplies Inc",
        "matchScore": 95,
        "phone": "555-0123",
        "email": "abc@example.com"
      },
      {
        "contractorId": "contractor_789",
        "contractorName": "ABC Building Supplies",
        "matchScore": 82,
        "phone": "555-0456",
        "email": "info@abc.com"
      }
    ],
    "suggestedMatch": "contractor_456"
  }
}
```

**Implementation Outline**:
```javascript
// lambda/matchContractor.js
const { dynamodb, TABLE_NAMES, dynamoOperation } = require('./shared/multi-table-utils');
const { withSecureCors } = require('./shared/cors-config');
const { getCompanyContextFromEvent, createResponse, createErrorResponse } = require('./shared/company-utils');

exports.handler = withSecureCors(async (event) => {
  try {
    const { companyId, userId } = getCompanyContextFromEvent(event);
    const { vendorName } = JSON.parse(event.body);

    if (!vendorName || !vendorName.trim()) {
      return createResponse(200, {
        success: true,
        data: {
          matches: [],
          suggestedMatch: null
        }
      });
    }

    // Get all contractors for company
    const queryParams = {
      TableName: TABLE_NAMES.CONTRACTORS,
      KeyConditionExpression: 'companyId = :companyId',
      ExpressionAttributeValues: {
        ':companyId': companyId
      }
    };

    const result = await dynamoOperation('query', queryParams);
    const contractors = result.Items || [];

    // Calculate similarity scores
    const matches = contractors.map(contractor => {
      const score = calculateSimilarity(
        vendorName.toLowerCase(),
        contractor.contractorName.toLowerCase()
      );

      return {
        contractorId: contractor.contractorId,
        contractorName: contractor.contractorName,
        matchScore: score,
        phone: contractor.phone || '',
        email: contractor.email || ''
      };
    });

    // Filter matches with score > 60 and sort by score
    const goodMatches = matches
      .filter(m => m.matchScore > 60)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 5); // Top 5 matches

    const suggestedMatch = goodMatches.length > 0 && goodMatches[0].matchScore > 80
      ? goodMatches[0].contractorId
      : null;

    return createResponse(200, {
      success: true,
      data: {
        matches: goodMatches,
        suggestedMatch
      }
    });

  } catch (error) {
    return createErrorResponse(500, 'Contractor matching failed', error);
  }
});

function calculateSimilarity(str1, str2) {
  // Levenshtein distance algorithm
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) {
    return 100;
  }

  // Quick checks for common patterns
  if (shorter.includes(longer) || longer.includes(shorter)) {
    return 90 + Math.floor((shorter.length / longer.length) * 10);
  }

  const editDistance = levenshteinDistance(longer, shorter);
  const similarity = ((longer.length - editDistance) / longer.length) * 100;

  return Math.round(similarity);
}

function levenshteinDistance(str1, str2) {
  const matrix = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}
```

**API Gateway Configuration**:
```yaml
Method: POST
Path: /expenses/match-contractor
Authorization: clerk-authorizer
CORS: Enabled (withSecureCors)
Timeout: 10 seconds
Memory: 256 MB
```

---

### 2.2 Modified Lambda Functions

#### Modification 1: `uploadReceipt.js`

**Changes**: Add optional OCR processing trigger

**New Flow**:
1. Generate pre-signed URL (existing)
2. If `processOcr=true` query param, return OCR endpoint info
3. Frontend uses receipt URL to call OCR endpoint after upload

**Code Changes**:
```javascript
// In uploadReceipt.js, add to response:
return createResponse(200, {
  success: true,
  message: 'Pre-signed URL generated successfully',
  data: {
    uploadUrl,
    receiptUrl,
    expiresIn: 300,
    maxFileSize: MAX_FILE_SIZE,
    allowedTypes: ['PDF', 'JPG', 'JPEG', 'PNG', 'GIF', 'WEBP'],
    // NEW: OCR processing info
    ocrEnabled: process.env.OCR_ENABLED === 'true',
    ocrEndpoint: process.env.OCR_ENABLED === 'true'
      ? `${process.env.API_BASE_URL}/expenses/ocr-process`
      : null
  },
  timestamp: getCurrentTimestamp()
});
```

#### Modification 2: `addExpense.js`

**Changes**: Add OCR metadata tracking

**New Fields** (optional):
```javascript
// Add to expense object if OCR was used
if (expenseData.ocrMetadata) {
  expense.ocrMetadata = {
    textractJobId: expenseData.ocrMetadata.textractJobId,
    processingTimeMs: expenseData.ocrMetadata.processingTimeMs,
    confidenceScores: expenseData.ocrMetadata.confidence,
    wasEdited: expenseData.ocrMetadata.wasEdited || false,
    processedAt: getCurrentTimestamp()
  };
}
```

**Validation Enhancement**:
```javascript
// Add warning for low confidence OCR fields
if (expense.ocrMetadata && expense.ocrMetadata.confidenceScores) {
  const lowConfidence = Object.entries(expense.ocrMetadata.confidenceScores)
    .filter(([field, score]) => score < 80)
    .map(([field]) => field);

  if (lowConfidence.length > 0) {
    debugLog('Low OCR confidence fields', {
      expenseId: expense.expenseId,
      lowConfidenceFields: lowConfidence
    });
  }
}
```

---

### 2.3 S3 Upload Flow

```
┌─────────────┐
│   Frontend  │
│   (React)   │
└──────┬──────┘
       │ 1. Request upload URL
       ▼
┌─────────────────┐
│ uploadReceipt   │
│    Lambda       │
└──────┬──────────┘
       │ 2. Generate pre-signed URL
       │ 3. Return URL + OCR info
       ▼
┌─────────────┐
│   Frontend  │
└──────┬──────┘
       │ 4. Upload image to S3
       ▼
┌─────────────┐
│   AWS S3    │
│  (Receipt)  │
└──────┬──────┘
       │ 5. Image stored
       ▼
┌─────────────┐
│   Frontend  │
└──────┬──────┘
       │ 6. Call OCR endpoint
       ▼
┌──────────────────┐
│ processReceiptOCR│
│     Lambda       │
└──────┬───────────┘
       │ 7. Call Textract
       ▼
┌─────────────┐
│ AWS Textract│
└──────┬──────┘
       │ 8. Return extracted data
       ▼
┌──────────────────┐
│ processReceiptOCR│
│     Lambda       │
└──────┬───────────┘
       │ 9. Parse & format
       ▼
┌─────────────┐
│   Frontend  │
│ (Pre-filled │
│    Form)    │
└─────────────┘
```

---

### 2.4 API Gateway Endpoints

#### New Endpoints

| Method | Path | Lambda | Purpose | Timeout |
|--------|------|--------|---------|---------|
| POST | /expenses/ocr-process | processReceiptOCR | Extract data from receipt | 30s |
| POST | /expenses/match-contractor | matchContractor | Find matching contractors | 10s |

#### Endpoint Configuration Script

```bash
# scripts/deploy-ocr-endpoints.sh
#!/bin/bash

API_ID="2woj5i92td"
REGION="us-east-1"
AUTH_ID="3c8agd"

# Create OCR Process endpoint
echo "Creating /expenses/ocr-process endpoint..."

PARENT_ID=$(aws apigateway get-resources --rest-api-id $API_ID --region $REGION \
  --query "items[?path=='/expenses'].id" --output text)

OCR_RESOURCE=$(aws apigateway create-resource \
  --rest-api-id $API_ID \
  --parent-id $PARENT_ID \
  --path-part "ocr-process" \
  --region $REGION \
  --output json)

OCR_RESOURCE_ID=$(echo $OCR_RESOURCE | jq -r '.id')

# Add POST method
aws apigateway put-method \
  --rest-api-id $API_ID \
  --resource-id $OCR_RESOURCE_ID \
  --http-method POST \
  --authorization-type CUSTOM \
  --authorizer-id $AUTH_ID \
  --region $REGION

# Add Lambda integration
aws apigateway put-integration \
  --rest-api-id $API_ID \
  --resource-id $OCR_RESOURCE_ID \
  --http-method POST \
  --type AWS_PROXY \
  --integration-http-method POST \
  --uri "arn:aws:apigateway:$REGION:lambda:path/2015-03-31/functions/arn:aws:lambda:$REGION:702358134603:function:construction-expenses-process-receipt-ocr/invocations" \
  --region $REGION

# Add OPTIONS for CORS
aws apigateway put-method \
  --rest-api-id $API_ID \
  --resource-id $OCR_RESOURCE_ID \
  --http-method OPTIONS \
  --authorization-type NONE \
  --region $REGION

# Deploy
aws apigateway create-deployment \
  --rest-api-id $API_ID \
  --stage-name prod \
  --region $REGION

echo "✅ OCR endpoints deployed"
```

---

### 2.5 Environment Variables

Add to `.env.production`:
```bash
# OCR Feature Flag
OCR_ENABLED=true

# AWS Textract Configuration
TEXTRACT_REGION=us-east-1
OCR_CONFIDENCE_THRESHOLD=80
OCR_TIMEOUT_MS=30000
OCR_MAX_RETRIES=3

# Receipt Storage
RECEIPTS_BUCKET=construction-expenses-receipts-702358134603

# API Configuration
API_BASE_URL=https://2woj5i92td.execute-api.us-east-1.amazonaws.com/prod
```

Add to `lambda/shared/multi-table-utils.js`:
```javascript
const OCR_CONFIG = {
  enabled: process.env.OCR_ENABLED === 'true',
  confidenceThreshold: parseInt(process.env.OCR_CONFIDENCE_THRESHOLD || '80'),
  timeout: parseInt(process.env.OCR_TIMEOUT_MS || '30000'),
  maxRetries: parseInt(process.env.OCR_MAX_RETRIES || '3')
};

module.exports = {
  // ... existing exports
  OCR_CONFIG
};
```

---

## Phase 3: Frontend Implementation

### 3.1 New React Components

#### Component 1: `ReceiptUploadWithOCR.jsx`

**Purpose**: Handle receipt upload and trigger OCR processing

**Location**: `frontend-v2/src/components/expenses/ReceiptUploadWithOCR.jsx`

**Props**:
```javascript
{
  onOcrComplete: (extractedData) => void,
  onError: (error) => void,
  companyId: string,
  disabled: boolean
}
```

**Implementation**:
```jsx
// frontend-v2/src/components/expenses/ReceiptUploadWithOCR.jsx
import React, { useState } from 'react';
import { Upload, Loader, AlertCircle, CheckCircle } from 'lucide-react';
import { uploadReceiptWithOCR } from '../../services/api';

const ReceiptUploadWithOCR = ({ onOcrComplete, onError, companyId, disabled }) => {
  const [uploadState, setUploadState] = useState('idle'); // idle, uploading, processing, success, error
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [previewUrl, setPreviewUrl] = useState(null);

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

    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage('File size exceeds 10MB limit.');
      setUploadState('error');
      onError(new Error('File too large'));
      return;
    }

    try {
      setUploadState('uploading');
      setProgress(10);
      setErrorMessage('');

      // Create preview
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => setPreviewUrl(e.target.result);
        reader.readAsDataURL(file);
      }

      // Step 1: Get pre-signed URL
      setProgress(20);
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
      setProgress(40);

      // Step 2: Upload to S3
      const uploadResponse = await fetch(uploadData.uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type
        },
        body: file
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file');
      }

      setProgress(60);
      setUploadState('processing');

      // Step 3: Process with OCR
      const ocrResponse = await fetch(`${process.env.VITE_API_URL}/expenses/ocr-process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await window.Clerk.session.getToken()}`
        },
        body: JSON.stringify({
          receiptUrl: uploadData.receiptUrl,
          companyId
        })
      });

      if (!ocrResponse.ok) {
        throw new Error('OCR processing failed');
      }

      const ocrResult = await ocrResponse.json();
      setProgress(100);
      setUploadState('success');

      // Pass extracted data to parent
      onOcrComplete({
        ...ocrResult.data.extractedFields,
        receiptUrl: uploadData.receiptUrl,
        ocrMetadata: ocrResult.data.ocrMetadata
      });

    } catch (error) {
      console.error('Receipt upload/OCR error:', error);
      setErrorMessage(error.message || 'Failed to process receipt');
      setUploadState('error');
      onError(error);
    }
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
              <span className="upload-hint">JPG, PNG, PDF (max 10MB)</span>
            </>
          )}
          {uploadState === 'uploading' && (
            <>
              <Loader size={48} className="animate-spin" />
              <p>Uploading receipt...</p>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>
            </>
          )}
          {uploadState === 'processing' && (
            <>
              <Loader size={48} className="animate-spin" />
              <p>Extracting expense details...</p>
              <span className="processing-hint">This may take a few seconds</span>
            </>
          )}
          {uploadState === 'success' && (
            <>
              <CheckCircle size={48} className="text-green-500" />
              <p>Receipt processed successfully!</p>
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
                  setUploadState('idle');
                  setErrorMessage('');
                  setProgress(0);
                }}
              >
                Try Again
              </button>
            </>
          )}
        </label>
      </div>

      {previewUrl && (
        <div className="receipt-preview">
          <img src={previewUrl} alt="Receipt preview" />
        </div>
      )}

      <style jsx>{`
        .upload-area {
          border: 2px dashed #cbd5e0;
          border-radius: 8px;
          padding: 2rem;
          text-align: center;
          transition: all 0.3s;
        }

        .upload-area:hover:not(.disabled) {
          border-color: #4299e1;
          background-color: #f7fafc;
        }

        .upload-label {
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
        }

        .upload-hint {
          font-size: 0.875rem;
          color: #718096;
        }

        .progress-bar {
          width: 100%;
          height: 8px;
          background-color: #e2e8f0;
          border-radius: 4px;
          overflow: hidden;
          margin-top: 1rem;
        }

        .progress-fill {
          height: 100%;
          background-color: #4299e1;
          transition: width 0.3s;
        }

        .receipt-preview {
          margin-top: 1rem;
          max-width: 300px;
          border-radius: 8px;
          overflow: hidden;
        }

        .receipt-preview img {
          width: 100%;
          height: auto;
        }

        .retry-button {
          margin-top: 1rem;
          padding: 0.5rem 1rem;
          background-color: #4299e1;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }

        .error-message {
          color: #e53e3e;
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

---

#### Component 2: `OcrFieldIndicator.jsx`

**Purpose**: Show OCR confidence and manual edit status

**Location**: `frontend-v2/src/components/expenses/OcrFieldIndicator.jsx`

**Implementation**:
```jsx
// frontend-v2/src/components/expenses/OcrFieldIndicator.jsx
import React from 'react';
import { CheckCircle, AlertTriangle, Edit } from 'lucide-react';

const OcrFieldIndicator = ({ confidence, wasEdited }) => {
  if (!confidence) return null;

  const getColor = () => {
    if (wasEdited) return 'text-blue-500';
    if (confidence >= 90) return 'text-green-500';
    if (confidence >= 70) return 'text-yellow-500';
    return 'text-orange-500';
  };

  const getIcon = () => {
    if (wasEdited) return <Edit size={16} />;
    if (confidence >= 80) return <CheckCircle size={16} />;
    return <AlertTriangle size={16} />;
  };

  const getTooltip = () => {
    if (wasEdited) return 'Manually edited';
    return `OCR Confidence: ${confidence}%`;
  };

  return (
    <span className={`ocr-indicator ${getColor()}`} title={getTooltip()}>
      {getIcon()}
    </span>
  );
};

export default OcrFieldIndicator;
```

---

#### Component 3: `ContractorMatchSelector.jsx`

**Purpose**: Display contractor matches from OCR vendor name

**Location**: `frontend-v2/src/components/expenses/ContractorMatchSelector.jsx`

**Implementation**:
```jsx
// frontend-v2/src/components/expenses/ContractorMatchSelector.jsx
import React from 'react';
import { Check, User } from 'lucide-react';

const ContractorMatchSelector = ({ matches, selectedId, onSelect }) => {
  if (!matches || matches.length === 0) return null;

  return (
    <div className="contractor-matches">
      <p className="matches-header">
        Found {matches.length} matching contractor{matches.length > 1 ? 's' : ''}:
      </p>
      <div className="matches-list">
        {matches.map((match) => (
          <div
            key={match.contractorId}
            className={`match-item ${selectedId === match.contractorId ? 'selected' : ''}`}
            onClick={() => onSelect(match.contractorId)}
          >
            <div className="match-icon">
              {selectedId === match.contractorId ? (
                <Check size={20} className="text-green-500" />
              ) : (
                <User size={20} className="text-gray-400" />
              )}
            </div>
            <div className="match-details">
              <div className="match-name">{match.contractorName}</div>
              <div className="match-info">
                {match.phone && <span>{match.phone}</span>}
                {match.email && <span>{match.email}</span>}
              </div>
            </div>
            <div className="match-score">
              <span className={`score ${match.matchScore >= 90 ? 'high' : match.matchScore >= 75 ? 'medium' : 'low'}`}>
                {match.matchScore}% match
              </span>
            </div>
          </div>
        ))}
      </div>

      <style jsx>{`
        .contractor-matches {
          margin: 1rem 0;
          padding: 1rem;
          background-color: #f7fafc;
          border-radius: 8px;
        }

        .matches-header {
          font-weight: 600;
          margin-bottom: 0.75rem;
          color: #2d3748;
        }

        .matches-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .match-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem;
          background-color: white;
          border: 2px solid #e2e8f0;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .match-item:hover {
          border-color: #4299e1;
        }

        .match-item.selected {
          border-color: #48bb78;
          background-color: #f0fff4;
        }

        .match-details {
          flex: 1;
        }

        .match-name {
          font-weight: 500;
          color: #2d3748;
        }

        .match-info {
          font-size: 0.875rem;
          color: #718096;
          display: flex;
          gap: 1rem;
        }

        .score {
          font-size: 0.875rem;
          font-weight: 600;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
        }

        .score.high {
          background-color: #c6f6d5;
          color: #22543d;
        }

        .score.medium {
          background-color: #fef5e7;
          color: #744210;
        }

        .score.low {
          background-color: #fed7d7;
          color: #742a2a;
        }
      `}</style>
    </div>
  );
};

export default ContractorMatchSelector;
```

---

### 3.2 Modified Components

#### Modification 1: `AddExpensePage.jsx` (or equivalent)

**Changes**: Integrate OCR upload component and handle pre-filled form

**Location**: `frontend-v2/src/pages/expenses/AddExpensePage.jsx`

**New State Management**:
```jsx
const [ocrData, setOcrData] = useState(null);
const [ocrMetadata, setOcrMetadata] = useState(null);
const [contractorMatches, setContractorMatches] = useState([]);
const [editedFields, setEditedFields] = useState(new Set());

const handleOcrComplete = async (extractedData) => {
  setOcrData(extractedData);
  setOcrMetadata(extractedData.ocrMetadata);

  // Pre-fill form fields
  setFormData({
    amount: extractedData.amount || '',
    date: extractedData.date || '',
    invoiceNum: extractedData.invoiceNum || '',
    description: extractedData.description || '',
    receiptImage: extractedData.receiptUrl || '',
    projectId: formData.projectId, // Keep existing selection
    contractorId: '', // Wait for contractor match
    paymentMethod: formData.paymentMethod || 'credit'
  });

  // Try to match contractor
  if (extractedData.vendor) {
    try {
      const matchResponse = await fetch(
        `${process.env.VITE_API_URL}/expenses/match-contractor`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${await window.Clerk.session.getToken()}`
          },
          body: JSON.stringify({
            vendorName: extractedData.vendor,
            companyId: user.companyId
          })
        }
      );

      const matchResult = await matchResponse.json();
      setContractorMatches(matchResult.data.matches || []);

      // Auto-select if high confidence match
      if (matchResult.data.suggestedMatch) {
        setFormData(prev => ({
          ...prev,
          contractorId: matchResult.data.suggestedMatch
        }));
      }
    } catch (error) {
      console.error('Contractor matching failed:', error);
    }
  }
};

const handleFieldChange = (fieldName, value) => {
  setFormData(prev => ({ ...prev, [fieldName]: value }));

  // Track edited fields
  if (ocrData && ocrData[fieldName]) {
    setEditedFields(prev => new Set(prev).add(fieldName));
  }
};

const handleSubmit = async (e) => {
  e.preventDefault();

  // Prepare expense data with OCR metadata
  const expenseData = {
    ...formData,
    ocrMetadata: ocrMetadata ? {
      ...ocrMetadata,
      confidence: ocrData.confidence,
      wasEdited: editedFields.size > 0,
      editedFields: Array.from(editedFields)
    } : null
  };

  // Submit to addExpense endpoint (existing logic)
  // ...
};
```

**Render Changes**:
```jsx
return (
  <div className="add-expense-page">
    <h1>Add New Expense</h1>

    {/* OCR Upload Section */}
    <section className="ocr-upload-section">
      <h2>Upload Receipt (Optional)</h2>
      <ReceiptUploadWithOCR
        onOcrComplete={handleOcrComplete}
        onError={(error) => console.error(error)}
        companyId={user.companyId}
        disabled={!!ocrData}
      />
      {ocrData && (
        <div className="ocr-success-message">
          ✓ Receipt processed! Review and modify the details below.
        </div>
      )}
    </section>

    {/* Expense Form */}
    <form onSubmit={handleSubmit}>
      {/* Amount Field */}
      <div className="form-field">
        <label>
          Amount
          {ocrData?.confidence?.amount && (
            <OcrFieldIndicator
              confidence={ocrData.confidence.amount}
              wasEdited={editedFields.has('amount')}
            />
          )}
        </label>
        <input
          type="number"
          step="0.01"
          value={formData.amount}
          onChange={(e) => handleFieldChange('amount', e.target.value)}
          required
        />
      </div>

      {/* Date Field */}
      <div className="form-field">
        <label>
          Date
          {ocrData?.confidence?.date && (
            <OcrFieldIndicator
              confidence={ocrData.confidence.date}
              wasEdited={editedFields.has('date')}
            />
          )}
        </label>
        <input
          type="date"
          value={formData.date}
          onChange={(e) => handleFieldChange('date', e.target.value)}
          required
        />
      </div>

      {/* Invoice Number Field */}
      <div className="form-field">
        <label>
          Invoice Number
          {ocrData?.confidence?.invoiceNum && (
            <OcrFieldIndicator
              confidence={ocrData.confidence.invoiceNum}
              wasEdited={editedFields.has('invoiceNum')}
            />
          )}
        </label>
        <input
          type="text"
          value={formData.invoiceNum}
          onChange={(e) => handleFieldChange('invoiceNum', e.target.value)}
          required
        />
      </div>

      {/* Contractor Field with Match Selector */}
      <div className="form-field">
        <label>Contractor</label>
        {contractorMatches.length > 0 ? (
          <ContractorMatchSelector
            matches={contractorMatches}
            selectedId={formData.contractorId}
            onSelect={(id) => handleFieldChange('contractorId', id)}
          />
        ) : (
          <select
            value={formData.contractorId}
            onChange={(e) => handleFieldChange('contractorId', e.target.value)}
            required
          >
            <option value="">Select Contractor</option>
            {contractors.map((c) => (
              <option key={c.contractorId} value={c.contractorId}>
                {c.contractorName}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Other fields... */}

      <button type="submit">Add Expense</button>
    </form>
  </div>
);
```

---

### 3.3 Service Layer

#### New API Service: `ocrService.js`

**Location**: `frontend-v2/src/services/ocrService.js`

**Implementation**:
```javascript
// frontend-v2/src/services/ocrService.js
import { getAuthToken } from './authService';

const API_URL = import.meta.env.VITE_API_URL;

export const processReceiptOCR = async (receiptUrl, companyId) => {
  try {
    const token = await getAuthToken();

    const response = await fetch(`${API_URL}/expenses/ocr-process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        receiptUrl,
        companyId
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'OCR processing failed');
    }

    return await response.json();
  } catch (error) {
    console.error('OCR processing error:', error);
    throw error;
  }
};

export const matchContractor = async (vendorName, companyId) => {
  try {
    const token = await getAuthToken();

    const response = await fetch(`${API_URL}/expenses/match-contractor`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        vendorName,
        companyId
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Contractor matching failed');
    }

    return await response.json();
  } catch (error) {
    console.error('Contractor matching error:', error);
    throw error;
  }
};

export const uploadReceiptWithOCR = async (file, companyId) => {
  try {
    const token = await getAuthToken();

    // Step 1: Get pre-signed URL
    const urlResponse = await fetch(`${API_URL}/upload-receipt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size
      })
    });

    if (!urlResponse.ok) {
      throw new Error('Failed to get upload URL');
    }

    const { data: uploadData } = await urlResponse.json();

    // Step 2: Upload to S3
    const uploadResponse = await fetch(uploadData.uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type
      },
      body: file
    });

    if (!uploadResponse.ok) {
      throw new Error('Failed to upload file');
    }

    // Step 3: Process with OCR
    if (uploadData.ocrEnabled) {
      const ocrResult = await processReceiptOCR(uploadData.receiptUrl, companyId);
      return {
        ...ocrResult.data,
        receiptUrl: uploadData.receiptUrl
      };
    }

    return {
      receiptUrl: uploadData.receiptUrl
    };
  } catch (error) {
    console.error('Receipt upload error:', error);
    throw error;
  }
};
```

---

### 3.4 User Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                   USER JOURNEY: OCR Expense                  │
└─────────────────────────────────────────────────────────────┘

1. USER STARTS
   │
   ├─> Clicks "Add Expense"
   │
   └─> Lands on Add Expense Page

2. RECEIPT UPLOAD
   │
   ├─> Clicks "Upload Receipt" button
   │
   ├─> Selects image file from device
   │
   ├─> [Loading: "Uploading receipt..."]
   │   └─> Progress bar shows 0% → 40%
   │
   └─> Receipt uploaded to S3

3. OCR PROCESSING
   │
   ├─> [Loading: "Extracting expense details..."]
   │   └─> Progress bar shows 40% → 100%
   │
   ├─> Textract analyzes image (2-5 seconds)
   │
   └─> [Success: "Receipt processed successfully!"]

4. FORM PRE-FILLED
   │
   ├─> Amount: $1,250.50 ✓ (99% confidence)
   │
   ├─> Date: 2025-12-01 ✓ (95% confidence)
   │
   ├─> Invoice #: INV-2025-001 ⚠ (82% confidence)
   │
   ├─> Description: "Lumber, nails, screws"
   │
   └─> Contractor: Shows 3 matches
       ├─> "ABC Supplies Inc" (95% match) ← Auto-selected
       ├─> "ABC Building Supplies" (82% match)
       └─> "ABC Hardware" (75% match)

5. USER REVIEWS & EDITS
   │
   ├─> Verifies amount (correct ✓)
   │
   ├─> Corrects invoice # to "INV-2025-0012" ✏
   │   └─> Field marked as "Manually edited"
   │
   ├─> Selects correct contractor from matches
   │
   ├─> Selects project from dropdown
   │
   └─> Selects payment method

6. USER SUBMITS
   │
   ├─> Clicks "Add Expense"
   │
   ├─> Validation runs (all fields valid ✓)
   │
   ├─> Expense saved with OCR metadata:
   │   {
   │     amount: 1250.50,
   │     invoiceNum: "INV-2025-0012", // edited
   │     ocrMetadata: {
   │       textractJobId: "...",
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
```

---

## Phase 4: Testing Strategy

### 4.1 Backend Tests

#### Test 1: OCR Lambda Function Test

**File**: `tests/lambda/processReceiptOCR.test.js`

```javascript
// tests/lambda/processReceiptOCR.test.js
const AWS = require('aws-sdk');
const { handler } = require('../../lambda/processReceiptOCR');

// Mock AWS SDK
jest.mock('aws-sdk');

describe('processReceiptOCR Lambda', () => {
  beforeEach(() => {
    process.env.TEXTRACT_REGION = 'us-east-1';
    process.env.RECEIPTS_BUCKET = 'test-bucket';
    process.env.OCR_CONFIDENCE_THRESHOLD = '80';
  });

  test('should extract expense data from receipt', async () => {
    // Mock Textract response
    const mockTextractResponse = {
      ExpenseDocuments: [{
        SummaryFields: [
          {
            Type: { Text: 'TOTAL' },
            ValueDetection: { Text: '$1,250.50', Confidence: 99 }
          },
          {
            Type: { Text: 'INVOICE_RECEIPT_DATE' },
            ValueDetection: { Text: '12/01/2025', Confidence: 95 }
          },
          {
            Type: { Text: 'INVOICE_RECEIPT_ID' },
            ValueDetection: { Text: 'INV-2025-001', Confidence: 88 }
          }
        ]
      }]
    };

    AWS.Textract.mockImplementation(() => ({
      analyzeExpense: jest.fn().mockReturnValue({
        promise: jest.fn().mockResolvedValue(mockTextractResponse)
      })
    }));

    const event = {
      body: JSON.stringify({
        receiptUrl: 'https://test-bucket.s3.amazonaws.com/company123/receipts/receipt-123.jpg',
        companyId: 'company_123'
      }),
      requestContext: {
        authorizer: {
          userId: 'user_123',
          companyId: 'company_123'
        }
      }
    };

    const result = await handler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.extractedFields.amount).toBe(1250.50);
    expect(body.data.extractedFields.date).toBe('2025-12-01');
    expect(body.data.extractedFields.invoiceNum).toBe('INV-2025-001');
    expect(body.data.extractedFields.confidence.amount).toBe(99);
  });

  test('should handle Textract errors', async () => {
    AWS.Textract.mockImplementation(() => ({
      analyzeExpense: jest.fn().mockReturnValue({
        promise: jest.fn().mockRejectedValue(new Error('Textract failed'))
      })
    }));

    const event = {
      body: JSON.stringify({
        receiptUrl: 'https://test-bucket.s3.amazonaws.com/company123/receipts/receipt-123.jpg',
        companyId: 'company_123'
      }),
      requestContext: {
        authorizer: {
          userId: 'user_123',
          companyId: 'company_123'
        }
      }
    };

    const result = await handler(event);

    expect(result.statusCode).toBe(500);
  });
});
```

#### Test 2: Contractor Matching Test

**File**: `tests/lambda/matchContractor.test.js`

```javascript
// tests/lambda/matchContractor.test.js
const { handler } = require('../../lambda/matchContractor');
const { dynamoOperation } = require('../../lambda/shared/multi-table-utils');

jest.mock('../../lambda/shared/multi-table-utils', () => ({
  dynamoOperation: jest.fn(),
  TABLE_NAMES: { CONTRACTORS: 'test-contractors' }
}));

describe('matchContractor Lambda', () => {
  test('should find high-confidence matches', async () => {
    const mockContractors = {
      Items: [
        { contractorId: 'c1', contractorName: 'ABC Supplies Inc' },
        { contractorId: 'c2', contractorName: 'ABC Building Supplies' },
        { contractorId: 'c3', contractorName: 'XYZ Company' }
      ]
    };

    dynamoOperation.mockResolvedValue(mockContractors);

    const event = {
      body: JSON.stringify({
        vendorName: 'ABC Supplies',
        companyId: 'company_123'
      }),
      requestContext: {
        authorizer: {
          userId: 'user_123',
          companyId: 'company_123'
        }
      }
    };

    const result = await handler(event);
    const body = JSON.parse(result.body);

    expect(result.statusCode).toBe(200);
    expect(body.data.matches.length).toBeGreaterThan(0);
    expect(body.data.matches[0].matchScore).toBeGreaterThan(80);
    expect(body.data.suggestedMatch).toBe('c1'); // Should suggest highest match
  });
});
```

---

### 4.2 Frontend Tests

#### Test 1: Receipt Upload Component Test

**File**: `frontend-v2/src/components/expenses/__tests__/ReceiptUploadWithOCR.test.jsx`

```javascript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ReceiptUploadWithOCR from '../ReceiptUploadWithOCR';

describe('ReceiptUploadWithOCR', () => {
  test('should upload and process receipt', async () => {
    const onOcrComplete = jest.fn();
    const onError = jest.fn();

    // Mock fetch API
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ // Upload URL request
        ok: true,
        json: async () => ({
          data: {
            uploadUrl: 'https://s3.amazonaws.com/upload',
            receiptUrl: 'https://s3.amazonaws.com/receipt.jpg',
            ocrEnabled: true
          }
        })
      })
      .mockResolvedValueOnce({ // S3 upload
        ok: true
      })
      .mockResolvedValueOnce({ // OCR processing
        ok: true,
        json: async () => ({
          data: {
            extractedFields: {
              amount: 1250.50,
              date: '2025-12-01',
              invoiceNum: 'INV-001',
              confidence: { amount: 99, date: 95 }
            }
          }
        })
      });

    render(
      <ReceiptUploadWithOCR
        onOcrComplete={onOcrComplete}
        onError={onError}
        companyId="company_123"
        disabled={false}
      />
    );

    const file = new File(['receipt'], 'receipt.jpg', { type: 'image/jpeg' });
    const input = screen.getByLabelText(/upload receipt/i);

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(onOcrComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 1250.50,
          date: '2025-12-01',
          invoiceNum: 'INV-001'
        })
      );
    });
  });
});
```

---

### 4.3 End-to-End Tests (Playwright)

#### E2E Test: Complete OCR Flow

**File**: `tests/e2e/ocr-expense-flow.spec.js`

```javascript
// tests/e2e/ocr-expense-flow.spec.js
const { test, expect } = require('@playwright/test');

test.describe('OCR Expense Upload Flow', () => {
  test('should upload receipt, process OCR, and create expense', async ({ page }) => {
    // Navigate to app
    await page.goto('https://d6dvynagj630i.cloudfront.net');

    // Login
    await page.fill('input[name="email"]', 'maordaniel40@gmail.com');
    await page.fill('input[name="password"]', '19735Maor');
    await page.click('button:has-text("Sign in")');

    // Wait for dashboard
    await expect(page.locator('h1:has-text("Dashboard")')).toBeVisible();

    // Navigate to Add Expense
    await page.click('a:has-text("Add Expense")');

    // Upload receipt
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles('./tests/fixtures/sample-receipt.jpg');

    // Wait for OCR processing
    await expect(page.locator('text=Extracting expense details')).toBeVisible();
    await expect(page.locator('text=Receipt processed successfully')).toBeVisible({ timeout: 30000 });

    // Verify form is pre-filled
    const amountInput = page.locator('input[name="amount"]');
    await expect(amountInput).toHaveValue(/\d+\.\d+/);

    const dateInput = page.locator('input[name="date"]');
    await expect(dateInput).not.toBeEmpty();

    const invoiceInput = page.locator('input[name="invoiceNum"]');
    await expect(invoiceInput).not.toBeEmpty();

    // Select project
    await page.selectOption('select[name="projectId"]', { index: 1 });

    // Select contractor (should show matches)
    await expect(page.locator('text=Found')).toBeVisible();
    await page.click('.match-item:first-child');

    // Select payment method
    await page.selectOption('select[name="paymentMethod"]', 'credit');

    // Submit expense
    await page.click('button:has-text("Add Expense")');

    // Verify success
    await expect(page.locator('text=Expense added successfully')).toBeVisible();
  });

  test('should handle OCR errors gracefully', async ({ page }) => {
    // Upload invalid file
    await page.goto('https://d6dvynagj630i.cloudfront.net/expenses/add');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles('./tests/fixtures/invalid-file.txt');

    // Verify error message
    await expect(page.locator('text=Invalid file type')).toBeVisible();
  });
});
```

---

## Phase 5: Deployment Plan

### 5.1 Deployment Steps

#### Step 1: AWS IAM Policy (5 minutes)
```bash
# Create Textract policy
aws iam create-policy \
  --policy-name TextractExpenseAnalysisPolicy \
  --policy-document file://infrastructure/textract-policy.json

# Attach to Lambda role
LAMBDA_ROLE_NAME=$(aws cloudformation describe-stacks \
  --stack-name construction-expenses-production \
  --query 'Stacks[0].Outputs[?OutputKey==`LambdaExecutionRoleName`].OutputValue' \
  --output text)

aws iam attach-role-policy \
  --role-name $LAMBDA_ROLE_NAME \
  --policy-arn arn:aws:iam::702358134603:policy/TextractExpenseAnalysisPolicy
```

**Rollback**: Detach policy if issues arise

---

#### Step 2: Deploy Lambda Functions (10 minutes)
```bash
# Package new Lambda functions
npm run package

# Deploy processReceiptOCR
aws lambda create-function \
  --function-name construction-expenses-process-receipt-ocr \
  --runtime nodejs18.x \
  --role arn:aws:iam::702358134603:role/lambda-execution-role \
  --handler processReceiptOCR.handler \
  --zip-file fileb://dist/processReceiptOCR.zip \
  --timeout 30 \
  --memory-size 512 \
  --environment Variables="{OCR_ENABLED=true,TEXTRACT_REGION=us-east-1}"

# Deploy matchContractor
aws lambda create-function \
  --function-name construction-expenses-match-contractor \
  --runtime nodejs18.x \
  --role arn:aws:iam::702358134603:role/lambda-execution-role \
  --handler matchContractor.handler \
  --zip-file fileb://dist/matchContractor.zip \
  --timeout 10 \
  --memory-size 256

# Update existing addExpense Lambda
aws lambda update-function-code \
  --function-name construction-expenses-add-expense \
  --zip-file fileb://dist/addExpense.zip
```

**Rollback**: Delete new functions, restore previous version of addExpense

---

#### Step 3: Configure API Gateway (5 minutes)
```bash
# Run endpoint creation script
./scripts/deploy-ocr-endpoints.sh
```

**Rollback**: Delete new resources via API Gateway console

---

#### Step 4: Deploy Frontend (10 minutes)
```bash
# Build frontend
cd frontend-v2
npm run build

# Deploy to S3
aws s3 sync dist/ s3://construction-expenses-frontend-bucket/ --delete

# Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id E3EYFZ54GJKVNL \
  --paths "/*"
```

**Rollback**: Restore previous S3 version

---

#### Step 5: Enable Feature Flag (Instant)
```bash
# Update Lambda environment variable
aws lambda update-function-configuration \
  --function-name construction-expenses-process-receipt-ocr \
  --environment Variables="{OCR_ENABLED=true,TEXTRACT_REGION=us-east-1,OCR_CONFIDENCE_THRESHOLD=80}"
```

**Rollback**: Set `OCR_ENABLED=false`

---

#### Step 6: Smoke Testing (10 minutes)
```bash
# Test OCR endpoint
curl -X POST https://2woj5i92td.execute-api.us-east-1.amazonaws.com/prod/expenses/ocr-process \
  -H "Authorization: Bearer $CLERK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"receiptUrl":"...","companyId":"company_123"}'

# Test contractor matching
curl -X POST https://2woj5i92td.execute-api.us-east-1.amazonaws.com/prod/expenses/match-contractor \
  -H "Authorization: Bearer $CLERK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"vendorName":"ABC Supplies","companyId":"company_123"}'
```

**Rollback**: If tests fail, disable feature flag and investigate

---

### 5.2 Monitoring & Alerts

#### CloudWatch Metrics

**Custom Metrics to Track**:
```javascript
// In processReceiptOCR.js
const cloudwatch = new AWS.CloudWatch();

await cloudwatch.putMetricData({
  Namespace: 'ConstructionExpenses/OCR',
  MetricData: [{
    MetricName: 'OcrProcessingTime',
    Value: processingTimeMs,
    Unit: 'Milliseconds'
  }, {
    MetricName: 'OcrConfidenceScore',
    Value: averageConfidence,
    Unit: 'Percent'
  }, {
    MetricName: 'OcrSuccess',
    Value: 1,
    Unit: 'Count'
  }]
}).promise();
```

**CloudWatch Alarms**:
```bash
# OCR Processing Errors
aws cloudwatch put-metric-alarm \
  --alarm-name ocr-processing-errors \
  --metric-name Errors \
  --namespace AWS/Lambda \
  --statistic Sum \
  --period 300 \
  --threshold 5 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 1 \
  --dimensions Name=FunctionName,Value=construction-expenses-process-receipt-ocr

# OCR Processing Duration
aws cloudwatch put-metric-alarm \
  --alarm-name ocr-processing-slow \
  --metric-name Duration \
  --namespace AWS/Lambda \
  --statistic Average \
  --period 300 \
  --threshold 10000 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2 \
  --dimensions Name=FunctionName,Value=construction-expenses-process-receipt-ocr
```

---

#### Sentry Error Tracking

**Update Sentry Configuration**:
```javascript
// In processReceiptOCR.js
const Sentry = require('@sentry/aws-serverless');

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT,
  tracesSampleRate: 1.0,
  beforeSend(event) {
    // Add OCR context
    if (event.contexts) {
      event.contexts.ocr = {
        confidence: extractedConfidence,
        processingTime: processingTimeMs,
        documentType: textractResponse.DocumentMetadata?.DocumentType
      };
    }
    return event;
  }
});
```

---

## Technical Decisions & Trade-offs

### Decision 1: AWS Textract vs. Alternatives

**Chosen**: AWS Textract AnalyzeExpense API

**Alternatives Considered**:
- Google Cloud Vision API
- Tesseract.js (client-side)
- Azure Form Recognizer

**Rationale**:
- ✅ Native AWS integration (no data sovereignty issues)
- ✅ Specialized expense/receipt analysis
- ✅ High accuracy (~95%+)
- ✅ Pay-per-use pricing (~$0.017/page)
- ✅ Automatic confidence scoring
- ❌ Vendor lock-in (mitigated by abstraction layer)

---

### Decision 2: Synchronous vs. Asynchronous Processing

**Chosen**: Synchronous with fallback to async

**Rationale**:
- ✅ Better UX (immediate feedback)
- ✅ Textract AnalyzeExpense is fast (2-5 seconds)
- ✅ Lambda timeout set to 30s (sufficient)
- ❌ Could timeout for large/complex receipts (fallback: retry with async)

**Future Enhancement**: Implement SQS queue for async processing if needed

---

### Decision 3: Contractor Matching Algorithm

**Chosen**: Levenshtein distance with fuzzy matching

**Alternatives Considered**:
- Exact match only
- Soundex algorithm
- AWS Comprehend entity recognition

**Rationale**:
- ✅ No additional AWS service costs
- ✅ Good balance of accuracy and speed
- ✅ Works well for typos and variations
- ❌ May miss abbreviations (future enhancement)

---

### Decision 4: OCR Metadata Storage

**Chosen**: Store in DynamoDB with expense record

**Alternatives Considered**:
- Separate OCR audit table
- S3 JSON files
- Don't store (use only for form pre-fill)

**Rationale**:
- ✅ Enables future analytics on OCR accuracy
- ✅ Helps troubleshoot user-reported issues
- ✅ No additional storage costs (small data size)
- ✅ Useful for ML model improvement

---

## Security Considerations

### 1. Receipt Image Access Control
- All receipt URLs are company-scoped: `/{companyId}/receipts/`
- Lambda validates company ownership before OCR processing
- S3 bucket has company-level IAM restrictions

### 2. Textract Data Privacy
- Receipt data stays within AWS infrastructure
- No third-party API calls
- Textract does not retain processed documents

### 3. OCR Confidence Thresholds
- Fields below 80% confidence are flagged
- Users must review and confirm all OCR-extracted data
- Manual edit tracking prevents blind trust in OCR

### 4. API Rate Limiting
- Textract API has default limits: 5 TPS for AnalyzeExpense
- Implement exponential backoff retry logic
- Monitor Lambda concurrency to avoid hitting limits

---

## Cost Estimation

### Monthly Cost Breakdown (3,000 expenses/month)

| Service | Usage | Unit Cost | Monthly Cost |
|---------|-------|-----------|--------------|
| **AWS Textract** | 3,000 pages | $0.017/page | $51.00 |
| **Lambda Execution** | 3,000 invocations @ 512MB, 5s avg | $0.0000166667/GB-second | $5.00 |
| **S3 Storage** | Incremental (receipts already stored) | - | $0.00 |
| **API Gateway** | 6,000 requests (OCR + match) | $0.0000035/request | $0.02 |
| **CloudWatch Logs** | 10 GB/month | $0.50/GB | $5.00 |
| **Total** | | | **$61.02** |

**Cost per Expense**: ~$0.02

**ROI Calculation**:
- Time saved: ~1.5 minutes per expense
- 3,000 expenses/month = 4,500 minutes = 75 hours
- At $25/hour labor cost: **$1,875/month saved**
- **ROI**: 30.7x return on investment

---

## Success Metrics

### Key Performance Indicators (KPIs)

1. **OCR Accuracy Rate**: >90% of fields extracted correctly
2. **User Edit Rate**: <30% of OCR-extracted fields manually edited
3. **Time Saved**: Average expense creation time reduced by 60%
4. **Adoption Rate**: >70% of users use OCR feature within 30 days
5. **Error Rate**: <5% OCR processing failures

### Monitoring Dashboard

```javascript
// Sample CloudWatch dashboard
{
  "widgets": [
    {
      "type": "metric",
      "properties": {
        "title": "OCR Processing Success Rate",
        "metrics": [
          ["ConstructionExpenses/OCR", "OcrSuccess"],
          [".", "OcrFailure"]
        ]
      }
    },
    {
      "type": "metric",
      "properties": {
        "title": "Average OCR Confidence Score",
        "metrics": [
          ["ConstructionExpenses/OCR", "OcrConfidenceScore", { "stat": "Average" }]
        ]
      }
    },
    {
      "type": "metric",
      "properties": {
        "title": "OCR Processing Time (ms)",
        "metrics": [
          ["ConstructionExpenses/OCR", "OcrProcessingTime", { "stat": "Average" }],
          ["...", { "stat": "p99" }]
        ]
      }
    }
  ]
}
```

---

## Future Enhancements

### Phase 2 Features (3-6 months)

1. **Bulk Receipt Upload**: Process multiple receipts in batch
2. **Mobile App Integration**: Camera capture with instant OCR
3. **ML Model Fine-Tuning**: Train custom model on user corrections
4. **Automatic Project Detection**: Use description to suggest projects
5. **Multi-Language Support**: Hebrew, Arabic, Spanish receipts
6. **Invoice vs. Receipt Detection**: Different workflows for different document types

---

## Appendix

### A. Sample Textract Response

```json
{
  "DocumentMetadata": {
    "Pages": 1
  },
  "ExpenseDocuments": [
    {
      "ExpenseIndex": 1,
      "SummaryFields": [
        {
          "Type": {
            "Text": "VENDOR_NAME",
            "Confidence": 99.8
          },
          "ValueDetection": {
            "Text": "ABC Supplies Inc",
            "Confidence": 99.5
          }
        },
        {
          "Type": {
            "Text": "INVOICE_RECEIPT_ID",
            "Confidence": 95.2
          },
          "ValueDetection": {
            "Text": "INV-2025-001",
            "Confidence": 88.7
          }
        },
        {
          "Type": {
            "Text": "INVOICE_RECEIPT_DATE",
            "Confidence": 98.1
          },
          "ValueDetection": {
            "Text": "12/01/2025",
            "Confidence": 95.3
          }
        },
        {
          "Type": {
            "Text": "TOTAL",
            "Confidence": 99.9
          },
          "ValueDetection": {
            "Text": "$1,250.50",
            "Confidence": 99.1
          }
        }
      ],
      "LineItemGroups": [
        {
          "LineItemGroupIndex": 1,
          "LineItems": [
            {
              "LineItemExpenseFields": [
                {
                  "Type": {
                    "Text": "ITEM"
                  },
                  "ValueDetection": {
                    "Text": "2x4 Lumber"
                  }
                },
                {
                  "Type": {
                    "Text": "PRICE"
                  },
                  "ValueDetection": {
                    "Text": "$450.00"
                  }
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

### B. Environment Variables Checklist

```bash
# .env.production
NODE_ENV=production
AWS_REGION=us-east-1

# OCR Configuration
OCR_ENABLED=true
TEXTRACT_REGION=us-east-1
OCR_CONFIDENCE_THRESHOLD=80
OCR_TIMEOUT_MS=30000
OCR_MAX_RETRIES=3

# S3 Configuration
RECEIPTS_BUCKET=construction-expenses-receipts-702358134603

# API Configuration
API_BASE_URL=https://2woj5i92td.execute-api.us-east-1.amazonaws.com/prod

# Existing variables (unchanged)
TABLE_NAME=construction-expenses-production-table
CLERK_AUTH_ENABLED=true
SENTRY_ENVIRONMENT=production
```

### C. Lambda Function Mapping

| Function Name | AWS Name | Handler | Timeout | Memory |
|--------------|----------|---------|---------|--------|
| processReceiptOCR | construction-expenses-process-receipt-ocr | processReceiptOCR.handler | 30s | 512MB |
| matchContractor | construction-expenses-match-contractor | matchContractor.handler | 10s | 256MB |
| addExpense (updated) | construction-expenses-add-expense | addExpense.handler | 10s | 256MB |
| uploadReceipt (updated) | construction-expenses-upload-receipt | uploadReceipt.handler | 10s | 256MB |

---

## Implementation Checklist

### Pre-Implementation
- [ ] Review and approve implementation plan
- [ ] Set up AWS Textract IAM permissions
- [ ] Create test receipt images for development
- [ ] Set up Textract sandbox environment for testing

### Phase 1: AWS Setup
- [ ] Create Textract IAM policy
- [ ] Attach policy to Lambda execution role
- [ ] Add environment variables to .env.production
- [ ] Test Textract API access with sample receipt

### Phase 2: Backend Development
- [ ] Implement processReceiptOCR.js Lambda function
- [ ] Implement matchContractor.js Lambda function
- [ ] Update addExpense.js with OCR metadata tracking
- [ ] Update uploadReceipt.js with OCR endpoint info
- [ ] Write backend unit tests
- [ ] Package and deploy Lambda functions
- [ ] Configure API Gateway endpoints
- [ ] Test endpoints with curl/Postman

### Phase 3: Frontend Development
- [ ] Create ReceiptUploadWithOCR component
- [ ] Create OcrFieldIndicator component
- [ ] Create ContractorMatchSelector component
- [ ] Update AddExpensePage with OCR integration
- [ ] Implement ocrService.js API calls
- [ ] Add OCR-related styling
- [ ] Write frontend component tests
- [ ] Test locally with mock data

### Phase 4: Integration Testing
- [ ] Test complete upload → OCR → form flow locally
- [ ] Test with various receipt formats (clear, blurry, handwritten)
- [ ] Test error scenarios (invalid files, Textract failures)
- [ ] Test contractor matching with real data
- [ ] Write Playwright E2E tests
- [ ] Run full test suite

### Phase 5: Deployment
- [ ] Deploy Lambda functions to production
- [ ] Deploy API Gateway endpoints
- [ ] Deploy frontend to S3/CloudFront
- [ ] Enable OCR feature flag
- [ ] Run smoke tests in production
- [ ] Monitor CloudWatch logs for errors
- [ ] Monitor Sentry for exceptions

### Post-Deployment
- [ ] Monitor OCR accuracy metrics
- [ ] Collect user feedback
- [ ] Track cost vs. budget
- [ ] Document any issues encountered
- [ ] Plan Phase 2 enhancements

---

**END OF IMPLEMENTATION PLAN**

---

**Document Status**: ✅ Ready for Review
**Next Action**: Review with development team → Begin Phase 1
**Questions?** Contact: [Your Contact Info]
