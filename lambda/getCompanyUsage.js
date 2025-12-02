// lambda/getCompanyUsage.js
// Get company subscription usage and tier limits

const {
  createResponse,
  createErrorResponse,
  getCompanyUserFromEvent,
  getCurrentTimestamp
} = require('./shared/company-utils');

const {
  getCompanyUsage
} = require('./shared/limit-checker');
const { withSecureCors } = require('./shared/cors-config');

exports.handler = withSecureCors(async (event) => {

  // Handle CORS preflight
  // OPTIONS handling now in withSecureCors middleware

  if (event.httpMethod !== 'GET') {
    return createErrorResponse(405, 'Method not allowed');
  }

  try {
    // Get company context from authenticated user
    const { companyId, userId, userRole } = getCompanyUserFromEvent(event);

    // Get company usage statistics
    const usage = await getCompanyUsage(companyId);

    return createResponse(200, {
      success: true,
      message: 'Company usage retrieved successfully',
      data: {
        usage,
        userInfo: {
          role: userRole,
          isAdmin: userRole === 'admin'
        }
      },
      timestamp: getCurrentTimestamp()
    });

  } catch (error) {

    if (error.message.includes('not found')) {
      return createErrorResponse(404, 'Company not found');
    }

    if (error.message.includes('authentication required') || error.message.includes('company context')) {
      return createErrorResponse(401, 'Authentication required');
    }

    return createErrorResponse(500, 'Internal server error retrieving company usage');
  }
};
