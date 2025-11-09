// lambda/addExpense.js
// Add a new expense with multi-table architecture

const {
  createResponse,
  createErrorResponse,
  getUserIdFromEvent,
  validateExpense,
  generateExpenseId,
  getCurrentTimestamp,
  dynamodb,
  isLocal,
  validateProjectExists,
  validateContractorExists,
  updateProjectSpentAmount,
  debugLog,
  TABLE_NAMES,
  dynamoOperation
} = require('./shared/multi-table-utils');

exports.handler = async (event) => {

  try {
    // Get user ID from event context or use default for single user app
    let userId;
    try {
      userId = getUserIdFromEvent(event);
    } catch (error) {
      // For single user app, use a default user ID
      userId = 'default-user';
    }

    // Parse request body
    let expenseData;
    try {
      expenseData = JSON.parse(event.body || '{}');
    } catch (parseError) {
      return createErrorResponse(400, 'Invalid JSON in request body');
    }


    // Validate expense data
    try {
      validateExpense(expenseData);
    } catch (validationError) {
      return createErrorResponse(400, `Validation error: ${validationError.message}`);
    }

    // Generate expense ID and timestamps
    const expenseId = generateExpenseId();
    const timestamp = getCurrentTimestamp();

    // Validate foreign key relationships
    try {
      await validateProjectExists(userId, expenseData.projectId);
      await validateContractorExists(userId, expenseData.contractorId);
    } catch (fkError) {
      return createErrorResponse(400, `Foreign key validation error: ${fkError.message}`);
    }

    // Create expense object with multi-table structure
    const expense = {
      userId,
      expenseId,
      projectId: expenseData.projectId.trim(),
      contractorId: expenseData.contractorId.trim(),
      invoiceNum: expenseData.invoiceNum.trim(),
      amount: parseFloat(expenseData.amount),
      paymentMethod: expenseData.paymentMethod.trim(),
      date: expenseData.date,
      description: expenseData.description ? expenseData.description.trim() : '',
      createdAt: timestamp,
      updatedAt: timestamp
    };

    // Add optional file attachments with size validation
    if (expenseData.receiptImage) {
      const imageData = expenseData.receiptImage.data;
      const imageSizeKB = Math.round(imageData.length * 0.75 / 1024); // Rough base64 to bytes conversion

      if (imageSizeKB > 300) { // Leave room for other data in 400KB limit
        return createErrorResponse(400, `Receipt image too large (${imageSizeKB}KB). Please use an image smaller than 300KB.`);
      }

      expense.receiptImage = {
        name: expenseData.receiptImage.name,
        data: imageData,
        type: expenseData.receiptImage.type,
        size: expenseData.receiptImage.size
      };
    }

    // Additional business logic validation
    if (expense.amount > 100000000) { // Increased limit to 100M for large construction projects
      return createErrorResponse(400, 'Amount exceeds maximum limit (100,000,000)');
    }

    // Check for duplicate invoice number using GSI
    const duplicateCheckParams = {
      TableName: TABLE_NAMES.EXPENSES,
      IndexName: 'invoice-index',
      KeyConditionExpression: 'userId = :userId AND invoiceNum = :invoiceNum',
      ExpressionAttributeValues: {
        ':userId': userId,
        ':invoiceNum': expense.invoiceNum
      }
    };

    try {
      const duplicateCheck = await dynamoOperation('query', duplicateCheckParams);
      if (duplicateCheck.Items && duplicateCheck.Items.length > 0) {
        return createErrorResponse(409, `Invoice number ${expense.invoiceNum} already exists`);
      }
    } catch (error) {
      // Continue but log the error
    }

    // Save to DynamoDB Expenses table
    const putParams = {
      TableName: TABLE_NAMES.EXPENSES,
      Item: expense,
      ConditionExpression: 'attribute_not_exists(expenseId)' // Prevent overwrites
    };

    await dynamoOperation('put', putParams);

    // Update project's SpentAmount
    try {
      await updateProjectSpentAmount(userId, expense.projectId, expense.amount);
    } catch (updateError) {
      // Don't fail the expense creation for this
    }


    return createResponse(201, {
      success: true,
      message: 'Expense added successfully',
      data: {
        expense,
        expenseId
      },
      timestamp
    });

  } catch (error) {

    if (error.code === 'ConditionalCheckFailedException') {
      return createErrorResponse(409, 'Expense with this ID already exists');
    }

    if (error.message.includes('User ID not found')) {
      return createErrorResponse(401, 'Unauthorized: Invalid user context');
    }

    return createErrorResponse(500, 'Failed to add expense', error);
  }
};