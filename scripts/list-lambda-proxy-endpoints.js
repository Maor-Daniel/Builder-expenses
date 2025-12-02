#!/usr/bin/env node

/**
 * List all endpoints that use Lambda proxy integration
 * These need CORS to be handled in the Lambda function itself
 */

const {
  APIGatewayClient,
  GetResourcesCommand,
  GetMethodCommand
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

async function main() {
  console.log('🔍 Finding Lambda Proxy Endpoints\n');

  const resources = await getAllResources();
  const proxyEndpoints = [];

  for (const resource of resources) {
    if (!resource.resourceMethods) continue;

    const methods = Object.keys(resource.resourceMethods);

    for (const method of methods) {
      const config = await getMethodConfig(resource.id, method);

      if (config?.methodIntegration?.type === 'AWS_PROXY') {
        proxyEndpoints.push({
          path: resource.path,
          method: method,
          lambda: config.methodIntegration.uri
        });
      }
    }
  }

  console.log(`Found ${proxyEndpoints.length} Lambda proxy endpoints:\n`);

  proxyEndpoints.forEach(ep => {
    const lambdaName = ep.lambda.match(/function:([^/]+)/)?.[1] || 'unknown';
    console.log(`  ${ep.method.padEnd(7)} ${ep.path.padEnd(30)} -> ${lambdaName}`);
  });

  console.log('\n\nThese Lambda functions need to return CORS headers in their responses.');
}

main();
