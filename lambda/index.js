// lambda/getProjects.js
// Get all projects with SpentAmount data

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
  console.log('getProjects event received:', JSON.stringify(event, null, 2));

  try {
    // Get user ID from event context
    const userId = getUserIdFromEvent(event);
    console.log('User ID:', userId);

    // Parse query parameters for filtering
    const queryParams = event.queryStringParameters || {};
    const { status, sortBy } = queryParams;
    
    console.log('Query parameters:', queryParams);

    // Build DynamoDB query parameters
    let params = {
      TableName: TABLE_NAMES.PROJECTS,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      }
    };

    // Add status filter if provided
    if (status) {
      params.FilterExpression = '#status = :status';
      params.ExpressionAttributeNames = { '#status': 'status' };
      params.ExpressionAttributeValues[':status'] = status;
    }

    console.log('DynamoDB query params:', params);

    const result = await dynamodb.query(params).promise();
    let projects = result.Items || [];

    console.log(`Found ${projects.length} projects`);

    // Sort projects based on sortBy parameter
    if (sortBy === 'name') {
      projects.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'date') {
      projects.sort((a, b) => new Date(b.startDate) - new Date(a.startDate)); // Newest first
    } else if (sortBy === 'spent') {
      projects.sort((a, b) => (b.SpentAmount || 0) - (a.SpentAmount || 0)); // Highest spending first
    } else {
      // Default sort by creation date (newest first)
      projects.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    // Calculate summary statistics
    const summary = {
      totalCount: projects.length,
      totalSpentAmount: projects.reduce((sum, project) => sum + (project.SpentAmount || 0), 0),
      averageSpentAmount: projects.length > 0 ? 
        projects.reduce((sum, project) => sum + (project.SpentAmount || 0), 0) / projects.length : 0,
      statusCounts: projects.reduce((counts, project) => {
        const status = project.status || 'unknown';
        counts[status] = (counts[status] || 0) + 1;
        return counts;
      }, {})
    };

    console.log('Projects retrieved successfully');

    return createResponse(200, {
      success: true,
      message: `Retrieved ${projects.length} projects`,
      data: {
        projects,
        summary,
        filters: {
          status: status || null,
          sortBy: sortBy || 'createdAt'
        }
      },
      timestamp: getCurrentTimestamp()
    });

  } catch (error) {
    console.error('Error in getProjects:', error);

    if (error.message.includes('User ID not found')) {
      return createErrorResponse(401, 'Unauthorized: Invalid user context');
    }

    return createErrorResponse(500, 'Failed to retrieve projects', error);
  }
};