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
 * Check if company can create new project (with atomic increment)
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

  // Use atomic increment with conditional check to prevent race conditions
  const result = await incrementProjectCounter(companyId, limits.maxProjects);

  if (!result.success) {
    const currentProjects = company.currentProjects || 0;
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
 * Check if company can create new expense (with atomic increment)
 * @param {string} companyId - Company ID
 * @returns {object} { allowed: boolean, reason?: string, currentUsage?: number, limit?: number, suggestedTier?: string }
 */
async function checkExpenseLimit(companyId) {
  const company = await getCompany(companyId);
  const tier = company.subscriptionTier || 'trial';
  const limits = getTierLimits(tier);

  if (isUnlimited(limits.maxExpensesPerMonth)) {
    return { allowed: true };
  }

  // Use atomic increment with conditional check and monthly reset to prevent race conditions
  const result = await incrementExpenseCounter(companyId, limits.maxExpensesPerMonth);

  if (!result.success) {
    const currentExpenses = company.currentMonthExpenses || 0;
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
 * Check if company can invite new user (with atomic increment)
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

  // Use atomic increment with conditional check to prevent race conditions
  const result = await incrementUserCounter(companyId, limits.maxUsers);

  if (!result.success) {
    const currentUsers = company.currentUsers || 1;
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
 * Increment project counter atomically with limit check
 * @param {string} companyId - Company ID
 * @param {number} limit - Maximum allowed projects
 * @returns {object} { success: boolean, reason?: string }
 */
async function incrementProjectCounter(companyId, limit) {
  try {
    await dynamoOperation('update', {
      TableName: COMPANY_TABLE_NAMES.COMPANIES,
      Key: { companyId },
      UpdateExpression: 'ADD currentProjects :inc SET updatedAt = :now',
      ConditionExpression: 'attribute_not_exists(currentProjects) OR currentProjects < :limit',
      ExpressionAttributeValues: {
        ':inc': 1,
        ':limit': limit,
        ':now': new Date().toISOString()
      }
    });
    return { success: true };
  } catch (error) {
    if (error.name === 'ConditionalCheckFailedException') {
      return { success: false, reason: 'LIMIT_EXCEEDED' };
    }
    throw error;
  }
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
 * Increment expense counter atomically with limit check and monthly reset
 * @param {string} companyId - Company ID
 * @param {number} limit - Maximum allowed expenses per month
 * @returns {object} { success: boolean, reason?: string }
 */
async function incrementExpenseCounter(companyId, limit) {
  const now = new Date();
  const resetDateThreshold = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  try {
    // First, try to increment with the limit check (assuming counter is current)
    await dynamoOperation('update', {
      TableName: COMPANY_TABLE_NAMES.COMPANIES,
      Key: { companyId },
      UpdateExpression: 'ADD currentMonthExpenses :inc SET updatedAt = :now',
      ConditionExpression: '(attribute_not_exists(currentMonthExpenses) OR currentMonthExpenses < :limit) AND (attribute_not_exists(expenseCounterResetDate) OR expenseCounterResetDate >= :resetThreshold)',
      ExpressionAttributeValues: {
        ':inc': 1,
        ':limit': limit,
        ':now': now.toISOString(),
        ':resetThreshold': resetDateThreshold
      }
    });
    return { success: true };
  } catch (error) {
    if (error.name === 'ConditionalCheckFailedException') {
      // Could be limit exceeded OR needs monthly reset
      // Try to reset and then increment atomically
      try {
        await dynamoOperation('update', {
          TableName: COMPANY_TABLE_NAMES.COMPANIES,
          Key: { companyId },
          UpdateExpression: 'SET currentMonthExpenses = :one, expenseCounterResetDate = :now, updatedAt = :now',
          ConditionExpression: 'attribute_not_exists(expenseCounterResetDate) OR expenseCounterResetDate < :resetThreshold',
          ExpressionAttributeValues: {
            ':one': 1,
            ':now': now.toISOString(),
            ':resetThreshold': resetDateThreshold
          }
        });
        return { success: true };
      } catch (resetError) {
        if (resetError.name === 'ConditionalCheckFailedException') {
          // Counter is current and limit was actually exceeded
          return { success: false, reason: 'LIMIT_EXCEEDED' };
        }
        throw resetError;
      }
    }
    throw error;
  }
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
 * Increment user counter atomically with limit check
 * @param {string} companyId - Company ID
 * @param {number} limit - Maximum allowed users
 * @returns {object} { success: boolean, reason?: string }
 */
async function incrementUserCounter(companyId, limit) {
  try {
    await dynamoOperation('update', {
      TableName: COMPANY_TABLE_NAMES.COMPANIES,
      Key: { companyId },
      UpdateExpression: 'ADD currentUsers :inc SET updatedAt = :now',
      ConditionExpression: 'attribute_not_exists(currentUsers) OR currentUsers < :limit',
      ExpressionAttributeValues: {
        ':inc': 1,
        ':limit': limit,
        ':now': new Date().toISOString()
      }
    });
    return { success: true };
  } catch (error) {
    if (error.name === 'ConditionalCheckFailedException') {
      return { success: false, reason: 'LIMIT_EXCEEDED' };
    }
    throw error;
  }
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
