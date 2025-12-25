# Mobile App OCR Implementation Guide

**Construction Expenses Tracking System - Smart Receipt OCR**

**Version:** 2.0
**Last Updated:** 2025-12-22
**Target:** Mobile App Development Team

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [User Flow](#user-flow)
3. [API Endpoint](#api-endpoint)
4. [Authentication](#authentication)
5. [Request Format](#request-format)
6. [Response Format](#response-format)
7. [Extracted Fields](#extracted-fields)
8. [Error Handling](#error-handling)
9. [Contractor Matching](#contractor-matching)
10. [UI/UX Guidelines](#uiux-guidelines)
11. [Implementation Examples](#implementation-examples)
12. [Testing](#testing)

---

## 📖 Overview

### What is Smart OCR?

The Smart OCR feature uses **Claude 3.5 Sonnet AI** (via OpenRouter) to automatically extract expense information from receipt images. It provides:

- ✅ **Automatic field extraction** (amount, date, vendor, invoice number, description)
- ✅ **Payment method inference** (cash, credit card, bank transfer, check)
- ✅ **Intelligent contractor matching** (fuzzy matching with existing contractors)
- ✅ **Confidence scoring** (0-100 for each field)
- ✅ **Hebrew & English support** (native Hebrew OCR)
- ✅ **Multi-format support** (JPG, PNG, PDF)

### Architecture

```
Mobile App
    ↓ (1) Capture/Select Receipt Image
    ↓ (2) Convert to Base64
    ↓ (3) Send to OCR API
    ↓
API Gateway → Lambda (processReceiptOCR)
    ↓
    ├─→ Claude 3.5 Sonnet (OpenRouter) - Primary OCR
    └─→ Contractor Matching (DynamoDB)
    ↓
    ↓ (4) Return Extracted Fields
Mobile App
    ↓ (5) Pre-fill Form
    ↓ (6) User Reviews & Submits
```

---

## 🔄 User Flow

### Step-by-Step Experience

```
1. User opens "Add Expense" screen
       ↓
2. User taps "Upload Receipt" button
       ↓
3. System shows options:
   - 📷 Take Photo
   - 🖼️ Choose from Gallery
       ↓
4. User selects/captures receipt image
       ↓
5. App validates image:
   - Size ≤ 5MB
   - Format: JPG, PNG, or PDF
       ↓
6. App shows "Processing..." indicator
   Progress: 0% → 20% → 60% → 80% → 100%
       ↓
7. OCR processes image (2-5 seconds)
       ↓
8. App displays extracted fields:
   ✅ Amount: ₪1,250 (95% confidence)
   ✅ Date: 2025-12-21 (92% confidence)
   ✅ Invoice: #INV-12345 (88% confidence)
   ✅ Vendor: "חברת בניין מגדל" (85% confidence)
   ⚠️  Description: null (low confidence)
       ↓
9. Fields auto-populate in form
   (User can edit any field)
       ↓
10. User reviews, edits if needed, submits
       ↓
11. Receipt uploads to S3
    Expense saved to database
```

### States

| State | Description | Duration |
|-------|-------------|----------|
| **Idle** | Waiting for user to select receipt | - |
| **Validating** | Checking file size & format | <1s |
| **Processing** | OCR in progress | 2-5s |
| **Success** | Fields extracted, showing preview | - |
| **Error** | OCR failed, showing error message | - |

---

## 🔌 API Endpoint

### Endpoint Details

```
POST /expenses/ocr-process
```

**Full URL:**
```
https://2woj5i92td.execute-api.us-east-1.amazonaws.com/prod/expenses/ocr-process
```

**Method:** `POST`
**Content-Type:** `application/json`
**Authentication:** Bearer Token (Clerk JWT)

---

## 🔐 Authentication

### Required Headers

```http
POST /expenses/ocr-process HTTP/1.1
Host: 2woj5i92td.execute-api.us-east-1.amazonaws.com
Content-Type: application/json
Authorization: Bearer <CLERK_JWT_TOKEN>
```

### How to Get Auth Token

The mobile app must use **Clerk** for authentication. After user signs in:

```javascript
// Example using Clerk React Native
import { useAuth } from '@clerk/clerk-react';

const { getToken } = useAuth();
const token = await getToken();

// Use token in API request
fetch(apiEndpoint, {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

### Company Context

The API automatically extracts `companyId` and `userId` from the JWT token. No need to send them explicitly.

---

## 📤 Request Format

### Request Body

```json
{
  "receiptBase64": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
  "fileName": "receipt-20251222-143055.jpg",
  "fileSize": 1048576
}
```

### Request Fields

| Field | Type | Required | Description | Max Size |
|-------|------|----------|-------------|----------|
| `receiptBase64` | string | ✅ Yes | Base64-encoded image with data URI prefix | 5MB |
| `fileName` | string | ✅ Yes | Original file name (for logging) | 255 chars |
| `fileSize` | number | ❌ No | File size in bytes (for validation) | 5242880 |

### Base64 Format

**With Data URI prefix** (preferred):
```
data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAA...
```

**Without prefix** (also accepted):
```
/9j/4AAQSkZJRgABAQAA...
```

### Supported Image Formats

| Format | MIME Type | Extension |
|--------|-----------|-----------|
| JPEG | `image/jpeg` | `.jpg`, `.jpeg` |
| PNG | `image/png` | `.png` |
| PDF | `application/pdf` | `.pdf` |

### File Size Limits

- **Maximum:** 5MB (5,242,880 bytes)
- **Recommended:** 1-2MB (compress before sending)

---

## 📥 Response Format

### Success Response (200 OK)

```json
{
  "success": true,
  "data": {
    "extractedFields": {
      "amount": 1250.5,
      "date": "2025-12-21",
      "invoiceNum": "INV-12345",
      "vendor": "חברת בניין מגדל",
      "description": "חומרי בניה - ברזלים ומלט",
      "paymentMethod": "כרטיס אשראי",
      "confidence": {
        "amount": 95,
        "date": 92,
        "invoiceNum": 88,
        "vendor": 85,
        "description": 78,
        "paymentMethod": 90
      },
      "contractorMatch": {
        "contractorId": "contractor_abc123",
        "name": "חברת בניין מגדל בע\"מ",
        "confidence": 85
      }
    },
    "ocrMetadata": {
      "processingTimeMs": 3245,
      "provider": "claude-3.5-sonnet",
      "documentType": "RECEIPT",
      "fileName": "receipt-20251222-143055.jpg",
      "lowConfidenceFields": ["description"],
      "paymentMethodReasoning": "Detected credit card terminal receipt with VISA logo"
    }
  },
  "timestamp": "2025-12-22T14:30:58.123Z"
}
```

### Field-by-Field Breakdown

#### `extractedFields` Object

| Field | Type | Description | Example | Can be null? |
|-------|------|-------------|---------|--------------|
| `amount` | number | Total amount (no currency) | `1250.5` | ✅ Yes |
| `date` | string | Date in YYYY-MM-DD format | `"2025-12-21"` | ✅ Yes |
| `invoiceNum` | string | Invoice/receipt number | `"INV-12345"` | ✅ Yes |
| `vendor` | string | Vendor/company name | `"חברת בניין מגדל"` | ✅ Yes |
| `description` | string | Items/services description | `"חומרי בניה"` | ✅ Yes |
| `paymentMethod` | string | Payment method (see below) | `"כרטיס אשראי"` | ✅ Yes |

#### Payment Method Values

| Value (Hebrew) | Meaning | Triggers |
|----------------|---------|----------|
| `"מזומן"` | Cash | "קופה", "cash register", "מזומן" |
| `"כרטיס אשראי"` | Credit Card | Credit card terminal, "VISA", "Mastercard" |
| `"העברה בנקאית"` | Bank Transfer | Invoice format, bank details present |
| `"צ'ק"` | Check | Check number visible, "צ'ק" |
| `null` | Unknown | Not detected with confidence |

#### `confidence` Object

All confidence scores are **0-100**:
- **90-100:** Very high confidence (green indicator)
- **70-89:** Medium confidence (yellow indicator)
- **< 70:** Low confidence (red indicator, returned as `null`)

#### `contractorMatch` Object

Automatically matches vendor to existing contractors using fuzzy matching:

| Field | Type | Description |
|-------|------|-------------|
| `contractorId` | string | Matched contractor's ID |
| `name` | string | Contractor's full name from database |
| `confidence` | number | Match confidence (0-100) |

**Match Algorithm:**
- Exact match: 100%
- Substring match: 90-95%
- Levenshtein distance: 70-90%
- Minimum threshold: 70%

**If no match found:** `contractorMatch` = `null`

#### `ocrMetadata` Object

| Field | Type | Description |
|-------|------|-------------|
| `processingTimeMs` | number | OCR processing time in milliseconds |
| `provider` | string | Always `"claude-3.5-sonnet"` |
| `documentType` | string | Always `"RECEIPT"` |
| `fileName` | string | Original file name echoed back |
| `lowConfidenceFields` | array | Fields with confidence < 70% |
| `paymentMethodReasoning` | string/null | AI explanation for payment method |

---

## ❌ Error Responses

### Error Response Format

```json
{
  "success": false,
  "error": {
    "message": "Receipt is too large for instant OCR (6MB). Maximum is 5MB.",
    "code": "PAYLOAD_TOO_LARGE"
  },
  "timestamp": "2025-12-22T14:30:58.123Z"
}
```

### HTTP Status Codes

| Status | Error | Description | User-Friendly Message (Hebrew) |
|--------|-------|-------------|--------------------------------|
| **400** | Bad Request | Missing required fields | "בקשה לא תקינה. נא לנסות שוב" |
| **401** | Unauthorized | Missing/invalid auth token | "נדרשת אימות. התחבר מחדש" |
| **413** | Payload Too Large | File > 5MB | "הקובץ גדול מדי. מקסימום 5MB" |
| **429** | Too Many Requests | Rate limit exceeded | "יותר מדי בקשות. נסה שוב בעוד רגע" |
| **500** | Internal Server Error | OCR processing failed | "שגיאת שרת. נסה שוב מאוחר יותר" |

### Common Error Scenarios

#### 1. File Too Large (413)

```json
{
  "success": false,
  "error": {
    "message": "Receipt is too large for instant OCR (6MB). Maximum is 5MB. Please compress the image or upload without OCR.",
    "code": "PAYLOAD_TOO_LARGE"
  }
}
```

**Solution:** Compress image before sending

#### 2. Invalid Base64 (400)

```json
{
  "success": false,
  "error": {
    "message": "Invalid base64 encoding in receiptBase64",
    "code": "INVALID_BASE64"
  }
}
```

**Solution:** Verify base64 encoding is correct

#### 3. Missing Authentication (401)

```json
{
  "success": false,
  "error": {
    "message": "Authentication required",
    "code": "UNAUTHORIZED"
  }
}
```

**Solution:** Ensure Clerk JWT token is included in Authorization header

#### 4. Unsupported Format (400)

```json
{
  "success": false,
  "error": {
    "message": "Unsupported receipt format. Please upload JPG, PNG, or PDF.",
    "code": "UNSUPPORTED_FORMAT"
  }
}
```

**Solution:** Convert image to supported format

#### 5. Rate Limit (429)

```json
{
  "success": false,
  "error": {
    "message": "OCR request rate limit exceeded. Please try again in a moment.",
    "code": "RATE_LIMIT_EXCEEDED"
  }
}
```

**Solution:** Implement exponential backoff retry

---

## 🎯 Extracted Fields - Detailed Guide

### 1. Amount (`amount`)

**Type:** `number | null`
**Example:** `1250.5`

**What it extracts:**
- Total amount from receipt
- Removes currency symbols (₪, $, etc.)
- Handles comma/dot variations (1,250.50 or 1.250,50)

**Edge cases:**
- Multiple amounts → Extracts the "Total" or largest value
- Including VAT → Usually includes VAT
- Null if not found with >70% confidence

**UI Guidance:**
- Display as: `₪{amount.toLocaleString('he-IL')}`
- Editable by user
- Highlight if confidence < 90%

---

### 2. Date (`date`)

**Type:** `string | null` (YYYY-MM-DD)
**Example:** `"2025-12-21"`

**What it extracts:**
- Receipt date
- Standardized to ISO 8601 format
- Handles Hebrew dates (converts to Gregorian)

**Edge cases:**
- Multiple dates → Prefers "Date" or "Transaction Date"
- Partial dates → Attempts to infer
- Null if not found with >70% confidence

**UI Guidance:**
- Display as: Hebrew format (21/12/2025)
- Use date picker for editing
- Default to today if null

---

### 3. Invoice Number (`invoiceNum`)

**Type:** `string | null`
**Example:** `"INV-12345"` or `"חשבונית 5678"`

**What it extracts:**
- Invoice/receipt number
- Preserves format (alphanumeric, dashes, etc.)

**Edge cases:**
- Multiple numbers → Prefers labeled "Invoice #"
- Null if not clear

**UI Guidance:**
- Display as-is
- Optional field
- Useful for tracking

---

### 4. Vendor (`vendor`)

**Type:** `string | null`
**Example:** `"חברת בניין מגדל בע\"מ"`

**What it extracts:**
- Company/business name that issued receipt
- Usually from header or footer
- Preserves original spelling (Hebrew/English)

**Edge cases:**
- Multiple businesses → Prefers larger/bolded text
- Null if unclear

**UI Guidance:**
- Display as-is
- If `contractorMatch` exists, show suggestion:
  ```
  "חברת בניין מגדל"
  💡 האם זה: חברת בניין מגדל בע"מ? (85% התאמה)
  ```

---

### 5. Description (`description`)

**Type:** `string | null`
**Example:** `"חומרי בניה - ברזלים ומלט"`

**What it extracts:**
- **Handwritten text** describing items/services
- Looks for sections labeled "פריטים" or "פירוט"
- **NOT** the vendor name

**Important Rules:**
- Does NOT use vendor/company name as description
- Focuses on handwritten item lists
- Returns `null` if no handwritten description found

**Edge cases:**
- Printed item lists → May extract
- Very long descriptions → Truncated to 500 chars
- Null if not found (common!)

**UI Guidance:**
- Optional field
- User can add manually
- Show placeholder: "הוסף תיאור (אופציונלי)"

---

### 6. Payment Method (`paymentMethod`)

**Type:** `string | null`
**Values:** `"מזומן"` | `"כרטיס אשראי"` | `"העברה בנקאית"` | `"צ'ק"` | `null`

**What it infers:**
- Analyzes receipt format and context
- Looks for payment-related keywords
- Infers based on receipt type

**Detection Logic:**

| Payment Method | Detection Triggers |
|----------------|-------------------|
| **מזומן** (Cash) | "קופה", "cash register", "מזומן", cash receipt format |
| **כרטיס אשראי** (Credit Card) | Credit card terminal, "VISA", "Mastercard", "אשראי", card logos |
| **העברה בנקאית** (Bank Transfer) | Invoice format, bank account details, "העברה" |
| **צ'ק** (Check) | Check number, "צ'ק", check format |

**Reasoning Field:**
The API provides `paymentMethodReasoning` explaining why a method was chosen:
```json
{
  "paymentMethod": "כרטיס אשראי",
  "reasoning": {
    "paymentMethod": "Detected credit card terminal receipt with VISA logo and approval code"
  }
}
```

**UI Guidance:**
- Show dropdown with 4 options + "אחר"
- Pre-select if detected
- Show reasoning as tooltip/hint
- Allow user to change

---

## 🔍 Contractor Matching

### How It Works

When vendor is extracted, the API automatically:
1. Queries company's contractors from DynamoDB
2. Uses **fuzzy matching** (Levenshtein distance) to find best match
3. Returns match if confidence ≥ 70%

### Matching Algorithm

```javascript
// Example matches:
"חברת בניין מגדל" → "חברת בניין מגדל בע\"מ" (95%)
"בניין מגדל" → "חברת בניין מגדל בע\"מ" (90%)
"magdal" → "חברת בניין מגדל בע\"מ" (0% - no match)
```

**Exact Match:** 100%
**Substring Match:** 90-95%
**Levenshtein Match:** 70-90%
**Below 70%:** No match returned

### Using Contractor Match

```json
{
  "contractorMatch": {
    "contractorId": "contractor_abc123",
    "name": "חברת בניין מגדל בע\"מ",
    "confidence": 85
  }
}
```

**UI Implementation:**

```
┌─────────────────────────────────────┐
│ ספק                                 │
│ ┌─────────────────────────────────┐ │
│ │ חברת בניין מגדל              ✓ │ │  ← Extracted vendor
│ └─────────────────────────────────┘ │
│                                     │
│ 💡 התאמה אוטומטית (85%)           │
│ האם זה: חברת בניין מגדל בע"מ?     │
│ [✓ כן, השתמש בזה] [× לא, תקן]      │  ← Suggestion
└─────────────────────────────────────┘
```

**User Actions:**
- **Accept:** Use `contractorId` from match
- **Reject:** Keep original vendor text, don't use `contractorId`
- **Edit:** Allow manual selection from contractor dropdown

---

## 🎨 UI/UX Guidelines

### 1. Receipt Upload Screen

#### Upload Zone (Idle State)

```
┌─────────────────────────────────────┐
│              📷                     │
│                                     │
│   לחץ להעלאת קבלה או גרור לכאן    │
│   JPG, PNG, PDF עד 5MB            │
│                                     │
│   ✨ זיהוי אוטומטי של פרטי הקבלה  │
│                                     │
│   [📷 צלם קבלה]  [🖼️ בחר מגלריה]   │
└─────────────────────────────────────┘
```

#### Processing State

```
┌─────────────────────────────────────┐
│        ⚙️ מעבד את הקבלה...          │
│                                     │
│   ████████████░░░░░░░░  60%        │
│                                     │
│   קורא את הטקסט מהתמונה...          │
│   זה לוקח בערך 3-5 שניות           │
└─────────────────────────────────────┘
```

**Progress Steps:**
1. 0-20%: "מכין את התמונה..."
2. 20-60%: "שולח לעיבוד..."
3. 60-80%: "קורא את הטקסט..."
4. 80-100%: "מסיים..."

#### Success State with Preview

```
┌─────────────────────────────────────┐
│  ✅ קבלה עובדה בהצלחה!          [×] │
│                                     │
│  ┌──────────────────────────────┐  │
│  │     [Receipt Thumbnail]      │  │
│  │                              │  │
│  └──────────────────────────────┘  │
│  receipt-20251222.jpg               │
│                                     │
│  שדות שזוהו:                        │
│  ✅ סכום:          ₪1,250 (95%)     │
│  ✅ תאריך:         21/12/2025 (92%) │
│  ✅ חשבונית:       #INV-123 (88%)   │
│  ✅ ספק:           חברת בניה (85%)  │
│  ⚠️  תיאור:        לא זוהה (65%)    │
│                                     │
│  [החלף קבלה]                        │
└─────────────────────────────────────┘
```

**Confidence Indicators:**
- ✅ Green check (90-100%)
- ⚠️ Yellow warning (70-89%)
- ❌ Red X (< 70% or null)

#### Error State

```
┌─────────────────────────────────────┐
│        ⚠️ שגיאה בעיבוד הקבלה        │
│                                     │
│  הקובץ גדול מדי (6MB).              │
│  גודל מקסימלי: 5MB                 │
│                                     │
│  [🔄 נסה שוב]     [× ביטול]         │
└─────────────────────────────────────┘
```

---

### 2. Auto-Fill Form Behavior

When OCR succeeds, **immediately** pre-fill form fields:

```javascript
// Auto-fill logic
if (ocrResult.extractedFields.amount) {
  formFields.amount = ocrResult.extractedFields.amount;
}

if (ocrResult.extractedFields.date) {
  formFields.date = ocrResult.extractedFields.date;
}

if (ocrResult.extractedFields.invoiceNum) {
  formFields.invoiceNum = ocrResult.extractedFields.invoiceNum;
}

// Contractor match
if (ocrResult.extractedFields.contractorMatch) {
  // Show suggestion, don't auto-fill
  showContractorSuggestion(ocrResult.extractedFields.contractorMatch);
} else if (ocrResult.extractedFields.vendor) {
  // No match, use vendor name as placeholder
  formFields.contractorNote = ocrResult.extractedFields.vendor;
}

if (ocrResult.extractedFields.paymentMethod) {
  formFields.paymentMethod = ocrResult.extractedFields.paymentMethod;
}

if (ocrResult.extractedFields.description) {
  formFields.description = ocrResult.extractedFields.description;
}
```

**Visual Feedback:**
- Highlight auto-filled fields (subtle blue background)
- Show confidence badge next to each field
- Allow user to edit any field
- Clear highlight after user edits

---

### 3. Confidence Indicators

Show confidence visually for each field:

```
┌─────────────────────────────────┐
│ סכום *                          │
│ ₪1,250  [95% ✓]                 │  ← High confidence (green)
└─────────────────────────────────┘

┌─────────────────────────────────┐
│ תיאור                           │
│ חומרי בניה  [72% ⚠️]            │  ← Medium confidence (yellow)
└─────────────────────────────────┘

┌─────────────────────────────────┐
│ חשבונית                         │
│           [לא זוהה ❌]           │  ← Low/no confidence (red)
└─────────────────────────────────┘
```

---

### 4. Loading States

#### Quick Feedback (< 1 second)

Show inline spinner:
```
[⚙️ מעבד...]
```

#### Longer Processing (> 1 second)

Show progress modal:
```
┌─────────────────────────────────┐
│   ⚙️ מעבד את הקבלה...           │
│   ████████░░░░  60%             │
│   קורא את הטקסט מהתמונה...      │
└─────────────────────────────────┘
```

---

### 5. Error Messaging

**User-Friendly Hebrew Messages:**

| Technical Error | User Message |
|----------------|--------------|
| 413 Payload Too Large | "הקובץ גדול מדי. נא לדחוס או לבחור קובץ קטן יותר (עד 5MB)" |
| 401 Unauthorized | "נדרשת אימות. אנא התחבר מחדש לאפליקציה" |
| 429 Rate Limit | "יותר מדי בקשות. אנא המתן רגע ונסה שוב" |
| 500 Internal Error | "אירעה שגיאה. אנא נסה שוב מאוחר יותר" |
| Network Error | "בעיית תקשורת. בדוק את החיבור לאינטרנט" |

---

## 💻 Implementation Examples

### React Native Example

```javascript
import { useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';

const OCR_ENDPOINT = 'https://2woj5i92td.execute-api.us-east-1.amazonaws.com/prod/expenses/ocr-process';
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export function useReceiptOCR() {
  const { getToken } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

  /**
   * Process receipt with OCR
   * @param {string} imageUri - Local file URI from ImagePicker
   * @returns {Promise<Object>} OCR result
   */
  const processReceipt = async (imageUri) => {
    try {
      setIsProcessing(true);
      setProgress(20);
      setError(null);

      // Get file info
      const fileInfo = await FileSystem.getInfoAsync(imageUri);

      if (!fileInfo.exists) {
        throw new Error('הקובץ לא קיים');
      }

      // Check file size
      if (fileInfo.size > MAX_FILE_SIZE) {
        throw new Error(
          `הקובץ גדול מדי (${(fileInfo.size / 1024 / 1024).toFixed(1)}MB). ` +
          `גודל מקסימלי: 5MB`
        );
      }

      // Convert to base64
      setProgress(40);
      const base64 = await FileSystem.readAsStringAsync(imageUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Detect MIME type from URI
      const mimeType = imageUri.match(/\.(jpg|jpeg|png|pdf)$/i)?.[1] || 'jpeg';
      const dataUri = `data:image/${mimeType};base64,${base64}`;

      // Get auth token
      const token = await getToken();
      if (!token) {
        throw new Error('נדרשת אימות. התחבר מחדש');
      }

      // Call OCR API
      setProgress(60);
      const response = await fetch(OCR_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          receiptBase64: dataUri,
          fileName: imageUri.split('/').pop(),
          fileSize: fileInfo.size,
        }),
      });

      setProgress(80);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `שגיאת שרת (${response.status})`);
      }

      const result = await response.json();
      setProgress(100);

      if (!result.success) {
        throw new Error(result.error?.message || 'OCR נכשל');
      }

      return {
        extractedFields: result.data.extractedFields,
        metadata: result.data.ocrMetadata,
        imageUri, // Original image for preview
      };

    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
  };

  /**
   * Pick image from gallery
   */
  const pickFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.8, // Compress to reduce size
      base64: false,
    });

    if (!result.canceled) {
      return await processReceipt(result.assets[0].uri);
    }
    return null;
  };

  /**
   * Take photo with camera
   */
  const takePhoto = async () => {
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality: 0.8,
      base64: false,
    });

    if (!result.canceled) {
      return await processReceipt(result.assets[0].uri);
    }
    return null;
  };

  return {
    processReceipt,
    pickFromGallery,
    takePhoto,
    isProcessing,
    progress,
    error,
  };
}
```

### Usage in Component

```javascript
import React, { useState } from 'react';
import { View, Button, Text, ActivityIndicator } from 'react-native';
import { useReceiptOCR } from './useReceiptOCR';

export function AddExpenseScreen() {
  const { takePhoto, pickFromGallery, isProcessing, progress, error } = useReceiptOCR();
  const [formData, setFormData] = useState({
    amount: '',
    date: '',
    invoiceNum: '',
    contractorId: '',
    description: '',
    paymentMethod: '',
  });

  const handleTakePhoto = async () => {
    try {
      const result = await takePhoto();
      if (result) {
        // Auto-fill form with OCR results
        setFormData({
          amount: result.extractedFields.amount || '',
          date: result.extractedFields.date || '',
          invoiceNum: result.extractedFields.invoiceNum || '',
          description: result.extractedFields.description || '',
          paymentMethod: result.extractedFields.paymentMethod || '',
          // Contractor match
          contractorId: result.extractedFields.contractorMatch?.contractorId || '',
        });

        // Show success message
        alert(`✅ קבלה עובדה בהצלחה! ${Object.keys(result.extractedFields).filter(k => result.extractedFields[k]).length} שדות זוהו`);
      }
    } catch (err) {
      alert(`❌ שגיאה: ${err.message}`);
    }
  };

  const handlePickFromGallery = async () => {
    try {
      const result = await pickFromGallery();
      if (result) {
        // Same auto-fill logic as above
        setFormData({ /* ... */ });
      }
    } catch (err) {
      alert(`❌ שגיאה: ${err.message}`);
    }
  };

  return (
    <View>
      {isProcessing ? (
        <View>
          <ActivityIndicator size="large" />
          <Text>מעבד... {progress}%</Text>
        </View>
      ) : (
        <>
          <Button title="📷 צלם קבלה" onPress={handleTakePhoto} />
          <Button title="🖼️ בחר מגלריה" onPress={handlePickFromGallery} />
        </>
      )}

      {error && <Text style={{ color: 'red' }}>{error}</Text>}

      {/* Form fields... */}
    </View>
  );
}
```

---

## 🧪 Testing

### Test Cases

#### 1. **Successful OCR**
- Upload clear receipt image
- Verify all fields extracted correctly
- Check confidence scores
- Verify contractor matching works

#### 2. **Large File**
- Upload 6MB image
- Expect 413 error
- Verify user-friendly error message

#### 3. **Invalid Format**
- Upload .txt or .doc file
- Expect 400 error
- Verify error message suggests JPG/PNG/PDF

#### 4. **Network Error**
- Simulate offline mode
- Verify timeout handling
- Show appropriate error message

#### 5. **Low Confidence Fields**
- Upload blurry/handwritten receipt
- Verify low-confidence fields shown separately
- User can still edit

#### 6. **Hebrew Receipt**
- Upload Hebrew receipt
- Verify RTL text extracted correctly
- Payment method in Hebrew

#### 7. **Contractor Matching**
- Upload receipt from known contractor
- Verify auto-match suggestion
- User can accept/reject

---

## 📊 Performance Benchmarks

| Metric | Target | Notes |
|--------|--------|-------|
| **Processing Time** | 2-5 seconds | Typical for clear images |
| **Success Rate** | > 90% | For standard receipts |
| **Field Accuracy** | > 85% | Amount, Date, Vendor |
| **Contractor Match** | > 80% | When match exists |
| **File Size** | < 2MB | Recommended for speed |

---

## 🔒 Security Considerations

1. **Authentication:**
   - Always include Clerk JWT in Authorization header
   - Token expires - handle 401 errors

2. **Data Privacy:**
   - Receipt stays in memory (not S3) until form submission
   - No PII stored during OCR process
   - Company-isolated (companyId from JWT)

3. **File Validation:**
   - Check file size client-side before upload
   - Validate MIME type
   - Sanitize file names

4. **Rate Limiting:**
   - Implement client-side debouncing
   - Handle 429 errors with exponential backoff

---

## 📞 Support & Troubleshooting

### Common Issues

**Issue:** "Authentication required"
**Solution:** Ensure user is logged in with Clerk and JWT is valid

**Issue:** "Receipt is too large"
**Solution:** Compress image before sending (reduce quality to 70-80%)

**Issue:** "No fields extracted"
**Solution:** Receipt may be too blurry - ask user to retake photo

**Issue:** "Contractor not matched"
**Solution:** Normal - not all vendors are in contractor database

---

## 📝 API Change Log

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | 2025-12-22 | Migrated to Claude 3.5 Sonnet OCR |
| 1.5 | 2024-11-15 | Added contractor matching |
| 1.0 | 2024-09-01 | Initial AWS Textract implementation |

---

## ✅ Implementation Checklist

Use this checklist to ensure complete implementation:

- [ ] Set up Clerk authentication
- [ ] Implement image picker (camera + gallery)
- [ ] Add image compression (target < 2MB)
- [ ] Implement base64 conversion
- [ ] Create OCR API call function
- [ ] Add progress indicator (0-100%)
- [ ] Implement error handling for all HTTP codes
- [ ] Create auto-fill form logic
- [ ] Add confidence indicators UI
- [ ] Implement contractor match suggestion
- [ ] Add "Change Receipt" functionality
- [ ] Test with Hebrew receipts
- [ ] Test with English receipts
- [ ] Test with blurry images
- [ ] Test with large files (>5MB)
- [ ] Test offline behavior
- [ ] Add analytics/logging
- [ ] Document user feedback flow

---

## 🎯 Summary

The Smart OCR feature provides:
- ✅ **Automatic expense extraction** from receipt images
- ✅ **Claude 3.5 Sonnet AI** for accurate Hebrew/English OCR
- ✅ **Fuzzy contractor matching** for vendor identification
- ✅ **Payment method inference** based on receipt context
- ✅ **Confidence scoring** to guide user validation
- ✅ **Simple REST API** with JSON request/response
- ✅ **Clerk authentication** integration
- ✅ **2-5 second processing** time

**Mobile App Benefits:**
- Reduces manual data entry by 80%+
- Improves accuracy with AI-powered extraction
- Matches vendors to existing contractors automatically
- Provides clear confidence indicators for user review

---

**Questions?** Contact the backend team or refer to the source code in `/lambda/processReceiptOCR.js`

**API Endpoint:** `https://2woj5i92td.execute-api.us-east-1.amazonaws.com/prod/expenses/ocr-process`

---

*Last Updated: 2025-12-22*
*Version: 2.0.0*
*Status: Production Ready* ✅
