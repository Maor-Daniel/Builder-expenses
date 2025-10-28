// lambda/updateExpense.js
// Update an existing expense

const {
  createResponse,
  createErrorResponse,
  getUserIdFromEvent,
  validateExpense,
  getCurrentTimestamp,
  debugLog,
  dynamoOperation,
  TABLE_NAME
} = require('./shared/utils');

exports.handler = async (event) => {
  debugLog('updateExpense event received', event);

  try {
    // Get user ID from event context
    let userId;
    try {
      userId = getUserIdFromEvent(event);
    } catch (error) {
      // For single user app, use a default user ID
      userId = 'default-user';
    }
    debugLog('User ID', userId);

    // Get expense ID from path parameters
    const expenseId = event.pathParameters?.expenseId;
    if (!expenseId) {
      return createErrorResponse(400, 'Missing expense ID in path parameters');
    }

    debugLog('Expense ID to update', expenseId);

    // Parse request body
    let updateData;
    try {
      updateData = JSON.parse(event.body || '{}');
    } catch (parseError) {
      return createErrorResponse(400, 'Invalid JSON in request body');
    }

    debugLog('Update data received', updateData);

    // Validate update data
    try {
      validateExpense(updateData);
    } catch (validationError) {
      return createErrorResponse(400, `Validation error: ${validationError.message}`);
    }

    // Check if expense exists and belongs to user
    const getParams = {
      TableName: TABLE_NAME,
      Key: {
        userId,
        expenseId
      }
    };

    let existingExpense;
    try {
      const getResult = await dynamoOperation('get', getParams);
      existingExpense = getResult.Item;
      
      if (!existingExpense) {
        return createErrorResponse(404, 'Expense not found');
      }
    } catch (error) {
      console.error('Error checking existing expense:', error);
      return createErrorResponse(500, 'Failed to verify expense ownership');
    }

    debugLog('Existing expense found', { expenseId, project: existingExpense.project });

    // Build update expression
    const timestamp = getCurrentTimestamp();
    const updateFields = {
      project: updateData.project.trim(),
      contractor: updateData.contractor.trim(),
      invoiceNum: updateData.invoiceNum.trim(),
      amount: parseFloat(updateData.amount),
      paymentTerms: updateData.paymentTerms.trim(),
      paymentMethod: updateData.paymentMethod.trim(),
      date: updateData.date,
      description: updateData.description ? updateData.description.trim() : '',
      status: updateData.status || existingExpense.status || 'pending',
      updatedAt: timestamp
    };

    // Additional business logic validation
    if (updateFields.amount > 100000000) { // Increased limit to 100M for large construction projects
      return createErrorResponse(400, 'Amount exceeds maximum limit (100,000,000)');
    }

    // Check for duplicate invoice number if invoice number is being changed
    if (updateFields.invoiceNum !== existingExpense.invoiceNum) {
      const duplicateCheckParams = {
        TableName: TABLE_NAME,
        KeyConditionExpression: 'userId = :userId',
        FilterExpression: 'invoiceNum = :invoiceNum AND expenseId <> :expenseId',
        ExpressionAttributeValues: {
          ':userId': userId,
          ':invoiceNum': updateFields.invoiceNum,
          ':expenseId': expenseId
        }
      };

      try {
        const duplicateCheck = await dynamoOperation('query', duplicateCheckParams);
        if (duplicateCheck.Items && duplicateCheck.Items.length > 0) {
          return createErrorResponse(409, `Invoice number ${updateFields.invoiceNum} already exists`);
        }
      } catch (error) {
        // Continue without duplicate check if GSI doesn't exist
        debugLog('Duplicate check skipped', error.message);
      }
    }

    // Build update expression dynamically
    const updateExpressionParts = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};

    Object.keys(updateFields).forEach((key, index) => {
      const nameKey = `#field${index}`;
      const valueKey = `:val${index}`;
      
      updateExpressionParts.push(`${nameKey} = ${valueKey}`);
      expressionAttributeNames[nameKey] = key;
      expressionAttributeValues[valueKey] = updateFields[key];
    });

    const updateParams = {
      TableName: TABLE_NAME,
      Key: {
        userId,
        expenseId
      },
      UpdateExpression: `SET ${updateExpressionParts.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ConditionExpression: 'attribute_exists(expenseId)', // Ensure expense exists
      ReturnValues: 'ALL_NEW'
    };

    const updateResult = await dynamoOperation('update', updateParams);
    const updatedExpense = updateResult.Attributes;

    debugLog('Expense updated successfully', { expenseId });

    return createResponse(200, {
      success: true,
      message: 'Expense updated successfully',
      data: {
        expense: updatedExpense,
        expenseId,
        changes: Object.keys(updateFields)
      },
      timestamp
    });

  } catch (error) {
    console.error('Error in updateExpense:', error);

    if (error.code === 'ConditionalCheckFailedException') {
      return createErrorResponse(404, 'Expense not found or access denied');
    }

    if (error.message.includes('User ID not found')) {
      return createErrorResponse(401, 'Unauthorized: Invalid user context');
    }

    return createErrorResponse(500, 'Failed to update expense', error);
  }
};