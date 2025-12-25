// lambda/processReceiptOCR.js
// Process receipt image with Google Cloud Vision API (primary) or AWS Textract (fallback)
// Uses Bytes mode (not S3) - receipt stays in memory until form submission

// AWS SDK v3 - modular imports for smaller bundle size
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const {
  createResponse,
  createErrorResponse,
  getCompanyContextFromEvent,
  getCurrentTimestamp,
  debugLog
} = require('./shared/company-utils');
const { withSecureCors } = require('./shared/cors-config');
const { processWithClaudeOCR } = require('./shared/claude-ocr-parser');
const { findBestContractorMatch } = require('./shared/contractor-matcher');

// Initialize AWS clients with SDK v3
const secretsManager = new SecretsManagerClient({ region: 'us-east-1' });
const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const dynamodb = DynamoDBDocumentClient.from(ddbClient);

// Constants
const MAX_RECEIPT_SIZE_BYTES = 5 * 1024 * 1024; // 5MB limit for Claude vision API
const OCR_CONFIDENCE_THRESHOLD = parseInt(process.env.OCR_CONFIDENCE_THRESHOLD || '70');
const OPENROUTER_API_KEY_SECRET = process.env.OPENROUTER_API_KEY_SECRET || 'construction-expenses/openrouter-api-key';

/**
 * Get OpenRouter API key from environment or AWS Secrets Manager
 * @returns {Promise<string|null>} API key or null if not available
 */
async function getOpenRouterApiKey() {
  // Try environment variable first
  if (process.env.OPENROUTER_API_KEY) {
    debugLog('Using OpenRouter API key from environment variable');
    return process.env.OPENROUTER_API_KEY;
  }

  // Fall back to Secrets Manager
  try {
    const command = new GetSecretValueCommand({
      SecretId: OPENROUTER_API_KEY_SECRET
    });
    const response = await secretsManager.send(command);

    if (response.SecretString) {
      debugLog('Using OpenRouter API key from Secrets Manager');
      return response.SecretString;
    }

    return null;
  } catch (error) {
    debugLog('Failed to retrieve OpenRouter API key', {
      errorCode: error.code,
      errorMessage: error.message
    });
    return null;
  }
}


exports.handler = withSecureCors(async (event) => {
  console.log('[OCR] Handler started');

  if (event.httpMethod !== 'POST') {
    return createErrorResponse(405, 'Method not allowed');
  }

  try {
    // Get company context from authenticated user
    console.log('[OCR] Getting company context...');
    const { companyId, userId } = getCompanyContextFromEvent(event);
    console.log('[OCR] Company context:', { companyId, userId });

    // Parse request body
    console.log('[OCR] Parsing request body, length:', event.body?.length);
    const requestBody = JSON.parse(event.body || '{}');
    const { receiptBase64, fileName, fileSize } = requestBody;
    console.log('[OCR] Parsed body:', { fileName, fileSize, hasBase64: !!receiptBase64, base64Length: receiptBase64?.length });

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

    // Get OpenRouter API key
    console.log('[OCR] Getting OpenRouter API key...');
    const openRouterApiKey = await getOpenRouterApiKey();
    console.log('[OCR] API key retrieved:', !!openRouterApiKey, 'length:', openRouterApiKey?.length);

    if (!openRouterApiKey) {
      console.log('[OCR] ERROR: No API key available');
      return createErrorResponse(500, 'OCR service not configured. Please contact support.');
    }

    // Process with Claude 3.5 Sonnet via OpenRouter
    let ocrResult;
    let ocrProvider = 'unknown';

    try {
      console.log('[OCR] Starting Claude OCR processing...');
      debugLog('Processing with Claude 3.5 Sonnet via OpenRouter', { companyId });

      const startTime = Date.now();
      ocrResult = await processWithClaudeOCR(imageBuffer, fileName, openRouterApiKey);
      const processingTime = Date.now() - startTime;

      debugLog('Claude OCR processing successful', {
        companyId,
        processingTimeMs: processingTime,
        fieldsExtracted: Object.keys(ocrResult.fields).filter(k => ocrResult.fields[k] !== null)
      });

      ocrProvider = 'claude-3.5-sonnet';
      ocrResult.processingTime = processingTime;

    } catch (error) {
      console.log('[OCR] Claude processing error:', error.message);
      debugLog('Claude OCR processing failed', {
        companyId,
        errorMessage: error.message
      });
      throw error;
    }

    // Extract fields from OCR result
    const { fields, confidence, reasoning, processingTime } = ocrResult;

    // Attempt to match vendor to existing contractors
    let contractorMatch = null;
    if (fields.vendor) {
      try {
        debugLog('Attempting contractor matching', {
          companyId,
          vendorName: fields.vendor
        });

        const contractorsResult = await dynamodb.send(new QueryCommand({
          TableName: 'construction-expenses-company-contractors',
          KeyConditionExpression: 'companyId = :companyId',
          ExpressionAttributeValues: { ':companyId': companyId }
        }));

        const contractors = contractorsResult.Items || [];

        if (contractors.length > 0) {
          contractorMatch = findBestContractorMatch(
            fields.vendor,
            contractors,
            70 // Minimum 70% confidence
          );

          debugLog('Contractor matching complete', {
            companyId,
            vendorName: fields.vendor,
            matchFound: !!contractorMatch,
            matchConfidence: contractorMatch?.confidence || 0
          });
        } else {
          debugLog('No contractors found for matching', { companyId });
        }
      } catch (matchError) {
        debugLog('Contractor matching failed (non-fatal)', {
          companyId,
          errorMessage: matchError.message
        });
        // Don't fail the entire OCR request if contractor matching fails
      }
    }

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
      contractorMatched: !!contractorMatch,
      averageConfidence: Object.values(confidence).length > 0
        ? Math.round(Object.values(confidence).reduce((a, b) => a + b, 0) / Object.values(confidence).length)
        : 0
    });

    return createResponse(200, {
      success: true,
      data: {
        extractedFields: {
          ...fields,
          confidence,
          contractorMatch: contractorMatch ? {
            contractorId: contractorMatch.contractorId,
            name: contractorMatch.name,
            confidence: contractorMatch.confidence
          } : null
        },
        ocrMetadata: {
          processingTimeMs: processingTime,
          provider: ocrProvider,
          documentType: 'RECEIPT',
          fileName,
          lowConfidenceFields,
          paymentMethodReasoning: reasoning?.paymentMethod || null
        }
      },
      timestamp: getCurrentTimestamp()
    });

  } catch (error) {
    console.log('[OCR] MAIN ERROR:', error.message, 'code:', error.code, 'name:', error.name);
    console.log('[OCR] Error stack:', error.stack);

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
