// lambda/deleteWork.js
// Delete a work

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
  debugLog('deleteWork event received', event);

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

    // Get work ID from path parameters
    const workId = event.pathParameters?.id;
    if (!workId) {
      return createErrorResponse(400, 'Missing work ID in path parameters');
    }

    debugLog('Work ID to delete', workId);

    // First, verify that the work exists and belongs to the user
    const getParams = {
      TableName: TABLE_NAMES.WORKS,
      Key: {
        userId,
        workId // Works use expenseId as sort key for table compatibility
      }
    };

    let existingWork;
    try {
      const getResult = await dynamoOperation('get', getParams);
      existingWork = getResult.Item;
      
      if (!existingWork || !existingWork.workId) {
        return createErrorResponse(404, 'Work not found');
      }
    } catch (error) {
      console.error('Error checking existing work:', error);
      return createErrorResponse(500, 'Failed to verify work ownership');
    }

    debugLog('Existing work found', { 
      workId, 
      name: existingWork.name,
      project: existingWork.project
    });

    // Check if work has associated expenses
    const expensesCheckParams = {
      TableName: TABLE_NAMES.WORKS,
      KeyConditionExpression: 'userId = :userId',
      FilterExpression: '#workId = :workId AND attribute_not_exists(projectId) AND attribute_not_exists(contractorId) AND attribute_not_exists(workId)',
      ExpressionAttributeNames: {
        '#workId': 'workId'
      },
      ExpressionAttributeValues: {
        ':userId': userId,
        ':workId': workId
      }
    };

    try {
      const expensesCheck = await dynamoOperation('query', expensesCheckParams);
      if (expensesCheck.Items && expensesCheck.Items.length > 0) {
        // Get cascading delete option
        const cascade = event.queryStringParameters?.cascade === 'true';
        
        if (!cascade) {
          return createErrorResponse(409, 
            `Cannot delete work "${existingWork.name}". It has ${expensesCheck.Items.length} associated expenses. ` +
            'Add ?cascade=true to delete work and remove work association from expenses.'
          );
        }

        // Remove work association from expenses (don't delete the expenses)
        const updatePromises = expensesCheck.Items.map(expense => {
          const updateParams = {
            TableName: TABLE_NAMES.WORKS,
            Key: {
              userId: expense.userId,
              expenseId: expense.expenseId
            },
            UpdateExpression: 'REMOVE workId, workName',
            ConditionExpression: 'attribute_exists(workId)'
          };
          return dynamoOperation('update', updateParams);
        });

        await Promise.all(updatePromises);
        debugLog('Removed work association from expenses', { count: expensesCheck.Items.length });
      }
    } catch (error) {
      debugLog('Error checking/updating associated expenses', error.message);
    }

    // Delete the work
    const deleteParams = {
      TableName: TABLE_NAMES.WORKS,
      Key: {
        userId,
        workId
      },
      ConditionExpression: 'attribute_exists(workId)',
      ReturnValues: 'ALL_OLD'
    };

    const deleteResult = await dynamoOperation('delete', deleteParams);
    const deletedWork = deleteResult.Attributes;

    debugLog('Work deleted successfully', { workId });

    return createResponse(200, {
      success: true,
      message: 'Work deleted successfully',
      data: {
        work: deletedWork,
        workId
      },
      timestamp: getCurrentTimestamp()
    });

  } catch (error) {
    console.error('Error in deleteWork:', error);

    if (error.code === 'ConditionalCheckFailedException') {
      return createErrorResponse(404, 'Work not found or access denied');
    }

    if (error.message.includes('User ID not found')) {
      return createErrorResponse(401, 'Unauthorized: Invalid user context');
    }

    return createErrorResponse(500, 'Failed to delete work', error);
  }
};