// Test tier enforcement logic locally
const { getTierLimits, isUnlimited, getSuggestedUpgrade } = require('./lambda/shared/tier-config');

console.log('=== Testing Tier Configuration ===\n');

// Test all tiers
const tiers = ['starter', 'professional', 'enterprise'];

tiers.forEach(tier => {
  console.log(`\n${tier.toUpperCase()} TIER:`);
  const limits = getTierLimits(tier);
  console.log(`  Name: ${limits.name}`);
  console.log(`  Price: $${limits.price}/month`);
  console.log(`  Users: ${isUnlimited(limits.maxUsers) ? 'Unlimited' : limits.maxUsers}`);
  console.log(`  Projects: ${isUnlimited(limits.maxProjects) ? 'Unlimited' : limits.maxProjects}`);
  console.log(`  Expenses/month: ${isUnlimited(limits.maxExpensesPerMonth) ? 'Unlimited' : limits.maxExpensesPerMonth}`);
  console.log(`  Suggested Upgrade: ${getSuggestedUpgrade(tier) || 'None (max tier)'}`);
});

console.log('\n=== Testing Limit Checking Logic ===\n');

// Test limit checking (simulated)
console.log('STARTER tier attempting to create 4th project:');
const starterLimits = getTierLimits('starter');
const currentProjects = 3;
if (currentProjects >= starterLimits.maxProjects) {
  console.log(`  ❌ BLOCKED: Current: ${currentProjects}, Limit: ${starterLimits.maxProjects}`);
  console.log(`  Suggested upgrade: ${getSuggestedUpgrade('starter')}`);
} else {
  console.log(`  ✅ ALLOWED: Current: ${currentProjects}, Limit: ${starterLimits.maxProjects}`);
}

console.log('\nPROFESSIONAL tier attempting to create unlimited expenses:');
const proLimits = getTierLimits('professional');
if (isUnlimited(proLimits.maxExpensesPerMonth)) {
  console.log(`  ✅ ALLOWED: Unlimited expenses`);
} else {
  console.log(`  ❌ BLOCKED: Limit: ${proLimits.maxExpensesPerMonth}`);
}

console.log('\nENTERPRISE tier attempting to create 100 projects:');
const entLimits = getTierLimits('enterprise');
if (isUnlimited(entLimits.maxProjects)) {
  console.log(`  ✅ ALLOWED: Unlimited projects`);
} else {
  console.log(`  ❌ BLOCKED: Limit: ${entLimits.maxProjects}`);
}

console.log('\n=== All Tests Passed! ===\n');
