// lambda/inviteUser.js
// Send user invitation to join company

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

const {
  validateSubscriptionLimits,
  getPlanLimits
} = require('./shared/paddle-utils');

const AWS = require('aws-sdk');
const crypto = require('crypto');

const ses = new AWS.SES({ region: process.env.AWS_REGION || 'us-east-1' });

// Generate secure invitation token
function generateInvitationToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Send invitation email via SES
async function sendInvitationEmail(invitation) {
  const invitationUrl = `${process.env.FRONTEND_URL || 'http://construction-expenses-multi-table-frontend-702358134603.s3-website-us-east-1.amazonaws.com'}/accept-invitation?token=${invitation.invitationToken}`;

  const fromEmail = process.env.FROM_EMAIL || 'noreply@yankale.com';

  const emailParams = {
    Source: fromEmail,
    Destination: {
      ToAddresses: [invitation.email]
    },
    Message: {
      Subject: {
        Data: `הזמנה להצטרף לחברת ${invitation.companyName}`,
        Charset: 'UTF-8'
      },
      Body: {
        Html: {
          Data: `
            <!DOCTYPE html>
            <html dir="rtl" lang="he">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>הזמנה להצטרף לחברה</title>
                <style>
                    body { font-family: Arial, sans-serif; direction: rtl; background-color: #f5f5f5; margin: 0; padding: 20px; }
                    .container { max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                    .header { background-color: #2d3748; color: white; padding: 30px; text-align: center; }
                    .content { padding: 30px; }
                    .button { display: inline-block; background-color: #3182ce; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
                    .footer { background-color: #f7fafc; padding: 20px; text-align: center; font-size: 14px; color: #718096; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🏗️ הזמנה להצטרף לחברה</h1>
                    </div>
                    <div class="content">
                        <h2>שלום!</h2>
                        <p>הוזמנת להצטרף לחברת <strong>${invitation.companyName}</strong> במערכת ניהול הוצאות הבנייה.</p>
                        
                        <p><strong>פרטי ההזמנה:</strong></p>
                        <ul>
                            <li><strong>חברה:</strong> ${invitation.companyName}</li>
                            <li><strong>תפקיד:</strong> ${invitation.role === 'admin' ? 'מנהל' : 'משתמש'}</li>
                            <li><strong>הוזמן על ידי:</strong> ${invitation.inviterName}</li>
                        </ul>
                        
                        ${invitation.personalMessage ? `<p><strong>הודעה אישית:</strong></p><p><em>"${invitation.personalMessage}"</em></p>` : ''}
                        
                        <p>ההזמנה תפוג בתאריך: <strong>${new Date(invitation.expiresAt).toLocaleDateString('he-IL')}</strong></p>
                        
                        <div style="text-align: center;">
                            <a href="${invitationUrl}" class="button">קבל הזמנה והירשם</a>
                        </div>
                        
                        <p style="font-size: 12px; color: #666;">אם הקישור לא פועל, העתק והדבק את הכתובת הבאה לדפדפן:<br>
                        ${invitationUrl}</p>
                    </div>
                    <div class="footer">
                        <p>מערכת ניהול הוצאות בנייה - Yankale</p>
                        <p>הזמנה זו נשלחה באופן אוטומטי. אל תענה לאימייל זה.</p>
                    </div>
                </div>
            </body>
            </html>
          `,
          Charset: 'UTF-8'
        },
        Text: {
          Data: `
הזמנה להצטרף לחברת ${invitation.companyName}

שלום!
הוזמנת להצטרף לחברת ${invitation.companyName} במערכת ניהול הוצאות הבנייה.

פרטי ההזמנה:
- חברה: ${invitation.companyName}
- תפקיד: ${invitation.role === 'admin' ? 'מנהל' : 'משתמש'}
- הוזמן על ידי: ${invitation.inviterName}

${invitation.personalMessage ? `הודעה אישית: "${invitation.personalMessage}"` : ''}

ההזמנה תפוג בתאריך: ${new Date(invitation.expiresAt).toLocaleDateString('he-IL')}

קישור להרשמה:
${invitationUrl}

מערכת ניהול הוצאות בנייה - Yankale
          `,
          Charset: 'UTF-8'
        }
      }
    }
  };
  
  return await ses.sendEmail(emailParams).promise();
}

exports.handler = async (event) => {

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return createResponse(200, { message: 'CORS preflight' });
  }

  if (event.httpMethod !== 'POST') {
    return createErrorResponse(405, 'Method not allowed');
  }

  try {
    // Get company context from authenticated user
    const { companyId, userId, userRole } = getCompanyContextFromEvent(event);
    
    // Check if user has admin permissions to invite users
    if (userRole !== USER_ROLES.ADMIN) {
      return createErrorResponse(403, 'Admin privileges required to invite users');
    }

    // Parse request body
    const requestBody = JSON.parse(event.body || '{}');

    const { email, role, personalMessage } = requestBody;

    // Validate required fields
    if (!email || !email.includes('@')) {
      return createErrorResponse(400, 'Valid email address is required');
    }

    const inviteeRole = role || USER_ROLES.USER;
    
    // Validate role
    if (!Object.values(USER_ROLES).includes(inviteeRole)) {
      return createErrorResponse(400, `Invalid role. Must be one of: ${Object.values(USER_ROLES).join(', ')}`);
    }

    // Check subscription limits before processing invitation
    try {
      // Get current user count for the company
      const currentUserCount = await dynamoOperation('query', {
        TableName: COMPANY_TABLE_NAMES.USERS,
        KeyConditionExpression: 'companyId = :companyId',
        ExpressionAttributeValues: { ':companyId': companyId },
        Select: 'COUNT'
      });


      // Validate subscription limits (will throw error if exceeded)
      await validateSubscriptionLimits(companyId, 'ADD_USER', currentUserCount.Count);

    } catch (limitError) {
      
      if (limitError.message.includes('User limit reached')) {
        return createErrorResponse(400, {
          error: 'User limit reached',
          message: limitError.message,
          action: 'upgrade_required',
          upgradeUrl: `${process.env.FRONTEND_URL || 'http://localhost:8080'}/#/settings/subscription`
        });
      }
      
      if (limitError.message.includes('No active subscription')) {
        return createErrorResponse(400, {
          error: 'No active subscription',
          message: 'Company subscription required to invite users',
          action: 'subscription_required',
          subscribeUrl: `${process.env.FRONTEND_URL || 'http://localhost:8080'}/#/settings/subscription`
        });
      }
      
      // Re-throw other errors
      throw limitError;
    }

    // Get company information
    const companyResult = await dynamoOperation('get', {
      TableName: COMPANY_TABLE_NAMES.COMPANIES,
      Key: { companyId }
    });

    if (!companyResult.Item) {
      return createErrorResponse(404, 'Company not found');
    }

    const company = companyResult.Item;

    // Get inviter information  
    const inviterResult = await dynamoOperation('get', {
      TableName: COMPANY_TABLE_NAMES.USERS,
      Key: { companyId, userId }
    });

    const inviterName = inviterResult.Item ? inviterResult.Item.name : 'מנהל המערכת';

    // Check if user is already in the company
    const existingUserResult = await dynamoOperation('query', {
      TableName: COMPANY_TABLE_NAMES.USERS,
      IndexName: 'email-index',
      KeyConditionExpression: 'email = :email',
      FilterExpression: 'companyId = :companyId',
      ExpressionAttributeValues: {
        ':email': email,
        ':companyId': companyId
      }
    });

    if (existingUserResult.Items && existingUserResult.Items.length > 0) {
      return createErrorResponse(400, 'User is already a member of this company');
    }

    // Check for existing pending invitation
    const existingInvitations = await dynamoOperation('scan', {
      TableName: COMPANY_TABLE_NAMES.INVITATIONS,
      FilterExpression: 'companyId = :companyId AND email = :email AND #status = :status',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':companyId': companyId,
        ':email': email,
        ':status': 'PENDING'
      }
    });

    if (existingInvitations.Items && existingInvitations.Items.length > 0) {
      return createErrorResponse(400, 'Pending invitation already exists for this email');
    }

    // Generate invitation token and set expiry (7 days)
    const invitationToken = generateInvitationToken();
    const timestamp = getCurrentTimestamp();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days from now

    // Create invitation record (adapting to existing schema)
    const invitation = {
      companyId,
      invitationId: invitationToken, // Using invitationToken as invitationId value
      email: email.toLowerCase().trim(),
      role: inviteeRole,
      status: 'PENDING',
      invitedBy: userId,
      invitedAt: timestamp,
      expiresAt,
      personalMessage: personalMessage || null,
      companyName: company.name,
      inviterName,
      emailSent: false,
      emailAttempts: 0
    };

    // Save invitation to database
    await dynamoOperation('put', {
      TableName: COMPANY_TABLE_NAMES.INVITATIONS,
      Item: invitation,
      ConditionExpression: 'attribute_not_exists(invitationId)'
    });

    // Send invitation email
    try {
      const emailResult = await sendInvitationEmail({
        ...invitation,
        invitationToken // Add token for email URL
      });
      
      // Update invitation with email sent status
      await dynamoOperation('update', {
        TableName: COMPANY_TABLE_NAMES.INVITATIONS,
        Key: { companyId, invitationId: invitationToken },
        UpdateExpression: 'SET emailSent = :emailSent, emailAttempts = :attempts, lastEmailSent = :timestamp',
        ExpressionAttributeValues: {
          ':emailSent': true,
          ':attempts': 1,
          ':timestamp': getCurrentTimestamp()
        }
      });

      
    } catch (emailError) {
      // Don't fail the invitation creation, just mark email as not sent
      await dynamoOperation('update', {
        TableName: COMPANY_TABLE_NAMES.INVITATIONS,
        Key: { companyId, invitationId: invitationToken },
        UpdateExpression: 'SET emailSent = :emailSent, emailAttempts = :attempts, emailError = :error',
        ExpressionAttributeValues: {
          ':emailSent': false,
          ':attempts': 1,
          ':error': emailError.message
        }
      });
    }


    return createResponse(200, {
      success: true,
      message: 'User invitation sent successfully',
      data: {
        invitation: {
          id: invitationToken,
          email: invitation.email,
          role: invitation.role,
          companyName: company.name,
          expiresAt: invitation.expiresAt,
          invitedBy: inviterName,
          emailSent: true
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
    
    if (error.code === 'ConditionalCheckFailedException') {
      return createErrorResponse(409, 'Invitation already exists');
    }
    
    return createErrorResponse(500, 'Internal server error creating invitation');
  }
};