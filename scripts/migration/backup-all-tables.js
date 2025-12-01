#!/usr/bin/env node

/**
 * BACKUP ALL DYNAMODB TABLES
 *
 * This script creates a complete backup of all DynamoDB tables before migration.
 * It exports:
 * - All table data to JSON files
 * - Table schemas and metadata
 * - GSI configurations
 * - Record counts
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, DescribeTableCommand } = require('@aws-sdk/lib-dynamodb');
const fs = require('fs');
const path = require('path');

const client = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(client);

const BACKUP_DIR = process.argv[2] || '/Users/maordaniel/Ofek/backups/migration-backup-20251201-113926';

// All existing tables to backup (discovered via aws dynamodb list-tables)
const TABLES = [
  // Multi-table architecture (5 tables)
  'construction-expenses-multi-table-expenses',
  'construction-expenses-multi-table-projects',
  'construction-expenses-multi-table-contractors',
  'construction-expenses-multi-table-works',
  'construction-expenses-multi-table-users',

  // Company-scoped architecture (5 tables)
  'construction-expenses-company-expenses',
  'construction-expenses-company-projects',
  'construction-expenses-company-contractors',
  'construction-expenses-company-works',
  'construction-expenses-company-users',

  // Shared tables (6 tables)
  'construction-expenses-companies',
  'construction-expenses-invitations',
  'construction-expenses-paddle-customers',
  'construction-expenses-paddle-payments',
  'construction-expenses-paddle-subscriptions',
  'construction-expenses-paddle-webhooks',

  // Legacy production table (1 table)
  'construction-expenses-production-table'
];

/**
 * Scan all items from a table
 */
async function scanTable(tableName) {
  const items = [];
  let lastEvaluatedKey = undefined;

  do {
    const params = {
      TableName: tableName,
      ExclusiveStartKey: lastEvaluatedKey
    };

    const response = await docClient.send(new ScanCommand(params));
    items.push(...(response.Items || []));
    lastEvaluatedKey = response.LastEvaluatedKey;

    console.log(`  Scanned ${items.length} items from ${tableName}...`);
  } while (lastEvaluatedKey);

  return items;
}

/**
 * Get table description (schema, GSIs, etc.)
 */
async function describeTable(tableName) {
  try {
    const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
    const { DescribeTableCommand } = require('@aws-sdk/client-dynamodb');

    const client = new DynamoDBClient({ region: 'us-east-1' });
    const response = await client.send(new DescribeTableCommand({ TableName: tableName }));

    return {
      tableName: response.Table.TableName,
      keySchema: response.Table.KeySchema,
      attributeDefinitions: response.Table.AttributeDefinitions,
      globalSecondaryIndexes: response.Table.GlobalSecondaryIndexes || [],
      billingMode: response.Table.BillingModeSummary?.BillingMode || 'PROVISIONED',
      itemCount: response.Table.ItemCount,
      tableStatus: response.Table.TableStatus,
      creationDateTime: response.Table.CreationDateTime
    };
  } catch (error) {
    console.error(`Error describing table ${tableName}:`, error.message);
    return { error: error.message };
  }
}

/**
 * Backup a single table
 */
async function backupTable(tableName) {
  console.log(`\n📦 Backing up: ${tableName}`);

  try {
    // Get table metadata
    console.log(`  Getting table description...`);
    const metadata = await describeTable(tableName);

    // Scan all items
    console.log(`  Scanning all items...`);
    const items = await scanTable(tableName);

    const backup = {
      tableName,
      backupTimestamp: new Date().toISOString(),
      metadata,
      recordCount: items.length,
      items
    };

    // Save to file
    const filename = path.join(BACKUP_DIR, `${tableName}.json`);
    fs.writeFileSync(filename, JSON.stringify(backup, null, 2));

    console.log(`  ✅ Backed up ${items.length} records to ${filename}`);

    return {
      tableName,
      recordCount: items.length,
      success: true
    };
  } catch (error) {
    console.error(`  ❌ Error backing up ${tableName}:`, error.message);
    return {
      tableName,
      recordCount: 0,
      success: false,
      error: error.message
    };
  }
}

/**
 * Main backup function
 */
async function main() {
  console.log('🔄 DYNAMODB BACKUP STARTING');
  console.log(`📁 Backup directory: ${BACKUP_DIR}`);
  console.log(`📊 Tables to backup: ${TABLES.length}`);
  console.log(`⏰ Started at: ${new Date().toISOString()}\n`);

  // Ensure backup directory exists
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const results = [];

  // Backup each table
  for (const tableName of TABLES) {
    const result = await backupTable(tableName);
    results.push(result);
  }

  // Create summary report
  const summary = {
    backupTimestamp: new Date().toISOString(),
    backupDirectory: BACKUP_DIR,
    totalTables: TABLES.length,
    successfulBackups: results.filter(r => r.success).length,
    failedBackups: results.filter(r => !r.success).length,
    totalRecords: results.reduce((sum, r) => sum + r.recordCount, 0),
    results
  };

  // Save summary
  const summaryFile = path.join(BACKUP_DIR, '_BACKUP_SUMMARY.json');
  fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));

  console.log('\n' + '='.repeat(80));
  console.log('📊 BACKUP SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total tables: ${summary.totalTables}`);
  console.log(`Successful: ${summary.successfulBackups}`);
  console.log(`Failed: ${summary.failedBackups}`);
  console.log(`Total records backed up: ${summary.totalRecords}`);
  console.log(`Summary saved to: ${summaryFile}`);
  console.log('='.repeat(80));

  if (summary.failedBackups > 0) {
    console.log('\n❌ SOME BACKUPS FAILED:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`  - ${r.tableName}: ${r.error}`);
    });
    process.exit(1);
  } else {
    console.log('\n✅ ALL BACKUPS COMPLETED SUCCESSFULLY!');
    process.exit(0);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
