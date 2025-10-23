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
  isLocal,
  TABLE_NAMES
} = require('./shared/multi-table-utils');

exports.handler = async (event) => {
  console.log('addContractor event received:', JSON.stringify(event, null, 2));

  try {
    // Get user ID from event context
    const userId = getUserIdFromEvent(event);
    console.log('User ID:', userId);

    // Parse request body
    let contractorData;
    try {
      contractorData = JSON.parse(event.body || '{}');
    } catch (parseError) {
      return createErrorResponse(400, 'Invalid JSON in request body');
    }

    console.log('Contractor data received:', contractorData);

    // Validate contractor data
    try {
      validateContractor(contractorData);
    } catch (validationError) {
      return createErrorResponse(400, `Validation error: ${validationError.message}`);
    }

    // Check for duplicate contractor name
    const duplicateCheckParams = {
      TableName: TABLE_NAMES.CONTRACTORS,
      KeyConditionExpression: 'userId = :userId',
      FilterExpression: '#name = :name',
      ExpressionAttributeNames: {
        '#name': 'name'
      },
      ExpressionAttributeValues: {
        ':userId': userId,
        ':name': contractorData.name.trim()
      }
    };

    try {
      const duplicateCheck = await dynamodb.query(duplicateCheckParams).promise();
      if (duplicateCheck.Items && duplicateCheck.Items.length > 0) {
        return createErrorResponse(409, `Contractor with name "${contractorData.name}" already exists`);
      }
    } catch (error) {
      console.error('Duplicate check failed:', error);
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
      phone: contractorData.phone.trim(),
      createdAt: timestamp,
      updatedAt: timestamp
    };

    console.log('Creating contractor:', contractor);

    // Save to DynamoDB Contractors table
    const putParams = {
      TableName: TABLE_NAMES.CONTRACTORS,
      Item: contractor,
      ConditionExpression: 'attribute_not_exists(contractorId)' // Prevent overwrites
    };

    await dynamodb.put(putParams).promise();

    console.log('Contractor saved successfully:', { contractorId });

    return createResponse(201, {
      success: true,
      message: 'Contractor added successfully',
      data: {
        contractor,
        contractorId
      },
      timestamp
    });

  } catch (error) {
    console.error('Error in addContractor:', error);

    if (error.code === 'ConditionalCheckFailedException') {
      return createErrorResponse(409, 'Contractor with this ID already exists');
    }

    if (error.message.includes('User ID not found')) {
      return createErrorResponse(401, 'Unauthorized: Invalid user context');
    }

    return createErrorResponse(500, 'Failed to add contractor', error);
  }
};