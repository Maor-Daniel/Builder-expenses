// lambda/updateUser.js
// Update user role, permissions, and status within a company

const {
  createResponse,
  createErrorResponse,
  getCompanyContextFromEvent,
  getCurrentTimestamp,
  debugLog,
  dynamoOperation,
  COMPANY_TABLE_NAMES,
  USER_ROLES,
  ROLE_PERMISSIONS
} = require('./shared/company-utils');
const { withSecureCors } = require('./shared/cors-config');

const AWS = require('aws-sdk');
const cognito = new AWS.CognitoIdentityServiceProvider();

// Validate role change is allowed
async function validateRoleChange(companyId, targetUserId, newRole, currentAdminId) {
  // Check if target user exists in company
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

  const currentRole = userResult.Item.role;

  // Prevent removing the last admin
  if (currentRole === USER_ROLES.ADMIN && newRole !== USER_ROLES.ADMIN) {
    // Count remaining admins
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
      throw new Error('Cannot change role of the last admin. Please assign another admin first.');
    }
  }

  // Prevent users from demoting themselves
  if (targetUserId === currentAdminId && currentRole === USER_ROLES.ADMIN && newRole !== USER_ROLES.ADMIN) {
    throw new Error('Cannot demote yourself from admin role. Please have another admin change your role.');
  }

  return userResult.Item;
}

exports.handler = withSecureCors(async (event) => {

  // Handle CORS preflight
  // OPTIONS handling now in withSecureCors middleware

  if (event.httpMethod !== 'PUT') {
    return createErrorResponse(405, 'Method not allowed');
  }

  try {
    // Get company context from authenticated user
    const { companyId, userId: currentUserId, userRole } = getCompanyContextFromEvent(event);

    // Only admins can update user roles
    if (userRole !== USER_ROLES.ADMIN) {
      return createErrorResponse(403, 'Admin privileges required to update users');
    }

    // Get target user ID from path parameters
    const targetUserId = event.pathParameters?.userId;
    if (!targetUserId) {
      return createErrorResponse(400, 'User ID is required');
    }

    // Parse request body
    const body = JSON.parse(event.body || '{}');
    const {
      role: newRole,
      status: newStatus,
      permissions: customPermissions
    } = body;

    // Validate inputs
    if (newRole && !Object.values(USER_ROLES).includes(newRole)) {
      return createErrorResponse(400, 'Invalid role. Must be one of: ADMIN, MANAGER, EDITOR, VIEWER');
    }

    if (newStatus && !['active', 'inactive'].includes(newStatus)) {
      return createErrorResponse(400, 'Invalid status. Must be active or inactive');
    }


    // Validate the role change
    const currentUser = await validateRoleChange(companyId, targetUserId, newRole, currentUserId);

    // Build update expression
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};
    let valueCounter = 0;

    if (newRole) {
      updateExpressions.push(`#role = :val${valueCounter}`);
      expressionAttributeNames['#role'] = 'role';
      expressionAttributeValues[`:val${valueCounter}`] = newRole;
      valueCounter++;

      // Update permissions based on role
      const rolePermissions = ROLE_PERMISSIONS[newRole] || [];
      updateExpressions.push(`#permissions = :val${valueCounter}`);
      expressionAttributeNames['#permissions'] = 'permissions';
      expressionAttributeValues[`:val${valueCounter}`] = rolePermissions;
      valueCounter++;
    }

    if (newStatus) {
      updateExpressions.push(`#status = :val${valueCounter}`);
      expressionAttributeNames['#status'] = 'status';
      expressionAttributeValues[`:val${valueCounter}`] = newStatus;
      valueCounter++;
    }

    // Always update the lastModifiedBy and updatedAt
    updateExpressions.push(`lastModifiedBy = :val${valueCounter}`);
    expressionAttributeValues[`:val${valueCounter}`] = currentUserId;
    valueCounter++;

    updateExpressions.push(`updatedAt = :val${valueCounter}`);
    expressionAttributeValues[`:val${valueCounter}`] = getCurrentTimestamp();
    valueCounter++;

    // Apply custom permissions if provided (only for specific roles)
    if (customPermissions && Array.isArray(customPermissions)) {
      updateExpressions.push(`#permissions = :val${valueCounter}`);
      expressionAttributeNames['#permissions'] = 'permissions';
      expressionAttributeValues[`:val${valueCounter}`] = customPermissions;
      valueCounter++;
    }


    // Update user in DynamoDB
    const updateResult = await dynamoOperation('update', {
      TableName: COMPANY_TABLE_NAMES.USERS,
      Key: {
        companyId,
        userId: targetUserId
      },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW'
    });

    const updatedUser = updateResult.Attributes;

    // Update Cognito custom attributes if role changed
    if (newRole && newRole !== currentUser.role) {
      try {
        await cognito.adminUpdateUserAttributes({
          UserPoolId: process.env.USER_POOL_ID,
          Username: targetUserId,
          UserAttributes: [
            {
              Name: 'custom:role',
              Value: newRole
            }
          ]
        }).promise();

      } catch (cognitoError) {
        // Continue anyway - DynamoDB is source of truth
      }
    }

    // Disable/enable Cognito user if status changed
    if (newStatus && newStatus !== currentUser.status) {
      try {
        if (newStatus === 'inactive') {
          await cognito.adminDisableUser({
            UserPoolId: process.env.USER_POOL_ID,
            Username: targetUserId
          }).promise();
        } else if (newStatus === 'active') {
          await cognito.adminEnableUser({
            UserPoolId: process.env.USER_POOL_ID,
            Username: targetUserId
          }).promise();
        }

      } catch (cognitoError) {
        // Continue anyway - DynamoDB is source of truth
      }
    }


    return createResponse(200, {
      success: true,
      message: 'User updated successfully',
      user: {
        userId: updatedUser.userId,
        email: updatedUser.email,
        name: updatedUser.name,
        role: updatedUser.role,
        status: updatedUser.status,
        permissions: updatedUser.permissions || ROLE_PERMISSIONS[updatedUser.role] || [],
        updatedAt: updatedUser.updatedAt,
        lastModifiedBy: updatedUser.lastModifiedBy
      },
      changes: {
        roleChanged: newRole && newRole !== currentUser.role,
        statusChanged: newStatus && newStatus !== currentUser.status,
        oldRole: currentUser.role,
        newRole: updatedUser.role,
        oldStatus: currentUser.status,
        newStatus: updatedUser.status
      }
    });

  } catch (error) {

    if (error.message.includes('company context')) {
      return createErrorResponse(401, 'Authentication required');
    }

    if (error.message.includes('not found') || error.message.includes('last admin') || error.message.includes('demote yourself')) {
      return createErrorResponse(400, error.message);
    }

    return createErrorResponse(500, 'Failed to update user', {
      error: error.message
    });
  }
});
