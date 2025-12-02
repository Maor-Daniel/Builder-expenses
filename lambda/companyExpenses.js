// lambda/companyExpenses.js
// Company-scoped expenses management Lambda function

const {
  createResponse,
  createErrorResponse,
  getCompanyUserFromEvent,
  generateExpenseId,
  getCurrentTimestamp,
  debugLog,
  dynamoOperation,
  COMPANY_TABLE_NAMES
} = require('./shared/company-utils');

const {
  checkExpenseLimit,
  incrementExpenseCounter,
  decrementExpenseCounter
} = require('./shared/limit-checker');

const { withSecureCors } = require('./shared/cors-config');

// Wrap handler with secure CORS middleware
exports.handler = withSecureCors(async (event, context) => {
  try {
    // Get company and user context from JWT token
    const { companyId, userId, userRole } = getCompanyUserFromEvent(event);

    switch (event.httpMethod) {
      case 'GET':
        return await getExpenses(companyId, userId);
      case 'POST':
        return await createExpense(event, companyId, userId);
      case 'PUT':
        return await updateExpense(event, companyId, userId);
      case 'DELETE':
        return await deleteExpense(event, companyId, userId);
      default:
        return createErrorResponse(405, `Method ${event.httpMethod} not allowed`);
    }
  } catch (error) {
    console.error('ERROR in companyExpenses handler:', {
      error: error.message,
      stack: error.stack,
      httpMethod: event.httpMethod,
      path: event.path
    });
    return createErrorResponse(500, 'Internal server error during expenses operation');
  }
});

// Get all expenses for the company
async function getExpenses(companyId, userId) {

  const params = {
    TableName: COMPANY_TABLE_NAMES.EXPENSES,
    KeyConditionExpression: 'companyId = :companyId',
    ExpressionAttributeValues: {
      ':companyId': companyId
    }
  };

  const result = await dynamoOperation('query', params);

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
  const cleanedExpenses = (result.Items || []).map(expense => {
    const cleaned = { ...expense };
    delete cleaned.contractorSignature;
    delete cleaned.paymentTerms;

    // Add names from lookup maps
    cleaned.projectName = projectsMap[expense.projectId] || '';
    cleaned.contractorName = contractorsMap[expense.contractorId] || '';
    cleaned.workName = worksMap[expense.workId] || '';

    return cleaned;
  });


  return createResponse(200, {
    success: true,
    expenses: cleanedExpenses,
    count: cleanedExpenses.length
  });
}

// Create a new expense
async function createExpense(event, companyId, userId) {
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

  // Increment expense counter for tier tracking
  await incrementExpenseCounter(companyId);

  // Clean deprecated fields before returning
  const cleaned = { ...expense };
  delete cleaned.contractorSignature;
  delete cleaned.paymentTerms;

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
async function updateExpense(event, companyId, userId) {
  const requestBody = JSON.parse(event.body || '{}');
  const expenseId = requestBody.expenseId;
  
  if (!expenseId) {
    return createErrorResponse(400, 'Missing expenseId');
  }


  // Build update expression dynamically
  const updateExpressions = [];
  const expressionAttributeNames = {};
  const expressionAttributeValues = {};
  
  const updateableFields = ['projectId', 'contractorId', 'invoiceNum', 'amount', 'paymentMethod', 'date', 'description', 'status'];
  
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

  return createResponse(200, {
    success: true,
    message: 'Expense updated successfully',
    expense: cleaned
  });
}

// Delete an expense
async function deleteExpense(event, companyId, userId) {
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

  return createResponse(200, {
    success: true,
    message: 'Expense deleted successfully',
    deletedExpense: cleaned
  });
}