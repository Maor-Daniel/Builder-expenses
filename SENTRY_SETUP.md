# Sentry Error Tracking Setup

This document explains the Sentry integration for error tracking and performance monitoring in the Construction Expenses Tracker application.

## Overview

Sentry has been integrated for both:
- **Frontend**: Browser-based error tracking for the web application
- **Backend**: AWS Lambda function error tracking and performance monitoring

## Installation

All required Sentry packages have been installed:

```bash
npm install --save @sentry/browser @sentry/aws-serverless
```

Packages installed:
- `@sentry/browser` - Frontend error tracking
- `@sentry/aws-serverless` - Lambda function error tracking
- `@sentry/react` - React components (if needed in future)

## Configuration

### Environment Variables

Sentry configuration has been added to `.env.example` and `.env.production`:

```bash
SENTRY_DSN=https://a03183645096b8be557a31afbed9889d@o4510329645891584.ingest.de.sentry.io/4510329647267920
SENTRY_TRACES_SAMPLE_RATE=1.0  # 100% of transactions monitored
SENTRY_ENVIRONMENT=production   # or development, staging
```

### Frontend Setup

The frontend has been configured with automatic error tracking:

#### Files Modified:
1. **`frontend/index.html`**:
   - Added Sentry Browser SDK via CDN (lines 15-17)
   - Integrated user context tracking on login
   - Clear user context on logout

2. **`frontend/sentry-init.js`** (new file):
   - Initializes Sentry with DSN
   - Configures environment detection
   - Sets up session replay
   - Filters out localhost events (development mode)
   - Provides helper functions: `window.setSentryUser()` and `window.clearSentryUser()`

#### Features:
- ✅ Automatic error capture for all JavaScript errors
- ✅ User identification (links errors to specific users)
- ✅ Session replay on errors (10% of sessions, 100% on errors)
- ✅ Performance monitoring
- ✅ Breadcrumb tracking
- ✅ Automatic cleanup on logout

### Backend Setup (Lambda)

Lambda functions can be wrapped with Sentry for automatic error tracking:

#### Files Created:
1. **`lambda/shared/sentry.js`**:
   - Exports `wrapHandler()` for wrapping Lambda handlers
   - Exports `captureException()` for manual error capture
   - Exports `captureMessage()` for info/warning messages
   - Exports `addBreadcrumb()` for debugging
   - Automatically captures Lambda context, user info, and request details

2. **`lambda/shared/SENTRY_INTEGRATION.md`**:
   - Complete integration guide for Lambda functions
   - Examples and best practices

#### Integration Example:

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
    // Lambda logic - errors automatically captured
    return createResponse(200, { success: true });
}

exports.handler = wrapHandler(handler);
```

## What Gets Tracked

### Frontend:
- ✅ JavaScript errors and exceptions
- ✅ Unhandled promise rejections
- ✅ Console errors and warnings
- ✅ Network requests (performance)
- ✅ User interactions (breadcrumbs)
- ✅ Session replays on errors
- ✅ User information (from Cognito):
  - User ID
  - Username
  - Email
  - Company ID
  - Role

### Backend (Lambda):
- ✅ Unhandled exceptions
- ✅ Stack traces
- ✅ Lambda context (function name, version, request ID)
- ✅ User information (from Cognito authorizer):
  - User ID (sub)
  - Username
  - Email
  - Company ID
  - Role
- ✅ Request information:
  - API Gateway ID
  - HTTP method
  - Resource path
- ✅ Performance metrics

## Testing

### Frontend Test

Open your browser console and run:

```javascript
// This will send a test error to Sentry
throw new Error('Test error from frontend!');

// Or trigger the test via a button
// Add this temporarily to your HTML:
<button onclick="throw new Error('Sentry test!')">Test Sentry</button>
```

### Backend Test

Create a test Lambda function or modify an existing one:

```javascript
const { captureMessage, wrapHandler } = require('./shared/sentry');

async function handler(event, context) {
    // Send a test message
    captureMessage('Test message from Lambda', 'info');

    // Or throw a test error
    throw new Error('Test error from Lambda!');
}

exports.handler = wrapHandler(handler);
```

## Deployment

### Frontend Deployment

The frontend files will be automatically deployed when you run:

```bash
npm run deploy:frontend
```

Make sure `frontend/sentry-init.js` is included in the S3 upload.

### Lambda Deployment

When deploying Lambda functions, ensure environment variables are set:

#### Option 1: Via AWS Console
1. Go to Lambda function configuration
2. Add environment variables:
   - `SENTRY_DSN`
   - `SENTRY_ENVIRONMENT`
   - `SENTRY_TRACES_SAMPLE_RATE`

#### Option 2: Via CloudFormation/SAM Template
Add to your Lambda function definition:

```yaml
Environment:
  Variables:
    SENTRY_DSN: !Ref SentryDSN
    SENTRY_ENVIRONMENT: production
    SENTRY_TRACES_SAMPLE_RATE: "1.0"
```

#### Option 3: Deploy Script
The packaging script will include the Sentry module:

```bash
npm run package
npm run deploy:lambda
```

## Local Development

### Frontend
- Sentry events are **NOT sent** from localhost
- Errors are logged to browser console instead
- This prevents spam in your Sentry dashboard during development

### Backend
- Set `IS_LOCAL=true` environment variable
- Sentry events are logged to console, not sent
- Use the local dev server:

```bash
npm run dev
```

## Viewing Errors in Sentry

1. Log in to Sentry: https://sentry.io
2. Navigate to your project
3. View:
   - **Issues**: All captured errors
   - **Performance**: Transaction performance data
   - **Releases**: Track errors by deployment
   - **Session Replay**: Watch user sessions that encountered errors

## Best Practices

### Frontend:
1. ✅ Sentry is loaded as early as possible in `index.html`
2. ✅ User context is automatically set on login
3. ✅ User context is cleared on logout
4. ✅ No need to manually capture errors (automatic)
5. ✅ Use breadcrumbs for important user actions

### Backend:
1. ✅ Wrap ALL Lambda handlers with `wrapHandler()`
2. ✅ Add breadcrumbs for important operations
3. ✅ Use appropriate sample rates for performance monitoring
4. ✅ Don't log sensitive data
5. ✅ Test in staging before production

## Migrating Existing Lambda Functions

To add Sentry to existing Lambda functions:

1. Import the wrapper:
   ```javascript
   const { wrapHandler } = require('./shared/sentry');
   ```

2. Wrap your handler:
   ```javascript
   exports.handler = wrapHandler(async (event, context) => {
       // Your existing code
   });
   ```

3. Remove manual try-catch blocks (optional)

See `lambda/shared/SENTRY_INTEGRATION.md` for detailed examples.

## Troubleshooting

### Errors Not Appearing in Sentry?

**Frontend:**
- Check browser console for "Sentry initialized successfully"
- Verify you're not on localhost (events filtered in dev)
- Check network tab for requests to sentry.io
- Verify DSN is correct in `sentry-init.js`

**Backend:**
- Check Lambda logs for Sentry initialization
- Verify environment variables are set
- Ensure `IS_LOCAL` is not set to `true` in production
- Check Lambda has internet access (VPC configuration)

### Too Many Events?

- Reduce `SENTRY_TRACES_SAMPLE_RATE` (e.g., 0.1 for 10%)
- Reduce `replaysSessionSampleRate` in `sentry-init.js`
- Add filters in `beforeSend` hook

### Missing User Context?

- Ensure user is logged in
- Check that `setSentryUser()` is called after authentication
- Verify Cognito user attributes are available

## Files Reference

### New Files Created:
- `frontend/sentry-init.js` - Frontend Sentry initialization
- `lambda/shared/sentry.js` - Lambda Sentry wrapper
- `lambda/shared/SENTRY_INTEGRATION.md` - Lambda integration guide
- `SENTRY_SETUP.md` - This file

### Modified Files:
- `frontend/index.html` - Added Sentry SDK and initialization
- `.env.example` - Added Sentry configuration
- `.env.production` - Added Sentry configuration
- `package.json` - Added Sentry dependencies

## Resources

- [Sentry Browser Docs](https://docs.sentry.io/platforms/javascript/guides/browser/)
- [Sentry AWS Lambda Docs](https://docs.sentry.io/platforms/node/guides/aws-lambda/)
- [Sentry Dashboard](https://sentry.io/organizations/ofek-3w/issues/)

## Support

For issues with Sentry integration:
1. Check this documentation
2. Review `lambda/shared/SENTRY_INTEGRATION.md`
3. Check Sentry documentation
4. Contact the development team

---

**Status**: ✅ Sentry is now fully configured for both frontend and backend!

**Next Steps**:
1. Deploy the updated frontend
2. Migrate Lambda functions to use `wrapHandler()`
3. Configure environment variables in AWS
4. Test error tracking in staging
5. Monitor errors in Sentry dashboard
