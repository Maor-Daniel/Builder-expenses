// lambda/removeUser.js
// Remove a user from a company (soft delete by setting status to inactive)

const {
  createResponse,
  createErrorResponse,
  getCompanyContextFromEvent,
  getCurrentTimestamp,
  debugLog,
  dynamoOperation,
  COMPANY_TABLE_NAMES,
  USER_ROLES
} = require('./shared/company-utils');
const { createLogger } = require('./shared/logger');
const logger = createLogger('removeUser');

const {
  decrementUserCounter
} = require('./shared/limit-checker');
const { withSecureCors } = require('./shared/cors-config');

// AWS SDK v3 - modular imports for smaller bundle size
const { CognitoIdentityProviderClient, AdminDisableUserCommand } = require('@aws-sdk/client-cognito-identity-provider');
const cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION || 'us-east-1' });

// Validate user can be removed
async function validateUserRemoval(companyId, targetUserId, currentAdminId) {
  // Get target user
  const userResult = await dynamoOperation('get', {
    TableName: COMPANY_TABLE_NAMES.USERS,
    Key: {
      companyId,
      userId: targetUserId
    }
  });

  if (!userResult.Item) {
    throw new Error('User not found in company');
  }

  const targetUser = userResult.Item;

  // Prevent removing yourself
  if (targetUserId === currentAdminId) {
    throw new Error('Cannot remove yourself from the company. Please have another admin remove you or transfer ownership first.');
  }

  // If removing an admin, check if they're the last admin
  if (targetUser.role === USER_ROLES.ADMIN) {
    const usersResult = await dynamoOperation('query', {
      TableName: COMPANY_TABLE_NAMES.USERS,
      KeyConditionExpression: 'companyId = :cid',
      FilterExpression: '#role = :adminRole AND #status = :activeStatus',
      ExpressionAttributeNames: {
        '#role': 'role',
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':cid': companyId,
        ':adminRole': USER_ROLES.ADMIN,
        ':activeStatus': 'active'
      }
    });

    const activeAdmins = usersResult.Items || [];
    if (activeAdmins.length <= 1) {
      throw new Error('Cannot remove the last admin. Please assign another admin first.');
    }
  }

  return targetUser;
}

// Count user's data ownership
async function getUserDataCount(companyId, userId) {
  const counts = {
    projects: 0,
    contractors: 0,
    works: 0,
    expenses: 0
  };

  try {
    // Count projects created by user
    const projectsResult = await dynamoOperation('query', {
      TableName: 'construction-expenses-company-projects',
      KeyConditionExpression: 'companyId = :cid',
      FilterExpression: 'createdBy = :uid',
      ExpressionAttributeValues: {
        ':cid': companyId,
        ':uid': userId
      },
      Select: 'COUNT'
    });
    counts.projects = projectsResult.Count || 0;

    // Count contractors created by user
    const contractorsResult = await dynamoOperation('query', {
      TableName: 'construction-expenses-company-contractors',
      KeyConditionExpression: 'companyId = :cid',
      FilterExpression: 'createdBy = :uid',
      ExpressionAttributeValues: {
        ':cid': companyId,
        ':uid': userId
      },
      Select: 'COUNT'
    });
    counts.contractors = contractorsResult.Count || 0;

    // Count works created by user
    const worksResult = await dynamoOperation('query', {
      TableName: 'construction-expenses-company-works',
      KeyConditionExpression: 'companyId = :cid',
      FilterExpression: 'createdBy = :uid',
      ExpressionAttributeValues: {
        ':cid': companyId,
        ':uid': userId
      },
      Select: 'COUNT'
    });
    counts.works = worksResult.Count || 0;

    // Count expenses created by user
    const expensesResult = await dynamoOperation('query', {
      TableName: 'construction-expenses-company-expenses',
      KeyConditionExpression: 'companyId = :cid',
      FilterExpression: 'createdBy = :uid',
      ExpressionAttributeValues: {
        ':cid': companyId,
        ':uid': userId
      },
      Select: 'COUNT'
    });
    counts.expenses = expensesResult.Count || 0;

  } catch (error) {
  }

  return counts;
}

exports.handler = withSecureCors(async (event) => {

  // Handle CORS preflight
  // OPTIONS handling now in withSecureCors middleware

  if (event.httpMethod !== 'DELETE') {
    return createErrorResponse(405, 'Method not allowed');
  }

  try {
    // Get company context from authenticated user
    const { companyId, userId: currentUserId, userRole } = getCompanyContextFromEvent(event);

    // Only admins can remove users
    if (userRole !== USER_ROLES.ADMIN) {
      return createErrorResponse(403, 'Admin privileges required to remove users');
    }

    // Get target user ID from path parameters OR body (for flexibility)
    let targetUserId = event.pathParameters?.userId;

    // If not in path, check body
    if (!targetUserId && event.body) {
      try {
        const body = JSON.parse(event.body);
        targetUserId = body.userId;
      } catch (e) {
        // Ignore parse errors
      }
    }

    if (!targetUserId) {
      return createErrorResponse(400, 'User ID is required');
    }

    // Parse query parameters
    const queryParams = event.queryStringParameters || {};
    const hardDelete = queryParams.hardDelete === 'true'; // Default is soft delete


    // Validate the removal
    const targetUser = await validateUserRemoval(companyId, targetUserId, currentUserId);

    // Get user's data count for response
    const dataCount = await getUserDataCount(companyId, targetUserId);
    const hasData = Object.values(dataCount).some(count => count > 0);

    if (hardDelete) {
      // Hard delete: completely remove user from company
      // WARNING: This should only be used if user data has been reassigned

      if (hasData) {
        return createErrorResponse(400,
          'Cannot hard delete user with existing data. Please reassign their data first or use soft delete.',
          { dataCount }
        );
      }


      // Delete from company-users table
      await dynamoOperation('delete', {
        TableName: COMPANY_TABLE_NAMES.USERS,
        Key: {
          companyId,
          userId: targetUserId
        }
      });

      // Decrement user counter for tier tracking
      await decrementUserCounter(companyId);

      // Optionally delete Cognito user (commented out for safety)
      // await cognito.adminDeleteUser({
      //   UserPoolId: process.env.USER_POOL_ID,
      //   Username: targetUserId
      // }).promise();


      return createResponse(200, {
        success: true,
        message: 'User permanently removed from company',
        userId: targetUserId,
        email: targetUser.email,
        deletionType: 'hard'
      });

    } else {
      // Soft delete: set status to inactive
      // This preserves data relationships and audit trail


      // Update user status to inactive
      const updateResult = await dynamoOperation('update', {
        TableName: COMPANY_TABLE_NAMES.USERS,
        Key: {
          companyId,
          userId: targetUserId
        },
        UpdateExpression: 'SET #status = :inactive, removedBy = :adminId, removedAt = :timestamp, updatedAt = :timestamp',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':inactive': 'inactive',
          ':adminId': currentUserId,
          ':timestamp': getCurrentTimestamp()
        },
        ReturnValues: 'ALL_NEW'
      });

      // Decrement user counter for tier tracking
      await decrementUserCounter(companyId);

      // Disable user in Cognito (they can't login anymore)
      try {
        const disableCommand = new AdminDisableUserCommand({
          UserPoolId: process.env.USER_POOL_ID,
          Username: targetUserId
        });
        await cognito.send(disableCommand);

      } catch (cognitoError) {
        // Continue anyway - DynamoDB status is what matters
      }


      return createResponse(200, {
        success: true,
        message: 'User removed from company (inactive status)',
        userId: targetUserId,
        email: targetUser.email,
        name: targetUser.name,
        deletionType: 'soft',
        dataOwnership: {
          hasData,
          counts: dataCount,
          note: hasData ? 'User\'s data remains in the system and is still accessible' : 'User had no data'
        },
        user: updateResult.Attributes
      });
    }

  } catch (error) {

    if (error.message.includes('company context')) {
      return createErrorResponse(401, 'Authentication required');
    }

    if (error.message.includes('not found') ||
        error.message.includes('last admin') ||
        error.message.includes('Cannot remove yourself')) {
      return createErrorResponse(400, error.message);
    }

    return createErrorResponse(500, 'Failed to remove user', {
      error: error.message
    });
  }
});
