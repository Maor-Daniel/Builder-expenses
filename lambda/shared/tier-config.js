// lambda/shared/tier-config.js
// Subscription tier configuration and limits

/**
 * Tier definitions with limits and features
 * Aligned with pricing page specifications
 */
const TIER_LIMITS = {
  trial: {
    name: 'Trial',
    price: 0, // Free trial
    currency: 'ILS',
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
  starter: {
    name: 'Starter',
    price: 100, // ILS per month
    currency: 'ILS',
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
    name: 'Professional',
    price: 200, // ILS per month
    currency: 'ILS',
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
    name: 'Enterprise',
    price: 300, // ILS per month
    currency: 'ILS',
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
  }
};

/**
 * Get tier limits configuration
 * @param {string} tier - Tier name (starter|professional|enterprise)
 * @returns {object} Tier configuration
 */
function getTierLimits(tier) {
  const normalizedTier = (tier || 'starter').toLowerCase();
  return TIER_LIMITS[normalizedTier] || TIER_LIMITS.starter;
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
  const normalizedTier = (currentTier || 'starter').toLowerCase();

  if (normalizedTier === 'trial') {
    return 'starter';
  }

  if (normalizedTier === 'starter') {
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
