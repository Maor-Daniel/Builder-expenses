// Clerk Configuration

export const CLERK_CONFIG = {
  publishableKey: import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
  frontendApi: import.meta.env.VITE_CLERK_FRONTEND_API,
};

// Validate required environment variables at startup
if (!CLERK_CONFIG.publishableKey) {
  throw new Error(
    'VITE_CLERK_PUBLISHABLE_KEY is not configured. ' +
    'Please copy .env.example to .env and configure your Clerk credentials.'
  );
}

if (!CLERK_CONFIG.frontendApi) {
  throw new Error(
    'VITE_CLERK_FRONTEND_API is not configured. ' +
    'Please copy .env.example to .env and configure your Clerk credentials.'
  );
}

// Clerk appearance configuration
export const CLERK_APPEARANCE = {
  baseTheme: 'light',
  layout: {
    socialButtonsPlacement: 'bottom',
    socialButtonsVariant: 'iconButton',
  },
  variables: {
    colorPrimary: '#667eea',
    colorText: '#2d3748',
    colorTextOnPrimaryBackground: '#ffffff',
    colorBackground: '#ffffff',
    colorInputBackground: '#f7fafc',
    colorInputText: '#2d3748',
    colorSuccess: '#48bb78',
    colorWarning: '#f6ad55',
    colorDanger: '#f56565',
    fontFamily: '"Rubik", system-ui, sans-serif',
    fontSize: '16px',
    borderRadius: '0.5rem',
  },
  elements: {
    formButtonPrimary: 'bg-primary-500 hover:bg-primary-600',
    card: 'shadow-lg',
    headerTitle: 'text-2xl font-bold',
    headerSubtitle: 'text-gray-600',
    socialButtonsIconButton: 'border-gray-300 hover:bg-gray-50',
    formFieldInput: 'border-gray-300 focus:ring-2 focus:ring-primary-500',
    footerActionLink: 'text-primary-500 hover:text-primary-600',
  },
};

export default CLERK_CONFIG;