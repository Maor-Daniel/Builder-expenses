// lambda/getExpenses.js
// Get all expenses with related project and contractor data

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
    const { startDate, endDate, projectId, contractorId } = queryParams;
    

    let expenses = [];

    if (projectId) {
      // Query expenses by project using GSI
      const params = {
        TableName: TABLE_NAMES.EXPENSES,
        IndexName: 'project-date-index',
        KeyConditionExpression: 'userId = :userProjectId',
        ExpressionAttributeValues: {
          ':userProjectId': `${userId}#${projectId}`
        }
      };

      // Add date range filter if provided
      if (startDate && endDate) {
        params.KeyConditionExpression += ' AND #date BETWEEN :startDate AND :endDate';
        params.ExpressionAttributeNames = { '#date': 'date' };
        params.ExpressionAttributeValues[':startDate'] = startDate;
        params.ExpressionAttributeValues[':endDate'] = endDate;
      }

      const result = await dynamodb.query(params).promise();
      expenses = result.Items || [];
      
    } else if (contractorId) {
      // Query expenses by contractor using GSI
      const params = {
        TableName: TABLE_NAMES.EXPENSES,
        IndexName: 'contractor-date-index',
        KeyConditionExpression: 'userId = :userContractorId',
        ExpressionAttributeValues: {
          ':userContractorId': `${userId}#${contractorId}`
        }
      };

      // Add date range filter if provided
      if (startDate && endDate) {
        params.KeyConditionExpression += ' AND #date BETWEEN :startDate AND :endDate';
        params.ExpressionAttributeNames = { '#date': 'date' };
        params.ExpressionAttributeValues[':startDate'] = startDate;
        params.ExpressionAttributeValues[':endDate'] = endDate;
      }

      const result = await dynamodb.query(params).promise();
      expenses = result.Items || [];
      
    } else {
      // Get all expenses for the user
      const params = {
        TableName: TABLE_NAMES.EXPENSES,
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': userId
        }
      };

      // Add date range filter if provided
      if (startDate && endDate) {
        params.FilterExpression = '#date BETWEEN :startDate AND :endDate';
        params.ExpressionAttributeNames = { '#date': 'date' };
        params.ExpressionAttributeValues[':startDate'] = startDate;
        params.ExpressionAttributeValues[':endDate'] = endDate;
      }

      const result = await dynamodb.query(params).promise();
      expenses = result.Items || [];
    }


    // Enhance expenses with project and contractor information
    const enhancedExpenses = await Promise.all(
      expenses.map(async (expense) => {
        try {
          // Get project information
          const projectParams = {
            TableName: TABLE_NAMES.PROJECTS,
            Key: { userId: expense.userId, projectId: expense.projectId }
          };
          
          const projectResult = await dynamodb.get(projectParams).promise();
          const project = projectResult.Item;

          // Get contractor information  
          const contractorParams = {
            TableName: TABLE_NAMES.CONTRACTORS,
            Key: { userId: expense.userId, contractorId: expense.contractorId }
          };
          
          const contractorResult = await dynamodb.get(contractorParams).promise();
          const contractor = contractorResult.Item;

          // Return enhanced expense with related data
          return {
            ...expense,
            projectName: project ? project.name : 'Unknown Project',
            contractorName: contractor ? contractor.name : 'Unknown Contractor',
            contractorPhone: contractor ? contractor.phone : ''
          };
        } catch (enhanceError) {
          // Return original expense if enhancement fails
          return {
            ...expense,
            projectName: 'Error loading project',
            contractorName: 'Error loading contractor',
            contractorPhone: ''
          };
        }
      })
    );

    // Sort by date (newest first)
    enhancedExpenses.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Calculate summary statistics
    const summary = {
      totalCount: enhancedExpenses.length,
      totalAmount: enhancedExpenses.reduce((sum, expense) => sum + (expense.amount || 0), 0),
      dateRange: {
        earliest: enhancedExpenses.length > 0 ? 
          Math.min(...enhancedExpenses.map(e => new Date(e.date).getTime())) : null,
        latest: enhancedExpenses.length > 0 ? 
          Math.max(...enhancedExpenses.map(e => new Date(e.date).getTime())) : null
      }
    };

    // Convert timestamps back to date strings
    if (summary.dateRange.earliest) {
      summary.dateRange.earliest = new Date(summary.dateRange.earliest).toISOString().split('T')[0];
    }
    if (summary.dateRange.latest) {
      summary.dateRange.latest = new Date(summary.dateRange.latest).toISOString().split('T')[0];
    }


    return createResponse(200, {
      success: true,
      message: `Retrieved ${enhancedExpenses.length} expenses`,
      data: {
        expenses: enhancedExpenses,
        summary,
        filters: {
          projectId: projectId || null,
          contractorId: contractorId || null,
          startDate: startDate || null,
          endDate: endDate || null
        }
      },
      timestamp: getCurrentTimestamp()
    });

  } catch (error) {

    if (error.message.includes('User ID not found')) {
      return createErrorResponse(401, 'Unauthorized: Invalid user context');
    }

    return createErrorResponse(500, 'Failed to retrieve expenses', error);
  }
};