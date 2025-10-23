#!/usr/bin/env node
// scripts/migrate-to-multi-table.js
// Migration script from single-table to multi-table architecture

const AWS = require('aws-sdk');
require('dotenv').config();

// Configure AWS SDK
const dynamodb = new AWS.DynamoDB.DocumentClient({
  region: process.env.AWS_REGION || 'us-east-1'
});

// Table names
const OLD_TABLE = process.env.OLD_TABLE_NAME || 'construction-expenses-production-table';
const NEW_TABLES = {
  USERS: process.env.USERS_TABLE_NAME || 'construction-expenses-production-users',
  PROJECTS: process.env.PROJECTS_TABLE_NAME || 'construction-expenses-production-projects',
  CONTRACTORS: process.env.CONTRACTORS_TABLE_NAME || 'construction-expenses-production-contractors',
  EXPENSES: process.env.EXPENSES_TABLE_NAME || 'construction-expenses-production-expenses',
  WORKS: process.env.WORKS_TABLE_NAME || 'construction-expenses-production-works'
};

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

// Statistics tracking
const stats = {
  users: { processed: 0, migrated: 0, errors: 0 },
  projects: { processed: 0, migrated: 0, errors: 0 },
  contractors: { processed: 0, migrated: 0, errors: 0 },
  expenses: { processed: 0, migrated: 0, errors: 0 },
  works: { processed: 0, migrated: 0, errors: 0 }
};

/**
 * Scan all items from the old single table
 */
async function scanOldTable() {
  log(`📊 Scanning old table: ${OLD_TABLE}`, 'blue');
  
  const items = [];
  let lastEvaluatedKey = null;
  
  do {
    const params = {
      TableName: OLD_TABLE,
      ...(lastEvaluatedKey && { ExclusiveStartKey: lastEvaluatedKey })
    };
    
    try {
      const result = await dynamodb.scan(params).promise();
      items.push(...result.Items);
      lastEvaluatedKey = result.LastEvaluatedKey;
      
      log(`  Scanned ${result.Items.length} items (total: ${items.length})`, 'cyan');
    } catch (error) {
      log(`❌ Error scanning table: ${error.message}`, 'red');
      throw error;
    }
  } while (lastEvaluatedKey);
  
  log(`✅ Total items scanned: ${items.length}`, 'green');
  return items;
}

/**
 * Classify items by type
 */
function classifyItems(items) {
  const classified = {
    users: new Map(),
    projects: [],
    contractors: [],
    expenses: [],
    works: []
  };
  
  for (const item of items) {
    // Determine item type based on presence of specific fields
    if (item.expenseId && item.invoiceNum) {
      classified.expenses.push(item);
    } else if (item.projectId && item.name && item.startDate) {
      classified.projects.push(item);
    } else if (item.contractorId && item.phone) {
      classified.contractors.push(item);
    } else if (item.workId) {
      classified.works.push(item);
    }
    
    // Extract unique users
    if (item.userId && !classified.users.has(item.userId)) {
      classified.users.set(item.userId, {
        userId: item.userId,
        email: `user-${item.userId}@example.com`, // Default email
        name: `User ${item.userId}`,
        createdAt: item.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
  }
  
  log(`📋 Classification complete:`, 'blue');
  log(`  Users: ${classified.users.size}`, 'cyan');
  log(`  Projects: ${classified.projects.length}`, 'cyan');
  log(`  Contractors: ${classified.contractors.length}`, 'cyan');
  log(`  Expenses: ${classified.expenses.length}`, 'cyan');
  log(`  Works: ${classified.works.length}`, 'cyan');
  
  return classified;
}

/**
 * Transform and migrate users
 */
async function migrateUsers(users) {
  log(`👤 Migrating ${users.size} users...`, 'blue');
  
  for (const [userId, user] of users) {
    stats.users.processed++;
    
    try {
      await dynamodb.put({
        TableName: NEW_TABLES.USERS,
        Item: user,
        ConditionExpression: 'attribute_not_exists(userId)'
      }).promise();
      
      stats.users.migrated++;
      log(`  ✅ User migrated: ${userId}`, 'green');
    } catch (error) {
      stats.users.errors++;
      if (error.code === 'ConditionalCheckFailedException') {
        log(`  ⚠️  User already exists: ${userId}`, 'yellow');
      } else {
        log(`  ❌ Error migrating user ${userId}: ${error.message}`, 'red');
      }
    }
  }
}

/**
 * Transform and migrate projects
 */
async function migrateProjects(projects) {
  log(`🏗️  Migrating ${projects.length} projects...`, 'blue');
  
  for (const project of projects) {
    stats.projects.processed++;
    
    try {
      // Transform project to new schema
      const transformedProject = {
        userId: project.userId,
        projectId: project.projectId,
        name: project.name,
        startDate: project.startDate,
        description: project.description || '',
        status: project.status || 'active',
        SpentAmount: 0, // Will be calculated from expenses
        createdAt: project.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      await dynamodb.put({
        TableName: NEW_TABLES.PROJECTS,
        Item: transformedProject,
        ConditionExpression: 'attribute_not_exists(projectId)'
      }).promise();
      
      stats.projects.migrated++;
      log(`  ✅ Project migrated: ${project.name}`, 'green');
    } catch (error) {
      stats.projects.errors++;
      if (error.code === 'ConditionalCheckFailedException') {
        log(`  ⚠️  Project already exists: ${project.name}`, 'yellow');
      } else {
        log(`  ❌ Error migrating project ${project.name}: ${error.message}`, 'red');
      }
    }
  }
}

/**
 * Transform and migrate contractors
 */
async function migrateContractors(contractors) {
  log(`👷 Migrating ${contractors.length} contractors...`, 'blue');
  
  for (const contractor of contractors) {
    stats.contractors.processed++;
    
    try {
      // Transform contractor to new schema (simplified)
      const transformedContractor = {
        userId: contractor.userId,
        contractorId: contractor.contractorId,
        name: contractor.name,
        phone: contractor.phone,
        createdAt: contractor.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      await dynamodb.put({
        TableName: NEW_TABLES.CONTRACTORS,
        Item: transformedContractor,
        ConditionExpression: 'attribute_not_exists(contractorId)'
      }).promise();
      
      stats.contractors.migrated++;
      log(`  ✅ Contractor migrated: ${contractor.name}`, 'green');
    } catch (error) {
      stats.contractors.errors++;
      if (error.code === 'ConditionalCheckFailedException') {
        log(`  ⚠️  Contractor already exists: ${contractor.name}`, 'yellow');
      } else {
        log(`  ❌ Error migrating contractor ${contractor.name}: ${error.message}`, 'red');
      }
    }
  }
}

/**
 * Transform and migrate expenses
 */
async function migrateExpenses(expenses) {
  log(`💰 Migrating ${expenses.length} expenses...`, 'blue');
  
  for (const expense of expenses) {
    stats.expenses.processed++;
    
    try {
      // Transform expense to new schema (removed paymentTerms and status)
      const transformedExpense = {
        userId: expense.userId,
        expenseId: expense.expenseId,
        projectId: expense.project, // Map from old 'project' field to 'projectId'
        contractorId: expense.contractor, // Map from old 'contractor' field to 'contractorId'
        invoiceNum: expense.invoiceNum,
        amount: expense.amount,
        paymentMethod: expense.paymentMethod,
        date: expense.date,
        description: expense.description || '',
        createdAt: expense.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      // Preserve optional fields
      if (expense.receiptImage) {
        transformedExpense.receiptImage = expense.receiptImage;
      }
      if (expense.contractorSignature) {
        transformedExpense.contractorSignature = expense.contractorSignature;
      }
      
      await dynamodb.put({
        TableName: NEW_TABLES.EXPENSES,
        Item: transformedExpense,
        ConditionExpression: 'attribute_not_exists(expenseId)'
      }).promise();
      
      stats.expenses.migrated++;
      log(`  ✅ Expense migrated: ${expense.invoiceNum} (${expense.amount})`, 'green');
    } catch (error) {
      stats.expenses.errors++;
      if (error.code === 'ConditionalCheckFailedException') {
        log(`  ⚠️  Expense already exists: ${expense.invoiceNum}`, 'yellow');
      } else {
        log(`  ❌ Error migrating expense ${expense.invoiceNum}: ${error.message}`, 'red');
      }
    }
  }
}

/**
 * Transform and migrate works
 */
async function migrateWorks(works) {
  log(`🔨 Migrating ${works.length} works...`, 'blue');
  
  for (const work of works) {
    stats.works.processed++;
    
    try {
      // Transform work to new schema (updated fields)
      const transformedWork = {
        userId: work.userId,
        workId: work.workId,
        projectId: work.projectId,
        contractorId: work.contractorId,
        WorkName: work.workType || work.description || 'Unknown Work', // Map to WorkName
        description: work.description || '',
        TotalWorkCost: work.estimatedCost || 0, // Map to TotalWorkCost
        status: work.status || 'planned',
        createdAt: work.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      // Add optional expense reference
      if (work.expenseId) {
        transformedWork.expenseId = work.expenseId;
      }
      
      await dynamodb.put({
        TableName: NEW_TABLES.WORKS,
        Item: transformedWork,
        ConditionExpression: 'attribute_not_exists(workId)'
      }).promise();
      
      stats.works.migrated++;
      log(`  ✅ Work migrated: ${transformedWork.WorkName}`, 'green');
    } catch (error) {
      stats.works.errors++;
      if (error.code === 'ConditionalCheckFailedException') {
        log(`  ⚠️  Work already exists: ${work.workId}`, 'yellow');
      } else {
        log(`  ❌ Error migrating work ${work.workId}: ${error.message}`, 'red');
      }
    }
  }
}

/**
 * Update project SpentAmounts based on migrated expenses
 */
async function updateProjectSpentAmounts(expenses) {
  log(`🔄 Updating project SpentAmounts...`, 'blue');
  
  const projectTotals = new Map();
  
  // Calculate totals by project
  for (const expense of expenses) {
    const projectId = expense.project || expense.projectId;
    const amount = expense.amount;
    
    if (projectId && amount) {
      const currentTotal = projectTotals.get(projectId) || 0;
      projectTotals.set(projectId, currentTotal + amount);
    }
  }
  
  // Update each project's SpentAmount
  for (const [projectId, totalSpent] of projectTotals) {
    try {
      await dynamodb.update({
        TableName: NEW_TABLES.PROJECTS,
        Key: { 
          userId: 'test-user-123', // This should be dynamic based on your user structure
          projectId: projectId 
        },
        UpdateExpression: 'SET SpentAmount = :amount, updatedAt = :timestamp',
        ExpressionAttributeValues: {
          ':amount': totalSpent,
          ':timestamp': new Date().toISOString()
        }
      }).promise();
      
      log(`  ✅ Updated project ${projectId}: SpentAmount = ${totalSpent}`, 'green');
    } catch (error) {
      log(`  ❌ Error updating project ${projectId}: ${error.message}`, 'red');
    }
  }
}

/**
 * Print final statistics
 */
function printStats() {
  log(`\n📊 Migration Statistics:`, 'blue');
  log(`${'='.repeat(50)}`, 'blue');
  
  Object.entries(stats).forEach(([type, data]) => {
    const successRate = data.processed > 0 ? ((data.migrated / data.processed) * 100).toFixed(1) : '0.0';
    log(`${type.toUpperCase()}:`, 'cyan');
    log(`  Processed: ${data.processed}`, 'cyan');
    log(`  Migrated:  ${data.migrated}`, 'green');
    log(`  Errors:    ${data.errors}`, data.errors > 0 ? 'red' : 'cyan');
    log(`  Success:   ${successRate}%`, successRate === '100.0' ? 'green' : 'yellow');
    log('');
  });
  
  const totalProcessed = Object.values(stats).reduce((sum, s) => sum + s.processed, 0);
  const totalMigrated = Object.values(stats).reduce((sum, s) => sum + s.migrated, 0);
  const totalErrors = Object.values(stats).reduce((sum, s) => sum + s.errors, 0);
  
  log(`OVERALL TOTALS:`, 'blue');
  log(`  Total Processed: ${totalProcessed}`, 'cyan');
  log(`  Total Migrated:  ${totalMigrated}`, 'green');
  log(`  Total Errors:    ${totalErrors}`, totalErrors > 0 ? 'red' : 'cyan');
  log(`  Success Rate:    ${totalProcessed > 0 ? ((totalMigrated / totalProcessed) * 100).toFixed(1) : '0.0'}%`, 'blue');
}

/**
 * Main migration function
 */
async function main() {
  try {
    log(`🚀 Starting migration from single-table to multi-table architecture`, 'blue');
    log(`Old table: ${OLD_TABLE}`, 'cyan');
    log(`New tables:`, 'cyan');
    Object.entries(NEW_TABLES).forEach(([key, table]) => {
      log(`  ${key}: ${table}`, 'cyan');
    });
    
    // Step 1: Scan old table
    const items = await scanOldTable();
    
    // Step 2: Classify items
    const classified = classifyItems(items);
    
    // Step 3: Migrate each entity type
    await migrateUsers(classified.users);
    await migrateProjects(classified.projects);
    await migrateContractors(classified.contractors);
    await migrateExpenses(classified.expenses);
    await migrateWorks(classified.works);
    
    // Step 4: Update project SpentAmounts
    await updateProjectSpentAmounts(classified.expenses);
    
    // Step 5: Print statistics
    printStats();
    
    log(`\n🎉 Migration completed successfully!`, 'green');
    
  } catch (error) {
    log(`\n💥 Migration failed: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  }
}

// Run migration
if (require.main === module) {
  main();
}