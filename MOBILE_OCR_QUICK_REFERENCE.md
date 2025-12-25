# OCR API - Quick Reference Card

**For Mobile App Developers**

---

## 🚀 Quick Start

```javascript
// 1. Get auth token
const token = await getToken(); // From Clerk

// 2. Convert image to base64
const base64 = await convertToBase64(imageUri);

// 3. Call API
const response = await fetch(
  'https://2woj5i92td.execute-api.us-east-1.amazonaws.com/prod/expenses/ocr-process',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      receiptBase64: `data:image/jpeg;base64,${base64}`,
      fileName: 'receipt.jpg',
      fileSize: 1048576
    })
  }
);

// 4. Handle response
const result = await response.json();
if (result.success) {
  const { extractedFields } = result.data;
  // Auto-fill form with extractedFields
}
```

---

## 📋 Request

### Endpoint
```
POST /expenses/ocr-process
Host: 2woj5i92td.execute-api.us-east-1.amazonaws.com/prod
```

### Headers
```http
Content-Type: application/json
Authorization: Bearer <CLERK_JWT>
```

### Body
```json
{
  "receiptBase64": "data:image/jpeg;base64,/9j/4AAQ...",
  "fileName": "receipt.jpg",
  "fileSize": 1048576
}
```

### Limits
- **Max Size:** 5MB
- **Formats:** JPG, PNG, PDF
- **Base64:** With or without data URI prefix

---

## 📥 Response

### Success (200)
```json
{
  "success": true,
  "data": {
    "extractedFields": {
      "amount": 1250.5,
      "date": "2025-12-21",
      "invoiceNum": "INV-123",
      "vendor": "חברת בניין",
      "description": "חומרי בניה",
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
        "contractorId": "contractor_123",
        "name": "חברת בניין בע\"מ",
        "confidence": 85
      }
    },
    "ocrMetadata": {
      "processingTimeMs": 3245,
      "provider": "claude-3.5-sonnet",
      "lowConfidenceFields": []
    }
  }
}
```

---

## ❌ Errors

| Status | Reason | User Message (Hebrew) |
|--------|--------|----------------------|
| 400 | Bad request | "בקשה לא תקינה" |
| 401 | No auth | "התחבר מחדש" |
| 413 | File > 5MB | "הקובץ גדול מדי" |
| 429 | Rate limit | "יותר מדי בקשות" |
| 500 | Server error | "נסה שוב מאוחר יותר" |

---

## 🎯 Extracted Fields

| Field | Type | Example | Nullable |
|-------|------|---------|----------|
| `amount` | number | `1250.5` | ✅ |
| `date` | string | `"2025-12-21"` | ✅ |
| `invoiceNum` | string | `"INV-123"` | ✅ |
| `vendor` | string | `"חברת בניין"` | ✅ |
| `description` | string | `"חומרי בניה"` | ✅ |
| `paymentMethod` | string | `"מזומן"` / `"כרטיס אשראי"` / `"העברה בנקאית"` / `"צ'ק"` | ✅ |

---

## 💰 Payment Methods

| Value | Hebrew | When Detected |
|-------|--------|---------------|
| `"מזומן"` | Cash | Cash register, "קופה" |
| `"כרטיס אשראי"` | Credit Card | VISA, Mastercard logos |
| `"העברה בנקאית"` | Bank Transfer | Invoice with bank details |
| `"צ'ק"` | Check | Check number visible |
| `null` | Unknown | Not detected |

---

## 🎨 Confidence Levels

| Score | Meaning | UI Indicator |
|-------|---------|--------------|
| 90-100 | Very High | ✅ Green |
| 70-89 | Medium | ⚠️ Yellow |
| < 70 | Low (null) | ❌ Red |

---

## 🔍 Contractor Matching

When vendor is detected, API automatically matches to existing contractors:

```json
"contractorMatch": {
  "contractorId": "contractor_123",
  "name": "חברת בניין בע\"מ",
  "confidence": 85
}
```

**Matching Logic:**
- Exact match: 100%
- Substring: 90-95%
- Fuzzy (Levenshtein): 70-90%
- Threshold: 70% minimum

**If no match:** `contractorMatch` = `null`

---

## 🎬 User Flow

```
1. User taps "Upload Receipt"
       ↓
2. Choose: 📷 Camera or 🖼️ Gallery
       ↓
3. Select/capture image
       ↓
4. App validates (size, format)
       ↓
5. Show "Processing... 60%"
       ↓
6. API processes (2-5 seconds)
       ↓
7. Show extracted fields preview
       ↓
8. Auto-fill form
       ↓
9. User reviews & submits
```

---

## 💻 React Native Hook

```javascript
import { useAuth } from '@clerk/clerk-react';
import * as FileSystem from 'expo-file-system';

const OCR_ENDPOINT = 'https://2woj5i92td.execute-api.us-east-1.amazonaws.com/prod/expenses/ocr-process';

export function useReceiptOCR() {
  const { getToken } = useAuth();

  const processReceipt = async (imageUri) => {
    // 1. Read as base64
    const base64 = await FileSystem.readAsStringAsync(imageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // 2. Get auth token
    const token = await getToken();

    // 3. Call API
    const response = await fetch(OCR_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        receiptBase64: `data:image/jpeg;base64,${base64}`,
        fileName: imageUri.split('/').pop(),
      }),
    });

    const result = await response.json();
    return result.data.extractedFields;
  };

  return { processReceipt };
}
```

---

## 🧪 Testing Tips

### Test with:
- ✅ Clear Hebrew receipt
- ✅ Clear English receipt
- ✅ Blurry receipt (expect low confidence)
- ✅ 6MB file (expect 413 error)
- ✅ Offline mode (expect network error)
- ✅ Receipt from known contractor (expect match)

### Validate:
- Auto-fill works for all fields
- Confidence indicators show correctly
- Contractor suggestions appear
- User can edit any field
- Progress bar updates smoothly
- Error messages are user-friendly

---

## 📊 Performance

| Metric | Target |
|--------|--------|
| Processing Time | 2-5 seconds |
| Success Rate | > 90% |
| Field Accuracy | > 85% |
| File Size (optimal) | < 2MB |

---

## 🔒 Security Checklist

- [ ] Always include Clerk JWT token
- [ ] Validate file size client-side (<5MB)
- [ ] Compress images before upload
- [ ] Handle 401 (re-authenticate)
- [ ] Implement rate limit retry logic
- [ ] Don't store base64 in logs

---

## 📱 UI Components

### Upload Button
```
┌─────────────────────────┐
│   📷 צלם קבלה          │
│   🖼️ בחר מגלריה        │
└─────────────────────────┘
```

### Processing Indicator
```
⚙️ מעבד את הקבלה...
████████░░░░  60%
קורא את הטקסט מהתמונה...
```

### Success Preview
```
✅ קבלה עובדה בהצלחה!

שדות שזוהו:
✅ סכום:          ₪1,250 (95%)
✅ תאריך:         21/12/2025 (92%)
⚠️  תיאור:        לא זוהה (65%)

💡 התאמה אוטומטית (85%)
   האם זה: חברת בניין בע"מ?
   [✓ כן] [× לא]
```

---

## 🆘 Quick Troubleshooting

| Problem | Solution |
|---------|----------|
| "Authentication required" | User needs to login |
| "File too large" | Compress to <5MB |
| "No fields extracted" | Receipt too blurry |
| "Rate limit exceeded" | Wait & retry |
| Fields all null | Very poor image quality |

---

## 📞 Support

- **API Docs:** `/Users/maordaniel/Ofek/MOBILE_OCR_IMPLEMENTATION_GUIDE.md`
- **Source Code:** `/lambda/processReceiptOCR.js`
- **Test User:** maordaniel40@gmail.com

---

*Quick Reference v2.0 - 2025-12-22*
