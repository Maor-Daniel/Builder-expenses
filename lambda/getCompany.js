// lambda/getCompany.js  
// Get current user's company information

const {
  createResponse,
  createErrorResponse,
  getCompanyUserFromEvent,
  getCurrentTimestamp,
  debugLog,
  dynamoOperation,
  COMPANY_TABLE_NAMES
} = require('./shared/company-utils');
const { createLogger } = require('./shared/logger');
const logger = createLogger('getCompany');

const { PADDLE_TABLE_NAMES } = require('./shared/paddle-utils');
const { withSecureCors, CACHE_DURATIONS } = require('./shared/cors-config');

// Apply 5 minute cache for company info (rarely changes)
exports.handler = withSecureCors(async (event) => {

  // Handle CORS preflight
  // OPTIONS handling now in withSecureCors middleware

  if (event.httpMethod !== 'GET') {
    return createErrorResponse(405, 'Method not allowed');
  }

  try {
    // Get company context from authenticated user (works with both Clerk and Cognito)
    const { companyId, userId, userRole } = getCompanyUserFromEvent(event);


    // Get company information
    const companyResult = await dynamoOperation('get', {
      TableName: COMPANY_TABLE_NAMES.COMPANIES,
      Key: { companyId }
    });

    // For onboarding flow: return empty response if company doesn't exist yet
    if (!companyResult.Item) {
      return createResponse(200, {
        success: true,
        companyExists: false,
        message: 'No company found - onboarding required',
        userId,
        companyId
      });
    }

    const company = companyResult.Item;

    // Get company users count
    const usersResult = await dynamoOperation('query', {
      TableName: COMPANY_TABLE_NAMES.USERS,
      KeyConditionExpression: 'companyId = :companyId',
      ExpressionAttributeValues: {
        ':companyId': companyId
      },
      Select: 'COUNT'
    });

    const userCount = usersResult.Count || 0;

    // Check if company has a Paddle subscription
    let hasPaddleSubscription = false;
    let paddleSubscriptionInfo = null;

    try {
      const paddleResult = await dynamoOperation('get', {
        TableName: PADDLE_TABLE_NAMES.SUBSCRIPTIONS,
        Key: { companyId }
      });

      if (paddleResult.Item) {
        hasPaddleSubscription = true;
        paddleSubscriptionInfo = {
          subscriptionId: paddleResult.Item.subscriptionId,
          paddleCustomerId: paddleResult.Item.paddleCustomerId,
          status: paddleResult.Item.subscriptionStatus,
          nextBillingDate: paddleResult.Item.nextBillingDate
        };
      }
    } catch (error) {
      logger.error('Error checking Paddle subscription:', { error: error });
      // Non-fatal error, continue without Paddle info
    }

    // Get company stats from existing tables
    const [projectsResult, expensesResult, contractorsResult, worksResult] = await Promise.all([
      dynamoOperation('query', {
        TableName: COMPANY_TABLE_NAMES.PROJECTS,
        KeyConditionExpression: 'companyId = :companyId',
        ExpressionAttributeValues: { ':companyId': companyId },
        Select: 'COUNT'
      }),
      dynamoOperation('query', {
        TableName: COMPANY_TABLE_NAMES.EXPENSES,
        KeyConditionExpression: 'companyId = :companyId',
        ExpressionAttributeValues: { ':companyId': companyId },
        Select: 'COUNT'
      }),
      dynamoOperation('query', {
        TableName: COMPANY_TABLE_NAMES.CONTRACTORS,
        KeyConditionExpression: 'companyId = :companyId',
        ExpressionAttributeValues: { ':companyId': companyId },
        Select: 'COUNT'
      }),
      dynamoOperation('query', {
        TableName: COMPANY_TABLE_NAMES.WORKS,
        KeyConditionExpression: 'companyId = :companyId',
        ExpressionAttributeValues: { ':companyId': companyId },
        Select: 'COUNT'
      })
    ]);

    const stats = {
      totalUsers: userCount,
      totalProjects: projectsResult.Count || 0,
      totalExpenses: expensesResult.Count || 0,
      totalContractors: contractorsResult.Count || 0,
      totalWorks: worksResult.Count || 0
    };


    return createResponse(200, {
      success: true,
      companyExists: true,
      message: 'Company information retrieved successfully',
      company: {
        id: company.companyId,
        companyId: company.companyId,
        name: company.name,
        description: company.description,
        industry: company.industry,
        companyAddress: company.companyAddress,
        companyPhone: company.companyPhone,
        companyEmail: company.companyEmail,
        logoUrl: company.logoUrl,
        subscriptionTier: company.subscriptionTier,
        subscriptionStatus: company.subscriptionStatus,
        currentProjects: company.currentProjects || 0,
        currentUsers: company.currentUsers || 0,
        currentMonthExpenses: company.currentMonthExpenses || 0,
        createdAt: company.createdAt,
        updatedAt: company.updatedAt
      },
      stats,
      userInfo: {
        role: userRole,
        isAdmin: userRole === 'admin'
      },
      paddleSubscription: {
        exists: hasPaddleSubscription,
        info: paddleSubscriptionInfo
      },
      timestamp: getCurrentTimestamp()
    });

  } catch (error) {
    
    if (error.message.includes('Company authentication required')) {
      return createErrorResponse(401, 'Authentication required');
    }
    
    if (error.message.includes('missing company')) {
      return createErrorResponse(401, 'Invalid company context');
    }
    
    return createErrorResponse(500, 'Internal server error retrieving company information');
  }
});