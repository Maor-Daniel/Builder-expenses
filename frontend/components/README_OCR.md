# ReceiptUploadWithOCR Component Documentation

## Overview

The `ReceiptUploadWithOCR` component is a complete solution for receipt upload with automatic OCR (Optical Character Recognition) processing. It handles file selection, validation, progress indication, OCR API calls, and result display.

**Version**: 2.0.0
**Architecture**: Vanilla JavaScript (no framework dependencies)
**OCR Backend**: AWS Textract via API Gateway

---

## Table of Contents

1. [Features](#features)
2. [Architecture](#architecture)
3. [Installation](#installation)
4. [Basic Usage](#basic-usage)
5. [Advanced Usage](#advanced-usage)
6. [Component API](#component-api)
7. [State Diagram](#state-diagram)
8. [Styling](#styling)
9. [Accessibility](#accessibility)
10. [Troubleshooting](#troubleshooting)
11. [Examples](#examples)

---

## Features

### Core Features

- ✅ **File Selection**: Click to select or drag-and-drop
- ✅ **File Validation**: Type and size validation with clear error messages
- ✅ **Progress Indication**: Visual progress bar (20% → 60% → 100%)
- ✅ **OCR Processing**: Automatic extraction of amount, date, invoice number, vendor, description
- ✅ **Confidence Scoring**: Visual indicators for high/medium/low confidence fields
- ✅ **Receipt Preview**: Thumbnail with extracted fields summary
- ✅ **Error Handling**: User-friendly error messages with retry option
- ✅ **Memory-Only Upload**: No S3 upload until form submission (v2.0 architecture)

### Technical Features

- ✅ **Vanilla JavaScript**: No React/Vue dependencies
- ✅ **Event-Driven**: Callbacks for success and error
- ✅ **Responsive Design**: Mobile and desktop friendly
- ✅ **Accessibility**: WCAG 2.1 Level AA compliant
- ✅ **Hebrew RTL Support**: Full right-to-left layout
- ✅ **Dark Mode**: Optional dark mode support
- ✅ **Keyboard Navigation**: Full keyboard accessibility

---

## Architecture

### v2.0 Flow (No Orphaned Receipts)

```
┌─────────────────────────────────────────────────────────────┐
│                    User Interaction                         │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
         ┌─────────────────────────┐
         │  Select Receipt File    │
         │  (Click or Drag-Drop)   │
         └────────────┬────────────┘
                      │
                      ▼
         ┌─────────────────────────┐
         │   Validate File         │
         │   - Type (JPG/PNG/PDF)  │
         │   - Size (Max 5MB)      │
         └────────┬────────────────┘
                  │
                  ├─[Invalid]─→ Show Error
                  │
                  ▼ [Valid]
         ┌─────────────────────────┐
         │  Convert to Base64      │
         │  (FileReader API)       │
         └────────┬────────────────┘
                  │
                  ▼
         ┌─────────────────────────┐
         │  Call OCR API           │
         │  POST /ocr-process      │
         │  (With Clerk JWT)       │
         └────────┬────────────────┘
                  │
                  ├─[Error]─→ Show Error + Retry
                  │
                  ▼ [Success]
         ┌─────────────────────────┐
         │  Parse OCR Result       │
         │  - Extract fields       │
         │  - Calculate confidence │
         └────────┬────────────────┘
                  │
                  ▼
         ┌─────────────────────────┐
         │  Display Preview        │
         │  - Thumbnail            │
         │  - Extracted fields     │
         │  - Confidence scores    │
         └────────┬────────────────┘
                  │
                  ▼
         ┌─────────────────────────┐
         │  Trigger onOcrComplete  │
         │  Callback with:         │
         │  - Extracted fields     │
         │  - Receipt File         │
         │  - Receipt Base64       │
         └────────┬────────────────┘
                  │
                  ▼
         ┌─────────────────────────┐
         │  Parent Form Pre-fills  │
         │  (User Reviews/Edits)   │
         └────────┬────────────────┘
                  │
                  ▼
         ┌─────────────────────────┐
         │  User Clicks Submit     │
         └────────┬────────────────┘
                  │
                  ▼
         ┌─────────────────────────┐
         │  Upload to S3           │
         │  (From receiptFile)     │
         └────────┬────────────────┘
                  │
                  ▼
         ┌─────────────────────────┐
         │  Create Expense         │
         │  (With receipt URL)     │
         └─────────────────────────┘
```

**Key Improvement**: Receipt file stays in memory (JavaScript `File` object) until final submission, preventing orphaned S3 uploads.

---

## Installation

### 1. Copy Component Files

Copy these files to your project:

```bash
frontend/
├── components/
│   ├── ReceiptUploadWithOCR.js      # Main component
│   ├── ReceiptUploadWithOCR.css     # Styling
│   └── OcrFieldIndicator.js         # Field indicator component
└── utils/
    └── ocrApi.js                     # OCR API client
```

### 2. Include in HTML

```html
<!-- Include FontAwesome for icons -->
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">

<!-- Include component styles -->
<link rel="stylesheet" href="/frontend/components/ReceiptUploadWithOCR.css">

<!-- Include component scripts -->
<script src="/frontend/utils/ocrApi.js"></script>
<script src="/frontend/components/OcrFieldIndicator.js"></script>
<script src="/frontend/components/ReceiptUploadWithOCR.js"></script>
```

### 3. Add Container Element

```html
<div id="receipt-upload-container"></div>
```

---

## Basic Usage

### Minimal Example

```javascript
// Initialize component
const receiptUpload = new ReceiptUploadWithOCR('receipt-upload-container', {
  companyId: 'comp_abc123',

  onOcrComplete: (ocrResult) => {
    console.log('OCR complete!', ocrResult);

    // Pre-fill form fields
    document.getElementById('amount').value = ocrResult.extractedFields.amount || '';
    document.getElementById('date').value = ocrResult.extractedFields.date || '';
    document.getElementById('invoiceNum').value = ocrResult.extractedFields.invoiceNum || '';
    document.getElementById('vendor').value = ocrResult.extractedFields.vendor || '';

    // Store receipt for later upload
    window.currentReceiptFile = ocrResult.receiptFile;
  },

  onError: (error) => {
    console.error('OCR error:', error);
    alert(`שגיאה: ${error.message}`);
  }
});
```

---

## Advanced Usage

### Complete Integration with Form

```javascript
class ExpenseFormManager {
  constructor() {
    this.formData = {};
    this.receiptData = null;
    this.initializeForm();
  }

  initializeForm() {
    // Get company ID from Clerk authentication
    const companyId = window.clerk.user.publicMetadata.companyId;

    // Initialize OCR component
    this.receiptUpload = new ReceiptUploadWithOCR('receipt-upload-container', {
      companyId: companyId,
      onOcrComplete: this.handleOcrSuccess.bind(this),
      onError: this.handleOcrError.bind(this),
      apiEndpoint: 'https://2woj5i92td.execute-api.us-east-1.amazonaws.com/production/expenses/ocr-process'
    });

    // Set up form submission
    document.getElementById('expense-form').addEventListener('submit', this.handleSubmit.bind(this));
  }

  handleOcrSuccess(ocrResult) {
    console.log('[ExpenseForm] OCR completed successfully', ocrResult);

    // Store receipt data for later upload
    this.receiptData = ocrResult;

    // Pre-fill form with extracted data
    this.prefillForm(ocrResult.extractedFields);

    // Show confidence warnings if needed
    if (ocrResult.ocrMetadata.lowConfidenceFields.length > 0) {
      this.showConfidenceWarning(ocrResult.ocrMetadata.lowConfidenceFields);
    }

    // Enable submit button
    document.getElementById('submit-btn').disabled = false;
  }

  handleOcrError(error) {
    console.error('[ExpenseForm] OCR failed', error);

    // Show user-friendly error
    this.showNotification('error', `שגיאה בעיבוד הקבלה: ${error.message}`);

    // Allow manual entry
    this.showManualEntryOption();
  }

  prefillForm(extractedFields) {
    // Amount
    if (extractedFields.amount !== null) {
      document.getElementById('expense-amount').value = extractedFields.amount;
    }

    // Date (convert to YYYY-MM-DD if needed)
    if (extractedFields.date) {
      document.getElementById('expense-date').value = this.formatDate(extractedFields.date);
    }

    // Invoice number
    if (extractedFields.invoiceNum) {
      document.getElementById('expense-invoice').value = extractedFields.invoiceNum;
    }

    // Vendor
    if (extractedFields.vendor) {
      document.getElementById('expense-vendor').value = extractedFields.vendor;
    }

    // Description
    if (extractedFields.description) {
      document.getElementById('expense-description').value = extractedFields.description;
    }

    // Highlight pre-filled fields
    this.highlightPrefilledFields();
  }

  formatDate(dateString) {
    // Handle various date formats from OCR
    // Example: "12/03/2025" → "2025-03-12"
    const parts = dateString.split(/[\/\-\.]/);
    if (parts.length === 3) {
      // Assume DD/MM/YYYY format
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    return dateString;
  }

  showConfidenceWarning(lowConfidenceFields) {
    const fieldNames = lowConfidenceFields.map(field => {
      const names = {
        'amount': 'סכום',
        'date': 'תאריך',
        'invoiceNum': 'מספר חשבונית',
        'vendor': 'ספק'
      };
      return names[field] || field;
    });

    const message = `שימו לב: השדות הבאים זוהו עם רמת ביטחון נמוכה ומומלץ לבדוק ידנית: ${fieldNames.join(', ')}`;

    this.showNotification('warning', message);
  }

  highlightPrefilledFields() {
    // Add visual indication to pre-filled fields
    const fields = ['expense-amount', 'expense-date', 'expense-invoice', 'expense-vendor'];
    fields.forEach(fieldId => {
      const field = document.getElementById(fieldId);
      if (field && field.value) {
        field.classList.add('prefilled-by-ocr');
      }
    });
  }

  showManualEntryOption() {
    const message = 'לא הצלחנו לעבד את הקבלה אוטומטית. תוכל להזין את הפרטים ידנית.';
    this.showNotification('info', message);

    // Enable all form fields for manual entry
    document.querySelectorAll('#expense-form input, #expense-form select').forEach(field => {
      field.disabled = false;
    });
  }

  async handleSubmit(event) {
    event.preventDefault();

    // Disable submit button to prevent double submission
    const submitBtn = document.getElementById('submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'שומר...';

    try {
      // 1. Upload receipt to S3 (if exists)
      let receiptUrl = null;
      if (this.receiptData && this.receiptData.receiptFile) {
        receiptUrl = await this.uploadReceiptToS3(this.receiptData.receiptFile);
      }

      // 2. Get form data
      const formData = this.getFormData();

      // 3. Create expense with receipt URL
      await this.createExpense({
        ...formData,
        receiptUrl
      });

      // 4. Success!
      this.showNotification('success', 'ההוצאה נשמרה בהצלחה!');
      this.resetForm();

    } catch (error) {
      console.error('[ExpenseForm] Submit failed', error);
      this.showNotification('error', `שגיאה בשמירת ההוצאה: ${error.message}`);
      submitBtn.disabled = false;
      submitBtn.textContent = 'שמור';
    }
  }

  async uploadReceiptToS3(file) {
    // Get authentication token
    const token = await window.clerk.session.getToken();

    // Create form data
    const formData = new FormData();
    formData.append('receipt', file);

    // Upload to S3 via Lambda
    const response = await fetch('/api/upload-receipt', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    if (!response.ok) {
      throw new Error('Failed to upload receipt');
    }

    const result = await response.json();
    return result.receiptUrl;
  }

  getFormData() {
    return {
      amount: parseFloat(document.getElementById('expense-amount').value),
      date: document.getElementById('expense-date').value,
      invoiceNum: document.getElementById('expense-invoice').value,
      vendor: document.getElementById('expense-vendor').value,
      description: document.getElementById('expense-description').value,
      paymentMethod: document.getElementById('expense-payment').value,
      projectId: document.getElementById('expense-project').value,
      contractorId: document.getElementById('expense-contractor').value
    };
  }

  async createExpense(expenseData) {
    const token = await window.clerk.session.getToken();

    const response = await fetch('/api/expenses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(expenseData)
    });

    if (!response.ok) {
      throw new Error('Failed to create expense');
    }

    return response.json();
  }

  resetForm() {
    document.getElementById('expense-form').reset();
    this.receiptUpload.reset();
    this.receiptData = null;
    document.getElementById('submit-btn').disabled = false;
    document.getElementById('submit-btn').textContent = 'שמור';
  }

  showNotification(type, message) {
    // Implement your notification system
    console.log(`[${type.toUpperCase()}]`, message);
  }
}

// Initialize
const expenseFormManager = new ExpenseFormManager();
```

---

## Component API

### Constructor

```javascript
new ReceiptUploadWithOCR(containerId, options)
```

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `containerId` | `string` | Yes | ID of the container element |
| `options` | `Object` | Yes | Component options (see below) |

#### Options Object

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `onOcrComplete` | `Function` | Yes | - | Callback when OCR succeeds |
| `onError` | `Function` | Yes | - | Callback when OCR fails |
| `companyId` | `string` | Yes | - | Company ID from authentication |
| `disabled` | `boolean` | No | `false` | Disable component |
| `apiEndpoint` | `string` | No | Production endpoint | OCR API URL |

### Methods

#### `reset()`

Reset component to initial state (idle).

```javascript
receiptUpload.reset();
```

#### `getOcrResult()`

Get the current OCR result object.

```javascript
const result = receiptUpload.getOcrResult();
console.log(result.extractedFields);
```

#### `setDisabled(disabled)`

Enable or disable the component.

```javascript
receiptUpload.setDisabled(true);  // Disable
receiptUpload.setDisabled(false); // Enable
```

#### `destroy()`

Clean up and remove component.

```javascript
receiptUpload.destroy();
```

### OCR Result Object

The `onOcrComplete` callback receives an `OcrResult` object:

```typescript
interface OcrResult {
  extractedFields: {
    amount: number | null;
    date: string | null;            // YYYY-MM-DD format
    invoiceNum: string | null;
    vendor: string | null;
    description: string | null;
    confidence: {
      amount: number;                // 0-100
      date: number;                  // 0-100
      invoiceNum: number;            // 0-100
      vendor: number;                // 0-100
    };
  };
  ocrMetadata: {
    processingTimeMs: number;
    documentType: string;            // "RECEIPT" or "INVOICE"
    fileName: string;
    lineItemsCount: number;
    lowConfidenceFields: string[];   // Fields with confidence < 80%
  };
  receiptFile: File;                 // Original File object
  receiptBase64: string;             // Base64 data URL for preview
}
```

---

## State Diagram

```
┌────────────────────────────────────────────────────────────┐
│                                                            │
│                         IDLE                               │
│                                                            │
│  - Upload zone visible                                     │
│  - Click or drag-drop to select file                       │
│                                                            │
└──────────────────┬─────────────────────────────────────────┘
                   │
                   │ [File Selected]
                   │
                   ▼
┌────────────────────────────────────────────────────────────┐
│                                                            │
│                    PROCESSING                              │
│                                                            │
│  - Progress bar visible (20% → 60% → 100%)                 │
│  - Converting to base64                                    │
│  - Calling OCR API                                         │
│  - Parsing results                                         │
│                                                            │
└──────┬──────────────────────────────────────────┬──────────┘
       │                                          │
       │ [Success]                                │ [Error]
       │                                          │
       ▼                                          ▼
┌────────────────────────┐          ┌────────────────────────┐
│                        │          │                        │
│       SUCCESS          │          │        ERROR           │
│                        │          │                        │
│  - Preview visible     │          │  - Error message       │
│  - Thumbnail           │          │  - Retry button        │
│  - Extracted fields    │          │  - Cancel button       │
│  - Change button       │          │                        │
│                        │          │                        │
└────────┬───────────────┘          └─────────┬──────────────┘
         │                                    │
         │ [Change/Clear]                     │ [Retry]
         │                                    │
         └────────┬───────────────────────────┘
                  │
                  ▼
            ┌─────────┐
            │  IDLE   │
            └─────────┘
```

---

## Styling

### CSS Classes

| Class | Description |
|-------|-------------|
| `.receipt-upload-ocr` | Main container |
| `.ocr-upload-zone` | Upload zone (idle state) |
| `.ocr-progress-container` | Progress bar container |
| `.ocr-preview-container` | Preview container (success) |
| `.ocr-error-container` | Error container |
| `.field-indicator` | Individual field display |
| `.field-indicator[data-confidence="high"]` | High confidence field (green) |
| `.field-indicator[data-confidence="medium"]` | Medium confidence field (yellow) |
| `.field-indicator[data-confidence="low"]` | Low confidence field (red) |

### Customization

Override CSS variables for easy theming:

```css
.receipt-upload-ocr {
  --primary-color: #3182ce;
  --success-color: #10b981;
  --warning-color: #f59e0b;
  --error-color: #ef4444;
  --border-radius: 12px;
  --spacing: 1rem;
}
```

---

## Accessibility

### WCAG 2.1 Level AA Compliance

- ✅ **Keyboard Navigation**: Tab, Enter, Space keys supported
- ✅ **Screen Reader Support**: ARIA labels and roles
- ✅ **Focus Management**: Visible focus indicators
- ✅ **Color Contrast**: Meets 4.5:1 ratio
- ✅ **Error Messages**: Clear, descriptive errors
- ✅ **Alternative Text**: All images have alt text

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Tab` | Navigate between elements |
| `Enter` or `Space` | Open file selector when upload zone focused |
| `Escape` | Cancel current operation |

### Screen Reader Announcements

- File selection confirmed
- Upload progress updates
- Success/error states
- Confidence warnings

---

## Troubleshooting

### Common Issues

#### 1. **Component doesn't render**

**Problem**: Container element not found

**Solution**:
```javascript
// Make sure container exists before initialization
if (document.getElementById('receipt-upload-container')) {
  const receiptUpload = new ReceiptUploadWithOCR('receipt-upload-container', options);
}
```

#### 2. **OCR API returns 401 Unauthorized**

**Problem**: Invalid or missing authentication token

**Solution**:
```javascript
// Ensure Clerk is initialized and user is authenticated
if (window.clerk && window.clerk.session) {
  const token = await window.clerk.session.getToken();
  // Token will be automatically used by component
}
```

#### 3. **File too large error**

**Problem**: File exceeds 5MB limit

**Solution**:
- Compress image before upload
- Use lower resolution camera setting
- Convert PDF to images

#### 4. **Low confidence on all fields**

**Problem**: Receipt image quality is poor

**Solution**:
- Ensure good lighting
- Avoid shadows and glare
- Keep receipt flat and in focus
- Use higher resolution

#### 5. **OCR returns null for all fields**

**Problem**: Receipt format not recognized

**Solution**:
- Ensure receipt is clear and legible
- Check that text is horizontal
- Try different receipt formats (PDF vs image)
- Manually enter data as fallback

### Debug Mode

Enable debug logging:

```javascript
// Set debug flag before initialization
window.OCR_DEBUG = true;

const receiptUpload = new ReceiptUploadWithOCR('receipt-upload-container', options);
```

---

## Examples

See `/Users/maordaniel/Ofek/frontend/examples/ocr-integration-example.html` for complete working examples.

---

## Support

For issues or questions:
- Check troubleshooting section
- Review console logs
- Contact development team

---

**Version**: 2.0.0
**Last Updated**: 2025-12-03
**Author**: Construction Expense Tracking System Team
