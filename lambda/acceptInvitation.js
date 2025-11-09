// lambda/acceptInvitation.js
// Accept invitation and create user account

const {
  createResponse,
  createErrorResponse,
  getCurrentTimestamp,
  debugLog,
  dynamoOperation,
  COMPANY_TABLE_NAMES,
  cognito
} = require('./shared/company-utils');

async function validateInvitationToken(token) {
  const scanResult = await dynamoOperation('scan', {
    TableName: COMPANY_TABLE_NAMES.INVITATIONS,
    FilterExpression: 'invitationId = :token AND #status = :status',
    ExpressionAttributeNames: {
      '#status': 'status'
    },
    ExpressionAttributeValues: {
      ':token': token,
      ':status': 'PENDING'
    }
  });

  if (!scanResult.Items || scanResult.Items.length === 0) {
    throw new Error('Invalid or expired invitation token');
  }

  const invitation = scanResult.Items[0];
  
  if (new Date(invitation.expiresAt) < new Date()) {
    throw new Error('Invitation has expired');
  }

  return invitation;
}

exports.handler = async (event) => {

  if (event.httpMethod === 'OPTIONS') {
    return createResponse(200, { message: 'CORS preflight' });
  }

  try {
    if (event.httpMethod === 'GET') {
      const queryParams = event.queryStringParameters || {};
      const invitationToken = queryParams.token;
      
      if (!invitationToken) {
        return createErrorResponse(400, 'Invitation token is required');
      }

      const invitation = await validateInvitationToken(invitationToken);
      
      const companyResult = await dynamoOperation('get', {
        TableName: COMPANY_TABLE_NAMES.COMPANIES,
        Key: { companyId: invitation.companyId }
      });

      return createResponse(200, {
        success: true,
        message: 'Invitation token is valid',
        data: {
          invitation: {
            email: invitation.email,
            role: invitation.role,
            companyName: companyResult.Item ? companyResult.Item.name : 'Unknown Company',
            expiresAt: invitation.expiresAt,
            personalMessage: invitation.personalMessage
          }
        }
      });
    }

    if (event.httpMethod !== 'POST') {
      return createErrorResponse(405, 'Method not allowed');
    }

    const requestBody = JSON.parse(event.body || '{}');
    const { token, userDetails } = requestBody;

    if (!token) {
      return createErrorResponse(400, 'Invitation token is required');
    }

    if (!userDetails || !userDetails.name || !userDetails.password) {
      return createErrorResponse(400, 'User details (name, password) are required');
    }

    if (userDetails.password.length < 8) {
      return createErrorResponse(400, 'Password must be at least 8 characters long');
    }

    if (userDetails.password !== userDetails.confirmPassword) {
      return createErrorResponse(400, 'Passwords do not match');
    }

    const invitation = await validateInvitationToken(token);
    
    const companyResult = await dynamoOperation('get', {
      TableName: COMPANY_TABLE_NAMES.COMPANIES,
      Key: { companyId: invitation.companyId }
    });

    if (!companyResult.Item) {
      return createErrorResponse(404, 'Company not found');
    }

    const company = companyResult.Item;

    const cognitoParams = {
      UserPoolId: process.env.COGNITO_USER_POOL_ID || 'us-east-1_OBAlNkRnG',
      Username: invitation.email,
      TemporaryPassword: userDetails.password,
      MessageAction: 'SUPPRESS',
      UserAttributes: [
        { Name: 'email', Value: invitation.email },
        { Name: 'email_verified', Value: 'true' },
        { Name: 'name', Value: userDetails.name },
        { Name: 'custom:companyId', Value: invitation.companyId },
        { Name: 'custom:role', Value: invitation.role }
      ]
    };

    let cognitoUser;
    try {
      cognitoUser = await cognito.adminCreateUser(cognitoParams).promise();
      
      await cognito.adminSetUserPassword({
        UserPoolId: process.env.COGNITO_USER_POOL_ID || 'us-east-1_OBAlNkRnG',
        Username: invitation.email,
        Password: userDetails.password,
        Permanent: true
      }).promise();
      
    } catch (cognitoError) {
      if (cognitoError.code === 'UsernameExistsException') {
        return createErrorResponse(400, 'User account already exists');
      }
      throw cognitoError;
    }

    const timestamp = getCurrentTimestamp();

    try {
      const companyUser = {
        companyId: invitation.companyId,
        userId: cognitoUser.User.Username,
        email: invitation.email,
        name: userDetails.name,
        role: invitation.role,
        status: 'active',
        invitedBy: invitation.invitedBy,
        invitedAt: invitation.invitedAt,
        joinedAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp
      };

      await dynamoOperation('put', {
        TableName: COMPANY_TABLE_NAMES.USERS,
        Item: companyUser,
        ConditionExpression: 'attribute_not_exists(userId)'
      });

      await dynamoOperation('update', {
        TableName: COMPANY_TABLE_NAMES.INVITATIONS,
        Key: { 
          companyId: invitation.companyId, 
          invitationId: token 
        },
        UpdateExpression: 'SET #status = :status, acceptedAt = :acceptedAt, acceptedBy = :acceptedBy',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':status': 'ACCEPTED',
          ':acceptedAt': timestamp,
          ':acceptedBy': cognitoUser.User.Username
        }
      });

      return createResponse(200, {
        success: true,
        message: 'Invitation accepted successfully. You can now log in.',
        data: {
          user: {
            id: companyUser.userId,
            name: companyUser.name,
            email: companyUser.email,
            role: companyUser.role
          },
          company: {
            id: company.companyId,
            name: company.name
          }
        },
        timestamp
      });

    } catch (dbError) {
      try {
        await cognito.adminDeleteUser({
          UserPoolId: process.env.COGNITO_USER_POOL_ID || 'us-east-1_OBAlNkRnG',
          Username: invitation.email
        }).promise();
      } catch (rollbackError) {
      }
      throw dbError;
    }

  } catch (error) {
    
    if (error.message.includes('Invalid or expired')) {
      return createErrorResponse(400, error.message);
    }
    
    return createErrorResponse(500, 'Internal server error accepting invitation');
  }
};