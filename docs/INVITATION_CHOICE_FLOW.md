# Invitation Choice Flow - Mobile Implementation Guide

## Overview

When a user with a pending invitation signs up or signs in, the app should detect this and present them with a choice:
1. **Join the company** they were invited to
2. **Create a new company** instead

This prevents users from accidentally creating duplicate companies when they were meant to join an existing one.

---

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                     User Signs In / Signs Up                         │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│              GET /company (Check if user has a company)              │
│                    Authorization: Bearer <JWT>                       │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
                    ▼                           ▼
            ┌───────────────┐          ┌───────────────┐
            │ Has Company   │          │ No Company    │
            │ (200 OK)      │          │ (404/error)   │
            └───────────────┘          └───────────────┘
                    │                           │
                    ▼                           ▼
            ┌───────────────┐   ┌─────────────────────────────────────┐
            │ Go to Main    │   │ GET /check-pending-invitations      │
            │ App Screen    │   │     ?email={user_email}             │
            └───────────────┘   │     Authorization: Bearer <JWT>     │
                                └─────────────────────────────────────┘
                                                │
                                  ┌─────────────┴─────────────┐
                                  │                           │
                                  ▼                           ▼
                         ┌───────────────┐          ┌───────────────┐
                         │ Has Pending   │          │ No Pending    │
                         │ Invitations   │          │ Invitations   │
                         └───────────────┘          └───────────────┘
                                  │                           │
                                  ▼                           ▼
                    ┌─────────────────────────┐    ┌───────────────┐
                    │ Show Invitation Choice  │    │ Show Company  │
                    │ Modal/Screen            │    │ Registration  │
                    └─────────────────────────┘    └───────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
                    ▼                           ▼
            ┌───────────────┐          ┌───────────────┐
            │ User Chooses  │          │ User Chooses  │
            │ "Join Company"│          │ "Create New"  │
            └───────────────┘          └───────────────┘
                    │                           │
                    ▼                           ▼
       ┌────────────────────────┐    ┌───────────────┐
       │ POST /accept-invitation│    │ Show Company  │
       │ { token: invitationId }│    │ Registration  │
       └────────────────────────┘    └───────────────┘
                    │
                    ▼
            ┌───────────────┐
            │ Go to Main    │
            │ App Screen    │
            └───────────────┘
```

---

## API Endpoints

### Base URL
```
https://2woj5i92td.execute-api.us-east-1.amazonaws.com/prod
```

### Authentication
All endpoints require Clerk JWT authentication:
```
Authorization: Bearer <clerk_jwt_token>
```

---

## Step 1: Check if User Has a Company

### Request
```http
GET /company
Authorization: Bearer <jwt_token>
```

### Response - User Has Company
```json
{
  "success": true,
  "companyExists": true,
  "company": {
    "companyId": "user_abc123",
    "name": "My Construction Co",
    "tier": "professional",
    ...
  }
}
```
**Action**: Proceed to main app screen.

### Response - No Company
```json
{
  "success": false,
  "message": "Company not found"
}
```
Or HTTP 404/403 error.

**Action**: Proceed to Step 2.

---

## Step 2: Check for Pending Invitations

### Request
```http
GET /check-pending-invitations?email={user_email}
Authorization: Bearer <jwt_token>
```

| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| email     | string | Yes      | User's email address (URL encoded) |

### Response - Has Invitations
```json
{
  "success": true,
  "hasInvitations": true,
  "invitations": [
    {
      "invitationId": "inv_abc123xyz",
      "companyId": "user_owner123",
      "companyName": "ABC Construction Ltd",
      "role": "viewer",
      "invitedBy": "john@abc.com",
      "createdAt": "2025-12-20T10:30:00.000Z"
    },
    {
      "invitationId": "inv_def456uvw",
      "companyId": "user_owner456",
      "companyName": "XYZ Builders",
      "role": "admin",
      "invitedBy": "jane@xyz.com",
      "createdAt": "2025-12-22T14:00:00.000Z"
    }
  ]
}
```
**Action**: Show invitation choice UI (Step 3).

### Response - No Invitations
```json
{
  "success": true,
  "hasInvitations": false,
  "invitations": []
}
```
**Action**: Show company registration screen.

### Error Responses
```json
// 400 Bad Request - Missing email
{ "message": "Email is required" }

// 401 Unauthorized - Invalid/missing token
{ "message": "Unauthorized" }

// 500 Internal Server Error
{ "message": "Failed to check invitations" }
```

---

## Step 3: Display Invitation Choice UI

### UI Requirements

Display a modal or screen with:

1. **Header**: "You have pending invitations!" (Hebrew: "יש לך הזמנות ממתינות!")
2. **Subtext**: "Pending invitations to existing companies were found. What would you like to do?"

3. **For each invitation, show a card with**:
   - Company name (`companyName`)
   - Role being offered (`role`) - translate to display name
   - "Join This Company" button

4. **At the bottom**:
   - "Skip and Create New Company" button

### Role Display Names (Hebrew)
```javascript
const roleDisplayNames = {
  'owner': 'בעלים',      // Owner
  'admin': 'מנהל',       // Admin
  'editor': 'עורך',      // Editor
  'viewer': 'צופה'       // Viewer
};
```

---

## Step 4A: Accept Invitation (Join Company)

When user chooses to join a company:

### Request
```http
POST /accept-invitation
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "token": "inv_abc123xyz",
  "name": "User's Full Name",
  "phone": "050-1234567"
}
```

| Field | Type   | Required | Description |
|-------|--------|----------|-------------|
| token | string | Yes      | The `invitationId` from check-pending-invitations |
| name  | string | No       | User's display name (optional, uses Clerk name if not provided) |
| phone | string | No       | User's phone number (optional) |

### Success Response
```json
{
  "success": true,
  "message": "Invitation accepted successfully! You now have access to the company.",
  "data": {
    "user": {
      "id": "user_newuser123",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "viewer"
    },
    "company": {
      "id": "user_owner123",
      "name": "ABC Construction Ltd"
    }
  },
  "timestamp": "2025-12-25T15:30:00.000Z"
}
```
**Action**: Navigate to main app screen. User is now part of the company.

### Error Responses
```json
// 400 Bad Request - Invalid token
{ "message": "Invalid or expired invitation token" }

// 400 Bad Request - Already a member
{ "message": "You are already an active member of this company" }

// 400 Bad Request - Expired
{ "message": "Invitation has expired" }

// 401 Unauthorized
{ "message": "Authentication required - please sign in first" }

// 404 Not Found
{ "message": "Company not found" }
```

---

## Step 4B: Skip Invitations (Create New Company)

When user chooses to create their own company:

### Request
```http
POST /register-company-clerk
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "companyName": "My New Company",
  "ownerName": "John Doe",
  "ownerPhone": "050-1234567"
}
```

This follows the existing company registration flow.

---

## Implementation Notes

### 1. Timing
- Check invitations **immediately after** authentication callback
- The check should happen **before** showing any onboarding screens

### 2. Caching
- Do NOT cache invitation results - always fetch fresh data
- Invitations can be accepted/cancelled at any time

### 3. Expiration
- Invitations expire after **7 days**
- The API filters out expired invitations automatically
- No need to handle expiration client-side

### 4. Multiple Invitations
- Users can have invitations from multiple companies
- Display all valid invitations as selectable cards
- User can only join ONE company (after joining, redirect to app)

### 5. Error Handling
- On any API error during invitation check, fall back to showing registration screen
- Don't block the user if invitation check fails
- Log errors for debugging

### 6. Deep Links (Optional)
- Invitation emails contain direct links: `https://builder-expenses.com/app.html?invitation={token}`
- If user opens app via deep link with `invitation` parameter, skip the check and go directly to accept flow

---

## Code Examples

### Swift (iOS)
```swift
func handleUserAuthenticated(user: ClerkUser) async {
    let token = try await Clerk.shared.session?.getToken()

    // Step 1: Check if user has company
    do {
        let company = try await api.getCompany(token: token)
        navigateToMainApp(company: company)
        return
    } catch {
        // No company - continue to invitation check
    }

    // Step 2: Check for pending invitations
    do {
        let result = try await api.checkPendingInvitations(
            email: user.email,
            token: token
        )

        if result.hasInvitations && !result.invitations.isEmpty {
            showInvitationChoiceScreen(invitations: result.invitations)
        } else {
            showCompanyRegistrationScreen()
        }
    } catch {
        // On error, fall back to registration
        showCompanyRegistrationScreen()
    }
}

func acceptInvitation(invitationId: String) async {
    let token = try await Clerk.shared.session?.getToken()

    do {
        let result = try await api.acceptInvitation(
            token: invitationId,
            authToken: token
        )
        showSuccessMessage("Joined \(result.data.company.name) successfully!")
        navigateToMainApp()
    } catch {
        showErrorMessage(error.localizedDescription)
    }
}
```

### Kotlin (Android)
```kotlin
suspend fun handleUserAuthenticated(user: ClerkUser) {
    val token = Clerk.session?.getToken() ?: return

    // Step 1: Check if user has company
    try {
        val company = api.getCompany(token)
        navigateToMainApp(company)
        return
    } catch (e: Exception) {
        // No company - continue
    }

    // Step 2: Check for pending invitations
    try {
        val result = api.checkPendingInvitations(
            email = user.email,
            token = token
        )

        if (result.hasInvitations && result.invitations.isNotEmpty()) {
            showInvitationChoiceScreen(result.invitations)
        } else {
            showCompanyRegistrationScreen()
        }
    } catch (e: Exception) {
        // On error, fall back to registration
        showCompanyRegistrationScreen()
    }
}

suspend fun acceptInvitation(invitationId: String) {
    val token = Clerk.session?.getToken() ?: return

    try {
        val result = api.acceptInvitation(
            token = invitationId,
            authToken = token
        )
        showSuccessMessage("Joined ${result.data.company.name} successfully!")
        navigateToMainApp()
    } catch (e: Exception) {
        showErrorMessage(e.message)
    }
}
```

---

## Testing

### Test Scenarios
1. **User with pending invitation** - Should see invitation choice modal
2. **User with multiple invitations** - Should see all valid invitations listed
3. **User with expired invitation only** - Should go directly to registration
4. **User with no invitations** - Should go directly to registration
5. **User already in a company** - Should skip to main app
6. **Network error during check** - Should fall back to registration

### Test Email
Use `ntur9010@gmail.com` for testing - this user has a pending invitation to "Final Test Company".
