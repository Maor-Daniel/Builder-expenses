/**
 * Test script to verify AWS Secrets Manager integration
 *
 * Run with: node test-secrets.js
 */

const { getSecret, getSecrets } = require('./lambda/shared/secrets');

async function testSecrets() {
  console.log('🔐 Testing AWS Secrets Manager Integration\n');

  try {
    // Test 1: Fetch individual secrets
    console.log('Test 1: Fetching individual secrets...');

    const sentryDsn = await getSecret('sentry/dsn');
    console.log('✅ Sentry DSN:', sentryDsn.substring(0, 30) + '...');

    const clerkPublicKey = await getSecret('clerk/publishable-key');
    console.log('✅ Clerk Publishable Key:', clerkPublicKey.substring(0, 20) + '...');

    const clerkSecretKey = await getSecret('clerk/secret-key');
    console.log('✅ Clerk Secret Key:', clerkSecretKey.substring(0, 20) + '...');

    const paddleApiKey = await getSecret('paddle/api-key');
    console.log('✅ Paddle API Key:', paddleApiKey.substring(0, 30) + '...');

    const paddleWebhookSecret = await getSecret('paddle/webhook-secret');
    console.log('✅ Paddle Webhook Secret:', paddleWebhookSecret.substring(0, 30) + '...');

    console.log('\nTest 2: Fetching multiple secrets at once...');
    const secrets = await getSecrets([
      'sentry/dsn',
      'clerk/secret-key',
      'paddle/api-key'
    ]);
    console.log('✅ Fetched', Object.keys(secrets).length, 'secrets successfully');

    console.log('\nTest 3: Testing cache...');
    const sentryDsnCached = await getSecret('sentry/dsn');
    console.log('✅ Retrieved from cache:', sentryDsnCached.substring(0, 30) + '...');

    console.log('\n✅ All tests passed! Secrets Manager integration is working correctly.\n');

  } catch (error) {
    console.error('❌ Error testing secrets:', error);
    process.exit(1);
  }
}

testSecrets();
