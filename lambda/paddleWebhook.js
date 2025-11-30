// lambda/paddleWebhook.js
// Handle Paddle webhook events for subscription management

const {
  verifyPaddleWebhook,
  storeSubscription,
  storePayment,
  createResponse,
  createErrorResponse,
  PADDLE_TABLE_NAMES
} = require('./shared/paddle-utils');

const {
  dynamoOperation,
  COMPANY_TABLE_NAMES
} = require('./shared/company-utils');

exports.handler = async (event) => {

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return createResponse(200, { message: 'CORS preflight for Paddle webhook' });
  }

  if (event.httpMethod !== 'POST') {
    return createErrorResponse(405, 'Method not allowed');
  }

  try {
    // Parse webhook body
    const webhookBody = event.body;
    if (!webhookBody) {
      return createErrorResponse(400, 'Missing webhook body');
    }

    // Verify webhook signature
    const signature = event.headers['paddle-signature'] || event.headers['Paddle-Signature'];
    const isValidSignature = await verifyPaddleWebhook(webhookBody, signature);
    if (!isValidSignature) {
      return createErrorResponse(401, 'Invalid webhook signature');
    }

    // Parse webhook data
    let webhookData;
    try {
      // Modern Paddle sends JSON data
      webhookData = JSON.parse(webhookBody);
    } catch (parseError) {
      return createErrorResponse(400, 'Invalid webhook data format');
    }


    // Route webhook based on modern event types
    switch (webhookData.event_type) {
      case 'subscription.created':
        await handleSubscriptionCreated(webhookData);
        break;

      case 'subscription.updated':
        await handleSubscriptionUpdated(webhookData);
        break;

      case 'subscription.canceled':
        await handleSubscriptionCancelled(webhookData);
        break;

      case 'transaction.completed':
        await handlePaymentSucceeded(webhookData);
        break;

      case 'transaction.payment_failed':
        await handlePaymentFailed(webhookData);
        break;

      case 'adjustment.created':
        await handlePaymentRefunded(webhookData);
        break;

      default:
    }

    // Store webhook for audit trail
    await storeWebhookEvent(webhookData);

    return createResponse(200, { 
      success: true, 
      message: 'Webhook processed successfully',
      event_type: webhookData.event_type
    });

  } catch (error) {
    return createErrorResponse(500, 'Internal server error processing webhook');
  }
};

/**
 * Handle subscription created
 */
async function handleSubscriptionCreated(webhookData) {
  const subscription = webhookData.data;

  const companyId = subscription.custom_data?.companyId;
  if (!companyId) {
    throw new Error('Missing companyId in webhook custom_data');
  }

  // Determine plan based on price_id from first item
  const priceId = subscription.items?.[0]?.price?.id;
  const planName = determinePlanFromPriceId(priceId);

  // Store subscription
  await storeSubscription({
    companyId,
    subscriptionId: subscription.id,
    paddleCustomerId: subscription.customer_id,
    currentPlan: planName,
    status: subscription.status,
    nextBillingDate: subscription.next_billed_at,
    scheduledChangeId: subscription.scheduled_change?.id || null
  });

  // Update company record
  await dynamoOperation('update', {
    TableName: COMPANY_TABLE_NAMES.COMPANIES,
    Key: { companyId },
    UpdateExpression: 'SET paddleCustomerId = :customerId, subscriptionId = :subId, subscriptionStatus = :status, currentPlan = :plan, nextBillingDate = :billDate, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':customerId': subscription.customer_id,
      ':subId': subscription.id,
      ':status': subscription.status,
      ':plan': planName,
      ':billDate': subscription.next_billed_at,
      ':updatedAt': new Date().toISOString()
    }
  });

}

/**
 * Handle subscription updated
 */
async function handleSubscriptionUpdated(webhookData) {
  const subscription = webhookData.data;

  const companyId = subscription.custom_data?.companyId;
  if (!companyId) {
    throw new Error('Missing companyId in webhook custom_data');
  }

  // Determine plan based on price_id from first item
  const priceId = subscription.items?.[0]?.price?.id;
  const planName = determinePlanFromPriceId(priceId);

  // Update subscription record
  await dynamoOperation('update', {
    TableName: PADDLE_TABLE_NAMES.SUBSCRIPTIONS,
    Key: { companyId },
    UpdateExpression: 'SET currentPlan = :plan, subscriptionStatus = :status, nextBillingDate = :billDate, scheduledChangeId = :changeId, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':plan': planName,
      ':status': subscription.status,
      ':billDate': subscription.next_billed_at,
      ':changeId': subscription.scheduled_change?.id || null,
      ':updatedAt': new Date().toISOString()
    }
  });

  // Update company record
  await dynamoOperation('update', {
    TableName: COMPANY_TABLE_NAMES.COMPANIES,
    Key: { companyId },
    UpdateExpression: 'SET currentPlan = :plan, subscriptionStatus = :status, nextBillingDate = :billDate, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':plan': planName,
      ':status': subscription.status,
      ':billDate': subscription.next_billed_at,
      ':updatedAt': new Date().toISOString()
    }
  });

}

/**
 * Handle subscription cancelled
 */
async function handleSubscriptionCancelled(webhookData) {
  const subscription = webhookData.data;

  const companyId = subscription.custom_data?.companyId;
  if (!companyId) {
    throw new Error('Missing companyId in webhook custom_data');
  }

  // Update subscription status
  await dynamoOperation('update', {
    TableName: PADDLE_TABLE_NAMES.SUBSCRIPTIONS,
    Key: { companyId },
    UpdateExpression: 'SET subscriptionStatus = :status, cancelledAt = :cancelledAt, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':status': 'cancelled',
      ':cancelledAt': new Date().toISOString(),
      ':updatedAt': new Date().toISOString()
    }
  });

  // Update company record
  await dynamoOperation('update', {
    TableName: COMPANY_TABLE_NAMES.COMPANIES,
    Key: { companyId },
    UpdateExpression: 'SET subscriptionStatus = :status, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':status': 'cancelled',
      ':updatedAt': new Date().toISOString()
    }
  });

}

/**
 * Handle payment succeeded
 */
async function handlePaymentSucceeded(webhookData) {
  const transaction = webhookData.data;

  const companyId = transaction.custom_data?.companyId;

  // Store payment record
  await storePayment({
    paymentId: transaction.id,
    companyId: companyId,
    subscriptionId: transaction.subscription_id,
    amount: parseFloat(transaction.details.totals.total),
    currency: transaction.currency_code,
    status: 'succeeded',
    paymentMethod: transaction.payments?.[0]?.method_details?.type || 'unknown',
    paidAt: transaction.billed_at || new Date().toISOString()
  });

}

/**
 * Handle payment failed
 */
async function handlePaymentFailed(webhookData) {
  const transaction = webhookData.data;

  const companyId = transaction.custom_data?.companyId;

  // Store failed payment record
  await storePayment({
    paymentId: transaction.id,
    companyId: companyId,
    subscriptionId: transaction.subscription_id,
    amount: parseFloat(transaction.details?.totals?.total || 0),
    currency: transaction.currency_code,
    status: 'failed',
    paymentMethod: transaction.payments?.[0]?.method_details?.type || 'unknown',
    paidAt: transaction.billed_at || new Date().toISOString()
  });

  // Update subscription status if needed
  if (companyId) {
    await dynamoOperation('update', {
      TableName: COMPANY_TABLE_NAMES.COMPANIES,
      Key: { companyId },
      UpdateExpression: 'SET subscriptionStatus = :status, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':status': 'past_due',
        ':updatedAt': new Date().toISOString()
      }
    });
  }

}

/**
 * Handle payment refunded
 */
async function handlePaymentRefunded(webhookData) {

  const companyId = webhookData.passthrough?.companyId;

  // Store refund record
  await storePayment({
    paymentId: `refund_${webhookData.order_id}`,
    companyId: companyId,
    subscriptionId: webhookData.subscription_id,
    amount: -parseFloat(webhookData.gross), // negative for refund
    currency: webhookData.currency,
    status: 'refunded',
    paymentMethod: webhookData.payment_method,
    paidAt: new Date().toISOString()
  });

}

/**
 * Determine plan name from Paddle price ID
 */
function determinePlanFromPriceId(priceId) {
  // Map Paddle price IDs to our internal plan names
  // These would be configured in your Paddle dashboard
  const planMapping = {
    [process.env.PADDLE_STARTER_PRICE_ID]: 'STARTER',
    [process.env.PADDLE_PRO_PRICE_ID]: 'PROFESSIONAL', 
    [process.env.PADDLE_ENTERPRISE_PRICE_ID]: 'ENTERPRISE'
  };

  return planMapping[priceId] || 'STARTER';
}

/**
 * Store webhook event for audit trail
 */
async function storeWebhookEvent(webhookData) {
  const params = {
    TableName: PADDLE_TABLE_NAMES.WEBHOOKS,
    Item: {
      webhookId: `${webhookData.event_type}_${webhookData.notification_id}_${Date.now()}`,
      eventType: webhookData.event_type,
      notificationId: webhookData.notification_id,
      subscriptionId: webhookData.data?.subscription?.id || webhookData.data?.transaction?.subscription_id,
      customerId: webhookData.data?.subscription?.customer_id || webhookData.data?.transaction?.customer_id,
      companyId: webhookData.data?.subscription?.custom_data?.companyId || webhookData.data?.transaction?.custom_data?.companyId,
      data: webhookData,
      processedAt: new Date().toISOString(),
      ttl: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60) // 90 days TTL
    }
  };

  await dynamoOperation('put', params);
}