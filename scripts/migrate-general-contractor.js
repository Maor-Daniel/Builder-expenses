#!/usr/bin/env node
// scripts/migrate-general-contractor.js
// One-time migration script to add "General Contractor" (ספק כללי) to all existing companies

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, PutCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');

// System contractor configuration (matches company-utils.js)
const SYSTEM_CONTRACTOR = {
  contractorId: 'cont_GENERAL',
  name: 'ספק כללי',
  description: 'ספק ברירת מחדל עבור הוצאות ללא ספק מזוהה',
  isSystemContractor: true
};

const TABLES = {
  COMPANIES: 'construction-expenses-companies',
  CONTRACTORS: 'construction-expenses-company-contractors'
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
  console.log('=== General Contractor Migration Script ===\n');
  console.log(`System Contractor ID: ${SYSTEM_CONTRACTOR.contractorId}`);
  console.log(`System Contractor Name: ${SYSTEM_CONTRACTOR.name}\n`);

  let companiesProcessed = 0;
  let contractorsCreated = 0;
  let contractorsSkipped = 0;
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
        // Check if General Contractor already exists
        const existingContractor = await dynamodb.send(new GetCommand({
          TableName: TABLES.CONTRACTORS,
          Key: { companyId, contractorId: SYSTEM_CONTRACTOR.contractorId }
        }));

        if (existingContractor.Item) {
          console.log(`[SKIP] Company ${companyId}: General Contractor already exists`);
          contractorsSkipped++;
          continue;
        }

        // Create General Contractor for this company
        const timestamp = new Date().toISOString();
        const generalContractor = {
          companyId,
          contractorId: SYSTEM_CONTRACTOR.contractorId,
          userId: company.adminUserId || 'system-migration',
          name: SYSTEM_CONTRACTOR.name,
          contactPerson: '',
          phone: '',
          email: '',
          address: '',
          specialty: 'כללי',
          licenseNumber: '',
          taxId: '',
          paymentTerms: '',
          notes: SYSTEM_CONTRACTOR.description,
          isSystemContractor: true,
          status: 'active',
          rating: null,
          createdAt: timestamp,
          updatedAt: timestamp
        };

        await dynamodb.send(new PutCommand({
          TableName: TABLES.CONTRACTORS,
          Item: generalContractor
        }));

        console.log(`[CREATE] Company ${companyId}: Created General Contractor`);
        contractorsCreated++;

      } catch (companyError) {
        console.error(`[ERROR] Company ${companyId}: ${companyError.message}`);
        errors++;
      }
    }

    // Summary
    console.log('\n=== Migration Complete ===');
    console.log(`Companies Processed: ${companiesProcessed}`);
    console.log(`Contractors Created: ${contractorsCreated}`);
    console.log(`Contractors Skipped (already exist): ${contractorsSkipped}`);
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
