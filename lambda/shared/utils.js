// lambda/shared/utils.js
// Shared utilities for Lambda functions

const AWS = require('aws-sdk');
const { mockDynamoDB } = require('./mock-db');

// Configure AWS SDK for local development
const isLocal = process.env.NODE_ENV === 'development' || process.env.IS_LOCAL === 'true';

const dynamoConfig = isLocal ? {
  region: 'localhost',
  endpoint: 'http://localhost:8001',
  accessKeyId: 'fakeMyKeyId',
  secretAccessKey: 'fakeSecretAccessKey'
} : {
  region: process.env.AWS_REGION || 'us-east-1'
};

// Use mock DB if no real DynamoDB is available, otherwise use AWS SDK
let dynamodb;
try {
  dynamodb = isLocal ? mockDynamoDB : new AWS.DynamoDB.DocumentClient(dynamoConfig);
  if (isLocal) {
    console.log('🎭 Using Mock Database for demonstration');
  }
} catch (error) {
  dynamodb = mockDynamoDB;
  console.log('🎭 Falling back to Mock Database');
}

// Table name - use local table for development
const TABLE_NAME = isLocal ? 
  'construction-expenses-local' : 
  process.env.TABLE_NAME || 'construction-expenses-production-table';

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
  
  if (error && isLocal) {
    body.debug = {
      stack: error.stack,
      details: error.message
    };
  }
  
  return createResponse(statusCode, body);
}

/**
 * Get user ID from event context
 */
function getUserIdFromEvent(event) {
  // In local development, use test user ID
  if (isLocal) {
    return 'test-user-123';
  }
  
  // In production, get from Cognito authorizer
  if (event.requestContext?.authorizer?.claims?.sub) {
    return event.requestContext.authorizer.claims.sub;
  }
  
  throw new Error('User ID not found in event context');
}

/**
 * Validate expense data
 */
function validateExpense(expense) {
  const required = ['project', 'contractor', 'invoiceNum', 'amount', 'paymentTerms', 'paymentMethod', 'date'];
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
 * Generate unique expense ID
 */
function generateExpenseId() {
  return `exp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get current timestamp in ISO format
 */
function getCurrentTimestamp() {
  return new Date().toISOString();
}

/**
 * Log debug information (only in local development)
 */
function debugLog(message, data = null) {
  if (isLocal) {
    console.log(`[DEBUG] ${message}`, data ? JSON.stringify(data, null, 2) : '');
  }
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

module.exports = {
  dynamodb,
  TABLE_NAME,
  isLocal,
  createResponse,
  createErrorResponse,
  getUserIdFromEvent,
  validateExpense,
  generateExpenseId,
  getCurrentTimestamp,
  debugLog,
  dynamoOperation
};