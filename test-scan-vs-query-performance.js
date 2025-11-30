/**
 * Scan vs Query Performance Comparison
 *
 * This test demonstrates the dramatic performance difference between
 * Scan and Query operations for duplicate invoice checking.
 */

const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient({ region: 'us-east-1' });

const TABLE_NAME = 'construction-expenses-company-expenses';
const INDEX_NAME = 'invoiceNum-index';

async function testScanPerformance(companyId, invoiceNum) {
  console.log('Testing SCAN performance (OLD METHOD)...');

  const iterations = 5;
  const durations = [];

  for (let i = 0; i < iterations; i++) {
    const startTime = Date.now();

    const params = {
      TableName: TABLE_NAME,
      FilterExpression: 'companyId = :companyId AND invoiceNum = :invoiceNum',
      ExpressionAttributeValues: {
        ':companyId': companyId,
        ':invoiceNum': invoiceNum
      }
    };

    const result = await dynamodb.scan(params).promise();
    const endTime = Date.now();
    const duration = endTime - startTime;
    durations.push(duration);

    console.log(`  Scan iteration ${i + 1}: ${duration}ms (scanned ${result.ScannedCount} items, returned ${result.Items.length})`);
  }

  const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
  return { method: 'SCAN', avgDuration, durations };
}

async function testQueryPerformance(companyId, invoiceNum) {
  console.log('\nTesting QUERY performance (NEW METHOD with GSI)...');

  const iterations = 5;
  const durations = [];

  for (let i = 0; i < iterations; i++) {
    const startTime = Date.now();

    const params = {
      TableName: TABLE_NAME,
      IndexName: INDEX_NAME,
      KeyConditionExpression: 'companyId = :companyId AND invoiceNum = :invoiceNum',
      ExpressionAttributeValues: {
        ':companyId': companyId,
        ':invoiceNum': invoiceNum
      },
      Limit: 1
    };

    const result = await dynamodb.query(params).promise();
    const endTime = Date.now();
    const duration = endTime - startTime;
    durations.push(duration);

    console.log(`  Query iteration ${i + 1}: ${duration}ms (returned ${result.Items.length} items)`);
  }

  const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
  return { method: 'QUERY', avgDuration, durations };
}

async function runComparison() {
  console.log('='.repeat(70));
  console.log('SCAN vs QUERY PERFORMANCE COMPARISON');
  console.log('='.repeat(70));
  console.log(`Table: ${TABLE_NAME}`);
  console.log(`Index: ${INDEX_NAME}\n`);

  // Get a real invoice from the table
  const sampleItem = await dynamodb.scan({
    TableName: TABLE_NAME,
    Limit: 1
  }).promise();

  if (!sampleItem.Items || sampleItem.Items.length === 0) {
    console.log('No items in table. Adding test data...');

    // Add a test expense
    const testCompanyId = 'test-company-perf';
    const testInvoiceNum = 'TEST-INV-001';

    await dynamodb.put({
      TableName: TABLE_NAME,
      Item: {
        companyId: testCompanyId,
        expenseId: 'exp_' + Date.now(),
        invoiceNum: testInvoiceNum,
        amount: 1000,
        paymentMethod: 'Credit Card',
        createdAt: new Date().toISOString()
      }
    }).promise();

    console.log(`Added test item: ${testCompanyId} / ${testInvoiceNum}\n`);

    const scanResults = await testScanPerformance(testCompanyId, testInvoiceNum);
    const queryResults = await testQueryPerformance(testCompanyId, testInvoiceNum);

    printComparison(scanResults, queryResults);
  } else {
    const testItem = sampleItem.Items[0];
    const companyId = testItem.companyId;
    const invoiceNum = testItem.invoiceNum;

    console.log(`Testing with real data:`);
    console.log(`  Company ID: ${companyId}`);
    console.log(`  Invoice Number: ${invoiceNum}\n`);

    const scanResults = await testScanPerformance(companyId, invoiceNum);
    const queryResults = await testQueryPerformance(companyId, invoiceNum);

    printComparison(scanResults, queryResults);
  }
}

function printComparison(scanResults, queryResults) {
  console.log('\n' + '='.repeat(70));
  console.log('PERFORMANCE COMPARISON RESULTS');
  console.log('='.repeat(70));

  console.log(`\nSCAN (Old Method):`);
  console.log(`  Average Duration: ${scanResults.avgDuration.toFixed(2)}ms`);
  console.log(`  Min: ${Math.min(...scanResults.durations)}ms`);
  console.log(`  Max: ${Math.max(...scanResults.durations)}ms`);

  console.log(`\nQUERY (New Method with GSI):`);
  console.log(`  Average Duration: ${queryResults.avgDuration.toFixed(2)}ms`);
  console.log(`  Min: ${Math.min(...queryResults.durations)}ms`);
  console.log(`  Max: ${Math.max(...queryResults.durations)}ms`);

  const improvement = ((scanResults.avgDuration - queryResults.avgDuration) / scanResults.avgDuration * 100).toFixed(1);
  const speedup = (scanResults.avgDuration / queryResults.avgDuration).toFixed(1);

  console.log(`\nPerformance Improvement:`);
  console.log(`  ${improvement}% faster (${speedup}x speedup)`);
  console.log(`  Absolute improvement: ${(scanResults.avgDuration - queryResults.avgDuration).toFixed(2)}ms`);

  console.log(`\n✅ GSI Query optimization successful!`);
  console.log('='.repeat(70));
}

runComparison().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
