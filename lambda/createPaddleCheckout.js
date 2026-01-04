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
    const { companyName, subscriptionTier, successUrl, redirectUrl } = requestBody;

    // Validate inputs
    if (!companyName || companyName.trim().length === 0) {
      return createErrorResponse(400, 'Company name is required');
    }

    if (!subscriptionTier || !['starter', 'professional', 'enterprise'].includes(subscriptionTier.toLowerCase())) {
      return createErrorResponse(400, 'Valid subscription tier is required (starter, professional, or enterprise)');
    }

    // Determine success URL for Paddle checkout redirect
    // IMPORTANT: Paddle only allows approved domains (http/https URLs)
    // Custom URL schemes (builderexpenses://) are rejected with error:
    // "transaction_checkout_url_domain_is_not_approved"
    //
    // Workaround: Only use http/https URLs, fall back to web URL for custom schemes
    // Long-term solution: Configure Universal Links (https URL that opens the app)
    const requestedUrl = redirectUrl || successUrl;
    const isValidHttpUrl = requestedUrl && requestedUrl.startsWith('http');

    // Use Universal Link URL for mobile app deep linking
    // Path /app/checkout-success is configured in apple-app-site-association
    const checkoutSuccessUrl = isValidHttpUrl
                                ? requestedUrl
                                : (process.env.CHECKOUT_SUCCESS_URL || 'https://www.builder-expenses.com/app/checkout-success');

    // Log if we had to override a custom scheme URL
    if (requestedUrl && !isValidHttpUrl) {
      console.log(`Custom URL scheme not supported by Paddle, using web URL instead. Requested: ${requestedUrl}`);
    }

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

    // Build checkout URL pointing to our Paddle.js host page
    // The host page loads Paddle.js SDK and opens the checkout overlay
    // This is required because Paddle Billing needs Paddle.js to display checkout
    // (Direct URLs like buy.paddle.com/?_ptxn=... don't work without the SDK)
    const hostPageBaseUrl = process.env.CHECKOUT_HOST_URL || 'https://www.builder-expenses.com/checkout';

    // Build URL with all required parameters for the host page
    const checkoutUrlParams = new URLSearchParams({
      _ptxn: transactionId,
      token: paddleConfig.clientToken,
      redirect: checkoutSuccessUrl,
      env: paddleConfig.environment
    });

    const checkoutUrl = `${hostPageBaseUrl}?${checkoutUrlParams.toString()}`;

    // Also keep the direct Paddle URL for reference/debugging
    const directPaddleUrl = paddleConfig.environment === 'production'
      ? `https://buy.paddle.com/?_ptxn=${transactionId}`
      : `https://sandbox-buy.paddle.com/?_ptxn=${transactionId}`;

    console.log('Paddle transaction created:', {
      transactionId,
      checkoutUrl,
      directPaddleUrl,
      redirectUrl: checkoutSuccessUrl,
      environment: paddleConfig.environment
    });

    // Return checkout URL pointing to host page (for mobile and web)
    return createResponse(200, {
      success: true,
      message: 'Paddle checkout ready',
      // Primary checkout URL - points to our host page that loads Paddle.js
      checkoutUrl: checkoutUrl,
      transactionId: transactionId,
      // Direct Paddle URL (for debugging/reference only - won't work without Paddle.js)
      directPaddleUrl: directPaddleUrl,
      // Paddle config for web apps that want to use Paddle.js directly
      paddleConfig: {
        token: paddleConfig.clientToken,
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
