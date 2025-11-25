// lambda/deleteContractorClerk.js
// Delete a contractor - Clerk authentication version

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

// Main handler wrapped with Clerk authentication
exports.handler = withClerkAuth(async (event) => {
  try {
    // Get user context from Clerk authentication
    const userContext = event.userContext;
    const userId = userContext.userId;
    const companyId = userContext.companyId;

    debugLog(`Processing delete contractor request for user ${userId} in company ${companyId}`);

    // Get contractor ID from path parameters
    const contractorId = event.pathParameters?.id;
    if (!contractorId) {
      return createErrorResponse(400, 'Missing contractor ID in path parameters');
    }

    debugLog(`Attempting to delete contractor ${contractorId}`);

    // First, verify that the contractor exists and belongs to the company
    const getParams = {
      TableName: TABLE_NAMES.CONTRACTORS,
      Key: {
        companyId,  // Using companyId for multi-tenancy
        contractorId
      }
    };

    let existingContractor;
    try {
      const getResult = await dynamoOperation('get', getParams);
      existingContractor = getResult.Item;

      if (!existingContractor || !existingContractor.contractorId) {
        return createErrorResponse(404, 'Contractor not found');
      }
    } catch (error) {
      debugLog(`Error verifying contractor ownership: ${error.message}`);
      return createErrorResponse(500, 'Failed to verify contractor ownership');
    }

    debugLog(`Found contractor: ${existingContractor.name}`);

    // Check if contractor has associated expenses
    const expensesCheckParams = {
      TableName: TABLE_NAMES.EXPENSES,
      KeyConditionExpression: 'companyId = :companyId',
      FilterExpression: 'contractorId = :contractorId',
      ExpressionAttributeValues: {
        ':companyId': companyId,
        ':contractorId': contractorId
      }
    };

    try {
      const expensesCheck = await dynamoOperation('query', expensesCheckParams);
      if (expensesCheck.Items && expensesCheck.Items.length > 0) {
        // Get cascading delete option
        const cascade = event.queryStringParameters?.cascade === 'true';

        if (!cascade) {
          return createErrorResponse(409,
            `Cannot delete contractor "${existingContractor.name}". It has ${expensesCheck.Items.length} associated expenses. ` +
            'Add ?cascade=true to delete contractor and remove contractor association from expenses.'
          );
        }

        debugLog(`Cascade update: removing contractor from ${expensesCheck.Items.length} expenses`);

        // Remove contractor association from expenses (don't delete the expenses)
        const updatePromises = expensesCheck.Items.map(expense => {
          const updateParams = {
            TableName: TABLE_NAMES.EXPENSES,
            Key: {
              companyId: expense.companyId,
              expenseId: expense.expenseId
            },
            UpdateExpression: 'REMOVE contractorId, contractorName',
            ConditionExpression: 'attribute_exists(contractorId)'
          };
          return dynamoOperation('update', updateParams);
        });

        await Promise.all(updatePromises);
        debugLog(`Successfully updated ${expensesCheck.Items.length} expenses`);
      }
    } catch (error) {
      debugLog(`Error checking/updating associated expenses: ${error.message}`);
    }

    // Delete the contractor
    const deleteParams = {
      TableName: TABLE_NAMES.CONTRACTORS,
      Key: {
        companyId,
        contractorId
      },
      ConditionExpression: 'attribute_exists(contractorId)',
      ReturnValues: 'ALL_OLD'
    };

    const deleteResult = await dynamoOperation('delete', deleteParams);
    const deletedContractor = deleteResult.Attributes;

    debugLog(`Successfully deleted contractor ${contractorId}`);

    // Log audit trail
    const auditParams = {
      TableName: 'AuditLogs',
      Item: {
        logId: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: getCurrentTimestamp(),
        companyId,
        userId,
        userEmail: userContext.email,
        action: 'DELETE_CONTRACTOR',
        resourceType: 'CONTRACTOR',
        resourceId: contractorId,
        details: {
          contractorName: deletedContractor.name,
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
      message: 'Contractor deleted successfully',
      data: {
        contractor: deletedContractor,
        contractorId
      },
      timestamp: getCurrentTimestamp()
    });

  } catch (error) {
    debugLog(`Error in deleteContractorClerk: ${error.message}`);

    if (error.code === 'ConditionalCheckFailedException') {
      return createErrorResponse(404, 'Contractor not found or access denied');
    }

    if (error.message.includes('User ID not found') ||
        error.message.includes('Company ID not found')) {
      return createErrorResponse(401, 'Unauthorized: Invalid user context');
    }

    return createErrorResponse(500, 'Failed to delete contractor', error);
  }
}, {
  requiredPermission: 'contractors:delete'  // Require delete permission
});