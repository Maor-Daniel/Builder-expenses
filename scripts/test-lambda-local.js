#!/usr/bin/env node
// scripts/test-lambda-local.js
// בדיקה מקומית של Lambda functions ללא deployment

const path = require('path');

// Load environment variables
require('dotenv').config();

// Mock AWS SDK for local testing
process.env.AWS_REGION = process.env.AWS_REGION || 'us-east-1';
process.env.TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'construction-expenses-production';

// Colors for terminal
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Mock event for testing
const mockEvents = {
  getExpenses: {
    httpMethod: 'GET',
    requestContext: {
      authorizer: {
        claims: {
          sub: 'test-user-123'
        }
      }
    },
    queryStringParameters: null
  },
  
  addExpense: {
    httpMethod: 'POST',
    requestContext: {
      authorizer: {
        claims: {
          sub: 'test-user-123'
        }
      }
    },
    body: JSON.stringify({
      project: 'Test Project',
      contractor: 'Test Contractor',
      invoiceNum: 'TEST-001',
      amount: 1000,
      paymentTerms: '30 days',
      paymentMethod: 'העברה בנקאית',
      date: '2025-01-15'
    })
  },
  
  updateExpense: {
    httpMethod: 'PUT',
    requestContext: {
      authorizer: {
        claims: {
          sub: 'test-user-123'
        }
      }
    },
    pathParameters: {
      expenseId: 'exp_1700000001_abc123456'
    },
    body: JSON.stringify({
      project: 'בניין מגורים גבעתיים - מעודכן',
      contractor: 'חברת בניה בע"מ',
      invoiceNum: 'INV-001-UPDATED',
      amount: 27000,
      paymentTerms: '45 ימים',
      paymentMethod: 'העברה בנקאית',
      date: '2024-01-15',
      description: 'עבודות בטון - מעודכן',
      status: 'approved'
    })
  },
  
  deleteExpense: {
    httpMethod: 'DELETE',
    requestContext: {
      authorizer: {
        claims: {
          sub: 'test-user-123'
        }
      }
    },
    pathParameters: {
      expenseId: 'exp_1700000003_ghi345678'
    }
  },

  getProjects: {
    httpMethod: 'GET',
    requestContext: {
      authorizer: {
        claims: {
          sub: 'test-user-123'
        }
      }
    },
    queryStringParameters: null
  },

  addProject: {
    httpMethod: 'POST',
    requestContext: {
      authorizer: {
        claims: {
          sub: 'test-user-123'
        }
      }
    },
    body: JSON.stringify({
      name: 'פרויקט בדיקה',
      startDate: '2025-01-15',
      description: 'פרויקט לבדיקת המערכת'
    })
  },

  getContractors: {
    httpMethod: 'GET',
    requestContext: {
      authorizer: {
        claims: {
          sub: 'test-user-123'
        }
      }
    },
    queryStringParameters: null
  },

  addContractor: {
    httpMethod: 'POST',
    requestContext: {
      authorizer: {
        claims: {
          sub: 'test-user-123'
        }
      }
    },
    body: JSON.stringify({
      name: 'קבלן בדיקה',
      phone: '050-1234567'
    })
  }
};

async function testLambda(functionName) {
  log(`\n${'='.repeat(60)}`, 'blue');
  log(`Testing: ${functionName}`, 'blue');
  log('='.repeat(60), 'blue');

  try {
    // Load the Lambda function
    const lambdaPath = path.join(__dirname, '..', 'lambda', `${functionName}.js`);
    const lambda = require(lambdaPath);

    // Get mock event
    const event = mockEvents[functionName];
    
    if (!event) {
      log(`❌ No mock event found for ${functionName}`, 'red');
      return;
    }

    log('\n📥 Input Event:', 'yellow');
    console.log(JSON.stringify(event, null, 2));

    // Execute the Lambda
    log('\n⚙️  Executing Lambda...', 'yellow');
    const startTime = Date.now();
    const result = await lambda.handler(event);
    const duration = Date.now() - startTime;

    log('\n📤 Output:', 'yellow');
    console.log(JSON.stringify(result, null, 2));

    log(`\n⏱️  Duration: ${duration}ms`, 'green');
    log(`✅ Status: ${result.statusCode}`, result.statusCode === 200 ? 'green' : 'red');

  } catch (error) {
    log(`\n❌ Error: ${error.message}`, 'red');
    console.error(error);
  }
}

async function main() {
  const functionName = process.argv[2];

  if (!functionName) {
    log('\n📋 Usage: node scripts/test-lambda-local.js <functionName>', 'yellow');
    log('\nAvailable functions:', 'blue');
    log('Expense Management:', 'yellow');
    log('  - getExpenses', 'green');
    log('  - addExpense', 'green');
    log('  - updateExpense', 'green');
    log('  - deleteExpense', 'green');
    log('Project Management:', 'yellow');
    log('  - getProjects', 'green');
    log('  - addProject', 'green');
    log('Contractor Management:', 'yellow');
    log('  - getContractors', 'green');
    log('  - addContractor', 'green');
    log('\nExample:', 'yellow');
    log('  node scripts/test-lambda-local.js getExpenses\n', 'green');
    return;
  }

  await testLambda(functionName);
}

// Run if called directly
if (require.main === module) {
  main();
}