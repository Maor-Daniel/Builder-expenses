// lambda/multi-table/addWork.js
// Add a new work - Multi-table version

const {
  TABLE_NAMES,
  createResponse,
  createErrorResponse,
  getUserIdFromEvent,
  validateWork,
  generateWorkId,
  getCurrentTimestamp,
  debugLog,
  dynamoOperation,
  validateProjectExists,
  validateContractorExists
} = require('../shared/multi-table-utils');

exports.handler = async (event) => {
  debugLog('addWork event received', event);

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
    let workData;
    try {
      workData = JSON.parse(event.body || '{}');
    } catch (parseError) {
      return createErrorResponse(400, 'Invalid JSON in request body');
    }

    debugLog('Work data received', workData);

    // Validate work data (updated fields: WorkName, TotalWorkCost)
    try {
      validateWork(workData);
    } catch (validationError) {
      return createErrorResponse(400, `Validation error: ${validationError.message}`);
    }

    // Validate foreign key relationships
    try {
      await validateProjectExists(userId, workData.projectId);
      await validateContractorExists(userId, workData.contractorId);
    } catch (fkError) {
      return createErrorResponse(400, `Foreign key validation error: ${fkError.message}`);
    }

    // Generate work ID and timestamps
    const workId = generateWorkId();
    const timestamp = getCurrentTimestamp();

    // Create work object (updated schema: WorkName, TotalWorkCost, no workType/dates)
    const work = {
      userId,
      workId,
      projectId: workData.projectId.trim(),
      contractorId: workData.contractorId.trim(),
      WorkName: workData.WorkName.trim(), // Required field
      description: workData.description ? workData.description.trim() : '',
      TotalWorkCost: parseFloat(workData.TotalWorkCost), // Required field
      status: workData.status || 'planned',
      createdAt: timestamp,
      updatedAt: timestamp
    };

    // Add optional expense reference if provided
    if (workData.expenseId) {
      work.expenseId = workData.expenseId.trim();
    }

    debugLog('Work object created', work);

    // Additional business logic validation
    if (work.TotalWorkCost > 10000000) {
      return createErrorResponse(400, 'TotalWorkCost exceeds maximum limit (10,000,000)');
    }

    // Check for duplicate WorkName within the same project
    const duplicateCheckParams = {
      TableName: TABLE_NAMES.WORKS,
      IndexName: 'project-status-index',
      KeyConditionExpression: 'userId = :userId AND projectId = :projectId',
      FilterExpression: 'WorkName = :workName',
      ExpressionAttributeValues: {
        ':userId': userId,
        ':projectId': work.projectId,
        ':workName': work.WorkName
      }
    };

    try {
      const duplicateCheck = await dynamoOperation('query', duplicateCheckParams);
      if (duplicateCheck.Items && duplicateCheck.Items.length > 0) {
        return createErrorResponse(409, `Work with name "${work.WorkName}" already exists in this project`);
      }
    } catch (error) {
      debugLog('Duplicate check failed, continuing', error.message);
    }

    // Save to WorksTable
    const putParams = {
      TableName: TABLE_NAMES.WORKS,
      Item: work,
      ConditionExpression: 'attribute_not_exists(workId)' // Prevent overwrites
    };

    await dynamoOperation('put', putParams);

    debugLog('Work saved successfully', { workId });

    return createResponse(201, {
      success: true,
      message: 'Work added successfully',
      data: {
        work,
        workId
      },
      timestamp
    });

  } catch (error) {
    console.error('Error in addWork:', error);

    if (error.code === 'ConditionalCheckFailedException') {
      return createErrorResponse(409, 'Work with this ID already exists');
    }

    if (error.message.includes('User ID not found')) {
      return createErrorResponse(401, 'Unauthorized: Invalid user context');
    }

    return createErrorResponse(500, 'Failed to add work', error);
  }
};