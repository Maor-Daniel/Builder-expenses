#!/usr/bin/env node
/**
 * Migration Script: Add Default Project & Contractor to Existing Companies
 *
 * Fixes companies created via Paddle webhook before the fix was deployed.
 * These companies are missing:
 * - General Expenses project (הוצאות כלליות)
 * - General Contractor (ספק כללי)
 *
 * Usage:
 *   node scripts/migrate-default-entities.js --dry-run  # Preview changes
 *   node scripts/migrate-default-entities.js --execute  # Apply changes
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, QueryCommand, GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');

const REGION = 'us-east-1';
const TABLE_PREFIX = 'construction-expenses';

// System constants (must match lambda/shared/company-utils.js)
const SYSTEM_PROJECTS = {
  GENERAL_EXPENSES: {
    projectId: 'proj_GENERAL_EXPENSES',
    name: 'הוצאות כלליות',
    description: 'הוצאות שאינן משויכות לפרויקט ספציפי',
    isSystemProject: true
  }
};

const SYSTEM_CONTRACTORS = {
  GENERAL_CONTRACTOR: {
    contractorId: 'cont_GENERAL',
    name: 'ספק כללי',
    description: 'ספק ברירת מחדל עבור הוצאות ללא ספק מזוהה',
    isSystemContractor: true
  }
};

const COMPANY_TABLE_NAMES = {
  COMPANIES: `${TABLE_PREFIX}-companies`,
  USERS: `${TABLE_PREFIX}-company-users`,
  PROJECTS: `${TABLE_PREFIX}-company-projects`,
  CONTRACTORS: `${TABLE_PREFIX}-company-contractors`
};

// Initialize DynamoDB client
const client = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(client);

function getCurrentTimestamp() {
  return new Date().toISOString();
}

async function scanAllCompanies() {
  console.log(`\n📊 Scanning ${COMPANY_TABLE_NAMES.COMPANIES}...`);

  const companies = [];
  let lastEvaluatedKey = undefined;

  do {
    const params = {
      TableName: COMPANY_TABLE_NAMES.COMPANIES,
      ExclusiveStartKey: lastEvaluatedKey
    };

    const response = await docClient.send(new ScanCommand(params));
    companies.push(...response.Items);
    lastEvaluatedKey = response.LastEvaluatedKey;

    process.stdout.write(`\r   Found ${companies.length} companies...`);
  } while (lastEvaluatedKey);

  console.log(`\n✅ Scan complete: ${companies.length} companies found\n`);
  return companies;
}

async function checkDefaultProject(companyId) {
  try {
    const response = await docClient.send(new GetCommand({
      TableName: COMPANY_TABLE_NAMES.PROJECTS,
      Key: {
        companyId,
        projectId: SYSTEM_PROJECTS.GENERAL_EXPENSES.projectId
      }
    }));

    return !!response.Item;
  } catch (error) {
    console.error(`   ⚠️ Error checking project for ${companyId}:`, error.message);
    return false;
  }
}

async function checkDefaultContractor(companyId) {
  try {
    const response = await docClient.send(new GetCommand({
      TableName: COMPANY_TABLE_NAMES.CONTRACTORS,
      Key: {
        companyId,
        contractorId: SYSTEM_CONTRACTORS.GENERAL_CONTRACTOR.contractorId
      }
    }));

    return !!response.Item;
  } catch (error) {
    console.error(`   ⚠️ Error checking contractor for ${companyId}:`, error.message);
    return false;
  }
}

async function getCompanyAdminUser(companyId) {
  // Get the first admin user for this company (to use as userId for system entities)
  try {
    const response = await docClient.send(new QueryCommand({
      TableName: COMPANY_TABLE_NAMES.USERS,
      KeyConditionExpression: 'companyId = :companyId',
      FilterExpression: '#role = :role',
      ExpressionAttributeNames: {
        '#role': 'role'
      },
      ExpressionAttributeValues: {
        ':companyId': companyId,
        ':role': 'admin'
      },
      Limit: 1
    }));

    return response.Items && response.Items.length > 0 ? response.Items[0].userId : null;
  } catch (error) {
    console.error(`   ⚠️ Error getting admin user for ${companyId}:`, error.message);
    return null;
  }
}

async function createDefaultProject(companyId, userId, dryRun = true) {
  const timestamp = getCurrentTimestamp();

  const generalExpensesProject = {
    companyId,
    projectId: SYSTEM_PROJECTS.GENERAL_EXPENSES.projectId,
    userId: userId,
    name: SYSTEM_PROJECTS.GENERAL_EXPENSES.name,
    description: SYSTEM_PROJECTS.GENERAL_EXPENSES.description,
    isSystemProject: true,
    startDate: timestamp.substring(0, 10), // YYYY-MM-DD format
    endDate: null,
    status: 'active',
    budget: 0,
    spentAmount: 0,
    location: '',
    clientName: '',
    createdAt: timestamp,
    updatedAt: timestamp
  };

  if (dryRun) {
    console.log(`   [DRY RUN] Would create project: ${SYSTEM_PROJECTS.GENERAL_EXPENSES.name}`);
    return true;
  }

  try {
    await docClient.send(new PutCommand({
      TableName: COMPANY_TABLE_NAMES.PROJECTS,
      Item: generalExpensesProject,
      ConditionExpression: 'attribute_not_exists(projectId)' // Only create if doesn't exist
    }));

    console.log(`   ✅ Created project: ${SYSTEM_PROJECTS.GENERAL_EXPENSES.name}`);
    return true;
  } catch (error) {
    if (error.name === 'ConditionalCheckFailedException') {
      console.log(`   ℹ️ Project already exists (race condition avoided)`);
      return true;
    }
    console.error(`   ❌ Failed to create project:`, error.message);
    return false;
  }
}

async function createDefaultContractor(companyId, userId, dryRun = true) {
  const timestamp = getCurrentTimestamp();

  const generalContractor = {
    companyId,
    contractorId: SYSTEM_CONTRACTORS.GENERAL_CONTRACTOR.contractorId,
    userId: userId,
    name: SYSTEM_CONTRACTORS.GENERAL_CONTRACTOR.name,
    contactPerson: '',
    phone: '',
    email: '',
    address: '',
    specialty: 'כללי',
    licenseNumber: '',
    taxId: '',
    paymentTerms: '',
    notes: SYSTEM_CONTRACTORS.GENERAL_CONTRACTOR.description,
    isSystemContractor: true,
    status: 'active',
    rating: null,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  if (dryRun) {
    console.log(`   [DRY RUN] Would create contractor: ${SYSTEM_CONTRACTORS.GENERAL_CONTRACTOR.name}`);
    return true;
  }

  try {
    await docClient.send(new PutCommand({
      TableName: COMPANY_TABLE_NAMES.CONTRACTORS,
      Item: generalContractor,
      ConditionExpression: 'attribute_not_exists(contractorId)' // Only create if doesn't exist
    }));

    console.log(`   ✅ Created contractor: ${SYSTEM_CONTRACTORS.GENERAL_CONTRACTOR.name}`);
    return true;
  } catch (error) {
    if (error.name === 'ConditionalCheckFailedException') {
      console.log(`   ℹ️ Contractor already exists (race condition avoided)`);
      return true;
    }
    console.error(`   ❌ Failed to create contractor:`, error.message);
    return false;
  }
}

async function migrateCompany(company, dryRun = true) {
  const companyId = company.companyId;
  const companyName = company.name || 'Unknown';

  console.log(`\n📦 Company: ${companyName} (${companyId})`);

  // Get admin user for this company
  const adminUserId = await getCompanyAdminUser(companyId);
  if (!adminUserId) {
    console.log(`   ⚠️ No admin user found - skipping`);
    return { skipped: true };
  }

  // Check what's missing
  const hasProject = await checkDefaultProject(companyId);
  const hasContractor = await checkDefaultContractor(companyId);

  if (hasProject && hasContractor) {
    console.log(`   ✅ Already has all defaults - no action needed`);
    return { alreadyComplete: true };
  }

  let created = 0;

  // Create missing project
  if (!hasProject) {
    const success = await createDefaultProject(companyId, adminUserId, dryRun);
    if (success) created++;
  } else {
    console.log(`   ✅ Already has default project`);
  }

  // Create missing contractor
  if (!hasContractor) {
    const success = await createDefaultContractor(companyId, adminUserId, dryRun);
    if (success) created++;
  } else {
    console.log(`   ✅ Already has default contractor`);
  }

  return { created };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--execute');

  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Migration: Add Default Project & Contractor to Companies     ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  if (dryRun) {
    console.log('\n⚠️  DRY RUN MODE - No changes will be made');
    console.log('   Run with --execute to apply changes\n');
  } else {
    console.log('\n🚀 EXECUTE MODE - Changes will be applied\n');
  }

  console.log(`Region: ${REGION}`);
  console.log(`Tables: ${TABLE_PREFIX}-*\n`);

  try {
    // Scan all companies
    const companies = await scanAllCompanies();

    if (companies.length === 0) {
      console.log('No companies found. Exiting.');
      return;
    }

    // Migrate each company
    let stats = {
      total: companies.length,
      alreadyComplete: 0,
      migrated: 0,
      skipped: 0,
      entitiesCreated: 0
    };

    for (const company of companies) {
      const result = await migrateCompany(company, dryRun);

      if (result.alreadyComplete) {
        stats.alreadyComplete++;
      } else if (result.skipped) {
        stats.skipped++;
      } else if (result.created !== undefined) {
        stats.migrated++;
        stats.entitiesCreated += result.created;
      }
    }

    // Print summary
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║                      Migration Summary                         ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    console.log(`Total companies scanned:     ${stats.total}`);
    console.log(`Already complete:            ${stats.alreadyComplete}`);
    console.log(`Migrated:                    ${stats.migrated}`);
    console.log(`Skipped (no admin):          ${stats.skipped}`);
    console.log(`Entities created:            ${stats.entitiesCreated}`);

    if (dryRun && stats.migrated > 0) {
      console.log('\n📋 To apply these changes, run:');
      console.log('   node scripts/migrate-default-entities.js --execute\n');
    } else if (!dryRun) {
      console.log('\n✅ Migration complete!\n');
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
main();
