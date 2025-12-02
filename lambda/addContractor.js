// lambda/addContractor.js
// Add a new contractor with multi-table architecture

const {
  createResponse,
  createErrorResponse,
  getUserIdFromEvent,
  validateContractor,
  generateContractorId,
  getCurrentTimestamp,
  dynamodb,
  TABLE_NAMES,
  dynamoOperation
} = require('./shared/multi-table-utils');
const { withSecureCors } = require('./shared/cors-config');

exports.handler = withSecureCors(async (event) => {

  try {
    // Get user ID from event context
    const userId = getUserIdFromEvent(event);

    // Parse request body
    let contractorData;
    try {
      contractorData = JSON.parse(event.body || '{}');
    } catch (parseError) {
      return createErrorResponse(400, 'Invalid JSON in request body');
    }


    // Validate contractor data
    try {
      validateContractor(contractorData);
    } catch (validationError) {
      return createErrorResponse(400, `Validation error: ${validationError.message}`);
    }

    // Check for duplicate contractor name - using scan for now
    const duplicateCheckParams = {
      TableName: TABLE_NAMES.CONTRACTORS,
      FilterExpression: 'userId = :userId AND #name = :name',
      ExpressionAttributeNames: {
        '#name': 'name'
      },
      ExpressionAttributeValues: {
        ':userId': userId,
        ':name': contractorData.name.trim()
      }
    };

    try {
      const duplicateCheck = await dynamoOperation('scan', duplicateCheckParams);
      if (duplicateCheck.Items && duplicateCheck.Items.length > 0) {
        return createErrorResponse(409, `Contractor with name "${contractorData.name}" already exists`);
      }
    } catch (error) {
      // Continue but log the error
    }

    // Generate contractor ID and timestamps
    const contractorId = generateContractorId();
    const timestamp = getCurrentTimestamp();

    // Create contractor object with multi-table structure
    const contractor = {
      userId,
      contractorId,
      name: contractorData.name.trim(),
      phone: contractorData.phone ? contractorData.phone.trim() : '',
      createdAt: timestamp,
      updatedAt: timestamp
    };


    // Save to DynamoDB Contractors table
    const putParams = {
      TableName: TABLE_NAMES.CONTRACTORS,
      Item: contractor,
      ConditionExpression: 'attribute_not_exists(contractorId)' // Prevent overwrites
    };

    try {
      await dynamoOperation('put', putParams);
    } catch (saveError) {
      return createErrorResponse(500, 'Failed to save contractor to database');
    }

    const response = createResponse(201, {
      success: true,
      message: 'Contractor added successfully',
      data: {
        contractor,
        contractorId
      },
      timestamp
    });
    return response;

  } catch (error) {

    if (error.code === 'ConditionalCheckFailedException') {
      return createErrorResponse(409, 'Contractor with this ID already exists');
    }

    if (error.message.includes('User ID not found')) {
      return createErrorResponse(401, 'Unauthorized: Invalid user context');
    }

    return createErrorResponse(500, 'Failed to add contractor', error);
  }
};