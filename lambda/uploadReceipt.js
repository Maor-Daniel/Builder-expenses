// lambda/uploadReceipt.js
// Generate pre-signed URL for expense receipt upload with comprehensive security validation

const AWS = require('aws-sdk');
const {
  createResponse,
  createErrorResponse,
  getCompanyContextFromEvent,
  getCurrentTimestamp,
  debugLog
} = require('./shared/company-utils');

const {
  validateUploadRequest,
  createSecurityErrorResponse,
  FILE_SIZE_LIMITS
} = require('./shared/file-validator');
const { withSecureCors } = require('./shared/cors-config');

const s3 = new AWS.S3({ region: process.env.AWS_REGION || 'us-east-1' });

const RECEIPTS_BUCKET = process.env.RECEIPTS_BUCKET || 'construction-expenses-receipts-702358134603';
const MAX_FILE_SIZE = FILE_SIZE_LIMITS.RECEIPT; // 10MB for receipts

exports.handler = withSecureCors(async (event) => {

  // Handle CORS preflight
  // OPTIONS handling now in withSecureCors middleware

  if (event.httpMethod !== 'POST') {
    return createErrorResponse(405, 'Method not allowed');
  }

  try {
    // Get company context from authenticated user
    const { companyId, userId } = getCompanyContextFromEvent(event);

    // Parse request body
    const requestBody = JSON.parse(event.body || '{}');
    const { fileType, fileName, fileSize } = requestBody;

    if (!fileType || !fileName) {
      return createErrorResponse(400, 'fileType and fileName are required');
    }

    // SECURITY: Comprehensive file validation
    const validation = validateUploadRequest({
      fileName,
      fileType,
      fileSize,
      uploadType: 'receipt'
    });

    if (!validation.valid) {
      const securityError = createSecurityErrorResponse(validation.error, {
        securityReason: validation.securityReason,
        fileName,
        fileType,
        companyId,
        userId
      });

      return createErrorResponse(
        securityError.statusCode,
        securityError.error,
        { securityReason: securityError.securityReason }
      );
    }

    // Generate unique file name with company ID and timestamp
    const fileExtension = validation.extension;
    const uniqueFileName = `${companyId}/receipts/receipt-${Date.now()}-${Math.random().toString(36).substring(7)}${fileExtension}`;

    debugLog('Receipt upload validated', {
      companyId,
      userId,
      fileName,
      fileType: validation.mimeType,
      uniqueFileName
    });

    // Generate pre-signed URL for upload
    // Note: ACL removed since bucket has BlockPublicAcls enabled
    // Note: ContentLengthRange is not valid for putObject signed URLs
    const uploadParams = {
      Bucket: RECEIPTS_BUCKET,
      Key: uniqueFileName,
      Expires: 300, // URL valid for 5 minutes
      ContentType: validation.mimeType
    };

    const uploadUrl = await s3.getSignedUrlPromise('putObject', uploadParams);

    // Generate pre-signed URL for reading the receipt (since public access is blocked)
    const readParams = {
      Bucket: RECEIPTS_BUCKET,
      Key: uniqueFileName,
      Expires: 86400 * 7 // 7 days for reading
    };
    const receiptUrl = await s3.getSignedUrlPromise('getObject', readParams);


    return createResponse(200, {
      success: true,
      message: 'Pre-signed URL generated successfully',
      data: {
        uploadUrl, // Use this URL to upload the file via PUT
        receiptKey: uniqueFileName, // S3 key - store this in the database for permanent access
        receiptUrl, // Temporary pre-signed URL for immediate preview (expires in 7 days)
        expiresIn: 300, // Upload URL expiration in seconds
        maxFileSize: MAX_FILE_SIZE,
        allowedTypes: ['PDF', 'JPG', 'JPEG', 'PNG', 'GIF', 'WEBP']
      },
      timestamp: getCurrentTimestamp()
    });

  } catch (error) {

    if (error.message.includes('Company authentication required')) {
      return createErrorResponse(401, 'Authentication required');
    }

    if (error.message.includes('missing company')) {
      return createErrorResponse(401, 'Invalid company context');
    }

    return createErrorResponse(500, 'Internal server error generating upload URL');
  }
});
