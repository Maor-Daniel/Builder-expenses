// lambda/deleteProject.js
// Delete a project

const {
  createResponse,
  createErrorResponse,
  getUserIdFromEvent,
  getCurrentTimestamp,
  dynamodb,
  debugLog,
  TABLE_NAMES,
  dynamoOperation
} = require('./shared/multi-table-utils');

exports.handler = async (event) => {
  // Handle CORS preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return createResponse(200, { message: 'CORS preflight' });
  }

  try {
    // Get user ID from event context
    let userId;
    try {
      userId = getUserIdFromEvent(event);
    } catch (error) {
      // For single user app, use a default user ID
      userId = 'default-user';
    }

    // Get project ID from path parameters
    const projectId = event.pathParameters?.id;
    if (!projectId) {
      return createErrorResponse(400, 'Missing project ID in path parameters');
    }


    // First, verify that the project exists and belongs to the user
    const getParams = {
      TableName: TABLE_NAMES.PROJECTS,
      Key: {
        userId,
        projectId
      }
    };

    let existingProject;
    try {
      const getResult = await dynamoOperation('get', getParams);
      existingProject = getResult.Item;
      
      if (!existingProject || !existingProject.projectId) {
        return createErrorResponse(404, 'Project not found');
      }
    } catch (error) {
      return createErrorResponse(500, 'Failed to verify project ownership');
    }


    // Check if project has associated expenses
    const expensesCheckParams = {
      TableName: TABLE_NAMES.EXPENSES,
      KeyConditionExpression: 'userId = :userId',
      FilterExpression: 'projectId = :projectId',
      ExpressionAttributeValues: {
        ':userId': userId,
        ':projectId': projectId
      }
    };

    try {
      const expensesCheck = await dynamoOperation('query', expensesCheckParams);
      if (expensesCheck.Items && expensesCheck.Items.length > 0) {
        // Get cascading delete option
        const cascade = event.queryStringParameters?.cascade === 'true';
        
        if (!cascade) {
          return createErrorResponse(409, 
            `Cannot delete project "${existingProject.name}". It has ${expensesCheck.Items.length} associated expenses. ` +
            'Add ?cascade=true to delete project and all its expenses.'
          );
        }

        // Delete all associated expenses
        const deletePromises = expensesCheck.Items.map(expense => {
          const deleteParams = {
            TableName: TABLE_NAMES.EXPENSES,
            Key: {
              userId: expense.userId,
              expenseId: expense.expenseId
            }
          };
          return dynamoOperation('delete', deleteParams);
        });

        await Promise.all(deletePromises);
      }
    } catch (error) {
    }

    // Delete the project
    const deleteParams = {
      TableName: TABLE_NAMES.PROJECTS,
      Key: {
        userId,
        projectId
      },
      ConditionExpression: 'attribute_exists(projectId)',
      ReturnValues: 'ALL_OLD'
    };

    const deleteResult = await dynamoOperation('delete', deleteParams);
    const deletedProject = deleteResult.Attributes;


    return createResponse(200, {
      success: true,
      message: 'Project deleted successfully',
      data: {
        project: deletedProject,
        projectId
      },
      timestamp: getCurrentTimestamp()
    });

  } catch (error) {

    if (error.code === 'ConditionalCheckFailedException') {
      return createErrorResponse(404, 'Project not found or access denied');
    }

    if (error.message.includes('User ID not found')) {
      return createErrorResponse(401, 'Unauthorized: Invalid user context');
    }

    return createErrorResponse(500, 'Failed to delete project', error);
  }
};