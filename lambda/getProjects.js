// lambda/getProjects.js
// Get all projects for a user

const {
  createResponse,
  createErrorResponse,
  getUserIdFromEvent,
  debugLog,
  dynamoOperation,
  TABLE_NAME
} = require('./shared/utils');

exports.handler = async (event) => {
  debugLog('getProjects event received', event);

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

    // Query parameters for filtering (optional)
    const queryParams = event.queryStringParameters || {};
    const { status } = queryParams;

    // Build query parameters
    const queryDBParams = {
      TableName: TABLE_NAME,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      }
    };

    // Add filter for projects only
    let filterExpressions = ['attribute_exists(projectId)'];

    // Add status filter if provided
    if (status) {
      filterExpressions.push('#status = :status');
      queryDBParams.ExpressionAttributeNames = {
        '#status': 'status'
      };
      queryDBParams.ExpressionAttributeValues[':status'] = status;
    }

    // Combine filter expressions
    if (filterExpressions.length > 0) {
      queryDBParams.FilterExpression = filterExpressions.join(' AND ');
    }

    debugLog('Query parameters', queryDBParams);

    // Query DynamoDB
    const result = await dynamoOperation('query', queryDBParams);

    const projects = result.Items || [];

    debugLog(`Found ${projects.length} projects`);

    // Sort projects by creation date (newest first)
    projects.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Calculate summary statistics
    const summary = {
      totalProjects: projects.length,
      activeProjects: projects.filter(p => p.status === 'active').length,
      completedProjects: projects.filter(p => p.status === 'completed').length
    };

    return createResponse(200, {
      success: true,
      message: `Found ${projects.length} projects`,
      data: projects,
      summary,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in getProjects:', error);

    if (error.message.includes('User ID not found')) {
      return createErrorResponse(401, 'Unauthorized: Invalid user context');
    }

    return createErrorResponse(500, 'Failed to retrieve projects', error);
  }
};