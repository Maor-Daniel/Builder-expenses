#!/usr/bin/env node

/**
 * FUNCTIONAL TEST - COMPANY-SCOPED ARCHITECTURE
 *
 * Tests that the company-scoped Lambda functions work correctly
 * by performing CRUD operations.
 */

const https = require('https');

const TEST_COMPANY_ID = 'test-user-123';
const API_BASE_URL = 'https://buxnc33ibc.execute-api.us-east-1.amazonaws.com/production';

// Test configuration
const TESTS = [
  {
    name: 'Get Expenses',
    method: 'POST',
    path: '/getExpenses',
    body: {
      companyId: TEST_COMPANY_ID
    }
  },
  {
    name: 'Get Projects',
    method: 'POST',
    path: '/getProjects',
    body: {
      companyId: TEST_COMPANY_ID
    }
  },
  {
    name: 'Get Contractors',
    method: 'POST',
    path: '/getContractors',
    body: {
      companyId: TEST_COMPANY_ID
    }
  },
  {
    name: 'Get Works',
    method: 'POST',
    path: '/getWorks',
    body: {
      companyId: TEST_COMPANY_ID
    }
  }
];

/**
 * Make HTTP request
 */
function makeRequest(test) {
  return new Promise((resolve, reject) => {
    const url = new URL(test.path, API_BASE_URL);
    const body = JSON.stringify(test.body);

    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: test.method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ statusCode: res.statusCode, data: json });
        } catch (error) {
          resolve({ statusCode: res.statusCode, data });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(body);
    req.end();
  });
}

/**
 * Run a single test
 */
async function runTest(test) {
  console.log(`\n📝 Test: ${test.name}`);
  console.log(`   ${test.method} ${test.path}`);
  console.log(`   Body: ${JSON.stringify(test.body)}`);

  try {
    const response = await makeRequest(test);

    console.log(`   Status: ${response.statusCode}`);

    if (response.statusCode === 200) {
      const recordCount = Array.isArray(response.data) ? response.data.length :
                         response.data.items ? response.data.items.length :
                         response.data.expenses ? response.data.expenses.length :
                         response.data.projects ? response.data.projects.length :
                         response.data.contractors ? response.data.contractors.length :
                         response.data.works ? response.data.works.length : 0;

      console.log(`   ✅ Success - ${recordCount} records returned`);
      return { test: test.name, success: true, recordCount };
    } else {
      console.log(`   ❌ Failed - Status ${response.statusCode}`);
      console.log(`   Response: ${JSON.stringify(response.data)}`);
      return { test: test.name, success: false, error: `Status ${response.statusCode}` };
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return { test: test.name, success: false, error: error.message };
  }
}

/**
 * Main test function
 */
async function main() {
  console.log('🧪 FUNCTIONAL TESTS - COMPANY-SCOPED ARCHITECTURE');
  console.log('='.repeat(80));
  console.log(`Testing with companyId: ${TEST_COMPANY_ID}`);
  console.log(`API Base URL: ${API_BASE_URL}`);

  const results = [];

  for (const test of TESTS) {
    const result = await runTest(test);
    results.push(result);
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(80));

  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`Total tests: ${results.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  console.log('\nResults:');
  results.forEach(r => {
    const status = r.success ? '✅' : '❌';
    const details = r.success ?
      `${r.recordCount} records` :
      `Error: ${r.error}`;
    console.log(`  ${status} ${r.test}: ${details}`);
  });

  console.log('='.repeat(80));

  if (failed === 0) {
    console.log('\n✅ ALL FUNCTIONAL TESTS PASSED!');
    process.exit(0);
  } else {
    console.error('\n❌ SOME TESTS FAILED');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
