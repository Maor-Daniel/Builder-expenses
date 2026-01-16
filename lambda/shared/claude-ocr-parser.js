// lambda/shared/claude-ocr-parser.js
// Claude 3.5 Sonnet OCR integration via OpenRouter
// Intelligent Hebrew receipt OCR with payment method inference

const axios = require('axios');
const { debugLog } = require('./company-utils');

// OpenRouter API endpoint
const OPENROUTER_API_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const CLAUDE_MODEL = 'anthropic/claude-3.5-sonnet';

// OCR prompt for Claude 3.5 Sonnet
const OCR_PROMPT = `You are an intelligent OCR system specialized in extracting structured data from Israeli invoices and receipts (חשבונית/קבלה).

## Your Task
Extract the following fields from each invoice image and return them in the specified JSON format.

---

## Field Extraction Guide

### 1. vendor (שם הקבלן/העסק)
- **Location**: TOP of the invoice, typically the largest/boldest text
- The primary business or contractor name
- May have business description below (e.g., "חשמל ושיפוצים") - include only the name

### 2. invoiceNum (מספר חשבונית)
- **Location**: Upper portion, near "חשבון/קבלה מס'"
- Usually a sequential number (e.g., "0136")
- Look for labels: "מס'", "חשבון מס'", "קבלה מס'"
- Return as string

### 3. date (תאריך)
- **Location**: Upper-left area, often handwritten
- Israeli format: DD/MM/YY or DD/MM/YYYY
- **Output format**: YYYY-MM-DD (ISO)
- Assume 20XX for two-digit years

### 4. description (פרטי השירות)
- **Location**: Main table body under column "פרטים"
- Often HANDWRITTEN in Hebrew
- Extract all text describing work/services performed
- Combine multiple lines with " / " separator

### 5. amount (סה"כ לתשלום)
- **Location**: BOTTOM of the invoice
- Look for: "סה"כ", "סכום לתשלום"
- Extract the FINAL total (after any deductions)
- Return as number without currency symbols

### 6. paymentMethod (אמצעי תשלום)
- **Location**: Bottom section, typically checkboxes
- Look for checked boxes (☑) or handwritten marks next to:
  - "במזומן" → return "מזומן"
  - "כרטיס אשראי" → return "כרטיס אשראי"
  - "העברה בנקאית" → return "העברה בנקאית"
  - "שיק" / "צ'ק" / check details table filled → return "צ'ק"
- If no clear indication, return null

---

## Output Format
{
  "amount": number or null,
  "invoiceNum": "string" or null,
  "date": "YYYY-MM-DD" or null,
  "vendor": "string" or null,
  "description": "string" or null,
  "paymentMethod": "מזומן" | "כרטיס אשראי" | "העברה בנקאית" | "צ'ק" | null,
  "confidence": {
    "amount": 0-100,
    "invoiceNum": 0-100,
    "date": 0-100,
    "vendor": 0-100,
    "description": 0-100,
    "paymentMethod": 0-100
  },
  "reasoning": {
    "paymentMethod": "brief explanation" or null
  }
}

---

## Special Handling Rules

### Hebrew Text
- Reads RIGHT to LEFT
- Common handwriting confusions: ב/כ, ה/ח, ו/ז, ר/ד, ם/ס

### Date Parsing
- Input: 24/11/25, 24/11/2025, 24.11.25
- Output: 2025-11-24

### Amount Parsing
- Remove separators: 10,000 → 10000
- Handle decimal amounts: 1,234.56 → 1234.56
- If multiple totals shown (subtotal + final), use the final amount

### Payment Method Detection
- Check marks may be: ✓, ✔, X, filled box, or circled option
- If check table (מס' שיק, בנק/סניף) has data → "צ'ק"
- Explain your reasoning in the reasoning.paymentMethod field

### Confidence Scoring (0-100)
- **90-100**: Printed text, clearly legible
- **70-90**: Handwritten but readable
- **50-70**: Partially legible, some inference
- **<50**: Low confidence, uncertain

---

## Error Handling
- If a field is unreadable → return null with confidence near 0
- If multiple interpretations possible → choose most likely, lower confidence
- Always provide reasoning for paymentMethod, even if null

RULES:
- Return ONLY valid JSON (no markdown code blocks)
- Preserve Hebrew UTF-8 encoding`;

/**
 * Call Claude Vision API via OpenRouter
 * @param {Buffer} imageBuffer - Image buffer to process
 * @param {string} apiKey - OpenRouter API key
 * @returns {Promise<Object>} - Claude API response
 */
async function callClaudeVisionAPI(imageBuffer, apiKey) {
  try {
    // Convert buffer to base64
    const base64Image = imageBuffer.toString('base64');

    // Detect image type from buffer
    let mediaType = 'image/jpeg';
    if (imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50) {
      mediaType = 'image/png';
    } else if (imageBuffer[0] === 0xFF && imageBuffer[1] === 0xD8) {
      mediaType = 'image/jpeg';
    } else if (imageBuffer[0] === 0x47 && imageBuffer[1] === 0x49) {
      mediaType = 'image/gif';
    } else if (imageBuffer[0] === 0x52 && imageBuffer[1] === 0x49) {
      mediaType = 'image/webp';
    }

    debugLog('Calling Claude Vision API via OpenRouter', {
      imageSize: imageBuffer.length,
      mediaType,
      endpoint: OPENROUTER_API_ENDPOINT
    });

    const startTime = Date.now();
    const response = await axios.post(
      OPENROUTER_API_ENDPOINT,
      {
        model: CLAUDE_MODEL,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mediaType};base64,${base64Image}`
                }
              },
              {
                type: 'text',
                text: OCR_PROMPT
              }
            ]
          }
        ],
        max_tokens: 500,
        temperature: 0
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://builder-expenses.com',
          'X-Title': 'Construction Expenses OCR'
        },
        timeout: 30000 // 30 second timeout
      }
    );

    const processingTime = Date.now() - startTime;

    debugLog('Claude Vision API response received', {
      processingTimeMs: processingTime,
      hasContent: !!response.data.choices?.[0]?.message?.content
    });

    return {
      success: true,
      data: response.data,
      processingTime
    };

  } catch (error) {
    debugLog('Claude Vision API error', {
      errorMessage: error.message,
      errorCode: error.code,
      responseData: error.response?.data
    });

    // Handle specific OpenRouter errors
    if (error.response?.status === 429) {
      throw new Error('Rate limit exceeded. Please try again in a moment.');
    }

    if (error.response?.status === 401) {
      throw new Error('Invalid OpenRouter API key');
    }

    if (error.response?.status === 402) {
      throw new Error('Insufficient OpenRouter credits');
    }

    throw new Error(`Claude Vision API failed: ${error.message}`);
  }
}

/**
 * Parse Claude API response and extract OCR fields
 * @param {Object} claudeResponse - Response from Claude API
 * @returns {Object} - Parsed fields { fields, confidence, reasoning }
 */
function parseClaudeResponse(claudeResponse) {
  try {
    const content = claudeResponse.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content in Claude response');
    }

    debugLog('Parsing Claude response', {
      contentLength: content.length,
      contentPreview: content.substring(0, 100)
    });

    // Remove markdown code blocks if present
    let jsonContent = content.trim();
    if (jsonContent.startsWith('```json')) {
      jsonContent = jsonContent.replace(/```json\s*/, '').replace(/```\s*$/, '');
    } else if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.replace(/```\s*/, '').replace(/```\s*$/, '');
    }

    // Parse JSON
    const parsed = JSON.parse(jsonContent);

    // Validate and extract fields
    const fields = {
      amount: parsed.amount !== null && parsed.amount !== undefined ? parseFloat(parsed.amount) : null,
      date: parsed.date || null,
      invoiceNum: parsed.invoiceNum || null,
      vendor: parsed.vendor || null,
      description: parsed.description || null,
      paymentMethod: parsed.paymentMethod || null
    };

    // Validate and extract confidence scores
    const confidence = {
      amount: Math.max(0, Math.min(100, parsed.confidence?.amount || 0)),
      date: Math.max(0, Math.min(100, parsed.confidence?.date || 0)),
      invoiceNum: Math.max(0, Math.min(100, parsed.confidence?.invoiceNum || 0)),
      vendor: Math.max(0, Math.min(100, parsed.confidence?.vendor || 0)),
      description: Math.max(0, Math.min(100, parsed.confidence?.description || 0)),
      paymentMethod: Math.max(0, Math.min(100, parsed.confidence?.paymentMethod || 0))
    };

    // Extract reasoning
    const reasoning = {
      paymentMethod: parsed.reasoning?.paymentMethod || null
    };

    debugLog('Claude response parsed successfully', {
      extractedFields: Object.keys(fields).filter(k => fields[k] !== null),
      averageConfidence: Math.round(
        Object.values(confidence).reduce((a, b) => a + b, 0) / Object.values(confidence).length
      )
    });

    return { fields, confidence, reasoning };

  } catch (error) {
    debugLog('Error parsing Claude response', {
      errorMessage: error.message,
      errorStack: error.stack
    });

    throw new Error(`Failed to parse Claude OCR response: ${error.message}`);
  }
}

/**
 * Process receipt with Claude 3.5 Sonnet OCR
 * @param {Buffer} imageBuffer - Receipt image buffer
 * @param {string} fileName - File name for logging
 * @param {string} apiKey - OpenRouter API key
 * @returns {Promise<Object>} - Parsed expense fields
 */
async function processWithClaudeOCR(imageBuffer, fileName, apiKey) {
  try {
    debugLog('Starting Claude OCR processing', {
      fileName,
      imageSize: imageBuffer.length
    });

    // Call Claude Vision API
    const claudeResult = await callClaudeVisionAPI(imageBuffer, apiKey);

    if (!claudeResult.success) {
      throw new Error('Claude API returned unsuccessful response');
    }

    // Parse response
    const { fields, confidence, reasoning } = parseClaudeResponse(claudeResult.data);

    debugLog('Claude OCR processing complete', {
      fileName,
      processingTimeMs: claudeResult.processingTime,
      fieldsExtracted: Object.keys(fields).filter(k => fields[k] !== null),
      averageConfidence: Math.round(
        Object.values(confidence).reduce((a, b) => a + b, 0) / Object.values(confidence).length
      )
    });

    return {
      success: true,
      fields,
      confidence,
      reasoning,
      processingTime: claudeResult.processingTime,
      provider: 'claude-3.5-sonnet'
    };

  } catch (error) {
    debugLog('Claude OCR processing failed', {
      fileName,
      errorMessage: error.message
    });

    throw error;
  }
}

module.exports = {
  processWithClaudeOCR,
  callClaudeVisionAPI,
  parseClaudeResponse
};
