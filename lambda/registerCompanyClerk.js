// lambda/registerCompanyClerk.js
// Clerk-based company registration endpoint
// User already exists in Clerk, we just create the company record

const {
  createResponse,
  createErrorResponse,
  getCompanyUserFromEvent,
  getCurrentTimestamp,
  debugLog,
  dynamoOperation,
  COMPANY_TABLE_NAMES,
  SYSTEM_PROJECTS,
  SYSTEM_CONTRACTORS,
  USER_ROLES,
  SUBSCRIPTION_TIERS
} = require('./shared/company-utils');
const { withSecureCors } = require('./shared/cors-config');

exports.handler = withSecureCors(async (event) => {

  // Handle CORS preflight
  // OPTIONS handling now in withSecureCors middleware

  if (event.httpMethod !== 'POST') {
    return createErrorResponse(405, 'Method not allowed');
  }

  try {
    // Get user context from Clerk JWT
    const { companyId, userId, userEmail } = getCompanyUserFromEvent(event);

    // Parse request body
    const requestBody = JSON.parse(event.body || '{}');
    const { companyName, subscriptionTier } = requestBody;

    // Validate inputs
    if (!companyName || companyName.trim().length === 0) {
      return createErrorResponse(400, 'Company name is required');
    }

    if (!subscriptionTier || !['starter', 'professional', 'enterprise'].includes(subscriptionTier.toLowerCase())) {
      return createErrorResponse(400, 'Valid subscription tier is required (starter, professional, or enterprise)');
    }

    // Check if company already exists
    const existingCompany = await dynamoOperation('get', {
      TableName: COMPANY_TABLE_NAMES.COMPANIES,
      Key: { companyId }
    });

    if (existingCompany.Item) {
      return createErrorResponse(400, 'Company already exists for this user');
    }

    const timestamp = getCurrentTimestamp();

    // Create company record
    const company = {
      companyId,
      name: companyName.trim(),
      description: '',
      industry: '',
      companyAddress: '',
      companyPhone: '',
      logoUrl: '',
      subscriptionTier: subscriptionTier.toLowerCase(),
      subscriptionStatus: 'trialing',
      // Initialize usage counters
      currentProjects: 0,
      currentUsers: 1, // The creator
      currentMonthExpenses: 0,
      // Timestamps
      createdAt: timestamp,
      updatedAt: timestamp,
      // Trial period (30 days for all tiers)
      trialStartDate: timestamp,
      trialEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days from now
    };

    // Only add companyEmail if userEmail is not empty
    if (userEmail && userEmail.trim().length > 0) {
      company.companyEmail = userEmail.trim();
    }

    await dynamoOperation('put', {
      TableName: COMPANY_TABLE_NAMES.COMPANIES,
      Item: company
    });

    // Create admin user record in company-users table
    const adminUser = {
      companyId,
      userId,
      name: '', // Will be updated when user updates profile
      role: USER_ROLES.ADMIN,
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp
    };

    // Only add email if it's not empty (DynamoDB GSI doesn't allow empty strings)
    if (userEmail && userEmail.trim().length > 0) {
      adminUser.email = userEmail.trim();
    }

    await dynamoOperation('put', {
      TableName: COMPANY_TABLE_NAMES.USERS,
      Item: adminUser
    });

    // Create system "General Expenses" project for unassigned expenses
    const generalExpensesProject = {
      companyId,
      projectId: SYSTEM_PROJECTS.GENERAL_EXPENSES.projectId,
      userId: userId,
      name: SYSTEM_PROJECTS.GENERAL_EXPENSES.name,
      description: SYSTEM_PROJECTS.GENERAL_EXPENSES.description,
      isSystemProject: true,
      startDate: timestamp.substring(0, 10), // YYYY-MM-DD format
      endDate: null,
      status: 'active',
      budget: 0,
      spentAmount: 0,
      location: '',
      clientName: '',
      createdAt: timestamp,
      updatedAt: timestamp
    };

    await dynamoOperation('put', {
      TableName: COMPANY_TABLE_NAMES.PROJECTS,
      Item: generalExpensesProject
    });

    // Create system "General Contractor" for unassigned expenses
    const generalContractor = {
      companyId,
      contractorId: SYSTEM_CONTRACTORS.GENERAL_CONTRACTOR.contractorId,
      userId: userId,
      name: SYSTEM_CONTRACTORS.GENERAL_CONTRACTOR.name,
      contactPerson: '',
      phone: '',
      email: '',
      address: '',
      specialty: 'כללי',
      licenseNumber: '',
      taxId: '',
      paymentTerms: '',
      notes: SYSTEM_CONTRACTORS.GENERAL_CONTRACTOR.description,
      isSystemContractor: true,
      status: 'active',
      rating: null,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    await dynamoOperation('put', {
      TableName: COMPANY_TABLE_NAMES.CONTRACTORS,
      Item: generalContractor
    });

    console.log(`Company created successfully: ${companyId} for user: ${userId} with General Expenses project and General Contractor`);

    return createResponse(201, {
      success: true,
      message: 'Company created successfully',
      company: {
        id: company.companyId,
        name: company.name,
        subscriptionTier: company.subscriptionTier,
        createdAt: company.createdAt
      },
      user: {
        id: adminUser.userId,
        email: adminUser.email,
        role: adminUser.role
      },
      timestamp
    });

  } catch (error) {
    console.error('ERROR in registerCompanyClerk:', {
      error: error.message,
      stack: error.stack
    });
    return createErrorResponse(500, 'Internal server error creating company');
  }
});
