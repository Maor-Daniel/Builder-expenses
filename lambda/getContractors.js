// lambda/getContractors.js
// Get all contractors for a user

const {
  createResponse,
  createErrorResponse,
  getUserIdFromEvent,
  debugLog,
  dynamoOperation,
  TABLE_NAME
} = require('./shared/utils');

exports.handler = async (event) => {
  debugLog('getContractors event received', event);

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

    // Build query parameters
    const queryDBParams = {
      TableName: TABLE_NAME,
      KeyConditionExpression: 'userId = :userId',
      FilterExpression: 'attribute_exists(contractorId)',
      ExpressionAttributeValues: {
        ':userId': userId
      }
    };

    debugLog('Query parameters', queryDBParams);

    // Query DynamoDB
    const result = await dynamoOperation('query', queryDBParams);

    const contractors = result.Items || [];

    debugLog(`Found ${contractors.length} contractors`);

    // Sort contractors by name
    contractors.sort((a, b) => a.name.localeCompare(b.name));

    // Calculate summary statistics
    const summary = {
      totalContractors: contractors.length,
      contractorsWithSignatures: contractors.filter(c => c.signature).length
    };

    return createResponse(200, {
      success: true,
      message: `Found ${contractors.length} contractors`,
      data: contractors,
      summary,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in getContractors:', error);

    if (error.message.includes('User ID not found')) {
      return createErrorResponse(401, 'Unauthorized: Invalid user context');
    }

    return createErrorResponse(500, 'Failed to retrieve contractors', error);
  }
};