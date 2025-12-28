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
  COMPANY_TABLE_NAMES,
  SYSTEM_CONTRACTORS,
  USER_ROLES,
  PERMISSIONS,
  hasPermission
} = require('./shared/company-utils');
const { createLogger } = require('./shared/logger');
const logger = createLogger('companyContractors');
const { createAuditLogger, RESOURCE_TYPES } = require('./shared/audit-logger');
const auditLog = createAuditLogger(RESOURCE_TYPES.CONTRACTOR);
const { withSecureCors, CACHE_DURATIONS } = require('./shared/cors-config');

// Apply 60 second cache for GET requests (contractors rarely change)
exports.handler = withSecureCors(async (event) => {

  // Handle CORS preflight
  // OPTIONS handling now in withSecureCors middleware

  try {
    // Get company and user context from JWT token
    const { companyId, userId, userRole } = getCompanyUserFromEvent(event);

    switch (event.httpMethod) {
      case 'GET':
        // All authenticated users can view contractors
        return await getContractors(companyId, userId, userRole);
      case 'POST':
        // Check CREATE permission
        if (!hasPermission(userRole, PERMISSIONS.CREATE_CONTRACTORS)) {
          return createErrorResponse(403, 'You do not have permission to create contractors. Contact an admin to upgrade your role.');
        }
        return await createContractor(event, companyId, userId, userRole);
      case 'PUT':
        // Check EDIT permission
        if (!hasPermission(userRole, PERMISSIONS.EDIT_ALL_CONTRACTORS) &&
            !hasPermission(userRole, PERMISSIONS.EDIT_OWN_CONTRACTORS)) {
          return createErrorResponse(403, 'You do not have permission to edit contractors. Contact an admin to upgrade your role.');
        }
        return await updateContractor(event, companyId, userId, userRole);
      case 'DELETE':
        // Only admin and manager can delete
        if (!hasPermission(userRole, PERMISSIONS.DELETE_CONTRACTORS)) {
          return createErrorResponse(403, 'You do not have permission to delete contractors. Only admins and managers can delete.');
        }
        return await deleteContractor(event, companyId, userId, userRole);
      default:
        return createErrorResponse(405, `Method ${event.httpMethod} not allowed`);
    }
  } catch (error) {
    logger.error('Contractors operation failed', {
      error: error.message,
      stack: error.stack,
      method: event.httpMethod,
      path: event.path
    });
    return createErrorResponse(500, 'Internal server error during contractors operation');
  }
});

// Get all contractors for the company
async function getContractors(companyId, userId, userRole) {

  const params = {
    TableName: COMPANY_TABLE_NAMES.CONTRACTORS,
    KeyConditionExpression: 'companyId = :companyId',
    ExpressionAttributeValues: {
      ':companyId': companyId
    }
  };

  const result = await dynamoOperation('query', params);

  // All authenticated users can view all contractors in the company
  // Sort contractors: system contractors first, then by name alphabetically
  const contractors = (result.Items || []).sort((a, b) => {
    if (a.isSystemContractor && !b.isSystemContractor) return -1;
    if (!a.isSystemContractor && b.isSystemContractor) return 1;
    return (a.name || '').localeCompare(b.name || '', 'he');
  });

  return createResponse(200, {
    success: true,
    contractors: contractors,
    count: contractors.length
  });
}

// Create a new contractor
async function createContractor(event, companyId, userId, userRole) {
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

  // Audit log for CREATE operation
  auditLog.logCreate({
    resourceId: contractor.contractorId,
    companyId,
    userId,
    userRole,
    data: contractor,
    request: event
  });

  return createResponse(201, {
    success: true,
    message: 'Contractor created successfully',
    contractor
  });
}

// Update an existing contractor
async function updateContractor(event, companyId, userId, userRole) {
  const requestBody = JSON.parse(event.body || '{}');
  const contractorId = requestBody.contractorId;

  if (!contractorId) {
    return createErrorResponse(400, 'Missing contractorId');
  }

  // Prevent editing system contractor critical fields
  if (contractorId === SYSTEM_CONTRACTORS.GENERAL_CONTRACTOR.contractorId) {
    const protectedFields = ['name', 'contractorId', 'isSystemContractor'];
    const attemptedProtectedFields = protectedFields.filter(field => requestBody[field] !== undefined);
    if (attemptedProtectedFields.length > 0) {
      return createErrorResponse(400, `לא ניתן לערוך שדות מוגנים בספק ברירת המחדל: ${attemptedProtectedFields.join(', ')}`);
    }
  }

  // For users with only EDIT_OWN permission, verify they own this contractor
  if (!hasPermission(userRole, PERMISSIONS.EDIT_ALL_CONTRACTORS)) {
    const existingContractor = await dynamoOperation('get', {
      TableName: COMPANY_TABLE_NAMES.CONTRACTORS,
      Key: { companyId, contractorId }
    });

    if (!existingContractor.Item) {
      return createErrorResponse(404, 'Contractor not found');
    }

    if (existingContractor.Item.userId !== userId) {
      return createErrorResponse(403, 'You can only edit contractors you created');
    }
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
async function deleteContractor(event, companyId, userId, userRole) {
  const contractorId = event.pathParameters?.contractorId || event.queryStringParameters?.contractorId;

  if (!contractorId) {
    return createErrorResponse(400, 'Missing contractorId');
  }

  // Check if this is a system contractor - cannot be deleted
  if (contractorId === SYSTEM_CONTRACTORS.GENERAL_CONTRACTOR.contractorId) {
    return createErrorResponse(400, 'לא ניתן למחוק את ספק ברירת המחדל');
  }

  const params = {
    TableName: COMPANY_TABLE_NAMES.CONTRACTORS,
    Key: { companyId, contractorId },
    ConditionExpression: 'attribute_exists(contractorId)',
    ReturnValues: 'ALL_OLD'
  };

  const result = await dynamoOperation('delete', params);

  // Audit log for DELETE operation
  auditLog.logDelete({
    resourceId: contractorId,
    companyId,
    userId,
    userRole,
    deletedData: result.Attributes,
    request: event
  });

  return createResponse(200, {
    success: true,
    message: 'Contractor deleted successfully',
    deletedContractor: result.Attributes
  });
}