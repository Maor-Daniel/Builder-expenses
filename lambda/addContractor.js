// lambda/addContractor.js
// Add a new contractor/supplier

const {
  createResponse,
  createErrorResponse,
  getUserIdFromEvent,
  getCurrentTimestamp,
  debugLog,
  dynamoOperation,
  TABLE_NAME
} = require('./shared/utils');

function validateContractor(contractor) {
  const required = ['name'];
  const missing = required.filter(field => !contractor[field]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }
  
  // Validate phone number if provided (more flexible validation)
  if (contractor.phone && contractor.phone.trim()) {
    const phoneRegex = /^[\d\-\+\(\)\s\u0590-\u05FF\u0600-\u06FF\*\#\.]*$/; // Allow Hebrew, Arabic, and common phone characters
    if (!phoneRegex.test(contractor.phone)) {
      throw new Error('Invalid phone number format');
    }
  }
  
  return true;
}

function generateContractorId() {
  return `contr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

exports.handler = async (event) => {
  debugLog('addContractor event received', event);

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
    let contractorData;
    try {
      contractorData = JSON.parse(event.body || '{}');
    } catch (parseError) {
      return createErrorResponse(400, 'Invalid JSON in request body');
    }

    debugLog('Contractor data received', contractorData);

    // Validate contractor data
    try {
      validateContractor(contractorData);
    } catch (validationError) {
      return createErrorResponse(400, `Validation error: ${validationError.message}`);
    }

    // Generate contractor ID and timestamps
    const contractorId = generateContractorId();
    const timestamp = getCurrentTimestamp();

    // Create contractor object - use contractorId as expenseId for table compatibility
    const contractor = {
      userId,
      expenseId: contractorId, // DynamoDB table expects expenseId as sort key
      contractorId,
      name: contractorData.name.trim(),
      phone: contractorData.phone ? contractorData.phone.trim() : '',
      createdAt: timestamp,
      updatedAt: timestamp
    };

    // Add optional signature if provided
    if (contractorData.signature) {
      contractor.signature = {
        name: contractorData.signature.name,
        data: contractorData.signature.data,
        type: contractorData.signature.type,
        size: contractorData.signature.size
      };
    }

    // Check for duplicate contractor name
    const duplicateCheckParams = {
      TableName: TABLE_NAME,
      KeyConditionExpression: 'userId = :userId',
      FilterExpression: '#name = :name AND attribute_exists(contractorId)',
      ExpressionAttributeNames: {
        '#name': 'name'
      },
      ExpressionAttributeValues: {
        ':userId': userId,
        ':name': contractor.name
      }
    };

    try {
      const duplicateCheck = await dynamoOperation('query', duplicateCheckParams);
      if (duplicateCheck.Items && duplicateCheck.Items.length > 0) {
        return createErrorResponse(409, `Contractor "${contractor.name}" already exists`);
      }
    } catch (error) {
      debugLog('Duplicate check had error, continuing', error.message);
    }

    // Save to DynamoDB
    const putParams = {
      TableName: TABLE_NAME,
      Item: contractor,
      ConditionExpression: 'attribute_not_exists(expenseId)' // Use expenseId which is the sort key
    };

    await dynamoOperation('put', putParams);

    debugLog('Contractor saved successfully', { contractorId });

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