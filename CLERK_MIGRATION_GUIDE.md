# Clerk Authentication Migration Guide

## Overview
This guide documents the migration from AWS Cognito to Clerk for authentication, solving the persistent 403 CORS errors on DELETE operations and providing a more modern, developer-friendly authentication solution.

## Why Clerk?

### Problems with Current Cognito Setup:
1. **403 CORS Errors**: DELETE methods configured with AWS_IAM instead of COGNITO_USER_POOLS
2. **Complex Configuration**: Multiple auth types causing confusion
3. **Limited Multi-tenancy**: Difficult to implement proper organization-based isolation
4. **Deployment Complexity**: Requires deep AWS knowledge to troubleshoot

### Clerk Advantages:
1. **Built-in Multi-tenancy**: Native organization support
2. **Simple Integration**: Consistent authentication across frontend and backend
3. **Better Developer Experience**: Clear documentation and debugging tools
4. **Paddle Integration Ready**: Works seamlessly with subscription management
5. **No CORS Issues**: Proper REST API authentication without AWS-specific complexities

## Setup Instructions

### Step 1: Create Clerk Account

1. Go to [clerk.com](https://clerk.com) and sign up
2. Create a new application called "Construction Expenses"
3. Configure authentication methods:
   - Enable Email/Password
   - Enable Organizations (for multi-tenancy)
   - Optional: Enable Social logins (Google, GitHub, etc.)

4. Get your credentials from the Clerk Dashboard:
   - **Publishable Key**: `pk_test_...` or `pk_live_...`
   - **Secret Key**: `sk_test_...` or `sk_live_...`
   - **Frontend API**: `https://your-app.clerk.accounts.dev`

### Step 2: Configure Environment Variables

Create a `.env.local` file with your Clerk credentials:

```bash
# Clerk Configuration
CLERK_PUBLISHABLE_KEY=pk_test_your_actual_key_here
CLERK_SECRET_KEY=sk_test_your_actual_secret_here
CLERK_FRONTEND_API=https://your-app.clerk.accounts.dev

# Enable backward compatibility during migration
ALLOW_DEFAULT_USER=true
ALLOW_DEFAULT_COMPANY=true
```

### Step 3: Update Frontend Configuration

1. Update `frontend/index.html` to include Clerk configuration:

```javascript
// Add at the top of the script section
window.CLERK_PUBLISHABLE_KEY = 'pk_test_your_actual_key_here';
window.CLERK_FRONTEND_API = 'https://your-app.clerk.accounts.dev';
```

2. Include the Clerk authentication module:

```html
<!-- Add before your main script -->
<script src="clerk-auth.js"></script>
```

3. Replace Cognito authentication calls with Clerk:

```javascript
// OLD (Cognito)
const token = await getIdToken();

// NEW (Clerk)
const token = await ClerkAuth.getAuthToken();
```

### Step 4: Deploy Updated Lambda Functions

The new Clerk-compatible Lambda functions have been created:
- `deleteProjectClerk.js`
- `deleteContractorClerk.js`
- `deleteWorkClerk.js`

To deploy them:

1. Package the Lambda functions:
```bash
npm run package:lambda
```

2. Deploy to AWS:
```bash
# Deploy each function
aws lambda update-function-code \
  --function-name construction-expenses-delete-project \
  --zip-file fileb://dist/deleteProjectClerk.zip

aws lambda update-function-code \
  --function-name construction-expenses-delete-contractor \
  --zip-file fileb://dist/deleteContractorClerk.zip

aws lambda update-function-code \
  --function-name construction-expenses-delete-work \
  --zip-file fileb://dist/deleteWorkClerk.zip
```

3. Update Lambda environment variables:
```bash
aws lambda update-function-configuration \
  --function-name construction-expenses-delete-project \
  --environment Variables="{CLERK_SECRET_KEY=sk_test_your_key}"
```

### Step 5: Update API Gateway

Remove AWS_IAM authorization from DELETE methods:

```bash
# Update DELETE methods to remove authorization
aws apigateway update-method \
  --rest-api-id 2woj5i92td \
  --resource-id [resource-id] \
  --http-method DELETE \
  --patch-operations op=remove,path=/authorizationType

# Deploy changes
aws apigateway create-deployment \
  --rest-api-id 2woj5i92td \
  --stage-name production
```

## File Changes Summary

### New Files Created:
1. `/lambda/shared/clerk-auth.js` - Backend Clerk authentication middleware
2. `/frontend/clerk-auth.js` - Frontend Clerk authentication module
3. `/lambda/deleteProjectClerk.js` - Clerk-compatible delete project function
4. `/lambda/deleteContractorClerk.js` - Clerk-compatible delete contractor function
5. `/lambda/deleteWorkClerk.js` - Clerk-compatible delete work function

### Files to Update:
1. `/frontend/index.html` - Replace Cognito auth with Clerk
2. `/.env.production` - Add Clerk credentials
3. `/scripts/package-lambdas.js` - Include new Lambda functions

## Testing the Migration

### 1. Test Authentication Flow:

```javascript
// In browser console
await ClerkAuth.initialize();
await ClerkAuth.showSignIn();
const token = await ClerkAuth.getAuthToken();
console.log('Token:', token);
```

### 2. Test DELETE Operations:

```javascript
// Test delete project
const response = await fetch('/api/projects/test-project-id', {
  method: 'DELETE',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});
console.log('Delete response:', response.status);
```

### 3. Test Organization Management:

```javascript
// Create organization
const org = await ClerkAuth.createOrganization('Test Company', 'test-company');

// Invite user
await ClerkAuth.inviteToOrganization('user@example.com', 'member');

// List members
const members = await ClerkAuth.getOrganizationMembers();
```

## User Migration Strategy

### Phase 1: Parallel Running (Recommended)
1. Keep both Cognito and Clerk active
2. New users sign up through Clerk
3. Existing users gradually migrate
4. Set `ALLOW_DEFAULT_USER=true` for backward compatibility

### Phase 2: Batch Migration
Use the migration script to transfer users:

```javascript
// user-migration.js
const migrationScript = require('./scripts/migrate-users-to-clerk');
await migrationScript.migrateAllUsers();
```

### Phase 3: Cleanup
After all users migrated:
1. Remove Cognito configuration
2. Delete Cognito User Pool
3. Remove old Lambda functions
4. Set `ALLOW_DEFAULT_USER=false`

## Troubleshooting

### Common Issues:

1. **"Invalid token" errors**
   - Check CLERK_SECRET_KEY is set in Lambda environment
   - Verify token is being sent in Authorization header
   - Ensure Clerk SDK is initialized

2. **CORS errors persist**
   - Verify API Gateway methods have CORS headers
   - Check OPTIONS methods return 200
   - Ensure Authorization header is allowed

3. **Organization not found**
   - Users must be part of an organization
   - Create default organization for migrated users
   - Check organization ID in token claims

### Debug Commands:

```bash
# Check Lambda logs
aws logs tail /aws/lambda/construction-expenses-delete-project --follow

# Test Lambda directly
aws lambda invoke \
  --function-name construction-expenses-delete-project \
  --payload '{"headers":{"Authorization":"Bearer TOKEN"}}' \
  response.json

# Check API Gateway configuration
aws apigateway get-method \
  --rest-api-id 2woj5i92td \
  --resource-id [resource-id] \
  --http-method DELETE
```

## Rollback Plan

If issues arise, rollback to Cognito:

1. Restore original Lambda functions:
```bash
aws lambda update-function-code \
  --function-name construction-expenses-delete-project \
  --zip-file fileb://backup/deleteProject.zip
```

2. Re-enable Cognito authorization:
```bash
aws apigateway update-method \
  --rest-api-id 2woj5i92td \
  --resource-id [resource-id] \
  --http-method DELETE \
  --patch-operations op=replace,path=/authorizationType,value=COGNITO_USER_POOLS
```

3. Restore frontend Cognito code:
```bash
git checkout -- frontend/index.html
```

## Next Steps

1. **Immediate**: Set up Clerk account and add credentials
2. **Today**: Deploy Clerk Lambda functions
3. **This Week**: Test with pilot users
4. **Next Week**: Migrate all users
5. **End of Month**: Remove Cognito completely

## Support

- Clerk Documentation: https://clerk.com/docs
- Clerk Support: support@clerk.com
- Our Issues: Track in GitHub Issues

## Conclusion

This migration solves the critical 403 CORS errors while providing:
- Better developer experience
- Native multi-tenancy support
- Simplified authentication flow
- Ready integration with Paddle billing
- Audit trail capabilities

The migration can be done gradually with minimal risk using the parallel running strategy.