// lambda/shared/company-utils.js
// Company-scoped utilities for multi-tenant architecture

const AWS = require('aws-sdk');
const crypto = require('crypto');

// Always use real AWS DynamoDB for company operations
const dynamoConfig = {
  region: process.env.AWS_REGION || 'us-east-1'
};

const dynamodb = new AWS.DynamoDB.DocumentClient(dynamoConfig);
const cognito = new AWS.CognitoIdentityServiceProvider(dynamoConfig);

// Company-scoped table names
const COMPANY_TABLE_NAMES = {
  COMPANIES: 'construction-expenses-companies',
  USERS: 'construction-expenses-company-users', 
  INVITATIONS: 'construction-expenses-invitations',
  PROJECTS: 'construction-expenses-company-projects',
  CONTRACTORS: 'construction-expenses-company-contractors',
  EXPENSES: 'construction-expenses-company-expenses',
  WORKS: 'construction-expenses-company-works'
};

// User roles
const USER_ROLES = {
  ADMIN: 'admin',
  USER: 'user'
};

// Invitation status
const INVITATION_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  EXPIRED: 'expired'
};

/**
 * Create standardized API response
 */
function createResponse(statusCode, body, additionalHeaders = {}) {
  return {
    statusCode,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Content-Type': 'application/json',
      ...additionalHeaders
    },
    body: JSON.stringify(body)
  };
}

/**
 * Create error response
 */
function createErrorResponse(statusCode, message, error = null) {
  const body = {
    error: true,
    message,
    timestamp: new Date().toISOString()
  };
  
  return createResponse(statusCode, body);
}

/**
 * Get company and user info from Cognito JWT token
 */
function getCompanyUserFromEvent(event) {
  // Check if Cognito authentication is enabled
  const authEnabled = process.env.COGNITO_AUTH_ENABLED === 'true';
  
  if (!authEnabled) {
    // Test mode: use hardcoded test company and user
    console.log('Using test mode for company authentication');
    return {
      companyId: 'test-company-123',
      userId: 'test-user-123',
      userRole: USER_ROLES.ADMIN,
      userEmail: 'test@company.com'
    };
  }
  
  // Production mode: extract from Cognito JWT token
  console.log('Using Cognito company authentication');
  
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
    
    console.log(`Authenticated company user: ${userId} from company ${companyId} with role ${userRole}`);
    
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
    console.log('Parsed JWT payload:', payload);
    
    const userId = payload.sub;
    const userEmail = payload.email;
    const companyId = payload['custom:companyId'];
    const userRole = payload['custom:role'] || USER_ROLES.USER;
    
    if (!userId || !companyId) {
      throw new Error('Invalid authentication token - missing company or user information');
    }
    
    console.log(`Authenticated company user: ${userId} from company ${companyId} with role ${userRole}`);
    
    return {
      companyId,
      userId,
      userRole,
      userEmail
    };
  } catch (parseError) {
    console.error('Failed to parse JWT token:', parseError);
    throw new Error('Invalid authentication token format');
  }
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
  console.log(`[COMPANY DEBUG] ${message}`, data ? JSON.stringify(data, null, 2) : '');
}

/**
 * Handle DynamoDB operations with error handling
 */
async function dynamoOperation(operation, params) {
  debugLog(`DynamoDB ${operation}`, params);
  
  try {
    let result;
    switch (operation.toLowerCase()) {
      case 'query':
        result = await dynamodb.query(params).promise();
        break;
      case 'get':
        result = await dynamodb.get(params).promise();
        break;
      case 'put':
        result = await dynamodb.put(params).promise();
        break;
      case 'update':
        result = await dynamodb.update(params).promise();
        break;
      case 'delete':
        result = await dynamodb.delete(params).promise();
        break;
      case 'scan':
        result = await dynamodb.scan(params).promise();
        break;
      case 'batchget':
        result = await dynamodb.batchGet(params).promise();
        break;
      case 'batchwrite':
        result = await dynamodb.batchWrite(params).promise();
        break;
      default:
        throw new Error(`Unsupported DynamoDB operation: ${operation}`);
    }
    
    debugLog(`DynamoDB ${operation} result`, result);
    return result;
  } catch (error) {
    console.error(`DynamoDB ${operation} error:`, error);
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
  
  // Create company record
  const company = {
    companyId,
    name: companyData.name,
    description: companyData.description || '',
    industry: companyData.industry || '',
    adminUserId: adminData.userId,
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

module.exports = {
  dynamodb,
  cognito,
  COMPANY_TABLE_NAMES,
  USER_ROLES,
  INVITATION_STATUS,
  createResponse,
  createErrorResponse,
  getCompanyUserFromEvent,
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
  createCompanyWithAdmin
};