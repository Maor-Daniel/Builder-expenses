#!/usr/bin/env node
// scripts/upload-lambdas.js
// Upload packaged Lambda functions to AWS

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const STACK_NAME = 'construction-expenses-production';
const REGION = process.env.AWS_REGION || 'us-east-1';

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

function execCommand(command, description, allowFailure = false) {
  try {
    log(`${description}...`, 'cyan');
    const output = execSync(command, { encoding: 'utf-8', stdio: 'pipe' });
    log(`✅ Success: ${description}`, 'green');
    return { success: true, output };
  } catch (error) {
    if (allowFailure) {
      log(`⚠️  ${description} (non-critical failure)`, 'yellow');
      return { success: false, error: error.message };
    } else {
      log(`❌ Failed: ${description}`, 'red');
      log(`Error: ${error.message}`, 'red');
      throw error;
    }
  }
}

const LAMBDA_FUNCTIONS = [
  { name: 'getExpenses', functionName: `${STACK_NAME}-get-expenses` },
  { name: 'addExpense', functionName: `${STACK_NAME}-add-expense` },
  { name: 'updateExpense', functionName: `${STACK_NAME}-update-expense` },
  { name: 'deleteExpense', functionName: `${STACK_NAME}-delete-expense` },
  { name: 'getProjects', functionName: `${STACK_NAME}-get-projects` },
  { name: 'addProject', functionName: `${STACK_NAME}-add-project` },
  { name: 'getContractors', functionName: `${STACK_NAME}-get-contractors` },
  { name: 'addContractor', functionName: `${STACK_NAME}-add-contractor` }
];

function uploadLambdaFunction(lambdaInfo) {
  const zipPath = path.join(__dirname, '..', 'dist', `${lambdaInfo.name}.zip`);
  
  if (!fs.existsSync(zipPath)) {
    throw new Error(`Package file not found: ${zipPath}`);
  }

  const command = `aws lambda update-function-code --function-name ${lambdaInfo.functionName} --zip-file fileb://${zipPath} --region ${REGION}`;
  
  return execCommand(command, `Uploading ${lambdaInfo.name} function code`);
}

function setupApiGatewayIntegrations() {
  log('\n🔗 Setting up API Gateway integrations...', 'blue');
  
  // Get API Gateway ID
  let apiId;
  try {
    const apiListOutput = execCommand(
      `aws apigateway get-rest-apis --query 'items[?name==\`${STACK_NAME}-api\`].id' --output text --region ${REGION}`,
      'Getting API Gateway ID'
    );
    apiId = apiListOutput.output.trim();
    
    if (!apiId || apiId === 'None') {
      throw new Error('API Gateway not found');
    }
    
    log(`API Gateway ID: ${apiId}`, 'cyan');
  } catch (error) {
    log('⚠️  Could not set up API Gateway integrations automatically', 'yellow');
    log('Please configure API Gateway resources and methods manually', 'yellow');
    return false;
  }

  // This is a simplified setup - in practice, you'd need more complex API Gateway configuration
  log('⚠️  API Gateway integration setup requires manual configuration', 'yellow');
  log('Please configure resources and methods in the AWS Console or via additional scripts', 'yellow');
  
  return true;
}

async function main() {
  log('🚀 Uploading Lambda functions to AWS...', 'blue');
  log(`Stack Name: ${STACK_NAME}`, 'cyan');
  log(`Region: ${REGION}`, 'cyan');

  try {
    // Check if dist directory exists
    const distPath = path.join(__dirname, '..', 'dist');
    if (!fs.existsSync(distPath)) {
      throw new Error('dist/ directory not found. Run `npm run package` first.');
    }

    // Upload each function
    const results = [];
    for (const lambdaInfo of LAMBDA_FUNCTIONS) {
      try {
        log(`\n📤 Uploading ${lambdaInfo.name}...`, 'cyan');
        const result = uploadLambdaFunction(lambdaInfo);
        results.push({ ...lambdaInfo, success: true, result });
      } catch (error) {
        log(`❌ Failed to upload ${lambdaInfo.name}: ${error.message}`, 'red');
        results.push({ ...lambdaInfo, success: false, error: error.message });
      }
    }

    // Summary
    log('\n📊 Upload Summary:', 'blue');
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    log(`✅ Successfully uploaded: ${successful.length} functions`, 'green');
    if (failed.length > 0) {
      log(`❌ Failed to upload: ${failed.length} functions`, 'red');
      failed.forEach(f => log(`   - ${f.name}: ${f.error}`, 'red'));
    }

    // Setup API Gateway (basic attempt)
    if (successful.length > 0) {
      setupApiGatewayIntegrations();
    }

    if (successful.length === LAMBDA_FUNCTIONS.length) {
      log('\n✅ All Lambda functions uploaded successfully!', 'green');
      log('Next: run `npm run deploy:frontend` to deploy frontend', 'yellow');
    } else {
      log('\n⚠️  Some functions failed to upload', 'yellow');
      process.exit(1);
    }

  } catch (error) {
    log(`\n❌ Upload failed: ${error.message}`, 'red');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}