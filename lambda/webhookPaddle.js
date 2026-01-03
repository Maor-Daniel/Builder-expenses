// lambda/webhookPaddle.js
// Paddle webhook handler for subscription and payment events
//
// Features:
// - Retry logic with exponential backoff (5 retries)
// - DynamoDB-based dead-letter queue for failed webhooks
// - Idempotency checks to prevent duplicate processing
// - Structured logging for CloudWatch Logs Insights

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
  USER_ROLES,
  SYSTEM_PROJECTS,
  SYSTEM_CONTRACTORS
} = require('./shared/company-utils');
const { withSecureCors } = require('./shared/cors-config');
const { createLogger } = require('./shared/logger');
const {
  executeWithRetry,
  addToDLQ,
  isWebhookProcessed
} = require('./shared/webhook-retry-utils');

const logger = createLogger('webhookPaddle');

/**
 * Handle Paddle webhook events
 * Events: subscription.created, subscription.activated, subscription.updated,
 *         subscription.canceled, subscription.past_due,
 *         transaction.completed, transaction.payment_failed
 */
exports.handler = withSecureCors(async (event, context) => {
  // Generate correlation ID for request tracing
  const correlationId = context?.awsRequestId || `corr_${Date.now()}`;
  logger.setRequestId(correlationId);

  logger.info('Paddle Webhook Event Received', {
    correlationId,
    hasSignature: !!(event.headers['paddle-signature'] || event.headers['Paddle-Signature']),
    httpMethod: event.httpMethod
  });

  if (event.httpMethod !== 'POST') {
    return createErrorResponse(405, 'Method not allowed');
  }

  try {
    // Get Paddle signature from headers
    const paddleSignature = event.headers['paddle-signature'] || event.headers['Paddle-Signature'];

    if (!paddleSignature) {
      logger.warn('Missing Paddle-Signature header', { correlationId });
      return createErrorResponse(401, 'Missing webhook signature');
    }

    // Verify webhook signature
    const isValid = verifyPaddleWebhook(event.body, paddleSignature);

    if (!isValid) {
      logger.warn('Invalid webhook signature', { correlationId });
      return createErrorResponse(401, 'Invalid webhook signature');
    }

    // Parse webhook payload
    const webhookData = JSON.parse(event.body);
    const { event_type, event_id, data } = webhookData;
    const companyId = data?.custom_data?.companyId;

    logger.info('Processing Paddle Webhook', {
      correlationId,
      eventType: event_type,
      eventId: event_id,
      companyId
    });

    // IDEMPOTENCY CHECK: Has this webhook already been processed?
    const alreadyProcessed = await isWebhookProcessed(event_id);
    if (alreadyProcessed) {
      logger.info('Webhook already processed, skipping', {
        correlationId,
        eventId: event_id,
        eventType: event_type
      });
      return createResponse(200, {
        success: true,
        message: 'Webhook already processed (idempotent)',
        event_id
      });
    }

    // Store webhook event for auditing (mark as processing)
    await storeWebhookEvent(webhookData, 'processing');

    // Route to handler - use retry logic for critical subscription.activated event
    let processingResult;

    if (event_type === 'subscription.activated') {
      // Critical event - company creation. Use retry logic with exponential backoff
      const retryContext = {
        correlationId,
        eventId: event_id,
        eventType: event_type,
        companyId
      };

      processingResult = await executeWithRetry(
        () => handleSubscriptionActivated(data, correlationId),
        retryContext,
        logger
      );
    } else {
      // Non-critical events - standard processing without retry
      processingResult = await processStandardEvent(event_type, data, correlationId);
    }

    if (processingResult.success) {
      // Update webhook record to processed
      await updateWebhookStatus(event_id, 'processed');

      logger.info('Webhook processed successfully', {
        correlationId,
        eventId: event_id,
        eventType: event_type,
        retryCount: processingResult.retryCount || 0
      });

      return createResponse(200, {
        success: true,
        message: `Webhook ${event_type} processed successfully`,
        event_id,
        retryCount: processingResult.retryCount || 0
      });
    } else {
      // Processing failed after all retries
      logger.error('Webhook processing failed after all retries', {
        correlationId,
        eventId: event_id,
        eventType: event_type,
        companyId,
        error: processingResult.error?.message,
        retryCount: processingResult.retryCount
      });

      // Add to Dead Letter Queue for investigation
      await addToDLQ(
        webhookData,
        processingResult.error,
        processingResult.retryCount,
        processingResult.processingHistory
      );

      // Update webhook record to failed
      await updateWebhookStatus(event_id, 'failed_to_dlq');

      // Return 200 to prevent Paddle from retrying (we handle retries internally)
      return createResponse(200, {
        success: false,
        message: 'Webhook processing failed, added to DLQ for investigation',
        event_id
      });
    }

  } catch (error) {
    logger.error('Unexpected error in webhook handler', {
      correlationId,
      error: error.message,
      stack: error.stack
    });

    // Return 200 to prevent Paddle from retrying on application errors
    return createResponse(200, {
      success: false,
      message: 'Webhook received but processing failed unexpectedly',
      error: error.message
    });
  }
});

/**
 * Process non-critical events without retry logic
 */
async function processStandardEvent(eventType, data, correlationId) {
  try {
    switch (eventType) {
      case 'subscription.created':
        await handleSubscriptionCreated(data, correlationId);
        break;
      case 'subscription.updated':
        await handleSubscriptionUpdated(data, correlationId);
        break;
      case 'subscription.canceled':
        await handleSubscriptionCanceled(data, correlationId);
        break;
      case 'subscription.past_due':
        await handleSubscriptionPastDue(data, correlationId);
        break;
      case 'transaction.completed':
        await handleTransactionCompleted(data, correlationId);
        break;
      case 'transaction.payment_failed':
        await handleTransactionPaymentFailed(data, correlationId);
        break;
      default:
        logger.info(`Unhandled event type: ${eventType}`, { correlationId });
    }
    return { success: true, retryCount: 0 };
  } catch (error) {
    logger.error('Standard event processing failed', {
      correlationId,
      eventType,
      error: error.message
    });
    return { success: false, error, retryCount: 0 };
  }
}

/**
 * Store webhook event for auditing
 * @param {Object} webhookData - Full webhook payload
 * @param {string} status - Initial status: 'received' | 'processing' | 'processed' | 'failed_to_dlq'
 */
async function storeWebhookEvent(webhookData, status = 'received') {
  const timestamp = getCurrentTimestamp();

  await dynamoOperation('put', {
    TableName: PADDLE_TABLE_NAMES.WEBHOOKS,
    Item: {
      webhookId: webhookData.event_id,
      eventType: webhookData.event_type,
      payload: JSON.stringify(webhookData),
      companyId: webhookData.data?.custom_data?.companyId || null,
      status,
      receivedAt: timestamp,
      updatedAt: timestamp,
      ttl: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60) // 90 days TTL
    }
  });
}

/**
 * Update webhook status in the webhooks table
 * @param {string} webhookId - Paddle event ID
 * @param {string} status - New status: 'processed' | 'failed_to_dlq'
 */
async function updateWebhookStatus(webhookId, status) {
  await dynamoOperation('update', {
    TableName: PADDLE_TABLE_NAMES.WEBHOOKS,
    Key: { webhookId },
    UpdateExpression: 'SET #status = :status, updatedAt = :updated',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: {
      ':status': status,
      ':updated': getCurrentTimestamp()
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
 * For trial subscriptions, this is where we update the company record
 * (subscription.activated is only sent after trial ends)
 */
async function handleSubscriptionCreated(subscriptionData, correlationId) {
  // Extract custom data for company creation
  const customData = subscriptionData.custom_data || {};
  const companyId = customData.companyId;
  const userId = customData.userId;
  const companyName = customData.companyName;
  const subscriptionTier = customData.subscriptionTier;
  const userEmail = customData.userEmail;

  // Validation - throw error for missing data
  if (!companyId || !userId || !companyName) {
    const error = new Error('Missing required data in subscription custom_data');
    error.isValidation = true; // Mark as non-retryable
    logger.error('Missing required data in subscription custom_data', {
      correlationId,
      hasCompanyId: !!companyId,
      hasUserId: !!userId,
      hasCompanyName: !!companyName
    });
    throw error;
  }

  logger.info('Subscription created', { correlationId, companyId, companyName });

  // Determine tier from price ID
  const priceId = subscriptionData.items[0]?.price?.id;
  const tier = determineTierFromPriceId(priceId) || subscriptionTier;
  const timestamp = getCurrentTimestamp();

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

  logger.info('Subscription record created', { correlationId, companyId, tier });

  // CRITICAL: Create company if it doesn't exist
  // This is essential for trial subscriptions where subscription.activated isn't sent
  const existingCompany = await dynamoOperation('get', {
    TableName: COMPANY_TABLE_NAMES.COMPANIES,
    Key: { companyId }
  });

  let companyCreated = false;

  if (!existingCompany.Item) {
    logger.info('Creating new company record (trial subscription)', { correlationId, companyId });

    const company = {
      companyId,
      name: companyName,
      description: '',
      industry: '',
      companyAddress: '',
      companyPhone: '',
      logoUrl: '',
      subscriptionTier: tier,
      subscriptionStatus: subscriptionData.status, // 'trialing' or 'active'
      subscriptionId: subscriptionData.id,
      paddleCustomerId: subscriptionData.customer_id,
      nextBillingDate: subscriptionData.next_billed_at,
      // Initialize usage counters
      currentProjects: 0,
      currentUsers: 1, // The creator
      currentMonthExpenses: 0,
      // Timestamps
      createdAt: timestamp,
      updatedAt: timestamp,
      // Trial period dates
      trialStartDate: subscriptionData.started_at || timestamp,
      trialEndDate: subscriptionData.next_billed_at || timestamp
    };

    // Only add companyEmail if userEmail is not empty
    if (userEmail && userEmail.trim().length > 0) {
      company.companyEmail = userEmail.trim();
    }

    try {
      await dynamoOperation('put', {
        TableName: COMPANY_TABLE_NAMES.COMPANIES,
        Item: company,
        ConditionExpression: 'attribute_not_exists(companyId)'
      });
      companyCreated = true;
      logger.info('Company created successfully', { correlationId, companyId, tier });
    } catch (error) {
      if (error.name === 'ConditionalCheckFailedException') {
        logger.info('Company already created by concurrent request', { correlationId, companyId });
      } else {
        throw error;
      }
    }

    // Create admin user
    try {
      const adminUser = {
        companyId,
        userId,
        name: '',
        role: USER_ROLES.ADMIN,
        status: 'active',
        createdAt: timestamp,
        updatedAt: timestamp
      };

      if (userEmail && userEmail.trim().length > 0) {
        adminUser.email = userEmail.trim();
      }

      await dynamoOperation('put', {
        TableName: COMPANY_TABLE_NAMES.USERS,
        Item: adminUser,
        ConditionExpression: 'attribute_not_exists(userId)'
      });
      logger.info('Admin user created', { correlationId, companyId, userId });
    } catch (error) {
      if (error.name === 'ConditionalCheckFailedException') {
        logger.info('Admin user already exists', { correlationId, companyId, userId });
      } else {
        throw error;
      }
    }

    // Create system entities (General Expenses project and General Contractor)
    await createSystemEntities(companyId, userId, timestamp, correlationId);

    logger.info('Company fully created from subscription.created', {
      correlationId,
      companyId,
      userId,
      tier,
      status: subscriptionData.status
    });
  } else {
    // Company exists, just update subscription info
    logger.info('Company already exists, updating subscription info', {
      correlationId,
      companyId,
      existingStatus: existingCompany.Item.subscriptionStatus
    });

    await dynamoOperation('update', {
      TableName: COMPANY_TABLE_NAMES.COMPANIES,
      Key: { companyId },
      UpdateExpression: 'SET subscriptionTier = :tier, subscriptionStatus = :status, subscriptionId = :subId, paddleCustomerId = :custId, nextBillingDate = :nextBilling, updatedAt = :updated',
      ExpressionAttributeValues: {
        ':tier': tier,
        ':status': subscriptionData.status,
        ':subId': subscriptionData.id,
        ':custId': subscriptionData.customer_id,
        ':nextBilling': subscriptionData.next_billed_at,
        ':updated': timestamp
      }
    });

    logger.info('Company updated with subscription info', {
      correlationId,
      companyId,
      tier,
      status: subscriptionData.status
    });
  }
}

/**
 * Handle subscription.activated event
 * Occurs when subscription payment succeeds and becomes active
 * THIS IS WHERE WE CREATE THE COMPANY after successful card validation
 * Uses conditional writes for idempotency to prevent race conditions
 */
async function handleSubscriptionActivated(subscriptionData, correlationId) {
  const customData = subscriptionData.custom_data || {};
  const companyId = customData.companyId;
  const userId = customData.userId;
  const companyName = customData.companyName;
  const subscriptionTier = customData.subscriptionTier;
  const userEmail = customData.userEmail;

  // Validation - throw error to trigger retry for missing data
  if (!companyId || !userId || !companyName) {
    const error = new Error('Missing required data in subscription custom_data');
    error.isValidation = true; // Mark as non-retryable
    logger.error('Missing required data in subscription custom_data', {
      correlationId,
      hasCompanyId: !!companyId,
      hasUserId: !!userId,
      hasCompanyName: !!companyName
    });
    throw error;
  }

  logger.info('Subscription activated - Creating company', {
    correlationId,
    companyId,
    userId,
    companyName
  });

  // Determine tier from price ID
  const priceId = subscriptionData.items[0]?.price?.id;
  const tier = determineTierFromPriceId(priceId) || subscriptionTier;

  const timestamp = getCurrentTimestamp();

  // IDEMPOTENCY: Check if company already exists
  const existingCompany = await dynamoOperation('get', {
    TableName: COMPANY_TABLE_NAMES.COMPANIES,
    Key: { companyId }
  });

  let companyCreated = false;

  // Create or update company record
  if (!existingCompany.Item) {
    logger.info('Creating new company record', { correlationId, companyId });

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

    try {
      // CONDITIONAL WRITE: Only create if doesn't exist (prevents race conditions)
      await dynamoOperation('put', {
        TableName: COMPANY_TABLE_NAMES.COMPANIES,
        Item: company,
        ConditionExpression: 'attribute_not_exists(companyId)'
      });
      companyCreated = true;
      logger.info('Company created successfully', { correlationId, companyId, tier });
    } catch (error) {
      if (error.name === 'ConditionalCheckFailedException') {
        // Race condition - company was created by another concurrent request
        logger.info('Company already created by concurrent request', { correlationId, companyId });
      } else {
        throw error; // Re-throw for retry
      }
    }
  } else {
    logger.info('Company already exists, updating subscription status', {
      correlationId,
      companyId,
      existingStatus: existingCompany.Item.subscriptionStatus
    });

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

  // Create admin user with conditional write
  try {
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
      Item: adminUser,
      ConditionExpression: 'attribute_not_exists(userId)'
    });
    logger.info('Admin user created', { correlationId, companyId, userId });
  } catch (error) {
    if (error.name === 'ConditionalCheckFailedException') {
      logger.info('Admin user already exists', { correlationId, companyId, userId });
    } else {
      throw error;
    }
  }

  // Create system entities with conditional writes (only for new companies)
  if (!existingCompany.Item || companyCreated) {
    await createSystemEntities(companyId, userId, timestamp, correlationId);
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

  logger.info('Company fully activated', {
    correlationId,
    companyId,
    userId,
    tier,
    subscriptionId: subscriptionData.id
  });

  return { success: true, companyId, tier };
}

/**
 * Create system entities (General Expenses project and General Contractor)
 * Uses conditional writes for idempotency
 */
async function createSystemEntities(companyId, userId, timestamp, correlationId) {
  // Create General Expenses project with conditional write
  try {
    const generalExpensesProject = {
      companyId,
      projectId: SYSTEM_PROJECTS.GENERAL_EXPENSES.projectId,
      userId: userId,
      name: SYSTEM_PROJECTS.GENERAL_EXPENSES.name,
      description: SYSTEM_PROJECTS.GENERAL_EXPENSES.description,
      isSystemProject: true,
      startDate: timestamp.substring(0, 10), // YYYY-MM-DD format
      endDate: null,
      status: 'active',
      budget: 0,
      spentAmount: 0,
      location: '',
      clientName: '',
      createdAt: timestamp,
      updatedAt: timestamp
    };

    await dynamoOperation('put', {
      TableName: COMPANY_TABLE_NAMES.PROJECTS,
      Item: generalExpensesProject,
      ConditionExpression: 'attribute_not_exists(projectId)'
    });
    logger.info('General Expenses project created', { correlationId, companyId });
  } catch (error) {
    if (error.name === 'ConditionalCheckFailedException') {
      logger.info('General Expenses project already exists', { correlationId, companyId });
    } else {
      throw error;
    }
  }

  // Create General Contractor with conditional write
  try {
    const generalContractor = {
      companyId,
      contractorId: SYSTEM_CONTRACTORS.GENERAL_CONTRACTOR.contractorId,
      userId: userId,
      name: SYSTEM_CONTRACTORS.GENERAL_CONTRACTOR.name,
      contactPerson: '',
      phone: '',
      email: '',
      address: '',
      specialty: 'כללי',
      licenseNumber: '',
      taxId: '',
      paymentTerms: '',
      notes: SYSTEM_CONTRACTORS.GENERAL_CONTRACTOR.description,
      isSystemContractor: true,
      status: 'active',
      rating: null,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    await dynamoOperation('put', {
      TableName: COMPANY_TABLE_NAMES.CONTRACTORS,
      Item: generalContractor,
      ConditionExpression: 'attribute_not_exists(contractorId)'
    });
    logger.info('General Contractor created', { correlationId, companyId });
  } catch (error) {
    if (error.name === 'ConditionalCheckFailedException') {
      logger.info('General Contractor already exists', { correlationId, companyId });
    } else {
      throw error;
    }
  }
}

/**
 * Handle subscription.updated event
 * Occurs when subscription changes (upgrade, downgrade, renewal)
 */
async function handleSubscriptionUpdated(subscriptionData, correlationId) {
  const companyId = getCompanyIdFromSubscription(subscriptionData);

  if (!companyId) {
    logger.error('No companyId found in subscription custom_data', { correlationId });
    return;
  }

  logger.info('Subscription updated', { correlationId, companyId });

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

  logger.info('Company subscription updated', { correlationId, companyId, tier, status: subscriptionData.status });
}

/**
 * Handle subscription.canceled event
 * Occurs when subscription is canceled
 */
async function handleSubscriptionCanceled(subscriptionData, correlationId) {
  const companyId = getCompanyIdFromSubscription(subscriptionData);

  if (!companyId) {
    logger.error('No companyId found in subscription custom_data', { correlationId });
    return;
  }

  logger.info('Subscription canceled', { correlationId, companyId });

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

  logger.info('Company subscription canceled', { correlationId, companyId });
}

/**
 * Handle subscription.past_due event
 * Occurs when payment fails and subscription enters grace period
 */
async function handleSubscriptionPastDue(subscriptionData, correlationId) {
  const companyId = getCompanyIdFromSubscription(subscriptionData);

  if (!companyId) {
    logger.error('No companyId found in subscription custom_data', { correlationId });
    return;
  }

  logger.warn('Subscription past due', { correlationId, companyId });

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

  logger.warn('Company marked as past_due', { correlationId, companyId });
  // Note: Paddle automatically sends payment failure emails to the customer.
  // Additional notification can be configured in Paddle dashboard under Notifications.
}

/**
 * Handle transaction.completed event
 * Occurs when payment succeeds
 */
async function handleTransactionCompleted(transactionData, correlationId) {
  const companyId = transactionData.custom_data?.companyId;

  if (!companyId) {
    logger.info('No companyId in transaction custom_data - might be initial checkout', { correlationId });
    return;
  }

  logger.info('Transaction completed', { correlationId, companyId, transactionId: transactionData.id });

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

  logger.info('Payment record stored', { correlationId, companyId });
  // Note: Paddle automatically sends payment receipts to the customer.
  // Receipt templates can be customized in Paddle dashboard.
}

/**
 * Handle transaction.payment_failed event
 * Occurs when payment fails
 */
async function handleTransactionPaymentFailed(transactionData, correlationId) {
  const companyId = transactionData.custom_data?.companyId;

  if (!companyId) {
    logger.info('No companyId in transaction custom_data', { correlationId });
    return;
  }

  logger.warn('Payment failed', { correlationId, companyId, transactionId: transactionData.id });

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

  logger.warn('Failed payment recorded', { correlationId, companyId });
  // Note: Paddle automatically sends payment failure notifications to the customer.
  // Dunning settings can be configured in Paddle dashboard.
}

/**
 * Determine subscription tier from Paddle Price ID
 * Updated: 2026-01-02 - Production Price IDs
 */
function determineTierFromPriceId(priceId) {
  const PRICE_TO_TIER_MAP = {
    // Production Price IDs (updated 2026-01-01)
    'pri_01kdwqn0d0ebbev71xa0v6e2hd': 'starter',       // ₪50/month
    'pri_01kdwqsgm7mcr7myg3cxnrxt9y': 'professional',  // ₪100/month
    'pri_01kdwqwn1e1z4xc93rgstytpj1': 'enterprise',    // ₪150/month

    // Legacy/Sandbox Price IDs (for backwards compatibility)
    'pri_01k9f1wq2ffpb9abm3kcr9t77f': 'starter',
    'pri_01k9f1y03zd5f3cxwnnza118r2': 'professional',
    'pri_01k9f1yt0hm9767jh0htqbp6t1': 'enterprise'
  };

  return PRICE_TO_TIER_MAP[priceId] || 'starter';
}
