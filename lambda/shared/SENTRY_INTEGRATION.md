# Sentry Integration Guide for Lambda Functions

This guide explains how to integrate Sentry error tracking into your Lambda functions.

## Quick Start

### Option 1: Wrap the Entire Handler (Recommended)

This is the simplest approach and automatically captures all errors:

```javascript
const { wrapHandler } = require('./shared/sentry');
const { createResponse, createErrorResponse, getUserIdFromEvent } = require('./shared/multi-table-utils');

// Your original handler function
async function myHandler(event, context) {
    const userId = getUserIdFromEvent(event);

    // Your lambda logic here
    // Errors thrown here will be automatically captured

    return createResponse(200, { success: true });
}

// Export the wrapped handler
exports.handler = wrapHandler(myHandler);
```

### Option 2: Manual Error Capture

Use this when you need more control over error reporting:

```javascript
const { captureException, captureMessage, addBreadcrumb } = require('./shared/sentry');
const { createResponse, createErrorResponse } = require('./shared/multi-table-utils');

exports.handler = async (event) => {
    try {
        // Add breadcrumb for debugging
        addBreadcrumb({
            message: 'Processing request',
            category: 'lambda',
            data: { path: event.path }
        });

        // Your lambda logic here

        return createResponse(200, { success: true });

    } catch (error) {
        // Capture the exception with additional context
        captureException(error, {
            functionName: 'myLambdaFunction',
            eventData: event
        });

        return createErrorResponse(500, 'Internal server error', error);
    }
};
```

### Option 3: Capture Messages (Info/Warning)

```javascript
const { captureMessage } = require('./shared/sentry');

// Capture an info message
captureMessage('User performed important action', 'info');

// Capture a warning
captureMessage('Unusual activity detected', 'warning');
```

## Environment Variables

Set these environment variables for your Lambda functions:

```bash
SENTRY_DSN=https://a03183645096b8be557a31afbed9889d@o4510329645891584.ingest.de.sentry.io/4510329647267920
ENVIRONMENT=production  # or development, staging, etc.
SENTRY_TRACES_SAMPLE_RATE=1.0  # 0.0 to 1.0 (1.0 = 100%)
```

## What Gets Captured Automatically

When using `wrapHandler`, Sentry automatically captures:

1. **Lambda Context**:
   - Function name and version
   - Request ID
   - AWS region

2. **User Information** (from Cognito authorizer):
   - User ID (sub)
   - Username
   - Email
   - Company ID
   - Role

3. **Request Information**:
   - API Gateway ID
   - HTTP method
   - Resource path

4. **Errors**:
   - All unhandled exceptions
   - Stack traces
   - Error messages

## Example: Converting an Existing Lambda

**Before:**
```javascript
exports.handler = async (event) => {
    try {
        // Lambda logic
        return createResponse(200, { success: true });
    } catch (error) {
        console.error('Error:', error);
        return createErrorResponse(500, 'Error', error);
    }
};
```

**After:**
```javascript
const { wrapHandler } = require('./shared/sentry');

async function handler(event, context) {
    // Lambda logic (no try-catch needed)
    return createResponse(200, { success: true });
}

exports.handler = wrapHandler(handler);
```

## Testing

To test Sentry integration:

```javascript
const { captureMessage } = require('./shared/sentry');

exports.handler = async (event) => {
    // This will appear in Sentry dashboard
    captureMessage('Test message from Lambda', 'info');

    // This will also appear in Sentry
    throw new Error('Test error for Sentry');
};
```

## Local Development

Sentry events are **not sent** when `IS_LOCAL=true` environment variable is set. They will be logged to console instead.

## Best Practices

1. **Use `wrapHandler` for all Lambda functions** - It's the easiest way to get comprehensive error tracking
2. **Add breadcrumbs** for important operations - Helps debug issues
3. **Set appropriate sample rates** in production - Balance cost vs visibility
4. **Don't log sensitive data** - PII is automatically filtered, but be cautious
5. **Test in staging first** - Verify Sentry is working before deploying to production

## Additional Resources

- [Sentry AWS Lambda Documentation](https://docs.sentry.io/platforms/node/guides/aws-lambda/)
- [Error Handling Best Practices](https://docs.sentry.io/platforms/node/guides/aws-lambda/best-practices/)
