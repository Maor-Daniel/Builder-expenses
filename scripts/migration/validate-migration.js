#!/usr/bin/env node

/**
 * VALIDATE MIGRATION
 *
 * Verifies that all data was successfully migrated from multi-table to company-scoped architecture.
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const fs = require('fs');

const client = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(client);

const VALIDATION_TABLES = [
  {
    source: 'construction-expenses-multi-table-expenses',
    target: 'construction-expenses-company-expenses',
    type: 'expense',
    idField: 'expenseId'
  },
  {
    source: 'construction-expenses-multi-table-projects',
    target: 'construction-expenses-company-projects',
    type: 'project',
    idField: 'projectId'
  },
  {
    source: 'construction-expenses-multi-table-contractors',
    target: 'construction-expenses-company-contractors',
    type: 'contractor',
    idField: 'contractorId'
  },
  {
    source: 'construction-expenses-multi-table-works',
    target: 'construction-expenses-company-works',
    type: 'work',
    idField: 'workId'
  }
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
  } while (lastEvaluatedKey);

  return items;
}

/**
 * Query target table for specific record
 */
async function findRecordInTarget(tableName, companyId, idField, idValue) {
  try {
    const params = {
      TableName: tableName,
      KeyConditionExpression: `companyId = :companyId AND ${idField} = :id`,
      ExpressionAttributeValues: {
        ':companyId': companyId,
        ':id': idValue
      }
    };

    const response = await docClient.send(new QueryCommand(params));
    return response.Items && response.Items.length > 0 ? response.Items[0] : null;
  } catch (error) {
    console.error(`  ❌ Error querying target table: ${error.message}`);
    return null;
  }
}

/**
 * Validate a single table migration
 */
async function validateTable(tableMapping) {
  console.log(`\n📊 Validating: ${tableMapping.source} → ${tableMapping.target}`);

  try {
    // Get all source records
    console.log(`  🔍 Scanning source table...`);
    const sourceRecords = await scanTable(tableMapping.source);
    console.log(`  ✓ Found ${sourceRecords.length} records in source`);

    if (sourceRecords.length === 0) {
      console.log(`  ℹ️  No records to validate`);
      return {
        table: tableMapping.source,
        totalSource: 0,
        found: 0,
        missing: 0,
        mismatch: 0,
        success: true
      };
    }

    // Get all target records for comparison
    console.log(`  🔍 Scanning target table...`);
    const targetRecords = await scanTable(tableMapping.target);
    const migratedRecords = targetRecords.filter(r => r.migratedFrom === 'multi-table-architecture');
    console.log(`  ✓ Found ${migratedRecords.length} migrated records in target`);

    let found = 0;
    let missing = 0;
    let mismatch = 0;
    const missingRecords = [];
    const mismatchRecords = [];

    // Validate each source record exists in target
    for (const sourceRecord of sourceRecords) {
      const userId = sourceRecord.userId;
      const companyId = userId; // We used userId as companyId for test-user-123
      const recordId = sourceRecord[tableMapping.idField];

      // Find in target
      const targetRecord = await findRecordInTarget(
        tableMapping.target,
        companyId,
        tableMapping.idField,
        recordId
      );

      if (!targetRecord) {
        console.log(`  ❌ MISSING: ${tableMapping.type} with ${tableMapping.idField}=${recordId}`);
        missing++;
        missingRecords.push({ userId, recordId });
        continue;
      }

      // Verify key fields match
      const sourceKeys = Object.keys(sourceRecord).filter(k => !['migratedFrom', 'migratedAt'].includes(k)).sort();
      const targetKeys = Object.keys(targetRecord).filter(k => !['migratedFrom', 'migratedAt', 'companyId'].includes(k)).sort();

      // Check if all source fields exist in target
      let fieldsMatch = true;
      for (const key of sourceKeys) {
        if (key !== 'companyId' && sourceRecord[key] !== targetRecord[key]) {
          fieldsMatch = false;
          break;
        }
      }

      if (!fieldsMatch) {
        console.log(`  ⚠️  MISMATCH: ${tableMapping.type} with ${tableMapping.idField}=${recordId}`);
        mismatch++;
        mismatchRecords.push({ userId, recordId, sourceRecord, targetRecord });
      } else {
        found++;
      }
    }

    const allValid = missing === 0 && mismatch === 0;

    if (allValid) {
      console.log(`  ✅ All ${sourceRecords.length} records validated successfully`);
    } else {
      console.log(`  ⚠️  Validation issues found:`);
      console.log(`     Found: ${found}, Missing: ${missing}, Mismatch: ${mismatch}`);
    }

    return {
      table: tableMapping.source,
      totalSource: sourceRecords.length,
      found,
      missing,
      mismatch,
      missingRecords,
      mismatchRecords,
      success: allValid
    };
  } catch (error) {
    console.error(`  ❌ Error validating table: ${error.message}`);
    return {
      table: tableMapping.source,
      totalSource: 0,
      found: 0,
      missing: 0,
      mismatch: 0,
      success: false,
      error: error.message
    };
  }
}

/**
 * Main validation function
 */
async function main() {
  console.log('🔍 MIGRATION VALIDATION STARTING');
  console.log(`⏰ Started at: ${new Date().toISOString()}\n`);

  const results = [];

  // Validate each table
  for (const tableMapping of VALIDATION_TABLES) {
    const result = await validateTable(tableMapping);
    results.push(result);
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 VALIDATION SUMMARY');
  console.log('='.repeat(80));

  const totalSource = results.reduce((sum, r) => sum + r.totalSource, 0);
  const totalFound = results.reduce((sum, r) => sum + r.found, 0);
  const totalMissing = results.reduce((sum, r) => sum + r.missing, 0);
  const totalMismatch = results.reduce((sum, r) => sum + r.mismatch, 0);
  const allSuccess = results.every(r => r.success);

  console.log(`Total source records: ${totalSource}`);
  console.log(`Successfully migrated: ${totalFound}`);
  console.log(`Missing in target: ${totalMissing}`);
  console.log(`Mismatched data: ${totalMismatch}`);

  console.log('\nPer-Table Results:');
  results.forEach(r => {
    const status = r.success ? '✅' : '❌';
    console.log(`  ${status} ${r.table}: ${r.found}/${r.totalSource} valid`);
    if (r.missing > 0) {
      console.log(`     Missing: ${r.missing} records`);
    }
    if (r.mismatch > 0) {
      console.log(`     Mismatched: ${r.mismatch} records`);
    }
    if (r.error) {
      console.log(`     Error: ${r.error}`);
    }
  });

  // Save report
  const reportPath = `/Users/maordaniel/Ofek/migration-validation-report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    results,
    summary: {
      totalSource,
      totalFound,
      totalMissing,
      totalMismatch,
      allSuccess
    }
  }, null, 2));

  console.log(`\n📄 Validation report saved to: ${reportPath}`);
  console.log('='.repeat(80));

  if (allSuccess) {
    console.log('\n✅ VALIDATION SUCCESSFUL - All records migrated correctly!');
    process.exit(0);
  } else {
    console.error('\n❌ VALIDATION FAILED - Some records missing or mismatched');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
