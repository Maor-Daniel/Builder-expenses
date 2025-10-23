// lambda/addProject.js
// Add a new project

const {
  createResponse,
  createErrorResponse,
  getUserIdFromEvent,
  getCurrentTimestamp,
  debugLog,
  dynamoOperation,
  TABLE_NAME
} = require('./shared/utils');

function validateProject(project) {
  const required = ['name', 'startDate'];
  const missing = required.filter(field => !project[field]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }
  
  // Validate date format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(project.startDate)) {
    throw new Error('Start date must be in YYYY-MM-DD format');
  }
  
  return true;
}

function generateProjectId() {
  return `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

exports.handler = async (event) => {
  debugLog('addProject event received', event);

  try {
    // Get user ID from event context or use default for single user app
    let userId;
    try {
      userId = getUserIdFromEvent(event);
    } catch (error) {
      // For single user app, use a default user ID
      userId = 'default-user';
    }
    debugLog('User ID', userId);

    // Parse request body
    let projectData;
    try {
      projectData = JSON.parse(event.body || '{}');
    } catch (parseError) {
      return createErrorResponse(400, 'Invalid JSON in request body');
    }

    debugLog('Project data received', projectData);

    // Validate project data
    try {
      validateProject(projectData);
    } catch (validationError) {
      return createErrorResponse(400, `Validation error: ${validationError.message}`);
    }

    // Generate project ID and timestamps
    const projectId = generateProjectId();
    const timestamp = getCurrentTimestamp();

    // Create project object - use projectId as expenseId for table compatibility
    const project = {
      userId,
      expenseId: projectId, // DynamoDB table expects expenseId as sort key
      projectId,
      name: projectData.name.trim(),
      startDate: projectData.startDate,
      description: projectData.description ? projectData.description.trim() : '',
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp
    };

    // Check for duplicate project name
    const duplicateCheckParams = {
      TableName: TABLE_NAME,
      KeyConditionExpression: 'userId = :userId',
      FilterExpression: '#name = :name AND attribute_exists(projectId)',
      ExpressionAttributeNames: {
        '#name': 'name'
      },
      ExpressionAttributeValues: {
        ':userId': userId,
        ':name': project.name
      }
    };

    try {
      const duplicateCheck = await dynamoOperation('query', duplicateCheckParams);
      if (duplicateCheck.Items && duplicateCheck.Items.length > 0) {
        return createErrorResponse(409, `Project name "${project.name}" already exists`);
      }
    } catch (error) {
      debugLog('Duplicate check had error, continuing', error.message);
    }

    // Save to DynamoDB
    const putParams = {
      TableName: TABLE_NAME,
      Item: project,
      ConditionExpression: 'attribute_not_exists(expenseId)' // Use expenseId which is the sort key
    };

    await dynamoOperation('put', putParams);

    debugLog('Project saved successfully', { projectId });

    return createResponse(201, {
      success: true,
      message: 'Project added successfully',
      data: {
        project,
        projectId
      },
      timestamp
    });

  } catch (error) {
    console.error('Error in addProject:', error);

    if (error.code === 'ConditionalCheckFailedException') {
      return createErrorResponse(409, 'Project with this ID already exists');
    }

    if (error.message.includes('User ID not found')) {
      return createErrorResponse(401, 'Unauthorized: Invalid user context');
    }

    return createErrorResponse(500, 'Failed to add project', error);
  }
};