// lambda/subscriptionManager.js
// Manage Paddle subscriptions for construction expenses SAAS

const {
  createPaddleCustomer,
  getSubscriptionDetails,
  cancelSubscription,
  updateSubscriptionPlan,
  getPlanLimits,
  getCompanySubscription,
  createResponse,
  createErrorResponse,
  SUBSCRIPTION_PLANS,
  paddleApiCall
} = require('./shared/paddle-utils');

const {
  getCompanyUserFromEvent,
  dynamoOperation,
  COMPANY_TABLE_NAMES
} = require('./shared/company-utils');
const { withSecureCors } = require('./shared/cors-config');

exports.handler = withSecureCors(async (event) => {

  // Handle CORS preflight
  // OPTIONS handling now in withSecureCors middleware

  try {
    // For GET requests, allow unauthenticated access to view plans
    if (event.httpMethod === 'GET' && event.path === '/subscription/plans') {
      return await getAvailablePlans();
    }

    // All other requests require authentication
    const { companyId, userId, userRole } = getCompanyUserFromEvent(event);

    switch (event.httpMethod) {
      case 'GET':
        if (event.path === '/subscription/status') {
          return await getSubscriptionStatus(companyId);
        } else if (event.path === '/subscription/usage') {
          return await getUsageStats(companyId);
        }
        break;

      case 'POST':
        if (event.path === '/subscription/create') {
          return await createSubscription(event, companyId, userId);
        } else if (event.path === '/subscription/upgrade') {
          return await upgradeSubscription(event, companyId, userRole);
        }
        break;

      case 'PUT':
        if (event.path === '/subscription/update') {
          return await updateSubscription(event, companyId, userRole);
        }
        break;

      case 'DELETE':
        if (event.path === '/subscription/cancel') {
          return await cancelCompanySubscription(companyId, userRole);
        }
        break;

      default:
        return createErrorResponse(405, `Method ${event.httpMethod} not allowed`);
    }

    return createErrorResponse(404, 'Endpoint not found');

  } catch (error) {
    
    if (error.message.includes('authentication required')) {
      return createErrorResponse(401, 'Authentication required');
    }
    
    if (error.message.includes('Access denied')) {
      return createErrorResponse(403, 'Access denied - admin privileges required');
    }
    
    return createErrorResponse(500, 'Internal server error managing subscription');
  }
});

/**
 * Get available subscription plans
 */
async function getAvailablePlans() {
  const plans = Object.keys(SUBSCRIPTION_PLANS).map(key => {
    const plan = SUBSCRIPTION_PLANS[key];
    return {
      id: key,
      name: plan.name,
      monthlyPrice: plan.monthlyPrice,
      yearlyPrice: plan.yearlyPrice,
      currency: plan.currency,
      limits: plan.limits,
      popular: key === 'PROFESSIONAL' // Mark Pro as popular
    };
  });

  return createResponse(200, {
    success: true,
    plans: plans,
    currency: 'USD'
  });
}

/**
 * Get company subscription status
 */
async function getSubscriptionStatus(companyId) {
  try {
    // Get company details
    const companyResult = await dynamoOperation('get', {
      TableName: COMPANY_TABLE_NAMES.COMPANIES,
      Key: { companyId }
    });

    if (!companyResult.Item) {
      return createErrorResponse(404, 'Company not found');
    }

    const company = companyResult.Item;
    
    // Get subscription details from Paddle if subscription exists
    let paddleSubscription = null;
    if (company.subscriptionId) {
      try {
        paddleSubscription = await getSubscriptionDetails(company.subscriptionId);
      } catch (error) {
      }
    }

    // Get current usage stats
    const usage = await getCurrentUsage(companyId);

    const response = {
      companyId,
      subscriptionStatus: company.subscriptionStatus || 'none',
      currentPlan: company.currentPlan || null,
      nextBillingDate: company.nextBillingDate || null,
      paddleCustomerId: company.paddleCustomerId || null,
      limits: company.currentPlan ? getPlanLimits(company.currentPlan) : null,
      usage: usage,
      paddleDetails: paddleSubscription
    };

    return createResponse(200, {
      success: true,
      subscription: response
    });

  } catch (error) {
    return createErrorResponse(500, 'Failed to get subscription status');
  }
}

/**
 * Get current usage statistics
 */
async function getCurrentUsage(companyId) {
  try {
    // Count users
    const usersResult = await dynamoOperation('query', {
      TableName: COMPANY_TABLE_NAMES.USERS,
      KeyConditionExpression: 'companyId = :companyId',
      ExpressionAttributeValues: { ':companyId': companyId },
      Select: 'COUNT'
    });

    // Count projects
    const projectsResult = await dynamoOperation('query', {
      TableName: COMPANY_TABLE_NAMES.PROJECTS,
      KeyConditionExpression: 'companyId = :companyId',
      ExpressionAttributeValues: { ':companyId': companyId },
      Select: 'COUNT'
    });

    // Count expenses (for current month)
    const currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM
    const expensesResult = await dynamoOperation('query', {
      TableName: COMPANY_TABLE_NAMES.EXPENSES,
      KeyConditionExpression: 'companyId = :companyId',
      FilterExpression: 'begins_with(#date, :currentMonth)',
      ExpressionAttributeNames: { '#date': 'date' },
      ExpressionAttributeValues: { 
        ':companyId': companyId,
        ':currentMonth': currentMonth
      },
      Select: 'COUNT'
    });

    return {
      users: usersResult.Count || 0,
      projects: projectsResult.Count || 0,
      expensesThisMonth: expensesResult.Count || 0,
      storageUsed: 0 // TODO: Calculate actual storage usage
    };

  } catch (error) {
    return {
      users: 0,
      projects: 0,
      expensesThisMonth: 0,
      storageUsed: 0
    };
  }
}

/**
 * Create new subscription
 */
async function createSubscription(event, companyId, userId) {
  const requestBody = JSON.parse(event.body || '{}');
  const { planName, billingCycle = 'monthly', companyName, email, country = 'US' } = requestBody;


  // Validate plan
  if (!SUBSCRIPTION_PLANS[planName]) {
    return createErrorResponse(400, `Invalid plan: ${planName}`);
  }

  const plan = SUBSCRIPTION_PLANS[planName];

  try {
    // Generate Paddle checkout link
    const checkoutData = await createPaddleCustomer({
      priceId: plan.priceId,
      email: email,
      country: country,
      companyName: companyName,
      companyId: companyId
    });

    return createResponse(200, {
      success: true,
      message: 'Checkout link generated successfully',
      checkoutUrl: checkoutData.checkout_url,
      transactionId: checkoutData.transaction_id,
      planName: planName,
      billingCycle: billingCycle
    });

  } catch (error) {
    return createErrorResponse(500, 'Failed to create subscription checkout');
  }
}

/**
 * Upgrade subscription plan
 */
async function upgradeSubscription(event, companyId, userRole) {
  // Only admins can upgrade subscriptions
  if (userRole !== 'admin') {
    return createErrorResponse(403, 'Only company administrators can upgrade subscriptions');
  }

  const requestBody = JSON.parse(event.body || '{}');
  const { newPlan } = requestBody;


  // Validate new plan
  if (!SUBSCRIPTION_PLANS[newPlan]) {
    return createErrorResponse(400, `Invalid plan: ${newPlan}`);
  }

  try {
    // Get current company subscription
    const company = await dynamoOperation('get', {
      TableName: COMPANY_TABLE_NAMES.COMPANIES,
      Key: { companyId }
    });

    if (!company.Item || !company.Item.subscriptionId) {
      return createErrorResponse(400, 'No active subscription found');
    }

    // Update subscription in Paddle
    const newPriceId = SUBSCRIPTION_PLANS[newPlan].priceId;
    await updateSubscriptionPlan(company.Item.subscriptionId, newPriceId);

    // Update local records (webhook will also update this)
    await dynamoOperation('update', {
      TableName: COMPANY_TABLE_NAMES.COMPANIES,
      Key: { companyId },
      UpdateExpression: 'SET currentPlan = :plan, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':plan': newPlan,
        ':updatedAt': new Date().toISOString()
      }
    });

    return createResponse(200, {
      success: true,
      message: 'Subscription upgraded successfully',
      newPlan: newPlan,
      limits: getPlanLimits(newPlan)
    });

  } catch (error) {
    return createErrorResponse(500, 'Failed to upgrade subscription');
  }
}

/**
 * Update subscription (billing info, etc.)
 */
async function updateSubscription(event, companyId, userRole) {
  // Only admins can update subscriptions
  if (userRole !== 'admin') {
    return createErrorResponse(403, 'Only company administrators can update subscriptions');
  }

  // For now, direct users to Paddle's customer portal
  const company = await dynamoOperation('get', {
    TableName: COMPANY_TABLE_NAMES.COMPANIES,
    Key: { companyId }
  });

  if (!company.Item || !company.Item.subscriptionId) {
    return createErrorResponse(400, 'No active subscription found');
  }

  return createResponse(200, {
    success: true,
    message: 'Please use the customer portal to update billing information',
    updateUrl: company.Item.updateUrl || 'https://paddle.com/customer-portal'
  });
}

/**
 * Cancel subscription
 */
async function cancelCompanySubscription(companyId, userRole) {
  // Only admins can cancel subscriptions
  if (userRole !== 'admin') {
    return createErrorResponse(403, 'Only company administrators can cancel subscriptions');
  }


  try {
    // Get current company subscription
    const company = await dynamoOperation('get', {
      TableName: COMPANY_TABLE_NAMES.COMPANIES,
      Key: { companyId }
    });

    if (!company.Item || !company.Item.subscriptionId) {
      return createErrorResponse(400, 'No active subscription found');
    }

    // Cancel subscription in Paddle
    await cancelSubscription(company.Item.subscriptionId);

    return createResponse(200, {
      success: true,
      message: 'Subscription cancelled successfully. Access will continue until the end of the current billing period.',
      cancelUrl: company.Item.cancelUrl
    });

  } catch (error) {
    return createErrorResponse(500, 'Failed to cancel subscription');
  }
}

/**
 * Get usage statistics for billing period
 */
async function getUsageStats(companyId) {
  const usage = await getCurrentUsage(companyId);
  
  const company = await dynamoOperation('get', {
    TableName: COMPANY_TABLE_NAMES.COMPANIES,
    Key: { companyId }
  });

  const limits = company.Item && company.Item.currentPlan 
    ? getPlanLimits(company.Item.currentPlan)
    : null;

  return createResponse(200, {
    success: true,
    usage: usage,
    limits: limits,
    utilizationPercent: limits ? {
      users: limits.maxUsers === -1 ? 0 : (usage.users / limits.maxUsers) * 100,
      projects: limits.maxProjects === -1 ? 0 : (usage.projects / limits.maxProjects) * 100,
      storage: limits.storage === -1 ? 0 : (usage.storageUsed / limits.storage) * 100
    } : null
  });
}