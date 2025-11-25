// API Configuration

export const API_CONFIG = {
  // Use environment variable or fallback to production API
  endpoint: import.meta.env.VITE_API_ENDPOINT || 'https://2woj5i92td.execute-api.us-east-1.amazonaws.com/production',
  region: 'us-east-1',
  timeout: 30000, // 30 seconds
};

// API Endpoints
export const API_ENDPOINTS = {
  // Projects
  projects: '/projects',
  project: (id) => `/projects/${id}`,

  // Contractors
  contractors: '/contractors',
  contractor: (id) => `/contractors/${id}`,

  // Works
  works: '/works',
  work: (id) => `/works/${id}`,

  // Expenses
  expenses: '/expenses',
  expense: (id) => `/expenses/${id}`,

  // Users
  users: '/users',
  user: (id) => `/users/${id}`,
  invitations: '/invitations',
  invitation: (id) => `/invitations/${id}`,

  // Company
  company: '/company',
  updateCompany: '/company/update',

  // Dashboard
  dashboardStats: '/dashboard/stats',

  // Reports
  reports: '/reports',
  exportExpenses: '/reports/expenses/export',

  // Billing
  subscription: '/subscription',
  paymentHistory: '/subscription/payments',
  updateSubscription: '/subscription/update',
};

// Request helper functions
export const buildUrl = (endpoint) => {
  return `${API_CONFIG.endpoint}${endpoint}`;
};

export const buildHeaders = (authToken) => ({
  'Content-Type': 'application/json',
  'Authorization': authToken ? `Bearer ${authToken}` : '',
});

export default API_CONFIG;