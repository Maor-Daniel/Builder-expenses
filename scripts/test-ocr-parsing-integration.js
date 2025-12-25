#!/usr/bin/env node
// scripts/test-ocr-parsing-integration.js
// Integration test for OCR parsing utilities with mock Textract responses

const { parseExpenseDocument } = require('../lambda/shared/textract-parser');

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logTestResult(testName, passed, details = '') {
  if (passed) {
    log(`✅ ${testName}`, 'green');
    if (details) log(`   ${details}`, 'cyan');
  } else {
    log(`❌ ${testName}`, 'red');
    if (details) log(`   ${details}`, 'red');
  }
}

// Mock Textract responses for different receipt types
const mockReceipts = {
  homeDepot: {
    name: 'Home Depot Receipt',
    textractResponse: {
      ExpenseDocuments: [{
        SummaryFields: [
          {
            Type: { Text: 'TOTAL', Confidence: 99 },
            ValueDetection: { Text: '$1,250.50', Confidence: 99 }
          },
          {
            Type: { Text: 'INVOICE_RECEIPT_DATE', Confidence: 95 },
            ValueDetection: { Text: '12/15/2025', Confidence: 95 }
          },
          {
            Type: { Text: 'VENDOR_NAME', Confidence: 92 },
            ValueDetection: { Text: 'Home Depot', Confidence: 92 }
          },
          {
            Type: { Text: 'INVOICE_RECEIPT_ID', Confidence: 88 },
            ValueDetection: { Text: 'INV-12345', Confidence: 88 }
          },
          {
            Type: { Text: 'SUBTOTAL', Confidence: 97 },
            ValueDetection: { Text: '$1,150.00', Confidence: 97 }
          },
          {
            Type: { Text: 'TAX', Confidence: 96 },
            ValueDetection: { Text: '$100.50', Confidence: 96 }
          }
        ],
        LineItemGroups: [{
          LineItems: [
            {
              LineItemExpenseFields: [
                {
                  Type: { Text: 'ITEM', Confidence: 95 },
                  ValueDetection: { Text: 'Lumber 2x4x8', Confidence: 95 }
                },
                {
                  Type: { Text: 'QUANTITY', Confidence: 98 },
                  ValueDetection: { Text: '20', Confidence: 98 }
                },
                {
                  Type: { Text: 'PRICE', Confidence: 98 },
                  ValueDetection: { Text: '$45.00', Confidence: 98 }
                }
              ]
            },
            {
              LineItemExpenseFields: [
                {
                  Type: { Text: 'ITEM', Confidence: 93 },
                  ValueDetection: { Text: 'Nails Box 3in', Confidence: 93 }
                },
                {
                  Type: { Text: 'QUANTITY', Confidence: 97 },
                  ValueDetection: { Text: '5', Confidence: 97 }
                },
                {
                  Type: { Text: 'PRICE', Confidence: 97 },
                  ValueDetection: { Text: '$12.50', Confidence: 97 }
                }
              ]
            }
          ]
        }]
      }]
    },
    expectedFields: {
      amount: 1250.50,
      date: '2025-12-15',
      vendor: 'Home Depot',
      invoiceNum: 'INV-12345',
      subtotal: 1150.00,
      tax: 100.50
    },
    expectedLineItemsCount: 2
  },

  starbucks: {
    name: 'Starbucks Receipt',
    textractResponse: {
      ExpenseDocuments: [{
        SummaryFields: [
          {
            Type: { Text: 'AMOUNT_PAID', Confidence: 98 },
            ValueDetection: { Text: '$8.75', Confidence: 98 }
          },
          {
            Type: { Text: 'DATE', Confidence: 94 },
            ValueDetection: { Text: '01/15/2025', Confidence: 94 }
          },
          {
            Type: { Text: 'MERCHANT_NAME', Confidence: 90 },
            ValueDetection: { Text: 'Starbucks Coffee', Confidence: 90 }
          }
        ],
        LineItemGroups: [{
          LineItems: [
            {
              LineItemExpenseFields: [
                {
                  Type: { Text: 'DESCRIPTION', Confidence: 92 },
                  ValueDetection: { Text: 'Grande Latte', Confidence: 92 }
                },
                {
                  Type: { Text: 'PRICE', Confidence: 96 },
                  ValueDetection: { Text: '$5.25', Confidence: 96 }
                }
              ]
            },
            {
              LineItemExpenseFields: [
                {
                  Type: { Text: 'DESCRIPTION', Confidence: 91 },
                  ValueDetection: { Text: 'Croissant', Confidence: 91 }
                },
                {
                  Type: { Text: 'PRICE', Confidence: 95 },
                  ValueDetection: { Text: '$3.50', Confidence: 95 }
                }
              ]
            }
          ]
        }]
      }]
    },
    expectedFields: {
      amount: 8.75,
      date: '2025-01-15',
      vendor: 'Starbucks Coffee'
    },
    expectedLineItemsCount: 2
  },

  europeanFormat: {
    name: 'European Format Receipt (Euro)',
    textractResponse: {
      ExpenseDocuments: [{
        SummaryFields: [
          {
            Type: { Text: 'TOTAL', Confidence: 97 },
            ValueDetection: { Text: '€1.234,56', Confidence: 97 }
          },
          {
            Type: { Text: 'INVOICE_RECEIPT_DATE', Confidence: 93 },
            ValueDetection: { Text: '15.12.2025', Confidence: 93 }
          },
          {
            Type: { Text: 'VENDOR_NAME', Confidence: 89 },
            ValueDetection: { Text: 'IKEA Berlin', Confidence: 89 }
          }
        ],
        LineItemGroups: []
      }]
    },
    expectedFields: {
      amount: 1234.56,
      date: '2025-12-15',
      vendor: 'IKEA Berlin'
    },
    expectedLineItemsCount: 0
  },

  lowConfidence: {
    name: 'Low Confidence Receipt',
    textractResponse: {
      ExpenseDocuments: [{
        SummaryFields: [
          {
            Type: { Text: 'TOTAL', Confidence: 65 },
            ValueDetection: { Text: '$50.00', Confidence: 65 }
          },
          {
            Type: { Text: 'DATE', Confidence: 55 },
            ValueDetection: { Text: '12/01/2025', Confidence: 55 }
          },
          {
            Type: { Text: 'VENDOR_NAME', Confidence: 45 },
            ValueDetection: { Text: 'Unknown Vendor', Confidence: 45 }
          }
        ],
        LineItemGroups: []
      }]
    },
    expectedFields: {
      amount: 50.00,
      date: '2025-12-01',
      vendor: 'Unknown Vendor'
    },
    confidenceThreshold: 80,
    expectedLowConfidenceFields: ['amount', 'date', 'vendor']
  },

  invalidData: {
    name: 'Receipt with Invalid Data',
    textractResponse: {
      ExpenseDocuments: [{
        SummaryFields: [
          {
            Type: { Text: 'TOTAL', Confidence: 95 },
            ValueDetection: { Text: 'invalid amount', Confidence: 95 }
          },
          {
            Type: { Text: 'DATE', Confidence: 92 },
            ValueDetection: { Text: 'not a date', Confidence: 92 }
          },
          {
            Type: { Text: 'VENDOR_NAME', Confidence: 88 },
            ValueDetection: { Text: 'Valid Vendor', Confidence: 88 }
          }
        ],
        LineItemGroups: []
      }]
    },
    expectedFields: {
      vendor: 'Valid Vendor'
      // amount and date should be undefined due to invalid parsing
    },
    expectedInvalidFields: ['amount', 'date']
  },

  emptyReceipt: {
    name: 'Empty Receipt',
    textractResponse: {
      ExpenseDocuments: []
    },
    expectedFields: {},
    expectedLineItemsCount: 0
  }
};

// Run integration tests
function runIntegrationTests() {
  log('\n🧪 Running OCR Parsing Integration Tests\n', 'blue');

  let totalTests = 0;
  let passedTests = 0;

  // Test 1: Home Depot Receipt (complete)
  log('Test 1: Complete Home Depot Receipt', 'cyan');
  const homeDepotResult = parseExpenseDocument(mockReceipts.homeDepot.textractResponse);
  totalTests += 5;

  if (homeDepotResult.fields.amount === mockReceipts.homeDepot.expectedFields.amount) {
    logTestResult('Amount parsed correctly', true, `$${homeDepotResult.fields.amount}`);
    passedTests++;
  } else {
    logTestResult('Amount parsed correctly', false, `Expected ${mockReceipts.homeDepot.expectedFields.amount}, got ${homeDepotResult.fields.amount}`);
  }

  if (homeDepotResult.fields.date === mockReceipts.homeDepot.expectedFields.date) {
    logTestResult('Date parsed correctly', true, homeDepotResult.fields.date);
    passedTests++;
  } else {
    logTestResult('Date parsed correctly', false, `Expected ${mockReceipts.homeDepot.expectedFields.date}, got ${homeDepotResult.fields.date}`);
  }

  if (homeDepotResult.fields.vendor === mockReceipts.homeDepot.expectedFields.vendor) {
    logTestResult('Vendor parsed correctly', true, homeDepotResult.fields.vendor);
    passedTests++;
  } else {
    logTestResult('Vendor parsed correctly', false, `Expected ${mockReceipts.homeDepot.expectedFields.vendor}, got ${homeDepotResult.fields.vendor}`);
  }

  if (homeDepotResult.lineItems.length === mockReceipts.homeDepot.expectedLineItemsCount) {
    logTestResult('Line items extracted', true, `${homeDepotResult.lineItems.length} items`);
    passedTests++;
  } else {
    logTestResult('Line items extracted', false, `Expected ${mockReceipts.homeDepot.expectedLineItemsCount}, got ${homeDepotResult.lineItems.length}`);
  }

  // Description is generated in the Lambda function, not in the parser
  // Parser only extracts line items, Lambda constructs description
  if (homeDepotResult.lineItems.length > 0 && homeDepotResult.lineItems[0].description && homeDepotResult.lineItems[0].description.includes('Lumber')) {
    logTestResult('Line item descriptions extracted', true, homeDepotResult.lineItems[0].description);
    passedTests++;
  } else {
    logTestResult('Line item descriptions extracted', false, homeDepotResult.lineItems[0]?.description || 'No description');
  }

  // Test 2: Starbucks Receipt
  log('\nTest 2: Starbucks Receipt', 'cyan');
  const starbucksResult = parseExpenseDocument(mockReceipts.starbucks.textractResponse);
  totalTests += 3;

  if (starbucksResult.fields.amount === mockReceipts.starbucks.expectedFields.amount) {
    logTestResult('Amount parsed correctly', true, `$${starbucksResult.fields.amount}`);
    passedTests++;
  } else {
    logTestResult('Amount parsed correctly', false, `Expected ${mockReceipts.starbucks.expectedFields.amount}, got ${starbucksResult.fields.amount}`);
  }

  if (starbucksResult.fields.vendor === mockReceipts.starbucks.expectedFields.vendor) {
    logTestResult('Vendor parsed correctly', true, starbucksResult.fields.vendor);
    passedTests++;
  } else {
    logTestResult('Vendor parsed correctly', false);
  }

  if (starbucksResult.lineItems.length === mockReceipts.starbucks.expectedLineItemsCount) {
    logTestResult('Line items extracted', true, `${starbucksResult.lineItems.length} items`);
    passedTests++;
  } else {
    logTestResult('Line items extracted', false);
  }

  // Test 3: European Format
  log('\nTest 3: European Format Receipt', 'cyan');
  const europeanResult = parseExpenseDocument(mockReceipts.europeanFormat.textractResponse);
  totalTests += 2;

  if (europeanResult.fields.amount === mockReceipts.europeanFormat.expectedFields.amount) {
    logTestResult('European amount format parsed', true, `€${europeanResult.fields.amount}`);
    passedTests++;
  } else {
    logTestResult('European amount format parsed', false, `Expected ${mockReceipts.europeanFormat.expectedFields.amount}, got ${europeanResult.fields.amount}`);
  }

  if (europeanResult.fields.date === mockReceipts.europeanFormat.expectedFields.date) {
    logTestResult('European date format parsed', true, europeanResult.fields.date);
    passedTests++;
  } else {
    logTestResult('European date format parsed', false);
  }

  // Test 4: Low Confidence
  log('\nTest 4: Low Confidence Receipt', 'cyan');
  const lowConfResult = parseExpenseDocument(mockReceipts.lowConfidence.textractResponse);
  totalTests += 2;

  if (lowConfResult.fields.amount === mockReceipts.lowConfidence.expectedFields.amount) {
    logTestResult('Low confidence amount still parsed', true, `$${lowConfResult.fields.amount}`);
    passedTests++;
  } else {
    logTestResult('Low confidence amount still parsed', false);
  }

  const lowConfFields = Object.entries(lowConfResult.confidence)
    .filter(([field, score]) => score < 80)
    .map(([field]) => field);

  if (lowConfFields.length === mockReceipts.lowConfidence.expectedLowConfidenceFields.length) {
    logTestResult('Low confidence fields detected', true, `${lowConfFields.length} fields below threshold`);
    passedTests++;
  } else {
    logTestResult('Low confidence fields detected', false);
  }

  // Test 5: Invalid Data
  log('\nTest 5: Receipt with Invalid Data', 'cyan');
  const invalidResult = parseExpenseDocument(mockReceipts.invalidData.textractResponse);
  totalTests += 2;

  if (!invalidResult.fields.amount && !invalidResult.fields.date) {
    logTestResult('Invalid data handled gracefully', true, 'Invalid fields returned as undefined');
    passedTests++;
  } else {
    logTestResult('Invalid data handled gracefully', false);
  }

  if (invalidResult.fields.vendor === mockReceipts.invalidData.expectedFields.vendor) {
    logTestResult('Valid fields still extracted', true, invalidResult.fields.vendor);
    passedTests++;
  } else {
    logTestResult('Valid fields still extracted', false);
  }

  // Test 6: Empty Receipt
  log('\nTest 6: Empty Receipt', 'cyan');
  const emptyResult = parseExpenseDocument(mockReceipts.emptyReceipt.textractResponse);
  totalTests += 1;

  if (Object.keys(emptyResult.fields).length === 0 && emptyResult.lineItems.length === 0) {
    logTestResult('Empty receipt handled', true, 'Returns empty objects');
    passedTests++;
  } else {
    logTestResult('Empty receipt handled', false);
  }

  // Performance test
  log('\nPerformance Test', 'cyan');
  const perfStart = Date.now();
  for (let i = 0; i < 100; i++) {
    parseExpenseDocument(mockReceipts.homeDepot.textractResponse);
  }
  const perfTime = Date.now() - perfStart;
  const avgTime = perfTime / 100;
  totalTests += 1;

  if (avgTime < 100) {
    logTestResult('Performance test', true, `Average: ${avgTime.toFixed(2)}ms per parse (requirement: <100ms)`);
    passedTests++;
  } else {
    logTestResult('Performance test', false, `Average: ${avgTime.toFixed(2)}ms (exceeds 100ms requirement)`);
  }

  // Summary
  log('\n' + '='.repeat(60), 'cyan');
  log('Integration Test Summary', 'blue');
  log('='.repeat(60), 'cyan');
  log(`Total Tests: ${totalTests}`, 'yellow');
  log(`Passed: ${passedTests}`, 'green');
  log(`Failed: ${totalTests - passedTests}`, totalTests === passedTests ? 'green' : 'red');
  log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`, totalTests === passedTests ? 'green' : 'yellow');
  log('='.repeat(60), 'cyan');

  if (totalTests === passedTests) {
    log('\n✅ All integration tests passed!', 'green');
    return true;
  } else {
    log('\n❌ Some integration tests failed', 'red');
    return false;
  }
}

// Main execution
if (require.main === module) {
  const success = runIntegrationTests();
  process.exit(success ? 0 : 1);
}

module.exports = { runIntegrationTests };
