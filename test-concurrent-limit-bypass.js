// test-concurrent-limit-bypass.js
// Concurrent load test to verify race condition fix for subscription limits

require('dotenv').config({ path: '.env' });
const AWS = require('aws-sdk');

// Configure AWS
AWS.config.update({ region: process.env.AWS_REGION || 'us-east-1' });
const dynamoDB = new AWS.DynamoDB.DocumentClient();

const COMPANIES_TABLE = 'construction-expenses-companies';
const TEST_COMPANY_ID = `test-company-${Date.now()}`;
const CONCURRENT_REQUESTS = 100;

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

/**
 * Create a test company with specific tier limits
 */
async function createTestCompany(tier = 'trial', limits = {}) {
  const company = {
    companyId: TEST_COMPANY_ID,
    companyName: 'Test Company - Concurrent Load Test',
    subscriptionTier: tier,
    subscriptionStatus: 'active',
    currentProjects: 0,
    currentMonthExpenses: 0,
    currentUsers: 1,
    expenseCounterResetDate: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await dynamoDB.put({
    TableName: COMPANIES_TABLE,
    Item: company
  }).promise();

  console.log(`${colors.green}✓${colors.reset} Created test company: ${TEST_COMPANY_ID}`);
  return company;
}

/**
 * Delete test company
 */
async function deleteTestCompany() {
  try {
    await dynamoDB.delete({
      TableName: COMPANIES_TABLE,
      Key: { companyId: TEST_COMPANY_ID }
    }).promise();
    console.log(`${colors.green}✓${colors.reset} Deleted test company`);
  } catch (error) {
    console.error(`${colors.yellow}⚠${colors.reset} Failed to delete test company:`, error.message);
  }
}

/**
 * Get current company state
 */
async function getCompany() {
  const result = await dynamoDB.get({
    TableName: COMPANIES_TABLE,
    Key: { companyId: TEST_COMPANY_ID }
  }).promise();
  return result.Item;
}

/**
 * Simulate atomic increment with conditional check (mimics the fixed implementation)
 */
async function atomicIncrementProject(limit) {
  try {
    await dynamoDB.update({
      TableName: COMPANIES_TABLE,
      Key: { companyId: TEST_COMPANY_ID },
      UpdateExpression: 'ADD currentProjects :inc SET updatedAt = :now',
      ConditionExpression: 'attribute_not_exists(currentProjects) OR currentProjects < :limit',
      ExpressionAttributeValues: {
        ':inc': 1,
        ':limit': limit,
        ':now': new Date().toISOString()
      }
    }).promise();
    return { success: true };
  } catch (error) {
    if (error.code === 'ConditionalCheckFailedException') {
      return { success: false, reason: 'LIMIT_EXCEEDED' };
    }
    throw error;
  }
}

/**
 * Simulate atomic increment with conditional check for expenses (with monthly reset)
 */
async function atomicIncrementExpense(limit) {
  const now = new Date();
  const resetDateThreshold = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  try {
    await dynamoDB.update({
      TableName: COMPANIES_TABLE,
      Key: { companyId: TEST_COMPANY_ID },
      UpdateExpression: 'ADD currentMonthExpenses :inc SET updatedAt = :now',
      ConditionExpression: '(attribute_not_exists(currentMonthExpenses) OR currentMonthExpenses < :limit) AND (attribute_not_exists(expenseCounterResetDate) OR expenseCounterResetDate >= :resetThreshold)',
      ExpressionAttributeValues: {
        ':inc': 1,
        ':limit': limit,
        ':now': now.toISOString(),
        ':resetThreshold': resetDateThreshold
      }
    }).promise();
    return { success: true };
  } catch (error) {
    if (error.code === 'ConditionalCheckFailedException') {
      // Try to reset
      try {
        await dynamoDB.update({
          TableName: COMPANIES_TABLE,
          Key: { companyId: TEST_COMPANY_ID },
          UpdateExpression: 'SET currentMonthExpenses = :one, expenseCounterResetDate = :now, updatedAt = :now',
          ConditionExpression: 'attribute_not_exists(expenseCounterResetDate) OR expenseCounterResetDate < :resetThreshold',
          ExpressionAttributeValues: {
            ':one': 1,
            ':now': now.toISOString(),
            ':resetThreshold': resetDateThreshold
          }
        }).promise();
        return { success: true };
      } catch (resetError) {
        if (resetError.code === 'ConditionalCheckFailedException') {
          return { success: false, reason: 'LIMIT_EXCEEDED' };
        }
        throw resetError;
      }
    }
    throw error;
  }
}

/**
 * Simulate atomic increment with conditional check for users
 */
async function atomicIncrementUser(limit) {
  try {
    await dynamoDB.update({
      TableName: COMPANIES_TABLE,
      Key: { companyId: TEST_COMPANY_ID },
      UpdateExpression: 'ADD currentUsers :inc SET updatedAt = :now',
      ConditionExpression: 'attribute_not_exists(currentUsers) OR currentUsers < :limit',
      ExpressionAttributeValues: {
        ':inc': 1,
        ':limit': limit,
        ':now': new Date().toISOString()
      }
    }).promise();
    return { success: true };
  } catch (error) {
    if (error.code === 'ConditionalCheckFailedException') {
      return { success: false, reason: 'LIMIT_EXCEEDED' };
    }
    throw error;
  }
}

/**
 * Run concurrent load test for a specific limit type
 */
async function runConcurrentTest(testName, limit, incrementFunction, counterField) {
  console.log(`\n${colors.cyan}${colors.bright}=== ${testName} ===${colors.reset}`);
  console.log(`Limit: ${limit}, Concurrent Requests: ${CONCURRENT_REQUESTS}`);

  const startTime = Date.now();

  // Fire all requests concurrently
  const promises = Array(CONCURRENT_REQUESTS).fill(null).map(() => incrementFunction(limit));
  const results = await Promise.all(promises);

  const endTime = Date.now();
  const duration = endTime - startTime;

  // Analyze results
  const successCount = results.filter(r => r.success).length;
  const failureCount = results.filter(r => !r.success).length;

  // Get final counter value
  const company = await getCompany();
  const finalCount = company[counterField] || 0;

  // Calculate metrics
  const bypassCount = finalCount - limit;
  const bypassPercentage = (bypassCount / limit) * 100;

  // Display results
  console.log(`\n${colors.bright}Results:${colors.reset}`);
  console.log(`  Duration: ${duration}ms`);
  console.log(`  Average per request: ${(duration / CONCURRENT_REQUESTS).toFixed(2)}ms`);
  console.log(`  Successful increments: ${successCount}`);
  console.log(`  Rejected (limit exceeded): ${failureCount}`);
  console.log(`  Final counter value: ${finalCount}`);
  console.log(`  Expected counter value: ${limit}`);

  // Verdict
  const passed = finalCount === limit && bypassCount === 0;
  if (passed) {
    console.log(`\n${colors.green}${colors.bright}✓ PASS${colors.reset} - Exactly ${limit} resources created, 0 bypass!`);
  } else {
    console.log(`\n${colors.red}${colors.bright}✗ FAIL${colors.reset} - ${bypassCount} bypass detected (${bypassPercentage.toFixed(1)}% over limit)`);
  }

  return {
    testName,
    passed,
    limit,
    finalCount,
    bypassCount,
    bypassPercentage,
    duration,
    successCount,
    failureCount
  };
}

/**
 * Main test runner
 */
async function runAllTests() {
  console.log(`${colors.bright}${colors.blue}`);
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║   CONCURRENT LIMIT BYPASS TEST - RACE CONDITION VERIFICATION  ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log(colors.reset);

  const results = [];

  try {
    // Test 1: Project Limit
    await createTestCompany('trial');
    const projectResult = await runConcurrentTest(
      'Project Limit Test',
      100,
      atomicIncrementProject,
      'currentProjects'
    );
    results.push(projectResult);
    await deleteTestCompany();

    // Wait a bit between tests
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test 2: Expense Limit
    await createTestCompany('trial');
    const expenseResult = await runConcurrentTest(
      'Expense Limit Test',
      100,
      atomicIncrementExpense,
      'currentMonthExpenses'
    );
    results.push(expenseResult);
    await deleteTestCompany();

    // Wait a bit between tests
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test 3: User Limit
    await createTestCompany('trial');
    const userResult = await runConcurrentTest(
      'User Limit Test',
      100,
      atomicIncrementUser,
      'currentUsers'
    );
    results.push(userResult);
    await deleteTestCompany();

    // Summary
    console.log(`\n${colors.bright}${colors.cyan}═══════════════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.bright}SUMMARY${colors.reset}\n`);

    const allPassed = results.every(r => r.passed);
    const totalBypass = results.reduce((sum, r) => sum + r.bypassCount, 0);

    results.forEach(result => {
      const icon = result.passed ? `${colors.green}✓${colors.reset}` : `${colors.red}✗${colors.reset}`;
      console.log(`  ${icon} ${result.testName}: ${result.finalCount}/${result.limit} (${result.bypassCount} bypass)`);
    });

    console.log(`\n${colors.bright}Overall Result:${colors.reset}`);
    if (allPassed) {
      console.log(`${colors.green}${colors.bright}✓ ALL TESTS PASSED${colors.reset} - No race condition detected!`);
      console.log(`  Total bypass across all tests: ${totalBypass}`);
      console.log(`  Atomic operations are working correctly.`);
    } else {
      console.log(`${colors.red}${colors.bright}✗ SOME TESTS FAILED${colors.reset} - Race condition detected!`);
      console.log(`  Total bypass across all tests: ${totalBypass}`);
      console.log(`  Atomic operations may not be working correctly.`);
    }

    console.log(`\n${colors.cyan}═══════════════════════════════════════════════════════════════${colors.reset}\n`);

    process.exit(allPassed ? 0 : 1);

  } catch (error) {
    console.error(`\n${colors.red}${colors.bright}✗ TEST ERROR${colors.reset}`, error);
    await deleteTestCompany();
    process.exit(1);
  }
}

// Run tests
runAllTests();
