// lambda/listInvitations.js
// List pending invitations for a company

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

  if (event.httpMethod !== 'GET') {
    return createErrorResponse(405, 'Method not allowed');
  }

  try {
    // Get company context from authenticated user
    const { companyId, userId, userRole } = getCompanyContextFromEvent(event);

    console.log('listInvitations - context:', { companyId, userId, userRole });
    console.log('listInvitations - authorizer context:', JSON.stringify(event.requestContext?.authorizer));

    // Check if user has admin permissions to view invitations
    if (userRole !== USER_ROLES.ADMIN) {
      return createErrorResponse(403, 'Admin privileges required to view invitations');
    }

    // Parse query parameters
    const queryParams = event.queryStringParameters || {};
    const { status, sortBy } = queryParams;


    // Build query parameters
    let queryPromise;
    
    if (status) {
      // Query invitations by status
      queryPromise = dynamoOperation('scan', {
        TableName: COMPANY_TABLE_NAMES.INVITATIONS,
        FilterExpression: 'companyId = :companyId AND #status = :status',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':companyId': companyId,
          ':status': status.toLowerCase()
        }
      });
    } else {
      // Get all invitations for the company
      queryPromise = dynamoOperation('query', {
        TableName: COMPANY_TABLE_NAMES.INVITATIONS,
        KeyConditionExpression: 'companyId = :companyId',
        ExpressionAttributeValues: {
          ':companyId': companyId
        }
      });
    }

    const result = await queryPromise;
    let invitations = result.Items || [];

    // Filter expired invitations and mark them
    const now = new Date();
    const enhancedInvitations = invitations.map(invitation => {
      const isExpired = new Date(invitation.expiresAt) < now;
      return {
        ...invitation,
        isExpired,
        daysUntilExpiry: isExpired ? 0 : Math.ceil((new Date(invitation.expiresAt) - now) / (1000 * 60 * 60 * 24))
      };
    });

    // Get inviter names for each invitation
    const inviterIds = [...new Set(invitations.map(inv => inv.invitedBy))];
    const inviters = {};
    
    if (inviterIds.length > 0) {
      const inviterPromises = inviterIds.map(async (inviterId) => {
        try {
          const inviterResult = await dynamoOperation('get', {
            TableName: COMPANY_TABLE_NAMES.USERS,
            Key: { companyId, userId: inviterId }
          });
          return { 
            inviterId, 
            name: inviterResult.Item ? inviterResult.Item.name : 'Unknown User' 
          };
        } catch (error) {
          return { inviterId, name: 'Unknown User' };
        }
      });
      
      const inviterResults = await Promise.all(inviterPromises);
      inviterResults.forEach(({ inviterId, name }) => {
        inviters[inviterId] = name;
      });
    }

    // Enhance invitations with inviter names
    const finalInvitations = enhancedInvitations.map(invitation => ({
      id: invitation.invitationId,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      invitedAt: invitation.invitedAt,
      expiresAt: invitation.expiresAt,
      isExpired: invitation.isExpired,
      daysUntilExpiry: invitation.daysUntilExpiry,
      inviterName: inviters[invitation.invitedBy] || 'Unknown User',
      personalMessage: invitation.personalMessage,
      emailSent: invitation.emailSent || false,
      emailAttempts: invitation.emailAttempts || 0
    }));

    // Sort invitations
    if (sortBy === 'email') {
      finalInvitations.sort((a, b) => a.email.localeCompare(b.email));
    } else if (sortBy === 'role') {
      finalInvitations.sort((a, b) => a.role.localeCompare(b.role));
    } else if (sortBy === 'expiry') {
      finalInvitations.sort((a, b) => new Date(a.expiresAt) - new Date(b.expiresAt));
    } else {
      // Default sort by invitation date (newest first)
      finalInvitations.sort((a, b) => new Date(b.invitedAt) - new Date(a.invitedAt));
    }

    // Calculate summary statistics
    const summary = {
      totalCount: finalInvitations.length,
      pendingCount: finalInvitations.filter(inv => inv.status === 'pending' && !inv.isExpired).length,
      expiredCount: finalInvitations.filter(inv => inv.isExpired).length,
      acceptedCount: finalInvitations.filter(inv => inv.status === 'accepted').length,
      cancelledCount: finalInvitations.filter(inv => inv.status === 'cancelled').length,
      byRole: finalInvitations.reduce((counts, inv) => {
        counts[inv.role] = (counts[inv.role] || 0) + 1;
        return counts;
      }, {})
    };


    return createResponse(200, {
      success: true,
      message: `Retrieved ${finalInvitations.length} invitations`,
      data: {
        invitations: finalInvitations,
        summary,
        filters: {
          status: status || null,
          sortBy: sortBy || 'invitedAt'
        }
      },
      timestamp: getCurrentTimestamp()
    });

  } catch (error) {
    
    if (error.message.includes('Company authentication required')) {
      return createErrorResponse(401, 'Authentication required');
    }
    
    if (error.message.includes('missing company')) {
      return createErrorResponse(401, 'Invalid company context');
    }
    
    return createErrorResponse(500, 'Internal server error retrieving invitations');
  }
};