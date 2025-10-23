// lambda/addProject.js
// Add a new project with SpentAmount tracking

const {
  createResponse,
  createErrorResponse,
  getUserIdFromEvent,
  validateProject,
  generateProjectId,
  getCurrentTimestamp,
  dynamodb,
  isLocal,
  TABLE_NAMES
} = require('./shared/multi-table-utils');

exports.handler = async (event) => {
  console.log('addProject event received:', JSON.stringify(event, null, 2));

  try {
    // Get user ID from event context
    const userId = getUserIdFromEvent(event);
    console.log('User ID:', userId);

    // Parse request body
    let projectData;
    try {
      projectData = JSON.parse(event.body || '{}');
    } catch (parseError) {
      return createErrorResponse(400, 'Invalid JSON in request body');
    }

    console.log('Project data received:', projectData);

    // Validate project data
    try {
      validateProject(projectData);
    } catch (validationError) {
      return createErrorResponse(400, `Validation error: ${validationError.message}`);
    }

    // Check for duplicate project name
    const duplicateCheckParams = {
      TableName: TABLE_NAMES.PROJECTS,
      KeyConditionExpression: 'userId = :userId',
      FilterExpression: '#name = :name',
      ExpressionAttributeNames: {
        '#name': 'name'
      },
      ExpressionAttributeValues: {
        ':userId': userId,
        ':name': projectData.name.trim()
      }
    };

    try {
      const duplicateCheck = await dynamodb.query(duplicateCheckParams).promise();
      if (duplicateCheck.Items && duplicateCheck.Items.length > 0) {
        return createErrorResponse(409, `Project with name "${projectData.name}" already exists`);
      }
    } catch (error) {
      console.error('Duplicate check failed:', error);
      // Continue but log the error
    }

    // Generate project ID and timestamps
    const projectId = generateProjectId();
    const timestamp = getCurrentTimestamp();

    // Create project object with multi-table structure
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

    console.log('Creating project:', project);

    // Save to DynamoDB Projects table
    const putParams = {
      TableName: TABLE_NAMES.PROJECTS,
      Item: project,
      ConditionExpression: 'attribute_not_exists(projectId)' // Prevent overwrites
    };

    await dynamodb.put(putParams).promise();

    console.log('Project saved successfully:', { projectId });

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