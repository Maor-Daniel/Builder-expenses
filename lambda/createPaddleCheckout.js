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
    const { companyName, subscriptionTier, successUrl } = requestBody;

    // Validate inputs
    if (!companyName || companyName.trim().length === 0) {
      return createErrorResponse(400, 'Company name is required');
    }

    if (!subscriptionTier || !['starter', 'professional', 'enterprise'].includes(subscriptionTier.toLowerCase())) {
      return createErrorResponse(400, 'Valid subscription tier is required (starter, professional, or enterprise)');
    }

    // Determine success URL (web URL for universal compatibility)
    // Note: Changed from 'builderexpenses://checkout-success' to web URL
    // because Paddle requires mobile app approval for custom URL schemes
    const checkoutSuccessUrl = successUrl ||
                                process.env.CHECKOUT_SUCCESS_URL ||
                                'https://www.builder-expenses.com/checkout-success';

    const tierKey = subscriptionTier.toUpperCase();
    const plan = SUBSCRIPTION_PLANS[tierKey];

    if (!plan) {
      return createErrorResponse(400, 'Invalid subscription tier');
    }

    console.log(`Creating Paddle transaction for user ${userId}, company: ${companyName}, tier: ${tierKey}, successUrl: ${checkoutSuccessUrl}`);

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
      custom_data: customData,
      checkout: {
        url: checkoutSuccessUrl  // Redirect URL after successful checkout
      }
    };

    // Add customer email if available
    if (userEmail && userEmail.trim().length > 0) {
      transactionData.customer = {
        email: userEmail.trim()
      };
    }

    console.log('Creating Paddle transaction:', JSON.stringify(transactionData));

    const transaction = await paddleApiCall('transactions', 'POST', transactionData);

    const transactionId = transaction.data?.id;

    if (!transactionId) {
      console.error('Paddle transaction created but no transaction ID returned:', transaction);
      return createErrorResponse(500, 'Failed to get transaction ID from Paddle');
    }

    // Get Paddle configuration including client token from Secrets Manager
    const paddleConfig = await getPaddleConfig();

    // Construct Paddle hosted checkout URL based on environment
    // Note: Paddle's API returns the redirect URL in checkout.url, NOT the checkout page URL
    // We need to construct the actual checkout URL ourselves using the transaction ID
    const paddleCheckoutBaseUrl = paddleConfig.environment === 'production'
      ? 'https://buy.paddle.com'
      : 'https://sandbox-buy.paddle.com';

    const checkoutUrl = `${paddleCheckoutBaseUrl}/?_ptxn=${transactionId}`;

    console.log('Paddle transaction created:', {
      transactionId,
      checkoutUrl,
      environment: paddleConfig.environment
    });

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
