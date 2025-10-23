#!/usr/bin/env node
// scripts/deploy.js
// Deploy the Construction Expenses Tracker to AWS

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

function execCommand(command, description) {
  try {
    log(`\n${description}...`, 'cyan');
    log(`Running: ${command}`, 'yellow');
    const output = execSync(command, { encoding: 'utf-8', stdio: 'pipe' });
    log(`✅ Success: ${description}`, 'green');
    return output;
  } catch (error) {
    log(`❌ Failed: ${description}`, 'red');
    log(`Error: ${error.message}`, 'red');
    if (error.stdout) log(`STDOUT: ${error.stdout}`, 'yellow');
    if (error.stderr) log(`STDERR: ${error.stderr}`, 'yellow');
    throw error;
  }
}

function checkAWSCredentials() {
  try {
    execCommand('aws sts get-caller-identity', 'Checking AWS credentials');
    return true;
  } catch (error) {
    log('❌ AWS credentials not configured or invalid', 'red');
    log('Please run: aws configure', 'yellow');
    return false;
  }
}

function deployCloudFormation() {
  const templatePath = path.join(__dirname, '..', 'infrastructure', 'cloudformation-template.yaml');
  
  if (!fs.existsSync(templatePath)) {
    throw new Error(`CloudFormation template not found at ${templatePath}`);
  }

  // Check if stack exists
  let stackExists = false;
  try {
    execCommand(`aws cloudformation describe-stacks --stack-name ${STACK_NAME} --region ${REGION}`, 'Checking if stack exists');
    stackExists = true;
  } catch (error) {
    if (error.message.includes('does not exist')) {
      log('Stack does not exist, will create new stack', 'yellow');
    } else {
      throw error;
    }
  }

  // Deploy stack
  const command = stackExists 
    ? `aws cloudformation update-stack --stack-name ${STACK_NAME} --template-body file://${templatePath} --capabilities CAPABILITY_NAMED_IAM --region ${REGION}`
    : `aws cloudformation create-stack --stack-name ${STACK_NAME} --template-body file://${templatePath} --capabilities CAPABILITY_NAMED_IAM --region ${REGION}`;

  execCommand(command, stackExists ? 'Updating CloudFormation stack' : 'Creating CloudFormation stack');

  // Wait for stack completion
  const waitCommand = stackExists 
    ? `aws cloudformation wait stack-update-complete --stack-name ${STACK_NAME} --region ${REGION}`
    : `aws cloudformation wait stack-create-complete --stack-name ${STACK_NAME} --region ${REGION}`;

  log('\n⏳ Waiting for CloudFormation stack deployment to complete...', 'cyan');
  log('This may take several minutes...', 'yellow');
  
  execCommand(waitCommand, 'Waiting for stack completion');
}

function getStackOutputs() {
  try {
    const output = execCommand(
      `aws cloudformation describe-stacks --stack-name ${STACK_NAME} --region ${REGION} --query 'Stacks[0].Outputs' --output json`,
      'Getting stack outputs'
    );
    
    const outputs = JSON.parse(output);
    log('\n📋 Stack Outputs:', 'blue');
    outputs.forEach(output => {
      log(`  ${output.OutputKey}: ${output.OutputValue}`, 'cyan');
    });
    
    return outputs;
  } catch (error) {
    log('❌ Failed to get stack outputs', 'red');
    return [];
  }
}

async function main() {
  log('🚀 Starting AWS Deployment for Construction Expenses Tracker', 'blue');
  log(`Stack Name: ${STACK_NAME}`, 'cyan');
  log(`Region: ${REGION}`, 'cyan');

  try {
    // Step 1: Check AWS credentials
    if (!checkAWSCredentials()) {
      process.exit(1);
    }

    // Step 2: Deploy CloudFormation stack
    deployCloudFormation();

    // Step 3: Get stack outputs
    const outputs = getStackOutputs();

    // Step 4: Package and upload Lambda functions
    log('\n📦 Next steps:', 'blue');
    log('1. Run: npm run package', 'yellow');
    log('2. Run: npm run deploy:lambda', 'yellow');
    log('3. Run: npm run deploy:frontend', 'yellow');
    log('\nOr run all at once: npm run deploy:full', 'green');

    log('\n✅ CloudFormation deployment completed successfully!', 'green');

  } catch (error) {
    log('\n❌ Deployment failed', 'red');
    log(`Error: ${error.message}`, 'red');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}