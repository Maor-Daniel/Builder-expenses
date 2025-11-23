// lambda/webhookPaddle.js
// Paddle webhook handler for subscription and payment events

const {
  verifyPaddleWebhook,
  storeSubscription,
  storePayment,
  PADDLE_TABLE_NAMES,
  createResponse,
  createErrorResponse
} = require('./shared/paddle-utils');

const {
  dynamoOperation,
  COMPANY_TABLE_NAMES,
  getCurrentTimestamp,
  USER_ROLES
} = require('./shared/company-utils');

/**
 * Handle Paddle webhook events
 * Events: subscription.created, subscription.activated, subscription.updated,
 *         subscription.canceled, subscription.past_due,
 *         transaction.completed, transaction.payment_failed
 */
exports.handler = async (event) => {
  console.log('Paddle Webhook Event Received:', {
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
    // Get Paddle signature from headers
    const paddleSignature = event.headers['paddle-signature'] || event.headers['Paddle-Signature'];

    if (!paddleSignature) {
      console.error('Missing Paddle-Signature header');
      return createErrorResponse(401, 'Missing webhook signature');
    }

    // Verify webhook signature
    const isValid = verifyPaddleWebhook(event.body, paddleSignature);

    if (!isValid) {
      console.error('Invalid webhook signature');
      return createErrorResponse(401, 'Invalid webhook signature');
    }

    // Parse webhook payload
    const webhookData = JSON.parse(event.body);
    const { event_type, data } = webhookData;

    console.log('Processing Paddle Webhook:', {
      eventType: event_type,
      eventId: webhookData.event_id
    });

    // Store webhook event for auditing
    await storeWebhookEvent(webhookData);

    // Route to appropriate handler based on event type
    switch (event_type) {
      case 'subscription.created':
        await handleSubscriptionCreated(data);
        break;

      case 'subscription.activated':
        await handleSubscriptionActivated(data);
        break;

      case 'subscription.updated':
        await handleSubscriptionUpdated(data);
        break;

      case 'subscription.canceled':
        await handleSubscriptionCanceled(data);
        break;

      case 'subscription.past_due':
        await handleSubscriptionPastDue(data);
        break;

      case 'transaction.completed':
        await handleTransactionCompleted(data);
        break;

      case 'transaction.payment_failed':
        await handleTransactionPaymentFailed(data);
        break;

      default:
        console.log(`Unhandled event type: ${event_type}`);
    }

    return createResponse(200, {
      success: true,
      message: `Webhook ${event_type} processed successfully`,
      event_id: webhookData.event_id
    });

  } catch (error) {
    console.error('ERROR processing Paddle webhook:', {
      error: error.message,
      stack: error.stack
    });

    // Return 200 to prevent Paddle from retrying on application errors
    // Log the error for investigation
    return createResponse(200, {
      success: false,
      message: 'Webhook received but processing failed',
      error: error.message
    });
  }
};

/**
 * Store webhook event for auditing
 */
async function storeWebhookEvent(webhookData) {
  const timestamp = getCurrentTimestamp();

  await dynamoOperation('put', {
    TableName: PADDLE_TABLE_NAMES.WEBHOOKS,
    Item: {
      webhookId: webhookData.event_id,
      eventType: webhookData.event_type,
      payload: JSON.stringify(webhookData),
      receivedAt: timestamp,
      processed: true,
      ttl: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60) // 90 days TTL
    }
  });
}

/**
 * Get company ID from subscription custom data
 */
function getCompanyIdFromSubscription(subscriptionData) {
  return subscriptionData.custom_data?.companyId || null;
}

/**
 * Handle subscription.created event
 * Occurs when a new subscription is created
 */
async function handleSubscriptionCreated(subscriptionData) {
  const companyId = getCompanyIdFromSubscription(subscriptionData);

  if (!companyId) {
    console.error('No companyId found in subscription custom_data');
    return;
  }

  console.log(`Subscription created for company: ${companyId}`);

  // Determine tier from price ID
  const priceId = subscriptionData.items[0]?.price?.id;
  const tier = determineTierFromPriceId(priceId);

  // Store subscription record
  await storeSubscription({
    companyId,
    subscriptionId: subscriptionData.id,
    paddleCustomerId: subscriptionData.customer_id,
    currentPlan: tier,
    status: subscriptionData.status,
    nextBillingDate: subscriptionData.next_billed_at,
    scheduledChangeId: subscriptionData.scheduled_change?.id || null
  });

  console.log(`Subscription record created for company: ${companyId}`);
}

/**
 * Handle subscription.activated event
 * Occurs when subscription payment succeeds and becomes active
 * THIS IS WHERE WE CREATE THE COMPANY after successful card validation
 */
async function handleSubscriptionActivated(subscriptionData) {
  const customData = subscriptionData.custom_data || {};
  const companyId = customData.companyId;
  const userId = customData.userId;
  const companyName = customData.companyName;
  const subscriptionTier = customData.subscriptionTier;
  const userEmail = customData.userEmail;

  if (!companyId || !userId || !companyName) {
    console.error('Missing required data in subscription custom_data:', {
      hasCompanyId: !!companyId,
      hasUserId: !!userId,
      hasCompanyName: !!companyName
    });
    return;
  }

  console.log(`Subscription activated - Creating company: ${companyName} for user: ${userId}`);

  // Determine tier from price ID
  const priceId = subscriptionData.items[0]?.price?.id;
  const tier = determineTierFromPriceId(priceId) || subscriptionTier;

  const timestamp = getCurrentTimestamp();

  // Check if company already exists
  const existingCompany = await dynamoOperation('get', {
    TableName: COMPANY_TABLE_NAMES.COMPANIES,
    Key: { companyId }
  });

  // Create or update company record
  if (!existingCompany.Item) {
    console.log(`Creating new company record for ${companyId}`);

    const company = {
      companyId,
      name: companyName,
      description: '',
      industry: '',
      companyAddress: '',
      companyPhone: '',
      logoUrl: '',
      subscriptionTier: tier,
      subscriptionStatus: 'active',
      // Initialize usage counters
      currentProjects: 0,
      currentUsers: 1, // The creator
      currentMonthExpenses: 0,
      // Timestamps
      createdAt: timestamp,
      updatedAt: timestamp,
      // Trial period end date
      trialStartDate: subscriptionData.started_at || timestamp,
      trialEndDate: subscriptionData.next_billed_at || timestamp
    };

    // Only add companyEmail if userEmail is not empty
    if (userEmail && userEmail.trim().length > 0) {
      company.companyEmail = userEmail.trim();
    }

    await dynamoOperation('put', {
      TableName: COMPANY_TABLE_NAMES.COMPANIES,
      Item: company
    });

    console.log(`Company ${companyId} created successfully`);
  } else {
    console.log(`Company ${companyId} already exists, updating subscription status`);

    // Update existing company's subscription status
    await dynamoOperation('update', {
      TableName: COMPANY_TABLE_NAMES.COMPANIES,
      Key: { companyId },
      UpdateExpression: 'SET subscriptionTier = :tier, subscriptionStatus = :status, updatedAt = :updated',
      ExpressionAttributeValues: {
        ':tier': tier,
        ':status': 'active',
        ':updated': timestamp
      }
    });
  }

  // Check if admin user already exists
  const existingUser = await dynamoOperation('get', {
    TableName: COMPANY_TABLE_NAMES.USERS,
    Key: { companyId, userId }
  });

  // Create admin user record if it doesn't exist
  if (!existingUser.Item) {
    console.log(`Creating admin user record for ${userId}`);

    const adminUser = {
      companyId,
      userId,
      name: '', // Will be updated when user updates profile
      role: USER_ROLES.ADMIN,
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp
    };

    // Only add email if it's not empty (DynamoDB GSI doesn't allow empty strings)
    if (userEmail && userEmail.trim().length > 0) {
      adminUser.email = userEmail.trim();
    }

    await dynamoOperation('put', {
      TableName: COMPANY_TABLE_NAMES.USERS,
      Item: adminUser
    });

    console.log(`Admin user ${userId} created successfully`);
  }

  // Update or create subscription record
  await dynamoOperation('put', {
    TableName: PADDLE_TABLE_NAMES.SUBSCRIPTIONS,
    Item: {
      companyId,
      subscriptionId: subscriptionData.id,
      paddleCustomerId: subscriptionData.customer_id,
      currentPlan: tier,
      subscriptionStatus: 'active',
      nextBillingDate: subscriptionData.next_billed_at,
      scheduledChangeId: subscriptionData.scheduled_change?.id || null,
      createdAt: timestamp,
      updatedAt: timestamp
    }
  });

  console.log(`Company ${companyId} fully activated with ${tier} tier. User ${userId} can now access the system.`);
}

/**
 * Handle subscription.updated event
 * Occurs when subscription changes (upgrade, downgrade, renewal)
 */
async function handleSubscriptionUpdated(subscriptionData) {
  const companyId = getCompanyIdFromSubscription(subscriptionData);

  if (!companyId) {
    console.error('No companyId found in subscription custom_data');
    return;
  }

  console.log(`Subscription updated for company: ${companyId}`);

  // Determine tier from price ID
  const priceId = subscriptionData.items[0]?.price?.id;
  const tier = determineTierFromPriceId(priceId);

  // Update subscription record
  await dynamoOperation('update', {
    TableName: PADDLE_TABLE_NAMES.SUBSCRIPTIONS,
    Key: { companyId },
    UpdateExpression: 'SET currentPlan = :plan, subscriptionStatus = :status, nextBillingDate = :nextBilling, scheduledChangeId = :scheduleId, updatedAt = :updated',
    ExpressionAttributeValues: {
      ':plan': tier,
      ':status': subscriptionData.status,
      ':nextBilling': subscriptionData.next_billed_at,
      ':scheduleId': subscriptionData.scheduled_change?.id || null,
      ':updated': getCurrentTimestamp()
    }
  });

  // Update company tier
  await dynamoOperation('update', {
    TableName: COMPANY_TABLE_NAMES.COMPANIES,
    Key: { companyId },
    UpdateExpression: 'SET subscriptionTier = :tier, subscriptionStatus = :status, updatedAt = :updated',
    ExpressionAttributeValues: {
      ':tier': tier,
      ':status': subscriptionData.status,
      ':updated': getCurrentTimestamp()
    }
  });

  console.log(`Company ${companyId} updated to ${tier} tier`);
}

/**
 * Handle subscription.canceled event
 * Occurs when subscription is canceled
 */
async function handleSubscriptionCanceled(subscriptionData) {
  const companyId = getCompanyIdFromSubscription(subscriptionData);

  if (!companyId) {
    console.error('No companyId found in subscription custom_data');
    return;
  }

  console.log(`Subscription canceled for company: ${companyId}`);

  // Update subscription status
  await dynamoOperation('update', {
    TableName: PADDLE_TABLE_NAMES.SUBSCRIPTIONS,
    Key: { companyId },
    UpdateExpression: 'SET subscriptionStatus = :status, canceledAt = :canceled, updatedAt = :updated',
    ExpressionAttributeValues: {
      ':status': 'canceled',
      ':canceled': subscriptionData.canceled_at || getCurrentTimestamp(),
      ':updated': getCurrentTimestamp()
    }
  });

  // Update company status to canceled (they can still access until end of billing period)
  await dynamoOperation('update', {
    TableName: COMPANY_TABLE_NAMES.COMPANIES,
    Key: { companyId },
    UpdateExpression: 'SET subscriptionStatus = :status, updatedAt = :updated',
    ExpressionAttributeValues: {
      ':status': 'canceled',
      ':updated': getCurrentTimestamp()
    }
  });

  console.log(`Company ${companyId} subscription canceled`);
}

/**
 * Handle subscription.past_due event
 * Occurs when payment fails and subscription enters grace period
 */
async function handleSubscriptionPastDue(subscriptionData) {
  const companyId = getCompanyIdFromSubscription(subscriptionData);

  if (!companyId) {
    console.error('No companyId found in subscription custom_data');
    return;
  }

  console.log(`Subscription past due for company: ${companyId}`);

  // Update subscription status to past_due
  await dynamoOperation('update', {
    TableName: PADDLE_TABLE_NAMES.SUBSCRIPTIONS,
    Key: { companyId },
    UpdateExpression: 'SET subscriptionStatus = :status, updatedAt = :updated',
    ExpressionAttributeValues: {
      ':status': 'past_due',
      ':updated': getCurrentTimestamp()
    }
  });

  // Update company status
  await dynamoOperation('update', {
    TableName: COMPANY_TABLE_NAMES.COMPANIES,
    Key: { companyId },
    UpdateExpression: 'SET subscriptionStatus = :status, updatedAt = :updated',
    ExpressionAttributeValues: {
      ':status': 'past_due',
      ':updated': getCurrentTimestamp()
    }
  });

  console.log(`Company ${companyId} marked as past_due`);
  // TODO: Send email notification to company admin
}

/**
 * Handle transaction.completed event
 * Occurs when payment succeeds
 */
async function handleTransactionCompleted(transactionData) {
  const companyId = transactionData.custom_data?.companyId;

  if (!companyId) {
    console.log('No companyId in transaction custom_data - might be initial checkout');
    return;
  }

  console.log(`Transaction completed for company: ${companyId}`);

  // Store payment record
  await storePayment({
    paymentId: transactionData.id,
    companyId,
    subscriptionId: transactionData.subscription_id,
    amount: transactionData.details?.totals?.total,
    currency: transactionData.currency_code,
    status: 'completed',
    paymentMethod: transactionData.payment_method_id,
    paidAt: transactionData.billed_at || getCurrentTimestamp()
  });

  console.log(`Payment record stored for company: ${companyId}`);
  // TODO: Send receipt email
}

/**
 * Handle transaction.payment_failed event
 * Occurs when payment fails
 */
async function handleTransactionPaymentFailed(transactionData) {
  const companyId = transactionData.custom_data?.companyId;

  if (!companyId) {
    console.log('No companyId in transaction custom_data');
    return;
  }

  console.log(`Payment failed for company: ${companyId}`);

  // Store failed payment record
  await storePayment({
    paymentId: transactionData.id,
    companyId,
    subscriptionId: transactionData.subscription_id,
    amount: transactionData.details?.totals?.total,
    currency: transactionData.currency_code,
    status: 'failed',
    paymentMethod: transactionData.payment_method_id,
    paidAt: getCurrentTimestamp()
  });

  console.log(`Failed payment recorded for company: ${companyId}`);
  // TODO: Send payment failure notification
}

/**
 * Determine subscription tier from Paddle Price ID
 */
function determineTierFromPriceId(priceId) {
  const PRICE_TO_TIER_MAP = {
    'pri_01k9f1wq2ffpb9abm3kcr9t77f': 'starter',
    'pri_01k9f1y03zd5f3cxwnnza118r2': 'professional',
    'pri_01k9f1yt0hm9767jh0htqbp6t1': 'enterprise'
  };

  return PRICE_TO_TIER_MAP[priceId] || 'starter';
}
