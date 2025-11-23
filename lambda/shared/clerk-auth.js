// lambda/shared/clerk-auth.js
// Clerk authentication middleware for Lambda functions

const { ClerkBackend } = require('@clerk/backend');

// Initialize Clerk backend
const clerk = ClerkBackend({
  secretKey: process.env.CLERK_SECRET_KEY || process.env.REACT_APP_CLERK_SECRET_KEY,
});

/**
 * Verify Clerk JWT token and extract user/company information
 * @param {Object} event - Lambda event object
 * @returns {Object} User and company information
 */
async function verifyClerkToken(event) {
  try {
    // Get the authorization header
    const authHeader = event.headers?.Authorization || event.headers?.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new Error('Missing or invalid authorization header');
    }

    // Extract the token
    const token = authHeader.replace('Bearer ', '');

    // Verify the JWT token with Clerk
    const sessionClaims = await clerk.verifyToken(token);

    if (!sessionClaims) {
      throw new Error('Invalid token');
    }

    // Extract user and organization (company) information
    const userId = sessionClaims.sub; // Subject is the user ID
    const orgId = sessionClaims.org_id || sessionClaims.organization_id;
    const orgRole = sessionClaims.org_role || sessionClaims.organization_role;
    const userEmail = sessionClaims.email;
    const userName = sessionClaims.name || sessionClaims.given_name;

    // For backward compatibility, we'll use orgId as companyId
    const companyId = orgId || 'default-company';

    return {
      userId,
      companyId,
      email: userEmail,
      name: userName,
      role: mapClerkRoleToAppRole(orgRole),
      organizationId: orgId,
      organizationRole: orgRole,
      isAuthenticated: true
    };
  } catch (error) {
    console.error('Clerk token verification failed:', error);
    throw error;
  }
}

/**
 * Map Clerk organization roles to our application roles
 * @param {string} clerkRole - Clerk organization role
 * @returns {string} Application role
 */
function mapClerkRoleToAppRole(clerkRole) {
  const roleMapping = {
    'org:admin': 'ADMIN',
    'org:member': 'EDITOR',
    'org:viewer': 'VIEWER',
    'admin': 'ADMIN',
    'member': 'EDITOR',
    'viewer': 'VIEWER'
  };

  return roleMapping[clerkRole] || 'VIEWER';
}

/**
 * Get user context from Lambda event
 * Compatible with existing getUserIdFromEvent function
 * @param {Object} event - Lambda event object
 * @returns {string} User ID
 */
async function getUserIdFromEvent(event) {
  try {
    const userContext = await verifyClerkToken(event);
    return userContext.userId;
  } catch (error) {
    // For backward compatibility during migration
    if (process.env.ALLOW_DEFAULT_USER === 'true') {
      return 'default-user';
    }
    throw new Error('User ID not found in request context');
  }
}

/**
 * Get company context from Lambda event
 * @param {Object} event - Lambda event object
 * @returns {string} Company ID
 */
async function getCompanyIdFromEvent(event) {
  try {
    const userContext = await verifyClerkToken(event);
    return userContext.companyId;
  } catch (error) {
    // For backward compatibility during migration
    if (process.env.ALLOW_DEFAULT_COMPANY === 'true') {
      return 'default-company';
    }
    throw new Error('Company ID not found in request context');
  }
}

/**
 * Get full user context from Lambda event
 * @param {Object} event - Lambda event object
 * @returns {Object} Complete user context
 */
async function getUserContextFromEvent(event) {
  try {
    return await verifyClerkToken(event);
  } catch (error) {
    // For backward compatibility during migration
    if (process.env.ALLOW_DEFAULT_USER === 'true') {
      return {
        userId: 'default-user',
        companyId: 'default-company',
        email: 'default@example.com',
        name: 'Default User',
        role: 'ADMIN',
        isAuthenticated: false
      };
    }
    throw error;
  }
}

/**
 * Check if user has required permission
 * @param {Object} userContext - User context object
 * @param {string} permission - Required permission
 * @returns {boolean} Has permission
 */
function hasPermission(userContext, permission) {
  const rolePermissions = {
    'ADMIN': [
      'company:read', 'company:update', 'company:delete',
      'users:read', 'users:create', 'users:update', 'users:delete',
      'projects:read', 'projects:create', 'projects:update', 'projects:delete',
      'contractors:read', 'contractors:create', 'contractors:update', 'contractors:delete',
      'works:read', 'works:create', 'works:update', 'works:delete',
      'expenses:read', 'expenses:create', 'expenses:update', 'expenses:delete',
      'subscription:read', 'subscription:update',
      'reports:read', 'reports:export'
    ],
    'MANAGER': [
      'company:read',
      'users:read', 'users:create',
      'projects:read', 'projects:create', 'projects:update',
      'contractors:read', 'contractors:create', 'contractors:update',
      'works:read', 'works:create', 'works:update',
      'expenses:read', 'expenses:create', 'expenses:update', 'expenses:delete',
      'reports:read', 'reports:export'
    ],
    'EDITOR': [
      'company:read',
      'projects:read', 'projects:create',
      'contractors:read', 'contractors:create',
      'works:read', 'works:create',
      'expenses:read', 'expenses:create', 'expenses:update',
      'reports:read'
    ],
    'VIEWER': [
      'company:read',
      'projects:read',
      'contractors:read',
      'works:read',
      'expenses:read',
      'reports:read'
    ]
  };

  const userPermissions = rolePermissions[userContext.role] || [];
  return userPermissions.includes(permission);
}

/**
 * Create an auth middleware wrapper for Lambda handlers
 * @param {Function} handler - Lambda handler function
 * @param {Object} options - Middleware options
 * @returns {Function} Wrapped handler
 */
function withClerkAuth(handler, options = {}) {
  return async (event, context) => {
    try {
      // Handle CORS preflight
      if (event.httpMethod === 'OPTIONS') {
        return {
          statusCode: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization',
            'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
          },
          body: JSON.stringify({ message: 'CORS preflight' })
        };
      }

      // Verify authentication
      const userContext = await getUserContextFromEvent(event);

      // Check permission if specified
      if (options.requiredPermission) {
        if (!hasPermission(userContext, options.requiredPermission)) {
          return {
            statusCode: 403,
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              error: 'Forbidden',
              message: `Missing required permission: ${options.requiredPermission}`
            })
          };
        }
      }

      // Add user context to event
      event.userContext = userContext;

      // Call the actual handler
      return await handler(event, context);

    } catch (error) {
      console.error('Authentication error:', error);

      if (error.message.includes('User ID not found') ||
          error.message.includes('Invalid token') ||
          error.message.includes('Missing or invalid authorization')) {
        return {
          statusCode: 401,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            error: 'Unauthorized',
            message: error.message
          })
        };
      }

      // Re-throw other errors to be handled by the handler
      throw error;
    }
  };
}

module.exports = {
  verifyClerkToken,
  getUserIdFromEvent,
  getCompanyIdFromEvent,
  getUserContextFromEvent,
  hasPermission,
  withClerkAuth,
  mapClerkRoleToAppRole
};