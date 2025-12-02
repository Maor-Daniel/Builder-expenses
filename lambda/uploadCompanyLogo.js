// lambda/uploadCompanyLogo.js
// Generate pre-signed URL for company logo upload with comprehensive security validation

const AWS = require('aws-sdk');
const {
  createResponse,
  createErrorResponse,
  getCompanyContextFromEvent,
  getCurrentTimestamp,
  debugLog,
  dynamoOperation,
  COMPANY_TABLE_NAMES,
  USER_ROLES
} = require('./shared/company-utils');

const {
  validateUploadRequest,
  createSecurityErrorResponse,
  FILE_SIZE_LIMITS
} = require('./shared/file-validator');

const s3 = new AWS.S3({ region: process.env.AWS_REGION || 'us-east-1' });

const LOGO_BUCKET = process.env.LOGO_BUCKET || 'construction-expenses-company-logos-702358134603';
const MAX_FILE_SIZE = FILE_SIZE_LIMITS.LOGO; // 5MB for company logos

exports.handler = async (event) => {

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return createResponse(200, { message: 'CORS preflight' });
  }

  if (event.httpMethod !== 'POST') {
    return createErrorResponse(405, 'Method not allowed');
  }

  try {
    // Get company context from authenticated user
    const { companyId, userId, userRole } = getCompanyContextFromEvent(event);

    // Check if user has admin permissions
    if (userRole !== USER_ROLES.ADMIN) {
      return createErrorResponse(403, 'Admin privileges required to upload company logo');
    }

    // Parse request body
    const requestBody = JSON.parse(event.body || '{}');
    const { fileType, fileName, fileSize } = requestBody;

    if (!fileType || !fileName) {
      return createErrorResponse(400, 'fileType and fileName are required');
    }

    // SECURITY: Comprehensive file validation (logos should be images only, no PDFs)
    const validation = validateUploadRequest({
      fileName,
      fileType,
      fileSize,
      uploadType: 'logo'
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

    // Additional validation: logos must be images only (no PDFs)
    if (validation.mimeType === 'application/pdf') {
      const securityError = createSecurityErrorResponse('Company logo must be an image file (JPG, PNG, GIF, WEBP)', {
        securityReason: 'INVALID_LOGO_TYPE',
        fileName,
        fileType,
        companyId,
        userId
      });

      return createErrorResponse(
        400,
        securityError.error,
        { securityReason: securityError.securityReason }
      );
    }

    // Generate unique file name with company ID
    const fileExtension = validation.extension;
    const uniqueFileName = `${companyId}/logo-${Date.now()}${fileExtension}`;

    debugLog('Logo upload validated', {
      companyId,
      userId,
      fileName,
      fileType: validation.mimeType,
      uniqueFileName
    });

    // Generate pre-signed URL for upload with size limit enforcement
    const uploadParams = {
      Bucket: LOGO_BUCKET,
      Key: uniqueFileName,
      Expires: 300, // URL valid for 5 minutes
      ContentType: validation.mimeType,
      ACL: 'public-read', // Make the logo publicly readable
      // SECURITY: Enforce file size limit in S3
      ContentLengthRange: [1, MAX_FILE_SIZE] // Min 1 byte, Max 5MB
    };

    const uploadUrl = await s3.getSignedUrlPromise('putObject', uploadParams);

    // Generate the public URL where the logo will be accessible
    const logoUrl = `https://${LOGO_BUCKET}.s3.amazonaws.com/${uniqueFileName}`;


    return createResponse(200, {
      success: true,
      message: 'Pre-signed URL generated successfully',
      data: {
        uploadUrl, // Use this URL to upload the file
        logoUrl, // This will be the logo's public URL after upload
        expiresIn: 300, // Seconds
        maxFileSize: MAX_FILE_SIZE,
        allowedTypes: ['JPG', 'JPEG', 'PNG', 'GIF', 'WEBP']
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
};
