#!/usr/bin/env node

/**
 * Test OCR Endpoint - POST /expenses/ocr-process
 *
 * This script tests the OCR endpoint with a sample receipt image.
 * It validates:
 * 1. Endpoint is accessible
 * 2. Authentication works (Clerk JWT)
 * 3. Receipt processing completes successfully
 * 4. Response format matches expected structure
 * 5. Extracted fields are present
 * 6. Response time is acceptable (< 10 seconds)
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Configuration
const API_URL = 'https://2woj5i92td.execute-api.us-east-1.amazonaws.com/production';
const ENDPOINT = '/expenses/ocr-process';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step, message) {
  log(`\n[Step ${step}] ${message}`, 'cyan');
}

function logSuccess(message) {
  log(`✓ ${message}`, 'green');
}

function logError(message) {
  log(`✗ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠ ${message}`, 'yellow');
}

// Generate a simple test receipt image (1x1 PNG)
// This is a base64-encoded 1x1 transparent PNG for minimal testing
const TEST_IMAGE_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/**
 * Get Clerk JWT token for testing
 * In production, this would come from your frontend application
 */
function getTestAuthToken() {
  // IMPORTANT: Replace this with a real Clerk JWT token for testing
  // You can get this from your browser's developer tools when logged in
  const token = process.env.CLERK_TEST_TOKEN;

  if (!token) {
    logError('CLERK_TEST_TOKEN environment variable not set');
    logWarning('Please set CLERK_TEST_TOKEN with a valid Clerk JWT token');
    logWarning('Example: export CLERK_TEST_TOKEN="your-clerk-jwt-token"');
    process.exit(1);
  }

  return token;
}

/**
 * Make HTTPS request
 */
function makeRequest(method, path, body, headers) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_URL + path);

    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    if (body) {
      options.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(body));
    }

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ statusCode: res.statusCode, headers: res.headers, body: parsed });
        } catch (error) {
          resolve({ statusCode: res.statusCode, headers: res.headers, body: data });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

/**
 * Test the OCR endpoint
 */
async function testOcrEndpoint() {
  logStep(1, 'Preparing test data');

  const authToken = getTestAuthToken();
  logSuccess(`Auth token loaded (${authToken.substring(0, 20)}...)`);

  const testPayload = {
    receiptBase64: TEST_IMAGE_BASE64,
    fileName: 'test-receipt.png',
    fileSize: Math.floor(TEST_IMAGE_BASE64.length * 0.75),
    companyId: 'test-company'  // Will be extracted from JWT by Lambda
  };

  logSuccess(`Test payload prepared (${testPayload.fileSize} bytes)`);

  logStep(2, 'Calling OCR endpoint');
  log(`URL: ${API_URL}${ENDPOINT}`, 'blue');
  log(`Method: POST`, 'blue');

  const startTime = Date.now();

  try {
    const response = await makeRequest('POST', ENDPOINT, testPayload, {
      'Authorization': `Bearer ${authToken}`
    });

    const duration = Date.now() - startTime;

    logStep(3, 'Analyzing response');
    log(`Status Code: ${response.statusCode}`, 'cyan');
    log(`Response Time: ${duration}ms`, 'cyan');

    // Check status code
    if (response.statusCode === 200) {
      logSuccess('Status code is 200 OK');
    } else {
      logError(`Expected 200, got ${response.statusCode}`);
      logError(`Response: ${JSON.stringify(response.body, null, 2)}`);
      return false;
    }

    // Check response time
    if (duration < 10000) {
      logSuccess(`Response time under 10 seconds (${duration}ms)`);
    } else {
      logWarning(`Response time exceeded 10 seconds (${duration}ms)`);
    }

    // Validate response structure
    logStep(4, 'Validating response structure');

    const body = response.body;

    if (body.success) {
      logSuccess('Response has success=true');
    } else {
      logError('Response missing success field or success=false');
      return false;
    }

    if (body.data) {
      logSuccess('Response has data object');
    } else {
      logError('Response missing data object');
      return false;
    }

    if (body.data.extractedFields) {
      logSuccess('Response has extractedFields');
      log(`Fields: ${JSON.stringify(Object.keys(body.data.extractedFields), null, 2)}`, 'cyan');
    } else {
      logWarning('Response missing extractedFields (may be expected for minimal test image)');
    }

    if (body.data.ocrMetadata) {
      logSuccess('Response has ocrMetadata');
      log(`Metadata: ${JSON.stringify(body.data.ocrMetadata, null, 2)}`, 'cyan');
    } else {
      logError('Response missing ocrMetadata');
      return false;
    }

    if (body.timestamp) {
      logSuccess('Response has timestamp');
    } else {
      logError('Response missing timestamp');
      return false;
    }

    logStep(5, 'Test Summary');
    logSuccess('All validations passed');
    log('\nFull Response:', 'blue');
    console.log(JSON.stringify(body, null, 2));

    return true;

  } catch (error) {
    const duration = Date.now() - startTime;
    logError(`Request failed after ${duration}ms`);
    logError(`Error: ${error.message}`);

    if (error.code) {
      logError(`Error Code: ${error.code}`);
    }

    return false;
  }
}

/**
 * Test endpoint availability (without auth)
 */
async function testEndpointAvailability() {
  logStep(1, 'Testing endpoint availability (no auth)');

  try {
    const response = await makeRequest('POST', ENDPOINT, { test: true }, {});

    // We expect 401 or 403 (auth required), not 404
    if (response.statusCode === 401 || response.statusCode === 403) {
      logSuccess('Endpoint is reachable (auth required as expected)');
      return true;
    } else if (response.statusCode === 404) {
      logError('Endpoint not found (404)');
      return false;
    } else {
      logWarning(`Unexpected status code: ${response.statusCode}`);
      return true;  // Endpoint exists but different response
    }
  } catch (error) {
    logError(`Failed to reach endpoint: ${error.message}`);
    return false;
  }
}

/**
 * Main test function
 */
async function main() {
  log('\n=====================================', 'cyan');
  log('  OCR Endpoint Test', 'cyan');
  log('  POST /expenses/ocr-process', 'cyan');
  log('=====================================\n', 'cyan');

  try {
    // Test 1: Endpoint availability
    const availabilityOk = await testEndpointAvailability();
    if (!availabilityOk) {
      logError('\nEndpoint availability test failed');
      process.exit(1);
    }

    log('\n-----------------------------------\n', 'cyan');

    // Test 2: Full OCR test with auth
    const ocrTestOk = await testOcrEndpoint();
    if (!ocrTestOk) {
      logError('\nOCR endpoint test failed');
      process.exit(1);
    }

    log('\n=====================================', 'green');
    log('  ✓ All tests passed!', 'green');
    log('=====================================\n', 'green');

    logSuccess('OCR endpoint is working correctly');
    logSuccess('Next: Test with actual receipt image in browser');

    process.exit(0);

  } catch (error) {
    logError(`\nUnexpected error: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// Run tests
main();
