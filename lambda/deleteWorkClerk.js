// lambda/deleteWorkClerk.js
// Delete a work - Clerk authentication version

const {
  createResponse,
  createErrorResponse,
  getCurrentTimestamp,
  dynamodb,
  debugLog,
  TABLE_NAMES,
  dynamoOperation
} = require('./shared/multi-table-utils');

const { withClerkAuth } = require('./shared/clerk-auth');
const { withSecureCors } = require('./shared/cors-config');

// Main handler wrapped with Clerk authentication
exports.handler = withClerkAuth(async (event) => {
  try {
    // Get user context from Clerk authentication
    const userContext = event.userContext;
    const userId = userContext.userId;
    const companyId = userContext.companyId;

    debugLog(`Processing delete work request for user ${userId} in company ${companyId}`);

    // Get work ID from path parameters
    const workId = event.pathParameters?.id;
    if (!workId) {
      return createErrorResponse(400, 'Missing work ID in path parameters');
    }

    debugLog(`Attempting to delete work ${workId}`);

    // First, verify that the work exists and belongs to the company
    const getParams = {
      TableName: TABLE_NAMES.WORKS,
      Key: {
        companyId,  // Using companyId for multi-tenancy
        workId
      }
    };

    let existingWork;
    try {
      const getResult = await dynamoOperation('get', getParams);
      existingWork = getResult.Item;

      if (!existingWork || !existingWork.workId) {
        return createErrorResponse(404, 'Work not found');
      }
    } catch (error) {
      debugLog(`Error verifying work ownership: ${error.message}`);
      return createErrorResponse(500, 'Failed to verify work ownership');
    }

    debugLog(`Found work: ${existingWork.name}`);

    // Check if work has associated expenses
    // Note: Works table may contain both works and expenses, so we need to filter carefully
    const expensesCheckParams = {
      TableName: TABLE_NAMES.WORKS,
      KeyConditionExpression: 'companyId = :companyId',
      FilterExpression: '#workId = :workId AND attribute_not_exists(projectId) AND attribute_not_exists(contractorId) AND attribute_not_exists(workId)',
      ExpressionAttributeNames: {
        '#workId': 'workId'
      },
      ExpressionAttributeValues: {
        ':companyId': companyId,
        ':workId': workId
      }
    };

    try {
      const expensesCheck = await dynamoOperation('query', expensesCheckParams);
      if (expensesCheck.Items && expensesCheck.Items.length > 0) {
        // Get cascading delete option
        const cascade = event.queryStringParameters?.cascade === 'true';

        if (!cascade) {
          return createErrorResponse(409,
            `Cannot delete work "${existingWork.name}". It has ${expensesCheck.Items.length} associated expenses. ` +
            'Add ?cascade=true to delete work and remove work association from expenses.'
          );
        }

        debugLog(`Cascade update: removing work from ${expensesCheck.Items.length} expenses`);

        // Remove work association from expenses (don't delete the expenses)
        const updatePromises = expensesCheck.Items.map(expense => {
          const updateParams = {
            TableName: TABLE_NAMES.WORKS,
            Key: {
              companyId: expense.companyId,
              expenseId: expense.expenseId
            },
            UpdateExpression: 'REMOVE workId, workName',
            ConditionExpression: 'attribute_exists(workId)'
          };
          return dynamoOperation('update', updateParams);
        });

        await Promise.all(updatePromises);
        debugLog(`Successfully updated ${expensesCheck.Items.length} expenses`);
      }
    } catch (error) {
      debugLog(`Error checking/updating associated expenses: ${error.message}`);
    }

    // Delete the work
    const deleteParams = {
      TableName: TABLE_NAMES.WORKS,
      Key: {
        companyId,
        workId
      },
      ConditionExpression: 'attribute_exists(workId)',
      ReturnValues: 'ALL_OLD'
    };

    const deleteResult = await dynamoOperation('delete', deleteParams);
    const deletedWork = deleteResult.Attributes;

    debugLog(`Successfully deleted work ${workId}`);

    // Log audit trail
    const auditParams = {
      TableName: 'AuditLogs',
      Item: {
        logId: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: getCurrentTimestamp(),
        companyId,
        userId,
        userEmail: userContext.email,
        action: 'DELETE_WORK',
        resourceType: 'WORK',
        resourceId: workId,
        details: {
          workName: deletedWork.name,
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
      message: 'Work deleted successfully',
      data: {
        work: deletedWork,
        workId
      },
      timestamp: getCurrentTimestamp()
    });

  } catch (error) {
    debugLog(`Error in deleteWorkClerk: ${error.message}`);

    if (error.code === 'ConditionalCheckFailedException') {
      return createErrorResponse(404, 'Work not found or access denied');
    }

    if (error.message.includes('User ID not found') ||
        error.message.includes('Company ID not found')) {
      return createErrorResponse(401, 'Unauthorized: Invalid user context');
    }

    return createErrorResponse(500, 'Failed to delete work', error);
  }
}, {
  requiredPermission: 'works:delete'  // Require delete permission
});