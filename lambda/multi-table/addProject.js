// lambda/multi-table/addProject.js
// Add a new project - Multi-table version

const {
  TABLE_NAMES,
  createResponse,
  createErrorResponse,
  getUserIdFromEvent,
  validateProject,
  generateProjectId,
  getCurrentTimestamp,
  debugLog,
  dynamoOperation
} = require('../shared/multi-table-utils');

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

    // Create project object
    const project = {
      userId,
      projectId,
      name: projectData.name.trim(),
      startDate: projectData.startDate,
      description: projectData.description ? projectData.description.trim() : '',
      status: projectData.status || 'active',
      SpentAmount: projectData.SpentAmount || 0, // Initialize SpentAmount
      createdAt: timestamp,
      updatedAt: timestamp
    };

    debugLog('Project object created', project);

    // Check for duplicate project name using LSI
    const duplicateCheckParams = {
      TableName: TABLE_NAMES.PROJECTS,
      IndexName: 'name-index',
      KeyConditionExpression: 'userId = :userId AND #name = :name',
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
        return createErrorResponse(409, `Project with name "${project.name}" already exists`);
      }
    } catch (error) {
      debugLog('Duplicate check failed, continuing', error.message);
    }

    // Save to ProjectsTable
    const putParams = {
      TableName: TABLE_NAMES.PROJECTS,
      Item: project,
      ConditionExpression: 'attribute_not_exists(projectId)' // Prevent overwrites
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