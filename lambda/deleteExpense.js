// lambda/deleteExpense.js
// Delete an expense

const {
  createResponse,
  createErrorResponse,
  getUserIdFromEvent,
  getCurrentTimestamp,
  dynamodb,
  debugLog,
  TABLE_NAMES,
  dynamoOperation
} = require('./shared/multi-table-utils');

exports.handler = async (event) => {

  try {
    // Get user ID from event context
    let userId;
    try {
      userId = getUserIdFromEvent(event);
    } catch (error) {
      // For single user app, use a default user ID
      userId = 'default-user';
    }

    // Get expense ID from path parameters
    const expenseId = event.pathParameters?.id;
    if (!expenseId) {
      return createErrorResponse(400, 'Missing expense ID in path parameters');
    }


    // First, verify that the expense exists and belongs to the user
    const getParams = {
      TableName: TABLE_NAMES.EXPENSES,
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
      return createErrorResponse(500, 'Failed to verify expense ownership');
    }


    // Business rule: Prevent deletion of expenses with certain statuses
    const protectedStatuses = ['paid', 'processed'];
    if (protectedStatuses.includes(existingExpense.status)) {
      return createErrorResponse(403, 
        `Cannot delete expense with status: ${existingExpense.status}. ` +
        'Only pending expenses can be deleted.'
      );
    }

    // Soft delete option - mark as deleted instead of removing
    const softDelete = event.queryStringParameters?.soft === 'true';
    
    if (softDelete) {
      // Soft delete: Update status to 'deleted'
      const updateParams = {
        TableName: TABLE_NAMES.EXPENSES,
        Key: {
          userId,
          expenseId
        },
        UpdateExpression: 'SET #status = :status, deletedAt = :deletedAt, updatedAt = :updatedAt',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':status': 'deleted',
          ':deletedAt': getCurrentTimestamp(),
          ':updatedAt': getCurrentTimestamp()
        },
        ConditionExpression: 'attribute_exists(expenseId)',
        ReturnValues: 'ALL_NEW'
      };

      const updateResult = await dynamoOperation('update', updateParams);
      

      return createResponse(200, {
        success: true,
        message: 'Expense marked as deleted',
        data: {
          expense: updateResult.Attributes,
          expenseId,
          deletionType: 'soft'
        },
        timestamp: getCurrentTimestamp()
      });

    } else {
      // Hard delete: Remove from database completely
      const deleteParams = {
        TableName: TABLE_NAMES.EXPENSES,
        Key: {
          userId,
          expenseId
        },
        ConditionExpression: 'attribute_exists(expenseId)',
        ReturnValues: 'ALL_OLD'
      };

      const deleteResult = await dynamoOperation('delete', deleteParams);
      const deletedExpense = deleteResult.Attributes;


      return createResponse(200, {
        success: true,
        message: 'Expense deleted permanently',
        data: {
          expense: deletedExpense,
          expenseId,
          deletionType: 'hard'
        },
        timestamp: getCurrentTimestamp()
      });
    }

  } catch (error) {

    if (error.code === 'ConditionalCheckFailedException') {
      return createErrorResponse(404, 'Expense not found or access denied');
    }

    if (error.message.includes('User ID not found')) {
      return createErrorResponse(401, 'Unauthorized: Invalid user context');
    }

    return createErrorResponse(500, 'Failed to delete expense', error);
  }
};