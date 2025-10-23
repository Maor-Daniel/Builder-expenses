#!/usr/bin/env node
// scripts/setup-local-dynamodb.js
// Set up local DynamoDB table for development

const AWS = require('aws-sdk');
const path = require('path');

// Configure AWS SDK for local DynamoDB
const dynamodb = new AWS.DynamoDB({
  region: 'localhost',
  endpoint: 'http://localhost:8001',
  accessKeyId: 'fakeMyKeyId',
  secretAccessKey: 'fakeSecretAccessKey'
});

const TABLE_NAME = 'construction-expenses-local';

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

const tableSchema = {
  TableName: TABLE_NAME,
  KeySchema: [
    {
      AttributeName: 'userId',
      KeyType: 'HASH'  // Partition key
    },
    {
      AttributeName: 'expenseId',
      KeyType: 'RANGE'  // Sort key
    }
  ],
  AttributeDefinitions: [
    {
      AttributeName: 'userId',
      AttributeType: 'S'
    },
    {
      AttributeName: 'expenseId',
      AttributeType: 'S'
    },
    {
      AttributeName: 'date',
      AttributeType: 'S'
    }
  ],
  GlobalSecondaryIndexes: [
    {
      IndexName: 'date-index',
      KeySchema: [
        {
          AttributeName: 'userId',
          KeyType: 'HASH'
        },
        {
          AttributeName: 'date',
          KeyType: 'RANGE'
        }
      ],
      Projection: {
        ProjectionType: 'ALL'
      },
      ProvisionedThroughput: {
        ReadCapacityUnits: 5,
        WriteCapacityUnits: 5
      }
    }
  ],
  ProvisionedThroughput: {
    ReadCapacityUnits: 5,
    WriteCapacityUnits: 5
  }
};

async function checkDynamoDBConnection() {
  try {
    await dynamodb.listTables().promise();
    log('✅ Successfully connected to local DynamoDB', 'green');
    return true;
  } catch (error) {
    log('❌ Failed to connect to local DynamoDB', 'red');
    log('Make sure DynamoDB Local is running on port 8001', 'yellow');
    log('Run: java -Djava.library.path=./DynamoDBLocal_lib -jar DynamoDBLocal.jar -sharedDb', 'blue');
    return false;
  }
}

async function tableExists() {
  try {
    await dynamodb.describeTable({ TableName: TABLE_NAME }).promise();
    return true;
  } catch (error) {
    if (error.code === 'ResourceNotFoundException') {
      return false;
    }
    throw error;
  }
}

async function createTable() {
  try {
    log(`📋 Creating table: ${TABLE_NAME}`, 'blue');
    
    const result = await dynamodb.createTable(tableSchema).promise();
    log('✅ Table created successfully', 'green');
    
    // Wait for table to become active
    log('⏳ Waiting for table to become active...', 'yellow');
    await dynamodb.waitFor('tableExists', { TableName: TABLE_NAME }).promise();
    log('✅ Table is now active', 'green');
    
    return result;
  } catch (error) {
    log('❌ Failed to create table', 'red');
    throw error;
  }
}

async function deleteTable() {
  try {
    log(`🗑️  Deleting table: ${TABLE_NAME}`, 'yellow');
    await dynamodb.deleteTable({ TableName: TABLE_NAME }).promise();
    log('✅ Table deleted successfully', 'green');
    
    // Wait for table to be deleted
    await dynamodb.waitFor('tableNotExists', { TableName: TABLE_NAME }).promise();
    log('✅ Table deletion confirmed', 'green');
  } catch (error) {
    if (error.code === 'ResourceNotFoundException') {
      log('⚠️  Table does not exist', 'yellow');
    } else {
      log('❌ Failed to delete table', 'red');
      throw error;
    }
  }
}

async function seedTestData() {
  const documentClient = new AWS.DynamoDB.DocumentClient({
    region: 'localhost',
    endpoint: 'http://localhost:8001',
    accessKeyId: 'fakeMyKeyId',
    secretAccessKey: 'fakeSecretAccessKey'
  });

  const testExpenses = [
    {
      userId: 'test-user-123',
      expenseId: 'exp_1700000001_abc123456',
      project: 'בניין מגורים גבעתיים',
      contractor: 'חברת בניה בע"מ',
      invoiceNum: 'INV-001',
      amount: 25000,
      paymentTerms: '30 ימים',
      paymentMethod: 'העברה בנקאית',
      date: '2024-01-15',
      description: 'עבודות בטון',
      status: 'pending',
      createdAt: '2024-01-15T08:00:00.000Z',
      updatedAt: '2024-01-15T08:00:00.000Z'
    },
    {
      userId: 'test-user-123',
      expenseId: 'exp_1700000002_def789012',
      project: 'בניין מגורים גבעתיים',
      contractor: 'אינסטלציה מקצועית',
      invoiceNum: 'INV-002',
      amount: 15000,
      paymentTerms: '15 ימים',
      paymentMethod: 'המחאה',
      date: '2024-01-20',
      description: 'התקנת צנרת מים',
      status: 'pending',
      createdAt: '2024-01-20T09:30:00.000Z',
      updatedAt: '2024-01-20T09:30:00.000Z'
    },
    {
      userId: 'test-user-123',
      expenseId: 'exp_1700000003_ghi345678',
      project: 'משרדים תל אביב',
      contractor: 'חשמלאי מוסמך',
      invoiceNum: 'INV-003',
      amount: 8500,
      paymentTerms: '30 ימים',
      paymentMethod: 'העברה בנקאית',
      date: '2024-01-25',
      description: 'התקנת מערכת חשמל',
      status: 'paid',
      createdAt: '2024-01-25T14:15:00.000Z',
      updatedAt: '2024-01-25T14:15:00.000Z'
    }
  ];

  try {
    log('🌱 Seeding test data...', 'blue');
    
    for (const expense of testExpenses) {
      await documentClient.put({
        TableName: TABLE_NAME,
        Item: expense
      }).promise();
    }
    
    log(`✅ Successfully added ${testExpenses.length} test expenses`, 'green');
  } catch (error) {
    log('❌ Failed to seed test data', 'red');
    throw error;
  }
}

async function listTables() {
  try {
    const result = await dynamodb.listTables().promise();
    log('\n📋 Local DynamoDB Tables:', 'blue');
    result.TableNames.forEach(name => {
      log(`  - ${name}`, 'green');
    });
    console.log();
  } catch (error) {
    log('❌ Failed to list tables', 'red');
    throw error;
  }
}

async function main() {
  const command = process.argv[2];
  
  log('\n' + '='.repeat(60), 'blue');
  log('🗄️  Local DynamoDB Setup Tool', 'blue');
  log('='.repeat(60) + '\n', 'blue');

  // Check connection first
  const isConnected = await checkDynamoDBConnection();
  if (!isConnected) {
    process.exit(1);
  }

  try {
    switch (command) {
      case 'create':
        if (await tableExists()) {
          log('⚠️  Table already exists. Use "reset" to recreate it.', 'yellow');
        } else {
          await createTable();
        }
        break;

      case 'delete':
        await deleteTable();
        break;

      case 'reset':
        if (await tableExists()) {
          await deleteTable();
        }
        await createTable();
        break;

      case 'seed':
        if (!(await tableExists())) {
          log('❌ Table does not exist. Run "create" first.', 'red');
          process.exit(1);
        }
        await seedTestData();
        break;

      case 'setup':
        // Full setup: create table and seed data
        if (await tableExists()) {
          log('⚠️  Table already exists. Skipping creation.', 'yellow');
        } else {
          await createTable();
        }
        await seedTestData();
        break;

      case 'list':
        await listTables();
        break;

      case 'status':
        if (await tableExists()) {
          const description = await dynamodb.describeTable({ TableName: TABLE_NAME }).promise();
          log(`✅ Table exists: ${TABLE_NAME}`, 'green');
          log(`   Status: ${description.Table.TableStatus}`, 'blue');
          log(`   Items: ${description.Table.ItemCount || 'Unknown'}`, 'blue');
        } else {
          log(`❌ Table does not exist: ${TABLE_NAME}`, 'red');
        }
        break;

      default:
        log('📋 Usage: node scripts/setup-local-dynamodb.js <command>', 'yellow');
        log('\nAvailable commands:', 'blue');
        log('  create    - Create the table', 'green');
        log('  delete    - Delete the table', 'green');
        log('  reset     - Delete and recreate the table', 'green');
        log('  seed      - Add test data to existing table', 'green');
        log('  setup     - Create table and add test data (full setup)', 'green');
        log('  list      - List all tables', 'green');
        log('  status    - Check table status', 'green');
        log('\nExamples:', 'yellow');
        log('  node scripts/setup-local-dynamodb.js setup', 'green');
        log('  node scripts/setup-local-dynamodb.js reset\n', 'green');
        break;
    }

    if (command && command !== 'list' && command !== 'status') {
      await listTables();
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.code) {
      console.error(`   Code: ${error.code}`);
    }
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  createTable,
  deleteTable,
  seedTestData,
  tableExists,
  TABLE_NAME
};