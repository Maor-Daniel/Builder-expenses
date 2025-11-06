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
  console.log('Paddle webhook received:', {
    method: event.httpMethod,
    headers: Object.keys(event.headers || {}),
    bodyLength: event.body ? event.body.length : 0
  });

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
    const signature = event.headers['p-signature'] || event.headers['P-Signature'];
    if (!verifyPaddleWebhook(webhookBody, signature)) {
      console.error('Invalid webhook signature');
      return createErrorResponse(401, 'Invalid webhook signature');
    }

    // Parse webhook data
    let webhookData;
    try {
      // Paddle sends data as form-encoded, parse it
      const params = new URLSearchParams(webhookBody);
      webhookData = {
        alert_name: params.get('alert_name'),
        alert_id: params.get('alert_id'),
        subscription_id: params.get('subscription_id'),
        customer_id: params.get('customer_id'),
        email: params.get('email'),
        status: params.get('status'),
        passthrough: params.get('passthrough') ? JSON.parse(params.get('passthrough')) : {},
        // Payment specific fields
        order_id: params.get('order_id'),
        payment_method: params.get('payment_method'),
        currency: params.get('currency'),
        gross: params.get('gross'),
        net: params.get('net'),
        // Subscription specific fields
        subscription_plan_id: params.get('subscription_plan_id'),
        next_bill_date: params.get('next_bill_date'),
        update_url: params.get('update_url'),
        cancel_url: params.get('cancel_url')
      };
    } catch (parseError) {
      console.error('Failed to parse webhook data:', parseError);
      return createErrorResponse(400, 'Invalid webhook data format');
    }

    console.log('Processed webhook data:', {
      alert_name: webhookData.alert_name,
      subscription_id: webhookData.subscription_id,
      customer_id: webhookData.customer_id,
      companyId: webhookData.passthrough?.companyId
    });

    // Route webhook based on alert type
    switch (webhookData.alert_name) {
      case 'subscription_created':
        await handleSubscriptionCreated(webhookData);
        break;

      case 'subscription_updated':
        await handleSubscriptionUpdated(webhookData);
        break;

      case 'subscription_cancelled':
        await handleSubscriptionCancelled(webhookData);
        break;

      case 'subscription_payment_succeeded':
        await handlePaymentSucceeded(webhookData);
        break;

      case 'subscription_payment_failed':
        await handlePaymentFailed(webhookData);
        break;

      case 'subscription_payment_refunded':
        await handlePaymentRefunded(webhookData);
        break;

      default:
        console.log('Unhandled webhook event:', webhookData.alert_name);
    }

    // Store webhook for audit trail
    await storeWebhookEvent(webhookData);

    return createResponse(200, { 
      success: true, 
      message: 'Webhook processed successfully',
      alert_name: webhookData.alert_name
    });

  } catch (error) {
    console.error('Paddle webhook error:', error);
    return createErrorResponse(500, 'Internal server error processing webhook');
  }
};

/**
 * Handle subscription created
 */
async function handleSubscriptionCreated(webhookData) {
  console.log('Processing subscription created:', webhookData.subscription_id);

  const companyId = webhookData.passthrough?.companyId;
  if (!companyId) {
    throw new Error('Missing companyId in webhook passthrough data');
  }

  // Determine plan based on subscription_plan_id
  const planName = determinePlanFromPaddleId(webhookData.subscription_plan_id);

  // Store subscription
  await storeSubscription({
    companyId,
    subscriptionId: webhookData.subscription_id,
    paddleCustomerId: webhookData.customer_id,
    currentPlan: planName,
    status: 'active',
    nextBillingDate: webhookData.next_bill_date,
    updateUrl: webhookData.update_url,
    cancelUrl: webhookData.cancel_url
  });

  // Update company record
  await dynamoOperation('update', {
    TableName: COMPANY_TABLE_NAMES.COMPANIES,
    Key: { companyId },
    UpdateExpression: 'SET paddleCustomerId = :customerId, subscriptionId = :subId, subscriptionStatus = :status, currentPlan = :plan, nextBillingDate = :billDate, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':customerId': webhookData.customer_id,
      ':subId': webhookData.subscription_id,
      ':status': 'active',
      ':plan': planName,
      ':billDate': webhookData.next_bill_date,
      ':updatedAt': new Date().toISOString()
    }
  });

  console.log('Subscription created successfully for company:', companyId);
}

/**
 * Handle subscription updated
 */
async function handleSubscriptionUpdated(webhookData) {
  console.log('Processing subscription updated:', webhookData.subscription_id);

  const companyId = webhookData.passthrough?.companyId;
  if (!companyId) {
    throw new Error('Missing companyId in webhook passthrough data');
  }

  const planName = determinePlanFromPaddleId(webhookData.subscription_plan_id);

  // Update subscription record
  await dynamoOperation('update', {
    TableName: PADDLE_TABLE_NAMES.SUBSCRIPTIONS,
    Key: { companyId },
    UpdateExpression: 'SET currentPlan = :plan, subscriptionStatus = :status, nextBillingDate = :billDate, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':plan': planName,
      ':status': webhookData.status || 'active',
      ':billDate': webhookData.next_bill_date,
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
      ':status': webhookData.status || 'active',
      ':billDate': webhookData.next_bill_date,
      ':updatedAt': new Date().toISOString()
    }
  });

  console.log('Subscription updated successfully for company:', companyId);
}

/**
 * Handle subscription cancelled
 */
async function handleSubscriptionCancelled(webhookData) {
  console.log('Processing subscription cancelled:', webhookData.subscription_id);

  const companyId = webhookData.passthrough?.companyId;
  if (!companyId) {
    throw new Error('Missing companyId in webhook passthrough data');
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

  console.log('Subscription cancelled for company:', companyId);
}

/**
 * Handle payment succeeded
 */
async function handlePaymentSucceeded(webhookData) {
  console.log('Processing payment succeeded:', webhookData.order_id);

  const companyId = webhookData.passthrough?.companyId;

  // Store payment record
  await storePayment({
    paymentId: webhookData.order_id,
    companyId: companyId,
    subscriptionId: webhookData.subscription_id,
    amount: parseFloat(webhookData.gross),
    currency: webhookData.currency,
    status: 'succeeded',
    paymentMethod: webhookData.payment_method,
    paidAt: new Date().toISOString()
  });

  console.log('Payment recorded successfully:', webhookData.order_id);
}

/**
 * Handle payment failed
 */
async function handlePaymentFailed(webhookData) {
  console.log('Processing payment failed:', webhookData.order_id);

  const companyId = webhookData.passthrough?.companyId;

  // Store failed payment record
  await storePayment({
    paymentId: webhookData.order_id,
    companyId: companyId,
    subscriptionId: webhookData.subscription_id,
    amount: parseFloat(webhookData.gross || 0),
    currency: webhookData.currency,
    status: 'failed',
    paymentMethod: webhookData.payment_method,
    paidAt: new Date().toISOString()
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

  console.log('Payment failure recorded:', webhookData.order_id);
}

/**
 * Handle payment refunded
 */
async function handlePaymentRefunded(webhookData) {
  console.log('Processing payment refunded:', webhookData.order_id);

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

  console.log('Refund recorded successfully:', webhookData.order_id);
}

/**
 * Determine plan name from Paddle plan ID
 */
function determinePlanFromPaddleId(planId) {
  // Map Paddle plan IDs to our internal plan names
  // These would be configured in your Paddle dashboard
  const planMapping = {
    [process.env.PADDLE_STARTER_PRICE_ID]: 'STARTER',
    [process.env.PADDLE_PRO_PRICE_ID]: 'PROFESSIONAL', 
    [process.env.PADDLE_ENTERPRISE_PRICE_ID]: 'ENTERPRISE'
  };

  return planMapping[planId] || 'STARTER';
}

/**
 * Store webhook event for audit trail
 */
async function storeWebhookEvent(webhookData) {
  const params = {
    TableName: PADDLE_TABLE_NAMES.WEBHOOKS,
    Item: {
      webhookId: `${webhookData.alert_name}_${webhookData.alert_id}_${Date.now()}`,
      alertName: webhookData.alert_name,
      alertId: webhookData.alert_id,
      subscriptionId: webhookData.subscription_id,
      customerId: webhookData.customer_id,
      companyId: webhookData.passthrough?.companyId,
      data: webhookData,
      processedAt: new Date().toISOString()
    }
  };

  await dynamoOperation('put', params);
}