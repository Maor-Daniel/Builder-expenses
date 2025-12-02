#!/usr/bin/env node
/**
 * Script to update all Lambda functions to use secure CORS middleware
 *
 * This script:
 * 1. Finds all Lambda handler files
 * 2. Adds withSecureCors import if not present
 * 3. Wraps the handler with withSecureCors middleware
 * 4. Removes manual OPTIONS handling (now handled by middleware)
 *
 * Usage: node scripts/update-lambda-cors.js [--dry-run]
 */

const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');

const LAMBDA_DIR = path.join(__dirname, '../lambda');

// Lambda files to SKIP (special cases that need manual handling)
const SKIP_FILES = [
  'clerk-authorizer.js', // Custom authorizer, different pattern
  'paddleWebhook.js', // Webhook, doesn't need browser CORS
  'webhookClerk.js', // Webhook, doesn't need browser CORS
  'shared', // Skip shared directory
];

/**
 * Check if file should be skipped
 */
function shouldSkip(fileName) {
  return SKIP_FILES.some(skip => fileName.includes(skip));
}

/**
 * Check if file already has withSecureCors
 */
function hasSecureCors(content) {
  return content.includes('withSecureCors') || content.includes('require(\'./shared/cors-config\')');
}

/**
 * Check if file has manual OPTIONS handling
 */
function hasManualOptionsHandling(content) {
  return content.match(/if\s*\(\s*event\.httpMethod\s*===?\s*['"]OPTIONS['"]\s*\)/);
}

/**
 * Update Lambda file to use secure CORS middleware
 */
function updateLambdaFile(filePath) {
  const fileName = path.basename(filePath);

  if (shouldSkip(fileName)) {
    console.log(`⏭️  Skipping ${fileName} (special case)`);
    return { skipped: true };
  }

  let content = fs.readFileSync(filePath, 'utf8');

  // Check if already updated
  if (hasSecureCors(content)) {
    console.log(`✅ ${fileName} already has secure CORS`);
    return { alreadyUpdated: true };
  }

  // Check if file exports a handler
  if (!content.includes('exports.handler')) {
    console.log(`⏭️  Skipping ${fileName} (no exports.handler)`);
    return { skipped: true };
  }

  let modified = false;
  let changes = [];

  // Step 1: Add withSecureCors import after other requires
  const requirePattern = /(const\s+{[^}]+}\s*=\s*require\(['"]\.\/shared\/[^'"]+['"]\);)/g;
  const matches = content.match(requirePattern);

  if (matches && matches.length > 0) {
    // Add after the last shared require
    const lastRequire = matches[matches.length - 1];
    const insertPoint = content.lastIndexOf(lastRequire) + lastRequire.length;

    const corsImport = "\nconst { withSecureCors } = require('./shared/cors-config');";

    content = content.slice(0, insertPoint) + corsImport + content.slice(insertPoint);
    modified = true;
    changes.push('Added withSecureCors import');
  }

  // Step 2: Remove manual OPTIONS handling from handler
  // Pattern: if (event.httpMethod === 'OPTIONS') { ... }
  const optionsPattern = /if\s*\(\s*event\.httpMethod\s*===?\s*['"]OPTIONS['"]\s*\)\s*{[^}]*return[^;]+;?\s*}/g;

  if (hasManualOptionsHandling(content)) {
    content = content.replace(optionsPattern, '// OPTIONS handling now in withSecureCors middleware');
    modified = true;
    changes.push('Removed manual OPTIONS handling');
  }

  // Step 3: Wrap exports.handler with withSecureCors
  // Pattern: exports.handler = async (event, context) => { ... }
  const handlerPattern = /exports\.handler\s*=\s*(async\s*)?\(([^)]+)\)\s*=>\s*{/;

  if (content.match(handlerPattern)) {
    content = content.replace(
      handlerPattern,
      'exports.handler = withSecureCors($1($2) => {'
    );
    modified = true;
    changes.push('Wrapped handler with withSecureCors');
  } else {
    // Try alternate pattern: exports.handler = async function(event, context) { ... }
    const altHandlerPattern = /exports\.handler\s*=\s*(async\s+)?function\s*\(([^)]+)\)\s*{/;

    if (content.match(altHandlerPattern)) {
      content = content.replace(
        altHandlerPattern,
        'exports.handler = withSecureCors($1function($2) {'
      );
      modified = true;
      changes.push('Wrapped handler with withSecureCors');
    }
  }

  if (modified) {
    if (!DRY_RUN) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`✏️  Updated ${fileName}:`, changes.join(', '));
    } else {
      console.log(`📝 Would update ${fileName}:`, changes.join(', '));
    }
    return { updated: true, changes };
  } else {
    console.log(`⚠️  Could not auto-update ${fileName} (manual review needed)`);
    return { needsManual: true };
  }
}

/**
 * Main execution
 */
function main() {
  console.log('🔒 Lambda CORS Security Update Script\n');

  if (DRY_RUN) {
    console.log('🧪 DRY RUN MODE - No files will be modified\n');
  }

  const files = fs.readdirSync(LAMBDA_DIR)
    .filter(f => f.endsWith('.js') && !f.startsWith('.'))
    .map(f => path.join(LAMBDA_DIR, f));

  console.log(`Found ${files.length} Lambda files\n`);

  const results = {
    updated: [],
    alreadyUpdated: [],
    skipped: [],
    needsManual: []
  };

  files.forEach(file => {
    const result = updateLambdaFile(file);

    if (result.updated) {
      results.updated.push(path.basename(file));
    } else if (result.alreadyUpdated) {
      results.alreadyUpdated.push(path.basename(file));
    } else if (result.skipped) {
      results.skipped.push(path.basename(file));
    } else if (result.needsManual) {
      results.needsManual.push(path.basename(file));
    }
  });

  console.log('\n📊 Summary:');
  console.log(`✅ Already secure: ${results.alreadyUpdated.length}`);
  console.log(`✏️  Updated: ${results.updated.length}`);
  console.log(`⏭️  Skipped: ${results.skipped.length}`);
  console.log(`⚠️  Need manual review: ${results.needsManual.length}`);

  if (results.needsManual.length > 0) {
    console.log('\n⚠️  Files needing manual review:');
    results.needsManual.forEach(f => console.log(`   - ${f}`));
  }

  if (DRY_RUN) {
    console.log('\n💡 Run without --dry-run to apply changes');
  } else {
    console.log('\n✅ CORS security update complete!');
  }
}

main();
