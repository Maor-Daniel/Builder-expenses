// lambda/clerk-authorizer.js
// Lambda Authorizer for API Gateway to validate Clerk JWT tokens

const { verifyToken } = require('@clerk/backend');
const { DynamoDB } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocument } = require('@aws-sdk/lib-dynamodb');

const dynamodb = DynamoDBDocument.from(new DynamoDB({}));

/**
 * Lambda Authorizer handler
 * Validates Clerk JWT tokens and returns IAM policy for API Gateway
 */
exports.handler = async (event) => {
  console.log('Clerk Authorizer invoked');
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    // Extract token from Authorization header
    const token = event.authorizationToken?.replace('Bearer ', '');

    if (!token) {
      console.error('No authorization token provided');
      throw new Error('Unauthorized');
    }

    // Verify the token with Clerk
    console.log('Verifying token with Clerk...');
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY
    });

    console.log('Token verified successfully');
    console.log('Payload:', JSON.stringify(payload, null, 2));

    // Extract user information
    const userId = payload.sub;
    const orgId = payload.org_id || payload.org;
    const orgRole = payload.org_role;
    const email = payload.email;
    const userName = payload.name || payload.given_name || payload.first_name;

    // For backward compatibility, use orgId as companyId
    // If no organization, use user ID as company ID (single-user mode)
    const companyId = orgId || `user_${userId}`;

    // Get actual role from DynamoDB company-users table
    // This is the source of truth for user roles, not Clerk organizations
    let appRole = 'admin'; // Default for new users
    try {
      const userRole = await getUserRoleFromDB(companyId, userId);
      if (userRole) {
        appRole = userRole;
        console.log(`Found user role in DynamoDB: ${appRole}`);
      } else {
        console.log('No role found in DynamoDB - using default: admin');
      }
    } catch (error) {
      console.error('Error fetching user role from DynamoDB:', error);
      // Fallback to Clerk organization role if DB query fails
      appRole = mapClerkRoleToAppRole(orgRole);
      console.log(`DB query failed, falling back to Clerk role mapping: ${appRole}`);
    }

    console.log('User context:', {
      userId,
      companyId,
      email,
      role: appRole,
      orgId,
      orgRole
    });

    // Generate IAM policy
    const policy = generatePolicy(userId, 'Allow', event.methodArn, {
      userId,
      companyId,
      email,
      userName,
      role: appRole,
      orgId: orgId || '',
      orgRole: orgRole || '',
      // Add plan info if available in token
      plan: payload.plan || 'free',
      features: JSON.stringify(payload.features || [])
    });

    console.log('Generated policy:', JSON.stringify(policy, null, 2));
    return policy;

  } catch (error) {
    console.error('Authorization failed:', error);
    console.error('Error details:', error.message, error.stack);

    // Return Unauthorized
    throw new Error('Unauthorized');
  }
};

/**
 * Get user role from DynamoDB company-users table
 */
async function getUserRoleFromDB(companyId, userId) {
  try {
    const result = await dynamodb.get({
      TableName: process.env.COMPANY_USERS_TABLE || 'company-users',
      Key: {
        companyId,
        userId
      }
    });

    return result.Item?.role || null;
  } catch (error) {
    console.error('DynamoDB query error:', error);
    return null;
  }
}

/**
 * Map Clerk organization roles to application roles
 */
function mapClerkRoleToAppRole(clerkRole) {
  if (!clerkRole) return 'admin';

  const roleMapping = {
    'org:admin': 'admin',
    'org:member': 'editor',
    'org:viewer': 'viewer',
    'admin': 'admin',
    'member': 'editor',
    'viewer': 'viewer',
    'owner': 'admin'
  };

  return roleMapping[clerkRole] || 'admin';
}

/**
 * Generate IAM policy document for API Gateway
 */
function generatePolicy(principalId, effect, resource, context = {}) {
  const authResponse = {
    principalId
  };

  if (effect && resource) {
    // Convert specific resource ARN to wildcard to allow access to all endpoints
    // e.g., arn:aws:execute-api:us-east-1:702358134603:2woj5i92td/prod/GET/expenses
    // becomes arn:aws:execute-api:us-east-1:702358134603:2woj5i92td/prod/*
    const wildcardResource = resource.split('/').slice(0, 2).join('/') + '/*';

    const policyDocument = {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: effect,
          Resource: wildcardResource
        }
      ]
    };
    authResponse.policyDocument = policyDocument;
  }

  // Add user context to be passed to Lambda functions
  // API Gateway will add this to event.requestContext.authorizer
  authResponse.context = {};

  // Convert all context values to strings (API Gateway requirement)
  Object.keys(context).forEach(key => {
    authResponse.context[key] = String(context[key] || '');
  });

  return authResponse;
}
