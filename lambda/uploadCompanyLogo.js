// lambda/uploadCompanyLogo.js
// Generate pre-signed URL for company logo upload

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

const s3 = new AWS.S3({ region: process.env.AWS_REGION || 'us-east-1' });

const LOGO_BUCKET = process.env.LOGO_BUCKET || 'construction-expenses-company-logos-702358134603';
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];

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
    const { fileType, fileName } = requestBody;

    if (!fileType || !fileName) {
      return createErrorResponse(400, 'fileType and fileName are required');
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(fileType.toLowerCase())) {
      return createErrorResponse(400, `Invalid file type. Allowed types: ${ALLOWED_TYPES.join(', ')}`);
    }

    // Generate unique file name with company ID
    const fileExtension = fileName.split('.').pop();
    const uniqueFileName = `${companyId}/logo-${Date.now()}.${fileExtension}`;


    // Generate pre-signed URL for upload
    const uploadParams = {
      Bucket: LOGO_BUCKET,
      Key: uniqueFileName,
      Expires: 300, // URL valid for 5 minutes
      ContentType: fileType,
      ACL: 'public-read' // Make the logo publicly readable
    };

    const uploadUrl = await s3.getSignedUrlPromise('putObject', uploadParams);

    // Generate the public URL where the logo will be accessible
    const logoUrl = `https://${LOGO_BUCKET}.s3.amazonaws.com/${uniqueFileName}`;


    return createResponse(200, {
      success: true,
      message: 'Pre-signed URL generated successfully',
      data: {
        uploadUrl, // Use this URL to upload the file
        logoUrl,   // This will be the logo's public URL after upload
        expiresIn: 300 // Seconds
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
