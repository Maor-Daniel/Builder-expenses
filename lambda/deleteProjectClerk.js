// lambda/deleteProjectClerk.js
// Delete a project - Clerk authentication version

const {
  createResponse,
  createErrorResponse,
  getCurrentTimestamp,
  dynamodb,
  debugLog,
  TABLE_NAMES,
  dynamoOperation
} = require('./shared/multi-table-utils');

const { withClerkAuth, getUserContextFromEvent } = require('./shared/clerk-auth');
const { withSecureCors } = require('./shared/cors-config');

// Main handler wrapped with Clerk authentication
exports.handler = withClerkAuth(async (event) => {
  try {
    // Get user context from Clerk authentication
    const userContext = event.userContext;
    const userId = userContext.userId;
    const companyId = userContext.companyId;

    debugLog(`Processing delete request for user ${userId} in company ${companyId}`);

    // Get project ID from path parameters
    const projectId = event.pathParameters?.id;
    if (!projectId) {
      return createErrorResponse(400, 'Missing project ID in path parameters');
    }

    debugLog(`Attempting to delete project ${projectId}`);

    // First, verify that the project exists and belongs to the company
    const getParams = {
      TableName: TABLE_NAMES.PROJECTS,
      Key: {
        companyId,  // Using companyId instead of userId for multi-tenancy
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
      debugLog(`Error verifying project ownership: ${error.message}`);
      return createErrorResponse(500, 'Failed to verify project ownership');
    }

    debugLog(`Found project: ${existingProject.name}`);

    // Check if project has associated expenses
    const expensesCheckParams = {
      TableName: TABLE_NAMES.EXPENSES,
      KeyConditionExpression: 'companyId = :companyId',
      FilterExpression: 'projectId = :projectId',
      ExpressionAttributeValues: {
        ':companyId': companyId,
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

        debugLog(`Cascade delete: removing ${expensesCheck.Items.length} associated expenses`);

        // Delete all associated expenses
        const deletePromises = expensesCheck.Items.map(expense => {
          const deleteParams = {
            TableName: TABLE_NAMES.EXPENSES,
            Key: {
              companyId: expense.companyId,
              expenseId: expense.expenseId
            }
          };
          return dynamoOperation('delete', deleteParams);
        });

        await Promise.all(deletePromises);
        debugLog(`Successfully deleted ${expensesCheck.Items.length} associated expenses`);
      }
    } catch (error) {
      debugLog(`Error checking/deleting associated expenses: ${error.message}`);
    }

    // Delete the project
    const deleteParams = {
      TableName: TABLE_NAMES.PROJECTS,
      Key: {
        companyId,
        projectId
      },
      ConditionExpression: 'attribute_exists(projectId)',
      ReturnValues: 'ALL_OLD'
    };

    const deleteResult = await dynamoOperation('delete', deleteParams);
    const deletedProject = deleteResult.Attributes;

    debugLog(`Successfully deleted project ${projectId}`);

    // Log audit trail
    const auditParams = {
      TableName: 'AuditLogs',
      Item: {
        logId: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: getCurrentTimestamp(),
        companyId,
        userId,
        userEmail: userContext.email,
        action: 'DELETE_PROJECT',
        resourceType: 'PROJECT',
        resourceId: projectId,
        details: {
          projectName: deletedProject.name,
          cascade: event.queryStringParameters?.cascade === 'true'
        }
      }
    };

    // Try to log audit but don't fail if it doesn't work
    try {
      await dynamoOperation('put', auditParams);
    } catch (auditError) {
      debugLog(`Audit log failed: ${auditError.message}`);
    }

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
    debugLog(`Error in deleteProjectClerk: ${error.message}`);

    if (error.code === 'ConditionalCheckFailedException') {
      return createErrorResponse(404, 'Project not found or access denied');
    }

    if (error.message.includes('User ID not found') ||
        error.message.includes('Company ID not found')) {
      return createErrorResponse(401, 'Unauthorized: Invalid user context');
    }

    return createErrorResponse(500, 'Failed to delete project', error);
  }
}, {
  requiredPermission: 'projects:delete'  // Require delete permission
});