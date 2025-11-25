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

exports.handler = async (event) => {

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return createResponse(200, { message: 'CORS preflight' });
  }

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

    // Get company stats (can be expanded later)
    const stats = {
      totalUsers: userCount,
      // TODO: Add project count, expense count, etc. when implementing those endpoints
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
};