// lambda/deleteProject.js
// Delete a project

const {
  createResponse,
  createErrorResponse,
  getUserIdFromEvent,
  getCurrentTimestamp,
  debugLog,
  dynamoOperation,
  TABLE_NAME
} = require('./shared/utils');

exports.handler = async (event) => {
  debugLog('deleteProject event received', event);

  try {
    // Get user ID from event context
    let userId;
    try {
      userId = getUserIdFromEvent(event);
    } catch (error) {
      // For single user app, use a default user ID
      userId = 'default-user';
    }
    debugLog('User ID', userId);

    // Get project ID from path parameters
    const projectId = event.pathParameters?.id;
    if (!projectId) {
      return createErrorResponse(400, 'Missing project ID in path parameters');
    }

    debugLog('Project ID to delete', projectId);

    // First, verify that the project exists and belongs to the user
    const getParams = {
      TableName: TABLE_NAME,
      Key: {
        userId,
        expenseId: projectId // Projects use expenseId as sort key for table compatibility
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
      console.error('Error checking existing project:', error);
      return createErrorResponse(500, 'Failed to verify project ownership');
    }

    debugLog('Existing project found', { 
      projectId, 
      name: existingProject.name
    });

    // Check if project has associated expenses
    const expensesCheckParams = {
      TableName: TABLE_NAME,
      KeyConditionExpression: 'userId = :userId',
      FilterExpression: '#project = :projectName AND attribute_not_exists(projectId) AND attribute_not_exists(contractorId)',
      ExpressionAttributeNames: {
        '#project': 'project'
      },
      ExpressionAttributeValues: {
        ':userId': userId,
        ':projectName': existingProject.name
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
            TableName: TABLE_NAME,
            Key: {
              userId: expense.userId,
              expenseId: expense.expenseId
            }
          };
          return dynamoOperation('delete', deleteParams);
        });

        await Promise.all(deletePromises);
        debugLog('Deleted associated expenses', { count: expensesCheck.Items.length });
      }
    } catch (error) {
      debugLog('Error checking/deleting associated expenses', error.message);
    }

    // Delete the project
    const deleteParams = {
      TableName: TABLE_NAME,
      Key: {
        userId,
        expenseId: projectId
      },
      ConditionExpression: 'attribute_exists(expenseId)',
      ReturnValues: 'ALL_OLD'
    };

    const deleteResult = await dynamoOperation('delete', deleteParams);
    const deletedProject = deleteResult.Attributes;

    debugLog('Project deleted successfully', { projectId });

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
    console.error('Error in deleteProject:', error);

    if (error.code === 'ConditionalCheckFailedException') {
      return createErrorResponse(404, 'Project not found or access denied');
    }

    if (error.message.includes('User ID not found')) {
      return createErrorResponse(401, 'Unauthorized: Invalid user context');
    }

    return createErrorResponse(500, 'Failed to delete project', error);
  }
};