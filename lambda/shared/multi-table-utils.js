// lambda/shared/multi-table-utils.js
// Multi-table utilities for Lambda functions

const AWS = require('aws-sdk');

// Always use real AWS DynamoDB - no mock databases
const dynamoConfig = {
  region: process.env.AWS_REGION || 'us-east-1'
};

// Initialize DynamoDB client - always real AWS
const dynamodb = new AWS.DynamoDB.DocumentClient(dynamoConfig);

// Table names - always production tables
const TABLE_NAMES = {
  USERS: 'construction-expenses-multi-table-users',
  PROJECTS: 'construction-expenses-multi-table-projects',
  CONTRACTORS: 'construction-expenses-multi-table-contractors',
  EXPENSES: 'construction-expenses-multi-table-expenses',
  WORKS: 'construction-expenses-multi-table-works'
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
 * Supports both test mode and Cognito authentication
 */
function getUserIdFromEvent(event) {
  // Check if Cognito authentication is enabled via environment variable
  const authEnabled = process.env.COGNITO_AUTH_ENABLED === 'true';
  
  if (!authEnabled) {
    // Test mode: use hardcoded test user ID
    console.log('Using test mode authentication');
    return 'test-user-123';
  }
  
  // Production mode: extract user ID from Cognito JWT token
  console.log('Using Cognito authentication');
  
  if (event.requestContext?.authorizer?.claims?.sub) {
    const userId = event.requestContext.authorizer.claims.sub;
    const userEmail = event.requestContext.authorizer.claims.email;
    console.log(`Authenticated user: ${userId} (${userEmail})`);
    return userId;
  }
  
  // If no valid token found, throw authentication error
  console.error('No valid Cognito token found in event context');
  throw new Error('User ID not found in event context - authentication required');
}

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
  
  // Validate date format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(expense.date)) {
    throw new Error('Date must be in YYYY-MM-DD format');
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
  console.log(`[DEBUG] ${message}`, data ? JSON.stringify(data, null, 2) : '');
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