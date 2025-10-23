// lambda/multi-table/getExpenses.js
// Get expenses with enhanced filtering - Multi-table version

const {
  TABLE_NAMES,
  createResponse,
  createErrorResponse,
  getUserIdFromEvent,
  debugLog,
  dynamoOperation
} = require('../shared/multi-table-utils');

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

    // Query parameters for filtering
    const queryParams = event.queryStringParameters || {};
    const { projectId, contractorId, startDate, endDate, limit, lastKey } = queryParams;

    let queryParams_db;
    let useIndex = false;

    // Determine query strategy based on filters
    if (projectId) {
      // Query by project using GSI
      queryParams_db = {
        TableName: TABLE_NAMES.EXPENSES,
        IndexName: 'project-date-index',
        KeyConditionExpression: 'userId = :userId AND projectId = :projectId',
        ExpressionAttributeValues: {
          ':userId': userId,
          ':projectId': projectId
        }
      };
      useIndex = true;
    } else if (contractorId) {
      // Query by contractor using GSI
      queryParams_db = {
        TableName: TABLE_NAMES.EXPENSES,
        IndexName: 'contractor-date-index',
        KeyConditionExpression: 'userId = :userId AND contractorId = :contractorId',
        ExpressionAttributeValues: {
          ':userId': userId,
          ':contractorId': contractorId
        }
      };
      useIndex = true;
    } else {
      // Query all expenses for user
      queryParams_db = {
        TableName: TABLE_NAMES.EXPENSES,
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': userId
        }
      };
    }

    // Add date range filter if provided
    let filterExpressions = [];
    if (startDate && endDate) {
      filterExpressions.push('#date BETWEEN :startDate AND :endDate');
      queryParams_db.ExpressionAttributeNames = {
        ...queryParams_db.ExpressionAttributeNames,
        '#date': 'date'
      };
      queryParams_db.ExpressionAttributeValues = {
        ...queryParams_db.ExpressionAttributeValues,
        ':startDate': startDate,
        ':endDate': endDate
      };
    } else if (startDate) {
      filterExpressions.push('#date >= :startDate');
      queryParams_db.ExpressionAttributeNames = {
        ...queryParams_db.ExpressionAttributeNames,
        '#date': 'date'
      };
      queryParams_db.ExpressionAttributeValues = {
        ...queryParams_db.ExpressionAttributeValues,
        ':startDate': startDate
      };
    } else if (endDate) {
      filterExpressions.push('#date <= :endDate');
      queryParams_db.ExpressionAttributeNames = {
        ...queryParams_db.ExpressionAttributeNames,
        '#date': 'date'
      };
      queryParams_db.ExpressionAttributeValues = {
        ...queryParams_db.ExpressionAttributeValues,
        ':endDate': endDate
      };
    }

    // Apply filter expressions
    if (filterExpressions.length > 0) {
      queryParams_db.FilterExpression = filterExpressions.join(' AND ');
    }

    // Add pagination
    if (limit) {
      queryParams_db.Limit = parseInt(limit);
    }

    if (lastKey) {
      try {
        queryParams_db.ExclusiveStartKey = JSON.parse(decodeURIComponent(lastKey));
      } catch (error) {
        return createErrorResponse(400, 'Invalid lastKey parameter');
      }
    }

    // Sort by date descending (most recent first)
    queryParams_db.ScanIndexForward = false;

    debugLog('Query parameters', queryParams_db);

    // Execute query
    const result = await dynamoOperation('query', queryParams_db);

    // Get related project and contractor information for each expense
    const expensesWithDetails = await Promise.all(
      result.Items.map(async (expense) => {
        const enhancedExpense = { ...expense };

        // Get project details
        try {
          const projectResult = await dynamoOperation('get', {
            TableName: TABLE_NAMES.PROJECTS,
            Key: { userId, projectId: expense.projectId }
          });
          if (projectResult.Item) {
            enhancedExpense.projectName = projectResult.Item.name;
            enhancedExpense.projectStatus = projectResult.Item.status;
          }
        } catch (error) {
          debugLog('Failed to get project details', error.message);
        }

        // Get contractor details
        try {
          const contractorResult = await dynamoOperation('get', {
            TableName: TABLE_NAMES.CONTRACTORS,
            Key: { userId, contractorId: expense.contractorId }
          });
          if (contractorResult.Item) {
            enhancedExpense.contractorName = contractorResult.Item.name;
            enhancedExpense.contractorPhone = contractorResult.Item.phone;
          }
        } catch (error) {
          debugLog('Failed to get contractor details', error.message);
        }

        return enhancedExpense;
      })
    );

    // Calculate summary statistics
    const totalAmount = result.Items.reduce((sum, expense) => sum + expense.amount, 0);
    const totalCount = result.Items.length;

    // Prepare pagination info
    const paginationInfo = {
      hasMore: !!result.LastEvaluatedKey,
      lastKey: result.LastEvaluatedKey ? encodeURIComponent(JSON.stringify(result.LastEvaluatedKey)) : null,
      count: totalCount
    };

    debugLog('Expenses retrieved successfully', { count: totalCount, hasMore: paginationInfo.hasMore });

    return createResponse(200, {
      success: true,
      data: {
        expenses: expensesWithDetails,
        summary: {
          totalAmount,
          totalCount,
          averageAmount: totalCount > 0 ? Math.round(totalAmount / totalCount) : 0
        },
        pagination: paginationInfo,
        filters: {
          projectId,
          contractorId,
          startDate,
          endDate
        }
      },
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