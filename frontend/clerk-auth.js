// frontend/clerk-auth.js
// Clerk authentication module for frontend

// Clerk configuration from environment or defaults
const CLERK_PUBLISHABLE_KEY = window.CLERK_PUBLISHABLE_KEY || 'pk_live_Y2xlcmsuYnVpbGRlci1leHBlbnNlcy5jb20k';
const CLERK_FRONTEND_API = window.CLERK_FRONTEND_API || 'https://clerk.builder-expenses.com';

// Initialize Clerk instance
let clerk = null;
let isClerkReady = false;
let lastAuthenticatedUserId = null; // Track to prevent duplicate auth events

/**
 * Initialize Clerk
 */
async function initializeClerk() {
  try {
    console.log('Initializing Clerk with ESM import...');

    // Import Clerk using ESM modules (the working approach)
    const { Clerk } = await import('https://cdn.jsdelivr.net/npm/@clerk/clerk-js@5/+esm');

    // Initialize Clerk instance
    clerk = new Clerk(CLERK_PUBLISHABLE_KEY);
    await clerk.load();

    // Expose Clerk instance globally for app.html compatibility
    window.Clerk = clerk;

    isClerkReady = true;
    console.log('Clerk initialized successfully');

    // Set up listeners
    clerk.addListener(handleClerkUpdate);

    return clerk;
  } catch (error) {
    console.error('Failed to initialize Clerk:', error);
    throw error;
  }
}

/**
 * Handle Clerk session updates
 * Only triggers onUserAuthenticated when user actually logs in (not on token refresh)
 */
function handleClerkUpdate(clerkInstance) {
  const session = clerkInstance.session;
  const user = clerkInstance.user;

  if (session) {
    const userId = user?.id;
    const isNewLogin = lastAuthenticatedUserId !== userId;

    // Only log on new login, not on every Clerk event
    if (isNewLogin) {
      console.log('User authenticated:', user?.emailAddresses[0]?.emailAddress);
    } else {
      console.log('[Clerk] Session update (token refresh) - skipping re-initialization');
      return; // Skip re-initialization on token refresh
    }

    // Store user info for app use
    // Note: The role will be updated from DynamoDB after loading company data
    window.currentUser = {
      id: user.id,
      email: user.emailAddresses[0]?.emailAddress,
      name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username,
      organizationId: session.lastActiveOrganizationId,
      organizationRole: session.organizationPermissions?.[0] || 'member', // Clerk org role (cosmetic)
      role: null, // Actual role will be loaded from DynamoDB
      isAdmin: false // Will be updated from DynamoDB
    };

    console.log('User authenticated (Clerk data):', {
      id: window.currentUser.id,
      email: window.currentUser.email,
      name: window.currentUser.name,
      clerkOrgRole: window.currentUser.organizationRole,
      note: 'Actual role will be loaded from DynamoDB'
    });

    // Update last authenticated user ID
    lastAuthenticatedUserId = userId;

    // Trigger app initialization only on new login
    if (window.onUserAuthenticated) {
      window.onUserAuthenticated(window.currentUser);
    }
  } else {
    console.log('User not authenticated');
    window.currentUser = null;
    lastAuthenticatedUserId = null; // Reset on logout
  }
}

/**
 * Get current authentication token
 */
async function getAuthToken() {
  if (!isClerkReady || !clerk) {
    await initializeClerk();
  }

  const session = clerk.session;
  if (!session) {
    throw new Error('No active session');
  }

  // Get the session token
  const token = await session.getToken();
  return token;
}

/**
 * Check if user is authenticated
 */
function isAuthenticated() {
  return isClerkReady && clerk && clerk.session !== null;
}

/**
 * Get Clerk instance (for custom auth pages)
 * @returns {Promise<Clerk>} Clerk instance
 */
async function getInstance() {
  if (!isClerkReady || !clerk) {
    await initializeClerk();
  }
  return clerk;
}

/**
 * Show organization switcher
 */
async function showOrganizationSwitcher() {
  if (!isClerkReady || !clerk) {
    await initializeClerk();
  }

  clerk.openOrganizationSwitcher({
    appearance: {
      variables: {
        colorPrimary: '#2563eb',
        fontFamily: '"Rubik", sans-serif'
      }
    }
  });
}

/**
 * Show user profile
 */
async function showUserProfile() {
  if (!isClerkReady || !clerk) {
    await initializeClerk();
  }

  clerk.openUserProfile({
    appearance: {
      variables: {
        colorPrimary: '#2563eb',
        fontFamily: '"Rubik", sans-serif'
      }
    }
  });
}

/**
 * Sign out the current user
 */
async function signOut() {
  if (!isClerkReady || !clerk) {
    return;
  }

  await clerk.signOut();
  window.currentUser = null;
  lastAuthenticatedUserId = null; // Reset auth tracking

  // Redirect to home or login page
  if (window.onUserSignedOut) {
    window.onUserSignedOut();
  } else {
    window.location.reload();
  }
}

/**
 * Create a new organization (company)
 */
async function createOrganization(name, slug) {
  if (!isClerkReady || !clerk) {
    await initializeClerk();
  }

  const session = clerk.session;
  if (!session) {
    throw new Error('Must be signed in to create organization');
  }

  const organization = await clerk.createOrganization({
    name: name,
    slug: slug
  });

  // Set as active organization
  await clerk.setActive({ organization: organization.id });

  return organization;
}

/**
 * Invite user to organization
 */
async function inviteToOrganization(email, role = 'member') {
  if (!isClerkReady || !clerk) {
    await initializeClerk();
  }

  const session = clerk.session;
  const activeOrg = session?.lastActiveOrganizationId;

  if (!activeOrg) {
    throw new Error('No active organization');
  }

  const organization = clerk.organization;
  const invitation = await organization.inviteMember({
    emailAddress: email,
    role: role
  });

  return invitation;
}

/**
 * Get current organization members
 */
async function getOrganizationMembers() {
  if (!isClerkReady || !clerk) {
    await initializeClerk();
  }

  const organization = clerk.organization;
  if (!organization) {
    return [];
  }

  const memberships = await organization.getMemberships();
  return memberships.data;
}

/**
 * Update API calls to include Clerk authentication
 */
async function fetchWithAuth(url, options = {}) {
  const token = await getAuthToken();

  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
}

/**
 * Mount Clerk UI components to specific elements
 */
async function mountClerkComponents() {
  if (!isClerkReady || !clerk) {
    await initializeClerk();
  }

  // Mount sign-in button if element exists
  const signInBtn = document.getElementById('clerk-sign-in-btn');
  if (signInBtn && !clerk.user) {
    clerk.mountSignIn(signInBtn);
  }

  // Mount user button if element exists
  const userBtn = document.getElementById('clerk-user-btn');
  if (userBtn && clerk.user) {
    clerk.mountUserButton(userBtn);
  }

  // Mount organization switcher if element exists
  const orgSwitcher = document.getElementById('clerk-org-switcher');
  if (orgSwitcher && clerk.user) {
    clerk.mountOrganizationSwitcher(orgSwitcher);
  }
}

/**
 * Check and refresh token if needed
 */
async function ensureValidToken() {
  if (!isClerkReady || !clerk) {
    await initializeClerk();
  }

  const session = clerk.session;
  if (!session) {
    throw new Error('No active session');
  }

  // Clerk automatically handles token refresh
  return await session.getToken();
}

/**
 * Get user's organizations
 */
async function getUserOrganizations() {
  if (!isClerkReady || !clerk) {
    await initializeClerk();
  }

  const user = clerk.user;
  if (!user) {
    return [];
  }

  const memberships = await user.getOrganizationMemberships();
  return memberships.data.map(m => ({
    id: m.organization.id,
    name: m.organization.name,
    role: m.role,
    slug: m.organization.slug
  }));
}

/**
 * Switch to a different organization
 */
async function switchOrganization(organizationId) {
  if (!isClerkReady || !clerk) {
    await initializeClerk();
  }

  await clerk.setActive({ organization: organizationId });

  // Reload to refresh app state
  window.location.reload();
}

// Export functions for use in the app
window.ClerkAuth = {
  initialize: initializeClerk,
  getInstance,
  getAuthToken,
  isAuthenticated,
  showOrganizationSwitcher,
  showUserProfile,
  signOut,
  createOrganization,
  inviteToOrganization,
  getOrganizationMembers,
  fetchWithAuth,
  mountClerkComponents,
  ensureValidToken,
  getUserOrganizations,
  switchOrganization
};

// Note: Auto-initialization is handled by app.html
// Do not initialize here to avoid double initialization conflicts