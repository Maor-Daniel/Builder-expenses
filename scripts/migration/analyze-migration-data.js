#!/usr/bin/env node

/**
 * ANALYZE MIGRATION DATA
 *
 * This script analyzes the backed-up data to understand:
 * - What needs to be migrated (multi-table → company-scoped)
 * - What is already correct (company-scoped data)
 * - What can be deleted (production-table legacy data)
 * - userId → companyId mappings
 */

const fs = require('fs');
const path = require('path');

const BACKUP_DIR = '/Users/maordaniel/Ofek/backups/migration-backup-20251201-113926';

/**
 * Load backup file
 */
function loadBackup(tableName) {
  const filePath = path.join(BACKUP_DIR, `${tableName}.json`);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * Analyze multi-table architecture data
 */
function analyzeMultiTableData() {
  console.log('\n' + '='.repeat(80));
  console.log('📊 MULTI-TABLE ARCHITECTURE ANALYSIS');
  console.log('='.repeat(80));

  const tables = {
    expenses: loadBackup('construction-expenses-multi-table-expenses'),
    projects: loadBackup('construction-expenses-multi-table-projects'),
    contractors: loadBackup('construction-expenses-multi-table-contractors'),
    works: loadBackup('construction-expenses-multi-table-works'),
    users: loadBackup('construction-expenses-multi-table-users')
  };

  let totalRecords = 0;
  const userIds = new Set();

  console.log('\nTable Record Counts:');
  for (const [name, backup] of Object.entries(tables)) {
    if (backup) {
      console.log(`  ${name}: ${backup.recordCount} records`);
      totalRecords += backup.recordCount;

      // Extract userIds
      backup.items.forEach(item => {
        if (item.userId) userIds.add(item.userId);
      });
    }
  }

  console.log(`\nTotal records to migrate: ${totalRecords}`);
  console.log(`Unique userIds found: ${userIds.size}`);
  console.log(`UserIds: ${Array.from(userIds).join(', ')}`);

  // Sample data
  console.log('\n📋 Sample Records:');
  if (tables.expenses && tables.expenses.items.length > 0) {
    console.log('\nExpense Sample:');
    console.log(JSON.stringify(tables.expenses.items[0], null, 2));
  }
  if (tables.projects && tables.projects.items.length > 0) {
    console.log('\nProject Sample:');
    console.log(JSON.stringify(tables.projects.items[0], null, 2));
  }

  return { totalRecords, userIds: Array.from(userIds), tables };
}

/**
 * Analyze company-scoped architecture data
 */
function analyzeCompanyScopedData() {
  console.log('\n' + '='.repeat(80));
  console.log('📊 COMPANY-SCOPED ARCHITECTURE ANALYSIS');
  console.log('='.repeat(80));

  const tables = {
    expenses: loadBackup('construction-expenses-company-expenses'),
    projects: loadBackup('construction-expenses-company-projects'),
    contractors: loadBackup('construction-expenses-company-contractors'),
    works: loadBackup('construction-expenses-company-works'),
    users: loadBackup('construction-expenses-company-users'),
    companies: loadBackup('construction-expenses-companies')
  };

  let totalRecords = 0;
  const companyIds = new Set();

  console.log('\nTable Record Counts:');
  for (const [name, backup] of Object.entries(tables)) {
    if (backup) {
      console.log(`  ${name}: ${backup.recordCount} records`);
      totalRecords += backup.recordCount;

      // Extract companyIds
      backup.items.forEach(item => {
        if (item.companyId) companyIds.add(item.companyId);
      });
    }
  }

  console.log(`\nTotal records (already correct): ${totalRecords}`);
  console.log(`Unique companyIds found: ${companyIds.size}`);
  console.log(`CompanyIds: ${Array.from(companyIds).join(', ')}`);

  // Analyze companies table
  if (tables.companies) {
    console.log('\n🏢 Companies:');
    tables.companies.items.forEach(company => {
      console.log(`  - ${company.companyId}: ${company.companyName || 'Unnamed'} (owner: ${company.ownerId})`);
    });
  }

  // Sample data
  console.log('\n📋 Sample Records:');
  if (tables.expenses && tables.expenses.items.length > 0) {
    console.log('\nExpense Sample:');
    console.log(JSON.stringify(tables.expenses.items[0], null, 2));
  }

  return { totalRecords, companyIds: Array.from(companyIds), tables };
}

/**
 * Analyze user to company mappings
 */
function analyzeUserToCompanyMappings() {
  console.log('\n' + '='.repeat(80));
  console.log('🔗 USER → COMPANY MAPPINGS');
  console.log('='.repeat(80));

  const companyUsers = loadBackup('construction-expenses-company-users');
  const companies = loadBackup('construction-expenses-companies');

  if (!companyUsers || !companies) {
    console.log('⚠️  Cannot analyze mappings - missing data');
    return {};
  }

  const mappings = {};

  // Build userId → companyId mapping
  companyUsers.items.forEach(user => {
    if (user.userId && user.companyId) {
      mappings[user.userId] = user.companyId;
    }
  });

  console.log('\nUser → Company Mappings:');
  for (const [userId, companyId] of Object.entries(mappings)) {
    const company = companies.items.find(c => c.companyId === companyId);
    console.log(`  ${userId} → ${companyId} (${company?.companyName || 'Unknown'})`);
  }

  return mappings;
}

/**
 * Analyze production-table legacy data
 */
function analyzeProductionTableData() {
  console.log('\n' + '='.repeat(80));
  console.log('📊 PRODUCTION-TABLE LEGACY DATA');
  console.log('='.repeat(80));

  const productionTable = loadBackup('construction-expenses-production-table');

  if (!productionTable) {
    console.log('⚠️  No production-table data found');
    return null;
  }

  console.log(`\nTotal records: ${productionTable.recordCount}`);

  if (productionTable.items.length > 0) {
    console.log('\n📋 Sample Records:');
    productionTable.items.forEach((item, idx) => {
      console.log(`\nRecord ${idx + 1}:`);
      console.log(JSON.stringify(item, null, 2));
    });
  }

  return productionTable;
}

/**
 * Generate migration plan
 */
function generateMigrationPlan(multiTableAnalysis, companyScopedAnalysis, userToCompanyMappings) {
  console.log('\n' + '='.repeat(80));
  console.log('📋 MIGRATION PLAN');
  console.log('='.repeat(80));

  const plan = {
    recordsToMigrate: multiTableAnalysis.totalRecords,
    recordsAlreadyCorrect: companyScopedAnalysis.totalRecords,
    userIds: multiTableAnalysis.userIds,
    companyIds: companyScopedAnalysis.companyIds,
    userToCompanyMappings,
    migrationSteps: []
  };

  // For each userId in multi-table data
  multiTableAnalysis.userIds.forEach(userId => {
    const companyId = userToCompanyMappings[userId] || userId; // Fallback: use userId as companyId

    plan.migrationSteps.push({
      userId,
      companyId,
      mappingSource: userToCompanyMappings[userId] ? 'company-users table' : 'fallback (userId as companyId)',
      tables: [
        {
          source: 'construction-expenses-multi-table-expenses',
          target: 'construction-expenses-company-expenses',
          filter: { userId }
        },
        {
          source: 'construction-expenses-multi-table-projects',
          target: 'construction-expenses-company-projects',
          filter: { userId }
        },
        {
          source: 'construction-expenses-multi-table-contractors',
          target: 'construction-expenses-company-contractors',
          filter: { userId }
        },
        {
          source: 'construction-expenses-multi-table-works',
          target: 'construction-expenses-company-works',
          filter: { userId }
        }
      ]
    });
  });

  console.log('\nMigration Summary:');
  console.log(`  Records to migrate: ${plan.recordsToMigrate}`);
  console.log(`  Records already correct: ${plan.recordsAlreadyCorrect}`);
  console.log(`  UserIds to migrate: ${plan.userIds.length}`);
  console.log(`  Target companies: ${plan.companyIds.length + plan.userIds.filter(uid => !userToCompanyMappings[uid]).length}`);

  console.log('\n📝 Migration Steps:');
  plan.migrationSteps.forEach((step, idx) => {
    console.log(`\n  Step ${idx + 1}: Migrate userId=${step.userId} → companyId=${step.companyId}`);
    console.log(`    Mapping source: ${step.mappingSource}`);
    console.log(`    Tables to migrate:`);
    step.tables.forEach(table => {
      console.log(`      - ${table.source} → ${table.target}`);
    });
  });

  return plan;
}

/**
 * Main analysis function
 */
async function main() {
  console.log('🔍 MIGRATION DATA ANALYSIS');
  console.log('⏰ Started at:', new Date().toISOString());

  // Analyze each architecture
  const multiTableAnalysis = analyzeMultiTableData();
  const companyScopedAnalysis = analyzeCompanyScopedData();
  const userToCompanyMappings = analyzeUserToCompanyMappings();
  const productionTableAnalysis = analyzeProductionTableData();

  // Generate migration plan
  const migrationPlan = generateMigrationPlan(
    multiTableAnalysis,
    companyScopedAnalysis,
    userToCompanyMappings
  );

  // Save report
  const reportTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const report = {
    timestamp: new Date().toISOString(),
    backupDirectory: BACKUP_DIR,
    multiTableAnalysis,
    companyScopedAnalysis,
    userToCompanyMappings,
    productionTableAnalysis,
    migrationPlan
  };

  const reportPath = `/Users/maordaniel/Ofek/migration-report-${reportTimestamp}.json`;
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log('\n' + '='.repeat(80));
  console.log('✅ ANALYSIS COMPLETE');
  console.log('='.repeat(80));
  console.log(`Report saved to: ${reportPath}`);
  console.log('⏰ Completed at:', new Date().toISOString());
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
