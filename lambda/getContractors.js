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
const { withSecureCors } = require('./shared/cors-config');

exports.handler = withSecureCors(async (event) => {

  try {
    // Get user ID from event context
    const userId = getUserIdFromEvent(event);

    // Parse query parameters for filtering
    const queryParams = event.queryStringParameters || {};
    const { sortBy } = queryParams;
    

    // Build DynamoDB query parameters
    const params = {
      TableName: TABLE_NAMES.CONTRACTORS,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      }
    };


    const result = await dynamodb.query(params).promise();
    let contractors = result.Items || [];


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

    if (error.message.includes('User ID not found')) {
      return createErrorResponse(401, 'Unauthorized: Invalid user context');
    }

    return createErrorResponse(500, 'Failed to retrieve contractors', error);
  }
};