// lambda/listUsers.js
// List all users in a company with their roles, status, and activity

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
const logger = createLogger('listUsers');
const { withSecureCors } = require('./shared/cors-config');

// AWS SDK v3 - modular imports for smaller bundle size
const { CognitoIdentityProviderClient, AdminGetUserCommand } = require('@aws-sdk/client-cognito-identity-provider');
const cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION || 'us-east-1' });

exports.handler = withSecureCors(async (event) => {

  // Handle CORS preflight
  // OPTIONS handling now in withSecureCors middleware

  if (event.httpMethod !== 'GET') {
    return createErrorResponse(405, 'Method not allowed');
  }

  try {
    // DEBUG: Log the full authorizer context to understand permission issues
    console.log('[listUsers] event.requestContext.authorizer:', JSON.stringify(event.requestContext?.authorizer, null, 2));

    // Get company context from authenticated user
    const { companyId, userId, userRole } = getCompanyContextFromEvent(event);

    // DEBUG: Log extracted values
    console.log('[listUsers] Extracted context:', { companyId, userId, userRole });
    console.log('[listUsers] USER_ROLES.ADMIN:', USER_ROLES.ADMIN, '| USER_ROLES.MANAGER:', USER_ROLES.MANAGER);
    console.log('[listUsers] Role check result:', [USER_ROLES.ADMIN, USER_ROLES.MANAGER].includes(userRole));

    // Only admins and managers can view the full user list
    if (![USER_ROLES.ADMIN, USER_ROLES.MANAGER].includes(userRole)) {
      console.log('[listUsers] ACCESS DENIED - userRole:', userRole, 'is not admin or manager');
      return createErrorResponse(403, 'Admin or Manager privileges required to view users');
    }

    console.log('[listUsers] ACCESS GRANTED - proceeding with user list');

    // Parse query parameters for filtering and sorting
    const queryParams = event.queryStringParameters || {};
    const {
      role,
      status,
      sortBy = 'joinedAt',
      sortOrder = 'desc',
      limit = 50,
      offset = 0
    } = queryParams;


    // Query company users from DynamoDB
    const queryResult = await dynamoOperation('query', {
      TableName: COMPANY_TABLE_NAMES.USERS,
      KeyConditionExpression: 'companyId = :cid',
      ExpressionAttributeValues: {
        ':cid': companyId
      }
    });

    let users = queryResult.Items || [];

    // Apply filters
    if (role) {
      users = users.filter(u => u.role === role.toUpperCase());
    }

    // Filter by status - by default, exclude inactive (soft-deleted) users
    // Pass ?status=all to include inactive users, or ?status=inactive to see only inactive
    if (status === 'all') {
      // Show all users including inactive
    } else if (status) {
      users = users.filter(u => u.status === status.toLowerCase());
    } else {
      // Default: exclude inactive users (soft-deleted)
      users = users.filter(u => u.status !== 'inactive');
    }

    // Enrich users with additional data from Cognito (optional - for names/emails)
    const enrichedUsers = await Promise.all(
      users.map(async (user) => {
        try {
          // Get user details from Cognito for the most up-to-date info
          const command = new AdminGetUserCommand({
            UserPoolId: process.env.USER_POOL_ID,
            Username: user.userId
          });
          const cognitoUser = await cognito.send(command);

          // Extract attributes
          const attributes = {};
          cognitoUser.UserAttributes.forEach(attr => {
            attributes[attr.Name] = attr.Value;
          });

          return {
            ...user,
            email: attributes.email || user.email,
            name: attributes.name || attributes.given_name || user.name || 'Unnamed User',
            emailVerified: attributes.email_verified === 'true',
            cognitoStatus: cognitoUser.UserStatus,
            enabled: cognitoUser.Enabled,
            lastModified: cognitoUser.UserLastModifiedDate
          };
        } catch (error) {
          // If Cognito lookup fails, return DynamoDB data only
          return {
            ...user,
            name: user.name || user.email || 'Unknown User'
          };
        }
      })
    );

    // Sort users
    enrichedUsers.sort((a, b) => {
      let aVal = a[sortBy];
      let bVal = b[sortBy];

      // Handle date strings
      if (sortBy.includes('At') || sortBy === 'lastLogin') {
        aVal = new Date(aVal || 0).getTime();
        bVal = new Date(bVal || 0).getTime();
      }

      if (sortOrder === 'asc') {
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      } else {
        return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
      }
    });

    // Apply pagination
    const paginatedUsers = enrichedUsers.slice(
      parseInt(offset),
      parseInt(offset) + parseInt(limit)
    );

    // Calculate statistics
    const stats = {
      totalUsers: enrichedUsers.length,
      activeUsers: enrichedUsers.filter(u => u.status === 'active').length,
      pendingUsers: enrichedUsers.filter(u => u.status === 'pending').length,
      inactiveUsers: enrichedUsers.filter(u => u.status === 'inactive').length,
      byRole: {
        admin: enrichedUsers.filter(u => u.role === USER_ROLES.ADMIN).length,
        manager: enrichedUsers.filter(u => u.role === USER_ROLES.MANAGER).length,
        editor: enrichedUsers.filter(u => u.role === USER_ROLES.EDITOR).length,
        viewer: enrichedUsers.filter(u => u.role === USER_ROLES.VIEWER).length
      }
    };


    return createResponse(200, {
      success: true,
      users: paginatedUsers,
      stats,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: enrichedUsers.length,
        hasMore: parseInt(offset) + parseInt(limit) < enrichedUsers.length
      }
    });

  } catch (error) {

    if (error.message.includes('company context')) {
      return createErrorResponse(401, 'Authentication required');
    }

    return createErrorResponse(500, 'Failed to retrieve users', {
      error: error.message
    });
  }
});
