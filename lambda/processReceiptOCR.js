// lambda/processReceiptOCR.js
// Process receipt image with Google Cloud Vision API (primary) or AWS Textract (fallback)
// Uses Bytes mode (not S3) - receipt stays in memory until form submission

const AWS = require('aws-sdk');
const {
  createResponse,
  createErrorResponse,
  getCompanyContextFromEvent,
  getCurrentTimestamp,
  debugLog
} = require('./shared/company-utils');
const { withSecureCors } = require('./shared/cors-config');
const { parseExpenseDocument } = require('./shared/textract-parser');
const { processWithGoogleVision } = require('./shared/google-vision-parser');

// Initialize AWS clients
const textract = new AWS.Textract({ region: process.env.TEXTRACT_REGION || 'us-east-1' });
const secretsManager = new AWS.SecretsManager({ region: 'us-east-1' });

// Constants
const MAX_RECEIPT_SIZE_BYTES = 5 * 1024 * 1024; // 5MB limit for Textract Bytes mode
const OCR_CONFIDENCE_THRESHOLD = parseInt(process.env.OCR_CONFIDENCE_THRESHOLD || '80');
const GOOGLE_VISION_SECRET_NAME = process.env.GOOGLE_VISION_API_KEY_SECRET || 'construction-expenses/google-vision-api-key';

/**
 * Get Google Vision API key from AWS Secrets Manager
 * @returns {Promise<string|null>} API key or null if not available
 */
async function getGoogleVisionApiKey() {
  try {
    const response = await secretsManager.getSecretValue({
      SecretId: GOOGLE_VISION_SECRET_NAME
    }).promise();

    if (response.SecretString) {
      return response.SecretString;
    }

    return null;
  } catch (error) {
    debugLog('Failed to retrieve Google Vision API key', {
      errorCode: error.code,
      errorMessage: error.message
    });
    return null;
  }
}

/**
 * Process receipt with AWS Textract (fallback method)
 * @param {Buffer} imageBuffer - Receipt image buffer
 * @param {string} companyId - Company ID for logging
 * @param {string} fileName - File name for logging
 * @returns {Promise<Object>} - Parsed expense fields
 */
async function processWithTextract(imageBuffer, companyId, fileName) {
  const textractParams = {
    Document: {
      Bytes: imageBuffer
    }
  };

  debugLog('Using AWS Textract (fallback)', {
    companyId,
    fileName
  });

  const startTime = Date.now();
  const textractResponse = await textract.analyzeExpense(textractParams).promise();
  const processingTime = Date.now() - startTime;

  debugLog('Textract processing complete', {
    companyId,
    processingTimeMs: processingTime,
    documentPages: textractResponse.DocumentMetadata?.Pages || 1
  });

  // Parse Textract response
  const { fields, confidence, lineItems } = parseExpenseDocument(textractResponse);

  // Construct description from line items (if available)
  if (lineItems.length > 0) {
    const descriptions = lineItems
      .map(item => item.description)
      .filter(Boolean);

    if (descriptions.length > 0) {
      fields.description = descriptions.join(', ').substring(0, 500);
    }
  }

  return {
    fields,
    confidence,
    lineItems,
    processingTime,
    provider: 'textract'
  };
}

exports.handler = withSecureCors(async (event) => {

  if (event.httpMethod !== 'POST') {
    return createErrorResponse(405, 'Method not allowed');
  }

  try {
    // Get company context from authenticated user
    const { companyId, userId } = getCompanyContextFromEvent(event);

    // Parse request body
    const requestBody = JSON.parse(event.body || '{}');
    const { receiptBase64, fileName, fileSize } = requestBody;

    // Validation
    if (!receiptBase64 || !fileName) {
      return createErrorResponse(400, 'receiptBase64 and fileName are required');
    }

    // Calculate actual size from base64 (remove data URI prefix if present)
    const base64Data = receiptBase64.includes(',')
      ? receiptBase64.split(',')[1]
      : receiptBase64;

    const estimatedSizeBytes = Math.floor((base64Data.length * 0.75));

    debugLog('OCR processing started', {
      companyId,
      userId,
      fileName,
      providedFileSize: fileSize,
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
    let imageBuffer;
    try {
      imageBuffer = Buffer.from(base64Data, 'base64');
    } catch (bufferError) {
      return createErrorResponse(400, 'Invalid base64 encoding in receiptBase64');
    }

    // Try Google Vision API first, fall back to Textract
    let ocrResult;
    let ocrProvider = 'unknown';

    try {
      // Attempt to get Google Vision API key
      const googleApiKey = await getGoogleVisionApiKey();

      if (googleApiKey) {
        debugLog('Google Vision API key found, using Vision API', { companyId });

        try {
          ocrResult = await processWithGoogleVision(imageBuffer, googleApiKey);
          ocrProvider = 'google-vision';

          debugLog('Google Vision API processing successful', {
            companyId,
            processingTimeMs: ocrResult.processingTime,
            fieldsExtracted: Object.keys(ocrResult.fields).filter(k => ocrResult.fields[k] !== null)
          });
        } catch (visionError) {
          debugLog('Google Vision API failed, falling back to Textract', {
            companyId,
            errorMessage: visionError.message
          });

          // Fall back to Textract
          ocrResult = await processWithTextract(imageBuffer, companyId, fileName);
          ocrProvider = 'textract-fallback';
        }
      } else {
        debugLog('Google Vision API key not available, using Textract', { companyId });
        ocrResult = await processWithTextract(imageBuffer, companyId, fileName);
        ocrProvider = 'textract';
      }
    } catch (error) {
      // If everything fails, throw error
      debugLog('All OCR processing failed', {
        companyId,
        errorMessage: error.message
      });
      throw error;
    }

    // Extract fields from OCR result
    const { fields, confidence, lineItems, processingTime } = ocrResult;

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

    debugLog('OCR parsing complete', {
      companyId,
      ocrProvider,
      fieldsExtracted: Object.keys(fields).filter(k => fields[k] !== null),
      lineItemsCount: lineItems.length,
      averageConfidence: Object.values(confidence).length > 0
        ? Math.round(Object.values(confidence).reduce((a, b) => a + b, 0) / Object.values(confidence).length)
        : 0
    });

    return createResponse(200, {
      success: true,
      data: {
        extractedFields: {
          ...fields,
          confidence
        },
        ocrMetadata: {
          processingTimeMs: processingTime,
          provider: ocrProvider,
          documentType: 'RECEIPT',
          fileName,
          lineItemsCount: lineItems.length,
          lowConfidenceFields
        }
      },
      timestamp: getCurrentTimestamp()
    });

  } catch (error) {

    debugLog('OCR processing error', {
      errorCode: error.code,
      errorMessage: error.message,
      errorName: error.name
    });

    // Handle authentication errors
    if (error.message.includes('Company authentication required')) {
      return createErrorResponse(401, 'Authentication required');
    }

    if (error.message.includes('missing company')) {
      return createErrorResponse(401, 'Invalid company context');
    }

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

    if (error.code === 'AccessDeniedException') {
      return createErrorResponse(500,
        'OCR service access denied. Please contact support.');
    }

    if (error.code === 'ThrottlingException') {
      return createErrorResponse(429,
        'OCR request rate limit exceeded. Please try again in a moment.');
    }

    if (error.code === 'InvalidS3ObjectException') {
      return createErrorResponse(400,
        'Invalid image format. Please ensure the receipt is a valid image file.');
    }

    return createErrorResponse(500, 'OCR processing failed', error);
  }
});
