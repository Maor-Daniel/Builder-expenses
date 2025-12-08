// lambda/shared/audit-logger.js
// Audit logging for security compliance and operational tracking
// All CRUD operations are logged to CloudWatch with structured JSON

const { sanitize } = require('./logger');

/**
 * Audit action types
 */
const AUDIT_ACTIONS = {
  CREATE: 'CREATE',
  READ: 'READ',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  INVITE: 'INVITE',
  PERMISSION_CHANGE: 'PERMISSION_CHANGE',
  SUBSCRIPTION_CHANGE: 'SUBSCRIPTION_CHANGE',
  FILE_UPLOAD: 'FILE_UPLOAD',
  EXPORT: 'EXPORT'
};

/**
 * Resource types for audit logging
 */
const RESOURCE_TYPES = {
  EXPENSE: 'expense',
  PROJECT: 'project',
  CONTRACTOR: 'contractor',
  WORK: 'work',
  COMPANY: 'company',
  USER: 'user',
  INVITATION: 'invitation',
  SUBSCRIPTION: 'subscription',
  FILE: 'file',
  REPORT: 'report'
};

/**
 * Create a structured audit log entry
 * @param {Object} params - Audit parameters
 * @returns {Object} Structured audit entry
 */
function createAuditEntry({
  action,
  resourceType,
  resourceId,
  companyId,
  userId,
  userRole,
  success = true,
  errorMessage = null,
  before = null,
  after = null,
  metadata = {},
  request = {}
}) {
  const entry = {
    // Audit identification
    auditType: 'AUDIT_LOG',
    timestamp: new Date().toISOString(),

    // Action details
    action,
    resourceType,
    resourceId: resourceId || 'N/A',

    // Actor information
    companyId,
    userId,
    userRole: userRole || 'unknown',

    // Result
    success,
    errorMessage: success ? null : errorMessage,

    // Change tracking (for UPDATE operations)
    before: before ? sanitize(before) : null,
    after: after ? sanitize(after) : null,

    // Request context
    requestContext: {
      ip: extractClientIP(request),
      userAgent: request.headers?.['user-agent'] || request.headers?.['User-Agent'] || 'unknown',
      method: request.httpMethod || 'unknown',
      path: request.path || 'unknown',
      requestId: request.requestContext?.requestId || 'unknown'
    },

    // Additional metadata
    metadata: sanitize(metadata),

    // Service information
    service: process.env.AWS_LAMBDA_FUNCTION_NAME || 'unknown',
    environment: process.env.NODE_ENV || 'production',
    region: process.env.AWS_REGION || 'unknown'
  };

  // Remove null values for cleaner logs
  Object.keys(entry).forEach(key => {
    if (entry[key] === null) {
      delete entry[key];
    }
  });

  return entry;
}

/**
 * Extract client IP from Lambda event
 * @param {Object} event - Lambda event object
 * @returns {string} Client IP address
 */
function extractClientIP(event) {
  // Try various sources for client IP
  return event.requestContext?.identity?.sourceIp ||
         event.headers?.['X-Forwarded-For']?.split(',')[0]?.trim() ||
         event.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
         'unknown';
}

/**
 * AuditLogger class for consistent audit logging
 */
class AuditLogger {
  constructor(resourceType) {
    this.resourceType = resourceType;
  }

  /**
   * Log a CREATE operation
   */
  logCreate({
    resourceId,
    companyId,
    userId,
    userRole,
    data,
    request,
    success = true,
    errorMessage = null
  }) {
    const entry = createAuditEntry({
      action: AUDIT_ACTIONS.CREATE,
      resourceType: this.resourceType,
      resourceId,
      companyId,
      userId,
      userRole,
      success,
      errorMessage,
      after: data,
      request
    });

    this._output(entry, success);
    return entry;
  }

  /**
   * Log a READ operation
   */
  logRead({
    resourceId,
    companyId,
    userId,
    userRole,
    request,
    count = null,
    success = true,
    errorMessage = null
  }) {
    const entry = createAuditEntry({
      action: AUDIT_ACTIONS.READ,
      resourceType: this.resourceType,
      resourceId: resourceId || 'LIST',
      companyId,
      userId,
      userRole,
      success,
      errorMessage,
      metadata: count !== null ? { recordsReturned: count } : {},
      request
    });

    this._output(entry, success);
    return entry;
  }

  /**
   * Log an UPDATE operation
   */
  logUpdate({
    resourceId,
    companyId,
    userId,
    userRole,
    before,
    after,
    request,
    success = true,
    errorMessage = null
  }) {
    const entry = createAuditEntry({
      action: AUDIT_ACTIONS.UPDATE,
      resourceType: this.resourceType,
      resourceId,
      companyId,
      userId,
      userRole,
      success,
      errorMessage,
      before,
      after,
      request
    });

    this._output(entry, success);
    return entry;
  }

  /**
   * Log a DELETE operation
   */
  logDelete({
    resourceId,
    companyId,
    userId,
    userRole,
    deletedData,
    request,
    success = true,
    errorMessage = null
  }) {
    const entry = createAuditEntry({
      action: AUDIT_ACTIONS.DELETE,
      resourceType: this.resourceType,
      resourceId,
      companyId,
      userId,
      userRole,
      success,
      errorMessage,
      before: deletedData,
      request
    });

    this._output(entry, success);
    return entry;
  }

  /**
   * Log a custom action
   */
  logAction({
    action,
    resourceId,
    companyId,
    userId,
    userRole,
    data,
    metadata = {},
    request,
    success = true,
    errorMessage = null
  }) {
    const entry = createAuditEntry({
      action,
      resourceType: this.resourceType,
      resourceId,
      companyId,
      userId,
      userRole,
      success,
      errorMessage,
      after: data,
      metadata,
      request
    });

    this._output(entry, success);
    return entry;
  }

  /**
   * Output the audit log entry
   */
  _output(entry, success) {
    const output = JSON.stringify(entry);
    if (success) {
      console.log(output);
    } else {
      console.error(output);
    }
  }
}

/**
 * Create an audit logger for a specific resource type
 * @param {string} resourceType - Type of resource being audited
 * @returns {AuditLogger} Audit logger instance
 */
function createAuditLogger(resourceType) {
  return new AuditLogger(resourceType);
}

module.exports = {
  createAuditLogger,
  AuditLogger,
  AUDIT_ACTIONS,
  RESOURCE_TYPES,
  createAuditEntry,
  extractClientIP
};
