// lambda/shared/logger.js
// Structured logging utility for production Lambda functions
// Provides consistent JSON logging format for CloudWatch Logs Insights

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

// Get log level from environment, default to INFO in production
const getCurrentLogLevel = () => {
  const envLevel = process.env.LOG_LEVEL?.toUpperCase();
  return LOG_LEVELS[envLevel] ?? (process.env.NODE_ENV === 'production' ? LOG_LEVELS.INFO : LOG_LEVELS.DEBUG);
};

/**
 * Create structured log entry
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {Object} context - Additional context data
 * @returns {Object} Structured log entry
 */
const createLogEntry = (level, message, context = {}) => {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    service: process.env.AWS_LAMBDA_FUNCTION_NAME || 'unknown',
    requestId: context.requestId || global.currentRequestId || undefined,
    ...context
  };

  // Remove undefined values
  Object.keys(entry).forEach(key => {
    if (entry[key] === undefined) {
      delete entry[key];
    }
  });

  return entry;
};

/**
 * Sanitize sensitive data from logs
 * @param {Object} data - Data to sanitize
 * @returns {Object} Sanitized data
 */
const sanitize = (data) => {
  if (!data || typeof data !== 'object') return data;

  const sensitiveFields = [
    'password', 'token', 'secret', 'apiKey', 'api_key',
    'authorization', 'auth', 'credential', 'jwt',
    'accessToken', 'refreshToken', 'sessionToken',
    'cardNumber', 'cvv', 'ssn', 'taxId'
  ];

  const sanitized = { ...data };

  Object.keys(sanitized).forEach(key => {
    const lowerKey = key.toLowerCase();
    if (sensitiveFields.some(field => lowerKey.includes(field.toLowerCase()))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      sanitized[key] = sanitize(sanitized[key]);
    }
  });

  return sanitized;
};

/**
 * Logger class for structured logging
 */
class Logger {
  constructor(moduleName) {
    this.moduleName = moduleName;
    this.logLevel = getCurrentLogLevel();
  }

  /**
   * Set request ID for correlation
   */
  setRequestId(requestId) {
    global.currentRequestId = requestId;
  }

  /**
   * Check if log level is enabled
   */
  isLevelEnabled(level) {
    return LOG_LEVELS[level] >= this.logLevel;
  }

  /**
   * Output log entry
   */
  _log(level, message, context = {}) {
    if (!this.isLevelEnabled(level)) return;

    const sanitizedContext = sanitize(context);
    const entry = createLogEntry(level, message, {
      ...sanitizedContext,
      module: this.moduleName
    });

    // Use appropriate console method
    const output = JSON.stringify(entry);
    switch (level) {
      case 'ERROR':
        console.error(output);
        break;
      case 'WARN':
        console.warn(output);
        break;
      default:
        console.log(output);
    }
  }

  debug(message, context = {}) {
    this._log('DEBUG', message, context);
  }

  info(message, context = {}) {
    this._log('INFO', message, context);
  }

  warn(message, context = {}) {
    this._log('WARN', message, context);
  }

  error(message, context = {}) {
    // If context includes an Error object, extract useful info
    if (context.error instanceof Error) {
      context = {
        ...context,
        errorMessage: context.error.message,
        errorStack: context.error.stack,
        errorName: context.error.name
      };
      delete context.error;
    }
    this._log('ERROR', message, context);
  }

  /**
   * Log Lambda invocation start
   */
  logInvocation(event, context) {
    if (context?.awsRequestId) {
      this.setRequestId(context.awsRequestId);
    }

    this.info('Lambda invocation started', {
      httpMethod: event.httpMethod,
      path: event.path,
      requestId: context?.awsRequestId,
      functionVersion: context?.functionVersion
    });
  }

  /**
   * Log Lambda response
   */
  logResponse(statusCode, duration) {
    const level = statusCode >= 500 ? 'ERROR' : statusCode >= 400 ? 'WARN' : 'INFO';
    this._log(level, 'Lambda response', {
      statusCode,
      duration: `${duration}ms`
    });
  }
}

/**
 * Create a logger instance for a module
 * @param {string} moduleName - Name of the module
 * @returns {Logger} Logger instance
 */
const createLogger = (moduleName) => new Logger(moduleName);

module.exports = {
  createLogger,
  Logger,
  LOG_LEVELS,
  sanitize
};
