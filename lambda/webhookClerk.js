// lambda/webhookClerk.js
// Clerk webhook handler for user authentication events
//
// SECURITY: Webhook secret now fetched from AWS Secrets Manager

const crypto = require('crypto');
const { getSecret } = require('./shared/secrets');

const {
  dynamoOperation,
  COMPANY_TABLE_NAMES,
  getCurrentTimestamp,
  createResponse,
  createErrorResponse
} = require('./shared/company-utils');

/**
 * Handle Clerk webhook events
 * Events: user.created, user.updated, user.deleted
 */
exports.handler = async (event) => {
  console.log('Clerk Webhook Event Received:', {
    headers: event.headers,
    hasBody: !!event.body
  });

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return createResponse(200, { message: 'CORS preflight' });
  }

  if (event.httpMethod !== 'POST') {
    return createErrorResponse(405, 'Method not allowed');
  }

  try {
    // Get Svix headers for webhook verification
    const svixId = event.headers['svix-id'] || event.headers['Svix-Id'];
    const svixTimestamp = event.headers['svix-timestamp'] || event.headers['Svix-Timestamp'];
    const svixSignature = event.headers['svix-signature'] || event.headers['Svix-Signature'];

    if (!svixId || !svixTimestamp || !svixSignature) {
      console.error('Missing Svix headers');
      return createErrorResponse(401, 'Missing webhook signature headers');
    }

    // Verify webhook signature
    const isValid = await verifySvixSignature(event.body, svixId, svixTimestamp, svixSignature);

    if (!isValid) {
      console.error('Invalid webhook signature');
      return createErrorResponse(401, 'Invalid webhook signature');
    }

    // Parse webhook payload
    const webhookData = JSON.parse(event.body);
    const { type, data } = webhookData;

    console.log('Processing Clerk Webhook:', {
      eventType: type,
      userId: data.id
    });

    // Route to appropriate handler based on event type
    switch (type) {
      case 'user.created':
        await handleUserCreated(data);
        break;

      case 'user.updated':
        await handleUserUpdated(data);
        break;

      case 'user.deleted':
        await handleUserDeleted(data);
        break;

      default:
        console.log(`Unhandled event type: ${type}`);
    }

    return createResponse(200, {
      success: true,
      message: `Webhook ${type} processed successfully`
    });

  } catch (error) {
    console.error('ERROR processing Clerk webhook:', {
      error: error.message,
      stack: error.stack
    });

    // Return 200 to prevent Clerk from retrying on application errors
    return createResponse(200, {
      success: false,
      message: 'Webhook received but processing failed',
      error: error.message
    });
  }
};

/**
 * Verify Svix webhook signature (Standard Webhooks)
 * Based on https://docs.svix.com/receiving/verifying-payloads/how-manual
 */
async function verifySvixSignature(body, svixId, svixTimestamp, svixSignature) {
  try {
    // Get webhook secret from AWS Secrets Manager
    const webhookSecret = await getSecret('clerk/webhook-secret');

    if (!webhookSecret) {
      console.error('CLERK_WEBHOOK_SECRET not available from Secrets Manager');
      return false;
    }

    // Remove 'whsec_' prefix from secret if present
    const secret = webhookSecret.startsWith('whsec_')
      ? webhookSecret.substring(6)
      : webhookSecret;

    // Convert base64 secret to buffer
    const secretBytes = Buffer.from(secret, 'base64');

    // Create signed content: svix-id.svix-timestamp.body
    const signedContent = `${svixId}.${svixTimestamp}.${body}`;

    // Calculate expected signature using HMAC SHA256
    const expectedSignature = crypto
      .createHmac('sha256', secretBytes)
      .update(signedContent, 'utf8')
      .digest('base64');

    // Parse signature header (format: "v1,signature1 v1,signature2")
    const signatures = svixSignature.split(' ');

    // Check if any signature matches
    for (const versionedSig of signatures) {
      const [version, signature] = versionedSig.split(',');

      if (version === 'v1' && signature === expectedSignature) {
        return true;
      }
    }

    console.error('No matching signature found');
    return false;

  } catch (error) {
    console.error('Error verifying Svix signature:', error);
    return false;
  }
}

/**
 * Handle user.created event
 * Optional: Log for analytics
 */
async function handleUserCreated(userData) {
  const userId = userData.id;
  const email = userData.email_addresses?.[0]?.email_address;

  console.log(`User created: ${userId} (${email})`);

  // Optional: Store user creation event for analytics
  // This is primarily handled during company registration
}

/**
 * Handle user.updated event
 * Optional: Sync user profile changes to company-users table
 */
async function handleUserUpdated(userData) {
  const userId = userData.id;
  const email = userData.email_addresses?.[0]?.email_address;
  const firstName = userData.first_name || '';
  const lastName = userData.last_name || '';
  const name = `${firstName} ${lastName}`.trim();

  console.log(`User updated: ${userId} (${email})`);

  // Find user's company membership
  try {
    const result = await dynamoOperation('scan', {
      TableName: COMPANY_TABLE_NAMES.USERS,
      FilterExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      }
    });

    if (result.Items && result.Items.length > 0) {
      // Update user record in each company they belong to
      for (const userRecord of result.Items) {
        await dynamoOperation('update', {
          TableName: COMPANY_TABLE_NAMES.USERS,
          Key: {
            companyId: userRecord.companyId,
            userId: userRecord.userId
          },
          UpdateExpression: 'SET #name = :name, email = :email, updatedAt = :updated',
          ExpressionAttributeNames: {
            '#name': 'name'
          },
          ExpressionAttributeValues: {
            ':name': name || email,
            ':email': email,
            ':updated': getCurrentTimestamp()
          }
        });

        console.log(`Updated user ${userId} in company ${userRecord.companyId}`);
      }
    } else {
      console.log(`No company membership found for user ${userId}`);
    }
  } catch (error) {
    console.error(`Error updating user ${userId}:`, error);
  }
}

/**
 * Handle user.deleted event
 * CRITICAL: Remove user from all companies
 */
async function handleUserDeleted(userData) {
  const userId = userData.id;

  console.log(`User deleted: ${userId} - Removing from all companies`);

  try {
    // Find all companies where user is a member
    const result = await dynamoOperation('scan', {
      TableName: COMPANY_TABLE_NAMES.USERS,
      FilterExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      }
    });

    if (result.Items && result.Items.length > 0) {
      // Remove user from each company
      for (const userRecord of result.Items) {
        const companyId = userRecord.companyId;

        // Delete user from company-users table
        await dynamoOperation('delete', {
          TableName: COMPANY_TABLE_NAMES.USERS,
          Key: {
            companyId,
            userId
          }
        });

        // Decrement company user count
        await dynamoOperation('update', {
          TableName: COMPANY_TABLE_NAMES.COMPANIES,
          Key: { companyId },
          UpdateExpression: 'SET currentUsers = if_not_exists(currentUsers, :zero) - :one, updatedAt = :updated',
          ExpressionAttributeValues: {
            ':zero': 0,
            ':one': 1,
            ':updated': getCurrentTimestamp()
          }
        });

        console.log(`Removed user ${userId} from company ${companyId}`);
      }
    } else {
      console.log(`No company memberships found for deleted user ${userId}`);
    }

  } catch (error) {
    console.error(`Error removing deleted user ${userId}:`, error);
    throw error; // Re-throw to ensure webhook retry on failure
  }
}
