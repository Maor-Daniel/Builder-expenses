// lambda/addWork.js
// Add a new work

const {
  createResponse,
  createErrorResponse,
  getUserIdFromEvent,
  getCurrentTimestamp,
  debugLog,
  dynamoOperation,
  TABLE_NAME
} = require('./shared/utils');

function validateWork(work) {
  const required = ['name', 'project', 'contractor', 'cost'];
  const missing = required.filter(field => !work[field]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }
  
  // Validate cost is a positive number
  if (isNaN(work.cost) || work.cost < 0) {
    throw new Error('Cost must be a positive number');
  }
  
  return true;
}

function generateWorkId() {
  return `work_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

exports.handler = async (event) => {
  debugLog('addWork event received', event);

  try {
    // Get user ID from event context
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

    // Validate work data
    try {
      validateWork(workData);
    } catch (validationError) {
      return createErrorResponse(400, `Validation error: ${validationError.message}`);
    }

    // Generate work ID and timestamps
    const workId = generateWorkId();
    const timestamp = getCurrentTimestamp();

    // Create work object - use workId as expenseId for table compatibility
    const work = {
      userId,
      expenseId: workId, // DynamoDB table expects expenseId as sort key
      workId,
      name: workData.name.trim(),
      project: workData.project.trim(),
      contractor: workData.contractor.trim(),
      cost: parseFloat(workData.cost),
      description: workData.description ? workData.description.trim() : '',
      status: workData.status || 'active',
      createdAt: timestamp,
      updatedAt: timestamp
    };

    // Add optional contract if provided
    if (workData.contract) {
      work.contract = {
        name: workData.contract.name,
        data: workData.contract.data,
        type: workData.contract.type,
        size: workData.contract.size
      };
    }

    // Check for duplicate work name within the same project
    const duplicateCheckParams = {
      TableName: TABLE_NAME,
      KeyConditionExpression: 'userId = :userId',
      FilterExpression: '#name = :name AND #project = :project AND attribute_exists(workId)',
      ExpressionAttributeNames: {
        '#name': 'name',
        '#project': 'project'
      },
      ExpressionAttributeValues: {
        ':userId': userId,
        ':name': work.name,
        ':project': work.project
      }
    };

    try {
      const duplicateCheck = await dynamoOperation('query', duplicateCheckParams);
      if (duplicateCheck.Items && duplicateCheck.Items.length > 0) {
        return createErrorResponse(409, `Work "${work.name}" already exists in project "${work.project}"`);
      }
    } catch (error) {
      debugLog('Duplicate check had error, continuing', error.message);
    }

    // Save to DynamoDB
    const putParams = {
      TableName: TABLE_NAME,
      Item: work,
      ConditionExpression: 'attribute_not_exists(expenseId)' // Use expenseId which is the sort key
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