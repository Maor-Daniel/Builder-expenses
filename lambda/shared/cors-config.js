/**
 * CORS Configuration for Construction Expenses Application
 *
 * SECURITY: Restricts API access to authorized domains only to prevent CSRF attacks
 * and unauthorized API access. NEVER use wildcard (*) in production.
 *
 * This module provides secure CORS handling with:
 * - Whitelisted origins only
 * - Environment-aware configuration
 * - CORS violation logging for security monitoring
 * - Proper preflight handling
 */

// Production allowed origins
const PRODUCTION_ORIGINS = [
  // CloudFront distribution
  'https://d6dvynagj630i.cloudfront.net',

  // Custom domain (if configured)
  'https://builder-expenses.com',
  'https://www.builder-expenses.com',

  // Clerk authentication frontend
  'https://Builder-expenses.clerk.accounts.dev',
  'https://builder-expenses.clerk.accounts.dev'
];

// Development origins (only in non-production environments)
const DEVELOPMENT_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:8080',
  'http://localhost:8000',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:8080',
  'http://127.0.0.1:8000'
];

/**
 * Determine if running in production environment
 */
function isProduction() {
  const nodeEnv = process.env.NODE_ENV;
  const awsRegion = process.env.AWS_REGION;

  return nodeEnv === 'production' ||
         (awsRegion === 'us-east-1' && !process.env.IS_LOCAL_DEVELOPMENT);
}

/**
 * Get allowed origins based on environment
 * @returns {string[]} Array of allowed origin URLs
 */
function getAllowedOrigins() {
  if (isProduction()) {
    console.log('[CORS] Using production origins only');
    return PRODUCTION_ORIGINS;
  }

  // Include development origins in non-production environments
  console.log('[CORS] Using production + development origins');
  return [...PRODUCTION_ORIGINS, ...DEVELOPMENT_ORIGINS];
}

/**
 * Check if origin is in the allowed list
 * @param {string|undefined} origin - Request origin header
 * @returns {boolean} True if origin is allowed
 */
function isOriginAllowed(origin) {
  if (!origin) {
    // No origin header - could be same-origin request or non-browser client
    // For API calls, we'll be strict and require origin in production
    return !isProduction();
  }

  const allowedOrigins = getAllowedOrigins();
  const isAllowed = allowedOrigins.includes(origin);

  if (!isAllowed) {
    console.warn(`[CORS] Origin not allowed: ${origin}`);
  }

  return isAllowed;
}

/**
 * Get CORS headers for response
 * SECURITY: Only allows pre-approved origins, never wildcard (*)
 *
 * @param {string|undefined} requestOrigin - Origin from request headers
 * @returns {Object} CORS headers object
 */
function getCorsHeaders(requestOrigin) {
  const allowedOrigins = getAllowedOrigins();

  // Determine which origin to return
  // If request origin is allowed, use it (enables credential support)
  // Otherwise, use first production origin as default
  const origin = requestOrigin && allowedOrigins.includes(requestOrigin)
    ? requestOrigin
    : allowedOrigins[0];

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Requested-With',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS,PATCH',
    'Access-Control-Max-Age': '3600', // Cache preflight for 1 hour
    'Vary': 'Origin', // Important for proper CDN/browser caching
    'Content-Type': 'application/json'
  };
}

/**
 * Create standardized CORS-enabled response
 * @param {number} statusCode - HTTP status code
 * @param {Object|string} body - Response body (will be stringified if object)
 * @param {string|undefined} requestOrigin - Origin from request headers
 * @param {Object} additionalHeaders - Additional headers to include
 * @returns {Object} Lambda response object with CORS headers
 */
function createCorsResponse(statusCode, body, requestOrigin, additionalHeaders = {}) {
  return {
    statusCode,
    headers: {
      ...getCorsHeaders(requestOrigin),
      ...additionalHeaders
    },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  };
}

/**
 * Create error response with CORS headers
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 * @param {string|undefined} requestOrigin - Origin from request headers
 * @param {Error|null} error - Optional error object for debugging
 * @returns {Object} Lambda response object
 */
function createCorsErrorResponse(statusCode, message, requestOrigin, error = null) {
  const body = {
    error: true,
    message,
    timestamp: new Date().toISOString()
  };

  // Include error details in non-production environments
  if (!isProduction() && error) {
    body.debug = {
      stack: error.stack,
      details: error.message
    };
  }

  return createCorsResponse(statusCode, body, requestOrigin);
}

/**
 * Create response for OPTIONS preflight requests
 * @param {string|undefined} requestOrigin - Origin from request headers
 * @returns {Object} Lambda response object
 */
function createOptionsResponse(requestOrigin) {
  // Check if origin is allowed
  if (!isOriginAllowed(requestOrigin)) {
    // Log security violation
    logCorsViolation(requestOrigin, 'OPTIONS-preflight');

    // Return 403 Forbidden for disallowed origins
    return {
      statusCode: 403,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        error: 'Origin not allowed',
        timestamp: new Date().toISOString()
      })
    };
  }

  // Return successful preflight response
  return {
    statusCode: 200,
    headers: getCorsHeaders(requestOrigin),
    body: ''
  };
}

/**
 * Log CORS violation for security monitoring
 * This is critical for detecting potential attacks or misconfigurations
 *
 * @param {string|undefined} requestOrigin - Origin that was blocked
 * @param {string} functionName - Lambda function name
 * @param {Object} additionalContext - Additional context for the log
 */
function logCorsViolation(requestOrigin, functionName, additionalContext = {}) {
  const violation = {
    type: 'CORS_VIOLATION',
    severity: 'SECURITY',
    timestamp: new Date().toISOString(),
    origin: requestOrigin || 'NO_ORIGIN_HEADER',
    function: functionName,
    environment: process.env.NODE_ENV || 'unknown',
    awsRegion: process.env.AWS_REGION || 'unknown',
    allowedOrigins: getAllowedOrigins(),
    ...additionalContext
  };

  // Log as JSON for CloudWatch Insights parsing
  console.error(JSON.stringify(violation));

  // Human-readable log for immediate visibility
  console.error(`[SECURITY] CORS Violation: Origin '${requestOrigin || 'NONE'}' attempted to access ${functionName}`);
}

/**
 * Extract origin from Lambda event
 * @param {Object} event - Lambda event object
 * @returns {string|undefined} Origin header value
 */
function getOriginFromEvent(event) {
  // Check both capitalization variants
  return event.headers?.origin ||
         event.headers?.Origin ||
         event.headers?.ORIGIN;
}

/**
 * Middleware wrapper for Lambda handlers to enforce CORS security
 *
 * @param {Function} handler - Lambda handler function
 * @param {Object} options - Configuration options
 * @param {boolean} options.requireOrigin - If true, blocks requests without origin header in production
 * @returns {Function} Wrapped handler with CORS enforcement
 */
function withSecureCors(handler, options = {}) {
  return async (event, context) => {
    const functionName = context.functionName || 'unknown-function';
    const origin = getOriginFromEvent(event);

    // Handle OPTIONS preflight requests
    if (event.httpMethod === 'OPTIONS' || event.requestContext?.httpMethod === 'OPTIONS') {
      return createOptionsResponse(origin);
    }

    // Enforce origin checking in production (unless explicitly disabled)
    if (options.requireOrigin !== false && isProduction()) {
      if (!isOriginAllowed(origin)) {
        logCorsViolation(origin, functionName, {
          path: event.path,
          method: event.httpMethod,
          userAgent: event.headers?.['user-agent'] || 'unknown'
        });

        return createCorsResponse(
          403,
          { error: 'Forbidden', message: 'Origin not allowed' },
          origin
        );
      }
    }

    try {
      // Call the actual handler
      const result = await handler(event, context);

      // If handler returns a response, ensure it has CORS headers
      if (result && typeof result === 'object' && result.statusCode) {
        // Add CORS headers if not already present
        if (!result.headers || !result.headers['Access-Control-Allow-Origin']) {
          result.headers = {
            ...getCorsHeaders(origin),
            ...(result.headers || {})
          };
        }
      }

      return result;

    } catch (error) {
      console.error(`[${functionName}] Handler error:`, error);
      return createCorsErrorResponse(500, 'Internal server error', origin, error);
    }
  };
}

/**
 * Check if current execution is in a production environment
 * (exported for testing and conditional logic)
 */
const IS_PRODUCTION = isProduction();

module.exports = {
  // Configuration
  PRODUCTION_ORIGINS,
  DEVELOPMENT_ORIGINS,
  IS_PRODUCTION,

  // Core functions
  getAllowedOrigins,
  isOriginAllowed,
  getCorsHeaders,

  // Response builders
  createCorsResponse,
  createCorsErrorResponse,
  createOptionsResponse,

  // Utilities
  getOriginFromEvent,
  logCorsViolation,

  // Middleware
  withSecureCors
};
