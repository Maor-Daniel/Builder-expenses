// lambda/shared/email-utils.js
// Email utility functions for sending emails via AWS SES

// AWS SDK v3 - modular imports for smaller bundle size
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const ses = new SESClient({ region: 'us-east-1' });

/**
 * Send a welcome email to a new user after company registration
 * @param {string} email - User email address
 * @param {string} userName - User full name
 * @param {string} companyName - Company name
 * @returns {Promise} SES send email result
 */
async function sendWelcomeEmail(email, userName, companyName) {
  const fromEmail = process.env.FROM_EMAIL || 'noreply@builder-expenses.com';

  const htmlBody = `
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
          margin: 0;
          padding: 20px;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background-color: white;
          padding: 40px;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .header {
          text-align: center;
          margin-bottom: 30px;
          border-bottom: 3px solid #2196F3;
          padding-bottom: 20px;
        }
        .header h1 {
          color: #2196F3;
          margin: 0;
          font-size: 28px;
        }
        .content {
          color: #333;
          line-height: 1.8;
          font-size: 14px;
        }
        .content p {
          margin: 15px 0;
        }
        .highlight {
          background-color: #f0f8ff;
          padding: 15px;
          border-right: 4px solid #2196F3;
          margin: 20px 0;
          border-radius: 4px;
        }
        .button {
          display: inline-block;
          background-color: #2196F3;
          color: white;
          padding: 12px 30px;
          text-decoration: none;
          border-radius: 4px;
          margin: 20px 0;
          font-weight: bold;
        }
        .footer {
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid #ddd;
          font-size: 12px;
          color: #666;
          text-align: center;
        }
        .features {
          margin: 20px 0;
          padding: 15px;
          background-color: #f9f9f9;
          border-radius: 4px;
        }
        .features li {
          margin: 10px 0;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>!ברוך הבאה למערכת ניהול הוצאות הבנייה</h1>
          <p>Welcome to Construction Expense Management System</p>
        </div>

        <div class="content">
          <p>שלום ${userName},</p>

          <p>תודה על הרשמתך למערכת ניהול הוצאות הבנייה! אנחנו שמחים שהצטרפת אלינו.</p>

          <div class="highlight">
            <strong>פרטי החברה שלך:</strong><br>
            שם החברה: <strong>${companyName}</strong><br>
            תפקיד: <strong>מנהל</strong>
          </div>

          <p>עכשיו אתה יכול:</p>
          <ul class="features">
            <li>✓ ניהול פרויקטים בנייה שלך</li>
            <li>✓ עקוב אחרי הוצאות וביוצ</li>
            <li>✓ ניהול קבלנים וספקים</li>
            <li>✓ צפייה בדוחות ותקציבים</li>
            <li>✓ שתיפת גישה עם צוות שלך</li>
          </ul>

          <p><strong>צעדים הבאים:</strong></p>
          <ol>
            <li>התחבר למערכת במחשב או בטלפון שלך</li>
            <li>הוסף את הפרויקטים שלך</li>
            <li>הוסף קבלנים וספקים</li>
            <li>התחל להקליט הוצאות</li>
          </ol>

          <p>אם יש לך שאלות או זקוק לעזרה, אנא צור קשר עם צוות התמיכה שלנו.</p>

          <p>בברכה,<br>
          <strong>צוות ניהול הוצאות הבנייה</strong></p>
        </div>

        <div class="footer">
          <p>© 2025 מערכת ניהול הוצאות בנייה | כל הזכויות שמורות</p>
          <p>זו הודעה אוטומטית. אנא אל תשיב לאימייל זה.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const textBody = `
ברוך הבאה למערכת ניהול הוצאות הבנייה!

שלום ${userName},

תודה על הרשמתך! פרטי החברה שלך:
שם החברה: ${companyName}
תפקיד: מנהל

עכשיו אתה יכול:
- ניהול פרויקטים בנייה שלך
- עקוב אחרי הוצאות וביוצ
- ניהול קבלנים וספקים
- צפייה בדוחות ותקציבים
- שתיפת גישה עם צוות שלך

בברכה,
צוות ניהול הוצאות הבנייה
  `;

  const params = {
    Source: fromEmail,
    Destination: {
      ToAddresses: [email]
    },
    Message: {
      Subject: {
        Data: `!ברוכה בואך ל${companyName} - מערכת ניהול הוצאות בנייה`,
        Charset: 'UTF-8'
      },
      Body: {
        Html: {
          Data: htmlBody,
          Charset: 'UTF-8'
        },
        Text: {
          Data: textBody,
          Charset: 'UTF-8'
        }
      }
    }
  };

  try {
    const command = new SendEmailCommand(params);
    const result = await ses.send(command);
    console.log('[EMAIL] Welcome email sent successfully to', email, '- MessageId:', result.MessageId);
    return result;
  } catch (error) {
    console.error('[EMAIL ERROR] Failed to send welcome email to', email, ':', error);
    throw error;
  }
}

/**
 * Send a password reset email to a user
 * @param {string} email - User email address
 * @param {string} userName - User full name
 * @param {string} resetToken - Password reset token/link
 * @returns {Promise} SES send email result
 */
async function sendPasswordResetEmail(email, userName, resetToken) {
  const fromEmail = process.env.FROM_EMAIL || 'noreply@builder-expenses.com';
  const resetLink = `${process.env.APP_URL || 'https://builder-expenses.com'}/reset-password?token=${resetToken}`;

  const htmlBody = `
    <!DOCTYPE html>
    <html dir="rtl" lang="he">
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; direction: rtl; text-align: right; }
        .container { max-width: 600px; margin: 0 auto; background-color: #f5f5f5; padding: 20px; }
        .content { background-color: white; padding: 30px; border-radius: 8px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="content">
          <h2>איפוס סיסמה</h2>
          <p>שלום ${userName},</p>
          <p>קיבלנו בקשה לאיפוס סיסמתך. אם זו לא ביקשת, ניתן להתעלם מהודעה זו.</p>
          <p>
            <a href="${resetLink}" style="display: inline-block; background-color: #2196F3; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">
              איפוס סיסמה
            </a>
          </p>
          <p>קישור זה תוקף ל-24 שעות.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const params = {
    Source: fromEmail,
    Destination: {
      ToAddresses: [email]
    },
    Message: {
      Subject: {
        Data: 'איפוס סיסמה - מערכת ניהול הוצאות בנייה',
        Charset: 'UTF-8'
      },
      Body: {
        Html: {
          Data: htmlBody,
          Charset: 'UTF-8'
        }
      }
    }
  };

  try {
    const command = new SendEmailCommand(params);
    const result = await ses.send(command);
    console.log('[EMAIL] Password reset email sent to', email);
    return result;
  } catch (error) {
    console.error('[EMAIL ERROR] Failed to send password reset email:', error);
    throw error;
  }
}

/**
 * Send a user invitation email
 * @param {string} email - Recipient email address
 * @param {string} inviterName - Name of person inviting them
 * @param {string} companyName - Company name
 * @param {string} invitationToken - Invitation token
 * @returns {Promise} SES send email result
 */
async function sendInvitationEmail(email, inviterName, companyName, invitationToken) {
  const fromEmail = process.env.FROM_EMAIL || 'noreply@builder-expenses.com';
  const acceptLink = `${process.env.APP_URL || 'https://builder-expenses.com'}/accept-invitation?token=${invitationToken}`;

  const htmlBody = `
    <!DOCTYPE html>
    <html dir="rtl" lang="he">
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; direction: rtl; text-align: right; }
        .container { max-width: 600px; margin: 0 auto; background-color: #f5f5f5; padding: 20px; }
        .content { background-color: white; padding: 30px; border-radius: 8px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="content">
          <h2>הזמנה להצטרפות לחברה</h2>
          <p>שלום,</p>
          <p>${inviterName} הזמין אותך להצטרפות לחברה <strong>${companyName}</strong> במערכת ניהול הוצאות הבנייה.</p>
          <p>
            <a href="${acceptLink}" style="display: inline-block; background-color: #2196F3; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">
              קבל הזמנה
            </a>
          </p>
          <p>הזמנה זו תוקפה ל-7 ימים.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const params = {
    Source: fromEmail,
    Destination: {
      ToAddresses: [email]
    },
    Message: {
      Subject: {
        Data: `הזמנה להצטרפות ל${companyName}`,
        Charset: 'UTF-8'
      },
      Body: {
        Html: {
          Data: htmlBody,
          Charset: 'UTF-8'
        }
      }
    }
  };

  try {
    const command = new SendEmailCommand(params);
    const result = await ses.send(command);
    console.log('[EMAIL] Invitation email sent to', email);
    return result;
  } catch (error) {
    console.error('[EMAIL ERROR] Failed to send invitation email:', error);
    throw error;
  }
}

/**
 * Send a payment email with checkout link to complete subscription
 * @param {Object} emailData - Email data object
 * @param {string} emailData.to - Recipient email address
 * @param {string} emailData.companyName - Company name
 * @param {string} emailData.tier - Subscription tier (starter, professional, enterprise)
 * @param {string} emailData.checkoutUrl - Paddle checkout URL
 * @returns {Promise} SES send email result
 */
async function sendPaymentEmail({ to, companyName, tier, checkoutUrl }) {
  // Input validation
  if (!to || to.trim().length === 0) {
    throw new Error('Recipient email is required');
  }
  if (!companyName || companyName.trim().length === 0) {
    throw new Error('Company name is required');
  }
  if (!tier || tier.trim().length === 0) {
    throw new Error('Subscription tier is required');
  }
  if (!checkoutUrl || checkoutUrl.trim().length === 0) {
    throw new Error('Checkout URL is required');
  }

  // Validate tier
  const tierLower = tier.toLowerCase();
  const validTiers = ['starter', 'professional', 'enterprise'];
  if (!validTiers.includes(tierLower)) {
    throw new Error('Invalid subscription tier');
  }

  // Get tier details
  const tierDetails = {
    starter: { name: 'Starter', nameHe: 'סטרטר', price: 50 },
    professional: { name: 'Professional', nameHe: 'מקצועי', price: 100 },
    enterprise: { name: 'Enterprise', nameHe: 'ארגוני', price: 150 }
  };

  const { name: tierName, nameHe: tierNameHe, price } = tierDetails[tierLower];

  const fromEmail = process.env.FROM_EMAIL || 'noreply@builder-expenses.com';

  const htmlBody = `
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
          margin: 0;
          padding: 20px;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background-color: white;
          padding: 40px;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .header {
          text-align: center;
          margin-bottom: 30px;
          border-bottom: 3px solid #2196F3;
          padding-bottom: 20px;
        }
        .header h1 {
          color: #2196F3;
          margin: 0;
          font-size: 28px;
        }
        .content {
          color: #333;
          line-height: 1.8;
          font-size: 14px;
        }
        .content p {
          margin: 15px 0;
        }
        .plan-box {
          background-color: #f0f8ff;
          padding: 20px;
          border-right: 4px solid #2196F3;
          margin: 20px 0;
          border-radius: 4px;
        }
        .plan-box h3 {
          margin: 0 0 10px 0;
          color: #2196F3;
        }
        .price {
          font-size: 24px;
          font-weight: bold;
          color: #2196F3;
        }
        .trial-badge {
          background-color: #4CAF50;
          color: white;
          padding: 5px 10px;
          border-radius: 4px;
          display: inline-block;
          margin-top: 10px;
          font-size: 12px;
        }
        .button {
          display: inline-block;
          background-color: #2196F3;
          color: white !important;
          padding: 15px 40px;
          text-decoration: none;
          border-radius: 6px;
          margin: 20px 0;
          font-weight: bold;
          font-size: 16px;
        }
        .button:hover {
          background-color: #1976D2;
        }
        .warning {
          background-color: #fff3cd;
          border-right: 4px solid #ffc107;
          padding: 15px;
          margin: 20px 0;
          border-radius: 4px;
          color: #856404;
        }
        .footer {
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid #ddd;
          font-size: 12px;
          color: #666;
          text-align: center;
        }
        .url-fallback {
          word-break: break-all;
          color: #2196F3;
          margin-top: 10px;
          font-size: 12px;
        }
        .ltr {
          direction: ltr;
          text-align: left;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>השלם את התשלום שלך 🏗️</h1>
          <p class="ltr" style="text-align: center;">Complete Your Payment - Builder Expenses</p>
        </div>

        <div class="content">
          <p><strong>שלום,</strong></p>

          <p>תודה שבחרת ב-Builder Expenses! אנחנו שמחים שאתה מצטרף אלינו.</p>

          <div class="plan-box">
            <h3>פרטי התוכנית שלך / Your Plan Details:</h3>
            <p><strong>חברה / Company:</strong> ${companyName}</p>
            <p><strong>תוכנית / Plan:</strong> ${tierNameHe} / ${tierName}</p>
            <p class="price">₪${price}/חודש</p>
            <span class="trial-badge">✨ 30 יום ניסיון חינם / 30-day free trial</span>
          </div>

          <p><strong>להשלמת ההרשמה, יש להשלים את התשלום:</strong></p>
          <p class="ltr"><strong>To complete your registration, please complete the payment:</strong></p>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${checkoutUrl}" class="button">
              השלם תשלום / Complete Payment
            </a>
          </div>

          <p class="url-fallback ltr">
            Or copy this link:<br>
            ${checkoutUrl}
          </p>

          <div class="warning">
            <strong>⚠️ חשוב:</strong> הקישור תקף ל-24 שעות בלבד.<br>
            <span class="ltr"><strong>Important:</strong> This link is valid for 24 hours only.</span>
          </div>

          <p>לא ביצעת את הרישום? אין בעיה - פשוט התעלם מהודעה זו.</p>
          <p class="ltr">Didn't request this? No problem - just ignore this email.</p>

          <p>צוות התמיכה שלנו כאן בשבילך במקרה של שאלות.<br>
          <span class="ltr">Our support team is here for any questions.</span></p>

          <p>בברכה,<br>
          <strong>צוות Builder Expenses</strong></p>
        </div>

        <div class="footer">
          <p>© 2025 Builder Expenses | כל הזכויות שמורות</p>
          <p>זו הודעה אוטומטית. אנא אל תשיב לאימייל זה.<br>
          This is an automated message. Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const textBody = `
השלם את התשלום שלך - Builder Expenses
Complete Your Payment - Builder Expenses

שלום,

תודה שבחרת ב-Builder Expenses!

פרטי התוכנית שלך / Your Plan Details:
- חברה / Company: ${companyName}
- תוכנית / Plan: ${tierNameHe} / ${tierName}
- מחיר / Price: ₪${price}/חודש
- ניסיון / Trial: 30 יום חינם / 30 days free

להשלמת ההרשמה, לחץ על הקישור הבא:
To complete your registration, click the link below:

${checkoutUrl}

⚠️ חשוב: הקישור תקף ל-24 שעות בלבד.
Important: This link is valid for 24 hours only.

בברכה,
צוות Builder Expenses
  `;

  const params = {
    Source: fromEmail,
    Destination: {
      ToAddresses: [to]
    },
    Message: {
      Subject: {
        Data: `השלם את התשלום שלך - Complete Your Payment - Builder Expenses 🏗️`,
        Charset: 'UTF-8'
      },
      Body: {
        Html: {
          Data: htmlBody,
          Charset: 'UTF-8'
        },
        Text: {
          Data: textBody,
          Charset: 'UTF-8'
        }
      }
    }
  };

  try {
    const command = new SendEmailCommand(params);
    const result = await ses.send(command);
    console.log('[EMAIL] Payment email sent successfully to', to, '- MessageId:', result.MessageId);
    return result;
  } catch (error) {
    console.error('[EMAIL ERROR] Failed to send payment email to', to, ':', error);
    throw error;
  }
}

module.exports = {
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendInvitationEmail,
  sendPaymentEmail
};
