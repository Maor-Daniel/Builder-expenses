// lambda/companyProjects.js
// Company-scoped projects management Lambda function

const {
  createResponse,
  createErrorResponse,
  getCompanyUserFromEvent,
  generateProjectId,
  getCurrentTimestamp,
  debugLog,
  dynamoOperation,
  COMPANY_TABLE_NAMES
} = require('./shared/company-utils');

exports.handler = async (event) => {
  debugLog('Company projects request received', {
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
        return await getProjects(companyId, userId);
      case 'POST':
        return await createProject(event, companyId, userId);
      case 'PUT':
        return await updateProject(event, companyId, userId);
      case 'DELETE':
        return await deleteProject(event, companyId, userId);
      default:
        return createErrorResponse(405, `Method ${event.httpMethod} not allowed`);
    }
  } catch (error) {
    console.error('Company projects error:', error);
    return createErrorResponse(500, 'Internal server error during projects operation');
  }
};

// Get all projects for the company
async function getProjects(companyId, userId) {
  debugLog('Getting projects for company', { companyId });

  const params = {
    TableName: COMPANY_TABLE_NAMES.PROJECTS,
    KeyConditionExpression: 'companyId = :companyId',
    ExpressionAttributeValues: {
      ':companyId': companyId
    }
  };

  const result = await dynamoOperation('query', params);
  
  debugLog('Found projects', { count: result.Items.length });
  
  return createResponse(200, {
    success: true,
    projects: result.Items || [],
    count: result.Items.length
  });
}

// Create a new project
async function createProject(event, companyId, userId) {
  const requestBody = JSON.parse(event.body || '{}');
  debugLog('Creating project', requestBody);

  const project = {
    companyId,
    projectId: generateProjectId(),
    userId, // User who created the project
    name: requestBody.name,
    startDate: requestBody.startDate,
    endDate: requestBody.endDate || null,
    description: requestBody.description || '',
    status: requestBody.status || 'active',
    budget: requestBody.budget ? parseFloat(requestBody.budget) : 0,
    spentAmount: 0, // Initialize to 0
    location: requestBody.location || '',
    clientName: requestBody.clientName || '',
    createdAt: getCurrentTimestamp(),
    updatedAt: getCurrentTimestamp()
  };

  // Validate required fields
  const required = ['name', 'startDate'];
  const missing = required.filter(field => !project[field]);
  
  if (missing.length > 0) {
    return createErrorResponse(400, `Missing required fields: ${missing.join(', ')}`);
  }

  // Validate date format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(project.startDate)) {
    return createErrorResponse(400, 'Start date must be in YYYY-MM-DD format');
  }

  if (project.endDate && !dateRegex.test(project.endDate)) {
    return createErrorResponse(400, 'End date must be in YYYY-MM-DD format');
  }

  const params = {
    TableName: COMPANY_TABLE_NAMES.PROJECTS,
    Item: project,
    ConditionExpression: 'attribute_not_exists(projectId)'
  };

  await dynamoOperation('put', params);
  
  debugLog('Project created successfully', { projectId: project.projectId });
  
  return createResponse(201, {
    success: true,
    message: 'Project created successfully',
    project
  });
}

// Update an existing project
async function updateProject(event, companyId, userId) {
  const requestBody = JSON.parse(event.body || '{}');
  const projectId = requestBody.projectId;
  
  if (!projectId) {
    return createErrorResponse(400, 'Missing projectId');
  }

  debugLog('Updating project', { projectId, companyId });

  // Build update expression dynamically
  const updateExpressions = [];
  const expressionAttributeNames = {};
  const expressionAttributeValues = {};
  
  const updateableFields = ['name', 'startDate', 'endDate', 'description', 'status', 'budget', 'spentAmount', 'location', 'clientName'];
  
  updateableFields.forEach(field => {
    if (requestBody[field] !== undefined) {
      updateExpressions.push(`#${field} = :${field}`);
      expressionAttributeNames[`#${field}`] = field;
      
      // Handle numeric fields
      if (field === 'budget' || field === 'spentAmount') {
        expressionAttributeValues[`:${field}`] = parseFloat(requestBody[field]);
      } else {
        expressionAttributeValues[`:${field}`] = requestBody[field];
      }
    }
  });
  
  if (updateExpressions.length === 0) {
    return createErrorResponse(400, 'No fields to update');
  }
  
  // Always update the updatedAt field
  updateExpressions.push('#updatedAt = :updatedAt');
  expressionAttributeNames['#updatedAt'] = 'updatedAt';
  expressionAttributeValues[':updatedAt'] = getCurrentTimestamp();

  const params = {
    TableName: COMPANY_TABLE_NAMES.PROJECTS,
    Key: { companyId, projectId },
    UpdateExpression: `SET ${updateExpressions.join(', ')}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    ConditionExpression: 'attribute_exists(projectId)',
    ReturnValues: 'ALL_NEW'
  };

  const result = await dynamoOperation('update', params);
  
  debugLog('Project updated successfully', { projectId });
  
  return createResponse(200, {
    success: true,
    message: 'Project updated successfully',
    project: result.Attributes
  });
}

// Delete a project
async function deleteProject(event, companyId, userId) {
  const projectId = event.pathParameters?.projectId || event.queryStringParameters?.projectId;
  
  if (!projectId) {
    return createErrorResponse(400, 'Missing projectId');
  }

  debugLog('Deleting project', { projectId, companyId });

  const params = {
    TableName: COMPANY_TABLE_NAMES.PROJECTS,
    Key: { companyId, projectId },
    ConditionExpression: 'attribute_exists(projectId)',
    ReturnValues: 'ALL_OLD'
  };

  const result = await dynamoOperation('delete', params);
  
  debugLog('Project deleted successfully', { projectId });
  
  return createResponse(200, {
    success: true,
    message: 'Project deleted successfully',
    deletedProject: result.Attributes
  });
}