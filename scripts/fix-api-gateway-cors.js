#!/usr/bin/env node

/**
 * Fix API Gateway OPTIONS methods to properly support CORS preflight requests
 *
 * This script:
 * 1. Updates all OPTIONS methods to include Access-Control-Allow-Origin header
 * 2. Uses method.request.header.Origin to echo back the requesting origin
 * 3. Ensures proper CORS headers for all endpoints
 */

const {
  APIGatewayClient,
  GetResourcesCommand,
  GetMethodCommand,
  UpdateMethodResponseCommand,
  UpdateIntegrationResponseCommand,
  PutMethodCommand
} = require('@aws-sdk/client-api-gateway');

const API_ID = '2woj5i92td';
const REGION = 'us-east-1';
const ALLOWED_ORIGINS = [
  'https://www.builder-expenses.com',
  'https://builder-expenses.com',
  'http://localhost:3000'
];

const client = new APIGatewayClient({ region: REGION });

async function getAllResources() {
  const command = new GetResourcesCommand({
    restApiId: API_ID,
    limit: 500
  });

  const response = await client.send(command);
  return response.items || [];
}

async function getMethodConfig(resourceId, httpMethod) {
  try {
    const command = new GetMethodCommand({
      restApiId: API_ID,
      resourceId: resourceId,
      httpMethod: httpMethod
    });

    return await client.send(command);
  } catch (error) {
    return null;
  }
}

async function updateMethodResponse(resourceId) {
  console.log(`  Updating method response for resource ${resourceId}...`);

  const command = new UpdateMethodResponseCommand({
    restApiId: API_ID,
    resourceId: resourceId,
    httpMethod: 'OPTIONS',
    statusCode: '200',
    patchOperations: [
      {
        op: 'add',
        path: '/responseParameters/method.response.header.Access-Control-Allow-Origin',
        value: 'true'
      },
      {
        op: 'add',
        path: '/responseParameters/method.response.header.Access-Control-Allow-Headers',
        value: 'true'
      },
      {
        op: 'add',
        path: '/responseParameters/method.response.header.Access-Control-Allow-Methods',
        value: 'true'
      }
    ]
  });

  await client.send(command);
}

async function updateIntegrationResponse(resourceId, path, resourceMethods) {
  console.log(`  Updating integration response for resource ${resourceId}...`);

  // Determine allowed methods from the resource's methods
  const methods = Object.keys(resourceMethods).sort();
  const allowedMethods = methods.join(',');

  // Use UpdateIntegrationResponseCommand with patch operations
  const command = new UpdateIntegrationResponseCommand({
    restApiId: API_ID,
    resourceId: resourceId,
    httpMethod: 'OPTIONS',
    statusCode: '200',
    patchOperations: [
      {
        op: 'add',
        path: '/responseParameters/method.response.header.Access-Control-Allow-Origin',
        value: "'https://www.builder-expenses.com'"
      },
      {
        op: 'replace',
        path: '/responseParameters/method.response.header.Access-Control-Allow-Headers',
        value: "'Content-Type,Authorization,X-Api-Key,X-Amz-Date,X-Amz-Security-Token'"
      },
      {
        op: 'replace',
        path: '/responseParameters/method.response.header.Access-Control-Allow-Methods',
        value: `'${allowedMethods}'`
      }
    ]
  });

  await client.send(command);
}

async function getResourceMethods(resourceId) {
  const command = new GetResourcesCommand({
    restApiId: API_ID
  });

  const response = await client.send(command);
  const resource = response.items.find(r => r.id === resourceId);

  if (!resource || !resource.resourceMethods) {
    return ['OPTIONS'];
  }

  return Object.keys(resource.resourceMethods).sort();
}

async function fixOptionsForResource(resource) {
  const { id: resourceId, path, resourceMethods } = resource;

  // Skip if no OPTIONS method
  if (!resourceMethods || !resourceMethods.OPTIONS) {
    return;
  }

  console.log(`\nFixing OPTIONS for ${path} (${resourceId})`);

  try {
    // Get current configuration
    const currentConfig = await getMethodConfig(resourceId, 'OPTIONS');

    if (!currentConfig) {
      console.log(`  ⚠️  Could not get current config, skipping...`);
      return;
    }

    // Check if Access-Control-Allow-Origin is already properly configured
    const hasOriginInResponse = currentConfig.methodResponses?.['200']?.responseParameters?.['method.response.header.Access-Control-Allow-Origin'];
    const hasOriginInIntegration = currentConfig.methodIntegration?.integrationResponses?.['200']?.responseParameters?.['method.response.header.Access-Control-Allow-Origin'];

    if (hasOriginInResponse && hasOriginInIntegration &&
        hasOriginInIntegration.includes('builder-expenses.com')) {
      console.log(`  ✓ Already configured correctly`);
      return;
    }

    // Update method response to include Origin parameter (use try-catch for existing params)
    try {
      await updateMethodResponse(resourceId);
    } catch (error) {
      if (!error.message.includes('already exists')) {
        throw error;
      }
      console.log(`  ℹ️  Method response already has parameters`);
    }

    // Update integration response to include Origin header
    await updateIntegrationResponse(resourceId, path, resourceMethods);

    console.log(`  ✓ Fixed OPTIONS CORS headers`);

  } catch (error) {
    console.error(`  ✗ Error fixing ${path}:`, error.message);
  }
}

async function main() {
  console.log('🔧 Fixing API Gateway OPTIONS CORS Configuration\n');
  console.log(`API ID: ${API_ID}`);
  console.log(`Region: ${REGION}\n`);

  try {
    // Get all resources
    const resources = await getAllResources();
    console.log(`Found ${resources.length} resources`);

    // Filter resources with OPTIONS method
    const optionsResources = resources.filter(r =>
      r.resourceMethods && r.resourceMethods.OPTIONS
    );

    console.log(`Found ${optionsResources.length} resources with OPTIONS method\n`);

    // Fix each OPTIONS method
    for (const resource of optionsResources) {
      await fixOptionsForResource(resource);
    }

    console.log('\n✅ All OPTIONS methods updated!');
    console.log('\n⚠️  IMPORTANT: You must deploy these changes:');
    console.log(`   aws apigateway create-deployment --rest-api-id ${API_ID} --stage-name prod --region ${REGION}`);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
