#!/usr/bin/env node
// scripts/package-lambdas.js
// Package Lambda functions for deployment

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

// Colors for terminal
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

const LAMBDA_FUNCTIONS = [
  // Authentication
  'clerk-authorizer',  // Clerk JWT authorizer for API Gateway
  // Expenses
  'getExpenses',
  'addExpense',
  'updateExpense',
  'deleteExpense',
  // Projects
  'getProjects',
  'addProject',
  'deleteProject',
  'deleteProjectClerk',  // Clerk version
  // Contractors
  'getContractors',
  'addContractor',
  'deleteContractor',
  'deleteContractorClerk',  // Clerk version
  // Works
  'getWorks',
  'addWork',
  'deleteWork',
  'deleteWorkClerk',  // Clerk version
  // Billing
  'subscriptionManager',
  'paddleWebhook',
  'createPaddleCheckout',  // Create Paddle checkout sessions for subscription
  'updatePaddleSubscription',  // Update existing Paddle subscriptions (upgrade/downgrade)
  'subscriptionDetails',  // Get comprehensive subscription details with usage and billing
  'createCustomerPortalSession',  // Generate Paddle customer portal URL for self-service
  'paymentHistory',  // Fetch transaction history with pagination
  // Webhooks
  'webhookPaddle',  // Paddle subscription/payment webhooks
  'webhookClerk',   // Clerk user authentication webhooks
  // User Management Functions
  'listUsers',
  'updateUser',
  'removeUser',
  'inviteUser',
  'sendInvitation',
  'listInvitations',
  'acceptInvitation',
  'resendInvitation',
  'cancelInvitation',
  'checkPendingInvitations',  // Check pending invitations by email for signup flow
  // Company Management
  'getCompany',
  'getCompanyUsage',
  'updateCompany',
  'uploadCompanyLogo',
  'uploadReceipt',
  'registerCompany',
  'registerCompanyClerk',  // Clerk version
  // Company expense management
  'companyExpenses',
  'companyProjects',
  'companyContractors',
  'companyWorks',
  // OCR Processing
  'processReceiptOCR'  // Smart expense OCR with AWS Textract
];

function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function createZipFile(functionName) {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(__dirname, '..', 'dist', `${functionName}.zip`);
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      log(`✅ ${functionName}.zip created (${archive.pointer()} bytes)`, 'green');
      resolve(outputPath);
    });

    archive.on('error', (err) => {
      log(`❌ Error creating ${functionName}.zip`, 'red');
      reject(err);
    });

    archive.pipe(output);

    // Add the main Lambda function file (rename to index.js for Lambda handler compatibility)
    const lambdaFilePath = path.join(__dirname, '..', 'lambda', `${functionName}.js`);
    if (fs.existsSync(lambdaFilePath)) {
      archive.file(lambdaFilePath, { name: 'index.js' });
    } else {
      reject(new Error(`Lambda function file not found: ${lambdaFilePath}`));
      return;
    }

    // Add shared utilities
    const sharedDir = path.join(__dirname, '..', 'lambda', 'shared');
    if (fs.existsSync(sharedDir)) {
      archive.directory(sharedDir, 'shared');
    }

    // Add package.json for dependencies
    const packageJsonPath = path.join(__dirname, '..', 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      archive.file(packageJsonPath, { name: 'package.json' });
    }

    // Add node_modules (production dependencies)
    const lambdaNodeModulesPath = path.join(__dirname, '..', 'lambda', 'node_modules');
    const rootNodeModulesPath = path.join(__dirname, '..', 'node_modules');

    // Try lambda/node_modules first (where we installed @clerk/backend)
    const nodeModulesPath = fs.existsSync(lambdaNodeModulesPath) ? lambdaNodeModulesPath : rootNodeModulesPath;

    if (fs.existsSync(nodeModulesPath)) {
      // Include ALL node_modules (production dependencies only)
      // This ensures all transitive dependencies are included
      log(`📦 Including all production dependencies from node_modules`, 'cyan');
      archive.directory(nodeModulesPath, 'node_modules');
    }

    archive.finalize();
  });
}

async function packageAllFunctions() {
  log('📦 Packaging Lambda functions for deployment...', 'blue');
  
  // Ensure dist directory exists
  const distPath = path.join(__dirname, '..', 'dist');
  ensureDirectoryExists(distPath);

  // Clean existing zip files
  const existingFiles = fs.readdirSync(distPath).filter(file => file.endsWith('.zip'));
  existingFiles.forEach(file => {
    fs.unlinkSync(path.join(distPath, file));
    log(`🗑️  Removed existing ${file}`, 'yellow');
  });

  // Package each function
  const results = [];
  for (const functionName of LAMBDA_FUNCTIONS) {
    try {
      log(`\n📦 Packaging ${functionName}...`, 'cyan');
      const zipPath = await createZipFile(functionName);
      results.push({ functionName, zipPath, success: true });
    } catch (error) {
      log(`❌ Failed to package ${functionName}: ${error.message}`, 'red');
      results.push({ functionName, error: error.message, success: false });
    }
  }

  // Summary
  log('\n📊 Packaging Summary:', 'blue');
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  log(`✅ Successfully packaged: ${successful.length} functions`, 'green');
  if (failed.length > 0) {
    log(`❌ Failed to package: ${failed.length} functions`, 'red');
    failed.forEach(f => log(`   - ${f.functionName}: ${f.error}`, 'red'));
  }

  if (successful.length > 0) {
    log('\n📁 Package files created in dist/ directory:', 'cyan');
    successful.forEach(f => {
      const stats = fs.statSync(f.zipPath);
      log(`   - ${path.basename(f.zipPath)} (${Math.round(stats.size / 1024)}KB)`, 'cyan');
    });
  }

  return results;
}

async function main() {
  try {
    const results = await packageAllFunctions();
    const allSuccessful = results.every(r => r.success);
    
    if (allSuccessful) {
      log('\n✅ All Lambda functions packaged successfully!', 'green');
      log('Next: run `npm run deploy:lambda` to upload to AWS', 'yellow');
    } else {
      log('\n❌ Some functions failed to package', 'red');
      process.exit(1);
    }
  } catch (error) {
    log(`\n❌ Packaging failed: ${error.message}`, 'red');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}