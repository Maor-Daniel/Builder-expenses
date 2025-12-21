// lambda/shared/utils.js
// Shared utilities for Lambda functions

// AWS SDK v3 - modular imports for smaller bundle size
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  QueryCommand,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand
} = require('@aws-sdk/lib-dynamodb');

const { mockDynamoDB } = require('./mock-db');
const { createCorsResponse: secureCorsResponse, createCorsErrorResponse } = require('./cors-config');

// Configure AWS SDK for local development
const isLocal = process.env.NODE_ENV === 'development' || process.env.IS_LOCAL === 'true';

const dynamoConfig = isLocal ? {
  region: 'localhost',
  endpoint: 'http://localhost:8001',
  credentials: {
    accessKeyId: 'fakeMyKeyId',
    secretAccessKey: 'fakeSecretAccessKey'
  }
} : {
  region: process.env.AWS_REGION || 'us-east-1'
};

// Use mock DB if no real DynamoDB is available, otherwise use AWS SDK v3
let dynamodb;
try {
  if (isLocal) {
    dynamodb = mockDynamoDB;
  } else {
    const ddbClient = new DynamoDBClient(dynamoConfig);
    dynamodb = DynamoDBDocumentClient.from(ddbClient, {
      marshallOptions: {
        convertEmptyValues: false,
        removeUndefinedValues: true
      }
    });
  }
} catch (error) {
  dynamodb = mockDynamoDB;
}

// Table name - use local table for development
const TABLE_NAME = isLocal ? 
  'construction-expenses-local' : 
  process.env.TABLE_NAME || 'construction-expenses-production-table';

/**
 * Create standardized API response
 * SECURITY: Now uses secure CORS configuration instead of wildcard
 * @param {number} statusCode - HTTP status code
 * @param {Object} body - Response body
 * @param {Object} additionalHeaders - Additional headers (optional)
 * @param {string} origin - Request origin (optional, for CORS)
 */
function createResponse(statusCode, body, additionalHeaders = {}, origin = null) {
  // Use secure CORS response builder
  return secureCorsResponse(statusCode, body, origin, additionalHeaders);
}

/**
 * Create error response
 * SECURITY: Now uses secure CORS configuration
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 * @param {Error} error - Error object (optional)
 * @param {string} origin - Request origin (optional, for CORS)
 */
function createErrorResponse(statusCode, message, error = null, origin = null) {
  // Use secure CORS error response builder
  return createCorsErrorResponse(statusCode, message, origin, error);
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
  }
}

/**
 * Handle DynamoDB operations with error handling
 * Uses AWS SDK v3 command pattern for production, mock for local
 */
async function dynamoOperation(operation, params) {

  try {
    // For local/mock mode, use the mock interface
    if (isLocal && dynamodb === mockDynamoDB) {
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
      return result;
    }

    // Production mode: use SDK v3 command pattern
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
      default:
        throw new Error(`Unsupported DynamoDB operation: ${operation}`);
    }

    const result = await dynamodb.send(command);
    return result;
  } catch (error) {
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