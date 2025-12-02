// lambda/shared/clerk-auth.js
// Clerk authentication middleware for Lambda functions

const { ClerkBackend } = require('@clerk/backend');
const { getSecret } = require('./secrets');
const { createOptionsResponse, getOriginFromEvent, createCorsResponse } = require('./cors-config');

// Clerk instance cache (initialized on first use)
let clerkInstance = null;
let clerkInitPromise = null;

/**
 * Initialize Clerk backend with secret from AWS Secrets Manager
 * @returns {Promise<ClerkBackend>} Initialized Clerk instance
 */
async function getClerkInstance() {
  // Return cached instance if available
  if (clerkInstance) {
    return clerkInstance;
  }

  // If initialization is in progress, wait for it
  if (clerkInitPromise) {
    return clerkInitPromise;
  }

  // Start initialization
  clerkInitPromise = (async () => {
    try {
      // Fetch Clerk secret key from AWS Secrets Manager
      const secretKey = await getSecret('clerk/secret-key');

      // Initialize Clerk backend
      clerkInstance = ClerkBackend({
        secretKey
      });

      console.log('Clerk backend initialized successfully with secret from Secrets Manager');
      return clerkInstance;

    } catch (error) {
      console.error('Failed to initialize Clerk backend:', error);
      // Reset promise so next call will retry
      clerkInitPromise = null;
      throw error;
    }
  })();

  return clerkInitPromise;
}

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

    // Get initialized Clerk instance
    const clerk = await getClerkInstance();

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
  const userContext = await verifyClerkToken(event);
  return userContext.userId;
}

/**
 * Get company context from Lambda event
 * @param {Object} event - Lambda event object
 * @returns {string} Company ID
 */
async function getCompanyIdFromEvent(event) {
  const userContext = await verifyClerkToken(event);
  return userContext.companyId;
}

/**
 * Get full user context from Lambda event
 * @param {Object} event - Lambda event object
 * @returns {Object} Complete user context
 */
async function getUserContextFromEvent(event) {
  return await verifyClerkToken(event);
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
    const origin = getOriginFromEvent(event);

    try {
      // Handle CORS preflight with secure CORS configuration
      if (event.httpMethod === 'OPTIONS') {
        return createOptionsResponse(origin);
      }

      // Verify authentication
      const userContext = await getUserContextFromEvent(event);

      // Check permission if specified
      if (options.requiredPermission) {
        if (!hasPermission(userContext, options.requiredPermission)) {
          return createCorsResponse(
            403,
            {
              error: 'Forbidden',
              message: `Missing required permission: ${options.requiredPermission}`
            },
            origin
          );
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
        return createCorsResponse(
          401,
          {
            error: 'Unauthorized',
            message: error.message
          },
          origin
        );
      }

      // Re-throw other errors to be handled by the handler
      throw error;
    }
  };
}

module.exports = {
  getClerkInstance,
  verifyClerkToken,
  getUserIdFromEvent,
  getCompanyIdFromEvent,
  getUserContextFromEvent,
  hasPermission,
  withClerkAuth,
  mapClerkRoleToAppRole
};