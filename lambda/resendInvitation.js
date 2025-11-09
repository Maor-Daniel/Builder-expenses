// lambda/resendInvitation.js
// Resend an invitation email to a pending user

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

const AWS = require('aws-sdk');
const crypto = require('crypto');

const ses = new AWS.SES({ region: process.env.AWS_REGION || 'us-east-1' });

// Send invitation email via SES
async function sendInvitationEmail(invitation, companyName) {
  const invitationToken = invitation.token || invitation.invitationToken;
  const invitationUrl = `${process.env.FRONTEND_URL || 'http://construction-expenses-multi-table-frontend-702358134603.s3-website-us-east-1.amazonaws.com'}/accept-invitation?token=${invitationToken}`;


  const emailParams = {
    Source: process.env.SES_EMAIL_SOURCE || process.env.FROM_EMAIL || 'maordtech@gmail.com',
    Destination: {
      ToAddresses: [invitation.email]
    },
    Message: {
      Subject: {
        Data: `הזמנה להצטרף לחברת ${companyName} (שליחה מחדש)`,
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
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        direction: rtl;
                        text-align: right;
                        background-color: #f5f5f5;
                        padding: 20px;
                    }
                    .container {
                        max-width: 600px;
                        margin: 0 auto;
                        background-color: white;
                        padding: 30px;
                        border-radius: 10px;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    }
                    .header {
                        text-align: center;
                        margin-bottom: 30px;
                    }
                    .button {
                        display: inline-block;
                        padding: 15px 30px;
                        background-color: #007bff;
                        color: white;
                        text-decoration: none;
                        border-radius: 5px;
                        margin: 20px 0;
                    }
                    .footer {
                        margin-top: 30px;
                        padding-top: 20px;
                        border-top: 1px solid #eee;
                        font-size: 12px;
                        color: #666;
                    }
                    .resend-notice {
                        background-color: #fff3cd;
                        border: 1px solid #ffc107;
                        padding: 10px;
                        border-radius: 5px;
                        margin-bottom: 20px;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>שליחה מחדש: הזמנה להצטרף ל-${companyName}</h1>
                    </div>

                    <div class="resend-notice">
                        <strong>שליחה מחדש:</strong> זוהי הזמנה ששלחנו מחדש לבקשתך.
                    </div>

                    <p>שלום,</p>

                    <p>הוזמנת להצטרף לחברת <strong>${companyName}</strong> במערכת לניהול הוצאות פרויקטי בנייה.</p>

                    <p>תפקידך בחברה: <strong>${invitation.role === 'admin' ? 'מנהל' : invitation.role === 'manager' ? 'מנהל פרויקטים' : invitation.role === 'editor' ? 'עורך' : 'צופה'}</strong></p>

                    ${invitation.personalMessage ? `
                        <div style="background-color: #e7f3ff; padding: 15px; border-radius: 5px; margin: 20px 0;">
                            <strong>הודעה אישית מהמזמין:</strong>
                            <p style="margin: 10px 0 0 0;">${invitation.personalMessage}</p>
                        </div>
                    ` : ''}

                    <p>להשלמת ההרשמה ולגישה למערכת, לחץ על הכפתור למטה:</p>

                    <div style="text-align: center;">
                        <a href="${invitationUrl}" class="button">קבל הזמנה והצטרף לחברה</a>
                    </div>

                    <p>או העתק והדבק את הקישור הבא בדפדפן שלך:</p>
                    <p style="word-break: break-all; background-color: #f5f5f5; padding: 10px; border-radius: 5px;">${invitationUrl}</p>

                    <p><strong>שים לב:</strong> הקישור תקף ל-7 ימים מתאריך השליחה המקורית.</p>

                    <div class="footer">
                        <p>אם לא ציפית לקבל הודעה זו, אנא התעלם ממנה.</p>
                        <p>אימייל זה נשלח ממערכת ניהול הוצאות פרויקטי בנייה.</p>
                    </div>
                </div>
            </body>
            </html>
          `,
          Charset: 'UTF-8'
        },
        Text: {
          Data: `
שליחה מחדש: הזמנה להצטרף ל-${companyName}

שלום,

זוהי הזמנה ששלחנו מחדש לבקשתך.

הוזמנת להצטרף לחברת ${companyName} במערכת לניהול הוצאות פרויקטי בנייה.

תפקידך בחברה: ${invitation.role === 'admin' ? 'מנהל' : invitation.role === 'manager' ? 'מנהל פרויקטים' : invitation.role === 'editor' ? 'עורך' : 'צופה'}

${invitation.personalMessage ? `הודעה אישית מהמזמין:\n${invitation.personalMessage}\n` : ''}

להשלמת ההרשמה, העתק והדבק את הקישור הבא בדפדפן שלך:
${invitationUrl}

שים לב: הקישור תקף ל-7 ימים מתאריך השליחה המקורית.

אם לא ציפית לקבל הודעה זו, אנא התעלם ממנה.
          `,
          Charset: 'UTF-8'
        }
      }
    }
  };

  const result = await ses.sendEmail(emailParams).promise();
  return result;
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

    // Only admins can resend invitations
    if (userRole !== USER_ROLES.ADMIN) {
      return createErrorResponse(403, 'Admin privileges required to resend invitations');
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
    if (invitation.status !== 'pending') {
      return createErrorResponse(400, `Cannot resend invitation. Status is ${invitation.status}. Only pending invitations can be resent.`);
    }

    // Check if invitation has expired
    const now = new Date();
    const expiresAt = new Date(invitation.expiresAt);

    if (expiresAt < now) {
      return createErrorResponse(400, 'Invitation has expired. Please create a new invitation.');
    }

    // Check resend limit (optional - prevent spam)
    const MAX_RESEND_ATTEMPTS = 5;
    const emailAttempts = invitation.emailAttempts || 0;

    if (emailAttempts >= MAX_RESEND_ATTEMPTS) {
      return createErrorResponse(400, `Maximum resend limit (${MAX_RESEND_ATTEMPTS}) reached. Please create a new invitation.`);
    }

    // Get company name for email
    const companyResult = await dynamoOperation('get', {
      TableName: COMPANY_TABLE_NAMES.COMPANIES,
      Key: {
        companyId
      }
    });

    const companyName = companyResult.Item?.name || 'החברה';


    // Send the email
    try {
      await sendInvitationEmail(invitation, companyName);

      // Update invitation with new email send timestamp
      await dynamoOperation('update', {
        TableName: COMPANY_TABLE_NAMES.INVITATIONS,
        Key: {
          companyId,
          invitationId: invitationToken
        },
        UpdateExpression: 'SET lastEmailSent = :timestamp, emailAttempts = :attempts, emailSent = :true, resentBy = :userId, resentAt = :timestamp',
        ExpressionAttributeValues: {
          ':timestamp': getCurrentTimestamp(),
          ':attempts': emailAttempts + 1,
          ':true': true,
          ':userId': userId
        }
      });


      return createResponse(200, {
        success: true,
        message: 'Invitation email resent successfully',
        invitation: {
          email: invitation.email,
          role: invitation.role,
          expiresAt: invitation.expiresAt,
          emailAttempts: emailAttempts + 1,
          maxAttempts: MAX_RESEND_ATTEMPTS,
          attemptsRemaining: MAX_RESEND_ATTEMPTS - (emailAttempts + 1)
        }
      });

    } catch (emailError) {

      // Update invitation with error
      await dynamoOperation('update', {
        TableName: COMPANY_TABLE_NAMES.INVITATIONS,
        Key: {
          companyId,
          invitationId: invitationToken
        },
        UpdateExpression: 'SET emailError = :error, lastEmailAttempt = :timestamp, emailAttempts = :attempts',
        ExpressionAttributeValues: {
          ':error': emailError.message,
          ':timestamp': getCurrentTimestamp(),
          ':attempts': emailAttempts + 1
        }
      });

      return createErrorResponse(500, 'Failed to send invitation email', {
        error: emailError.message,
        note: 'The invitation is still valid, but the email could not be sent'
      });
    }

  } catch (error) {

    if (error.message.includes('company context')) {
      return createErrorResponse(401, 'Authentication required');
    }

    return createErrorResponse(500, 'Failed to resend invitation', {
      error: error.message
    });
  }
};
