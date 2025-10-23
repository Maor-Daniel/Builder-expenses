// lambda/getExpenses.js
// Get all expenses for a user

const {
  createResponse,
  createErrorResponse,
  getUserIdFromEvent,
  debugLog,
  dynamoOperation,
  TABLE_NAME
} = require('./shared/utils');

exports.handler = async (event) => {
  debugLog('getExpenses event received', event);

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

    // Parse query parameters for filtering
    const queryParams = event.queryStringParameters || {};
    const { startDate, endDate, project, contractor } = queryParams;

    // Build DynamoDB query parameters
    let params = {
      TableName: TABLE_NAME,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      }
    };

    // Add filters if provided
    const filterExpressions = [];
    
    // Only return actual expenses (not projects or contractors)
    filterExpressions.push('attribute_not_exists(projectId) AND attribute_not_exists(contractorId)');
    
    if (startDate && endDate) {
      filterExpressions.push('#date BETWEEN :startDate AND :endDate');
      params.ExpressionAttributeValues[':startDate'] = startDate;
      params.ExpressionAttributeValues[':endDate'] = endDate;
    }
    
    if (project) {
      filterExpressions.push('contains(#project, :project)');
      params.ExpressionAttributeValues[':project'] = project;
    }
    
    if (contractor) {
      filterExpressions.push('contains(#contractor, :contractor)');
      params.ExpressionAttributeValues[':contractor'] = contractor;
    }

    // Add filter expression if we have any filters
    if (filterExpressions.length > 0) {
      params.FilterExpression = filterExpressions.join(' AND ');
      
      // Only add ExpressionAttributeNames if we actually need them
      const attributeNames = {};
      if (startDate && endDate) {
        attributeNames['#date'] = 'date';
      }
      if (project) {
        attributeNames['#project'] = 'project';
      }
      if (contractor) {
        attributeNames['#contractor'] = 'contractor';
      }
      
      if (Object.keys(attributeNames).length > 0) {
        params.ExpressionAttributeNames = attributeNames;
      }
    }

    // Query DynamoDB
    const result = await dynamoOperation('query', params);

    // Sort by date (newest first)
    const expenses = (result.Items || []).sort((a, b) => new Date(b.date) - new Date(a.date));

    // Calculate totals
    const totalAmount = expenses.reduce((sum, expense) => sum + parseFloat(expense.amount || 0), 0);
    const totalCount = expenses.length;

    debugLog('Query results', {
      totalCount,
      totalAmount,
      hasFilters: filterExpressions.length > 0
    });

    return createResponse(200, {
      success: true,
      items: expenses,
      count: totalCount,
      totalAmount: totalAmount,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in getExpenses:', error);
    
    if (error.message.includes('User ID not found')) {
      return createErrorResponse(401, 'Unauthorized: Invalid user context');
    }
    
    return createErrorResponse(500, 'Failed to retrieve expenses', error);
  }
};