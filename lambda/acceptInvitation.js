// lambda/acceptInvitation.js
// Accept invitation and link Clerk user to company
// Updated to work with Clerk authentication instead of Cognito

const {
  createResponse,
  createErrorResponse,
  getCurrentTimestamp,
  dynamoOperation,
  COMPANY_TABLE_NAMES
} = require('./shared/company-utils');
const { createLogger } = require('./shared/logger');
const logger = createLogger('acceptInvitation');

const {
  incrementUserCounter
} = require('./shared/limit-checker');
const { withSecureCors } = require('./shared/cors-config');

/**
 * Validate invitation token
 * Searches by both invitationId and token field for compatibility
 */
async function validateInvitationToken(token) {
  console.log('validateInvitationToken - looking for token:', token);

  // Search for invitation by token field or invitationId
  const scanResult = await dynamoOperation('scan', {
    TableName: COMPANY_TABLE_NAMES.INVITATIONS,
    FilterExpression: '(invitationId = :token OR #tokenField = :token) AND #status = :status',
    ExpressionAttributeNames: {
      '#status': 'status',
      '#tokenField': 'token'
    },
    ExpressionAttributeValues: {
      ':token': token,
      ':status': 'pending'  // Database stores lowercase status
    }
  });

  console.log('validateInvitationToken - found items:', scanResult.Items?.length || 0);

  if (!scanResult.Items || scanResult.Items.length === 0) {
    console.log('validateInvitationToken - no pending invitation found for token');
    throw new Error('Invalid or expired invitation token');
  }

  const invitation = scanResult.Items[0];
  console.log('validateInvitationToken - invitation found:', {
    email: invitation.email,
    status: invitation.status,
    expiresAt: invitation.expiresAt
  });

  // Check if invitation has expired
  if (new Date(invitation.expiresAt) < new Date()) {
    console.log('validateInvitationToken - invitation has expired');
    throw new Error('Invitation has expired');
  }

  return invitation;
}

/**
 * Get user info from Clerk authorizer context
 * For invitation acceptance, we need userId and email
 */
function getClerkUserFromEvent(event) {
  const authorizer = event.requestContext?.authorizer;

  if (!authorizer) {
    throw new Error('Authentication required - please sign in first');
  }

  const userId = authorizer.userId;
  const email = authorizer.email;
  const userName = authorizer.userName || authorizer.name || '';

  if (!userId) {
    throw new Error('Invalid authentication - user ID not found');
  }

  return { userId, email, userName };
}

exports.handler = withSecureCors(async (event) => {
  try {
    // GET: Validate invitation token (no auth required for public check)
    if (event.httpMethod === 'GET') {
      const queryParams = event.queryStringParameters || {};
      // Support both ?token= and ?invitation= parameter names for compatibility
      const invitationToken = queryParams.token || queryParams.invitation;

      console.log('GET /acceptInvitation - queryParams:', JSON.stringify(queryParams));
      console.log('GET /acceptInvitation - token:', invitationToken);

      if (!invitationToken) {
        return createErrorResponse(400, 'Invitation token is required');
      }

      try {
        const invitation = await validateInvitationToken(invitationToken);

        // Get company info
        const companyResult = await dynamoOperation('get', {
          TableName: COMPANY_TABLE_NAMES.COMPANIES,
          Key: { companyId: invitation.companyId }
        });

        return createResponse(200, {
          success: true,
          message: 'Invitation token is valid',
          data: {
            invitation: {
              email: invitation.email,
              role: invitation.role,
              companyName: companyResult.Item ? companyResult.Item.name : 'Unknown Company',
              expiresAt: invitation.expiresAt,
              personalMessage: invitation.personalMessage,
              name: invitation.name || ''
            }
          }
        });
      } catch (validationError) {
        return createErrorResponse(400, validationError.message);
      }
    }

    // POST: Accept invitation (requires Clerk authentication)
    if (event.httpMethod !== 'POST') {
      return createErrorResponse(405, 'Method not allowed');
    }

    // Get the authenticated Clerk user
    const clerkUser = getClerkUserFromEvent(event);

    // Parse request body
    const requestBody = JSON.parse(event.body || '{}');
    const { token, name, phone } = requestBody;

    if (!token) {
      return createErrorResponse(400, 'Invitation token is required');
    }

    // Validate the invitation token
    const invitation = await validateInvitationToken(token);

    // Verify the email matches (security check)
    if (clerkUser.email && invitation.email.toLowerCase() !== clerkUser.email.toLowerCase()) {
      logger.warn('Email mismatch - invitation email:', invitation.email, 'clerk email:', clerkUser.email);
      // For now, allow this but log it - the invitation email might differ from Clerk email
    }

    // Get company info
    const companyResult = await dynamoOperation('get', {
      TableName: COMPANY_TABLE_NAMES.COMPANIES,
      Key: { companyId: invitation.companyId }
    });

    if (!companyResult.Item) {
      return createErrorResponse(404, 'Company not found');
    }

    const company = companyResult.Item;
    const timestamp = getCurrentTimestamp();

    // Check if user is already a member of this company
    const existingUserResult = await dynamoOperation('get', {
      TableName: COMPANY_TABLE_NAMES.USERS,
      Key: {
        companyId: invitation.companyId,
        userId: clerkUser.userId
      }
    });

    let companyUser;
    let isReactivation = false;

    if (existingUserResult.Item) {
      // User record exists - check if they were soft-deleted (inactive)
      if (existingUserResult.Item.status === 'inactive') {
        // Reactivate the previously deleted user
        isReactivation = true;
        console.log('Reactivating previously deleted user:', clerkUser.userId);

        await dynamoOperation('update', {
          TableName: COMPANY_TABLE_NAMES.USERS,
          Key: {
            companyId: invitation.companyId,
            userId: clerkUser.userId
          },
          UpdateExpression: 'SET #status = :active, #role = :role, email = :email, #name = :name, phone = :phone, reactivatedAt = :timestamp, reactivatedBy = :invitedBy, updatedAt = :timestamp REMOVE removedBy, removedAt',
          ExpressionAttributeNames: {
            '#status': 'status',
            '#role': 'role',
            '#name': 'name'
          },
          ExpressionAttributeValues: {
            ':active': 'active',
            ':role': invitation.role,
            ':email': clerkUser.email || invitation.email,
            ':name': name || clerkUser.userName || invitation.name || existingUserResult.Item.name || '',
            ':phone': phone || invitation.phone || existingUserResult.Item.phone || '',
            ':timestamp': timestamp,
            ':invitedBy': invitation.invitedBy
          }
        });

        companyUser = {
          ...existingUserResult.Item,
          status: 'active',
          role: invitation.role,
          email: clerkUser.email || invitation.email,
          name: name || clerkUser.userName || invitation.name || existingUserResult.Item.name || '',
          phone: phone || invitation.phone || existingUserResult.Item.phone || '',
          reactivatedAt: timestamp,
          updatedAt: timestamp
        };
      } else {
        // User is active - cannot accept invitation
        return createErrorResponse(400, 'You are already an active member of this company');
      }
    } else {
      // Create new company-user record
      companyUser = {
        companyId: invitation.companyId,
        userId: clerkUser.userId,
        email: clerkUser.email || invitation.email,
        name: name || clerkUser.userName || invitation.name || '',
        phone: phone || invitation.phone || '',
        role: invitation.role,
        status: 'active',
        invitedBy: invitation.invitedBy,
        invitedAt: invitation.invitedAt,
        joinedAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp
      };

      // Save the company-user record
      await dynamoOperation('put', {
        TableName: COMPANY_TABLE_NAMES.USERS,
        Item: companyUser
      });
    }

    // Increment user counter for tier tracking (for both new and reactivated users)
    try {
      await incrementUserCounter(invitation.companyId);
    } catch (counterError) {
      logger.error('Failed to increment user counter:', { error: counterError });
      // Don't fail the invitation for counter issues
    }

    // Update invitation status to accepted
    // Use invitationId if available, otherwise token (for sendInvitation.js compatibility)
    const invitationKey = {
      companyId: invitation.companyId,
      invitationId: invitation.invitationId
    };

    await dynamoOperation('update', {
      TableName: COMPANY_TABLE_NAMES.INVITATIONS,
      Key: invitationKey,
      UpdateExpression: 'SET #status = :status, acceptedAt = :acceptedAt, acceptedBy = :acceptedBy, acceptedUserId = :acceptedUserId',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':status': 'accepted',
        ':acceptedAt': timestamp,
        ':acceptedBy': clerkUser.email || invitation.email,
        ':acceptedUserId': clerkUser.userId
      }
    });

    console.log('Invitation accepted successfully:', {
      userId: clerkUser.userId,
      companyId: invitation.companyId,
      role: invitation.role
    });

    return createResponse(200, {
      success: true,
      message: 'Invitation accepted successfully! You now have access to the company.',
      data: {
        user: {
          id: companyUser.userId,
          name: companyUser.name,
          email: companyUser.email,
          role: companyUser.role
        },
        company: {
          id: company.companyId,
          name: company.name
        }
      },
      timestamp
    });

  } catch (error) {
    logger.error('Accept invitation error:', { error: error });

    if (error.message.includes('Invalid or expired') || error.message.includes('has expired')) {
      return createErrorResponse(400, error.message);
    }

    if (error.message.includes('Authentication required') || error.message.includes('please sign in')) {
      return createErrorResponse(401, error.message);
    }

    return createErrorResponse(500, 'Internal server error accepting invitation');
  }
});
