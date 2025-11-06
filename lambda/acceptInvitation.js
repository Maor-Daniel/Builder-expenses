// lambda/acceptInvitation.js
// Accept company invitation and create user account

const {
  createResponse,
  createErrorResponse,
  validateInvitationToken,
  getCurrentTimestamp,
  debugLog,
  dynamoOperation,
  cognito,
  COMPANY_TABLE_NAMES,
  INVITATION_STATUS
} = require('./shared/company-utils');

exports.handler = async (event) => {
  debugLog('Accept invitation request received', { 
    httpMethod: event.httpMethod,
    body: event.body ? 'Present' : 'Missing'
  });

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return createResponse(200, { message: 'CORS preflight' });
  }

  if (event.httpMethod !== 'POST') {
    return createErrorResponse(405, 'Method not allowed');
  }

  try {
    // Parse request body
    const requestBody = JSON.parse(event.body || '{}');
    debugLog('Parsed accept invitation request', requestBody);

    const { token, name, password, confirmPassword, phone } = requestBody;

    if (!token || !name || !password) {
      return createErrorResponse(400, 'Missing required fields: token, name, password');
    }

    if (password !== confirmPassword) {
      return createErrorResponse(400, 'Passwords do not match');
    }

    if (password.length < 8) {
      return createErrorResponse(400, 'Password must be at least 8 characters');
    }

    // Validate invitation token
    const invitation = await validateInvitationToken(token);
    debugLog('Valid invitation found', {
      invitationId: invitation.invitationId,
      email: invitation.email,
      companyId: invitation.companyId
    });

    // Check if user already exists in Cognito
    try {
      const existingUser = await cognito.adminGetUser({
        UserPoolId: process.env.COGNITO_USER_POOL_ID || 'us-east-1_OBAlNkRnG',
        Username: invitation.email
      }).promise();
      
      if (existingUser) {
        return createErrorResponse(400, 'User account already exists. Please try logging in instead.');
      }
    } catch (getUserError) {
      // UserNotFoundException is expected for new users
      if (getUserError.code !== 'UserNotFoundException') {
        throw getUserError;
      }
    }

    // Create user in Cognito User Pool
    const cognitoParams = {
      UserPoolId: process.env.COGNITO_USER_POOL_ID || 'us-east-1_OBAlNkRnG',
      Username: invitation.email,
      TemporaryPassword: password,
      MessageAction: 'SUPPRESS', // Don't send welcome email
      UserAttributes: [
        {
          Name: 'email',
          Value: invitation.email
        },
        {
          Name: 'email_verified',
          Value: 'true'
        },
        {
          Name: 'name',
          Value: name
        },
        {
          Name: 'custom:companyId',
          Value: invitation.companyId
        },
        {
          Name: 'custom:role',
          Value: invitation.role
        }
      ]
    };

    if (phone) {
      cognitoParams.UserAttributes.push({
        Name: 'phone_number',
        Value: phone
      });
    }

    let cognitoUser;
    try {
      cognitoUser = await cognito.adminCreateUser(cognitoParams).promise();
      debugLog('Cognito user created from invitation', { username: cognitoUser.User.Username });
    } catch (cognitoError) {
      console.error('Cognito user creation error:', cognitoError);
      if (cognitoError.code === 'UsernameExistsException') {
        return createErrorResponse(400, 'User account already exists. Please try logging in instead.');
      }
      throw cognitoError;
    }

    // Set permanent password
    try {
      await cognito.adminSetUserPassword({
        UserPoolId: process.env.COGNITO_USER_POOL_ID || 'us-east-1_OBAlNkRnG',
        Username: invitation.email,
        Password: password,
        Permanent: true
      }).promise();
    } catch (passwordError) {
      console.error('Error setting permanent password:', passwordError);
      // Rollback: Delete the created user
      await cognito.adminDeleteUser({
        UserPoolId: process.env.COGNITO_USER_POOL_ID || 'us-east-1_OBAlNkRnG',
        Username: invitation.email
      }).promise();
      throw passwordError;
    }

    // Create user record in company users table
    const timestamp = getCurrentTimestamp();
    const user = {
      companyId: invitation.companyId,
      userId: cognitoUser.User.Username,
      email: invitation.email,
      name: name,
      phone: phone || '',
      role: invitation.role,
      status: 'active',
      invitedBy: invitation.invitedBy,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    try {
      await dynamoOperation('put', {
        TableName: COMPANY_TABLE_NAMES.USERS,
        Item: user,
        ConditionExpression: 'attribute_not_exists(companyId) AND attribute_not_exists(userId)'
      });

      // Mark invitation as accepted
      await dynamoOperation('update', {
        TableName: COMPANY_TABLE_NAMES.INVITATIONS,
        Key: { 
          companyId: invitation.companyId, 
          invitationId: invitation.invitationId 
        },
        UpdateExpression: 'SET #status = :status, acceptedAt = :timestamp, acceptedBy = :userId',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':status': INVITATION_STATUS.ACCEPTED,
          ':timestamp': timestamp,
          ':userId': user.userId
        }
      });

      debugLog('User created and invitation accepted', {
        userId: user.userId,
        companyId: user.companyId,
        invitationId: invitation.invitationId
      });

      // Get company details for response
      const companyResult = await dynamoOperation('get', {
        TableName: COMPANY_TABLE_NAMES.COMPANIES,
        Key: { companyId: invitation.companyId }
      });

      return createResponse(200, {
        success: true,
        message: 'Account created successfully! You can now log in.',
        data: {
          user: {
            id: user.userId,
            name: user.name,
            email: user.email,
            role: user.role
          },
          company: {
            id: invitation.companyId,
            name: companyResult.Item?.name || 'Unknown Company'
          }
        },
        timestamp: getCurrentTimestamp()
      });

    } catch (dbError) {
      console.error('Database error during user creation:', dbError);
      
      // Rollback: Delete Cognito user if database operations failed
      try {
        await cognito.adminDeleteUser({
          UserPoolId: process.env.COGNITO_USER_POOL_ID || 'us-east-1_OBAlNkRnG',
          Username: invitation.email
        }).promise();
        debugLog('Rolled back Cognito user creation');
      } catch (rollbackError) {
        console.error('Error during rollback:', rollbackError);
      }
      
      throw dbError;
    }

  } catch (error) {
    console.error('Accept invitation error:', error);
    
    if (error.message.includes('Invalid or expired invitation')) {
      return createErrorResponse(400, 'Invalid or expired invitation token');
    }
    
    if (error.code === 'ConditionalCheckFailedException') {
      return createErrorResponse(409, 'User account already exists');
    }
    
    if (error.code === 'ValidationException' || error.message.includes('Missing required')) {
      return createErrorResponse(400, error.message);
    }
    
    return createErrorResponse(500, 'Internal server error while creating account');
  }
};