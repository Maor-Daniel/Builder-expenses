// lambda/getProjectsCompany.js
// Get all projects for a company - company-scoped version

const {
  createResponse,
  createErrorResponse,
  getCompanyUserFromEvent,
  validateCompanyUser,
  getCurrentTimestamp,
  debugLog,
  dynamoOperation,
  COMPANY_TABLE_NAMES
} = require('./shared/company-utils');

exports.handler = async (event) => {

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return createResponse(200, { message: 'CORS preflight' });
  }

  if (event.httpMethod !== 'GET') {
    return createErrorResponse(405, 'Method not allowed');
  }

  try {
    // Get company and user info from token
    const { companyId, userId } = getCompanyUserFromEvent(event);
    
    // Validate user belongs to company
    await validateCompanyUser(companyId, userId);

    // Get query parameters for filtering
    const queryParams = event.queryStringParameters || {};
    const { status, search, startDate, endDate } = queryParams;


    // Build DynamoDB query parameters
    let params = {
      TableName: COMPANY_TABLE_NAMES.PROJECTS,
      KeyConditionExpression: 'companyId = :companyId',
      ExpressionAttributeValues: {
        ':companyId': companyId
      }
    };

    // Add filters if provided
    let filterExpressions = [];
    let expressionAttributeNames = {};

    if (status) {
      filterExpressions.push('#status = :status');
      expressionAttributeNames['#status'] = 'status';
      params.ExpressionAttributeValues[':status'] = status;
    }

    if (search) {
      filterExpressions.push('contains(#name, :search)');
      expressionAttributeNames['#name'] = 'name';
      params.ExpressionAttributeValues[':search'] = search;
    }

    if (startDate && endDate) {
      filterExpressions.push('startDate BETWEEN :startDate AND :endDate');
      params.ExpressionAttributeValues[':startDate'] = startDate;
      params.ExpressionAttributeValues[':endDate'] = endDate;
    }

    if (filterExpressions.length > 0) {
      params.FilterExpression = filterExpressions.join(' AND ');
    }

    if (Object.keys(expressionAttributeNames).length > 0) {
      params.ExpressionAttributeNames = expressionAttributeNames;
    }


    // Execute query
    const result = await dynamoOperation('query', params);
    const projects = result.Items || [];


    // Calculate summary statistics
    const summary = {
      total: projects.length,
      active: projects.filter(p => p.status === 'active').length,
      completed: projects.filter(p => p.status === 'completed').length,
      totalSpent: projects.reduce((sum, p) => sum + (p.SpentAmount || 0), 0)
    };

    // Sort projects by creation date (newest first)
    projects.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return createResponse(200, {
      success: true,
      data: {
        projects,
        summary
      },
      timestamp: getCurrentTimestamp()
    });

  } catch (error) {
    
    if (error.message.includes('authentication required') || error.message.includes('not found in company')) {
      return createErrorResponse(401, 'Authentication required');
    }
    
    return createErrorResponse(500, 'Internal server error while fetching projects');
  }
};