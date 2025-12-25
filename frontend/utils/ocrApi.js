/**
 * OCR API Integration Module
 *
 * Provides functions to interact with the OCR processing API endpoint.
 * Handles receipt upload, OCR processing, and error handling.
 *
 * @author Construction Expense Tracking System
 * @version 1.0.0
 */

/**
 * @typedef {Object} OcrApiResponse
 * @property {boolean} success - Whether the request was successful
 * @property {Object} data - Response data
 * @property {Object} data.extractedFields - Extracted field values with confidence scores
 * @property {Object} data.ocrMetadata - OCR processing metadata
 * @property {string} timestamp - Response timestamp
 */

/**
 * OCR API Configuration
 */
const OCR_API_CONFIG = {
  // Default endpoint (can be overridden)
  endpoint: 'https://2woj5i92td.execute-api.us-east-1.amazonaws.com/production/expenses/ocr-process',

  // Timeout for OCR requests (30 seconds)
  timeout: 30000,

  // Maximum retries on network failure
  maxRetries: 2,

  // Retry delay (milliseconds)
  retryDelay: 1000
};

/**
 * OCR API Error Class
 */
class OcrApiError extends Error {
  constructor(message, statusCode, details) {
    super(message);
    this.name = 'OcrApiError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * Process receipt with OCR
 *
 * @param {string} receiptBase64 - Base64 encoded receipt image (with or without data URI prefix)
 * @param {string} fileName - Original file name
 * @param {number} fileSize - File size in bytes
 * @param {string} token - Authentication token (Clerk JWT)
 * @param {Object} [options] - Additional options
 * @param {string} [options.endpoint] - Override default API endpoint
 * @param {number} [options.timeout] - Override default timeout
 * @returns {Promise<OcrApiResponse>} - OCR processing result
 * @throws {OcrApiError} - If OCR processing fails
 */
async function processReceiptOCR(receiptBase64, fileName, fileSize, token, options = {}) {
  // Validate inputs
  if (!receiptBase64 || typeof receiptBase64 !== 'string') {
    throw new OcrApiError('receiptBase64 is required and must be a string', 400, {
      field: 'receiptBase64'
    });
  }

  if (!fileName || typeof fileName !== 'string') {
    throw new OcrApiError('fileName is required and must be a string', 400, {
      field: 'fileName'
    });
  }

  if (!token || typeof token !== 'string') {
    throw new OcrApiError('Authentication token is required', 401, {
      field: 'token'
    });
  }

  // Merge options with defaults
  const config = {
    ...OCR_API_CONFIG,
    ...options
  };

  // Strip data URI prefix if present (API expects base64 only)
  const base64Data = receiptBase64.includes(',')
    ? receiptBase64.split(',')[1]
    : receiptBase64;

  // Prepare request body
  const requestBody = {
    receiptBase64: base64Data,
    fileName,
    fileSize: fileSize || calculateBase64Size(base64Data)
  };

  // Make API request with retry logic
  let lastError = null;
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      const response = await makeOcrRequest(
        config.endpoint,
        requestBody,
        token,
        config.timeout
      );

      return response;

    } catch (error) {
      lastError = error;

      // Don't retry on client errors (4xx) or authentication errors
      if (error.statusCode >= 400 && error.statusCode < 500) {
        throw error;
      }

      // Retry on network errors or server errors (5xx)
      if (attempt < config.maxRetries) {
        console.warn(`[OCR API] Attempt ${attempt + 1} failed, retrying...`, error.message);
        await sleep(config.retryDelay * (attempt + 1)); // Exponential backoff
      }
    }
  }

  // All retries exhausted
  throw lastError || new OcrApiError('OCR processing failed after multiple retries', 500);
}

/**
 * Make OCR API request
 *
 * @private
 * @param {string} endpoint - API endpoint URL
 * @param {Object} body - Request body
 * @param {string} token - Authentication token
 * @param {number} timeout - Request timeout in milliseconds
 * @returns {Promise<OcrApiResponse>}
 * @throws {OcrApiError}
 */
async function makeOcrRequest(endpoint, body, token, timeout) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    // Parse response
    const contentType = response.headers.get('content-type');
    let responseData;

    if (contentType && contentType.includes('application/json')) {
      responseData = await response.json();
    } else {
      const text = await response.text();
      throw new OcrApiError(
        'Invalid response format from OCR API',
        response.status,
        { responseText: text }
      );
    }

    // Check if request was successful
    if (!response.ok) {
      throw new OcrApiError(
        responseData.message || responseData.error || 'OCR processing failed',
        response.status,
        responseData
      );
    }

    // Validate response structure
    if (!responseData.success || !responseData.data) {
      throw new OcrApiError(
        'Invalid response structure from OCR API',
        500,
        responseData
      );
    }

    return responseData;

  } catch (error) {
    clearTimeout(timeoutId);

    // Handle abort (timeout)
    if (error.name === 'AbortError') {
      throw new OcrApiError(
        'OCR processing timed out. Please try again with a smaller image.',
        408
      );
    }

    // Handle network errors
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new OcrApiError(
        'Network error. Please check your internet connection.',
        0,
        { originalError: error.message }
      );
    }

    // Re-throw OcrApiError instances
    if (error instanceof OcrApiError) {
      throw error;
    }

    // Wrap other errors
    throw new OcrApiError(
      error.message || 'OCR processing failed',
      500,
      { originalError: error }
    );
  }
}

/**
 * Calculate file size from base64 string
 *
 * @param {string} base64String - Base64 encoded string
 * @returns {number} - Estimated file size in bytes
 */
function calculateBase64Size(base64String) {
  // Remove whitespace and padding
  const cleaned = base64String.replace(/\s/g, '').replace(/=+$/, '');

  // Calculate size: base64 is 4/3 of original size
  return Math.floor((cleaned.length * 3) / 4);
}

/**
 * Sleep utility for retry delays
 *
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Validate receipt file before processing
 *
 * @param {File} file - File object to validate
 * @param {Object} [options] - Validation options
 * @param {number} [options.maxSize=5242880] - Maximum file size in bytes (default 5MB)
 * @param {string[]} [options.allowedTypes] - Allowed MIME types
 * @returns {Object} - Validation result { valid: boolean, error: string|null }
 */
function validateReceiptFile(file, options = {}) {
  const config = {
    maxSize: 5 * 1024 * 1024, // 5MB
    allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'],
    ...options
  };

  // Check if file exists
  if (!file || !(file instanceof File)) {
    return {
      valid: false,
      error: 'No file provided'
    };
  }

  // Check file type
  if (!config.allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: `Invalid file type: ${file.type}. Allowed: ${config.allowedTypes.join(', ')}`
    };
  }

  // Check file size
  if (file.size > config.maxSize) {
    const sizeMB = (file.size / 1024 / 1024).toFixed(1);
    const maxSizeMB = (config.maxSize / 1024 / 1024).toFixed(1);
    return {
      valid: false,
      error: `File too large: ${sizeMB}MB. Maximum: ${maxSizeMB}MB`
    };
  }

  return {
    valid: true,
    error: null
  };
}

/**
 * Convert File to base64 data URL
 *
 * @param {File} file - File object to convert
 * @returns {Promise<string>} - Base64 data URL (with data URI prefix)
 */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve(reader.result);
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Get user-friendly error message
 *
 * @param {Error|OcrApiError} error - Error object
 * @returns {string} - User-friendly error message in Hebrew
 */
function getErrorMessage(error) {
  if (error instanceof OcrApiError) {
    // Map status codes to Hebrew messages
    const statusMessages = {
      0: 'שגיאת רשת. אנא בדוק את החיבור לאינטרנט.',
      400: 'קובץ לא תקין. אנא בחר קובץ קבלה תקין.',
      401: 'נדרשת אימות. אנא התחבר מחדש.',
      403: 'אין לך הרשאה לבצע פעולה זו.',
      408: 'הזמן הקצוב לעיבוד הקבלה תם. אנא נסה עם תמונה קטנה יותר.',
      413: 'הקובץ גדול מדי. גודל מקסימלי: 5MB.',
      429: 'יותר מדי בקשות. אנא נסה שוב בעוד כמה רגעים.',
      500: 'שגיאת שרת. אנא נסה שוב מאוחר יותר.',
      503: 'השירות אינו זמין כרגע. אנא נסה שוב מאוחר יותר.'
    };

    return statusMessages[error.statusCode] || error.message || 'שגיאה לא ידועה';
  }

  return error.message || 'שגיאה לא ידועה בעיבוד הקבלה';
}

/**
 * Check if error is retryable
 *
 * @param {Error|OcrApiError} error - Error object
 * @returns {boolean} - True if error is retryable
 */
function isRetryableError(error) {
  if (!(error instanceof OcrApiError)) {
    return true; // Network errors are retryable
  }

  // Server errors (5xx) and timeout are retryable
  return error.statusCode >= 500 || error.statusCode === 408 || error.statusCode === 429;
}

/**
 * Configure OCR API settings
 *
 * @param {Object} config - Configuration options
 * @param {string} [config.endpoint] - API endpoint URL
 * @param {number} [config.timeout] - Request timeout in milliseconds
 * @param {number} [config.maxRetries] - Maximum number of retries
 * @param {number} [config.retryDelay] - Delay between retries in milliseconds
 */
function configureOcrApi(config) {
  Object.assign(OCR_API_CONFIG, config);
}

/**
 * Get current OCR API configuration
 *
 * @returns {Object} - Current configuration
 */
function getOcrApiConfig() {
  return { ...OCR_API_CONFIG };
}

// Export functions
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    processReceiptOCR,
    validateReceiptFile,
    fileToBase64,
    getErrorMessage,
    isRetryableError,
    configureOcrApi,
    getOcrApiConfig,
    OcrApiError
  };
}

// Also expose as window.OcrApi for easy access in browser
if (typeof window !== 'undefined') {
  window.OcrApi = {
    processReceiptOCR,
    validateReceiptFile,
    fileToBase64,
    getErrorMessage,
    isRetryableError,
    configureOcrApi,
    getOcrApiConfig,
    OcrApiError
  };
}
