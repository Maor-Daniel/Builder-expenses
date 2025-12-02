// lambda/addWork.js
// Add a new work item with WorkName and TotalWorkCost

const {
  createResponse,
  createErrorResponse,
  getUserIdFromEvent,
  validateWork,
  generateWorkId,
  getCurrentTimestamp,
  dynamodb,
  isLocal,
  validateProjectExists,
  validateContractorExists,
  TABLE_NAMES,
  dynamoOperation
} = require('./shared/multi-table-utils');
const { withSecureCors } = require('./shared/cors-config');

exports.handler = withSecureCors(async (event) => {

  try {
    // Get user ID from event context
    const userId = getUserIdFromEvent(event);

    // Parse request body
    let workData;
    try {
      workData = JSON.parse(event.body || '{}');
    } catch (parseError) {
      return createErrorResponse(400, 'Invalid JSON in request body');
    }


    // Validate work data
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

    // Create work object with multi-table structure
    const work = {
      userId,
      workId,
      projectId: workData.projectId.trim(),
      contractorId: workData.contractorId.trim(),
      expenseId: workData.expenseId ? workData.expenseId.trim() : null, // Optional FK to Expenses
      WorkName: workData.WorkName.trim(), // Updated field name
      description: workData.description ? workData.description.trim() : '',
      TotalWorkCost: parseFloat(workData.TotalWorkCost), // Updated field name
      status: workData.status || 'planned',
      createdAt: timestamp,
      updatedAt: timestamp
    };


    // Save to DynamoDB Works table
    const putParams = {
      TableName: TABLE_NAMES.WORKS,
      Item: work,
      ConditionExpression: 'attribute_not_exists(workId)' // Prevent overwrites
    };

    await dynamoOperation('put', putParams);


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

    if (error.code === 'ConditionalCheckFailedException') {
      return createErrorResponse(409, 'Work with this ID already exists');
    }

    if (error.message.includes('User ID not found')) {
      return createErrorResponse(401, 'Unauthorized: Invalid user context');
    }

    return createErrorResponse(500, 'Failed to add work', error);
  }
};