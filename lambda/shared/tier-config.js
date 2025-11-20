// lambda/shared/tier-config.js
// Subscription tier configuration and limits

/**
 * Tier definitions with limits and features
 * Aligned with pricing page specifications
 */
const TIER_LIMITS = {
  basic: {
    name: 'בסיסי',
    price: 100,
    maxUsers: 1,
    maxProjects: 3,
    maxExpensesPerMonth: 50,
    maxSuppliers: -1, // -1 = unlimited
    maxWorks: -1,
    features: {
      dashboard: true,
      pdfExport: true,
      advancedPdfExport: false,
      autoBackups: false,
      prioritySupport: false
    }
  },
  professional: {
    name: 'מקצועי',
    price: 200,
    maxUsers: 3,
    maxProjects: 10,
    maxExpensesPerMonth: -1, // unlimited
    maxSuppliers: -1,
    maxWorks: -1,
    features: {
      dashboard: true,
      pdfExport: true,
      advancedPdfExport: true,
      autoBackups: false,
      prioritySupport: true
    }
  },
  enterprise: {
    name: 'ארגוני',
    price: 300,
    maxUsers: 10,
    maxProjects: -1, // unlimited
    maxExpensesPerMonth: -1,
    maxSuppliers: -1,
    maxWorks: -1,
    features: {
      dashboard: true,
      pdfExport: true,
      advancedPdfExport: true,
      autoBackups: true,
      prioritySupport: true
    }
  },
  trial: {
    name: 'ניסיון',
    price: 0,
    maxUsers: 1,
    maxProjects: 3,
    maxExpensesPerMonth: 50,
    maxSuppliers: -1,
    maxWorks: -1,
    features: {
      dashboard: true,
      pdfExport: true,
      advancedPdfExport: false,
      autoBackups: false,
      prioritySupport: false
    }
  }
};

/**
 * Get tier limits configuration
 * @param {string} tier - Tier name (basic|professional|enterprise|trial)
 * @returns {object} Tier configuration
 */
function getTierLimits(tier) {
  const normalizedTier = (tier || 'trial').toLowerCase();
  return TIER_LIMITS[normalizedTier] || TIER_LIMITS.trial;
}

/**
 * Check if a limit value represents unlimited
 * @param {number} limit - Limit value
 * @returns {boolean} True if unlimited
 */
function isUnlimited(limit) {
  return limit === -1;
}

/**
 * Check if tier has a specific feature
 * @param {string} tier - Tier name
 * @param {string} feature - Feature name
 * @returns {boolean} True if feature is enabled
 */
function hasFeature(tier, feature) {
  const limits = getTierLimits(tier);
  return limits.features[feature] === true;
}

/**
 * Get suggested upgrade tier when limit is reached
 * @param {string} currentTier - Current tier name
 * @returns {string|null} Suggested tier or null if already at max
 */
function getSuggestedUpgrade(currentTier) {
  const normalizedTier = (currentTier || 'trial').toLowerCase();

  if (normalizedTier === 'trial' || normalizedTier === 'basic') {
    return 'professional';
  }

  if (normalizedTier === 'professional') {
    return 'enterprise';
  }

  return null; // Already at max tier
}

/**
 * Get all available tiers for display
 * @returns {object} All tier configurations
 */
function getAllTiers() {
  return TIER_LIMITS;
}

module.exports = {
  TIER_LIMITS,
  getTierLimits,
  isUnlimited,
  hasFeature,
  getSuggestedUpgrade,
  getAllTiers
};
