// lambda/updateCompany.js
// Update company information (admin only)

const {
  createResponse,
  createErrorResponse,
  getCompanyContextFromEvent,
  getCurrentTimestamp,
  debugLog,
  dynamoOperation,
  validateCompany,
  COMPANY_TABLE_NAMES,
  USER_ROLES
} = require('./shared/company-utils');
const { withSecureCors } = require('./shared/cors-config');

exports.handler = withSecureCors(async (event) => {

  // Handle CORS preflight
  // OPTIONS handling now in withSecureCors middleware

  if (event.httpMethod !== 'PUT') {
    return createErrorResponse(405, 'Method not allowed');
  }

  try {
    // Get company context from authenticated user
    const { companyId, userId, userRole } = getCompanyContextFromEvent(event);
    
    // Check if user has admin permissions
    if (userRole !== USER_ROLES.ADMIN) {
      return createErrorResponse(403, 'Admin privileges required to update company information');
    }

    // Parse request body
    const requestBody = JSON.parse(event.body || '{}');

    const updates = {};
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {
      ':updatedAt': getCurrentTimestamp()
    };

    // Validate and prepare updates
    if (requestBody.name !== undefined) {
      if (!requestBody.name || requestBody.name.trim().length < 2) {
        return createErrorResponse(400, 'Company name must be at least 2 characters long');
      }
      updateExpressions.push('#name = :name');
      expressionAttributeNames['#name'] = 'name';
      expressionAttributeValues[':name'] = requestBody.name.trim();
    }

    if (requestBody.description !== undefined) {
      updateExpressions.push('description = :description');
      expressionAttributeValues[':description'] = requestBody.description.trim();
    }

    if (requestBody.industry !== undefined) {
      updateExpressions.push('industry = :industry');
      expressionAttributeValues[':industry'] = requestBody.industry.trim();
    }

    if (requestBody.companyAddress !== undefined) {
      updateExpressions.push('companyAddress = :companyAddress');
      expressionAttributeValues[':companyAddress'] = requestBody.companyAddress.trim();
    }

    if (requestBody.companyPhone !== undefined) {
      updateExpressions.push('companyPhone = :companyPhone');
      expressionAttributeValues[':companyPhone'] = requestBody.companyPhone.trim();
    }

    if (requestBody.companyEmail !== undefined) {
      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (requestBody.companyEmail && !emailRegex.test(requestBody.companyEmail)) {
        return createErrorResponse(400, 'Invalid email format');
      }
      updateExpressions.push('companyEmail = :companyEmail');
      expressionAttributeValues[':companyEmail'] = requestBody.companyEmail.trim();
    }

    if (requestBody.logoUrl !== undefined) {
      updateExpressions.push('logoUrl = :logoUrl');
      expressionAttributeValues[':logoUrl'] = requestBody.logoUrl.trim();
    }

    // Always update the updatedAt timestamp
    updateExpressions.push('updatedAt = :updatedAt');

    if (updateExpressions.length === 1) { // Only updatedAt was added
      return createErrorResponse(400, 'No valid fields provided for update');
    }

    // Update company in database
    const updateParams = {
      TableName: COMPANY_TABLE_NAMES.COMPANIES,
      Key: { companyId },
      UpdateExpression: 'SET ' + updateExpressions.join(', '),
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW'
    };

    if (Object.keys(expressionAttributeNames).length > 0) {
      updateParams.ExpressionAttributeNames = expressionAttributeNames;
    }


    const result = await dynamoOperation('update', updateParams);
    const updatedCompany = result.Attributes;


    return createResponse(200, {
      success: true,
      message: 'Company information updated successfully',
      data: {
        company: {
          id: updatedCompany.companyId,
          name: updatedCompany.name,
          description: updatedCompany.description,
          industry: updatedCompany.industry,
          companyAddress: updatedCompany.companyAddress,
          companyPhone: updatedCompany.companyPhone,
          companyEmail: updatedCompany.companyEmail,
          logoUrl: updatedCompany.logoUrl,
          createdAt: updatedCompany.createdAt,
          updatedAt: updatedCompany.updatedAt
        }
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
    
    if (error.code === 'ConditionalCheckFailedException') {
      return createErrorResponse(404, 'Company not found');
    }
    
    if (error.message.includes('ValidationException')) {
      return createErrorResponse(400, 'Invalid input data');
    }
    
    return createErrorResponse(500, 'Internal server error updating company information');
  }
});