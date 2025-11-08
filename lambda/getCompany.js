// lambda/getCompany.js  
// Get current user's company information

const {
  createResponse,
  createErrorResponse,
  getCompanyContextFromEvent,
  getCurrentTimestamp,
  debugLog,
  dynamoOperation,
  COMPANY_TABLE_NAMES
} = require('./shared/company-utils');

exports.handler = async (event) => {
  debugLog('Get company request received', { 
    httpMethod: event.httpMethod 
  });

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return createResponse(200, { message: 'CORS preflight' });
  }

  if (event.httpMethod !== 'GET') {
    return createErrorResponse(405, 'Method not allowed');
  }

  try {
    // Get company context from authenticated user
    const { companyId, userId, userRole } = getCompanyContextFromEvent(event);
    
    debugLog('Retrieving company information', { companyId, userId, userRole });

    // Get company information
    const companyResult = await dynamoOperation('get', {
      TableName: COMPANY_TABLE_NAMES.COMPANIES,
      Key: { companyId }
    });

    if (!companyResult.Item) {
      return createErrorResponse(404, 'Company not found');
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

    debugLog('Company information retrieved successfully', { companyId, userCount });

    return createResponse(200, {
      success: true,
      message: 'Company information retrieved successfully',
      data: {
        company: {
          id: company.companyId,
          name: company.name,
          description: company.description,
          industry: company.industry,
          createdAt: company.createdAt,
          updatedAt: company.updatedAt
        },
        stats,
        userInfo: {
          role: userRole,
          isAdmin: userRole === 'admin'
        }
      },
      timestamp: getCurrentTimestamp()
    });

  } catch (error) {
    console.error('Error retrieving company information:', error);
    
    if (error.message.includes('Company authentication required')) {
      return createErrorResponse(401, 'Authentication required');
    }
    
    if (error.message.includes('missing company')) {
      return createErrorResponse(401, 'Invalid company context');
    }
    
    return createErrorResponse(500, 'Internal server error retrieving company information');
  }
};