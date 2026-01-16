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
    price: 49.99, // ILS per month (App Store price)
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
    price: 99.99, // ILS per month (App Store price)
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
    price: 149.99, // ILS per month (App Store price)
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

/**
 * Apple In-App Purchase Product ID to Tier Mapping
 * Maps App Store product IDs to internal tier names
 *
 * Note: 'trial' product ID is reserved for future use.
 * Currently using free trial periods (introductory offers) on paid subscriptions.
 * Users in free trial will have starter/professional/enterprise product IDs
 * with appleIsTrialPeriod=true in the receipt.
 */
const APPLE_PRODUCT_IDS = {
  'com.builderexpenses.ofek.trial': 'trial', // Reserved for future use
  'com.builderexpenses.ofek.starter': 'starter',
  'com.builderexpenses.ofek.professional': 'professional',
  'com.builderexpenses.ofek.enterprise': 'enterprise'
};

/**
 * Paddle Price ID to Tier Mapping
 * Maps Paddle subscription price IDs to internal tier names
 */
const PADDLE_PRICE_IDS = {
  'pri_01kdwqn0d0ebbev71xa0v6e2hd': 'starter',
  'pri_01kdwqsgm7mcr7myg3cxnrxt9y': 'professional',
  'pri_01kdwqwn1e1z4xc93rgstytpj1': 'enterprise'
};

/**
 * Map Apple product ID to tier name
 * @param {string} productId - Apple App Store product ID
 * @returns {string} Tier name (defaults to 'trial' if unknown)
 */
function mapAppleProductIdToTier(productId) {
  if (!productId) {
    return 'trial';
  }
  return APPLE_PRODUCT_IDS[productId] || 'trial';
}

/**
 * Map Paddle price ID to tier name
 * @param {string} priceId - Paddle subscription price ID
 * @returns {string} Tier name (defaults to 'starter' if unknown)
 */
function mapPaddlePriceIdToTier(priceId) {
  if (!priceId) {
    return 'starter';
  }
  return PADDLE_PRICE_IDS[priceId] || 'starter';
}

/**
 * Get product ID for a tier and payment source
 * @param {string} tier - Tier name
 * @param {string} source - Payment source ('apple' or 'paddle')
 * @returns {string|null} Product/Price ID for the specified tier and source
 */
function getProductIdForTier(tier, source) {
  const normalizedTier = (tier || 'starter').toLowerCase();

  if (source === 'apple') {
    // Find Apple product ID by tier
    for (const [productId, tierName] of Object.entries(APPLE_PRODUCT_IDS)) {
      if (tierName === normalizedTier) {
        return productId;
      }
    }
  } else if (source === 'paddle') {
    // Find Paddle price ID by tier
    for (const [priceId, tierName] of Object.entries(PADDLE_PRICE_IDS)) {
      if (tierName === normalizedTier) {
        return priceId;
      }
    }
  }

  return null;
}

module.exports = {
  TIER_LIMITS,
  APPLE_PRODUCT_IDS,
  PADDLE_PRICE_IDS,
  getTierLimits,
  isUnlimited,
  hasFeature,
  getSuggestedUpgrade,
  getAllTiers,
  mapAppleProductIdToTier,
  mapPaddlePriceIdToTier,
  getProductIdForTier
};
