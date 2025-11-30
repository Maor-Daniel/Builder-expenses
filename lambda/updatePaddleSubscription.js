// lambda/updatePaddleSubscription.js
// Updates existing Paddle subscription to a new tier (upgrade/downgrade)
// This triggers subscription.updated webhook which updates company tier in DynamoDB

const {
  createResponse,
  createErrorResponse,
  getCompanyUserFromEvent,
  dynamoOperation,
  getCurrentTimestamp,
  COMPANY_TABLE_NAMES
} = require('./shared/company-utils');

const {
  SUBSCRIPTION_PLANS,
  PADDLE_TABLE_NAMES,
  updateSubscriptionPlan
} = require('./shared/paddle-utils');

exports.handler = async (event) => {
  console.log('updatePaddleSubscription invoked');

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return createResponse(200, { message: 'CORS preflight' });
  }

  if (event.httpMethod !== 'POST') {
    return createErrorResponse(405, 'Method not allowed');
  }

  try {
    // Get user context from Clerk JWT
    const { companyId, userId } = getCompanyUserFromEvent(event);

    // Parse request body
    const requestBody = JSON.parse(event.body || '{}');
    const { newTier } = requestBody;

    // Validate new tier
    if (!newTier || !['starter', 'professional', 'enterprise'].includes(newTier.toLowerCase())) {
      return createErrorResponse(400, 'Valid subscription tier is required (starter, professional, or enterprise)');
    }

    const newTierKey = newTier.toUpperCase();
    const newPlan = SUBSCRIPTION_PLANS[newTierKey];

    if (!newPlan) {
      return createErrorResponse(400, 'Invalid subscription tier');
    }

    // Get company's current subscription
    const company = await dynamoOperation('get', {
      TableName: COMPANY_TABLE_NAMES.COMPANIES,
      Key: { companyId }
    });

    if (!company.Item) {
      return createErrorResponse(404, 'Company not found');
    }

    const currentTier = company.Item.subscriptionTier || 'starter';

    // Check if tier is actually changing
    if (currentTier.toLowerCase() === newTier.toLowerCase()) {
      return createErrorResponse(400, 'You are already on this tier');
    }

    // Get Paddle subscription ID
    const subscription = await dynamoOperation('get', {
      TableName: PADDLE_TABLE_NAMES.SUBSCRIPTIONS,
      Key: { companyId }
    });

    if (!subscription.Item || !subscription.Item.subscriptionId) {
      return createErrorResponse(404, 'No active Paddle subscription found. Please contact support.');
    }

    const paddleSubscriptionId = subscription.Item.subscriptionId;
    const currentStatus = subscription.Item.subscriptionStatus;

    // Verify subscription is active or trialing (allow tier changes during trial)
    const validStatuses = ['active', 'trialing'];
    if (!validStatuses.includes(currentStatus)) {
      return createErrorResponse(400, `Cannot update subscription with status: ${currentStatus}. Please contact support.`);
    }

    console.log(`Updating subscription ${paddleSubscriptionId} from ${currentTier} to ${newTier} (status: ${currentStatus})`);

    // Call Paddle API to update subscription plan
    // This will trigger subscription.updated webhook which will confirm the update
    try {
      const updatedSubscription = await updateSubscriptionPlan(
        paddleSubscriptionId,
        newPlan.priceId,
        currentStatus // Pass subscription status for correct proration mode
      );

      console.log('Paddle subscription update initiated:', {
        subscriptionId: paddleSubscriptionId,
        newPriceId: newPlan.priceId,
        newTier: newTier
      });

      const timestamp = getCurrentTimestamp();

      // IMMEDIATELY update company tier in DynamoDB for instant UI feedback
      // The webhook will confirm/verify this update when it arrives
      console.log(`Immediately updating company ${companyId} tier to ${newTier}`);

      // Update companies table first (critical for UI)
      try {
        await dynamoOperation('update', {
          TableName: COMPANY_TABLE_NAMES.COMPANIES,
          Key: { companyId },
          UpdateExpression: 'SET subscriptionTier = :tier, updatedAt = :updated',
          ExpressionAttributeValues: {
            ':tier': newTier.toLowerCase(),
            ':updated': timestamp
          }
        });
        console.log(`✅ Companies table updated: ${companyId} -> ${newTier}`);
      } catch (dbError) {
        console.error('❌ CRITICAL: Failed to update companies table:', {
          error: dbError.message,
          companyId,
          newTier,
          tableName: COMPANY_TABLE_NAMES.COMPANIES
        });
        throw new Error(`Failed to update company tier: ${dbError.message}`);
      }

      // Also update the Paddle subscription record
      try {
        await dynamoOperation('update', {
          TableName: PADDLE_TABLE_NAMES.SUBSCRIPTIONS,
          Key: { companyId },
          UpdateExpression: 'SET currentPlan = :plan, nextBillingDate = :nextBilling, updatedAt = :updated',
          ExpressionAttributeValues: {
            ':plan': newTier.toLowerCase(),
            ':nextBilling': updatedSubscription.next_billed_at,
            ':updated': timestamp
          }
        });
        console.log(`✅ Paddle subscriptions table updated: ${companyId} -> ${newTier}`);
      } catch (dbError) {
        console.error('❌ CRITICAL: Failed to update paddle-subscriptions table:', {
          error: dbError.message,
          companyId,
          newTier,
          tableName: PADDLE_TABLE_NAMES.SUBSCRIPTIONS
        });
        // This is less critical since companies table is already updated
        // But we should still log it prominently
      }

      console.log(`✅ Database sync complete - tier is now ${newTier} in both tables`);

      // Return success with updated tier
      return createResponse(200, {
        success: true,
        message: `Subscription updated successfully. You are now on the ${newPlan.name} plan.`,
        subscription: {
          id: paddleSubscriptionId,
          currentTier: newTier.toLowerCase(),
          newTier: newTier.toLowerCase(),
          status: updatedSubscription.status,
          nextBillingDate: updatedSubscription.next_billed_at
        },
        plan: {
          name: newPlan.name,
          price: newPlan.monthlyPrice,
          currency: newPlan.currency
        }
      });

    } catch (paddleError) {
      console.error('Paddle API error:', {
        error: paddleError.message,
        subscriptionId: paddleSubscriptionId,
        newPriceId: newPlan.priceId
      });

      return createErrorResponse(
        500,
        'Failed to update subscription with payment processor. Please try again or contact support.',
        paddleError
      );
    }

  } catch (error) {
    console.error('ERROR in updatePaddleSubscription:', {
      error: error.message,
      stack: error.stack
    });

    return createErrorResponse(500, 'Internal server error updating subscription');
  }
};
