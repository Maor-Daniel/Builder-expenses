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
  COMPANY_TABLE_NAMES
} = require('./shared/company-utils');

exports.handler = async (event) => {
  debugLog('Company works request received', {
    httpMethod: event.httpMethod,
    body: event.body ? 'Present' : 'None'
  });

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return createResponse(200, { message: 'CORS preflight' });
  }

  try {
    // Get company and user context from JWT token
    const { companyId, userId, userRole } = getCompanyUserFromEvent(event);
    debugLog('Company context', { companyId, userId, userRole });

    switch (event.httpMethod) {
      case 'GET':
        return await getWorks(companyId, userId);
      case 'POST':
        return await createWork(event, companyId, userId);
      case 'PUT':
        return await updateWork(event, companyId, userId);
      case 'DELETE':
        return await deleteWork(event, companyId, userId);
      default:
        return createErrorResponse(405, `Method ${event.httpMethod} not allowed`);
    }
  } catch (error) {
    console.error('Company works error:', error);
    return createErrorResponse(500, 'Internal server error during works operation');
  }
};

// Get all works for the company
async function getWorks(companyId, userId) {
  debugLog('Getting works for company', { companyId });

  const params = {
    TableName: COMPANY_TABLE_NAMES.WORKS,
    KeyConditionExpression: 'companyId = :companyId',
    ExpressionAttributeValues: {
      ':companyId': companyId
    }
  };

  const result = await dynamoOperation('query', params);
  
  debugLog('Found works', { count: result.Items.length });
  
  return createResponse(200, {
    success: true,
    works: result.Items || [],
    count: result.Items.length
  });
}

// Create a new work
async function createWork(event, companyId, userId) {
  const requestBody = JSON.parse(event.body || '{}');
  debugLog('Creating work', requestBody);

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
  
  debugLog('Work created successfully', { workId: work.workId });
  
  return createResponse(201, {
    success: true,
    message: 'Work created successfully',
    work
  });
}

// Update an existing work
async function updateWork(event, companyId, userId) {
  const requestBody = JSON.parse(event.body || '{}');
  const workId = requestBody.workId;
  
  if (!workId) {
    return createErrorResponse(400, 'Missing workId');
  }

  debugLog('Updating work', { workId, companyId });

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
  
  debugLog('Work updated successfully', { workId });
  
  return createResponse(200, {
    success: true,
    message: 'Work updated successfully',
    work: result.Attributes
  });
}

// Delete a work
async function deleteWork(event, companyId, userId) {
  const workId = event.pathParameters?.workId || event.queryStringParameters?.workId;
  
  if (!workId) {
    return createErrorResponse(400, 'Missing workId');
  }

  debugLog('Deleting work', { workId, companyId });

  const params = {
    TableName: COMPANY_TABLE_NAMES.WORKS,
    Key: { companyId, workId },
    ConditionExpression: 'attribute_exists(workId)',
    ReturnValues: 'ALL_OLD'
  };

  const result = await dynamoOperation('delete', params);
  
  debugLog('Work deleted successfully', { workId });
  
  return createResponse(200, {
    success: true,
    message: 'Work deleted successfully',
    deletedWork: result.Attributes
  });
}