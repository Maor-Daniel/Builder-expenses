#!/usr/bin/env node

/**
 * DATA MIGRATION SCRIPT
 *
 * Migrates data from multi-table architecture to company-scoped architecture.
 *
 * Usage:
 *   node migrate-all-data.js --dry-run    # Test mode (no writes)
 *   node migrate-all-data.js --execute    # Execute actual migration
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const fs = require('fs');

const client = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(client);

const DRY_RUN = process.argv.includes('--dry-run');
const EXECUTE = process.argv.includes('--execute');

if (!DRY_RUN && !EXECUTE) {
  console.error('❌ ERROR: Must specify --dry-run or --execute');
  console.error('Usage:');
  console.error('  node migrate-all-data.js --dry-run    # Test mode');
  console.error('  node migrate-all-data.js --execute    # Actual migration');
  process.exit(1);
}

// Migration mapping
const MIGRATION_TABLES = [
  {
    source: 'construction-expenses-multi-table-expenses',
    target: 'construction-expenses-company-expenses',
    type: 'expense'
  },
  {
    source: 'construction-expenses-multi-table-projects',
    target: 'construction-expenses-company-projects',
    type: 'project'
  },
  {
    source: 'construction-expenses-multi-table-contractors',
    target: 'construction-expenses-company-contractors',
    type: 'contractor'
  },
  {
    source: 'construction-expenses-multi-table-works',
    target: 'construction-expenses-company-works',
    type: 'work'
  }
];

// Cache for userId → companyId mappings
const userToCompanyCache = {};

/**
 * Build userId → companyId mapping cache
 */
async function buildUserToCompanyCache() {
  console.log('  📋 Building userId → companyId mapping cache...');

  try {
    let items = [];
    let lastEvaluatedKey = undefined;

    do {
      const params = {
        TableName: 'construction-expenses-company-users',
        ExclusiveStartKey: lastEvaluatedKey
      };

      const response = await docClient.send(new ScanCommand(params));
      items.push(...(response.Items || []));
      lastEvaluatedKey = response.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    // Build cache
    items.forEach(item => {
      if (item.userId && item.companyId) {
        userToCompanyCache[item.userId] = item.companyId;
      }
    });

    console.log(`  ✓ Built cache with ${Object.keys(userToCompanyCache).length} mappings`);
  } catch (error) {
    console.warn(`  ⚠️  Error building cache: ${error.message}`);
  }
}

/**
 * Get userId → companyId mapping
 * Returns mapping from cache or uses userId as companyId if not found
 */
function getUserToCompanyMapping(userId) {
  if (userToCompanyCache[userId]) {
    return userToCompanyCache[userId];
  }

  // Fallback: use userId as companyId for single-user accounts
  console.log(`  ℹ️  No company mapping found for ${userId}, using userId as companyId`);
  return userId;
}

/**
 * Check if record already exists in target table
 */
async function recordExists(tableName, item, type) {
  try {
    let keyCondition;
    let attributeValues;

    switch (type) {
      case 'expense':
        keyCondition = 'companyId = :companyId AND expenseId = :expenseId';
        attributeValues = {
          ':companyId': item.companyId,
          ':expenseId': item.expenseId
        };
        break;
      case 'project':
        keyCondition = 'companyId = :companyId AND projectId = :projectId';
        attributeValues = {
          ':companyId': item.companyId,
          ':projectId': item.projectId
        };
        break;
      case 'contractor':
        keyCondition = 'companyId = :companyId AND contractorId = :contractorId';
        attributeValues = {
          ':companyId': item.companyId,
          ':contractorId': item.contractorId
        };
        break;
      case 'work':
        keyCondition = 'companyId = :companyId AND workId = :workId';
        attributeValues = {
          ':companyId': item.companyId,
          ':workId': item.workId
        };
        break;
      default:
        return false;
    }

    const params = {
      TableName: tableName,
      KeyConditionExpression: keyCondition,
      ExpressionAttributeValues: attributeValues,
      Limit: 1
    };

    const response = await docClient.send(new QueryCommand(params));
    return response.Items && response.Items.length > 0;
  } catch (error) {
    console.warn(`  ⚠️  Error checking if record exists: ${error.message}`);
    return false;
  }
}

/**
 * Transform record from multi-table to company-scoped schema
 */
function transformRecord(item, userId, companyId) {
  // Create new item with companyId as partition key
  const transformed = {
    ...item,
    companyId,
    migratedFrom: 'multi-table-architecture',
    migratedAt: new Date().toISOString()
  };

  // Keep userId for reference, but companyId is now the partition key
  // Note: userId might already exist in the item

  return transformed;
}

/**
 * Scan source table and return all items
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
  } while (lastEvaluatedKey);

  return items;
}

/**
 * Migrate a single table
 */
async function migrateTable(tableMapping) {
  console.log(`\n📦 Migrating: ${tableMapping.source} → ${tableMapping.target}`);

  try {
    // Scan source table
    console.log(`  📊 Scanning source table...`);
    const sourceItems = await scanTable(tableMapping.source);
    console.log(`  ✓ Found ${sourceItems.length} records in source`);

    if (sourceItems.length === 0) {
      console.log(`  ℹ️  No records to migrate`);
      return {
        table: tableMapping.source,
        totalRecords: 0,
        migrated: 0,
        skipped: 0,
        errors: 0
      };
    }

    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    // Process each record
    for (const item of sourceItems) {
      try {
        const userId = item.userId;
        if (!userId) {
          console.log(`  ⚠️  Skipping record without userId:`, JSON.stringify(item));
          skipped++;
          continue;
        }

        // Get companyId mapping
        const companyId = getUserToCompanyMapping(userId);

        // Transform record
        const transformed = transformRecord(item, userId, companyId);

        // Check if already exists
        const exists = await recordExists(tableMapping.target, transformed, tableMapping.type);
        if (exists) {
          console.log(`  ⏭️  Skipping (already exists): ${tableMapping.type} for companyId=${companyId}`);
          skipped++;
          continue;
        }

        // Write to target table (if EXECUTE mode)
        if (EXECUTE) {
          const putParams = {
            TableName: tableMapping.target,
            Item: transformed
          };

          await docClient.send(new PutCommand(putParams));
          console.log(`  ✅ Migrated: ${tableMapping.type} from userId=${userId} to companyId=${companyId}`);
        } else {
          console.log(`  [DRY RUN] Would migrate: ${tableMapping.type} from userId=${userId} to companyId=${companyId}`);
        }

        migrated++;
      } catch (error) {
        console.error(`  ❌ Error migrating record:`, error.message);
        console.error(`     Record:`, JSON.stringify(item));
        errors++;
      }
    }

    return {
      table: tableMapping.source,
      totalRecords: sourceItems.length,
      migrated,
      skipped,
      errors
    };
  } catch (error) {
    console.error(`  ❌ Error migrating table:`, error.message);
    return {
      table: tableMapping.source,
      totalRecords: 0,
      migrated: 0,
      skipped: 0,
      errors: 1,
      error: error.message
    };
  }
}

/**
 * Main migration function
 */
async function main() {
  const mode = DRY_RUN ? 'DRY RUN' : 'EXECUTE';
  console.log('🔄 DATA MIGRATION STARTING');
  console.log(`📋 Mode: ${mode}`);
  console.log(`⏰ Started at: ${new Date().toISOString()}\n`);

  if (DRY_RUN) {
    console.log('⚠️  DRY RUN MODE: No data will be written to target tables');
    console.log('   This is a test run to validate transformations\n');
  } else {
    console.log('⚠️  EXECUTE MODE: Data WILL BE WRITTEN to target tables');
    console.log('   Ensure backups are complete before proceeding\n');
  }

  // Build userId → companyId mapping cache
  console.log('🔗 Building user-to-company mapping cache...');
  await buildUserToCompanyCache();

  const results = [];

  // Migrate each table
  for (const tableMapping of MIGRATION_TABLES) {
    const result = await migrateTable(tableMapping);
    results.push(result);
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 MIGRATION SUMMARY');
  console.log('='.repeat(80));

  const totalRecords = results.reduce((sum, r) => sum + r.totalRecords, 0);
  const totalMigrated = results.reduce((sum, r) => sum + r.migrated, 0);
  const totalSkipped = results.reduce((sum, r) => sum + r.skipped, 0);
  const totalErrors = results.reduce((sum, r) => sum + r.errors, 0);

  console.log(`Mode: ${mode}`);
  console.log(`Total records found: ${totalRecords}`);
  console.log(`Records migrated: ${totalMigrated}`);
  console.log(`Records skipped: ${totalSkipped}`);
  console.log(`Errors: ${totalErrors}`);

  console.log('\nPer-Table Results:');
  results.forEach(r => {
    console.log(`  ${r.table}:`);
    console.log(`    Total: ${r.totalRecords}, Migrated: ${r.migrated}, Skipped: ${r.skipped}, Errors: ${r.errors}`);
    if (r.error) {
      console.log(`    Error: ${r.error}`);
    }
  });

  // Save results
  const reportPath = `/Users/maordaniel/Ofek/migration-results-${DRY_RUN ? 'dry-run' : 'execute'}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  fs.writeFileSync(reportPath, JSON.stringify({
    mode,
    timestamp: new Date().toISOString(),
    results,
    summary: {
      totalRecords,
      totalMigrated,
      totalSkipped,
      totalErrors
    }
  }, null, 2));

  console.log(`\n📄 Results saved to: ${reportPath}`);
  console.log('='.repeat(80));

  if (DRY_RUN) {
    console.log('\n✅ DRY RUN COMPLETE - Review results and run with --execute to migrate data');
  } else {
    console.log('\n✅ MIGRATION COMPLETE');
  }

  if (totalErrors > 0) {
    console.error(`\n⚠️  WARNING: ${totalErrors} errors occurred during migration`);
    process.exit(1);
  }

  process.exit(0);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
