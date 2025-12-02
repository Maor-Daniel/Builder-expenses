// lambda/createPaddleCheckout.js
// Returns Paddle checkout configuration for company registration
// Frontend will use Paddle.js to open checkout overlay
// Card is validated but not charged until after 30-day trial

const {
  createResponse,
  createErrorResponse,
  getCompanyUserFromEvent,
  getCurrentTimestamp
} = require('./shared/company-utils');

const {
  SUBSCRIPTION_PLANS
} = require('./shared/paddle-utils');
const { withSecureCors } = require('./shared/cors-config');

exports.handler = withSecureCors(async (event) => {
  console.log('createPaddleCheckout invoked');

  // Handle CORS preflight
  // OPTIONS handling now in withSecureCors middleware

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

    console.log(`Preparing Paddle checkout for user ${userId}, company: ${companyName}, tier: ${tierKey}`);

    // Prepare custom data to pass to Paddle via frontend
    // This will be available in webhook events
    const customData = {
      companyId,
      userId,
      companyName: companyName.trim(),
      subscriptionTier: tierKey.toLowerCase(),
      userEmail: userEmail || ''
    };

    // Get Paddle environment
    const paddleEnvironment = process.env.PADDLE_ENVIRONMENT || 'sandbox';

    console.log(`Returning Paddle checkout config - priceId: ${plan.priceId}, environment: ${paddleEnvironment}`);

    // Return checkout configuration for frontend to use with Paddle.js
    return createResponse(200, {
      success: true,
      message: 'Paddle checkout configuration ready',
      paddleConfig: {
        token: 'test_db12c8b3a07159acbe3dff44dba', // Paddle client-side token
        priceId: plan.priceId,
        environment: paddleEnvironment,
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

    return createErrorResponse(500, 'Internal server error preparing checkout');
  }
});
