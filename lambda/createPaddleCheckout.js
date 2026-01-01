// lambda/createPaddleCheckout.js
// Creates a Paddle transaction and returns a hosted checkout URL
// Mobile app opens this URL in system browser (WebBrowser)
// Card is validated but not charged until after 30-day trial

const {
  createResponse,
  createErrorResponse,
  getCompanyUserFromEvent,
  getCurrentTimestamp
} = require('./shared/company-utils');

const {
  SUBSCRIPTION_PLANS,
  paddleApiCall,
  getPaddleConfig
} = require('./shared/paddle-utils');
const { withSecureCors } = require('./shared/cors-config');

exports.handler = withSecureCors(async (event) => {
  console.log('createPaddleCheckout invoked');

  if (event.httpMethod !== 'POST') {
    return createErrorResponse(405, 'Method not allowed');
  }

  try {
    // Get user context from Clerk JWT
    const { companyId, userId, userEmail } = getCompanyUserFromEvent(event);

    // Parse request body
    const requestBody = JSON.parse(event.body || '{}');
    const { companyName, subscriptionTier } = requestBody;

    // Validate inputs
    if (!companyName || companyName.trim().length === 0) {
      return createErrorResponse(400, 'Company name is required');
    }

    if (!subscriptionTier || !['starter', 'professional', 'enterprise'].includes(subscriptionTier.toLowerCase())) {
      return createErrorResponse(400, 'Valid subscription tier is required (starter, professional, or enterprise)');
    }

    const tierKey = subscriptionTier.toUpperCase();
    const plan = SUBSCRIPTION_PLANS[tierKey];

    if (!plan) {
      return createErrorResponse(400, 'Invalid subscription tier');
    }

    console.log(`Creating Paddle transaction for user ${userId}, company: ${companyName}, tier: ${tierKey}`);

    // Custom data for webhook events
    const customData = {
      companyId,
      userId,
      companyName: companyName.trim(),
      subscriptionTier: tierKey.toLowerCase(),
      userEmail: userEmail || ''
    };

    // Create Paddle transaction to get hosted checkout URL
    const transactionData = {
      items: [{
        price_id: plan.priceId,
        quantity: 1
      }],
      custom_data: customData
    };

    // Add customer email if available
    if (userEmail && userEmail.trim().length > 0) {
      transactionData.customer = {
        email: userEmail.trim()
      };
    }

    console.log('Creating Paddle transaction:', JSON.stringify(transactionData));

    const transaction = await paddleApiCall('transactions', 'POST', transactionData);

    console.log('Paddle transaction created:', {
      transactionId: transaction.data?.id,
      checkoutUrl: transaction.data?.checkout?.url
    });

    const checkoutUrl = transaction.data?.checkout?.url;

    if (!checkoutUrl) {
      console.error('Paddle transaction created but no checkout URL returned:', transaction);
      return createErrorResponse(500, 'Failed to get checkout URL from Paddle');
    }

    // Get Paddle configuration including client token from Secrets Manager
    const paddleConfig = await getPaddleConfig();

    // Return both checkoutUrl (for mobile) AND paddleConfig (for web app backwards compatibility)
    return createResponse(200, {
      success: true,
      message: 'Paddle checkout ready',
      // For mobile app - opens in WebBrowser
      checkoutUrl: checkoutUrl,
      transactionId: transaction.data.id,
      // For web app - uses Paddle.js client-side (backwards compatible)
      paddleConfig: {
        token: paddleConfig.clientToken, // Dynamic token from Secrets Manager
        priceId: plan.priceId,
        environment: paddleConfig.environment,
        customerEmail: userEmail && userEmail.trim().length > 0 ? userEmail.trim() : null,
        customData
      },
      plan: {
        name: plan.name,
        price: plan.monthlyPrice,
        currency: plan.currency,
        trialDays: plan.trialDays
      },
      timestamp: getCurrentTimestamp()
    });

  } catch (error) {
    console.error('ERROR in createPaddleCheckout:', {
      error: error.message,
      stack: error.stack
    });

    return createErrorResponse(500, error.message || 'Internal server error preparing checkout');
  }
});
