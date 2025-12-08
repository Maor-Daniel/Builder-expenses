// lambda/companyWorks.js
// Company-scoped works management Lambda function

const {
  createResponse,
  createErrorResponse,
  getCompanyUserFromEvent,
  generateWorkId,
  getCurrentTimestamp,
  debugLog,
  dynamoOperation,
  COMPANY_TABLE_NAMES,
  USER_ROLES,
  PERMISSIONS,
  hasPermission
} = require('./shared/company-utils');
const { createLogger } = require('./shared/logger');
const logger = createLogger('companyWorks');
const { createAuditLogger, RESOURCE_TYPES } = require('./shared/audit-logger');
const auditLog = createAuditLogger(RESOURCE_TYPES.WORK);
const { withSecureCors } = require('./shared/cors-config');

exports.handler = withSecureCors(async (event) => {

  // Handle CORS preflight
  // OPTIONS handling now in withSecureCors middleware

  try {
    // Get company and user context from JWT token
    const { companyId, userId, userRole } = getCompanyUserFromEvent(event);

    switch (event.httpMethod) {
      case 'GET':
        // All authenticated users can view works
        return await getWorks(companyId, userId, userRole);
      case 'POST':
        // Check CREATE permission
        if (!hasPermission(userRole, PERMISSIONS.CREATE_WORKS)) {
          return createErrorResponse(403, 'You do not have permission to create works. Contact an admin to upgrade your role.');
        }
        return await createWork(event, companyId, userId, userRole);
      case 'PUT':
        // Check EDIT permission
        if (!hasPermission(userRole, PERMISSIONS.EDIT_ALL_WORKS) &&
            !hasPermission(userRole, PERMISSIONS.EDIT_OWN_WORKS)) {
          return createErrorResponse(403, 'You do not have permission to edit works. Contact an admin to upgrade your role.');
        }
        return await updateWork(event, companyId, userId, userRole);
      case 'DELETE':
        // Only admin and manager can delete
        if (!hasPermission(userRole, PERMISSIONS.DELETE_WORKS)) {
          return createErrorResponse(403, 'You do not have permission to delete works. Only admins and managers can delete.');
        }
        return await deleteWork(event, companyId, userId, userRole);
      default:
        return createErrorResponse(405, `Method ${event.httpMethod} not allowed`);
    }
  } catch (error) {
    return createErrorResponse(500, 'Internal server error during works operation');
  }
});

// Get all works for the company
async function getWorks(companyId, userId, userRole) {

  const params = {
    TableName: COMPANY_TABLE_NAMES.WORKS,
    KeyConditionExpression: 'companyId = :companyId',
    ExpressionAttributeValues: {
      ':companyId': companyId
    }
  };

  const result = await dynamoOperation('query', params);

  // Fetch projects and contractors to get names
  const [projectsResult, contractorsResult] = await Promise.all([
    dynamoOperation('query', {
      TableName: COMPANY_TABLE_NAMES.PROJECTS,
      KeyConditionExpression: 'companyId = :companyId',
      ExpressionAttributeValues: { ':companyId': companyId }
    }),
    dynamoOperation('query', {
      TableName: COMPANY_TABLE_NAMES.CONTRACTORS,
      KeyConditionExpression: 'companyId = :companyId',
      ExpressionAttributeValues: { ':companyId': companyId }
    })
  ]);

  // Create lookup maps
  const projectsMap = {};
  (projectsResult.Items || []).forEach(p => {
    projectsMap[p.projectId] = p.name;
  });

  const contractorsMap = {};
  (contractorsResult.Items || []).forEach(c => {
    contractorsMap[c.contractorId] = c.name;
  });

  // Add names to works - all authenticated users can view all works
  const worksWithNames = (result.Items || []).map(work => ({
    ...work,
    projectName: projectsMap[work.projectId] || '',
    contractorName: contractorsMap[work.contractorId] || ''
  }));

  return createResponse(200, {
    success: true,
    works: worksWithNames,
    count: worksWithNames.length
  });
}

// Create a new work
async function createWork(event, companyId, userId, userRole) {
  const requestBody = JSON.parse(event.body || '{}');

  const work = {
    companyId,
    workId: generateWorkId(),
    userId, // User who created the work
    projectId: requestBody.projectId,
    contractorId: requestBody.contractorId,
    workName: requestBody.workName || requestBody.WorkName, // Support both naming conventions
    description: requestBody.description || '',
    totalWorkCost: parseFloat(requestBody.totalWorkCost || requestBody.TotalWorkCost || 0),
    status: requestBody.status || 'planned',
    startDate: requestBody.startDate || null,
    endDate: requestBody.endDate || null,
    progress: parseFloat(requestBody.progress || 0), // Percentage 0-100
    notes: requestBody.notes || '',
    createdAt: getCurrentTimestamp(),
    updatedAt: getCurrentTimestamp()
  };

  // Validate required fields
  const required = ['projectId', 'contractorId', 'workName'];
  const missing = required.filter(field => !work[field]);
  
  if (missing.length > 0) {
    return createErrorResponse(400, `Missing required fields: ${missing.join(', ')}`);
  }

  // Validate totalWorkCost
  if (isNaN(work.totalWorkCost) || work.totalWorkCost < 0) {
    return createErrorResponse(400, 'Total work cost must be a non-negative number');
  }

  // Validate progress percentage
  if (work.progress < 0 || work.progress > 100) {
    return createErrorResponse(400, 'Progress must be between 0 and 100');
  }

  // Validate dates if provided
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (work.startDate && !dateRegex.test(work.startDate)) {
    return createErrorResponse(400, 'Start date must be in YYYY-MM-DD format');
  }
  if (work.endDate && !dateRegex.test(work.endDate)) {
    return createErrorResponse(400, 'End date must be in YYYY-MM-DD format');
  }

  const params = {
    TableName: COMPANY_TABLE_NAMES.WORKS,
    Item: work,
    ConditionExpression: 'attribute_not_exists(workId)'
  };

  await dynamoOperation('put', params);

  // Audit log for CREATE operation
  auditLog.logCreate({
    resourceId: work.workId,
    companyId,
    userId,
    userRole,
    data: work,
    request: event
  });

  return createResponse(201, {
    success: true,
    message: 'Work created successfully',
    work
  });
}

// Update an existing work
async function updateWork(event, companyId, userId, userRole) {
  const requestBody = JSON.parse(event.body || '{}');
  const workId = requestBody.workId;

  if (!workId) {
    return createErrorResponse(400, 'Missing workId');
  }

  // For users with only EDIT_OWN permission, verify they own this work
  if (!hasPermission(userRole, PERMISSIONS.EDIT_ALL_WORKS)) {
    const existingWork = await dynamoOperation('get', {
      TableName: COMPANY_TABLE_NAMES.WORKS,
      Key: { companyId, workId }
    });

    if (!existingWork.Item) {
      return createErrorResponse(404, 'Work not found');
    }

    if (existingWork.Item.userId !== userId) {
      return createErrorResponse(403, 'You can only edit works you created');
    }
  }

  // Build update expression dynamically
  const updateExpressions = [];
  const expressionAttributeNames = {};
  const expressionAttributeValues = {};
  
  const updateableFields = ['projectId', 'contractorId', 'workName', 'description', 'totalWorkCost', 'status', 'startDate', 'endDate', 'progress', 'notes'];
  
  updateableFields.forEach(field => {
    // Support both naming conventions
    const value = requestBody[field] || (field === 'workName' ? requestBody.WorkName : null) || (field === 'totalWorkCost' ? requestBody.TotalWorkCost : null);
    
    if (value !== undefined && value !== null) {
      updateExpressions.push(`#${field} = :${field}`);
      expressionAttributeNames[`#${field}`] = field;
      
      // Handle numeric fields
      if (field === 'totalWorkCost' || field === 'progress') {
        expressionAttributeValues[`:${field}`] = parseFloat(value);
      } else {
        expressionAttributeValues[`:${field}`] = value;
      }
    }
  });
  
  if (updateExpressions.length === 0) {
    return createErrorResponse(400, 'No fields to update');
  }
  
  // Validate progress if being updated
  if (requestBody.progress !== undefined && (requestBody.progress < 0 || requestBody.progress > 100)) {
    return createErrorResponse(400, 'Progress must be between 0 and 100');
  }
  
  // Always update the updatedAt field
  updateExpressions.push('#updatedAt = :updatedAt');
  expressionAttributeNames['#updatedAt'] = 'updatedAt';
  expressionAttributeValues[':updatedAt'] = getCurrentTimestamp();

  const params = {
    TableName: COMPANY_TABLE_NAMES.WORKS,
    Key: { companyId, workId },
    UpdateExpression: `SET ${updateExpressions.join(', ')}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    ConditionExpression: 'attribute_exists(workId)',
    ReturnValues: 'ALL_NEW'
  };

  const result = await dynamoOperation('update', params);
  
  
  return createResponse(200, {
    success: true,
    message: 'Work updated successfully',
    work: result.Attributes
  });
}

// Delete a work
async function deleteWork(event, companyId, userId, userRole) {
  const workId = event.pathParameters?.workId || event.queryStringParameters?.workId;

  if (!workId) {
    return createErrorResponse(400, 'Missing workId');
  }

  const params = {
    TableName: COMPANY_TABLE_NAMES.WORKS,
    Key: { companyId, workId },
    ConditionExpression: 'attribute_exists(workId)',
    ReturnValues: 'ALL_OLD'
  };

  const result = await dynamoOperation('delete', params);

  // Audit log for DELETE operation
  auditLog.logDelete({
    resourceId: workId,
    companyId,
    userId,
    userRole,
    deletedData: result.Attributes,
    request: event
  });

  return createResponse(200, {
    success: true,
    message: 'Work deleted successfully',
    deletedWork: result.Attributes
  });
}