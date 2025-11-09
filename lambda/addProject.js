// lambda/addProject.js
// Add a new project with company-scoping and permission checking

const {
  createResponse,
  createErrorResponse,
  getCompanyUserFromEvent,
  generateProjectId,
  getCurrentTimestamp,
  dynamoOperation,
  COMPANY_TABLE_NAMES,
  PERMISSIONS,
  withPermission,
  debugLog
} = require('./shared/company-utils');

const {
  validateSubscriptionLimits
} = require('./shared/paddle-utils');

// Main handler with permission checking
async function addProjectHandler(event) {

  try {
    // Get company and user context (permission already checked by middleware)
    const { companyId, userId, userRole } = getCompanyUserFromEvent(event);

    // Parse request body
    let projectData;
    try {
      projectData = JSON.parse(event.body || '{}');
    } catch (parseError) {
      return createErrorResponse(400, 'Invalid JSON in request body');
    }


    // Validate required fields
    if (!projectData.name || typeof projectData.name !== 'string') {
      return createErrorResponse(400, 'Project name is required and must be a string');
    }

    if (!projectData.startDate) {
      return createErrorResponse(400, 'Project start date is required');
    }

    // Check subscription limits before creating project
    try {
      // Get current project count for the company
      const currentProjectCount = await dynamoOperation('query', {
        TableName: COMPANY_TABLE_NAMES.PROJECTS,
        KeyConditionExpression: 'companyId = :companyId',
        ExpressionAttributeValues: { ':companyId': companyId },
        Select: 'COUNT'
      });


      // Validate subscription limits (will throw error if exceeded)
      await validateSubscriptionLimits(companyId, 'ADD_PROJECT', currentProjectCount.Count);

    } catch (limitError) {
      
      if (limitError.message.includes('Project limit reached')) {
        return createErrorResponse(400, {
          error: 'Project limit reached',
          message: limitError.message,
          action: 'upgrade_required',
          upgradeUrl: `${process.env.FRONTEND_URL || 'http://localhost:8080'}/#/settings/subscription`
        });
      }
      
      if (limitError.message.includes('No active subscription')) {
        return createErrorResponse(400, {
          error: 'No active subscription',
          message: 'Company subscription required to create projects',
          action: 'subscription_required',
          subscribeUrl: `${process.env.FRONTEND_URL || 'http://localhost:8080'}/#/settings/subscription`
        });
      }
      
      // Re-throw other errors
      throw limitError;
    }

    // Check for duplicate project name within company
    const duplicateCheckParams = {
      TableName: COMPANY_TABLE_NAMES.PROJECTS,
      FilterExpression: 'companyId = :companyId AND #name = :name',
      ExpressionAttributeNames: {
        '#name': 'name'
      },
      ExpressionAttributeValues: {
        ':companyId': companyId,
        ':name': projectData.name.trim()
      }
    };

    try {
      const duplicateCheck = await dynamoOperation('scan', duplicateCheckParams);
      if (duplicateCheck.Items && duplicateCheck.Items.length > 0) {
        return createErrorResponse(409, `Project with name "${projectData.name}" already exists in company`);
      }
    } catch (error) {
      // Continue but log the error
    }

    // Generate project ID and timestamps
    const projectId = generateProjectId();
    const timestamp = getCurrentTimestamp();

    // Create project object with company-scoped structure
    const project = {
      companyId,           // Company association
      projectId,           // Sort key
      name: projectData.name.trim(),
      startDate: projectData.startDate,
      description: projectData.description ? projectData.description.trim() : '',
      status: projectData.status || 'active',
      spentAmount: projectData.spentAmount || 0,
      budget: projectData.budget || null,
      
      // Permission and ownership tracking
      createdBy: userId,
      lastModifiedBy: userId,
      assignedTo: projectData.assignedTo || [userId], // Default assign to creator
      isPublic: projectData.isPublic !== false, // Default to public unless explicitly false
      
      // Timestamps
      createdAt: timestamp,
      updatedAt: timestamp
    };


    // Save to DynamoDB company projects table
    const putParams = {
      TableName: COMPANY_TABLE_NAMES.PROJECTS,
      Item: project,
      ConditionExpression: 'attribute_not_exists(projectId)' // Prevent overwrites
    };

    await dynamoOperation('put', putParams);


    return createResponse(201, {
      success: true,
      message: 'Project added successfully',
      data: {
        project: {
          ...project,
          // Add permission context for frontend
          permissions: {
            canEdit: true,  // Creator can always edit
            canDelete: true, // Creator can always delete
            canAssign: true  // Creator can assign to others
          }
        },
        projectId
      },
      timestamp
    });

  } catch (error) {

    if (error.code === 'ConditionalCheckFailedException') {
      return createErrorResponse(409, 'Project with this ID already exists');
    }

    if (error.message.includes('Company authentication required')) {
      return createErrorResponse(401, 'Authentication required');
    }

    if (error.message.includes('Access denied')) {
      return createErrorResponse(403, error.message);
    }

    return createErrorResponse(500, 'Failed to add project', error);
  }
}

// Export handler wrapped with CREATE_PROJECTS permission requirement
exports.handler = withPermission(PERMISSIONS.CREATE_PROJECTS, addProjectHandler);