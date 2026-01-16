// lambda/checkPendingInvitations.js
// Check for pending invitations by email address
// Used during registration to offer users the choice to join an existing company

const {
  createResponse,
  createErrorResponse,
  dynamoOperation,
  COMPANY_TABLE_NAMES
} = require('./shared/company-utils');
const { withSecureCors } = require('./shared/cors-config');
const { createLogger } = require('./shared/logger');

const logger = createLogger('checkPendingInvitations');

exports.handler = withSecureCors(async (event) => {
  try {
    const email = event.queryStringParameters?.email;

    if (!email) {
      return createErrorResponse(400, 'Email is required');
    }

    const normalizedEmail = email.toLowerCase().trim();
    logger.info('Checking pending invitations', { email: normalizedEmail });

    // Query invitations table by email using GSI
    const result = await dynamoOperation('query', {
      TableName: COMPANY_TABLE_NAMES.INVITATIONS,
      IndexName: 'email-index',
      KeyConditionExpression: 'email = :email',
      FilterExpression: '#status = :pending',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':email': normalizedEmail,
        ':pending': 'pending'
      }
    });

    const invitations = result.Items || [];
    logger.info('Found invitations', { count: invitations.length });

    // Filter out expired invitations (7 day expiry)
    const now = new Date();
    const validInvitations = invitations.filter(inv => {
      const createdAt = new Date(inv.createdAt);
      const expiresAt = new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);
      return now < expiresAt;
    });

    logger.info('Valid (non-expired) invitations', { count: validInvitations.length });

    // Enrich with company names
    const enrichedInvitations = await Promise.all(
      validInvitations.map(async (inv) => {
        try {
          const companyResult = await dynamoOperation('get', {
            TableName: COMPANY_TABLE_NAMES.COMPANIES,
            Key: { companyId: inv.companyId }
          });
          return {
            invitationId: inv.invitationId,
            companyId: inv.companyId,
            companyName: companyResult.Item?.name || 'חברה לא ידועה',
            role: inv.role,
            invitedBy: inv.inviterName || 'מנהל המערכת',
            createdAt: inv.createdAt
          };
        } catch (err) {
          logger.error('Error fetching company for invitation', {
            invitationId: inv.invitationId,
            error: err.message
          });
          return {
            invitationId: inv.invitationId,
            companyId: inv.companyId,
            companyName: 'חברה לא ידועה',
            role: inv.role,
            invitedBy: inv.inviterName || 'מנהל המערכת',
            createdAt: inv.createdAt
          };
        }
      })
    );

    return createResponse(200, {
      success: true,
      hasInvitations: enrichedInvitations.length > 0,
      invitations: enrichedInvitations
    });
  } catch (error) {
    logger.error('Error checking pending invitations', { error: error.message, stack: error.stack });
    return createErrorResponse(500, 'Failed to check invitations');
  }
});
