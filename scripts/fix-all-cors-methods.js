#!/usr/bin/env node

/**
 * Fix all API Gateway endpoints to have correct allowed methods in OPTIONS
 */

const {
  APIGatewayClient,
  GetResourcesCommand,
  GetMethodCommand,
  UpdateIntegrationResponseCommand
} = require('@aws-sdk/client-api-gateway');

const API_ID = '2woj5i92td';
const REGION = 'us-east-1';

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

async function updateAllowedMethods(resourceId, path, methods) {
  const allowedMethods = methods.join(',');

  console.log(`  Setting allowed methods to: ${allowedMethods}`);

  const command = new UpdateIntegrationResponseCommand({
    restApiId: API_ID,
    resourceId: resourceId,
    httpMethod: 'OPTIONS',
    statusCode: '200',
    patchOperations: [
      {
        op: 'replace',
        path: '/responseParameters/method.response.header.Access-Control-Allow-Methods',
        value: `'${allowedMethods}'`
      }
    ]
  });

  await client.send(command);
}

async function fixResource(resource) {
  const { id: resourceId, path, resourceMethods } = resource;

  // Skip if no OPTIONS method
  if (!resourceMethods || !resourceMethods.OPTIONS) {
    return;
  }

  console.log(`\nFixing ${path} (${resourceId})`);

  try {
    // Get current OPTIONS configuration
    const optionsConfig = await getMethodConfig(resourceId, 'OPTIONS');

    if (!optionsConfig) {
      console.log(`  ⚠️  Could not get OPTIONS config, skipping...`);
      return;
    }

    // Check if it's a MOCK integration (not Lambda proxy)
    if (optionsConfig.methodIntegration?.type !== 'MOCK') {
      console.log(`  ℹ️  Skipping (not MOCK integration, type: ${optionsConfig.methodIntegration?.type})`);
      return;
    }

    // Get all methods for this resource
    const methods = Object.keys(resourceMethods).sort();

    // Get current allowed methods
    const currentMethods = optionsConfig.methodIntegration?.integrationResponses?.['200']?.responseParameters?.['method.response.header.Access-Control-Allow-Methods'];

    if (currentMethods) {
      // Extract methods from the quoted string like "'GET,OPTIONS'"
      const currentMethodsClean = currentMethods.replace(/'/g, '');
      const expectedMethods = methods.join(',');

      if (currentMethodsClean === expectedMethods) {
        console.log(`  ✓ Already correct: ${expectedMethods}`);
        return;
      }
    }

    // Update the allowed methods
    await updateAllowedMethods(resourceId, path, methods);
    console.log(`  ✓ Fixed!`);

  } catch (error) {
    console.error(`  ✗ Error:`, error.message);
  }
}

async function main() {
  console.log('🔧 Fixing API Gateway Allowed Methods for OPTIONS\n');
  console.log(`API ID: ${API_ID}`);
  console.log(`Region: ${REGION}\n`);

  try {
    const resources = await getAllResources();
    console.log(`Found ${resources.length} resources`);

    const optionsResources = resources.filter(r =>
      r.resourceMethods && r.resourceMethods.OPTIONS
    );

    console.log(`Found ${optionsResources.length} resources with OPTIONS method\n`);

    for (const resource of optionsResources) {
      await fixResource(resource);
    }

    console.log('\n✅ Done!');
    console.log('\n⚠️  Deploy changes:');
    console.log(`   aws apigateway create-deployment --rest-api-id ${API_ID} --stage-name prod --region ${REGION}`);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
