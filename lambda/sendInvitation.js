// lambda/sendInvitation.js
// Send user invitation to join company

const AWS = require('aws-sdk');
const {
  createResponse,
  createErrorResponse,
  getCompanyUserFromEvent,
  validateInvitation,
  validateCompanyUser,
  generateInvitationId,
  generateInvitationToken,
  getCurrentTimestamp,
  debugLog,
  dynamoOperation,
  COMPANY_TABLE_NAMES,
  USER_ROLES,
  INVITATION_STATUS
} = require('./shared/company-utils');

const {
  checkUserLimit
} = require('./shared/limit-checker');
const { withSecureCors } = require('./shared/cors-config');

const ses = new AWS.SES({ region: process.env.AWS_REGION || 'us-east-1' });

exports.handler = withSecureCors(async (event) => {

  // Handle CORS preflight
  // OPTIONS handling now in withSecureCors middleware

  if (event.httpMethod !== 'POST') {
    return createErrorResponse(405, 'Method not allowed');
  }

  try {
    // Get company and user info from token
    const { companyId, userId, userRole } = getCompanyUserFromEvent(event);
    
    // Validate user is admin (only admins can send invitations)
    await validateCompanyUser(companyId, userId, USER_ROLES.ADMIN);

    // Check if company can add new user (tier limit check)
    const limitCheck = await checkUserLimit(companyId);

    if (!limitCheck.allowed) {
      return createErrorResponse(403, limitCheck.message, {
        reason: limitCheck.reason,
        currentUsage: limitCheck.currentUsage,
        limit: limitCheck.limit,
        suggestedTier: limitCheck.suggestedTier,
        upgradeUrl: limitCheck.upgradeUrl
      });
    }

    // Parse request body
    const requestBody = JSON.parse(event.body || '{}');

    const { email, role, name, phone } = requestBody;

    // Validate invitation data
    validateInvitation({ email, role });

    // Check if user is already in the company
    const existingUserParams = {
      TableName: COMPANY_TABLE_NAMES.USERS,
      IndexName: 'CompanyEmailIndex', // Assuming we have a GSI on companyId-email
      KeyConditionExpression: 'companyId = :companyId',
      FilterExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':companyId': companyId,
        ':email': email
      }
    };

    try {
      const existingUserResult = await dynamoOperation('query', existingUserParams);
      if (existingUserResult.Items && existingUserResult.Items.length > 0) {
        return createErrorResponse(400, 'User is already a member of this company');
      }
    } catch (queryError) {
      // If GSI doesn't exist, do a scan instead (less efficient but works)
      const scanParams = {
        TableName: COMPANY_TABLE_NAMES.USERS,
        FilterExpression: 'companyId = :companyId AND email = :email',
        ExpressionAttributeValues: {
          ':companyId': companyId,
          ':email': email
        }
      };
      const existingUserResult = await dynamoOperation('scan', scanParams);
      if (existingUserResult.Items && existingUserResult.Items.length > 0) {
        return createErrorResponse(400, 'User is already a member of this company');
      }
    }

    // Check if there's already a pending invitation
    const existingInvitationParams = {
      TableName: COMPANY_TABLE_NAMES.INVITATIONS,
      FilterExpression: 'companyId = :companyId AND email = :email AND #status = :status',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':companyId': companyId,
        ':email': email,
        ':status': INVITATION_STATUS.PENDING
      }
    };

    const existingInvitation = await dynamoOperation('scan', existingInvitationParams);
    if (existingInvitation.Items && existingInvitation.Items.length > 0) {
      return createErrorResponse(400, 'Pending invitation already exists for this email');
    }

    // Create invitation record
    const invitationId = generateInvitationId();
    const token = generateInvitationToken();
    const timestamp = getCurrentTimestamp();

    // Calculate expiration date (7 days from now)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const invitation = {
      companyId,
      invitationId,
      email,
      name: name || '',
      phone: phone || '',
      role,
      token,
      status: INVITATION_STATUS.PENDING,
      invitedBy: userId,
      invitedAt: timestamp,
      expiresAt: expiresAt.toISOString(),
      createdAt: timestamp,
      updatedAt: timestamp
    };

    await dynamoOperation('put', {
      TableName: COMPANY_TABLE_NAMES.INVITATIONS,
      Item: invitation,
      ConditionExpression: 'attribute_not_exists(companyId) AND attribute_not_exists(invitationId)'
    });

    // Get company name for email
    const companyResult = await dynamoOperation('get', {
      TableName: COMPANY_TABLE_NAMES.COMPANIES,
      Key: { companyId }
    });

    const companyName = companyResult.Item?.name || 'Unknown Company';

    // Send invitation email
    const invitationUrl = `${process.env.FRONTEND_URL || 'http://construction-expenses-multi-table-frontend-702358134603.s3-website-us-east-1.amazonaws.com'}?invitation=${token}`;
    
    const emailParams = {
      Source: process.env.SES_EMAIL_SOURCE || process.env.FROM_EMAIL || 'maordtech@gmail.com',
      Destination: {
        ToAddresses: [email]
      },
      Message: {
        Subject: {
          Data: `הזמנה להצטרף ל-${companyName} במערכת ניהול הוצאות בנייה`,
          Charset: 'UTF-8'
        },
        Body: {
          Html: {
            Data: `
              <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2>הזמנה להצטרף לחברה: ${companyName}</h2>
                
                <p>שלום ${name || email},</p>
                
                <p>הוזמנת להצטרף לחברת <strong>${companyName}</strong> במערכת ניהול הוצאות הבנייה.</p>
                
                <p><strong>התפקיד שלך:</strong> ${role === USER_ROLES.ADMIN ? 'מנהל' : 'משתמש'}</p>
                
                <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
                  <p><strong>כדי להשלים את ההרשמה:</strong></p>
                  <ol>
                    <li>לחץ על הקישור למטה</li>
                    <li>מלא את פרטיך האישיים</li>
                    <li>צור סיסמה חדשה</li>
                    <li>התחל להשתמש במערכת</li>
                  </ol>
                </div>
                
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${invitationUrl}" 
                     style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
                    הצטרף לחברה
                  </a>
                </div>
                
                <p><small>הקישור תקף למשך 7 ימים מרגע השליחה.</small></p>
                
                <p>בברכה,<br>צוות מערכת ניהול הוצאות הבנייה</p>
              </div>
            `,
            Charset: 'UTF-8'
          },
          Text: {
            Data: `
הזמנה להצטרף לחברה: ${companyName}

שלום ${name || email},

הוזמנת להצטרף לחברת ${companyName} במערכת ניהול הוצאות הבנייה.

התפקיד שלך: ${role === USER_ROLES.ADMIN ? 'מנהל' : 'משתמש'}

כדי להשלים את ההרשמה, עבור לקישור הבא:
${invitationUrl}

הקישור תקף למשך 7 ימים מרגע השליחה.

בברכה,
צוות מערכת ניהול הוצאות הבנייה
            `,
            Charset: 'UTF-8'
          }
        }
      }
    };

    try {
      await ses.sendEmail(emailParams).promise();
    } catch (emailError) {
      // Don't fail the entire operation if email fails
      // The invitation record is still created and the user can be invited manually
    }

    return createResponse(200, {
      success: true,
      message: 'Invitation sent successfully',
      data: {
        invitationId,
        email,
        role,
        status: INVITATION_STATUS.PENDING,
        companyName
      },
      timestamp: getCurrentTimestamp()
    });

  } catch (error) {
    
    if (error.message.includes('Access denied') || error.message.includes('Required role')) {
      return createErrorResponse(403, 'Only company administrators can send invitations');
    }
    
    if (error.message.includes('authentication required') || error.message.includes('not found in company')) {
      return createErrorResponse(401, 'Authentication required');
    }
    
    if (error.code === 'ConditionalCheckFailedException') {
      return createErrorResponse(409, 'Invitation already exists');
    }
    
    if (error.code === 'ValidationException' || error.message.includes('Missing required')) {
      return createErrorResponse(400, error.message);
    }
    
    return createErrorResponse(500, 'Internal server error while sending invitation');
  }
});