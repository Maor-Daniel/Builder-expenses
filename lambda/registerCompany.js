// lambda/registerCompany.js
// Company registration endpoint - creates company and admin user

const {
  createResponse,
  createErrorResponse,
  validateCompany,
  createCompanyWithAdmin,
  generateCompanyId,
  getCurrentTimestamp,
  debugLog,
  cognito,
  COMPANY_TABLE_NAMES,
  USER_ROLES
} = require('./shared/company-utils');

exports.handler = async (event) => {

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

    const { company, admin } = requestBody;

    if (!company || !admin) {
      return createErrorResponse(400, 'Missing company or admin data');
    }

    // Validate required fields
    validateCompany({
      name: company.name,
      adminEmail: admin.email,
      adminName: admin.name
    });

    // Additional admin validation
    if (!admin.password || admin.password.length < 8) {
      return createErrorResponse(400, 'Admin password must be at least 8 characters');
    }

    if (admin.password !== admin.confirmPassword) {
      return createErrorResponse(400, 'Passwords do not match');
    }

    // Create admin user in Cognito User Pool first
    const cognitoParams = {
      UserPoolId: process.env.COGNITO_USER_POOL_ID || 'us-east-1_OBAlNkRnG',
      Username: admin.email,
      TemporaryPassword: admin.password,
      MessageAction: 'SUPPRESS', // Don't send welcome email for company registration
      UserAttributes: [
        {
          Name: 'email',
          Value: admin.email
        },
        {
          Name: 'email_verified',
          Value: 'true'
        },
        {
          Name: 'name',
          Value: admin.name
        }
      ]
    };

    let cognitoUser;
    try {
      cognitoUser = await cognito.adminCreateUser(cognitoParams).promise();
    } catch (cognitoError) {
      if (cognitoError.code === 'UsernameExistsException') {
        return createErrorResponse(400, 'User with this email already exists');
      }
      throw cognitoError;
    }

    // Set permanent password for the admin user
    try {
      await cognito.adminSetUserPassword({
        UserPoolId: process.env.COGNITO_USER_POOL_ID || 'us-east-1_OBAlNkRnG',
        Username: admin.email,
        Password: admin.password,
        Permanent: true
      }).promise();
    } catch (passwordError) {
      // If password setting fails, delete the created user
      await cognito.adminDeleteUser({
        UserPoolId: process.env.COGNITO_USER_POOL_ID || 'us-east-1_OBAlNkRnG',
        Username: admin.email
      }).promise();
      throw passwordError;
    }

    // Generate company ID and create company with admin user
    const companyId = generateCompanyId();
    
    const adminData = {
      userId: cognitoUser.User.Username, // Use Cognito username as userId
      email: admin.email,
      name: admin.name
    };

    const companyData = {
      name: company.name,
      description: company.description || '',
      industry: company.industry || ''
    };

    try {
      const { company: createdCompany, adminUser } = await createCompanyWithAdmin(companyData, adminData);
      
      // Update Cognito user with custom attributes (company and role)
      await cognito.adminUpdateUserAttributes({
        UserPoolId: process.env.COGNITO_USER_POOL_ID || 'us-east-1_OBAlNkRnG',
        Username: admin.email,
        UserAttributes: [
          {
            Name: 'custom:companyId',
            Value: companyId
          },
          {
            Name: 'custom:role',
            Value: USER_ROLES.ADMIN
          }
        ]
      }).promise();


      return createResponse(200, {
        success: true,
        message: 'Company registered successfully',
        data: {
          company: {
            id: createdCompany.companyId,
            name: createdCompany.name,
            description: createdCompany.description
          },
          admin: {
            id: adminUser.userId,
            name: adminUser.name,
            email: adminUser.email,
            role: adminUser.role
          }
        },
        timestamp: getCurrentTimestamp()
      });

    } catch (dbError) {
      
      // Rollback: Delete Cognito user if database operations failed
      try {
        await cognito.adminDeleteUser({
          UserPoolId: process.env.COGNITO_USER_POOL_ID || 'us-east-1_OBAlNkRnG',
          Username: admin.email
        }).promise();
      } catch (rollbackError) {
      }
      
      throw dbError;
    }

  } catch (error) {
    
    if (error.code === 'ConditionalCheckFailedException') {
      return createErrorResponse(409, 'Company already exists');
    }
    
    if (error.code === 'ValidationException' || error.message.includes('Missing required')) {
      return createErrorResponse(400, error.message);
    }
    
    return createErrorResponse(500, 'Internal server error during company registration');
  }
};