// lambda/shared/paddle-utils.js
// Paddle integration utilities for construction expenses SAAS

const AWS = require('aws-sdk');
const crypto = require('crypto');

// Paddle configuration
const PADDLE_CONFIG = {
  environment: process.env.PADDLE_ENVIRONMENT || 'sandbox', // sandbox or production
  vendorId: process.env.PADDLE_VENDOR_ID,
  apiKey: process.env.PADDLE_API_KEY,
  publicKey: process.env.PADDLE_PUBLIC_KEY,
  webhookSecret: process.env.PADDLE_WEBHOOK_SECRET
};

// Subscription plans configuration
const SUBSCRIPTION_PLANS = {
  STARTER: {
    name: "Starter",
    priceId: process.env.PADDLE_STARTER_PRICE_ID || 'pri_starter',
    monthlyPrice: 29,
    yearlyPrice: 290, // 17% discount
    currency: 'USD',
    limits: {
      maxUsers: 5,
      maxProjects: 10,
      storage: 1024, // 1GB in MB
      features: ['basic_reporting', 'mobile_app', 'email_support']
    }
  },
  
  PROFESSIONAL: {
    name: "Professional", 
    priceId: process.env.PADDLE_PRO_PRICE_ID || 'pri_professional',
    monthlyPrice: 79,
    yearlyPrice: 790, // 17% discount
    currency: 'USD',
    limits: {
      maxUsers: 25,
      maxProjects: -1, // unlimited
      storage: 10240, // 10GB in MB
      features: ['advanced_reporting', 'contractor_management', 'receipt_scanning', 'priority_support']
    }
  },
  
  ENTERPRISE: {
    name: "Enterprise",
    priceId: process.env.PADDLE_ENTERPRISE_PRICE_ID || 'pri_enterprise', 
    monthlyPrice: 199,
    yearlyPrice: 1990, // 17% discount
    currency: 'USD',
    limits: {
      maxUsers: -1, // unlimited
      maxProjects: -1, // unlimited
      storage: 102400, // 100GB in MB
      features: ['all_features', 'white_label', 'custom_integrations', 'dedicated_support']
    }
  }
};

// Paddle table names
const PADDLE_TABLE_NAMES = {
  SUBSCRIPTIONS: 'construction-expenses-paddle-subscriptions',
  CUSTOMERS: 'construction-expenses-paddle-customers',
  PAYMENTS: 'construction-expenses-paddle-payments',
  WEBHOOKS: 'construction-expenses-paddle-webhooks'
};

// DynamoDB client
const dynamodb = new AWS.DynamoDB.DocumentClient({
  region: process.env.AWS_REGION || 'us-east-1'
});

/**
 * Verify Paddle webhook signature
 */
function verifyPaddleWebhook(body, signature) {
  if (!PADDLE_CONFIG.publicKey || !signature) {
    console.error('Missing webhook verification data');
    return false;
  }
  
  try {
    // Paddle uses PHP serialize format - need to verify signature
    const expectedSignature = crypto
      .createHash('sha1')
      .update(PADDLE_CONFIG.publicKey + body)
      .digest('hex');
      
    return signature === expectedSignature;
  } catch (error) {
    console.error('Webhook verification error:', error);
    return false;
  }
}

/**
 * Make API call to Paddle
 */
async function paddleApiCall(endpoint, method = 'POST', data = {}) {
  const https = require('https');
  const querystring = require('querystring');
  
  // Add vendor credentials to request
  const requestData = {
    vendor_id: PADDLE_CONFIG.vendorId,
    vendor_auth_code: PADDLE_CONFIG.apiKey,
    ...data
  };
  
  const postData = querystring.stringify(requestData);
  const baseUrl = PADDLE_CONFIG.environment === 'production' 
    ? 'vendors.paddle.com' 
    : 'vendors-sandbox.paddle.com';
  
  const options = {
    hostname: baseUrl,
    port: 443,
    path: `/api/2.0/${endpoint}`,
    method: method,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData)
    }
  };
  
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.success) {
            resolve(response.response);
          } else {
            reject(new Error(response.error?.message || 'Paddle API error'));
          }
        } catch (error) {
          reject(error);
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.write(postData);
    req.end();
  });
}

/**
 * Create Paddle customer
 */
async function createPaddleCustomer(customerData) {
  try {
    const response = await paddleApiCall('product/generate_pay_link', 'POST', {
      product_id: customerData.productId,
      customer_email: customerData.email,
      customer_country: customerData.country || 'US',
      custom_message: `Welcome to Construction Expenses - ${customerData.companyName}`,
      return_url: `${process.env.FRONTEND_URL}/subscription/success`,
      passthrough: JSON.stringify({
        companyId: customerData.companyId,
        action: 'subscribe'
      })
    });
    
    return response;
  } catch (error) {
    console.error('Error creating Paddle customer:', error);
    throw error;
  }
}

/**
 * Get subscription details from Paddle
 */
async function getSubscriptionDetails(subscriptionId) {
  try {
    const response = await paddleApiCall('subscription/users', 'POST', {
      subscription_id: subscriptionId
    });
    
    return response;
  } catch (error) {
    console.error('Error getting subscription details:', error);
    throw error;
  }
}

/**
 * Cancel subscription
 */
async function cancelSubscription(subscriptionId) {
  try {
    const response = await paddleApiCall('subscription/users_cancel', 'POST', {
      subscription_id: subscriptionId
    });
    
    return response;
  } catch (error) {
    console.error('Error canceling subscription:', error);
    throw error;
  }
}

/**
 * Update subscription plan
 */
async function updateSubscriptionPlan(subscriptionId, newPlanId) {
  try {
    const response = await paddleApiCall('subscription/users/update', 'POST', {
      subscription_id: subscriptionId,
      plan_id: newPlanId,
      prorate: true
    });
    
    return response;
  } catch (error) {
    console.error('Error updating subscription:', error);
    throw error;
  }
}

/**
 * Get plan limits for a subscription
 */
function getPlanLimits(planName) {
  const plan = SUBSCRIPTION_PLANS[planName.toUpperCase()];
  if (!plan) {
    throw new Error(`Unknown plan: ${planName}`);
  }
  return plan.limits;
}

/**
 * Validate subscription limits
 */
async function validateSubscriptionLimits(companyId, action, currentCount = 0) {
  // Get company subscription info
  const company = await getCompanySubscription(companyId);
  
  if (!company || company.subscriptionStatus !== 'active') {
    throw new Error('No active subscription found. Please subscribe to continue.');
  }
  
  const limits = getPlanLimits(company.currentPlan);
  
  switch (action) {
    case 'ADD_USER':
      if (limits.maxUsers !== -1 && currentCount >= limits.maxUsers) {
        throw new Error(`User limit reached (${limits.maxUsers}). Please upgrade your plan.`);
      }
      break;
      
    case 'ADD_PROJECT':
      if (limits.maxProjects !== -1 && currentCount >= limits.maxProjects) {
        throw new Error(`Project limit reached (${limits.maxProjects}). Please upgrade your plan.`);
      }
      break;
      
    case 'UPLOAD_FILE':
      const currentStorage = await getCompanyStorageUsage(companyId);
      if (currentStorage >= limits.storage) {
        throw new Error(`Storage limit reached (${limits.storage}MB). Please upgrade your plan.`);
      }
      break;
  }
  
  return true;
}

/**
 * Get company subscription from database
 */
async function getCompanySubscription(companyId) {
  const params = {
    TableName: PADDLE_TABLE_NAMES.SUBSCRIPTIONS,
    Key: { companyId }
  };
  
  const result = await dynamodb.get(params).promise();
  return result.Item;
}

/**
 * Get company storage usage (placeholder)
 */
async function getCompanyStorageUsage(companyId) {
  // TODO: Implement storage usage calculation
  // This would sum up file sizes from S3 or similar
  return 0;
}

/**
 * Store subscription in database
 */
async function storeSubscription(subscriptionData) {
  const params = {
    TableName: PADDLE_TABLE_NAMES.SUBSCRIPTIONS,
    Item: {
      companyId: subscriptionData.companyId,
      subscriptionId: subscriptionData.subscriptionId,
      paddleCustomerId: subscriptionData.paddleCustomerId,
      currentPlan: subscriptionData.currentPlan,
      subscriptionStatus: subscriptionData.status,
      nextBillingDate: subscriptionData.nextBillingDate,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  };
  
  await dynamodb.put(params).promise();
}

/**
 * Store payment record
 */
async function storePayment(paymentData) {
  const params = {
    TableName: PADDLE_TABLE_NAMES.PAYMENTS,
    Item: {
      paymentId: paymentData.paymentId,
      companyId: paymentData.companyId,
      subscriptionId: paymentData.subscriptionId,
      amount: paymentData.amount,
      currency: paymentData.currency,
      status: paymentData.status,
      paidAt: paymentData.paidAt,
      createdAt: new Date().toISOString()
    }
  };
  
  await dynamodb.put(params).promise();
}

/**
 * Create standardized API response with CORS
 */
function createResponse(statusCode, body, additionalHeaders = {}) {
  return {
    statusCode,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Content-Type': 'application/json',
      ...additionalHeaders
    },
    body: JSON.stringify(body)
  };
}

/**
 * Create error response
 */
function createErrorResponse(statusCode, message, error = null) {
  const body = {
    error: true,
    message,
    timestamp: new Date().toISOString()
  };
  
  if (error && process.env.NODE_ENV !== 'production') {
    body.details = error.message;
  }
  
  return createResponse(statusCode, body);
}

module.exports = {
  PADDLE_CONFIG,
  SUBSCRIPTION_PLANS,
  PADDLE_TABLE_NAMES,
  verifyPaddleWebhook,
  paddleApiCall,
  createPaddleCustomer,
  getSubscriptionDetails,
  cancelSubscription,
  updateSubscriptionPlan,
  getPlanLimits,
  validateSubscriptionLimits,
  getCompanySubscription,
  storeSubscription,
  storePayment,
  createResponse,
  createErrorResponse
};