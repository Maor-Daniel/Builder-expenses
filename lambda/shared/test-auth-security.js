/**
 * Security Test Suite for Authentication Bypass Vulnerability Fix
 *
 * Tests all authentication paths to ensure:
 * 1. Test mode is BLOCKED in production environments
 * 2. Test mode WORKS in development environments
 * 3. Clerk authentication works correctly
 * 4. Cognito authentication works correctly
 * 5. Proper error messages and security logging
 */

const { getCompanyUserFromEvent } = require('./company-utils');

// Test utilities
function createMockEvent(overrides = {}) {
  return {
    httpMethod: 'GET',
    headers: {},
    requestContext: {},
    ...overrides
  };
}

function runTest(testName, testFn) {
  try {
    testFn();
    console.log(`✅ PASSED: ${testName}`);
    return true;
  } catch (error) {
    console.error(`❌ FAILED: ${testName}`);
    console.error(`   Error: ${error.message}`);
    return false;
  }
}

async function runAsyncTest(testName, testFn) {
  try {
    await testFn();
    console.log(`✅ PASSED: ${testName}`);
    return true;
  } catch (error) {
    console.error(`❌ FAILED: ${testName}`);
    console.error(`   Error: ${error.message}`);
    return false;
  }
}

// Store original environment
const originalEnv = { ...process.env };

function setEnvironment(env) {
  // Reset to original
  Object.keys(process.env).forEach(key => {
    if (!(key in originalEnv)) {
      delete process.env[key];
    }
  });
  Object.assign(process.env, originalEnv);

  // Apply new environment
  Object.assign(process.env, env);
}

// Main test execution
async function runAllTests() {
  console.log('='.repeat(80));
  console.log('AUTHENTICATION SECURITY TEST SUITE');
  console.log('='.repeat(80));
  console.log('');

  let passedTests = 0;
  let totalTests = 0;

// =============================================================================
// TEST SUITE 1: Production Environment - Test Mode MUST BE BLOCKED
// =============================================================================
console.log('TEST SUITE 1: Production Environment Security');
console.log('-'.repeat(80));

totalTests++;
const test1 = await runAsyncTest(
  'Production (NODE_ENV=production) blocks test mode',
  async () => {
    setEnvironment({
      NODE_ENV: 'production',
      CLERK_AUTH_ENABLED: 'false',
      COGNITO_AUTH_ENABLED: 'false'
    });

    const mockEvent = createMockEvent();

    try {
      const result = getCompanyUserFromEvent(mockEvent);
      throw new Error('Should have thrown authentication error');
    } catch (error) {
      if (!error.message.includes('Authentication is required in production')) {
        throw new Error(`Wrong error message: ${error.message}`);
      }
      // Expected error
    }
  }
);
if (test1) passedTests++;

totalTests++;
const test2 = await runAsyncTest(
  'Production (ENVIRONMENT=production) blocks test mode',
  async () => {
    setEnvironment({
      ENVIRONMENT: 'production',
      CLERK_AUTH_ENABLED: 'false',
      COGNITO_AUTH_ENABLED: 'false'
    });

    const mockEvent = createMockEvent();

    try {
      const result = getCompanyUserFromEvent(mockEvent);
      throw new Error('Should have thrown authentication error');
    } catch (error) {
      if (!error.message.includes('Authentication is required in production')) {
        throw new Error(`Wrong error message: ${error.message}`);
      }
      // Expected error
    }
  }
);
if (test2) passedTests++;

totalTests++;
const test3 = await runAsyncTest(
  'Production (AWS_REGION=us-east-1) blocks test mode',
  async () => {
    setEnvironment({
      AWS_REGION: 'us-east-1',
      NODE_ENV: 'test', // Even with NODE_ENV=test, us-east-1 should be production
      CLERK_AUTH_ENABLED: 'false',
      COGNITO_AUTH_ENABLED: 'false'
    });

    const mockEvent = createMockEvent();

    try {
      const result = getCompanyUserFromEvent(mockEvent);
      throw new Error('Should have thrown authentication error');
    } catch (error) {
      if (!error.message.includes('Authentication is required in production')) {
        throw new Error(`Wrong error message: ${error.message}`);
      }
      // Expected error
    }
  }
);
if (test3) passedTests++;

console.log('');

// =============================================================================
// TEST SUITE 2: Development Environment - Test Mode SHOULD WORK
// =============================================================================
console.log('TEST SUITE 2: Development Environment Test Mode');
console.log('-'.repeat(80));

totalTests++;
const test4 = await runAsyncTest(
  'Development (NODE_ENV=development) allows test mode',
  async () => {
    setEnvironment({
      NODE_ENV: 'development',
      CLERK_AUTH_ENABLED: 'false',
      COGNITO_AUTH_ENABLED: 'false'
    });

    const mockEvent = createMockEvent();
    const result = getCompanyUserFromEvent(mockEvent);

    if (result.companyId !== 'test-company-123') {
      throw new Error(`Expected test-company-123, got ${result.companyId}`);
    }
    if (result.userId !== 'test-user-123') {
      throw new Error(`Expected test-user-123, got ${result.userId}`);
    }
    if (result.userRole !== 'admin') {
      throw new Error(`Expected admin role, got ${result.userRole}`);
    }
  }
);
if (test4) passedTests++;

totalTests++;
const test5 = await runAsyncTest(
  'Local development (IS_LOCAL_DEVELOPMENT=true) allows test mode',
  async () => {
    setEnvironment({
      IS_LOCAL_DEVELOPMENT: 'true',
      AWS_REGION: 'us-east-1', // Even with production region
      CLERK_AUTH_ENABLED: 'false',
      COGNITO_AUTH_ENABLED: 'false'
    });

    const mockEvent = createMockEvent();
    const result = getCompanyUserFromEvent(mockEvent);

    if (result.companyId !== 'test-company-123') {
      throw new Error(`Expected test-company-123, got ${result.companyId}`);
    }
  }
);
if (test5) passedTests++;

totalTests++;
const test6 = await runAsyncTest(
  'Test environment (NODE_ENV=test) allows test mode',
  async () => {
    setEnvironment({
      NODE_ENV: 'test',
      CLERK_AUTH_ENABLED: 'false',
      COGNITO_AUTH_ENABLED: 'false'
    });

    const mockEvent = createMockEvent();
    const result = getCompanyUserFromEvent(mockEvent);

    if (result.companyId !== 'test-company-123') {
      throw new Error(`Expected test-company-123, got ${result.companyId}`);
    }
  }
);
if (test6) passedTests++;

console.log('');

// =============================================================================
// TEST SUITE 3: Clerk Authentication
// =============================================================================
console.log('TEST SUITE 3: Clerk Authentication');
console.log('-'.repeat(80));

totalTests++;
const test7 = await runAsyncTest(
  'Clerk authentication works with valid authorizer context',
  async () => {
    setEnvironment({
      NODE_ENV: 'production',
      CLERK_AUTH_ENABLED: 'true',
      COGNITO_AUTH_ENABLED: 'false'
    });

    const mockEvent = createMockEvent({
      requestContext: {
        authorizer: {
          companyId: 'comp_real_123',
          userId: 'user_clerk_456',
          userEmail: 'user@company.com',
          userRole: 'manager'
        }
      }
    });

    const result = getCompanyUserFromEvent(mockEvent);

    if (result.companyId !== 'comp_real_123') {
      throw new Error(`Expected comp_real_123, got ${result.companyId}`);
    }
    if (result.userId !== 'user_clerk_456') {
      throw new Error(`Expected user_clerk_456, got ${result.userId}`);
    }
    if (result.userRole !== 'manager') {
      throw new Error(`Expected manager role, got ${result.userRole}`);
    }
  }
);
if (test7) passedTests++;

totalTests++;
const test8 = await runAsyncTest(
  'Clerk authentication fails with missing companyId',
  async () => {
    setEnvironment({
      NODE_ENV: 'production',
      CLERK_AUTH_ENABLED: 'true',
      COGNITO_AUTH_ENABLED: 'false'
    });

    const mockEvent = createMockEvent({
      requestContext: {
        authorizer: {
          userId: 'user_clerk_456',
          userEmail: 'user@company.com'
        }
      }
    });

    try {
      const result = getCompanyUserFromEvent(mockEvent);
      throw new Error('Should have thrown authentication error');
    } catch (error) {
      if (!error.message.includes('missing company or user information')) {
        throw new Error(`Wrong error message: ${error.message}`);
      }
    }
  }
);
if (test8) passedTests++;

totalTests++;
const test9 = await runAsyncTest(
  'Clerk authentication fails with no authorizer context',
  async () => {
    setEnvironment({
      NODE_ENV: 'production',
      CLERK_AUTH_ENABLED: 'true',
      COGNITO_AUTH_ENABLED: 'false'
    });

    const mockEvent = createMockEvent();

    try {
      const result = getCompanyUserFromEvent(mockEvent);
      throw new Error('Should have thrown authentication error');
    } catch (error) {
      if (!error.message.includes('no authorizer context found')) {
        throw new Error(`Wrong error message: ${error.message}`);
      }
    }
  }
);
if (test9) passedTests++;

console.log('');

// =============================================================================
// TEST SUITE 4: Cognito Authentication
// =============================================================================
console.log('TEST SUITE 4: Cognito Authentication');
console.log('-'.repeat(80));

totalTests++;
const test10 = await runAsyncTest(
  'Cognito authentication works with authorizer claims',
  async () => {
    setEnvironment({
      NODE_ENV: 'production',
      CLERK_AUTH_ENABLED: 'false',
      COGNITO_AUTH_ENABLED: 'true'
    });

    const mockEvent = createMockEvent({
      requestContext: {
        authorizer: {
          claims: {
            sub: 'user_cognito_789',
            email: 'cognito@company.com',
            'custom:companyId': 'comp_cognito_456',
            'custom:role': 'editor'
          }
        }
      }
    });

    const result = getCompanyUserFromEvent(mockEvent);

    if (result.companyId !== 'comp_cognito_456') {
      throw new Error(`Expected comp_cognito_456, got ${result.companyId}`);
    }
    if (result.userId !== 'user_cognito_789') {
      throw new Error(`Expected user_cognito_789, got ${result.userId}`);
    }
    if (result.userRole !== 'editor') {
      throw new Error(`Expected editor role, got ${result.userRole}`);
    }
  }
);
if (test10) passedTests++;

totalTests++;
const test11 = await runAsyncTest(
  'Cognito authentication fails with missing companyId',
  async () => {
    setEnvironment({
      NODE_ENV: 'production',
      CLERK_AUTH_ENABLED: 'false',
      COGNITO_AUTH_ENABLED: 'true'
    });

    const mockEvent = createMockEvent({
      requestContext: {
        authorizer: {
          claims: {
            sub: 'user_cognito_789',
            email: 'cognito@company.com'
          }
        }
      }
    });

    try {
      const result = getCompanyUserFromEvent(mockEvent);
      throw new Error('Should have thrown authentication error');
    } catch (error) {
      if (!error.message.includes('missing company or user information')) {
        throw new Error(`Wrong error message: ${error.message}`);
      }
    }
  }
);
if (test11) passedTests++;

console.log('');

// =============================================================================
// TEST SUITE 5: Authentication Priority (Clerk over Cognito)
// =============================================================================
console.log('TEST SUITE 5: Authentication Priority');
console.log('-'.repeat(80));

totalTests++;
const test12 = await runAsyncTest(
  'Clerk takes priority when both are enabled',
  async () => {
    setEnvironment({
      NODE_ENV: 'production',
      CLERK_AUTH_ENABLED: 'true',
      COGNITO_AUTH_ENABLED: 'true'
    });

    const mockEvent = createMockEvent({
      requestContext: {
        authorizer: {
          // Clerk-style authorizer
          companyId: 'comp_clerk_priority',
          userId: 'user_clerk_priority',
          userEmail: 'clerk@company.com',
          userRole: 'admin',
          // Also has Cognito claims (should be ignored)
          claims: {
            sub: 'should_be_ignored',
            'custom:companyId': 'should_be_ignored'
          }
        }
      }
    });

    const result = getCompanyUserFromEvent(mockEvent);

    // Should use Clerk data, not Cognito
    if (result.companyId !== 'comp_clerk_priority') {
      throw new Error(`Expected Clerk companyId, got ${result.companyId}`);
    }
    if (result.userId !== 'user_clerk_priority') {
      throw new Error(`Expected Clerk userId, got ${result.userId}`);
    }
  }
);
if (test12) passedTests++;

console.log('');

// =============================================================================
// RESULTS SUMMARY
// =============================================================================
console.log('='.repeat(80));
console.log('TEST RESULTS SUMMARY');
console.log('='.repeat(80));
console.log(`Total Tests: ${totalTests}`);
console.log(`Passed: ${passedTests}`);
console.log(`Failed: ${totalTests - passedTests}`);
console.log('');

if (passedTests === totalTests) {
  console.log('✅ ALL TESTS PASSED - Security fix is working correctly!');
  console.log('');
  console.log('Security Validations:');
  console.log('  ✓ Test mode BLOCKED in production environments');
  console.log('  ✓ Test mode ALLOWED in development environments');
  console.log('  ✓ Clerk authentication working correctly');
  console.log('  ✓ Cognito authentication working correctly');
  console.log('  ✓ Proper authentication priority (Clerk > Cognito)');
  console.log('  ✓ Comprehensive error handling');
  process.exit(0);
} else {
  console.log('❌ SOME TESTS FAILED - Review security implementation');
  process.exit(1);
}

  // Restore original environment
  setEnvironment(originalEnv);
}

// Run tests
runAllTests().catch(error => {
  console.error('Test execution failed:', error);
  process.exit(1);
});
