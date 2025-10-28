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

exports.handler = async (event) => {
  console.log('addContractor event received:', JSON.stringify(event, null, 2));

  try {
    console.log('Getting user ID...');
    // Get user ID from event context
    const userId = getUserIdFromEvent(event);
    console.log('User ID:', userId);

    console.log('Parsing request body...');
    // Parse request body
    let contractorData;
    try {
      contractorData = JSON.parse(event.body || '{}');
      console.log('JSON parsing successful');
    } catch (parseError) {
      console.log('JSON parsing failed:', parseError);
      return createErrorResponse(400, 'Invalid JSON in request body');
    }

    console.log('Contractor data received:', contractorData);
    console.log('About to start validation...');

    // Validate contractor data
    console.log('Starting validation...');
    try {
      validateContractor(contractorData);
      console.log('Validation passed');
    } catch (validationError) {
      console.log('Validation failed:', validationError.message);
      return createErrorResponse(400, `Validation error: ${validationError.message}`);
    }

    // Check for duplicate contractor name - using scan for now
    console.log('Starting duplicate check...');
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
      console.log('Duplicate check completed:', duplicateCheck.Items.length, 'items found');
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
      phone: contractorData.phone ? contractorData.phone.trim() : '',
      createdAt: timestamp,
      updatedAt: timestamp
    };

    console.log('Creating contractor:', contractor);

    // Save to DynamoDB Contractors table
    console.log('Preparing to save to DynamoDB...');
    const putParams = {
      TableName: TABLE_NAMES.CONTRACTORS,
      Item: contractor,
      ConditionExpression: 'attribute_not_exists(contractorId)' // Prevent overwrites
    };

    try {
      await dynamoOperation('put', putParams);
      console.log('Contractor saved successfully:', { contractorId });
    } catch (saveError) {
      console.error('Error saving contractor:', saveError);
      return createErrorResponse(500, 'Failed to save contractor to database');
    }

    console.log('About to create response...');
    const response = createResponse(201, {
      success: true,
      message: 'Contractor added successfully',
      data: {
        contractor,
        contractorId
      },
      timestamp
    });
    console.log('Response created:', JSON.stringify(response, null, 2));
    return response;

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