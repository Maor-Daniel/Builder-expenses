// lambda/companyContractors.js
// Company-scoped contractors management Lambda function

const {
  createResponse,
  createErrorResponse,
  getCompanyUserFromEvent,
  generateContractorId,
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

  try {
    // Get company and user context from JWT token
    const { companyId, userId, userRole } = getCompanyUserFromEvent(event);

    switch (event.httpMethod) {
      case 'GET':
        return await getContractors(companyId, userId);
      case 'POST':
        return await createContractor(event, companyId, userId);
      case 'PUT':
        return await updateContractor(event, companyId, userId);
      case 'DELETE':
        return await deleteContractor(event, companyId, userId);
      default:
        return createErrorResponse(405, `Method ${event.httpMethod} not allowed`);
    }
  } catch (error) {
    return createErrorResponse(500, 'Internal server error during contractors operation');
  }
};

// Get all contractors for the company
async function getContractors(companyId, userId) {

  const params = {
    TableName: COMPANY_TABLE_NAMES.CONTRACTORS,
    KeyConditionExpression: 'companyId = :companyId',
    ExpressionAttributeValues: {
      ':companyId': companyId
    }
  };

  const result = await dynamoOperation('query', params);
  
  
  return createResponse(200, {
    success: true,
    contractors: result.Items || [],
    count: result.Items.length
  });
}

// Create a new contractor
async function createContractor(event, companyId, userId) {
  const requestBody = JSON.parse(event.body || '{}');

  const contractor = {
    companyId,
    contractorId: generateContractorId(),
    userId, // User who created the contractor
    name: requestBody.name,
    contactPerson: requestBody.contactPerson || '',
    phone: requestBody.phone || '',
    email: requestBody.email || '',
    address: requestBody.address || '',
    specialty: requestBody.specialty || '', // e.g., "Plumbing", "Electrical", "General"
    licenseNumber: requestBody.licenseNumber || '',
    taxId: requestBody.taxId || '',
    paymentTerms: requestBody.paymentTerms || '',
    notes: requestBody.notes || '',
    status: requestBody.status || 'active',
    rating: requestBody.rating || null,
    createdAt: getCurrentTimestamp(),
    updatedAt: getCurrentTimestamp()
  };

  // Validate required fields
  const required = ['name'];
  const missing = required.filter(field => !contractor[field]);
  
  if (missing.length > 0) {
    return createErrorResponse(400, `Missing required fields: ${missing.join(', ')}`);
  }

  // Validate email format if provided
  if (contractor.email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(contractor.email)) {
      return createErrorResponse(400, 'Invalid email format');
    }
  }

  // Validate rating if provided
  if (contractor.rating !== null && (contractor.rating < 1 || contractor.rating > 5)) {
    return createErrorResponse(400, 'Rating must be between 1 and 5');
  }

  const params = {
    TableName: COMPANY_TABLE_NAMES.CONTRACTORS,
    Item: contractor,
    ConditionExpression: 'attribute_not_exists(contractorId)'
  };

  await dynamoOperation('put', params);
  
  
  return createResponse(201, {
    success: true,
    message: 'Contractor created successfully',
    contractor
  });
}

// Update an existing contractor
async function updateContractor(event, companyId, userId) {
  const requestBody = JSON.parse(event.body || '{}');
  const contractorId = requestBody.contractorId;
  
  if (!contractorId) {
    return createErrorResponse(400, 'Missing contractorId');
  }


  // Build update expression dynamically
  const updateExpressions = [];
  const expressionAttributeNames = {};
  const expressionAttributeValues = {};
  
  const updateableFields = ['name', 'contactPerson', 'phone', 'email', 'address', 'specialty', 'licenseNumber', 'taxId', 'paymentTerms', 'notes', 'status', 'rating'];
  
  updateableFields.forEach(field => {
    if (requestBody[field] !== undefined) {
      updateExpressions.push(`#${field} = :${field}`);
      expressionAttributeNames[`#${field}`] = field;
      
      // Handle numeric fields
      if (field === 'rating') {
        expressionAttributeValues[`:${field}`] = requestBody[field] ? parseFloat(requestBody[field]) : null;
      } else {
        expressionAttributeValues[`:${field}`] = requestBody[field];
      }
    }
  });
  
  if (updateExpressions.length === 0) {
    return createErrorResponse(400, 'No fields to update');
  }
  
  // Validate email format if being updated
  if (requestBody.email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(requestBody.email)) {
      return createErrorResponse(400, 'Invalid email format');
    }
  }
  
  // Validate rating if being updated
  if (requestBody.rating !== undefined && requestBody.rating !== null && (requestBody.rating < 1 || requestBody.rating > 5)) {
    return createErrorResponse(400, 'Rating must be between 1 and 5');
  }
  
  // Always update the updatedAt field
  updateExpressions.push('#updatedAt = :updatedAt');
  expressionAttributeNames['#updatedAt'] = 'updatedAt';
  expressionAttributeValues[':updatedAt'] = getCurrentTimestamp();

  const params = {
    TableName: COMPANY_TABLE_NAMES.CONTRACTORS,
    Key: { companyId, contractorId },
    UpdateExpression: `SET ${updateExpressions.join(', ')}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    ConditionExpression: 'attribute_exists(contractorId)',
    ReturnValues: 'ALL_NEW'
  };

  const result = await dynamoOperation('update', params);
  
  
  return createResponse(200, {
    success: true,
    message: 'Contractor updated successfully',
    contractor: result.Attributes
  });
}

// Delete a contractor
async function deleteContractor(event, companyId, userId) {
  const contractorId = event.pathParameters?.contractorId || event.queryStringParameters?.contractorId;
  
  if (!contractorId) {
    return createErrorResponse(400, 'Missing contractorId');
  }


  const params = {
    TableName: COMPANY_TABLE_NAMES.CONTRACTORS,
    Key: { companyId, contractorId },
    ConditionExpression: 'attribute_exists(contractorId)',
    ReturnValues: 'ALL_OLD'
  };

  const result = await dynamoOperation('delete', params);
  
  
  return createResponse(200, {
    success: true,
    message: 'Contractor deleted successfully',
    deletedContractor: result.Attributes
  });
}