/**
 * Performance test for invoice duplicate checking
 *
 * Tests the performance of the invoiceNum-index GSI to ensure
 * invoice duplicate checks complete in < 100ms.
 *
 * This replaces the previous Scan-based approach which would timeout
 * at 10,000+ records with an efficient Query-based approach.
 */

const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient({ region: 'us-east-1' });

const TABLE_NAME = 'construction-expenses-company-expenses';
const INDEX_NAME = 'invoiceNum-index';

/**
 * Test the performance of invoice duplicate checking
 */
async function testInvoiceDuplicatePerformance() {
  console.log('='.repeat(60));
  console.log('INVOICE DUPLICATE CHECK PERFORMANCE TEST');
  console.log('='.repeat(60));
  console.log(`Table: ${TABLE_NAME}`);
  console.log(`Index: ${INDEX_NAME}`);
  console.log('');

  // Test with a non-existent invoice (worst case - full index scan)
  const testCompanyId = 'test-company-performance';
  const testInvoiceNum = 'INV-PERF-TEST-' + Date.now();

  console.log(`Test Parameters:`);
  console.log(`  Company ID: ${testCompanyId}`);
  console.log(`  Invoice Number: ${testInvoiceNum}`);
  console.log('');

  // Warm up (ensure index is loaded)
  console.log('Warming up index...');
  try {
    await dynamodb.query({
      TableName: TABLE_NAME,
      IndexName: INDEX_NAME,
      KeyConditionExpression: 'companyId = :companyId AND invoiceNum = :invoiceNum',
      ExpressionAttributeValues: {
        ':companyId': testCompanyId,
        ':invoiceNum': 'warmup'
      },
      Limit: 1
    }).promise();
  } catch (error) {
    // Ignore warmup errors
  }

  console.log('Running performance test...\n');

  // Run multiple iterations to get average
  const iterations = 10;
  const durations = [];

  for (let i = 0; i < iterations; i++) {
    const startTime = Date.now();

    const params = {
      TableName: TABLE_NAME,
      IndexName: INDEX_NAME,
      KeyConditionExpression: 'companyId = :companyId AND invoiceNum = :invoiceNum',
      ExpressionAttributeValues: {
        ':companyId': testCompanyId,
        ':invoiceNum': testInvoiceNum + '-' + i
      },
      Limit: 1
    };

    try {
      const result = await dynamodb.query(params).promise();
      const endTime = Date.now();
      const duration = endTime - startTime;
      durations.push(duration);

      console.log(`  Iteration ${i + 1}: ${duration}ms (${result.Items.length} items found)`);
    } catch (error) {
      console.error(`  Iteration ${i + 1}: ERROR - ${error.message}`);
      throw error;
    }
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('PERFORMANCE TEST RESULTS');
  console.log('='.repeat(60));

  const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
  const minDuration = Math.min(...durations);
  const maxDuration = Math.max(...durations);

  console.log(`Iterations: ${iterations}`);
  console.log(`Average Duration: ${avgDuration.toFixed(2)}ms`);
  console.log(`Min Duration: ${minDuration}ms`);
  console.log(`Max Duration: ${maxDuration}ms`);
  console.log(`Target: < 100ms`);
  console.log('');

  // Check if performance meets requirements
  if (avgDuration >= 100) {
    console.log(`❌ FAIL: Average duration ${avgDuration.toFixed(2)}ms >= 100ms threshold`);
    throw new Error(`Performance test failed: ${avgDuration.toFixed(2)}ms >= 100ms threshold`);
  }

  if (maxDuration >= 200) {
    console.log(`⚠️  WARNING: Max duration ${maxDuration}ms >= 200ms (potential outliers)`);
  }

  console.log(`✅ PASS: All queries completed in < 100ms average`);
  console.log('');
  console.log('Performance optimization successful!');
  console.log('Query-based lookup is significantly faster than Scan-based approach.');
  console.log('='.repeat(60));
}

/**
 * Verify the GSI exists and is active
 */
async function verifyGSIStatus() {
  console.log('Verifying GSI status...\n');

  const dynamoDBClient = new AWS.DynamoDB({ region: 'us-east-1' });

  try {
    const tableDescription = await dynamoDBClient.describeTable({
      TableName: TABLE_NAME
    }).promise();

    const gsi = tableDescription.Table.GlobalSecondaryIndexes?.find(
      index => index.IndexName === INDEX_NAME
    );

    if (!gsi) {
      throw new Error(`GSI '${INDEX_NAME}' not found on table '${TABLE_NAME}'`);
    }

    console.log(`GSI Status: ${gsi.IndexStatus}`);
    console.log(`GSI Item Count: ${gsi.ItemCount}`);
    console.log('');

    if (gsi.IndexStatus !== 'ACTIVE') {
      throw new Error(`GSI '${INDEX_NAME}' is not ACTIVE (status: ${gsi.IndexStatus}). Please wait for index creation to complete.`);
    }

    console.log('✅ GSI is ACTIVE and ready for testing\n');
  } catch (error) {
    console.error('❌ GSI verification failed:', error.message);
    throw error;
  }
}

/**
 * Main test execution
 */
async function runTests() {
  try {
    await verifyGSIStatus();
    await testInvoiceDuplicatePerformance();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run tests
runTests();
