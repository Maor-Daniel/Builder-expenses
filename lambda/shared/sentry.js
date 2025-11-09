/**
 * Sentry initialization and wrapper for AWS Lambda functions
 */

const Sentry = require("@sentry/aws-serverless");

// Initialize Sentry
Sentry.init({
    dsn: process.env.SENTRY_DSN || "https://a03183645096b8be557a31afbed9889d@o4510329645891584.ingest.de.sentry.io/4510329647267920",

    // Set environment
    environment: process.env.ENVIRONMENT || process.env.NODE_ENV || 'production',

    // Performance Monitoring
    tracesSampleRate: process.env.SENTRY_TRACES_SAMPLE_RATE
        ? parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE)
        : 1.0,

    // Session tracking
    autoSessionTracking: true,

    // Capture errors from async handlers
    integrations: [
        Sentry.captureConsoleIntegration({
            levels: ['error', 'warn']
        }),
    ],

    // Before send hook
    beforeSend(event, hint) {
        // Don't send events in local development
        if (process.env.IS_LOCAL === 'true') {
            return null;
        }
        return event;
    },
});

/**
 * Wrap a Lambda handler with Sentry error tracking
 * @param {Function} handler - The Lambda handler function
 * @returns {Function} Wrapped handler
 */
function wrapHandler(handler) {
    return Sentry.wrapHandler(async (event, context) => {
        // Add custom context
        Sentry.setContext("lambda", {
            functionName: context.functionName,
            functionVersion: context.functionVersion,
            requestId: context.requestId,
        });

        // Extract and set user context from Cognito authorizer
        if (event.requestContext && event.requestContext.authorizer) {
            const claims = event.requestContext.authorizer.claims;
            if (claims) {
                Sentry.setUser({
                    id: claims.sub,
                    username: claims['cognito:username'],
                    email: claims.email,
                    companyId: claims['custom:companyId'],
                    role: claims['custom:role'],
                });
            }
        }

        // Add request info to tags
        if (event.requestContext) {
            Sentry.setTag("api_id", event.requestContext.apiId);
            Sentry.setTag("http_method", event.httpMethod);
            Sentry.setTag("resource_path", event.resource);
        }

        try {
            return await handler(event, context);
        } catch (error) {
            // Error will be automatically captured by Sentry wrapper
            throw error;
        }
    });
}

/**
 * Capture an exception manually
 * @param {Error} error - The error to capture
 * @param {Object} context - Additional context
 */
function captureException(error, context = {}) {
    if (context) {
        Sentry.setContext("additional", context);
    }
    Sentry.captureException(error);
}

/**
 * Capture a message manually
 * @param {string} message - The message to capture
 * @param {string} level - The severity level (info, warning, error)
 */
function captureMessage(message, level = 'info') {
    Sentry.captureMessage(message, level);
}

/**
 * Add breadcrumb for debugging
 * @param {Object} breadcrumb - Breadcrumb data
 */
function addBreadcrumb(breadcrumb) {
    Sentry.addBreadcrumb(breadcrumb);
}

module.exports = {
    Sentry,
    wrapHandler,
    captureException,
    captureMessage,
    addBreadcrumb,
};
