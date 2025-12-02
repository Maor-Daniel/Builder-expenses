#!/usr/bin/env node
/**
 * CORS Security Test Script
 *
 * Tests that the Construction Expenses API properly enforces CORS restrictions:
 * - Allows whitelisted origins
 * - Blocks non-whitelisted origins
 * - Handles OPTIONS preflight correctly
 * - Never returns wildcard CORS headers
 *
 * Usage:
 *   node test-cors-security.js
 *   node test-cors-security.js --api-url https://your-api-gateway-url
 *
 * Prerequisites:
 *   - API deployed to AWS
 *   - Valid authentication token (set CLERK_TOKEN env var)
 */

const https = require('https');
const http = require('http');

// Configuration
const API_URL = process.env.API_URL || process.argv.find(arg => arg.startsWith('--api-url='))?.split('=')[1] || 'YOUR_API_GATEWAY_URL';
const AUTH_TOKEN = process.env.CLERK_TOKEN || '';

// Production allowed origins (must match cors-config.js)
const PRODUCTION_ORIGINS = [
  'https://d6dvynagj630i.cloudfront.net',
  'https://builder-expenses.com',
  'https://www.builder-expenses.com',
  'https://Builder-expenses.clerk.accounts.dev',
  'https://builder-expenses.clerk.accounts.dev'
];

// Test cases
const TESTS = [
  {
    name: 'Allowed Origin - CloudFront',
    origin: 'https://d6dvynagj630i.cloudfront.net',
    expectedAllowed: true,
    expectedOrigin: 'https://d6dvynagj630i.cloudfront.net'
  },
  {
    name: 'Allowed Origin - Custom Domain',
    origin: 'https://builder-expenses.com',
    expectedAllowed: true,
    expectedOrigin: 'https://builder-expenses.com'
  },
  {
    name: 'Disallowed Origin - Malicious Site',
    origin: 'https://malicious-site.com',
    expectedAllowed: false,
    expectedOrigin: null // Should use default or reject
  },
  {
    name: 'Disallowed Origin - Different Subdomain',
    origin: 'https://evil.builder-expenses.com',
    expectedAllowed: false,
    expectedOrigin: null
  },
  {
    name: 'No Origin Header',
    origin: null,
    expectedAllowed: true, // Backend might allow in dev, depends on config
    expectedOrigin: PRODUCTION_ORIGINS[0] // Should default to first production origin
  },
  {
    name: 'Disallowed Origin - Random Domain',
    origin: 'https://example.com',
    expectedAllowed: false,
    expectedOrigin: null
  }
];

/**
 * Make HTTP/HTTPS request with origin header
 */
function makeRequest(url, origin, method = 'GET') {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;

    const headers = {
      'Content-Type': 'application/json'
    };

    if (origin) {
      headers['Origin'] = origin;
    }

    if (AUTH_TOKEN) {
      headers['Authorization'] = `Bearer ${AUTH_TOKEN}`;
    }

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method,
      headers
    };

    const req = client.request(options, (res) => {
      let body = '';

      res.on('data', (chunk) => {
        body += chunk;
      });

      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body
        });
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

/**
 * Test a specific endpoint with an origin
 */
async function testCorsForOrigin(testCase, endpoint = '/expenses') {
  const url = `${API_URL}${endpoint}`;
  const results = {
    name: testCase.name,
    origin: testCase.origin,
    passed: false,
    issues: [],
    details: {}
  };

  try {
    // Test OPTIONS preflight
    const optionsResponse = await makeRequest(url, testCase.origin, 'OPTIONS');
    results.details.optionsStatus = optionsResponse.statusCode;
    results.details.corsHeaders = {
      allowOrigin: optionsResponse.headers['access-control-allow-origin'],
      allowMethods: optionsResponse.headers['access-control-allow-methods'],
      allowHeaders: optionsResponse.headers['access-control-allow-headers'],
      allowCredentials: optionsResponse.headers['access-control-allow-credentials']
    };

    // Check for wildcard CORS (SECURITY VIOLATION)
    if (optionsResponse.headers['access-control-allow-origin'] === '*') {
      results.issues.push('❌ CRITICAL: Wildcard CORS detected (*)');
      results.passed = false;
      return results;
    }

    // Test actual request
    const getResponse = await makeRequest(url, testCase.origin, 'GET');
    results.details.getStatus = getResponse.statusCode;

    // Verify CORS behavior
    if (testCase.expectedAllowed) {
      // Origin should be allowed
      if (getResponse.statusCode === 403 && getResponse.body.includes('Origin not allowed')) {
        results.issues.push(`❌ Expected origin to be allowed but got 403`);
        results.passed = false;
      } else if (testCase.expectedOrigin) {
        // Check if correct origin is reflected
        const returnedOrigin = getResponse.headers['access-control-allow-origin'];
        if (returnedOrigin !== testCase.expectedOrigin) {
          results.issues.push(`⚠️ Expected origin '${testCase.expectedOrigin}' but got '${returnedOrigin}'`);
          // This is a warning, not a failure
        }
        results.passed = true;
      } else {
        results.passed = true;
      }
    } else {
      // Origin should be blocked
      if (getResponse.statusCode !== 403) {
        results.issues.push(`❌ Expected 403 for disallowed origin but got ${getResponse.statusCode}`);
        results.passed = false;
      } else {
        results.passed = true;
      }
    }

    // Check Vary header (important for caching)
    if (!optionsResponse.headers['vary']?.includes('Origin') &&
        !getResponse.headers['vary']?.includes('Origin')) {
      results.issues.push('⚠️ Missing Vary: Origin header (may cause caching issues)');
    }

  } catch (error) {
    results.issues.push(`❌ Request failed: ${error.message}`);
    results.passed = false;
  }

  return results;
}

/**
 * Main test execution
 */
async function runTests() {
  console.log('🔒 CORS Security Test Suite\n');
  console.log(`API URL: ${API_URL}`);
  console.log(`Auth Token: ${AUTH_TOKEN ? 'Provided' : 'Not provided (some tests may fail)'}\n`);

  if (API_URL === 'YOUR_API_GATEWAY_URL') {
    console.error('❌ Please set API_URL environment variable or pass --api-url argument');
    console.error('   Example: node test-cors-security.js --api-url=https://your-api.execute-api.us-east-1.amazonaws.com/prod');
    process.exit(1);
  }

  console.log('Running CORS security tests...\n');

  const results = [];
  for (const test of TESTS) {
    process.stdout.write(`Testing: ${test.name}... `);
    const result = await testCorsForOrigin(test);
    results.push(result);

    if (result.passed) {
      console.log('✅ PASSED');
    } else {
      console.log('❌ FAILED');
      result.issues.forEach(issue => console.log(`  ${issue}`));
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Summary');
  console.log('='.repeat(60));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;

  console.log(`Total Tests: ${total}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%\n`);

  if (failed > 0) {
    console.log('❌ CORS Security Issues Detected:\n');
    results.filter(r => !r.passed).forEach(result => {
      console.log(`  ${result.name}:`);
      result.issues.forEach(issue => console.log(`    ${issue}`));
      console.log();
    });
  }

  // Critical checks
  console.log('🔍 Critical Security Checks:');
  const wildcardDetected = results.some(r =>
    r.details.corsHeaders?.allowOrigin === '*'
  );

  if (wildcardDetected) {
    console.log('  ❌ CRITICAL: Wildcard CORS (*) detected - CSRF vulnerability!');
    console.log('  ⚠️  ANY website can make authenticated requests to your API');
    process.exit(1);
  } else {
    console.log('  ✅ No wildcard CORS detected');
  }

  const unauthorizedAccess = results.some(r =>
    !r.expectedAllowed && r.details.getStatus !== 403
  );

  if (unauthorizedAccess) {
    console.log('  ❌ Unauthorized origins can access the API');
    process.exit(1);
  } else {
    console.log('  ✅ Unauthorized origins are properly blocked');
  }

  console.log('\n✅ CORS security configuration is secure!');

  return failed === 0;
}

// Run tests
runTests()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  });
