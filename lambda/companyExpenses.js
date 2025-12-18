// lambda/companyExpenses.js
// Company-scoped expenses management Lambda function

const AWS = require('aws-sdk');
const {
  createResponse,
  createErrorResponse,
  getCompanyUserFromEvent,
  generateExpenseId,
  getCurrentTimestamp,
  debugLog,
  dynamoOperation,
  COMPANY_TABLE_NAMES,
  USER_ROLES,
  PERMISSIONS,
  hasPermission
} = require('./shared/company-utils');

// S3 client for generating pre-signed URLs
const s3 = new AWS.S3({ region: process.env.AWS_REGION || 'us-east-1' });
const RECEIPTS_BUCKET = process.env.RECEIPTS_BUCKET || 'construction-expenses-receipts-702358134603';
const RECEIPT_URL_EXPIRY = 3600; // 1 hour expiry for on-demand URLs
const { createLogger } = require('./shared/logger');
const logger = createLogger('companyExpenses');
const { createAuditLogger, RESOURCE_TYPES } = require('./shared/audit-logger');
const auditLog = createAuditLogger(RESOURCE_TYPES.EXPENSE);

const {
  checkExpenseLimit,
  decrementExpenseCounter
} = require('./shared/limit-checker');

const { withSecureCors } = require('./shared/cors-config');
const { validateAndSanitize, EXPENSE_SCHEMA, checkDangerousPatterns } = require('./shared/input-validator');

/**
 * Check if a receiptUrl is an S3 key (not a full URL)
 * S3 keys look like: "companyId/receipts/receipt-timestamp-random.jpg"
 * Full URLs start with "https://"
 */
function isS3Key(receiptUrl) {
  if (!receiptUrl || typeof receiptUrl !== 'string') return false;
  // S3 keys don't start with http/https
  return !receiptUrl.startsWith('http://') && !receiptUrl.startsWith('https://');
}

/**
 * Extract S3 key from an old pre-signed URL
 * URL format: https://bucket-name.s3.amazonaws.com/path/to/file.jpg?queryParams
 * @param {string} url - The pre-signed S3 URL
 * @returns {string|null} The S3 key or null if extraction fails
 */
function extractS3KeyFromUrl(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const urlObj = new URL(url);
    // The pathname starts with /, so remove the leading slash
    const s3Key = urlObj.pathname.substring(1);
    // Decode URI components in case of special characters
    return decodeURIComponent(s3Key);
  } catch (error) {
    logger.warn('Failed to extract S3 key from URL', { url, error: error.message });
    return null;
  }
}

/**
 * Check if URL is our S3 bucket URL (for regenerating expired pre-signed URLs)
 */
function isOurS3Url(url) {
  if (!url || typeof url !== 'string') return false;
  return url.includes('construction-expenses-receipts') && url.includes('.s3.amazonaws.com');
}

/**
 * Generate a fresh pre-signed URL for an S3 key
 * @param {string} s3Key - The S3 object key (path)
 * @returns {Promise<string>} Pre-signed URL
 */
async function generatePresignedUrl(s3Key) {
  const params = {
    Bucket: RECEIPTS_BUCKET,
    Key: s3Key,
    Expires: RECEIPT_URL_EXPIRY
  };
  return s3.getSignedUrlPromise('getObject', params);
}

/**
 * Process receipt URLs for expenses - generates fresh pre-signed URLs
 * Handles both:
 * 1. New S3 keys (path only, e.g., "companyId/receipts/receipt-xxx.jpg")
 * 2. Old pre-signed URLs (extract key and regenerate fresh URL)
 * @param {Array} expenses - Array of expense objects
 * @returns {Promise<Array>} Expenses with fresh receipt URLs
 */
async function processReceiptUrls(expenses) {
  const processedExpenses = await Promise.all(
    expenses.map(async (expense) => {
      if (!expense.receiptUrl) {
        return expense;
      }

      let s3Key = null;

      // Case 1: New format - S3 key stored directly
      if (isS3Key(expense.receiptUrl)) {
        s3Key = expense.receiptUrl;
      }
      // Case 2: Old format - extract S3 key from pre-signed URL
      else if (isOurS3Url(expense.receiptUrl)) {
        s3Key = extractS3KeyFromUrl(expense.receiptUrl);
      }

      // Generate fresh pre-signed URL if we have an S3 key
      if (s3Key) {
        try {
          expense.receiptUrl = await generatePresignedUrl(s3Key);
        } catch (error) {
          logger.warn('Failed to generate pre-signed URL for receipt', {
            s3Key,
            expenseId: expense.expenseId,
            error: error.message
          });
          // Keep original URL if generation fails
        }
      }

      return expense;
    })
  );
  return processedExpenses;
}

// Wrap handler with secure CORS middleware
exports.handler = withSecureCors(async (event, context) => {
  try {
    // Get company and user context from JWT token
    const { companyId, userId, userRole } = getCompanyUserFromEvent(event);

    switch (event.httpMethod) {
      case 'GET':
        // All authenticated users can view expenses (viewers included)
        return await getExpenses(companyId, userId, userRole, event);
      case 'POST':
        // Check CREATE permission (admin, manager, editor can create)
        if (!hasPermission(userRole, PERMISSIONS.CREATE_EXPENSES)) {
          return createErrorResponse(403, 'You do not have permission to create expenses. Contact an admin to upgrade your role.');
        }
        return await createExpense(event, companyId, userId, userRole);
      case 'PUT':
        // Check EDIT permission (will verify ownership inside for editors)
        if (!hasPermission(userRole, PERMISSIONS.EDIT_ALL_EXPENSES) &&
            !hasPermission(userRole, PERMISSIONS.EDIT_OWN_EXPENSES)) {
          return createErrorResponse(403, 'You do not have permission to edit expenses. Contact an admin to upgrade your role.');
        }
        return await updateExpense(event, companyId, userId, userRole);
      case 'DELETE':
        // Only admin and manager can delete
        if (!hasPermission(userRole, PERMISSIONS.DELETE_EXPENSES)) {
          return createErrorResponse(403, 'You do not have permission to delete expenses. Only admins and managers can delete.');
        }
        return await deleteExpense(event, companyId, userId, userRole);
      default:
        return createErrorResponse(405, `Method ${event.httpMethod} not allowed`);
    }
  } catch (error) {
    logger.error('ERROR in companyExpenses handler:', {
      error: error.message,
      stack: error.stack,
      httpMethod: event.httpMethod,
      path: event.path
    });
    return createErrorResponse(500, 'Internal server error during expenses operation');
  }
});

// Get all expenses for the company
async function getExpenses(companyId, userId, userRole, event) {
  const params = {
    TableName: COMPANY_TABLE_NAMES.EXPENSES,
    KeyConditionExpression: 'companyId = :companyId',
    ExpressionAttributeValues: {
      ':companyId': companyId
    }
  };

  const result = await dynamoOperation('query', params);

  // Filter data based on user permissions
  // Editors see only their own expenses; Viewers, Admins, Managers see all
  let filteredExpenses = result.Items || [];
  if (userRole === USER_ROLES.EDITOR) {
    filteredExpenses = filteredExpenses.filter(expense => expense.userId === userId);
  }

  // Fetch projects, contractors, and works to get names
  const [projectsResult, contractorsResult, worksResult] = await Promise.all([
    dynamoOperation('query', {
      TableName: COMPANY_TABLE_NAMES.PROJECTS,
      KeyConditionExpression: 'companyId = :companyId',
      ExpressionAttributeValues: { ':companyId': companyId }
    }),
    dynamoOperation('query', {
      TableName: COMPANY_TABLE_NAMES.CONTRACTORS,
      KeyConditionExpression: 'companyId = :companyId',
      ExpressionAttributeValues: { ':companyId': companyId }
    }),
    dynamoOperation('query', {
      TableName: COMPANY_TABLE_NAMES.WORKS,
      KeyConditionExpression: 'companyId = :companyId',
      ExpressionAttributeValues: { ':companyId': companyId }
    })
  ]);

  // Create lookup maps
  const projectsMap = {};
  (projectsResult.Items || []).forEach(p => {
    projectsMap[p.projectId] = p.name;
  });

  const contractorsMap = {};
  (contractorsResult.Items || []).forEach(c => {
    contractorsMap[c.contractorId] = c.name;
  });

  const worksMap = {};
  (worksResult.Items || []).forEach(w => {
    worksMap[w.workId] = w.name;
  });

  // Filter out deprecated fields and add names
  const cleanedExpenses = filteredExpenses.map(expense => {
    const cleaned = { ...expense };
    delete cleaned.contractorSignature;
    delete cleaned.paymentTerms;

    // Add names from lookup maps
    cleaned.projectName = projectsMap[expense.projectId] || '';
    cleaned.contractorName = contractorsMap[expense.contractorId] || '';
    cleaned.workName = worksMap[expense.workId] || '';

    return cleaned;
  });

  // Generate fresh pre-signed URLs for receipt S3 keys
  // This ensures receipt links never expire (URLs are generated on-demand)
  const expensesWithUrls = await processReceiptUrls(cleanedExpenses);

  // Audit log for READ operation
  auditLog.logRead({
    companyId,
    userId,
    userRole,
    count: expensesWithUrls.length,
    request: event
  });

  return createResponse(200, {
    success: true,
    expenses: expensesWithUrls,
    count: expensesWithUrls.length
  });
}

// Create a new expense
async function createExpense(event, companyId, userId, userRole) {
  // Check if company can create new expense (tier limit check)
  const limitCheck = await checkExpenseLimit(companyId);

  if (!limitCheck.allowed) {
    return createErrorResponse(403, limitCheck.message, {
      reason: limitCheck.reason,
      currentUsage: limitCheck.currentUsage,
      limit: limitCheck.limit,
      suggestedTier: limitCheck.suggestedTier,
      upgradeUrl: limitCheck.upgradeUrl
    });
  }

  const requestBody = JSON.parse(event.body || '{}');

  // Security: Check for dangerous patterns in string inputs
  // Skip URL fields (receiptUrl) as they contain valid special characters (& $ = etc.)
  const urlFields = ['receiptUrl'];
  for (const [key, value] of Object.entries(requestBody)) {
    if (typeof value === 'string' && !urlFields.includes(key)) {
      const patternCheck = checkDangerousPatterns(value);
      if (!patternCheck.safe) {
        logger.warn('Dangerous pattern detected in expense creation', { field: key, companyId, userId });
        return createErrorResponse(400, `Invalid characters detected in ${key}`);
      }
    }
  }

  // Validate receiptUrl if provided - accepts S3 keys OR full S3 URLs from our bucket
  if (requestBody.receiptUrl && typeof requestBody.receiptUrl === 'string') {
    // Check if it's a valid S3 key (new format): companyId/receipts/receipt-timestamp-random.ext
    const validS3KeyPattern = /^[a-zA-Z0-9_-]+\/receipts\/receipt-\d+-[a-z0-9]+\.(jpg|jpeg|png|gif|webp|pdf)$/i;
    // Check if it's a valid full S3 URL (old format for backward compatibility)
    const validS3UrlPatterns = [
      /^https:\/\/construction-expenses-receipts-\d+\.s3\.amazonaws\.com\//,
      /^https:\/\/construction-expenses-receipts-\d+\.s3\.[a-z0-9-]+\.amazonaws\.com\//
    ];
    const isValidS3Key = validS3KeyPattern.test(requestBody.receiptUrl);
    const isValidS3Url = validS3UrlPatterns.some(pattern => pattern.test(requestBody.receiptUrl));

    if (!isValidS3Key && !isValidS3Url) {
      logger.warn('Invalid receiptUrl pattern', { receiptUrl: requestBody.receiptUrl.substring(0, 100), companyId, userId });
      return createErrorResponse(400, 'Invalid receipt URL format');
    }
  }

  // Validate required fields early
  const required = ['projectId', 'contractorId', 'invoiceNum', 'amount', 'paymentMethod', 'date'];
  const missing = required.filter(field => !requestBody[field]);

  if (missing.length > 0) {
    return createErrorResponse(400, `Missing required fields: ${missing.join(', ')}`);
  }

  // FIX BUG #5: Validate amount early (before creating expense object)
  const parsedAmount = parseFloat(requestBody.amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return createErrorResponse(400, 'Amount must be a positive number');
  }
  if (parsedAmount > 100000000) {
    return createErrorResponse(400, 'Amount exceeds maximum limit (100,000,000)');
  }

  // FIX BUG #4: Validate payment method against allowed values
  const VALID_PAYMENT_METHODS = ['העברה בנקאית', 'צ\'ק', 'מזומן', 'כרטיס אשראי'];
  if (!VALID_PAYMENT_METHODS.includes(requestBody.paymentMethod.trim())) {
    return createErrorResponse(400, `Invalid payment method. Must be one of: ${VALID_PAYMENT_METHODS.join(', ')}`);
  }

  // FIX BUG #1: Validate date format and validity
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(requestBody.date)) {
    return createErrorResponse(400, 'Date must be in YYYY-MM-DD format');
  }
  const dateObj = new Date(requestBody.date);
  if (isNaN(dateObj.getTime())) {
    return createErrorResponse(400, 'Invalid date value');
  }

  // FIX BUG #2: Validate foreign key relationships
  try {
    await Promise.all([
      validateProjectExists(companyId, requestBody.projectId),
      validateContractorExists(companyId, requestBody.contractorId)
    ]);
  } catch (fkError) {
    return createErrorResponse(400, `Foreign key validation error: ${fkError.message}`);
  }

  // Efficient duplicate invoice check using GSI (O(1) instead of O(n))
  // Uses invoiceNum-index GSI for fast lookups by companyId + invoiceNum
  const duplicateCheckParams = {
    TableName: COMPANY_TABLE_NAMES.EXPENSES,
    IndexName: 'invoiceNum-index',
    KeyConditionExpression: 'companyId = :companyId AND invoiceNum = :invoiceNum',
    ExpressionAttributeValues: {
      ':companyId': companyId,
      ':invoiceNum': requestBody.invoiceNum
    },
    Limit: 1  // We only need to know if one exists
  };

  const duplicateCheck = await dynamoOperation('query', duplicateCheckParams);
  if (duplicateCheck.Items && duplicateCheck.Items.length > 0) {
    return createErrorResponse(409, `Invoice number ${requestBody.invoiceNum} already exists`);
  }

  const expense = {
    companyId,
    expenseId: generateExpenseId(),
    userId, // User who created the expense
    workId: requestBody.workId || '',
    projectId: requestBody.projectId,
    contractorId: requestBody.contractorId,
    invoiceNum: requestBody.invoiceNum,
    amount: parsedAmount,
    paymentMethod: requestBody.paymentMethod.trim(),
    date: requestBody.date,
    description: requestBody.description || '',
    receiptUrl: requestBody.receiptUrl || '', // URL to uploaded receipt image
    status: requestBody.status || 'pending',
    createdAt: getCurrentTimestamp(),
    updatedAt: getCurrentTimestamp()
  };

  const params = {
    TableName: COMPANY_TABLE_NAMES.EXPENSES,
    Item: expense,
    ConditionExpression: 'attribute_not_exists(expenseId)'
  };

  await dynamoOperation('put', params);

  // Note: Expense counter already incremented in checkExpenseLimit() for atomic limit checking

  // Clean deprecated fields before returning
  const cleaned = { ...expense };
  delete cleaned.contractorSignature;
  delete cleaned.paymentTerms;

  // Audit log for CREATE operation
  auditLog.logCreate({
    resourceId: expense.expenseId,
    companyId,
    userId,
    userRole,
    data: cleaned,
    request: event
  });

  return createResponse(201, {
    success: true,
    message: 'Expense created successfully',
    expense: cleaned
  });
}

// Helper functions for foreign key validation
async function validateProjectExists(companyId, projectId) {
  const params = {
    TableName: COMPANY_TABLE_NAMES.PROJECTS,
    Key: { companyId, projectId }
  };

  const result = await dynamoOperation('get', params);
  if (!result.Item) {
    throw new Error(`Project with ID ${projectId} not found`);
  }

  return result.Item;
}

async function validateContractorExists(companyId, contractorId) {
  const params = {
    TableName: COMPANY_TABLE_NAMES.CONTRACTORS,
    Key: { companyId, contractorId }
  };

  const result = await dynamoOperation('get', params);
  if (!result.Item) {
    throw new Error(`Contractor with ID ${contractorId} not found`);
  }

  return result.Item;
}

// Update an existing expense
async function updateExpense(event, companyId, userId, userRole) {
  const requestBody = JSON.parse(event.body || '{}');
  const expenseId = requestBody.expenseId;

  if (!expenseId) {
    return createErrorResponse(400, 'Missing expenseId');
  }

  // Always fetch existing expense for audit logging (before state)
  const existingExpenseResult = await dynamoOperation('get', {
    TableName: COMPANY_TABLE_NAMES.EXPENSES,
    Key: { companyId, expenseId }
  });

  if (!existingExpenseResult.Item) {
    return createErrorResponse(404, 'Expense not found');
  }

  const existingExpense = existingExpenseResult.Item;

  // For users with only EDIT_OWN permission, verify they own this expense
  if (!hasPermission(userRole, PERMISSIONS.EDIT_ALL_EXPENSES)) {
    if (existingExpense.userId !== userId) {
      return createErrorResponse(403, 'You can only edit expenses you created');
    }
  }

  // Build update expression dynamically
  const updateExpressions = [];
  const expressionAttributeNames = {};
  const expressionAttributeValues = {};
  
  const updateableFields = ['projectId', 'contractorId', 'invoiceNum', 'amount', 'paymentMethod', 'date', 'description', 'status', 'receiptUrl', 'workId'];

  // Validate receiptUrl if provided - accepts S3 keys OR full S3 URLs from our bucket
  if (requestBody.receiptUrl && typeof requestBody.receiptUrl === 'string') {
    // Check if it's a valid S3 key (new format): companyId/receipts/receipt-timestamp-random.ext
    const validS3KeyPattern = /^[a-zA-Z0-9_-]+\/receipts\/receipt-\d+-[a-z0-9]+\.(jpg|jpeg|png|gif|webp|pdf)$/i;
    // Check if it's a valid full S3 URL (old format for backward compatibility)
    const validS3UrlPatterns = [
      /^https:\/\/construction-expenses-receipts-\d+\.s3\.amazonaws\.com\//,
      /^https:\/\/construction-expenses-receipts-\d+\.s3\.[a-z0-9-]+\.amazonaws\.com\//
    ];
    const isValidS3Key = validS3KeyPattern.test(requestBody.receiptUrl);
    const isValidS3Url = validS3UrlPatterns.some(pattern => pattern.test(requestBody.receiptUrl));

    if (!isValidS3Key && !isValidS3Url) {
      logger.warn('Invalid receiptUrl pattern in update', { receiptUrl: requestBody.receiptUrl.substring(0, 100), companyId, userId });
      return createErrorResponse(400, 'Invalid receipt URL format');
    }
  }

  updateableFields.forEach(field => {
    if (requestBody[field] !== undefined) {
      updateExpressions.push(`#${field} = :${field}`);
      expressionAttributeNames[`#${field}`] = field;
      expressionAttributeValues[`:${field}`] = field === 'amount' ? parseFloat(requestBody[field]) : requestBody[field];
    }
  });
  
  if (updateExpressions.length === 0) {
    return createErrorResponse(400, 'No fields to update');
  }
  
  // Always update the updatedAt field
  updateExpressions.push('#updatedAt = :updatedAt');
  expressionAttributeNames['#updatedAt'] = 'updatedAt';
  expressionAttributeValues[':updatedAt'] = getCurrentTimestamp();

  const params = {
    TableName: COMPANY_TABLE_NAMES.EXPENSES,
    Key: { companyId, expenseId },
    UpdateExpression: `SET ${updateExpressions.join(', ')}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    ConditionExpression: 'attribute_exists(expenseId)',
    ReturnValues: 'ALL_NEW'
  };

  const result = await dynamoOperation('update', params);

  // Clean deprecated fields before returning
  const cleaned = { ...result.Attributes };
  delete cleaned.contractorSignature;
  delete cleaned.paymentTerms;

  // Clean before state for audit log
  const beforeCleaned = { ...existingExpense };
  delete beforeCleaned.contractorSignature;
  delete beforeCleaned.paymentTerms;

  // Audit log for UPDATE operation with before/after
  auditLog.logUpdate({
    resourceId: expenseId,
    companyId,
    userId,
    userRole,
    before: beforeCleaned,
    after: cleaned,
    request: event
  });

  return createResponse(200, {
    success: true,
    message: 'Expense updated successfully',
    expense: cleaned
  });
}

// Delete an expense
async function deleteExpense(event, companyId, userId, userRole) {
  const expenseId = event.pathParameters?.expenseId || event.queryStringParameters?.expenseId;
  
  if (!expenseId) {
    return createErrorResponse(400, 'Missing expenseId');
  }


  const params = {
    TableName: COMPANY_TABLE_NAMES.EXPENSES,
    Key: { companyId, expenseId },
    ConditionExpression: 'attribute_exists(expenseId)',
    ReturnValues: 'ALL_OLD'
  };

  const result = await dynamoOperation('delete', params);

  // Decrement expense counter for tier tracking
  await decrementExpenseCounter(companyId);

  // Clean deprecated fields before returning
  const cleaned = { ...result.Attributes };
  delete cleaned.contractorSignature;
  delete cleaned.paymentTerms;

  // Audit log for DELETE operation
  auditLog.logDelete({
    resourceId: expenseId,
    companyId,
    userId,
    userRole,
    deletedData: cleaned,
    request: event
  });

  return createResponse(200, {
    success: true,
    message: 'Expense deleted successfully',
    deletedExpense: cleaned
  });
}