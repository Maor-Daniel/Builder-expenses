// lambda/shared/multi-table-utils.js
// Multi-table utilities for Lambda functions

const AWS = require('aws-sdk');

// Always use real AWS DynamoDB - no mock databases
const dynamoConfig = {
  region: process.env.AWS_REGION || 'us-east-1'
};

// Initialize DynamoDB client - always real AWS
const dynamodb = new AWS.DynamoDB.DocumentClient(dynamoConfig);

// Table names - production company-scoped tables
const TABLE_NAMES = {
  USERS: 'construction-expenses-company-users',
  PROJECTS: 'construction-expenses-company-projects',
  CONTRACTORS: 'construction-expenses-company-contractors',
  EXPENSES: 'construction-expenses-company-expenses',
  WORKS: 'construction-expenses-company-works'
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
  
  // No debug info in production
  
  return createResponse(statusCode, body);
}

/**
 * Get user ID from event context
 * Supports test mode, Cognito authentication, and Clerk authentication
 */
function getUserIdFromEvent(event) {
  // Check if authentication is disabled (test/dev mode)
  const authEnabled = process.env.COGNITO_AUTH_ENABLED === 'true' || process.env.CLERK_AUTH_ENABLED === 'true';

  if (!authEnabled) {
    // Test mode: use hardcoded test user ID
    return 'test-user-123';
  }

  // Production mode: extract user ID from authorizer context
  const authorizer = event.requestContext?.authorizer;

  // Try Clerk Lambda Authorizer context first (set by clerk-authorizer.js)
  if (authorizer?.userId) {
    return authorizer.userId;
  }

  // Fall back to Cognito User Pool Authorizer context
  if (authorizer?.claims?.sub) {
    return authorizer.claims.sub;
  }

  // If no valid token found, throw authentication error
  throw new Error('User ID not found in event context - authentication required');
}

/**
 * Get full user context from event (including companyId, role, etc.)
 * Supports both Cognito and Clerk authentication
 */
function getUserContextFromEvent(event) {
  const authEnabled = process.env.COGNITO_AUTH_ENABLED === 'true' || process.env.CLERK_AUTH_ENABLED === 'true';

  if (!authEnabled) {
    // Test mode
    return {
      userId: 'test-user-123',
      companyId: 'test-company-123',
      email: 'test@example.com',
      role: 'ADMIN'
    };
  }

  const authorizer = event.requestContext?.authorizer;

  // Clerk Lambda Authorizer context
  if (authorizer?.userId) {
    return {
      userId: authorizer.userId,
      companyId: authorizer.companyId || authorizer.userId, // FIX: userId already has 'user_' prefix
      email: authorizer.email || '',
      userName: authorizer.userName || '',
      role: authorizer.role || 'VIEWER',
      orgId: authorizer.orgId || '',
      orgRole: authorizer.orgRole || '',
      plan: authorizer.plan || 'free'
    };
  }

  // Cognito User Pool Authorizer context
  if (authorizer?.claims) {
    return {
      userId: authorizer.claims.sub,
      companyId: authorizer.claims['custom:companyId'] || `user_${authorizer.claims.sub}`,
      email: authorizer.claims.email || '',
      userName: authorizer.claims.name || '',
      role: authorizer.claims['custom:role'] || 'VIEWER'
    };
  }

  throw new Error('User context not found in event - authentication required');
}

/**
 * Valid payment methods
 */
const VALID_PAYMENT_METHODS = [
  'העברה בנקאית',  // Bank transfer
  'צ\'ק',           // Check
  'מזומן',          // Cash
  'כרטיס אשראי'     // Credit card
];

/**
 * Validate expense data (updated for multi-table - removed paymentTerms)
 */
function validateExpense(expense) {
  const required = ['projectId', 'contractorId', 'invoiceNum', 'amount', 'paymentMethod', 'date'];
  const missing = required.filter(field => !expense[field]);

  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }

  // Validate amount is a positive number
  const amount = parseFloat(expense.amount);
  if (isNaN(amount) || amount <= 0) {
    throw new Error('Amount must be a positive number');
  }

  // FIX BUG #4: Validate payment method against allowed values
  if (!VALID_PAYMENT_METHODS.includes(expense.paymentMethod.trim())) {
    throw new Error(`Invalid payment method. Must be one of: ${VALID_PAYMENT_METHODS.join(', ')}`);
  }

  // FIX BUG #1: Strengthen date format validation
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(expense.date)) {
    throw new Error('Date must be in YYYY-MM-DD format');
  }

  // Additional date validation: ensure it's a valid date
  const dateObj = new Date(expense.date);
  if (isNaN(dateObj.getTime())) {
    throw new Error('Invalid date value');
  }

  return true;
}

/**
 * Validate project data
 */
function validateProject(project) {
  const required = ['name', 'startDate'];
  const missing = required.filter(field => !project[field]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }
  
  // Validate date format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(project.startDate)) {
    throw new Error('Start date must be in YYYY-MM-DD format');
  }
  
  // Validate SpentAmount is a number if provided
  if (project.SpentAmount !== undefined) {
    const amount = parseFloat(project.SpentAmount);
    if (isNaN(amount) || amount < 0) {
      throw new Error('SpentAmount must be a non-negative number');
    }
  }
  
  return true;
}

/**
 * Validate contractor data
 */
function validateContractor(contractor) {
  const required = ['name'];
  const missing = required.filter(field => !contractor[field]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }
  
  return true;
}

/**
 * Validate work data (updated fields)
 */
function validateWork(work) {
  const required = ['projectId', 'contractorId', 'WorkName', 'TotalWorkCost'];
  const missing = required.filter(field => !work[field]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }
  
  // Validate TotalWorkCost is a positive number
  const cost = parseFloat(work.TotalWorkCost);
  if (isNaN(cost) || cost <= 0) {
    throw new Error('TotalWorkCost must be a positive number');
  }
  
  return true;
}

/**
 * Generate unique IDs for different entities
 */
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
}

/**
 * Handle DynamoDB operations with error handling
 */
async function dynamoOperation(operation, params) {
  
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
    
    return result;
  } catch (error) {
    throw error;
  }
}

/**
 * Validate foreign key relationships
 */
async function validateProjectExists(userId, projectId) {
  const params = {
    TableName: TABLE_NAMES.PROJECTS,
    Key: { userId, projectId }
  };
  
  const result = await dynamoOperation('get', params);
  if (!result.Item) {
    throw new Error(`Project with ID ${projectId} not found`);
  }
  
  return result.Item;
}

async function validateContractorExists(userId, contractorId) {
  const params = {
    TableName: TABLE_NAMES.CONTRACTORS,
    Key: { userId, contractorId }
  };
  
  const result = await dynamoOperation('get', params);
  if (!result.Item) {
    throw new Error(`Contractor with ID ${contractorId} not found`);
  }
  
  return result.Item;
}

/**
 * Update project spent amount (helper for expense operations)
 */
async function updateProjectSpentAmount(userId, projectId, amountChange) {
  const params = {
    TableName: TABLE_NAMES.PROJECTS,
    Key: { userId, projectId },
    UpdateExpression: 'ADD SpentAmount :amount SET updatedAt = :timestamp',
    ExpressionAttributeValues: {
      ':amount': amountChange,
      ':timestamp': getCurrentTimestamp()
    },
    ReturnValues: 'ALL_NEW'
  };
  
  return await dynamoOperation('update', params);
}

module.exports = {
  dynamodb,
  TABLE_NAMES,
  createResponse,
  createErrorResponse,
  getUserIdFromEvent,
  getUserContextFromEvent,
  validateExpense,
  validateProject,
  validateContractor,
  validateWork,
  generateExpenseId,
  generateProjectId,
  generateContractorId,
  generateWorkId,
  getCurrentTimestamp,
  debugLog,
  dynamoOperation,
  validateProjectExists,
  validateContractorExists,
  updateProjectSpentAmount
};