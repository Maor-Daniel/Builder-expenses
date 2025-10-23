#!/usr/bin/env node
// scripts/start-local-dev.js
// Complete local development environment startup script

const { spawn } = require('child_process');
const path = require('path');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkDynamoDBLocal() {
  log('🔍 Checking if DynamoDB Local is running...', 'blue');
  
  try {
    const { execSync } = require('child_process');
    execSync('curl -s http://localhost:8001 > /dev/null', { stdio: 'ignore' });
    log('✅ DynamoDB Local is running on port 8001', 'green');
    return true;
  } catch (error) {
    log('❌ DynamoDB Local is not running on port 8001', 'red');
    return false;
  }
}

function startDynamoDBLocal() {
  log('🚀 Starting DynamoDB Local...', 'yellow');
  log('💡 Make sure you have DynamoDB Local installed', 'cyan');
  log('   Download from: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.DownloadingAndRunning.html', 'cyan');
  
  // Try to start DynamoDB Local (assuming it's in a common location)
  const possiblePaths = [
    'java -Djava.library.path=./DynamoDBLocal_lib -jar DynamoDBLocal.jar -sharedDb -port 8001',
    'docker run -p 8001:8000 amazon/dynamodb-local',
    'dynamodb-local'
  ];
  
  log('\n🔧 You can start DynamoDB Local with one of these commands:', 'yellow');
  possiblePaths.forEach((cmd, index) => {
    log(`   ${index + 1}. ${cmd}`, 'cyan');
  });
  
  log('\nPress any key to continue once DynamoDB Local is running...', 'yellow');
  
  return new Promise((resolve) => {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      resolve();
    });
  });
}

async function setupDatabase() {
  log('🗄️  Setting up local database...', 'blue');
  
  try {
    const { execSync } = require('child_process');
    execSync('npm run db:setup', { stdio: 'inherit' });
    log('✅ Database setup completed', 'green');
  } catch (error) {
    log('❌ Database setup failed', 'red');
    throw error;
  }
}

async function testLambdaFunctions() {
  log('🧪 Testing Lambda functions...', 'blue');
  
  const functions = ['getExpenses', 'addExpense'];
  
  for (const func of functions) {
    try {
      log(`   Testing ${func}...`, 'cyan');
      const { execSync } = require('child_process');
      execSync(`npm run test:lambda ${func}`, { stdio: 'pipe' });
      log(`   ✅ ${func} works`, 'green');
    } catch (error) {
      log(`   ❌ ${func} failed`, 'red');
      // Continue with other functions
    }
  }
}

async function startFrontendServer() {
  log('🌐 Starting frontend development server...', 'blue');
  
  const server = spawn('npm', ['run', 'dev'], {
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'development', IS_LOCAL: 'true' }
  });
  
  server.on('error', (error) => {
    log(`❌ Failed to start frontend server: ${error.message}`, 'red');
  });
  
  return server;
}

async function main() {
  log('\n' + '='.repeat(80), 'blue');
  log('🚀 Construction Expenses - Local Development Setup', 'blue');
  log('='.repeat(80) + '\n', 'blue');
  
  try {
    // Step 1: Check DynamoDB Local
    const isDynamoRunning = await checkDynamoDBLocal();
    if (!isDynamoRunning) {
      await startDynamoDBLocal();
      
      // Check again after user confirms
      const isRunningNow = await checkDynamoDBLocal();
      if (!isRunningNow) {
        log('❌ DynamoDB Local still not running. Exiting.', 'red');
        process.exit(1);
      }
    }
    
    await sleep(1000);
    
    // Step 2: Setup database
    await setupDatabase();
    await sleep(1000);
    
    // Step 3: Test Lambda functions
    await testLambdaFunctions();
    await sleep(1000);
    
    // Step 4: Show local development URLs and commands
    log('\n' + '='.repeat(80), 'green');
    log('🎉 Local Development Environment Ready!', 'green');
    log('='.repeat(80), 'green');
    
    log('\n📋 Available Services:', 'blue');
    log('  🗄️  DynamoDB Local:     http://localhost:8001', 'cyan');
    log('  🌐 Frontend Server:    http://localhost:3000  (run: npm run dev)', 'cyan');
    
    log('\n🔧 Useful Commands:', 'blue');
    log('  npm run dev              # Start frontend server', 'green');
    log('  npm run test:lambda      # Test Lambda functions', 'green');
    log('  npm run db:status        # Check database status', 'green');
    log('  npm run db:reset         # Reset database with test data', 'green');
    
    log('\n🧪 Test Lambda Functions:', 'blue');
    log('  npm run test:lambda getExpenses', 'green');
    log('  npm run test:lambda addExpense', 'green');
    log('  npm run test:lambda updateExpense', 'green');
    log('  npm run test:lambda deleteExpense', 'green');
    
    log('\n💾 Database Management:', 'blue');
    log('  npm run db:list          # List all tables', 'green');
    log('  npm run db:seed          # Add more test data', 'green');
    log('  npm run db:create        # Create table only', 'green');
    
    const shouldStartFrontend = process.argv.includes('--start-frontend');
    
    if (shouldStartFrontend) {
      log('\n🌐 Starting frontend server...', 'yellow');
      const server = await startFrontendServer();
      
      // Handle graceful shutdown
      process.on('SIGINT', () => {
        log('\n👋 Shutting down...', 'yellow');
        server.kill();
        process.exit(0);
      });
      
      log('\n✨ Frontend server started! Visit http://localhost:3000', 'green');
      log('   Press Ctrl+C to stop the server', 'yellow');
      
    } else {
      log('\n💡 To start the frontend server:', 'yellow');
      log('  npm run dev', 'green');
      log('  # or', 'yellow');
      log('  node scripts/start-local-dev.js --start-frontend', 'green');
    }
    
    log('\n🔥 Happy coding!', 'magenta');
    log('='.repeat(80) + '\n', 'green');
    
  } catch (error) {
    log('\n❌ Setup failed:', 'red');
    console.error(error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}