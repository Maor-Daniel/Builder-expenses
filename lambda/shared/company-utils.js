// lambda/shared/company-utils.js
// Company-scoped utilities for multi-tenant architecture

// AWS SDK v3 imports - modular for reduced bundle size and faster cold starts
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  QueryCommand,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  ScanCommand,
  BatchGetCommand,
  BatchWriteCommand
} = require('@aws-sdk/lib-dynamodb');

const crypto = require('crypto');
const { withSecureCors } = require('./cors-config');
const { createLogger } = require('./logger');
const { COMPANY_TABLE_NAMES } = require('./table-config');

const logger = createLogger('company-utils');

// AWS SDK v3 DynamoDB client configuration
const dynamoConfig = {
  region: process.env.AWS_REGION || 'us-east-1'
};

// Create DynamoDB client with Document Client wrapper
const ddbClient = new DynamoDBClient(dynamoConfig);
const dynamodb = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: {
    convertEmptyValues: false,
    removeUndefinedValues: true,
    convertClassInstanceToMap: false
  },
  unmarshallOptions: {
    wrapNumbers: false
  }
});

// Note: Cognito client removed - using Clerk for authentication

/**
 * Determine if running in production environment
 * Checks multiple indicators to ensure robust production detection
 */
function isProductionEnvironment() {
  // Check NODE_ENV
  if (process.env.NODE_ENV === 'production') {
    return true;
  }

  // Check explicit ENVIRONMENT variable
  if (process.env.ENVIRONMENT === 'production') {
    return true;
  }

  // Check if AWS region is production region (us-east-1 is typical production)
  // This is a safety check - if neither auth is enabled and we're in us-east-1,
  // assume production and block test mode
  const awsRegion = process.env.AWS_REGION;
  if (awsRegion === 'us-east-1' && !process.env.IS_LOCAL_DEVELOPMENT) {
    return true;
  }

  return false;
}

/**
 * Log critical security event in CloudWatch-compatible format
 */
function logSecurityEvent(eventType, severity, message, additionalData = {}) {
  const securityEvent = {
    eventType,
    severity,
    environment: process.env.NODE_ENV || 'unknown',
    awsRegion: process.env.AWS_REGION || 'unknown',
    ...additionalData
  };

  // Use structured logger for security events
  if (severity === 'CRITICAL' || severity === 'ERROR') {
    logger.error(`[SECURITY] ${eventType}: ${message}`, securityEvent);
  } else if (severity === 'WARNING') {
    logger.warn(`[SECURITY] ${eventType}: ${message}`, securityEvent);
  } else {
    logger.info(`[SECURITY] ${eventType}: ${message}`, securityEvent);
  }
}

// System projects that are auto-created for each company
const SYSTEM_PROJECTS = {
  GENERAL_EXPENSES: {
    projectId: 'proj_GENERAL_EXPENSES',
    name: 'הוצאות כלליות',
    description: 'הוצאות שאינן משויכות לפרויקט ספציפי',
    isSystemProject: true
  }
};

// System contractors that are auto-created for each company
const SYSTEM_CONTRACTORS = {
  GENERAL_CONTRACTOR: {
    contractorId: 'cont_GENERAL',
    name: 'ספק כללי',
    description: 'ספק ברירת מחדל עבור הוצאות ללא ספק מזוהה',
    isSystemContractor: true
  }
};

// User roles
const USER_ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  EDITOR: 'editor', 
  VIEWER: 'viewer',
  USER: 'user'  // Legacy support
};

// Permission definitions for Phase 3
const PERMISSIONS = {
  // Billing & Company
  MANAGE_BILLING: "manage_billing",
  MANAGE_COMPANY: "manage_company",
  
  // User Management  
  INVITE_USERS: "invite_users",
  MANAGE_USERS: "manage_users",
  VIEW_USERS: "view_users",
  
  // Data Management
  MANAGE_PROJECTS: "manage_projects", 
  CREATE_PROJECTS: "create_projects",
  EDIT_ALL_PROJECTS: "edit_all_projects",
  EDIT_OWN_PROJECTS: "edit_own_projects",
  DELETE_PROJECTS: "delete_projects",
  
  // Contractors
  MANAGE_CONTRACTORS: "manage_contractors",
  CREATE_CONTRACTORS: "create_contractors", 
  EDIT_ALL_CONTRACTORS: "edit_all_contractors",
  EDIT_OWN_CONTRACTORS: "edit_own_contractors",
  DELETE_CONTRACTORS: "delete_contractors",
  
  // Works
  MANAGE_WORKS: "manage_works",
  CREATE_WORKS: "create_works",
  EDIT_ALL_WORKS: "edit_all_works", 
  EDIT_OWN_WORKS: "edit_own_works",
  DELETE_WORKS: "delete_works",
  
  // Expenses
  MANAGE_EXPENSES: "manage_expenses",
  CREATE_EXPENSES: "create_expenses",
  EDIT_ALL_EXPENSES: "edit_all_expenses",
  EDIT_OWN_EXPENSES: "edit_own_expenses", 
  DELETE_EXPENSES: "delete_expenses",
  
  // System
  VIEW_ALL_DATA: "view_all_data",
  EXPORT_DATA: "export_data",
  VIEW_REPORTS: "view_reports"
};

// Role-based permission assignments
const ROLE_PERMISSIONS = {
  [USER_ROLES.ADMIN]: [
    PERMISSIONS.MANAGE_BILLING,
    PERMISSIONS.MANAGE_COMPANY,
    PERMISSIONS.INVITE_USERS,
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.VIEW_USERS,
    PERMISSIONS.MANAGE_PROJECTS,
    PERMISSIONS.CREATE_PROJECTS,
    PERMISSIONS.EDIT_ALL_PROJECTS,
    PERMISSIONS.DELETE_PROJECTS,
    PERMISSIONS.MANAGE_CONTRACTORS,
    PERMISSIONS.CREATE_CONTRACTORS,
    PERMISSIONS.EDIT_ALL_CONTRACTORS,
    PERMISSIONS.DELETE_CONTRACTORS,
    PERMISSIONS.MANAGE_WORKS,
    PERMISSIONS.CREATE_WORKS,
    PERMISSIONS.EDIT_ALL_WORKS,
    PERMISSIONS.DELETE_WORKS,
    PERMISSIONS.MANAGE_EXPENSES,
    PERMISSIONS.CREATE_EXPENSES,
    PERMISSIONS.EDIT_ALL_EXPENSES,
    PERMISSIONS.DELETE_EXPENSES,
    PERMISSIONS.VIEW_ALL_DATA,
    PERMISSIONS.EXPORT_DATA,
    PERMISSIONS.VIEW_REPORTS
  ],
  [USER_ROLES.MANAGER]: [
    PERMISSIONS.VIEW_USERS,
    PERMISSIONS.MANAGE_PROJECTS,
    PERMISSIONS.CREATE_PROJECTS,
    PERMISSIONS.EDIT_ALL_PROJECTS,
    PERMISSIONS.DELETE_PROJECTS,
    PERMISSIONS.MANAGE_CONTRACTORS,
    PERMISSIONS.CREATE_CONTRACTORS,
    PERMISSIONS.EDIT_ALL_CONTRACTORS,
    PERMISSIONS.DELETE_CONTRACTORS,
    PERMISSIONS.MANAGE_WORKS,
    PERMISSIONS.CREATE_WORKS,
    PERMISSIONS.EDIT_ALL_WORKS,
    PERMISSIONS.DELETE_WORKS,
    PERMISSIONS.MANAGE_EXPENSES,
    PERMISSIONS.CREATE_EXPENSES,
    PERMISSIONS.EDIT_ALL_EXPENSES,
    PERMISSIONS.DELETE_EXPENSES,
    PERMISSIONS.VIEW_ALL_DATA,
    PERMISSIONS.EXPORT_DATA,
    PERMISSIONS.VIEW_REPORTS
  ],
  [USER_ROLES.EDITOR]: [
    PERMISSIONS.CREATE_PROJECTS,
    PERMISSIONS.EDIT_OWN_PROJECTS,
    PERMISSIONS.CREATE_CONTRACTORS,
    PERMISSIONS.EDIT_OWN_CONTRACTORS,
    PERMISSIONS.CREATE_WORKS,
    PERMISSIONS.EDIT_OWN_WORKS,
    PERMISSIONS.CREATE_EXPENSES,
    PERMISSIONS.EDIT_OWN_EXPENSES,
    PERMISSIONS.VIEW_REPORTS
  ],
  [USER_ROLES.VIEWER]: [
    PERMISSIONS.VIEW_REPORTS
  ],
  [USER_ROLES.USER]: [  // Legacy role support
    PERMISSIONS.CREATE_PROJECTS,
    PERMISSIONS.EDIT_OWN_PROJECTS,
    PERMISSIONS.CREATE_CONTRACTORS,
    PERMISSIONS.EDIT_OWN_CONTRACTORS,
    PERMISSIONS.CREATE_WORKS,
    PERMISSIONS.EDIT_OWN_WORKS,
    PERMISSIONS.CREATE_EXPENSES,
    PERMISSIONS.EDIT_OWN_EXPENSES,
    PERMISSIONS.VIEW_REPORTS
  ]
};

// Invitation status
const INVITATION_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled'
};

/**
 * Create standardized API response
 * SECURITY: Returns response WITHOUT CORS headers - let middleware handle CORS
 * The withSecureCors or withCompanyAuth middleware will add appropriate CORS headers
 *
 * @param {number} statusCode - HTTP status code
 * @param {Object} body - Response body
 * @param {Object} additionalHeaders - Additional headers (optional)
 */
function createResponse(statusCode, body, additionalHeaders = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...additionalHeaders
    },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  };
}

/**
 * Create error response
 * SECURITY: Returns response WITHOUT CORS headers - let middleware handle CORS
 *
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 * @param {Error} error - Error object (optional)
 */
function createErrorResponse(statusCode, message, error = null) {
  const body = {
    error: true,
    message,
    timestamp: new Date().toISOString()
  };

  // Include error details in non-production environments
  if (!isProductionEnvironment() && error) {
    body.debug = {
      stack: error.stack,
      details: error.message
    };
  }

  return createResponse(statusCode, body);
}

/**
 * Get company and user info from authentication context
 * Supports both Clerk and Cognito authentication
 */
function getCompanyUserFromEvent(event) {
  // Check if Clerk authentication is enabled (priority over Cognito)
  const clerkEnabled = process.env.CLERK_AUTH_ENABLED === 'true';
  const cognitoEnabled = process.env.COGNITO_AUTH_ENABLED === 'true';

  // CLERK AUTHENTICATION
  if (clerkEnabled) {
    // Extract from Clerk custom authorizer context
    if (event.requestContext?.authorizer) {
      const authorizer = event.requestContext.authorizer;

      const companyId = authorizer.companyId;
      const userId = authorizer.userId;
      const userEmail = authorizer.userEmail || authorizer.email;
      const userRole = authorizer.userRole || authorizer.role || USER_ROLES.ADMIN;

      if (!userId || !companyId) {
        logger.error('Clerk authorizer missing required fields', { companyId: !!companyId, userId: !!userId });
        throw new Error('Invalid Clerk authentication - missing company or user information');
      }

      return {
        companyId,
        userId,
        userRole,
        userEmail
      };
    }

    throw new Error('Clerk authentication enabled but no authorizer context found');
  }

  // COGNITO AUTHENTICATION
  if (cognitoEnabled) {
    // First try to get from API Gateway authorizer (if configured)
    if (event.requestContext?.authorizer?.claims) {
      const claims = event.requestContext.authorizer.claims;

      const userId = claims.sub;
      const userEmail = claims.email;
      const companyId = claims['custom:companyId'];
      const userRole = claims['custom:role'] || USER_ROLES.USER;

      if (!userId || !companyId) {
        throw new Error('Invalid authentication token - missing company or user information');
      }

      return {
        companyId,
        userId,
        userRole,
        userEmail
      };
    }

    // Fallback: manually parse JWT token from Authorization header
    const authHeader = event.headers?.Authorization || event.headers?.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new Error('Company authentication required - no valid token found');
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    try {
      // Parse JWT token (without verification for now - in production should verify)
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());

      const userId = payload.sub;
      const userEmail = payload.email;
      const companyId = payload['custom:companyId'];
      const userRole = payload['custom:role'] || USER_ROLES.USER;

      if (!userId || !companyId) {
        throw new Error('Invalid authentication token - missing company or user information');
      }

      return {
        companyId,
        userId,
        userRole,
        userEmail
      };
    } catch (parseError) {
      logger.error('Failed to parse Cognito JWT token', { error: parseError });
      throw new Error('Invalid authentication token format');
    }
  }

  // NO AUTHENTICATION ENABLED - Test/Development Mode
  // CRITICAL SECURITY CHECK: Never allow test mode in production
  if (isProductionEnvironment()) {
    // Log critical security event for CloudWatch monitoring
    logSecurityEvent(
      'AUTHENTICATION_BYPASS_ATTEMPT',
      'CRITICAL',
      'Test authentication mode attempted in production environment',
      {
        clerkEnabled,
        cognitoEnabled,
        nodeEnv: process.env.NODE_ENV,
        awsRegion: process.env.AWS_REGION,
        hasAuthHeader: !!(event.headers?.Authorization || event.headers?.authorization)
      }
    );

    // Block the request - NEVER grant access in production without authentication
    throw new Error('Authentication is required in production environment. Both Clerk and Cognito authentication are disabled.');
  }

  // Development/Test Environment Only - Allow test mode
  logger.warn('Test authentication mode active - DEVELOPMENT ONLY', {
    nodeEnv: process.env.NODE_ENV,
    awsRegion: process.env.AWS_REGION,
    isLocalDevelopment: process.env.IS_LOCAL_DEVELOPMENT
  });

  return {
    companyId: 'test-company-123',
    userId: 'test-user-123',
    userRole: USER_ROLES.ADMIN,
    userEmail: 'test@company.com'
  };
}

/**
 * Validate company data
 */
function validateCompany(company) {
  const required = ['name', 'adminEmail', 'adminName'];
  const missing = required.filter(field => !company[field]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required company fields: ${missing.join(', ')}`);
  }
  
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(company.adminEmail)) {
    throw new Error('Invalid admin email format');
  }
  
  return true;
}

/**
 * Validate invitation data
 */
function validateInvitation(invitation) {
  const required = ['email', 'role'];
  const missing = required.filter(field => !invitation[field]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required invitation fields: ${missing.join(', ')}`);
  }
  
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(invitation.email)) {
    throw new Error('Invalid email format');
  }
  
  // Validate role
  if (!Object.values(USER_ROLES).includes(invitation.role)) {
    throw new Error(`Invalid role. Must be one of: ${Object.values(USER_ROLES).join(', ')}`);
  }
  
  return true;
}

/**
 * Generate unique IDs for different entities
 */
function generateCompanyId() {
  return `comp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function generateInvitationId() {
  return `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function generateInvitationToken() {
  return crypto.randomBytes(32).toString('hex');
}

function generateExpenseId() {
  return `exp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function generateProjectId() {
  return `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function generateContractorId() {
  return `contr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function generateWorkId() {
  return `work_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get current timestamp in ISO format
 */
function getCurrentTimestamp() {
  return new Date().toISOString();
}

/**
 * Log debug information
 */
function debugLog(message, data = null) {
  logger.debug(message, data || {});
}

/**
 * Handle DynamoDB operations with error handling
 * Uses AWS SDK v3 command pattern for better performance and smaller bundle size
 */
async function dynamoOperation(operation, params) {

  try {
    let command;
    switch (operation.toLowerCase()) {
      case 'query':
        command = new QueryCommand(params);
        break;
      case 'get':
        command = new GetCommand(params);
        break;
      case 'put':
        command = new PutCommand(params);
        break;
      case 'update':
        command = new UpdateCommand(params);
        break;
      case 'delete':
        command = new DeleteCommand(params);
        break;
      case 'scan':
        command = new ScanCommand(params);
        break;
      case 'batchget':
        command = new BatchGetCommand(params);
        break;
      case 'batchwrite':
        command = new BatchWriteCommand(params);
        break;
      default:
        throw new Error(`Unsupported DynamoDB operation: ${operation}`);
    }

    const result = await dynamodb.send(command);
    return result;
  } catch (error) {
    throw error;
  }
}

/**
 * Validate user belongs to company and has required role
 */
async function validateCompanyUser(companyId, userId, requiredRole = null) {
  const params = {
    TableName: COMPANY_TABLE_NAMES.USERS,
    Key: { companyId, userId }
  };
  
  const result = await dynamoOperation('get', params);
  if (!result.Item) {
    throw new Error('User not found in company');
  }
  
  const user = result.Item;
  
  if (requiredRole && user.role !== requiredRole) {
    throw new Error(`Access denied. Required role: ${requiredRole}`);
  }
  
  return user;
}

/**
 * Check if invitation token is valid
 */
async function validateInvitationToken(token) {
  // Scan invitations table to find token (in production, consider using GSI)
  const params = {
    TableName: COMPANY_TABLE_NAMES.INVITATIONS,
    FilterExpression: '#token = :token AND #status = :status',
    ExpressionAttributeNames: {
      '#token': 'token',
      '#status': 'status'
    },
    ExpressionAttributeValues: {
      ':token': token,
      ':status': INVITATION_STATUS.PENDING
    }
  };
  
  const result = await dynamoOperation('scan', params);
  
  if (!result.Items || result.Items.length === 0) {
    throw new Error('Invalid or expired invitation token');
  }
  
  const invitation = result.Items[0];
  
  // Check if invitation is expired (7 days)
  const invitationDate = new Date(invitation.createdAt);
  const expiryDate = new Date(invitationDate.getTime() + (7 * 24 * 60 * 60 * 1000));
  
  if (new Date() > expiryDate) {
    // Mark as expired
    await dynamoOperation('update', {
      TableName: COMPANY_TABLE_NAMES.INVITATIONS,
      Key: { companyId: invitation.companyId, invitationId: invitation.invitationId },
      UpdateExpression: 'SET #status = :status',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': INVITATION_STATUS.EXPIRED }
    });
    
    throw new Error('Invitation token has expired');
  }
  
  return invitation;
}

/**
 * Create company with admin user
 */
async function createCompanyWithAdmin(companyData, adminData) {
  const companyId = generateCompanyId();
  const timestamp = getCurrentTimestamp();
  const now = new Date();
  const trialEndDate = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000)); // 30 days from now

  // Create company record with subscription fields
  const company = {
    companyId,
    name: companyData.name,
    description: companyData.description || '',
    industry: companyData.industry || '',
    adminUserId: adminData.userId,

    // Subscription fields
    subscriptionTier: 'trial',
    subscriptionStatus: 'trial',
    trialStartDate: timestamp,
    trialEndDate: trialEndDate.toISOString(),

    // Usage counters
    currentUsers: 1, // Admin user
    currentProjects: 0,
    currentMonthExpenses: 0,
    expenseCounterResetDate: timestamp,

    createdAt: timestamp,
    updatedAt: timestamp
  };
  
  // Create admin user record
  const adminUser = {
    companyId,
    userId: adminData.userId,
    email: adminData.email,
    name: adminData.name,
    role: USER_ROLES.ADMIN,
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp
  };
  
  // Create both records
  await Promise.all([
    dynamoOperation('put', {
      TableName: COMPANY_TABLE_NAMES.COMPANIES,
      Item: company,
      ConditionExpression: 'attribute_not_exists(companyId)'
    }),
    dynamoOperation('put', {
      TableName: COMPANY_TABLE_NAMES.USERS,
      Item: adminUser,
      ConditionExpression: 'attribute_not_exists(companyId)'
    })
  ]);
  
  return { company, adminUser };
}

/**
 * Get user permissions based on role
 */
function getUserPermissions(userRole) {
  return ROLE_PERMISSIONS[userRole] || [];
}

/**
 * Check if user has specific permission
 */
function hasPermission(userRole, permission) {
  const permissions = getUserPermissions(userRole);
  return permissions.includes(permission);
}

/**
 * Check if user can access resource (for own vs all permissions)
 */
function canAccessResource(userRole, permission, resourceCreatedBy, userId) {
  const permissions = getUserPermissions(userRole);
  
  // Check if user has the permission
  if (!permissions.includes(permission)) {
    return false;
  }
  
  // For "OWN" permissions, check if user created the resource
  if (permission.includes('_OWN_') && resourceCreatedBy !== userId) {
    return false;
  }
  
  return true;
}

/**
 * Filter data based on user permissions 
 */
function filterDataByPermissions(data, userRole, userId, dataType) {
  const permissions = getUserPermissions(userRole);
  
  // If user has VIEW_ALL_DATA permission, return all data
  if (permissions.includes(PERMISSIONS.VIEW_ALL_DATA)) {
    return data;
  }
  
  // Filter based on ownership for users without VIEW_ALL_DATA
  return data.filter(item => {
    if (item.createdBy === userId) {
      return true;
    }
    
    // Check if assigned to user
    if (item.assignedTo && Array.isArray(item.assignedTo) && item.assignedTo.includes(userId)) {
      return true;
    }
    
    return false;
  });
}

/**
 * Validate user has required permission for action
 */
async function requirePermission(companyId, userId, requiredPermission, resourceId = null) {
  // Get user from company
  const user = await validateCompanyUser(companyId, userId);
  
  // Check if user has the required permission
  if (!hasPermission(user.role, requiredPermission)) {
    throw new Error(`Access denied. Required permission: ${requiredPermission}`);
  }
  
  // For resource-specific permissions, check ownership if needed
  if (resourceId && requiredPermission.includes('_OWN_')) {
    // This would need to be implemented per resource type
    // For now, we'll assume the calling function handles this check
  }
  
  return user;
}

/**
 * Legacy function name compatibility
 */
function getCompanyContextFromEvent(event) {
  return getCompanyUserFromEvent(event);
}

/**
 * API Middleware for Permission Checking
 */

/**
 * Middleware wrapper to require specific permission for Lambda handler
 */
function withPermission(requiredPermission, handler) {
  // Wrap with CORS middleware first
  return withSecureCors(async (event, context) => {
    try {
      // Get user context from event
      const { companyId, userId, userRole } = getCompanyUserFromEvent(event);

      // Check if user has required permission
      if (!hasPermission(userRole, requiredPermission)) {
        return createErrorResponse(403, `Access denied. Required permission: ${requiredPermission}`);
      }

      // Add permission context to event for handler use
      event.permissionContext = {
        companyId,
        userId,
        userRole,
        permissions: getUserPermissions(userRole),
        hasPermission: (permission) => hasPermission(userRole, permission)
      };

      // Call the actual handler
      return await handler(event, context);

    } catch (error) {

      if (error.message.includes('Company authentication required')) {
        return createErrorResponse(401, 'Authentication required');
      }

      if (error.message.includes('missing company')) {
        return createErrorResponse(401, 'Invalid company context');
      }

      return createErrorResponse(403, 'Access denied');
    }
  });
}

/**
 * Middleware wrapper to require admin role
 */
function withAdminRole(handler) {
  return withPermission(PERMISSIONS.MANAGE_USERS, handler);
}

/**
 * Middleware wrapper for company-scoped operations (any authenticated user)
 */
function withCompanyAuth(handler) {
  // Wrap with CORS middleware first
  return withSecureCors(async (event, context) => {
    try {
      // Get user context from event
      const { companyId, userId, userRole } = getCompanyUserFromEvent(event);

      // Add auth context to event for handler use
      event.authContext = {
        companyId,
        userId,
        userRole,
        permissions: getUserPermissions(userRole),
        hasPermission: (permission) => hasPermission(userRole, permission)
      };

      // Call the actual handler
      return await handler(event, context);

    } catch (error) {

      if (error.message.includes('Company authentication required')) {
        return createErrorResponse(401, 'Authentication required');
      }

      if (error.message.includes('missing company')) {
        return createErrorResponse(401, 'Invalid company context');
      }

      return createErrorResponse(500, 'Authentication error');
    }
  });
}

/**
 * Check permission within Lambda handler (for manual permission checks)
 */
async function checkPermissionInHandler(event, requiredPermission, resourceId = null) {
  const { companyId, userId, userRole } = getCompanyUserFromEvent(event);
  
  if (!hasPermission(userRole, requiredPermission)) {
    throw new Error(`Access denied. Required permission: ${requiredPermission}`);
  }

  // For resource-specific permissions (edit own vs edit all)
  if (resourceId && requiredPermission.includes('_OWN_')) {
    // The calling function should verify ownership
    // This is a placeholder for ownership validation
    return { companyId, userId, userRole, requiresOwnershipCheck: true };
  }

  return { companyId, userId, userRole, requiresOwnershipCheck: false };
}

/**
 * Apply data filtering based on user permissions
 */
function applyDataFiltering(data, userRole, userId) {
  return filterDataByPermissions(data, userRole, userId);
}

module.exports = {
  dynamodb,
  // cognito removed - using Clerk for authentication
  COMPANY_TABLE_NAMES,
  SYSTEM_PROJECTS,
  SYSTEM_CONTRACTORS,
  USER_ROLES,
  INVITATION_STATUS,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  createResponse,
  createErrorResponse,
  getCompanyUserFromEvent,
  getCompanyContextFromEvent,  // Legacy compatibility
  validateCompany,
  validateInvitation,
  generateCompanyId,
  generateInvitationId,
  generateInvitationToken,
  generateExpenseId,
  generateProjectId,
  generateContractorId,
  generateWorkId,
  getCurrentTimestamp,
  debugLog,
  dynamoOperation,
  validateCompanyUser,
  validateInvitationToken,
  createCompanyWithAdmin,
  getUserPermissions,
  hasPermission,
  canAccessResource,
  filterDataByPermissions,
  requirePermission,
  // Middleware functions
  withPermission,
  withAdminRole,
  withCompanyAuth,
  checkPermissionInHandler,
  applyDataFiltering
};