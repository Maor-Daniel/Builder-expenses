// lambda/cancelInvitation.js
// Cancel a pending invitation

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

exports.handler = async (event) => {

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return createResponse(200, { message: 'CORS preflight' });
  }

  if (event.httpMethod !== 'DELETE') {
    return createErrorResponse(405, 'Method not allowed');
  }

  try {
    // Get company context from authenticated user
    const { companyId, userId, userRole } = getCompanyContextFromEvent(event);

    // Only admins can cancel invitations
    if (userRole !== USER_ROLES.ADMIN) {
      return createErrorResponse(403, 'Admin privileges required to cancel invitations');
    }

    // Get invitation token from path parameters
    const invitationToken = event.pathParameters?.token;
    if (!invitationToken) {
      return createErrorResponse(400, 'Invitation token is required');
    }


    // Get the invitation from DynamoDB
    const invitationResult = await dynamoOperation('get', {
      TableName: COMPANY_TABLE_NAMES.INVITATIONS,
      Key: {
        companyId,
        invitationId: invitationToken
      }
    });

    if (!invitationResult.Item) {
      return createErrorResponse(404, 'Invitation not found');
    }

    const invitation = invitationResult.Item;

    // Check invitation status
    if (invitation.status === 'ACCEPTED') {
      return createErrorResponse(400, 'Cannot cancel an invitation that has already been accepted');
    }

    if (invitation.status === 'CANCELLED') {
      return createErrorResponse(400, 'This invitation has already been cancelled');
    }

    if (invitation.status === 'EXPIRED') {
      return createErrorResponse(400, 'This invitation has already expired');
    }


    // Update invitation status to CANCELLED
    const updateResult = await dynamoOperation('update', {
      TableName: COMPANY_TABLE_NAMES.INVITATIONS,
      Key: {
        companyId,
        invitationId: invitationToken
      },
      UpdateExpression: 'SET #status = :cancelled, cancelledBy = :userId, cancelledAt = :timestamp, updatedAt = :timestamp',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':cancelled': 'CANCELLED',
        ':userId': userId,
        ':timestamp': getCurrentTimestamp()
      },
      ReturnValues: 'ALL_NEW'
    });

    const updatedInvitation = updateResult.Attributes;


    return createResponse(200, {
      success: true,
      message: 'Invitation cancelled successfully',
      invitation: {
        invitationToken,
        email: updatedInvitation.email,
        role: updatedInvitation.role,
        status: updatedInvitation.status,
        invitedBy: updatedInvitation.invitedBy,
        invitedAt: updatedInvitation.invitedAt,
        cancelledBy: updatedInvitation.cancelledBy,
        cancelledAt: updatedInvitation.cancelledAt
      }
    });

  } catch (error) {

    if (error.message.includes('company context')) {
      return createErrorResponse(401, 'Authentication required');
    }

    return createErrorResponse(500, 'Failed to cancel invitation', {
      error: error.message
    });
  }
};
