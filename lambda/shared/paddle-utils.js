// lambda/shared/paddle-utils.js
// Paddle integration utilities for construction expenses SAAS

const crypto = require('crypto');

// Paddle configuration
const PADDLE_CONFIG = {
  environment: process.env.PADDLE_ENVIRONMENT || 'sandbox', // sandbox or production
  apiKey: process.env.PADDLE_API_KEY,
  webhookSecret: process.env.PADDLE_WEBHOOK_SECRET
};

// Subscription plans configuration - Updated to match Paddle pricing (ILS)
const SUBSCRIPTION_PLANS = {
  STARTER: {
    name: "Starter",
    priceId: 'pri_01k9f1wq2ffpb9abm3kcr9t77f', // Paddle Price ID
    monthlyPrice: 100,
    currency: 'ILS',
    trialDays: 30, // 30-day trial for all tiers
    limits: {
      maxUsers: 1,
      maxProjects: 3,
      maxExpensesPerMonth: 50,
      maxSuppliers: -1, // unlimited
      maxWorks: -1, // unlimited
      storage: 1024, // 1GB in MB
      features: ['basic_dashboard', 'pdf_export', 'receipt_upload', 'basic_support']
    }
  },

  PROFESSIONAL: {
    name: "Professional",
    priceId: 'pri_01k9f1y03zd5f3cxwnnza118r2', // Paddle Price ID
    monthlyPrice: 200,
    currency: 'ILS',
    trialDays: 30,
    limits: {
      maxUsers: 3,
      maxProjects: 10,
      maxExpensesPerMonth: -1, // unlimited
      maxSuppliers: -1,
      maxWorks: -1,
      storage: 10240, // 10GB in MB
      features: ['advanced_dashboard', 'advanced_pdf_export', 'contractor_management', 'priority_support']
    }
  },

  ENTERPRISE: {
    name: "Enterprise",
    priceId: 'pri_01k9f1yt0hm9767jh0htqbp6t1', // Paddle Price ID
    monthlyPrice: 300,
    currency: 'ILS',
    trialDays: 30,
    limits: {
      maxUsers: 10,
      maxProjects: -1, // unlimited
      maxExpensesPerMonth: -1, // unlimited
      maxSuppliers: -1,
      maxWorks: -1,
      storage: 102400, // 100GB in MB
      features: ['all_features', 'auto_backups', 'custom_integrations', 'dedicated_support']
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

// Import dynamoOperation from company-utils
const { dynamoOperation, COMPANY_TABLE_NAMES } = require('./company-utils');

/**
 * Verify Paddle webhook signature using HMAC SHA256
 * Based on Paddle Billing API documentation
 */
function verifyPaddleWebhook(body, paddleSignature) {
  if (!PADDLE_CONFIG.webhookSecret || !paddleSignature) {
    return false;
  }
  
  try {
    // Parse the Paddle-Signature header: "ts=timestamp;h1=signature"
    const sigParts = paddleSignature.split(';');
    let timestamp = null;
    let signature = null;
    
    for (const part of sigParts) {
      const [key, value] = part.split('=');
      if (key === 'ts') timestamp = value;
      if (key === 'h1') signature = value;
    }
    
    if (!timestamp || !signature) {
      return false;
    }
    
    // Create the signed payload: timestamp + ':' + body
    const signedPayload = `${timestamp}:${body}`;
    
    // Calculate expected signature using HMAC SHA256
    const expectedSignature = crypto
      .createHmac('sha256', PADDLE_CONFIG.webhookSecret)
      .update(signedPayload)
      .digest('hex');
    
    // Use timing-safe comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch (error) {
    return false;
  }
}

/**
 * Make API call to modern Paddle Billing API
 */
async function paddleApiCall(endpoint, method = 'GET', data = null) {
  const https = require('https');
  
  const baseUrl = PADDLE_CONFIG.environment === 'production' 
    ? 'api.paddle.com' 
    : 'sandbox-api.paddle.com';
  
  const options = {
    hostname: baseUrl,
    port: 443,
    path: `/${endpoint}`,
    method: method,
    headers: {
      'Authorization': `Bearer ${PADDLE_CONFIG.apiKey}`,
      'Content-Type': 'application/json'
    }
  };
  
  const postData = data ? JSON.stringify(data) : null;
  if (postData) {
    options.headers['Content-Length'] = Buffer.byteLength(postData);
  }
  
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(responseData);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(response);
          } else {
            // Log full error response from Paddle for debugging
            console.error('Paddle API Error Response:', JSON.stringify(response));
            reject(new Error(response.error?.message || `API error: ${res.statusCode}`));
          }
        } catch (error) {
          console.error('Error parsing Paddle response:', error.message, 'Raw response:', responseData);
          reject(error);
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

/**
 * Create Paddle customer and generate checkout
 */
async function createPaddleCustomer(customerData) {
  try {
    // First create customer if needed
    let customer;
    try {
      customer = await paddleApiCall('customers', 'POST', {
        name: customerData.companyName,
        email: customerData.email,
        custom_data: {
          companyId: customerData.companyId
        }
      });
    } catch (error) {
      // Customer might already exist, that's okay
    }

    // Create transaction/checkout
    const transactionData = {
      items: [{
        price_id: customerData.priceId, // Using Price ID (pri_*)
        quantity: 1
      }],
      customer: customer ? { id: customer.data.id } : { email: customerData.email },
      custom_data: {
        companyId: customerData.companyId,
        action: 'subscribe'
      },
      checkout: {
        url: `${process.env.FRONTEND_URL}/subscription/success`
      }
    };

    const transaction = await paddleApiCall('transactions', 'POST', transactionData);
    return {
      checkout_url: transaction.data.checkout?.url,
      transaction_id: transaction.data.id
    };
  } catch (error) {
    throw error;
  }
}

/**
 * Get subscription details from Paddle
 */
async function getSubscriptionDetails(subscriptionId) {
  try {
    const response = await paddleApiCall(`subscriptions/${subscriptionId}`, 'GET');
    return response.data;
  } catch (error) {
    throw error;
  }
}

/**
 * Cancel subscription
 */
async function cancelSubscription(subscriptionId) {
  try {
    const response = await paddleApiCall(`subscriptions/${subscriptionId}/cancel`, 'POST', {
      effective_from: 'next_billing_period'
    });
    return response.data;
  } catch (error) {
    throw error;
  }
}

/**
 * Update subscription plan
 */
async function updateSubscriptionPlan(subscriptionId, newPriceId) {
  try {
    const response = await paddleApiCall(`subscriptions/${subscriptionId}`, 'PATCH', {
      items: [{
        price_id: newPriceId,
        quantity: 1
      }],
      proration_billing_mode: 'prorated_immediately'
    });
    return response.data;
  } catch (error) {
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
  
  const result = await dynamoOperation('get', params);
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
      scheduledChangeId: subscriptionData.scheduledChangeId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  };
  
  await dynamoOperation('put', params);
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
      paymentMethod: paymentData.paymentMethod,
      paidAt: paymentData.paidAt,
      createdAt: new Date().toISOString()
    }
  };
  
  await dynamoOperation('put', params);
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