// lambda/getContractors.js
// Get all contractors 

const {
  createResponse,
  createErrorResponse,
  getUserIdFromEvent,
  getCurrentTimestamp,
  dynamodb,
  isLocal,
  TABLE_NAMES
} = require('./shared/multi-table-utils');

exports.handler = async (event) => {
  console.log('getContractors event received:', JSON.stringify(event, null, 2));

  try {
    // Get user ID from event context
    const userId = getUserIdFromEvent(event);
    console.log('User ID:', userId);

    // Parse query parameters for filtering
    const queryParams = event.queryStringParameters || {};
    const { sortBy } = queryParams;
    
    console.log('Query parameters:', queryParams);

    // Build DynamoDB query parameters
    const params = {
      TableName: TABLE_NAMES.CONTRACTORS,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      }
    };

    console.log('DynamoDB query params:', params);

    const result = await dynamodb.query(params).promise();
    let contractors = result.Items || [];

    console.log(`Found ${contractors.length} contractors`);

    // Sort contractors based on sortBy parameter
    if (sortBy === 'name') {
      contractors.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      // Default sort by creation date (newest first)
      contractors.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    // Calculate summary statistics
    const summary = {
      totalCount: contractors.length
    };

    console.log('Contractors retrieved successfully');

    return createResponse(200, {
      success: true,
      message: `Retrieved ${contractors.length} contractors`,
      data: {
        contractors,
        summary,
        filters: {
          sortBy: sortBy || 'createdAt'
        }
      },
      timestamp: getCurrentTimestamp()
    });

  } catch (error) {
    console.error('Error in getContractors:', error);

    if (error.message.includes('User ID not found')) {
      return createErrorResponse(401, 'Unauthorized: Invalid user context');
    }

    return createErrorResponse(500, 'Failed to retrieve contractors', error);
  }
};