/**
 * AWS Secrets Manager integration for secure secret retrieval
 *
 * This module provides a cached, efficient way to fetch secrets from AWS Secrets Manager.
 * Secrets are cached per Lambda container instance to minimize API calls and improve performance.
 *
 * SECURITY NOTES:
 * - Never use fallback values in production
 * - Always fail closed (throw error) if secret unavailable in production
 * - Cache secrets per container instance for performance
 * - Use this for ALL sensitive credentials (API keys, tokens, etc.)
 */

const AWS = require('aws-sdk');

// Initialize AWS Secrets Manager client
const secretsManager = new AWS.SecretsManager({
    region: process.env.AWS_REGION || 'us-east-1'
});

// Cache secrets for Lambda container reuse (in-memory cache)
// This cache persists for the lifetime of the Lambda container
const secretCache = {};

/**
 * Get a secret from AWS Secrets Manager with caching
 *
 * @param {string} secretPath - The secret path (e.g., 'clerk/secret-key', 'paddle/api-key')
 * @returns {Promise<string>} The secret value
 * @throws {Error} If secret cannot be retrieved in production
 *
 * @example
 * const apiKey = await getSecret('paddle/api-key');
 * const clerkKey = await getSecret('clerk/secret-key');
 */
async function getSecret(secretPath) {
    // Return from cache if available
    if (secretCache[secretPath]) {
        console.log(`Using cached secret: ${secretPath}`);
        return secretCache[secretPath];
    }

    const fullSecretName = `construction-expenses/${secretPath}`;

    try {
        console.log(`Fetching secret from AWS Secrets Manager: ${fullSecretName}`);

        const data = await secretsManager.getSecretValue({
            SecretId: fullSecretName
        }).promise();

        const secret = data.SecretString;

        // Cache the secret for subsequent invocations in this container
        secretCache[secretPath] = secret;

        console.log(`Successfully fetched and cached secret: ${secretPath}`);
        return secret;

    } catch (error) {
        console.error(`Failed to fetch secret ${fullSecretName}:`, {
            error: error.message,
            code: error.code
        });

        const isProduction = process.env.NODE_ENV === 'production' ||
                            process.env.ENVIRONMENT === 'production' ||
                            !process.env.IS_LOCAL;

        // CRITICAL: Never use fallback in production - fail closed for security
        if (isProduction) {
            throw new Error(
                `CRITICAL: Secret ${secretPath} not available in production. ` +
                `Ensure the secret exists in AWS Secrets Manager and Lambda has proper IAM permissions.`
            );
        }

        // Development fallback: Try to get from environment variable
        console.warn(
            `WARNING: Using development fallback for secret ${secretPath}. ` +
            `This is ONLY allowed in local development.`
        );

        // Convert secret path to environment variable name
        // e.g., 'clerk/secret-key' -> 'CLERK_SECRET_KEY'
        const envVarName = secretPath
            .toUpperCase()
            .replace(/[/-]/g, '_');

        const fallbackValue = process.env[envVarName];

        if (!fallbackValue) {
            throw new Error(
                `Secret ${secretPath} not found in AWS Secrets Manager and ` +
                `no fallback environment variable ${envVarName} available.`
            );
        }

        return fallbackValue;
    }
}

/**
 * Get multiple secrets at once (parallel fetch for efficiency)
 *
 * @param {string[]} secretPaths - Array of secret paths to fetch
 * @returns {Promise<Object>} Object mapping secret paths to their values
 *
 * @example
 * const secrets = await getSecrets([
 *   'clerk/secret-key',
 *   'paddle/api-key',
 *   'sentry/dsn'
 * ]);
 * console.log(secrets['clerk/secret-key']);
 */
async function getSecrets(secretPaths) {
    const secretPromises = secretPaths.map(async (path) => {
        const value = await getSecret(path);
        return { path, value };
    });

    const results = await Promise.all(secretPromises);

    const secretsObject = {};
    results.forEach(({ path, value }) => {
        secretsObject[path] = value;
    });

    return secretsObject;
}

/**
 * Clear the secret cache (useful for testing or forced refresh)
 * Note: Cache is automatically cleared when Lambda container is recycled
 */
function clearSecretCache() {
    Object.keys(secretCache).forEach(key => delete secretCache[key]);
    console.log('Secret cache cleared');
}

/**
 * Check if a secret is cached
 * @param {string} secretPath - The secret path to check
 * @returns {boolean} True if secret is in cache
 */
function isSecretCached(secretPath) {
    return secretPath in secretCache;
}

module.exports = {
    getSecret,
    getSecrets,
    clearSecretCache,
    isSecretCached
};
