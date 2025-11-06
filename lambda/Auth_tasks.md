# User Authentication Implementation Tasks

## Overview
Implement user authentication using AWS Cognito to secure the construction expenses application. This will enable multi-user support while maintaining the current functionality.

## Architecture Decision
- **Authentication Service**: AWS Cognito User Pool
- **Authorization**: Cognito JWT tokens
- **API Security**: API Gateway Cognito Authorizer
- **Frontend**: Cognito SDK for authentication UI
- **Backend**: Extract user ID from Cognito claims

---

## Phase 1: AWS Cognito Setup

### Task 1.1: Create Cognito User Pool
**Estimated Time**: 30 minutes

```bash
# Create Cognito User Pool
aws cognito-idp create-user-pool \
  --pool-name "construction-expenses-users" \
  --policies '{
    "PasswordPolicy": {
      "MinimumLength": 8,
      "RequireUppercase": false,
      "RequireLowercase": false,
      "RequireNumbers": true,
      "RequireSymbols": false
    }
  }' \
  --auto-verified-attributes email \
  --username-attributes email \
  --schema '[
    {
      "Name": "email",
      "AttributeDataType": "String",
      "Required": true,
      "Mutable": true
    },
    {
      "Name": "name",
      "AttributeDataType": "String", 
      "Required": true,
      "Mutable": true
    }
  ]'
```

**Output**: Save the `UserPoolId` (format: us-east-1_xxxxxxx)

### Task 1.2: Create App Client
**Estimated Time**: 15 minutes

```bash
# Create App Client
aws cognito-idp create-user-pool-client \
  --user-pool-id "us-east-1_YOUR_POOL_ID" \
  --client-name "construction-expenses-client" \
  --generate-secret false \
  --explicit-auth-flows ALLOW_USER_SRP_AUTH ALLOW_REFRESH_TOKEN_AUTH \
  --supported-identity-providers COGNITO \
  --callback-urls '["http://localhost:8080","https://your-s3-url.s3-website-us-east-1.amazonaws.com"]' \
  --logout-urls '["http://localhost:8080","https://your-s3-url.s3-website-us-east-1.amazonaws.com"]' \
  --allowed-o-auth-flows code \
  --allowed-o-auth-scopes openid email profile \
  --allowed-o-auth-flows-user-pool-client true
```

**Output**: Save the `ClientId`

### Task 1.3: Create Cognito Domain
**Estimated Time**: 10 minutes

```bash
# Create custom domain for hosted UI
aws cognito-idp create-user-pool-domain \
  --domain "construction-expenses-auth" \
  --user-pool-id "us-east-1_YOUR_POOL_ID"
```

---

## Phase 2: API Gateway Integration

### Task 2.1: Create Cognito Authorizer
**Estimated Time**: 20 minutes

```bash
# Add Cognito authorizer to existing API Gateway
aws apigateway create-authorizer \
  --rest-api-id "YOUR_API_ID" \
  --name "CognitoAuthorizer" \
  --type COGNITO_USER_POOLS \
  --provider-arns "arn:aws:cognito-idp:us-east-1:YOUR_ACCOUNT_ID:userpool/us-east-1_YOUR_POOL_ID" \
  --identity-source "method.request.header.Authorization"
```

### Task 2.2: Update API Resources with Authorization
**Estimated Time**: 45 minutes

For each API method (GET, POST, PUT, DELETE on all resources), update to use the authorizer:

```bash
# Example for expenses POST method
aws apigateway update-method \
  --rest-api-id "YOUR_API_ID" \
  --resource-id "YOUR_RESOURCE_ID" \
  --http-method POST \
  --patch-ops op=replace,path=/authorizationType,value=COGNITO_USER_POOLS \
  --patch-ops op=replace,path=/authorizerId,value=YOUR_AUTHORIZER_ID
```

**Resources to update**:
- `/projects` - GET, POST, DELETE
- `/contractors` - GET, POST, DELETE  
- `/expenses` - GET, POST, PUT, DELETE
- `/works` - GET, POST, DELETE

---

## Phase 3: Lambda Functions Update

### Task 3.1: Update Utility Functions
**Estimated Time**: 30 minutes

**File**: `lambda/shared/multi-table-utils.js`

```javascript
// Replace the getUserIdFromEvent function
function getUserIdFromEvent(event) {
    // Extract user ID from Cognito JWT token
    if (event.requestContext && event.requestContext.authorizer && event.requestContext.authorizer.claims) {
        const userId = event.requestContext.authorizer.claims.sub;
        if (userId) {
            return userId;
        }
    }
    
    throw new Error('User ID not found in event context - authentication required');
}
```

### Task 3.2: Test Lambda Function Updates
**Estimated Time**: 15 minutes per function

Test each Lambda function with mock Cognito event:

```javascript
// Mock event structure for testing
const mockEvent = {
    requestContext: {
        authorizer: {
            claims: {
                sub: "test-user-123",
                email: "test@example.com",
                name: "Test User"
            }
        }
    },
    // ... rest of event data
};
```

---

## Phase 4: Frontend Integration

### Task 4.1: Add Cognito SDK
**Estimated Time**: 15 minutes

**File**: `frontend/index.html`

Add to the `<head>` section:
```html
<!-- AWS Cognito SDK -->
<script src="https://sdk.amazonaws.com/js/aws-sdk-2.1498.0.min.js"></script>
<script src="https://unpkg.com/amazon-cognito-identity-js@6.3.12/dist/amazon-cognito-identity.min.js"></script>
```

### Task 4.2: Add Authentication Configuration
**Estimated Time**: 20 minutes

Add at the beginning of the JavaScript section:

```javascript
// Cognito Configuration
const COGNITO_CONFIG = {
    userPoolId: 'us-east-1_YOUR_POOL_ID',
    clientId: 'YOUR_CLIENT_ID',
    region: 'us-east-1',
    domain: 'construction-expenses-auth.auth.us-east-1.amazoncognito.com'
};

// Initialize Cognito User Pool
const poolData = {
    UserPoolId: COGNITO_CONFIG.userPoolId,
    ClientId: COGNITO_CONFIG.clientId
};
const userPool = new AmazonCognitoIdentity.CognitoUserPool(poolData);
```

### Task 4.3: Create Authentication UI
**Estimated Time**: 60 minutes

Add login/logout UI and functions:

```html
<!-- Add to body, before main content -->
<div id="authContainer" style="display: none;">
    <div class="auth-modal">
        <h2>התחברות למערכת</h2>
        <button onclick="signIn()" class="auth-button">התחבר</button>
    </div>
</div>

<div id="userInfo" style="display: none;">
    <div class="user-bar">
        <span id="userName">שלום, משתמש</span>
        <button onclick="signOut()" class="logout-btn">התנתק</button>
    </div>
</div>
```

### Task 4.4: Implement Authentication Functions
**Estimated Time**: 90 minutes

```javascript
// Authentication functions
function checkAuthState() {
    const currentUser = userPool.getCurrentUser();
    if (currentUser != null) {
        currentUser.getSession((err, session) => {
            if (err || !session.isValid()) {
                showAuthModal();
                return;
            }
            // User is authenticated
            showMainApp();
            updateUserInfo(currentUser);
        });
    } else {
        showAuthModal();
    }
}

function signIn() {
    const authUrl = `https://${COGNITO_CONFIG.domain}/login?client_id=${COGNITO_CONFIG.clientId}&response_type=code&scope=openid+email+profile&redirect_uri=${window.location.origin}`;
    window.location.href = authUrl;
}

function signOut() {
    const currentUser = userPool.getCurrentUser();
    if (currentUser) {
        currentUser.signOut();
    }
    const signOutUrl = `https://${COGNITO_CONFIG.domain}/logout?client_id=${COGNITO_CONFIG.clientId}&logout_uri=${window.location.origin}`;
    window.location.href = signOutUrl;
}

function showAuthModal() {
    document.getElementById('authContainer').style.display = 'flex';
    document.getElementById('mainContent').style.display = 'none';
    document.getElementById('userInfo').style.display = 'none';
}

function showMainApp() {
    document.getElementById('authContainer').style.display = 'none';
    document.getElementById('mainContent').style.display = 'block';
    document.getElementById('userInfo').style.display = 'block';
}
```

### Task 4.5: Update API Calls with Auth Headers
**Estimated Time**: 45 minutes

Update all fetch calls to include Authorization header:

```javascript
// Add to all API functions
async function makeAuthenticatedRequest(url, options = {}) {
    const currentUser = userPool.getCurrentUser();
    if (!currentUser) {
        throw new Error('No authenticated user');
    }
    
    return new Promise((resolve, reject) => {
        currentUser.getSession((err, session) => {
            if (err || !session.isValid()) {
                reject(new Error('Invalid session'));
                return;
            }
            
            const token = session.getIdToken().getJwtToken();
            const authOptions = {
                ...options,
                headers: {
                    ...options.headers,
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            };
            
            fetch(url, authOptions)
                .then(response => resolve(response))
                .catch(error => reject(error));
        });
    });
}
```

---

## Phase 5: Testing & Deployment

### Task 5.1: Local Testing
**Estimated Time**: 60 minutes

1. Test user registration flow
2. Test login/logout functionality  
3. Test API calls with authentication
4. Test error handling for unauthenticated requests

### Task 5.2: Create Test Users
**Estimated Time**: 15 minutes

```bash
# Create test user
aws cognito-idp admin-create-user \
  --user-pool-id "us-east-1_YOUR_POOL_ID" \
  --username "test@example.com" \
  --user-attributes Name=email,Value="test@example.com" Name=name,Value="Test User" \
  --temporary-password "TempPass123!" \
  --message-action SUPPRESS
```

### Task 5.3: Deploy to Production
**Estimated Time**: 30 minutes

1. Update S3 frontend with auth changes
2. Deploy Lambda function updates
3. Update API Gateway and deploy
4. Test production environment

---

## Phase 6: User Management

### Task 6.1: Admin Functions (Optional)
**Estimated Time**: 120 minutes

Create admin interface for:
- User management
- Role assignment  
- Usage monitoring

### Task 6.2: User Profile Management
**Estimated Time**: 60 minutes

Allow users to:
- Update profile information
- Change password
- Delete account

---

## Configuration Files Needed

### Task C.1: Environment Configuration
Create `frontend/auth-config.js`:
```javascript
window.AUTH_CONFIG = {
    userPoolId: 'us-east-1_YOUR_POOL_ID',
    clientId: 'YOUR_CLIENT_ID',
    region: 'us-east-1',
    domain: 'construction-expenses-auth.auth.us-east-1.amazoncognito.com',
    apiBaseUrl: 'https://YOUR_API_ID.execute-api.us-east-1.amazonaws.com/prod'
};
```

---

## Testing Checklist

- [ ] User can register new account
- [ ] User can login with email/password
- [ ] User stays logged in on page refresh
- [ ] Unauthenticated requests are blocked
- [ ] User can logout successfully
- [ ] Multiple users can have separate data
- [ ] API calls include proper auth headers
- [ ] Error handling works for expired tokens

---

## Estimated Total Time: 8-10 hours

## Security Considerations

1. **HTTPS Only**: Ensure all communication uses HTTPS
2. **Token Expiration**: Configure reasonable token lifetimes
3. **CORS**: Configure proper CORS policies
4. **Input Validation**: Validate all user inputs
5. **Error Messages**: Don't leak sensitive information in errors

## Rollback Plan

1. Keep current `getUserIdFromEvent` function as backup
2. API Gateway authorizer can be disabled quickly
3. Frontend can fall back to single-user mode
4. Database structure already supports multi-user

---

*Note: Replace all YOUR_* placeholders with actual values during implementation.*