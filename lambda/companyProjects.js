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
  COMPANY_TABLE_NAMES,
  USER_ROLES,
  PERMISSIONS,
  hasPermission
} = require('./shared/company-utils');

const {
  checkProjectLimit,
  incrementProjectCounter,
  decrementProjectCounter
} = require('./shared/limit-checker');
const { withSecureCors } = require('./shared/cors-config');

exports.handler = withSecureCors(async (event) => {

  // Handle CORS preflight
  // OPTIONS handling now in withSecureCors middleware

  try {
    // Get company and user context from JWT token
    const { companyId, userId, userRole } = getCompanyUserFromEvent(event);

    switch (event.httpMethod) {
      case 'GET':
        // All authenticated users can view projects
        return await getProjects(companyId, userId, userRole);
      case 'POST':
        // Check CREATE permission
        if (!hasPermission(userRole, PERMISSIONS.CREATE_PROJECTS)) {
          return createErrorResponse(403, 'You do not have permission to create projects. Contact an admin to upgrade your role.');
        }
        return await createProject(event, companyId, userId);
      case 'PUT':
        // Check EDIT permission
        if (!hasPermission(userRole, PERMISSIONS.EDIT_ALL_PROJECTS) &&
            !hasPermission(userRole, PERMISSIONS.EDIT_OWN_PROJECTS)) {
          return createErrorResponse(403, 'You do not have permission to edit projects. Contact an admin to upgrade your role.');
        }
        return await updateProject(event, companyId, userId, userRole);
      case 'DELETE':
        // Only admin and manager can delete
        if (!hasPermission(userRole, PERMISSIONS.DELETE_PROJECTS)) {
          return createErrorResponse(403, 'You do not have permission to delete projects. Only admins and managers can delete.');
        }
        return await deleteProject(event, companyId, userId);
      default:
        return createErrorResponse(405, `Method ${event.httpMethod} not allowed`);
    }
  } catch (error) {
    console.error('ERROR in companyProjects handler:', {
      error: error.message,
      stack: error.stack,
      httpMethod: event.httpMethod,
      path: event.path
    });
    return createErrorResponse(500, 'Internal server error during projects operation');
  }
});

// Get all projects for the company
async function getProjects(companyId, userId, userRole) {

  const params = {
    TableName: COMPANY_TABLE_NAMES.PROJECTS,
    KeyConditionExpression: 'companyId = :companyId',
    ExpressionAttributeValues: {
      ':companyId': companyId
    }
  };

  const result = await dynamoOperation('query', params);

  // All authenticated users can view all projects in the company
  const projects = result.Items || [];

  return createResponse(200, {
    success: true,
    projects: projects,
    count: projects.length
  });
}

// Create a new project
async function createProject(event, companyId, userId) {
  // Check if company can create new project (tier limit check)
  const limitCheck = await checkProjectLimit(companyId);

  if (!limitCheck.allowed) {
    return createErrorResponse(403, limitCheck.message, {
      reason: limitCheck.reason,
      currentUsage: limitCheck.currentUsage,
      limit: limitCheck.limit,
      suggestedTier: limitCheck.suggestedTier,
      upgradeUrl: limitCheck.upgradeUrl
    });
  }

  const requestBody = JSON.parse(event.body || '{}');

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

  // Increment project counter for tier tracking
  await incrementProjectCounter(companyId);

  return createResponse(201, {
    success: true,
    message: 'Project created successfully',
    project
  });
}

// Update an existing project
async function updateProject(event, companyId, userId, userRole) {
  const requestBody = JSON.parse(event.body || '{}');
  const projectId = requestBody.projectId;

  if (!projectId) {
    return createErrorResponse(400, 'Missing projectId');
  }

  // For users with only EDIT_OWN permission, verify they own this project
  if (!hasPermission(userRole, PERMISSIONS.EDIT_ALL_PROJECTS)) {
    const existingProject = await dynamoOperation('get', {
      TableName: COMPANY_TABLE_NAMES.PROJECTS,
      Key: { companyId, projectId }
    });

    if (!existingProject.Item) {
      return createErrorResponse(404, 'Project not found');
    }

    if (existingProject.Item.userId !== userId) {
      return createErrorResponse(403, 'You can only edit projects you created');
    }
  }

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


  const params = {
    TableName: COMPANY_TABLE_NAMES.PROJECTS,
    Key: { companyId, projectId },
    ConditionExpression: 'attribute_exists(projectId)',
    ReturnValues: 'ALL_OLD'
  };

  const result = await dynamoOperation('delete', params);

  // Decrement project counter for tier tracking
  await decrementProjectCounter(companyId);

  return createResponse(200, {
    success: true,
    message: 'Project deleted successfully',
    deletedProject: result.Attributes
  });
}