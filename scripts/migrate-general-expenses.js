#!/usr/bin/env node
// scripts/migrate-general-expenses.js
// One-time migration script to add "General Expenses" (הוצאות כלליות) project to all existing companies

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, PutCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');

// System project configuration (matches company-utils.js)
const SYSTEM_PROJECT = {
  projectId: 'proj_GENERAL_EXPENSES',
  name: 'הוצאות כלליות',
  description: 'הוצאות שאינן משויכות לפרויקט ספציפי',
  isSystemProject: true
};

const TABLES = {
  COMPANIES: 'construction-expenses-companies',
  PROJECTS: 'construction-expenses-company-projects'
};

// Initialize DynamoDB client
const ddbClient = new DynamoDBClient({ region: 'us-east-1' });
const dynamodb = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: {
    convertEmptyValues: false,
    removeUndefinedValues: true
  }
});

async function migrate() {
  console.log('=== General Expenses Migration Script ===\n');
  console.log(`System Project ID: ${SYSTEM_PROJECT.projectId}`);
  console.log(`System Project Name: ${SYSTEM_PROJECT.name}\n`);

  let companiesProcessed = 0;
  let projectsCreated = 0;
  let projectsSkipped = 0;
  let errors = 0;

  try {
    // Scan all companies
    console.log('Scanning all companies...');
    const companiesResult = await dynamodb.send(new ScanCommand({
      TableName: TABLES.COMPANIES
    }));

    const companies = companiesResult.Items || [];
    console.log(`Found ${companies.length} companies\n`);

    for (const company of companies) {
      const companyId = company.companyId;
      companiesProcessed++;

      try {
        // Check if General Expenses project already exists
        const existingProject = await dynamodb.send(new GetCommand({
          TableName: TABLES.PROJECTS,
          Key: { companyId, projectId: SYSTEM_PROJECT.projectId }
        }));

        if (existingProject.Item) {
          console.log(`[SKIP] Company ${companyId}: General Expenses project already exists`);
          projectsSkipped++;
          continue;
        }

        // Create General Expenses project for this company
        const timestamp = new Date().toISOString();
        const generalExpensesProject = {
          companyId,
          projectId: SYSTEM_PROJECT.projectId,
          userId: company.adminUserId || 'system-migration',
          name: SYSTEM_PROJECT.name,
          description: SYSTEM_PROJECT.description,
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

        await dynamodb.send(new PutCommand({
          TableName: TABLES.PROJECTS,
          Item: generalExpensesProject
        }));

        console.log(`[CREATE] Company ${companyId}: Created General Expenses project`);
        projectsCreated++;

      } catch (companyError) {
        console.error(`[ERROR] Company ${companyId}: ${companyError.message}`);
        errors++;
      }
    }

    // Summary
    console.log('\n=== Migration Complete ===');
    console.log(`Companies Processed: ${companiesProcessed}`);
    console.log(`Projects Created: ${projectsCreated}`);
    console.log(`Projects Skipped (already exist): ${projectsSkipped}`);
    console.log(`Errors: ${errors}`);

    if (errors > 0) {
      process.exit(1);
    }

  } catch (error) {
    console.error('\nMigration failed:', error.message);
    process.exit(1);
  }
}

// Run migration
migrate();
