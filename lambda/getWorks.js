// lambda/getWorks.js
// Get all works for a user

const {
  createResponse,
  createErrorResponse,
  getUserIdFromEvent,
  getCurrentTimestamp,
  debugLog,
  dynamoOperation,
  TABLE_NAME
} = require('./shared/utils');

exports.handler = async (event) => {
  debugLog('getWorks event received', event);

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

    // Query DynamoDB for works
    const params = {
      TableName: TABLE_NAME,
      KeyConditionExpression: 'userId = :userId',
      FilterExpression: 'attribute_exists(workId)',
      ExpressionAttributeValues: {
        ':userId': userId
      }
    };

    const result = await dynamoOperation('query', params);
    const works = result.Items || [];

    debugLog('Works retrieved', { count: works.length });

    return createResponse(200, {
      success: true,
      items: works,
      count: works.length,
      timestamp: getCurrentTimestamp()
    });

  } catch (error) {
    console.error('Error in getWorks:', error);
    
    if (error.message.includes('User ID not found')) {
      return createErrorResponse(401, 'Unauthorized: Invalid user context');
    }

    return createErrorResponse(500, 'Failed to retrieve works', error);
  }
};