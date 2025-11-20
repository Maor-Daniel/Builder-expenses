// lambda/shared/limit-checker.js
// Functions to check subscription tier limits

const { getTierLimits, isUnlimited, getSuggestedUpgrade } = require('./tier-config');
const { dynamoOperation, COMPANY_TABLE_NAMES } = require('./company-utils');

/**
 * Get company record with subscription info
 * @param {string} companyId - Company ID
 * @returns {object} Company record
 */
async function getCompany(companyId) {
  const params = {
    TableName: COMPANY_TABLE_NAMES.COMPANIES,
    Key: { companyId }
  };

  const result = await dynamoOperation('get', params);

  if (!result.Item) {
    throw new Error(`Company ${companyId} not found`);
  }

  return result.Item;
}

/**
 * Reset monthly expense counter if needed
 * @param {object} company - Company record
 * @returns {object} Updated company record
 */
async function resetMonthlyCounterIfNeeded(company) {
  const now = new Date();
  const resetDate = company.expenseCounterResetDate
    ? new Date(company.expenseCounterResetDate)
    : new Date(0); // Epoch if not set

  // Check if we're in a new month
  if (now.getMonth() !== resetDate.getMonth() ||
      now.getFullYear() !== resetDate.getFullYear()) {

    await dynamoOperation('update', {
      TableName: COMPANY_TABLE_NAMES.COMPANIES,
      Key: { companyId: company.companyId },
      UpdateExpression: 'SET currentMonthExpenses = :zero, expenseCounterResetDate = :now',
      ExpressionAttributeValues: {
        ':zero': 0,
        ':now': now.toISOString()
      }
    });

    company.currentMonthExpenses = 0;
    company.expenseCounterResetDate = now.toISOString();
  }

  return company;
}

/**
 * Check if company can create new project
 * @param {string} companyId - Company ID
 * @returns {object} { allowed: boolean, reason?: string, currentUsage?: number, limit?: number, suggestedTier?: string }
 */
async function checkProjectLimit(companyId) {
  const company = await getCompany(companyId);
  const tier = company.subscriptionTier || 'trial';
  const limits = getTierLimits(tier);

  if (isUnlimited(limits.maxProjects)) {
    return { allowed: true };
  }

  const currentProjects = company.currentProjects || 0;

  if (currentProjects >= limits.maxProjects) {
    return {
      allowed: false,
      reason: 'PROJECT_LIMIT_REACHED',
      message: `הגעת למגבלת ${limits.maxProjects} פרויקטים בתוכנית ${limits.name}`,
      currentUsage: currentProjects,
      limit: limits.maxProjects,
      suggestedTier: getSuggestedUpgrade(tier),
      upgradeUrl: '/pricing.html'
    };
  }

  return { allowed: true };
}

/**
 * Check if company can create new expense
 * @param {string} companyId - Company ID
 * @returns {object} { allowed: boolean, reason?: string, currentUsage?: number, limit?: number, suggestedTier?: string }
 */
async function checkExpenseLimit(companyId) {
  let company = await getCompany(companyId);

  // Reset counter if new month
  company = await resetMonthlyCounterIfNeeded(company);

  const tier = company.subscriptionTier || 'trial';
  const limits = getTierLimits(tier);

  if (isUnlimited(limits.maxExpensesPerMonth)) {
    return { allowed: true };
  }

  const currentExpenses = company.currentMonthExpenses || 0;

  if (currentExpenses >= limits.maxExpensesPerMonth) {
    return {
      allowed: false,
      reason: 'EXPENSE_LIMIT_REACHED',
      message: `הגעת למגבלת ${limits.maxExpensesPerMonth} הוצאות בחודש בתוכנית ${limits.name}`,
      currentUsage: currentExpenses,
      limit: limits.maxExpensesPerMonth,
      suggestedTier: getSuggestedUpgrade(tier),
      upgradeUrl: '/pricing.html'
    };
  }

  return { allowed: true };
}

/**
 * Check if company can invite new user
 * @param {string} companyId - Company ID
 * @returns {object} { allowed: boolean, reason?: string, currentUsage?: number, limit?: number, suggestedTier?: string }
 */
async function checkUserLimit(companyId) {
  const company = await getCompany(companyId);
  const tier = company.subscriptionTier || 'trial';
  const limits = getTierLimits(tier);

  if (isUnlimited(limits.maxUsers)) {
    return { allowed: true };
  }

  const currentUsers = company.currentUsers || 1; // At least admin

  if (currentUsers >= limits.maxUsers) {
    return {
      allowed: false,
      reason: 'USER_LIMIT_REACHED',
      message: `הגעת למגבלת ${limits.maxUsers} משתמשים בתוכנית ${limits.name}`,
      currentUsage: currentUsers,
      limit: limits.maxUsers,
      suggestedTier: getSuggestedUpgrade(tier),
      upgradeUrl: '/pricing.html'
    };
  }

  return { allowed: true };
}

/**
 * Increment project counter
 * @param {string} companyId - Company ID
 */
async function incrementProjectCounter(companyId) {
  await dynamoOperation('update', {
    TableName: COMPANY_TABLE_NAMES.COMPANIES,
    Key: { companyId },
    UpdateExpression: 'ADD currentProjects :inc SET updatedAt = :now',
    ExpressionAttributeValues: {
      ':inc': 1,
      ':now': new Date().toISOString()
    }
  });
}

/**
 * Decrement project counter
 * @param {string} companyId - Company ID
 */
async function decrementProjectCounter(companyId) {
  await dynamoOperation('update', {
    TableName: COMPANY_TABLE_NAMES.COMPANIES,
    Key: { companyId },
    UpdateExpression: 'ADD currentProjects :dec SET updatedAt = :now',
    ExpressionAttributeValues: {
      ':dec': -1,
      ':now': new Date().toISOString()
    }
  });
}

/**
 * Increment expense counter
 * @param {string} companyId - Company ID
 */
async function incrementExpenseCounter(companyId) {
  await dynamoOperation('update', {
    TableName: COMPANY_TABLE_NAMES.COMPANIES,
    Key: { companyId },
    UpdateExpression: 'ADD currentMonthExpenses :inc SET updatedAt = :now',
    ExpressionAttributeValues: {
      ':inc': 1,
      ':now': new Date().toISOString()
    }
  });
}

/**
 * Decrement expense counter
 * @param {string} companyId - Company ID
 */
async function decrementExpenseCounter(companyId) {
  await dynamoOperation('update', {
    TableName: COMPANY_TABLE_NAMES.COMPANIES,
    Key: { companyId },
    UpdateExpression: 'ADD currentMonthExpenses :dec SET updatedAt = :now',
    ExpressionAttributeValues: {
      ':dec': -1,
      ':now': new Date().toISOString()
    }
  });
}

/**
 * Increment user counter
 * @param {string} companyId - Company ID
 */
async function incrementUserCounter(companyId) {
  await dynamoOperation('update', {
    TableName: COMPANY_TABLE_NAMES.COMPANIES,
    Key: { companyId },
    UpdateExpression: 'ADD currentUsers :inc SET updatedAt = :now',
    ExpressionAttributeValues: {
      ':inc': 1,
      ':now': new Date().toISOString()
    }
  });
}

/**
 * Decrement user counter
 * @param {string} companyId - Company ID
 */
async function decrementUserCounter(companyId) {
  await dynamoOperation('update', {
    TableName: COMPANY_TABLE_NAMES.COMPANIES,
    Key: { companyId },
    UpdateExpression: 'ADD currentUsers :dec SET updatedAt = :now',
    ExpressionAttributeValues: {
      ':dec': -1,
      ':now': new Date().toISOString()
    }
  });
}

/**
 * Get company usage statistics
 * @param {string} companyId - Company ID
 * @returns {object} Usage statistics
 */
async function getCompanyUsage(companyId) {
  let company = await getCompany(companyId);
  company = await resetMonthlyCounterIfNeeded(company);

  const tier = company.subscriptionTier || 'trial';
  const limits = getTierLimits(tier);

  return {
    tier: {
      name: tier,
      displayName: limits.name
    },
    projects: {
      current: company.currentProjects || 0,
      limit: limits.maxProjects,
      unlimited: isUnlimited(limits.maxProjects),
      percentage: isUnlimited(limits.maxProjects) ? 0 : Math.min(100, ((company.currentProjects || 0) / limits.maxProjects) * 100)
    },
    expenses: {
      current: company.currentMonthExpenses || 0,
      limit: limits.maxExpensesPerMonth,
      unlimited: isUnlimited(limits.maxExpensesPerMonth),
      percentage: isUnlimited(limits.maxExpensesPerMonth) ? 0 : Math.min(100, ((company.currentMonthExpenses || 0) / limits.maxExpensesPerMonth) * 100),
      resetDate: company.expenseCounterResetDate
    },
    users: {
      current: company.currentUsers || 1,
      limit: limits.maxUsers,
      unlimited: isUnlimited(limits.maxUsers),
      percentage: isUnlimited(limits.maxUsers) ? 0 : Math.min(100, ((company.currentUsers || 1) / limits.maxUsers) * 100)
    },
    subscription: {
      status: company.subscriptionStatus || 'trial',
      trialEndDate: company.trialEndDate,
      subscriptionStartDate: company.subscriptionStartDate
    }
  };
}

module.exports = {
  checkProjectLimit,
  checkExpenseLimit,
  checkUserLimit,
  incrementProjectCounter,
  decrementProjectCounter,
  incrementExpenseCounter,
  decrementExpenseCounter,
  incrementUserCounter,
  decrementUserCounter,
  getCompanyUsage
};
