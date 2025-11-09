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

exports.handler = async (event) => {
  debugLog('Company expenses request received', {
    httpMethod: event.httpMethod,
    body: event.body ? 'Present' : 'None'
  });

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return createResponse(200, { message: 'CORS preflight' });
  }

  try {
    // Get company and user context from JWT token
    const { companyId, userId, userRole } = getCompanyUserFromEvent(event);
    debugLog('Company context', { companyId, userId, userRole });

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
    console.error('Company expenses error:', error);
    return createErrorResponse(500, 'Internal server error during expenses operation');
  }
};

// Get all expenses for the company
async function getExpenses(companyId, userId) {
  debugLog('Getting expenses for company', { companyId });

  const params = {
    TableName: COMPANY_TABLE_NAMES.EXPENSES,
    KeyConditionExpression: 'companyId = :companyId',
    ExpressionAttributeValues: {
      ':companyId': companyId
    }
  };

  const result = await dynamoOperation('query', params);

  // Filter out deprecated fields (signature and paymentTerms)
  const cleanedExpenses = (result.Items || []).map(expense => {
    const cleaned = { ...expense };
    delete cleaned.contractorSignature;
    delete cleaned.paymentTerms;
    return cleaned;
  });

  debugLog('Found expenses', { count: cleanedExpenses.length });

  return createResponse(200, {
    success: true,
    expenses: cleanedExpenses,
    count: cleanedExpenses.length
  });
}

// Create a new expense
async function createExpense(event, companyId, userId) {
  const requestBody = JSON.parse(event.body || '{}');
  debugLog('Creating expense', requestBody);

  const expense = {
    companyId,
    expenseId: generateExpenseId(),
    userId, // User who created the expense
    projectId: requestBody.projectId,
    contractorId: requestBody.contractorId,
    invoiceNum: requestBody.invoiceNum,
    amount: parseFloat(requestBody.amount),
    paymentMethod: requestBody.paymentMethod,
    date: requestBody.date,
    description: requestBody.description || '',
    status: requestBody.status || 'pending',
    createdAt: getCurrentTimestamp(),
    updatedAt: getCurrentTimestamp()
  };

  // Validate required fields
  const required = ['projectId', 'contractorId', 'invoiceNum', 'amount', 'paymentMethod', 'date'];
  const missing = required.filter(field => !expense[field]);
  
  if (missing.length > 0) {
    return createErrorResponse(400, `Missing required fields: ${missing.join(', ')}`);
  }

  // Validate amount
  if (isNaN(expense.amount) || expense.amount <= 0) {
    return createErrorResponse(400, 'Amount must be a positive number');
  }

  const params = {
    TableName: COMPANY_TABLE_NAMES.EXPENSES,
    Item: expense,
    ConditionExpression: 'attribute_not_exists(expenseId)'
  };

  await dynamoOperation('put', params);

  debugLog('Expense created successfully', { expenseId: expense.expenseId });

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

// Update an existing expense
async function updateExpense(event, companyId, userId) {
  const requestBody = JSON.parse(event.body || '{}');
  const expenseId = requestBody.expenseId;
  
  if (!expenseId) {
    return createErrorResponse(400, 'Missing expenseId');
  }

  debugLog('Updating expense', { expenseId, companyId });

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

  debugLog('Expense updated successfully', { expenseId });

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

  debugLog('Deleting expense', { expenseId, companyId });

  const params = {
    TableName: COMPANY_TABLE_NAMES.EXPENSES,
    Key: { companyId, expenseId },
    ConditionExpression: 'attribute_exists(expenseId)',
    ReturnValues: 'ALL_OLD'
  };

  const result = await dynamoOperation('delete', params);

  debugLog('Expense deleted successfully', { expenseId });

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