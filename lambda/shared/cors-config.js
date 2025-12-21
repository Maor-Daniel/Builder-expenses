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

// Allow all origins flag for mobile development
// SECURITY: Endpoints are still protected by Clerk JWT authentication
const ALLOW_ALL_ORIGINS = true;

// Development origins (only in non-production environments)
const DEVELOPMENT_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:8080',
  'http://localhost:8000',
  'http://localhost:8081',  // Expo React Native dev server
  'http://127.0.0.1:3000',
  'http://127.0.0.1:8080',
  'http://127.0.0.1:8000',
  'http://127.0.0.1:8081'   // Expo React Native dev server
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
  // Allow all origins if flag is set (for mobile development)
  if (ALLOW_ALL_ORIGINS) {
    return true;
  }

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
 *
 * @param {string|undefined} requestOrigin - Origin from request headers
 * @returns {Object} CORS headers object
 */
function getCorsHeaders(requestOrigin) {
  // If allowing all origins, use wildcard
  if (ALLOW_ALL_ORIGINS) {
    console.log('[CORS] ALLOW_ALL_ORIGINS enabled - returning wildcard');
    return {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Requested-With',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS,PATCH',
      'Access-Control-Max-Age': '3600',
      'Content-Type': 'application/json'
    };
  }

  const allowedOrigins = getAllowedOrigins();

  // Debug logging for CORS troubleshooting
  console.log('[CORS] getCorsHeaders called', {
    requestOrigin,
    allowedOrigins,
    isIncluded: requestOrigin ? allowedOrigins.includes(requestOrigin) : false
  });

  // Determine which origin to return
  // If request origin is allowed, use it (enables credential support)
  // Otherwise, use first production origin as default
  const origin = requestOrigin && allowedOrigins.includes(requestOrigin)
    ? requestOrigin
    : allowedOrigins[0];

  console.log('[CORS] Selected origin for response:', origin);

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
  // If allowing all origins, skip origin check
  if (ALLOW_ALL_ORIGINS) {
    return {
      statusCode: 200,
      headers: getCorsHeaders(requestOrigin),
      body: ''
    };
  }

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

// Maximum request body size (1MB - sufficient for API data, prevents abuse)
const MAX_BODY_SIZE_BYTES = 1 * 1024 * 1024; // 1MB

/**
 * Validate request body size
 * @param {Object} event - Lambda event object
 * @param {number} maxSize - Maximum allowed body size in bytes
 * @returns {Object|null} Error response if body exceeds limit, null if valid
 */
function validateBodySize(event, maxSize = MAX_BODY_SIZE_BYTES) {
  if (!event.body) {
    return null; // No body, no limit to check
  }

  const bodySize = Buffer.byteLength(event.body, 'utf8');

  if (bodySize > maxSize) {
    console.warn(`[SECURITY] Request body too large: ${bodySize} bytes (max: ${maxSize})`);
    return {
      statusCode: 413,
      body: JSON.stringify({
        error: 'Payload Too Large',
        message: `Request body exceeds maximum size of ${Math.floor(maxSize / 1024)}KB`,
        maxAllowed: maxSize,
        received: bodySize
      })
    };
  }

  return null; // Body size is valid
}

/**
 * Default cache durations for different data types
 */
const CACHE_DURATIONS = {
  // Data that changes frequently (expenses can be added/edited anytime)
  EXPENSES: 0, // No caching for expenses - always fresh
  // Reference data that rarely changes
  PROJECTS: 60, // 1 minute cache for projects list
  CONTRACTORS: 60, // 1 minute cache for contractors list
  WORKS: 60, // 1 minute cache for works list
  COMPANY: 300, // 5 minutes cache for company info
  // Default for other GET endpoints
  DEFAULT: 30 // 30 seconds default
};

/**
 * Middleware wrapper for Lambda handlers to enforce CORS security
 *
 * @param {Function} handler - Lambda handler function
 * @param {Object} options - Configuration options
 * @param {boolean} options.requireOrigin - If true, blocks requests without origin header in production
 * @param {number} options.maxBodySize - Maximum body size in bytes (default: 1MB)
 * @param {number} options.cacheMaxAge - Cache duration in seconds for GET requests (default: 0 = no cache)
 * @returns {Function} Wrapped handler with CORS enforcement
 */
function withSecureCors(handler, options = {}) {
  return async (event, context) => {
    const functionName = context.functionName || 'unknown-function';
    const origin = getOriginFromEvent(event);

    console.log(`[CORS] ${functionName} - Extracted origin:`, origin);
    console.log(`[CORS] ${functionName} - Request headers:`, JSON.stringify(event.headers || {}));

    // Handle OPTIONS preflight requests
    if (event.httpMethod === 'OPTIONS' || event.requestContext?.httpMethod === 'OPTIONS') {
      console.log(`[CORS] ${functionName} - Handling OPTIONS preflight request`);
      return createOptionsResponse(origin);
    }

    // Validate request body size (before any processing)
    const maxBodySize = options.maxBodySize || MAX_BODY_SIZE_BYTES;
    const bodySizeError = validateBodySize(event, maxBodySize);
    if (bodySizeError) {
      return {
        ...bodySizeError,
        headers: getCorsHeaders(origin)
      };
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
          console.log(`[CORS] ${functionName} - Adding CORS headers to response`);
          result.headers = {
            ...getCorsHeaders(origin),
            ...(result.headers || {})
          };
        } else {
          console.log(`[CORS] ${functionName} - Response already has CORS headers:`, result.headers['Access-Control-Allow-Origin']);
        }

        // Add cache headers for successful GET requests
        const httpMethod = event.httpMethod || event.requestContext?.httpMethod;
        if (httpMethod === 'GET' && result.statusCode >= 200 && result.statusCode < 300) {
          // Determine cache duration based on function name or explicit option
          let cacheMaxAge = options.cacheMaxAge;
          if (cacheMaxAge === undefined) {
            // Auto-detect cache duration based on function name
            if (functionName.includes('project')) {
              cacheMaxAge = CACHE_DURATIONS.PROJECTS;
            } else if (functionName.includes('contractor')) {
              cacheMaxAge = CACHE_DURATIONS.CONTRACTORS;
            } else if (functionName.includes('work')) {
              cacheMaxAge = CACHE_DURATIONS.WORKS;
            } else if (functionName.includes('company') && !functionName.includes('expense')) {
              cacheMaxAge = CACHE_DURATIONS.COMPANY;
            } else if (functionName.includes('expense')) {
              cacheMaxAge = CACHE_DURATIONS.EXPENSES; // 0 - no cache
            } else {
              cacheMaxAge = CACHE_DURATIONS.DEFAULT;
            }
          }

          if (cacheMaxAge > 0) {
            result.headers['Cache-Control'] = `private, max-age=${cacheMaxAge}`;
            result.headers['Vary'] = 'Authorization, Origin';
            console.log(`[CORS] ${functionName} - Added cache headers: max-age=${cacheMaxAge}`);
          } else {
            // No cache for dynamic/sensitive data
            result.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate';
          }
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
  MAX_BODY_SIZE_BYTES,
  ALLOW_ALL_ORIGINS,
  CACHE_DURATIONS,

  // Core functions
  getAllowedOrigins,
  isOriginAllowed,
  getCorsHeaders,
  validateBodySize,

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
