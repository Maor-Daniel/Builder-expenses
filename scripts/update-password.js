#!/usr/bin/env node
// scripts/update-password.js
// Update the basic authentication password for the CloudFront Lambda@Edge function

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const STACK_NAME = 'construction-expenses-production';
const REGION = process.env.AWS_REGION || 'us-east-1';
const FUNCTION_NAME = `${STACK_NAME}-basic-auth`;

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
    log(`${description}...`, 'cyan');
    const output = execSync(command, { encoding: 'utf-8', stdio: 'pipe' });
    log(`✅ Success: ${description}`, 'green');
    return output.trim();
  } catch (error) {
    log(`❌ Failed: ${description}`, 'red');
    log(`Error: ${error.message}`, 'red');
    throw error;
  }
}

function generateStrongPassword() {
  const length = 16;
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
}

function createUpdatedLambdaCode(username, password) {
  return `'use strict';
const USERNAME = '${username}';
const PASSWORD = '${password}';
exports.handler = (event, context, callback) => {
  const request = event.Records[0].cf.request;
  const headers = request.headers;
  const authHeader = headers.authorization;
  if (!authHeader || authHeader.length === 0) {
    return unauthorized(callback);
  }
  const authValue = authHeader[0].value;
  const encodedCreds = authValue.split(' ')[1];
  if (!encodedCreds) {
    return unauthorized(callback);
  }
  const decodedCreds = Buffer.from(encodedCreds, 'base64').toString('utf-8');
  const [username, password] = decodedCreds.split(':');
  if (username === USERNAME && password === PASSWORD) {
    callback(null, request);
  } else {
    return unauthorized(callback);
  }
};
function unauthorized(callback) {
  const response = {
    status: '401',
    statusDescription: 'Unauthorized',
    headers: {
      'www-authenticate': [{ key: 'WWW-Authenticate', value: 'Basic realm="Construction Expenses Tracker - Protected Access"' }],
      'content-type': [{ key: 'Content-Type', value: 'text/html; charset=UTF-8' }]
    },
    body: '<!DOCTYPE html><html><head><title>🔒 Authentication Required</title><meta charset="UTF-8"><style>body{font-family:Arial,sans-serif;text-align:center;margin-top:100px;background:#f5f5f5}h1{color:#d32f2f}p{color:#666}</style></head><body><h1>🔒 Authentication Required</h1><p>Please enter your credentials to access the Construction Expenses Tracker.</p><p><em>Contact the administrator if you need access.</em></p></body></html>'
  };
  callback(null, response);
}`;
}

async function updatePassword() {
  const args = process.argv.slice(2);
  let username = args[0] || 'admin';
  let password = args[1];

  if (!password) {
    // Generate a strong password
    password = generateStrongPassword();
    log('No password provided, generating a strong password...', 'yellow');
  }

  log('🔐 Updating Basic Authentication Credentials', 'blue');
  log(`Username: ${username}`, 'cyan');
  log(`Password: ${password}`, 'cyan');
  
  try {
    // Create the updated Lambda function code
    const updatedCode = createUpdatedLambdaCode(username, password);
    
    // Write to temporary file
    const tempFile = path.join(__dirname, 'temp-auth-function.js');
    fs.writeFileSync(tempFile, updatedCode);
    
    // Update the Lambda function
    execCommand(
      `aws lambda update-function-code --function-name ${FUNCTION_NAME} --zip-file fileb://<(echo '${updatedCode}' | zip -j - -) --region ${REGION}`,
      'Updating Lambda@Edge function code'
    );
    
    // Publish a new version (required for Lambda@Edge)
    const versionOutput = execCommand(
      `aws lambda publish-version --function-name ${FUNCTION_NAME} --region ${REGION}`,
      'Publishing new Lambda@Edge version'
    );
    
    const version = JSON.parse(versionOutput);
    const newVersionArn = version.FunctionArn;
    
    log(`New Lambda@Edge version ARN: ${newVersionArn}`, 'cyan');
    
    // Clean up temp file
    fs.unlinkSync(tempFile);
    
    log('\n✅ Password updated successfully!', 'green');
    log('\n📋 Important Notes:', 'yellow');
    log('1. Lambda@Edge changes can take 15-30 minutes to propagate globally', 'yellow');
    log('2. The new password will work once propagation is complete', 'yellow');
    log('3. Save these credentials securely:', 'yellow');
    log(`   Username: ${username}`, 'cyan');
    log(`   Password: ${password}`, 'cyan');
    
    // Save credentials to file for reference
    const credentialsFile = path.join(__dirname, '..', 'basic-auth-credentials.txt');
    fs.writeFileSync(credentialsFile, `Basic Authentication Credentials\n\nUsername: ${username}\nPassword: ${password}\nUpdated: ${new Date().toISOString()}\n\n⚠️  Keep this file secure and do not commit it to version control!`);
    log(`\n💾 Credentials saved to: ${credentialsFile}`, 'green');
    
  } catch (error) {
    log(`\n❌ Failed to update password: ${error.message}`, 'red');
    process.exit(1);
  }
}

function showUsage() {
  log('\n🔐 Basic Auth Password Updater', 'blue');
  log('\nUsage:', 'yellow');
  log('  node scripts/update-password.js [username] [password]', 'cyan');
  log('\nExamples:', 'yellow');
  log('  node scripts/update-password.js                    # Generate random password for "admin"', 'cyan');
  log('  node scripts/update-password.js myuser             # Generate random password for "myuser"', 'cyan');
  log('  node scripts/update-password.js admin MyPass123!   # Use specific credentials', 'cyan');
  log('\n⚠️  Note: Changes take 15-30 minutes to propagate globally', 'yellow');
}

if (require.main === module) {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    showUsage();
  } else {
    updatePassword();
  }
}