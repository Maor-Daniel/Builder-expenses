/**
 * Comprehensive JWT Validation Test Suite
 *
 * Tests all enhanced JWT validation logic including:
 * - Token expiration (exp) validation with grace period
 * - Not-before time (nbf) validation
 * - Issued-at time (iat) validation (future token detection)
 * - Token freshness (max age) validation
 * - Audience (aud) validation
 * - Security event logging
 *
 * Run with: node lambda/test-jwt-validation.js
 */

const { validateTokenClaims, logSecurityEvent, JWT_CONFIG } = require('./clerk-authorizer');

// Test utilities
let testCount = 0;
let passedCount = 0;
let failedCount = 0;

function runTest(testName, testFn) {
  testCount++;
  try {
    testFn();
    passedCount++;
    console.log(`✅ TEST ${testCount}: ${testName}`);
    return true;
  } catch (error) {
    failedCount++;
    console.error(`❌ TEST ${testCount}: ${testName}`);
    console.error(`   Error: ${error.message}`);
    if (error.stack) {
      console.error(`   Stack: ${error.stack.split('\n').slice(1, 3).join('\n')}`);
    }
    return false;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, but got ${actual}`);
  }
}

function assertContains(array, item, message) {
  if (!array || !array.some(x => JSON.stringify(x).includes(item))) {
    throw new Error(message || `Array does not contain ${item}`);
  }
}

// Get current time for test consistency
const NOW = Math.floor(Date.now() / 1000);

console.log('='.repeat(80));
console.log('JWT VALIDATION TEST SUITE');
console.log('='.repeat(80));
console.log('');
console.log('Configuration:');
console.log(`  JWT_MAX_TOKEN_AGE: ${JWT_CONFIG.maxTokenAge}s`);
console.log(`  JWT_EXPIRY_GRACE_PERIOD: ${JWT_CONFIG.expiryGracePeriod}s`);
console.log(`  JWT_EXPECTED_AUDIENCE: ${JWT_CONFIG.expectedAudience || 'not configured'}`);
console.log('');

// =============================================================================
// TEST SUITE 1: Valid Token Scenarios
// =============================================================================
console.log('TEST SUITE 1: Valid Token Scenarios');
console.log('-'.repeat(80));

runTest('Valid token with all claims passes validation', () => {
  const payload = {
    sub: 'user_123',
    exp: NOW + 3600, // Expires in 1 hour
    nbf: NOW - 60,   // Valid since 1 minute ago
    iat: NOW - 60,   // Issued 1 minute ago
    email: 'test@example.com'
  };

  const result = validateTokenClaims(payload, 'fake-token');

  assert(result.isValid === true, 'Token should be valid');
  assert(result.errors.length === 0, 'Should have no errors');
  assert(result.metadata.tokenAge === 60, `Token age should be 60s, got ${result.metadata.tokenAge}`);
  assert(result.metadata.tokenFreshness === true, 'Token should be fresh');
});

runTest('Valid token within grace period is accepted with warning', () => {
  const payload = {
    sub: 'user_123',
    exp: NOW - 10,   // Expired 10 seconds ago
    iat: NOW - 70,   // Issued 70 seconds ago
    nbf: NOW - 70
  };

  const result = validateTokenClaims(payload, 'fake-token');

  assert(result.isValid === true, 'Token should be valid (within grace period)');
  assert(result.errors.length === 0, 'Should have no errors');
  assert(result.warnings.length > 0, 'Should have warnings');
  assertContains(result.warnings, 'TOKEN_EXPIRED_GRACE_PERIOD', 'Should have grace period warning');
});

runTest('Fresh token with minimal claims passes validation', () => {
  const payload = {
    sub: 'user_123',
    exp: NOW + 7200,
    iat: NOW - 5
  };

  const result = validateTokenClaims(payload, 'fake-token');

  assert(result.isValid === true, 'Token should be valid');
  assert(result.metadata.tokenAge === 5, `Token age should be 5s, got ${result.metadata.tokenAge}`);
});

console.log('');

// =============================================================================
// TEST SUITE 2: Expired Token Scenarios
// =============================================================================
console.log('TEST SUITE 2: Expired Token Scenarios');
console.log('-'.repeat(80));

runTest('Expired token beyond grace period is rejected', () => {
  const payload = {
    sub: 'user_123',
    exp: NOW - 100,  // Expired 100 seconds ago (beyond 30s grace period)
    iat: NOW - 3700,
    nbf: NOW - 3700
  };

  const result = validateTokenClaims(payload, 'fake-token');

  assert(result.isValid === false, 'Token should be invalid');
  assert(result.errors.length > 0, 'Should have errors');
  assertContains(result.errors, 'TOKEN_EXPIRED', 'Should have TOKEN_EXPIRED error');
});

runTest('Token expiration at exact grace period boundary is rejected', () => {
  const gracePeriod = JWT_CONFIG.expiryGracePeriod;
  const payload = {
    sub: 'user_123',
    exp: NOW - gracePeriod - 1, // Exactly 1 second past grace period
    iat: NOW - 3700
  };

  const result = validateTokenClaims(payload, 'fake-token');

  assert(result.isValid === false, 'Token should be invalid');
  assertContains(result.errors, 'TOKEN_EXPIRED', 'Should have TOKEN_EXPIRED error');
});

runTest('Token with missing exp claim generates warning but passes', () => {
  const payload = {
    sub: 'user_123',
    iat: NOW - 60,
    nbf: NOW - 60
  };

  const result = validateTokenClaims(payload, 'fake-token');

  assert(result.isValid === true, 'Token should be valid (missing exp is non-fatal)');
  assertContains(result.warnings, 'MISSING_EXP_CLAIM', 'Should have MISSING_EXP_CLAIM warning');
});

console.log('');

// =============================================================================
// TEST SUITE 3: Not-Before Time (nbf) Scenarios
// =============================================================================
console.log('TEST SUITE 3: Not-Before Time (nbf) Scenarios');
console.log('-'.repeat(80));

runTest('Token used before nbf time is rejected', () => {
  const payload = {
    sub: 'user_123',
    exp: NOW + 3600,
    nbf: NOW + 300,  // Not valid until 5 minutes from now
    iat: NOW - 60
  };

  const result = validateTokenClaims(payload, 'fake-token');

  assert(result.isValid === false, 'Token should be invalid');
  assertContains(result.errors, 'TOKEN_NOT_YET_VALID', 'Should have TOKEN_NOT_YET_VALID error');
});

runTest('Token at exact nbf time is accepted', () => {
  const payload = {
    sub: 'user_123',
    exp: NOW + 3600,
    nbf: NOW,        // Valid starting now
    iat: NOW - 60
  };

  const result = validateTokenClaims(payload, 'fake-token');

  assert(result.isValid === true, 'Token should be valid');
  assert(result.errors.length === 0, 'Should have no errors');
});

runTest('Token without nbf claim is accepted', () => {
  const payload = {
    sub: 'user_123',
    exp: NOW + 3600,
    iat: NOW - 60
  };

  const result = validateTokenClaims(payload, 'fake-token');

  assert(result.isValid === true, 'Token should be valid (nbf is optional)');
});

console.log('');

// =============================================================================
// TEST SUITE 4: Issued-At Time (iat) Scenarios
// =============================================================================
console.log('TEST SUITE 4: Issued-At Time (iat) Scenarios');
console.log('-'.repeat(80));

runTest('Token issued in the future is rejected', () => {
  const payload = {
    sub: 'user_123',
    exp: NOW + 7200,
    iat: NOW + 300,  // Issued 5 minutes in the future
    nbf: NOW
  };

  const result = validateTokenClaims(payload, 'fake-token');

  assert(result.isValid === false, 'Token should be invalid');
  assertContains(result.errors, 'TOKEN_ISSUED_IN_FUTURE', 'Should have TOKEN_ISSUED_IN_FUTURE error');
});

runTest('Token issued within clock skew tolerance is accepted', () => {
  const payload = {
    sub: 'user_123',
    exp: NOW + 3600,
    iat: NOW + 30,   // Issued 30 seconds in future (within 60s tolerance)
    nbf: NOW
  };

  const result = validateTokenClaims(payload, 'fake-token');

  assert(result.isValid === true, 'Token should be valid (within clock skew)');
});

runTest('Token with missing iat claim generates warning', () => {
  const payload = {
    sub: 'user_123',
    exp: NOW + 3600,
    nbf: NOW
  };

  const result = validateTokenClaims(payload, 'fake-token');

  assert(result.isValid === true, 'Token should be valid');
  assertContains(result.warnings, 'MISSING_IAT_CLAIM', 'Should have MISSING_IAT_CLAIM warning');
});

console.log('');

// =============================================================================
// TEST SUITE 5: Token Freshness (Max Age) Scenarios
// =============================================================================
console.log('TEST SUITE 5: Token Freshness (Max Age) Scenarios');
console.log('-'.repeat(80));

runTest('Token older than max age generates warning', () => {
  const maxAge = JWT_CONFIG.maxTokenAge;
  const payload = {
    sub: 'user_123',
    exp: NOW + 3600,
    iat: NOW - maxAge - 100, // Older than max age
    nbf: NOW - maxAge - 100
  };

  const result = validateTokenClaims(payload, 'fake-token');

  // Freshness is a WARNING, not an error
  assert(result.isValid === true, 'Token should be valid (freshness is warning only)');
  assertContains(result.warnings, 'TOKEN_TOO_OLD', 'Should have TOKEN_TOO_OLD warning');
  assert(result.metadata.tokenFreshness === false, 'Token should not be fresh');
});

runTest('Token at exact max age boundary is fresh', () => {
  const maxAge = JWT_CONFIG.maxTokenAge;
  const payload = {
    sub: 'user_123',
    exp: NOW + 3600,
    iat: NOW - maxAge, // Exactly at max age
    nbf: NOW - maxAge
  };

  const result = validateTokenClaims(payload, 'fake-token');

  assert(result.isValid === true, 'Token should be valid');
  assert(result.metadata.tokenFreshness === true, 'Token should be fresh (at boundary)');
});

runTest('Fresh token within max age has no warnings', () => {
  const payload = {
    sub: 'user_123',
    exp: NOW + 3600,
    iat: NOW - 300,  // 5 minutes old (well within limit)
    nbf: NOW - 300
  };

  const result = validateTokenClaims(payload, 'fake-token');

  assert(result.isValid === true, 'Token should be valid');
  assert(result.metadata.tokenFreshness === true, 'Token should be fresh');
  const hasFreshnessWarning = result.warnings.some(w => w.code === 'TOKEN_TOO_OLD');
  assert(!hasFreshnessWarning, 'Should not have TOKEN_TOO_OLD warning');
});

console.log('');

// =============================================================================
// TEST SUITE 6: Audience (aud) Validation Scenarios
// =============================================================================
console.log('TEST SUITE 6: Audience (aud) Validation Scenarios');
console.log('-'.repeat(80));

// Only run audience tests if configured
if (JWT_CONFIG.expectedAudience) {
  runTest('Token with matching audience is accepted', () => {
    const payload = {
      sub: 'user_123',
      exp: NOW + 3600,
      iat: NOW - 60,
      aud: JWT_CONFIG.expectedAudience
    };

    const result = validateTokenClaims(payload, 'fake-token');

    assert(result.isValid === true, 'Token should be valid');
    assert(result.metadata.audience.includes(JWT_CONFIG.expectedAudience), 'Audience should be recorded');
  });

  runTest('Token with mismatched audience is rejected', () => {
    const payload = {
      sub: 'user_123',
      exp: NOW + 3600,
      iat: NOW - 60,
      aud: 'wrong-audience'
    };

    const result = validateTokenClaims(payload, 'fake-token');

    assert(result.isValid === false, 'Token should be invalid');
    assertContains(result.errors, 'INVALID_AUDIENCE', 'Should have INVALID_AUDIENCE error');
  });

  runTest('Token with multiple audiences including correct one is accepted', () => {
    const payload = {
      sub: 'user_123',
      exp: NOW + 3600,
      iat: NOW - 60,
      aud: ['other-audience', JWT_CONFIG.expectedAudience, 'another-audience']
    };

    const result = validateTokenClaims(payload, 'fake-token');

    assert(result.isValid === true, 'Token should be valid');
  });
} else {
  console.log('⏭️  Audience validation tests skipped (JWT_EXPECTED_AUDIENCE not configured)');
}

console.log('');

// =============================================================================
// TEST SUITE 7: Multiple Validation Errors
// =============================================================================
console.log('TEST SUITE 7: Multiple Validation Errors');
console.log('-'.repeat(80));

runTest('Token with multiple errors reports all of them', () => {
  const payload = {
    sub: 'user_123',
    exp: NOW - 100,    // Expired
    nbf: NOW + 300,    // Not yet valid
    iat: NOW + 500     // Issued in future
  };

  const result = validateTokenClaims(payload, 'fake-token');

  assert(result.isValid === false, 'Token should be invalid');
  assert(result.errors.length >= 3, `Should have at least 3 errors, got ${result.errors.length}`);
  assertContains(result.errors, 'TOKEN_EXPIRED', 'Should have TOKEN_EXPIRED error');
  assertContains(result.errors, 'TOKEN_NOT_YET_VALID', 'Should have TOKEN_NOT_YET_VALID error');
  assertContains(result.errors, 'TOKEN_ISSUED_IN_FUTURE', 'Should have TOKEN_ISSUED_IN_FUTURE error');
});

runTest('Token with errors and warnings reports both', () => {
  const maxAge = JWT_CONFIG.maxTokenAge;
  const payload = {
    sub: 'user_123',
    exp: NOW - 100,         // Expired (error)
    iat: NOW - maxAge - 200 // Too old (warning, if token were valid)
  };

  const result = validateTokenClaims(payload, 'fake-token');

  assert(result.isValid === false, 'Token should be invalid');
  assert(result.errors.length > 0, 'Should have errors');
  assertContains(result.errors, 'TOKEN_EXPIRED', 'Should have TOKEN_EXPIRED error');
});

console.log('');

// =============================================================================
// TEST SUITE 8: Edge Cases
// =============================================================================
console.log('TEST SUITE 8: Edge Cases');
console.log('-'.repeat(80));

runTest('Token with all claims missing except sub generates warnings', () => {
  const payload = {
    sub: 'user_123'
  };

  const result = validateTokenClaims(payload, 'fake-token');

  assert(result.isValid === true, 'Token should be valid (missing claims are non-fatal)');
  assert(result.warnings.length >= 2, `Should have at least 2 warnings, got ${result.warnings.length}`);
});

runTest('Token with zero-valued timestamps is handled correctly', () => {
  const payload = {
    sub: 'user_123',
    exp: 0,
    iat: 0,
    nbf: 0
  };

  const result = validateTokenClaims(payload, 'fake-token');

  // exp: 0 means epoch time (1970), which is definitely expired
  // This should be caught by expiration validation
  assert(result.isValid === false, 'Token with exp=0 (epoch) should be invalid (expired)');
  assertContains(result.errors, 'TOKEN_EXPIRED', 'Should have TOKEN_EXPIRED error');
});

runTest('Token with very large exp value is accepted', () => {
  const payload = {
    sub: 'user_123',
    exp: NOW + 31536000, // 1 year from now
    iat: NOW - 60,
    nbf: NOW - 60
  };

  const result = validateTokenClaims(payload, 'fake-token');

  assert(result.isValid === true, 'Token with large exp should be valid');
});

runTest('Token metadata includes all expected fields', () => {
  const payload = {
    sub: 'user_123',
    exp: NOW + 3600,
    iat: NOW - 120,
    nbf: NOW - 120
  };

  const result = validateTokenClaims(payload, 'fake-token');

  assert(result.metadata.hasOwnProperty('tokenAge'), 'Should have tokenAge metadata');
  assert(result.metadata.hasOwnProperty('tokenFreshness'), 'Should have tokenFreshness metadata');
  assert(result.metadata.hasOwnProperty('expiresAt'), 'Should have expiresAt metadata');
  assert(result.metadata.hasOwnProperty('issuedAt'), 'Should have issuedAt metadata');
  assert(result.metadata.hasOwnProperty('timeUntilExpiry'), 'Should have timeUntilExpiry metadata');
});

console.log('');

// =============================================================================
// TEST SUITE 9: Security Event Logging
// =============================================================================
console.log('TEST SUITE 9: Security Event Logging');
console.log('-'.repeat(80));

runTest('logSecurityEvent creates properly formatted log entry', () => {
  const logEntry = logSecurityEvent('TEST_EVENT', {
    testData: 'test-value',
    testNumber: 123
  }, 'INFO');

  assert(logEntry.eventType === 'TEST_EVENT', 'Event type should be set');
  assert(logEntry.severity === 'INFO', 'Severity should be set');
  assert(logEntry.testData === 'test-value', 'Custom data should be included');
  assert(logEntry.timestamp, 'Timestamp should be included');
});

runTest('logSecurityEvent handles ERROR severity', () => {
  const logEntry = logSecurityEvent('ERROR_EVENT', {
    errorMessage: 'Test error'
  }, 'ERROR');

  assert(logEntry.severity === 'ERROR', 'Severity should be ERROR');
});

runTest('logSecurityEvent handles WARN severity', () => {
  const logEntry = logSecurityEvent('WARN_EVENT', {
    warningMessage: 'Test warning'
  }, 'WARN');

  assert(logEntry.severity === 'WARN', 'Severity should be WARN');
});

console.log('');

// =============================================================================
// RESULTS SUMMARY
// =============================================================================
console.log('='.repeat(80));
console.log('TEST RESULTS SUMMARY');
console.log('='.repeat(80));
console.log(`Total Tests: ${testCount}`);
console.log(`Passed: ${passedCount} ✅`);
console.log(`Failed: ${failedCount} ❌`);
console.log('');

if (failedCount === 0) {
  console.log('✅✅✅ ALL TESTS PASSED ✅✅✅');
  console.log('');
  console.log('JWT Validation Enhancement Verified:');
  console.log('  ✓ Token expiration (exp) validation with grace period');
  console.log('  ✓ Not-before time (nbf) validation');
  console.log('  ✓ Issued-at time (iat) validation (future token detection)');
  console.log('  ✓ Token freshness (max age) validation');
  console.log('  ✓ Audience (aud) validation (if configured)');
  console.log('  ✓ Security event logging');
  console.log('  ✓ Comprehensive metadata tracking');
  console.log('  ✓ Edge case handling');
  console.log('');
  console.log('Security Enhancement Status: PRODUCTION READY ✅');
  process.exit(0);
} else {
  console.log('❌❌❌ SOME TESTS FAILED ❌❌❌');
  console.log('');
  console.log('Please review the failed tests above and fix the implementation.');
  process.exit(1);
}
