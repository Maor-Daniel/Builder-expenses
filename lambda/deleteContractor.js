// lambda/deleteContractor.js
// Delete a contractor

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
  debugLog('deleteContractor event received', event);

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

    // Get contractor ID from path parameters
    const contractorId = event.pathParameters?.id;
    if (!contractorId) {
      return createErrorResponse(400, 'Missing contractor ID in path parameters');
    }

    debugLog('Contractor ID to delete', contractorId);

    // First, verify that the contractor exists and belongs to the user
    const getParams = {
      TableName: TABLE_NAMES.CONTRACTORS,
      Key: {
        userId,
        contractorId
      }
    };

    let existingContractor;
    try {
      const getResult = await dynamoOperation('get', getParams);
      existingContractor = getResult.Item;
      
      if (!existingContractor || !existingContractor.contractorId) {
        return createErrorResponse(404, 'Contractor not found');
      }
    } catch (error) {
      console.error('Error checking existing contractor:', error);
      return createErrorResponse(500, 'Failed to verify contractor ownership');
    }

    debugLog('Existing contractor found', { 
      contractorId, 
      name: existingContractor.name
    });

    // Check if contractor has associated expenses
    const expensesCheckParams = {
      TableName: TABLE_NAMES.EXPENSES,
      KeyConditionExpression: 'userId = :userId',
      FilterExpression: 'contractorId = :contractorId',
      ExpressionAttributeValues: {
        ':userId': userId,
        ':contractorId': contractorId
      }
    };

    try {
      const expensesCheck = await dynamoOperation('query', expensesCheckParams);
      if (expensesCheck.Items && expensesCheck.Items.length > 0) {
        return createErrorResponse(409, 
          `Cannot delete contractor "${existingContractor.name}". It has ${expensesCheck.Items.length} associated expenses. ` +
          'Delete or reassign the expenses first.'
        );
      }
    } catch (error) {
      debugLog('Error checking associated expenses', error.message);
    }

    // Delete the contractor
    const deleteParams = {
      TableName: TABLE_NAMES.CONTRACTORS,
      Key: {
        userId,
        contractorId
      },
      ConditionExpression: 'attribute_exists(contractorId)',
      ReturnValues: 'ALL_OLD'
    };

    const deleteResult = await dynamoOperation('delete', deleteParams);
    const deletedContractor = deleteResult.Attributes;

    debugLog('Contractor deleted successfully', { contractorId });

    return createResponse(200, {
      success: true,
      message: 'Contractor deleted successfully',
      data: {
        contractor: deletedContractor,
        contractorId
      },
      timestamp: getCurrentTimestamp()
    });

  } catch (error) {
    console.error('Error in deleteContractor:', error);

    if (error.code === 'ConditionalCheckFailedException') {
      return createErrorResponse(404, 'Contractor not found or access denied');
    }

    if (error.message.includes('User ID not found')) {
      return createErrorResponse(401, 'Unauthorized: Invalid user context');
    }

    return createErrorResponse(500, 'Failed to delete contractor', error);
  }
};