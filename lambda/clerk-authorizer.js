// lambda/clerk-authorizer.js
// Lambda Authorizer for API Gateway to validate Clerk JWT tokens

const { verifyToken } = require('@clerk/backend');
const { DynamoDB } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocument } = require('@aws-sdk/lib-dynamodb');

const dynamodb = DynamoDBDocument.from(new DynamoDB({}));

// Import secrets manager utility
const { getSecret } = require('./shared/secrets');

// Cache for Clerk secret key
let clerkSecretKey = null;

// Environment configuration with defaults
const JWT_CONFIG = {
  maxTokenAge: parseInt(process.env.JWT_MAX_TOKEN_AGE || '3600', 10), // 1 hour default
  expiryGracePeriod: parseInt(process.env.JWT_EXPIRY_GRACE_PERIOD || '30', 10), // 30 seconds default
  expectedAudience: process.env.JWT_EXPECTED_AUDIENCE || null // Optional audience validation
};

/**
 * Security event logger for CloudWatch
 */
function logSecurityEvent(eventType, details, severity = 'INFO') {
  const logEntry = {
    timestamp: new Date().toISOString(),
    eventType,
    severity,
    ...details
  };

  if (severity === 'ERROR' || severity === 'WARN') {
    console.error(`[SECURITY-${severity}]`, JSON.stringify(logEntry));
  } else {
    console.log(`[SECURITY-${severity}]`, JSON.stringify(logEntry));
  }

  return logEntry;
}

/**
 * Enhanced JWT validation with explicit checks
 * Validates exp, nbf, iat, token freshness, and audience
 */
function validateTokenClaims(payload, token) {
  const now = Math.floor(Date.now() / 1000); // Current time in seconds
  const validationResults = {
    isValid: true,
    errors: [],
    warnings: [],
    metadata: {}
  };

  // 1. Validate expiration (exp) with grace period
  if (typeof payload.exp === 'number') {
    const expiryWithGrace = payload.exp + JWT_CONFIG.expiryGracePeriod;
    if (now > expiryWithGrace) {
      validationResults.isValid = false;
      validationResults.errors.push({
        code: 'TOKEN_EXPIRED',
        message: `Token expired at ${new Date(payload.exp * 1000).toISOString()}`,
        expiredAt: payload.exp,
        currentTime: now,
        gracePeriod: JWT_CONFIG.expiryGracePeriod
      });

      logSecurityEvent('TOKEN_EXPIRED', {
        expiredAt: new Date(payload.exp * 1000).toISOString(),
        currentTime: new Date(now * 1000).toISOString(),
        userId: payload.sub,
        tokenAge: now - (payload.iat || now)
      }, 'WARN');
    } else if (now > payload.exp) {
      // Within grace period
      validationResults.warnings.push({
        code: 'TOKEN_EXPIRED_GRACE_PERIOD',
        message: 'Token expired but within grace period',
        expiredAt: payload.exp,
        gracePeriodRemaining: expiryWithGrace - now
      });

      logSecurityEvent('TOKEN_GRACE_PERIOD', {
        expiredAt: new Date(payload.exp * 1000).toISOString(),
        gracePeriodRemaining: expiryWithGrace - now,
        userId: payload.sub
      }, 'INFO');
    }

    validationResults.metadata.expiresAt = payload.exp;
    validationResults.metadata.timeUntilExpiry = payload.exp - now;
  } else {
    validationResults.warnings.push({
      code: 'MISSING_EXP_CLAIM',
      message: 'Token does not contain exp claim'
    });
  }

  // 2. Validate not-before time (nbf)
  if (typeof payload.nbf === 'number' && now < payload.nbf) {
    validationResults.isValid = false;
    validationResults.errors.push({
      code: 'TOKEN_NOT_YET_VALID',
      message: `Token not valid until ${new Date(payload.nbf * 1000).toISOString()}`,
      notBefore: payload.nbf,
      currentTime: now
    });

    logSecurityEvent('TOKEN_NOT_YET_VALID', {
      notBefore: new Date(payload.nbf * 1000).toISOString(),
      currentTime: new Date(now * 1000).toISOString(),
      userId: payload.sub
    }, 'ERROR');
  }

  // 3. Validate issued-at time (iat) - detect future tokens
  if (typeof payload.iat === 'number') {
    const clockSkewTolerance = 60; // 60 seconds tolerance for clock skew
    if (payload.iat > now + clockSkewTolerance) {
      validationResults.isValid = false;
      validationResults.errors.push({
        code: 'TOKEN_ISSUED_IN_FUTURE',
        message: `Token issued in the future: ${new Date(payload.iat * 1000).toISOString()}`,
        issuedAt: payload.iat,
        currentTime: now,
        clockSkewTolerance
      });

      logSecurityEvent('TOKEN_ISSUED_IN_FUTURE', {
        issuedAt: new Date(payload.iat * 1000).toISOString(),
        currentTime: new Date(now * 1000).toISOString(),
        userId: payload.sub
      }, 'ERROR');
    }

    validationResults.metadata.issuedAt = payload.iat;
    validationResults.metadata.tokenAge = now - payload.iat;
  } else {
    validationResults.warnings.push({
      code: 'MISSING_IAT_CLAIM',
      message: 'Token does not contain iat claim'
    });
  }

  // 4. Validate token freshness (max age)
  if (typeof payload.iat === 'number' && JWT_CONFIG.maxTokenAge > 0) {
    const tokenAge = now - payload.iat;
    if (tokenAge > JWT_CONFIG.maxTokenAge) {
      validationResults.warnings.push({
        code: 'TOKEN_TOO_OLD',
        message: `Token age (${tokenAge}s) exceeds maximum allowed age (${JWT_CONFIG.maxTokenAge}s)`,
        tokenAge,
        maxTokenAge: JWT_CONFIG.maxTokenAge,
        issuedAt: payload.iat
      });

      logSecurityEvent('TOKEN_FRESHNESS_WARNING', {
        tokenAge,
        maxTokenAge: JWT_CONFIG.maxTokenAge,
        issuedAt: new Date(payload.iat * 1000).toISOString(),
        userId: payload.sub
      }, 'WARN');
    }

    validationResults.metadata.tokenFreshness = tokenAge <= JWT_CONFIG.maxTokenAge;
  }

  // 5. Validate audience (aud) if configured
  if (JWT_CONFIG.expectedAudience) {
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audiences.includes(JWT_CONFIG.expectedAudience)) {
      validationResults.isValid = false;
      validationResults.errors.push({
        code: 'INVALID_AUDIENCE',
        message: `Token audience does not match expected audience`,
        expectedAudience: JWT_CONFIG.expectedAudience,
        receivedAudiences: audiences
      });

      logSecurityEvent('INVALID_AUDIENCE', {
        expectedAudience: JWT_CONFIG.expectedAudience,
        receivedAudiences: audiences,
        userId: payload.sub
      }, 'ERROR');
    }

    validationResults.metadata.audience = audiences;
  }

  return validationResults;
}

/**
 * Lambda Authorizer handler
 * Validates Clerk JWT tokens and returns IAM policy for API Gateway
 */
exports.handler = async (event) => {
  const requestId = event.requestContext?.requestId || 'unknown';

  logSecurityEvent('AUTHORIZATION_REQUEST', {
    requestId,
    methodArn: event.methodArn
  }, 'INFO');

  try {
    // Extract token from Authorization header
    const token = event.authorizationToken?.replace('Bearer ', '');

    if (!token) {
      logSecurityEvent('AUTHORIZATION_FAILED', {
        requestId,
        reason: 'NO_TOKEN_PROVIDED'
      }, 'WARN');
      throw new Error('Unauthorized');
    }

    // Fetch Clerk secret key from AWS Secrets Manager (cached)
    if (!clerkSecretKey) {
      console.log('Fetching Clerk secret key from AWS Secrets Manager...');
      clerkSecretKey = await getSecret('clerk/secret-key');
    }

    // Verify the token with Clerk (signature verification)
    console.log('Verifying token with Clerk...');
    const payload = await verifyToken(token, {
      secretKey: clerkSecretKey
    });

    console.log('Token signature verified successfully');
    console.log('Payload:', JSON.stringify(payload, null, 2));

    // Perform enhanced JWT validation
    const validationResults = validateTokenClaims(payload, token);

    // Log validation metadata
    console.log('Token validation metadata:', JSON.stringify(validationResults.metadata, null, 2));

    // Log any warnings (non-blocking)
    if (validationResults.warnings.length > 0) {
      console.warn('Token validation warnings:', JSON.stringify(validationResults.warnings, null, 2));
    }

    // Reject if validation failed
    if (!validationResults.isValid) {
      logSecurityEvent('AUTHORIZATION_FAILED', {
        requestId,
        reason: 'TOKEN_VALIDATION_FAILED',
        errors: validationResults.errors,
        userId: payload.sub
      }, 'ERROR');

      console.error('Token validation failed:', JSON.stringify(validationResults.errors, null, 2));
      throw new Error('Unauthorized');
    }

    // Log successful authentication with metadata
    logSecurityEvent('AUTHORIZATION_SUCCESS', {
      requestId,
      userId: payload.sub,
      tokenAge: validationResults.metadata.tokenAge,
      tokenFreshness: validationResults.metadata.tokenFreshness,
      timeUntilExpiry: validationResults.metadata.timeUntilExpiry,
      warningCount: validationResults.warnings.length
    }, 'INFO');

    // Extract user information
    const userId = payload.sub;
    const orgId = payload.org_id || payload.org;
    const orgRole = payload.org_role;
    const email = payload.email;
    const userName = payload.name || payload.given_name || payload.first_name;

    // For backward compatibility, use orgId as companyId
    // If no organization, use user ID as company ID (single-user mode)
    const companyId = orgId || userId;

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

    // Generate IAM policy with enhanced context
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
      features: JSON.stringify(payload.features || []),
      // Add token metadata to context for downstream Lambda functions
      tokenAge: String(validationResults.metadata.tokenAge || '0'),
      tokenFreshness: String(validationResults.metadata.tokenFreshness || 'true'),
      tokenIssuedAt: String(validationResults.metadata.issuedAt || '0'),
      tokenExpiresAt: String(validationResults.metadata.expiresAt || '0')
    });

    console.log('Generated policy:', JSON.stringify(policy, null, 2));
    return policy;

  } catch (error) {
    console.error('Authorization failed:', error);
    console.error('Error details:', error.message, error.stack);

    // Log authentication failure
    logSecurityEvent('AUTHORIZATION_FAILED', {
      requestId,
      reason: 'EXCEPTION',
      errorMessage: error.message,
      errorType: error.name
    }, 'ERROR');

    // Return Unauthorized
    throw new Error('Unauthorized');
  }
};

/**
 * Export validation function for testing
 */
exports.validateTokenClaims = validateTokenClaims;
exports.logSecurityEvent = logSecurityEvent;
exports.JWT_CONFIG = JWT_CONFIG;

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
