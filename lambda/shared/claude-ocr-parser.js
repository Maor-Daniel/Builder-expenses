// lambda/shared/claude-ocr-parser.js
// Claude 3.5 Sonnet OCR integration via OpenRouter
// Intelligent Hebrew receipt OCR with payment method inference

const axios = require('axios');
const { debugLog } = require('./company-utils');

// OpenRouter API endpoint
const OPENROUTER_API_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const CLAUDE_MODEL = 'anthropic/claude-3.5-sonnet';

// OCR prompt for Claude 3.5 Sonnet
const OCR_PROMPT = `You are an expert invoice/receipt OCR system for Israeli construction expenses.
Extract the following information from this Hebrew or English receipt image.

REQUIRED FIELDS (leave null if not found with high confidence):
1. **amount**: Total amount as number (no currency symbols)
2. **invoiceNum**: Invoice/receipt number (alphanumeric)
3. **date**: Date in YYYY-MM-DD format
4. **vendor**: Company/vendor name (the business that issued the receipt)
5. **description**: Look for handwritten text describing items/services, typically found in sections labeled "פריטים" or "פירוט". DO NOT use the vendor/company name as description. If no handwritten description exists, use null.
6. **paymentMethod**: Infer from context:
   - "קופה"/"cash register"/"מזומן" → "מזומן"
   - Credit card terminal/"כרטיס"/"VISA"/"Mastercard" → "כרטיס אשראי"
   - Invoice format or bank details → "העברה בנקאית"
   - Check number/"צ'ק" → "צ'ק"
   - If uncertain → null

CONFIDENCE SCORING (0-100):
- Text clarity: 90-100 (very clear), 70-89 (readable), <70 (unclear)
- Explicit labels: +10 points
- Hebrew text: Native support, no penalties

RESPONSE FORMAT (JSON only):
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

RULES:
- Return ONLY valid JSON (no markdown code blocks)
- Use null for confidence < 70
- Keep description < 500 chars
- Preserve Hebrew UTF-8 encoding
- Multi-page: extract from first page only`;

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
