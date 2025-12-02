// lambda/shared/file-validator.js
// Comprehensive file upload security validation

const FileType = require('file-type');

// File size limits (bytes)
const FILE_SIZE_LIMITS = {
  RECEIPT: 10 * 1024 * 1024, // 10MB for receipts
  LOGO: 5 * 1024 * 1024, // 5MB for company logos
  GENERAL: 10 * 1024 * 1024 // 10MB default
};

// Allowed MIME types mapped to allowed extensions
const ALLOWED_MIME_TYPES = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/gif': ['.gif'],
  'image/webp': ['.webp']
};

// Dangerous file extensions that should NEVER be allowed
const BLOCKED_EXTENSIONS = [
  // Windows executables
  '.exe', '.com', '.bat', '.cmd', '.scr', '.msi', '.dll',
  // Scripts
  '.js', '.jse', '.vbs', '.vbe', '.ws', '.wsf', '.wsh', '.ps1', '.psm1',
  // Shell scripts
  '.sh', '.bash', '.zsh', '.fish', '.csh',
  // macOS executables
  '.app', '.dmg', '.pkg', '.command',
  // Linux packages
  '.deb', '.rpm', '.run', '.bin',
  // Other dangerous types
  '.jar', '.apk', '.ipa', '.msp', '.gadget', '.inf', '.reg'
];

/**
 * Validate file name and extension
 * @param {string} fileName - The file name to validate
 * @returns {object} - { valid: boolean, extension: string, error?: string }
 */
function validateFileName(fileName) {
  if (!fileName || typeof fileName !== 'string') {
    return { valid: false, error: 'Invalid file name' };
  }

  // Extract extension
  const extension = fileName.toLowerCase().match(/\.[^.]+$/)?.[0];

  if (!extension) {
    return { valid: false, error: 'File name must have an extension' };
  }

  // Check if extension is blocked
  if (BLOCKED_EXTENSIONS.includes(extension)) {
    return {
      valid: false,
      error: `Executable files are not allowed (${extension})`,
      securityReason: 'BLOCKED_EXTENSION'
    };
  }

  return { valid: true, extension };
}

/**
 * Validate MIME type against allowed types
 * @param {string} mimeType - The MIME type to validate
 * @returns {object} - { valid: boolean, error?: string }
 */
function validateMimeType(mimeType) {
  if (!mimeType || typeof mimeType !== 'string') {
    return { valid: false, error: 'Invalid MIME type' };
  }

  const normalizedMimeType = mimeType.toLowerCase();

  if (!ALLOWED_MIME_TYPES[normalizedMimeType]) {
    return {
      valid: false,
      error: `File type not allowed. Supported: ${Object.keys(ALLOWED_MIME_TYPES).join(', ')}`,
      securityReason: 'INVALID_MIME_TYPE'
    };
  }

  return { valid: true, mimeType: normalizedMimeType };
}

/**
 * Validate that file extension matches declared MIME type
 * @param {string} fileName - The file name
 * @param {string} mimeType - The declared MIME type
 * @returns {object} - { valid: boolean, error?: string }
 */
function validateMimeExtensionMatch(fileName, mimeType) {
  const fileNameValidation = validateFileName(fileName);
  if (!fileNameValidation.valid) {
    return fileNameValidation;
  }

  const mimeValidation = validateMimeType(mimeType);
  if (!mimeValidation.valid) {
    return mimeValidation;
  }

  const extension = fileNameValidation.extension;
  const normalizedMimeType = mimeValidation.mimeType;
  const allowedExtensions = ALLOWED_MIME_TYPES[normalizedMimeType];

  if (!allowedExtensions.includes(extension)) {
    return {
      valid: false,
      error: `File extension ${extension} doesn't match declared MIME type ${mimeType}. Expected: ${allowedExtensions.join(', ')}`,
      securityReason: 'MIME_EXTENSION_MISMATCH'
    };
  }

  return { valid: true };
}

/**
 * Validate file size
 * @param {number} fileSize - File size in bytes
 * @param {string} fileType - Type of file (receipt, logo, general)
 * @returns {object} - { valid: boolean, error?: string }
 */
function validateFileSize(fileSize, fileType = 'general') {
  if (typeof fileSize !== 'number' || fileSize <= 0) {
    return { valid: false, error: 'Invalid file size' };
  }

  const limit = FILE_SIZE_LIMITS[fileType.toUpperCase()] || FILE_SIZE_LIMITS.GENERAL;

  if (fileSize > limit) {
    const limitMB = (limit / (1024 * 1024)).toFixed(1);
    const sizeMB = (fileSize / (1024 * 1024)).toFixed(2);
    return {
      valid: false,
      error: `File size (${sizeMB}MB) exceeds ${limitMB}MB limit`,
      securityReason: 'FILE_TOO_LARGE',
      statusCode: 413
    };
  }

  return { valid: true };
}

/**
 * Validate file buffer content using magic numbers (deep validation)
 * This checks the actual file content, not just the extension or claimed MIME type
 * @param {Buffer} fileBuffer - The file content as a Buffer
 * @param {string} expectedMimeType - The expected MIME type
 * @returns {Promise<object>} - { valid: boolean, detectedMimeType?: string, error?: string }
 */
async function validateFileContent(fileBuffer, expectedMimeType) {
  if (!Buffer.isBuffer(fileBuffer)) {
    return { valid: false, error: 'Invalid file buffer' };
  }

  try {
    // Detect actual file type from magic numbers
    const fileTypeResult = await FileType.fromBuffer(fileBuffer);

    if (!fileTypeResult) {
      // Some valid files (like some PDFs) might not be detected
      // For now, we'll allow them but log a warning
      console.warn('WARNING: Could not detect file type from content (magic numbers)');
      return {
        valid: true,
        warning: 'File type could not be determined from content',
        detectedMimeType: null
      };
    }

    const detectedMimeType = fileTypeResult.mime;

    // Check if detected MIME type is in our allowed list
    if (!ALLOWED_MIME_TYPES[detectedMimeType]) {
      return {
        valid: false,
        error: `File content detected as ${detectedMimeType}, which is not allowed`,
        securityReason: 'DETECTED_DANGEROUS_CONTENT',
        detectedMimeType
      };
    }

    // Check if detected MIME type matches expected MIME type
    if (expectedMimeType && detectedMimeType !== expectedMimeType.toLowerCase()) {
      return {
        valid: false,
        error: `File content doesn't match declared type. Declared: ${expectedMimeType}, Detected: ${detectedMimeType}`,
        securityReason: 'MIME_SPOOFING_DETECTED',
        detectedMimeType
      };
    }

    return {
      valid: true,
      detectedMimeType,
      extension: fileTypeResult.ext
    };

  } catch (error) {
    console.error('Error detecting file type:', error);
    return {
      valid: false,
      error: 'Failed to validate file content',
      technicalError: error.message
    };
  }
}

/**
 * Comprehensive file validation for pre-signed URL generation
 * This is used BEFORE uploading to validate the request
 * @param {object} params - Validation parameters
 * @param {string} params.fileName - The file name
 * @param {string} params.fileType - The declared MIME type
 * @param {number} params.fileSize - The file size in bytes (if available)
 * @param {string} params.uploadType - Type of upload (receipt, logo)
 * @returns {object} - { valid: boolean, error?: string, details?: object }
 */
function validateUploadRequest(params) {
  const { fileName, fileType, fileSize, uploadType = 'general' } = params;

  // Validate file name and extension
  const fileNameValidation = validateFileName(fileName);
  if (!fileNameValidation.valid) {
    return fileNameValidation;
  }

  // Validate MIME type
  const mimeValidation = validateMimeType(fileType);
  if (!mimeValidation.valid) {
    return mimeValidation;
  }

  // Validate that extension matches MIME type
  const matchValidation = validateMimeExtensionMatch(fileName, fileType);
  if (!matchValidation.valid) {
    return matchValidation;
  }

  // Validate file size if provided
  if (fileSize !== undefined) {
    const sizeValidation = validateFileSize(fileSize, uploadType);
    if (!sizeValidation.valid) {
      return sizeValidation;
    }
  }

  return {
    valid: true,
    extension: fileNameValidation.extension,
    mimeType: mimeValidation.mimeType
  };
}

/**
 * Log security rejection for monitoring
 * @param {object} details - Security event details
 */
function logSecurityRejection(details) {
  console.log('SECURITY_REJECTION', JSON.stringify({
    timestamp: new Date().toISOString(),
    ...details
  }));
}

/**
 * Create security error response
 * @param {string} message - Error message
 * @param {object} details - Additional details
 * @returns {object} - Error response object
 */
function createSecurityErrorResponse(message, details = {}) {
  logSecurityRejection({ message, ...details });

  return {
    error: message,
    securityReason: details.securityReason || 'VALIDATION_FAILED',
    statusCode: details.statusCode || 400
  };
}

module.exports = {
  // Validation functions
  validateFileName,
  validateMimeType,
  validateMimeExtensionMatch,
  validateFileSize,
  validateFileContent,
  validateUploadRequest,

  // Utility functions
  logSecurityRejection,
  createSecurityErrorResponse,

  // Constants
  FILE_SIZE_LIMITS,
  ALLOWED_MIME_TYPES,
  BLOCKED_EXTENSIONS
};
