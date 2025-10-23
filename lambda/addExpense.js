// lambda/addExpense.js
// Add a new expense

const {
  createResponse,
  createErrorResponse,
  getUserIdFromEvent,
  validateExpense,
  generateExpenseId,
  getCurrentTimestamp,
  debugLog,
  dynamoOperation,
  TABLE_NAME
} = require('./shared/utils');

exports.handler = async (event) => {
  debugLog('addExpense event received', event);

  try {
    // Get user ID from event context or use default for single user app
    let userId;
    try {
      userId = getUserIdFromEvent(event);
    } catch (error) {
      // For single user app, use a default user ID
      userId = 'default-user';
    }
    debugLog('User ID', userId);

    // Parse request body
    let expenseData;
    try {
      expenseData = JSON.parse(event.body || '{}');
    } catch (parseError) {
      return createErrorResponse(400, 'Invalid JSON in request body');
    }

    debugLog('Expense data received', expenseData);

    // Validate expense data
    try {
      validateExpense(expenseData);
    } catch (validationError) {
      return createErrorResponse(400, `Validation error: ${validationError.message}`);
    }

    // Generate expense ID and timestamps
    const expenseId = generateExpenseId();
    const timestamp = getCurrentTimestamp();

    // Create expense object
    const expense = {
      userId,
      expenseId,
      project: expenseData.project.trim(),
      contractor: expenseData.contractor.trim(),
      invoiceNum: expenseData.invoiceNum.trim(),
      amount: parseFloat(expenseData.amount),
      paymentTerms: expenseData.paymentTerms.trim(),
      paymentMethod: expenseData.paymentMethod.trim(),
      date: expenseData.date,
      description: expenseData.description ? expenseData.description.trim() : '',
      status: expenseData.status || 'pending',
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

    // Add contractor signature if provided
    if (expenseData.contractorSignature) {
      const signatureData = expenseData.contractorSignature.data;
      const signatureSizeKB = Math.round(signatureData.length * 0.75 / 1024); // Rough base64 to bytes conversion
      
      if (signatureSizeKB > 100) { // Signatures should be smaller
        return createErrorResponse(400, `Signature too large (${signatureSizeKB}KB). Please use a smaller signature.`);
      }
      
      expense.contractorSignature = {
        name: expenseData.contractorSignature.name,
        data: signatureData,
        type: expenseData.contractorSignature.type,
        size: expenseData.contractorSignature.size
      };
    }

    // Additional business logic validation
    if (expense.amount > 1000000) {
      return createErrorResponse(400, 'Amount exceeds maximum limit (1,000,000)');
    }

    // Check for duplicate invoice number using scan (since GSI doesn't exist)
    const duplicateCheckParams = {
      TableName: TABLE_NAME,
      FilterExpression: 'userId = :userId AND invoiceNum = :invoiceNum',
      ExpressionAttributeValues: {
        ':userId': userId,
        ':invoiceNum': expense.invoiceNum
      }
    };

    try {
      const duplicateCheck = await dynamoOperation('scan', duplicateCheckParams);
      if (duplicateCheck.Items && duplicateCheck.Items.length > 0) {
        return createErrorResponse(409, `Invoice number ${expense.invoiceNum} already exists`);
      }
    } catch (error) {
      debugLog('Duplicate check failed, continuing', error.message);
    }

    // Save to DynamoDB
    const putParams = {
      TableName: TABLE_NAME,
      Item: expense,
      ConditionExpression: 'attribute_not_exists(expenseId)' // Prevent overwrites
    };

    await dynamoOperation('put', putParams);

    debugLog('Expense saved successfully', { expenseId });

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
    console.error('Error in addExpense:', error);

    if (error.code === 'ConditionalCheckFailedException') {
      return createErrorResponse(409, 'Expense with this ID already exists');
    }

    if (error.message.includes('User ID not found')) {
      return createErrorResponse(401, 'Unauthorized: Invalid user context');
    }

    return createErrorResponse(500, 'Failed to add expense', error);
  }
};