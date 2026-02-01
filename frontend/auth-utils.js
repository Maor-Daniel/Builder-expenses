/**
 * auth-utils.js - Clerk Headless API Wrapper
 *
 * Simple wrapper around Clerk's headless API for custom auth forms
 * Maintains all security features while using custom UI
 *
 * Session 1: Infrastructure Foundation
 * Status: Not integrated (safe to deploy)
 */

// Clerk configuration (same as clerk-auth.js)
const CLERK_PUBLISHABLE_KEY = 'pk_live_Y2xlcmsuYnVpbGRlci1leHBlbnNlcy5jb20k';

// Clerk instance (singleton pattern)
// Use global window object for cross-page persistence
if (!window.ClerkInstance) {
    window.ClerkInstance = null;
}

/**
 * Get or initialize Clerk instance
 * @returns {Promise<Clerk>} Clerk instance
 */
async function getClerkInstance() {
    if (window.ClerkInstance) {
        console.log('[AUTH-UTILS] Returning existing global Clerk instance');
        console.log('[AUTH-UTILS] Sign-up state exists:', !!window.ClerkInstance.client?.signUp);
        console.log('[AUTH-UTILS] Sign-in state exists:', !!window.ClerkInstance.client?.signIn);
        return window.ClerkInstance;
    }

    try {
        console.log('[AUTH-UTILS] Creating new Clerk instance');
        console.log('[AUTH-UTILS] Importing Clerk from CDN...');

        // Import Clerk from CDN (ESM module) with timeout
        const clerkModule = await Promise.race([
            import('https://cdn.jsdelivr.net/npm/@clerk/clerk-js@5/+esm'),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Clerk import timed out after 15 seconds')), 15000)
            )
        ]);

        console.log('[AUTH-UTILS] Clerk module imported, initializing...');
        const { Clerk } = clerkModule;

        // Initialize Clerk with timeout
        window.ClerkInstance = new Clerk(CLERK_PUBLISHABLE_KEY);

        console.log('[AUTH-UTILS] Loading Clerk...');
        await Promise.race([
            window.ClerkInstance.load(),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Clerk load timed out after 15 seconds')), 15000)
            )
        ]);

        console.log('[AUTH-UTILS] Clerk initialized successfully');
        console.log('[AUTH-UTILS] New instance created, sign-up state:', !!window.ClerkInstance.client?.signUp);
        return window.ClerkInstance;
    } catch (error) {
        console.error('[AUTH-UTILS] Failed to initialize Clerk:', error);
        console.error('[AUTH-UTILS] Error details:', {
            message: error.message,
            stack: error.stack,
            name: error.name
        });
        throw new Error('Failed to initialize authentication: ' + error.message);
    }
}

/**
 * Sign in with email and password
 * @param {string} email - User email
 * @param {string} password - User password
 * @param {boolean} rememberMe - Whether to remember the session (optional)
 * @returns {Promise<{success: boolean, data?: any, error?: string}>}
 */
async function signInWithPassword(email, password, rememberMe = false) {
    try {
        const clerk = await getClerkInstance();

        console.log('[AUTH-UTILS] Attempting sign in for:', email);

        // Create sign-in attempt
        const signInAttempt = await clerk.client.signIn.create({
            identifier: email,
            password: password
        });

        // Check if sign-in is complete
        if (signInAttempt.status === 'complete') {
            // Set active session
            await clerk.setActive({ session: signInAttempt.createdSessionId });

            console.log('[AUTH-UTILS] Sign in successful');
            return {
                success: true,
                data: signInAttempt
            };
        } else {
            // Sign-in requires additional steps (shouldn't happen with email/password)
            console.warn('[AUTH-UTILS] Sign in incomplete, status:', signInAttempt.status);
            return {
                success: false,
                error: 'נדרשים צעדים נוספים להתחברות'
            };
        }
    } catch (error) {
        console.error('[AUTH-UTILS] Sign in error:', error);
        return {
            success: false,
            error: parseClerkError(error)
        };
    }
}

/**
 * Sign up with email and password (triggers email verification)
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<{success: boolean, data?: any, error?: string}>}
 */
async function signUpWithPassword(email, password) {
    try {
        console.log('[AUTH-UTILS] Attempting sign up for:', email);
        console.log('[AUTH-UTILS] User agent:', navigator.userAgent);

        const clerk = await getClerkInstance();
        console.log('[AUTH-UTILS] Clerk instance obtained');

        // Create sign-up attempt with timeout protection
        console.log('[AUTH-UTILS] Creating sign-up attempt...');
        const signUpAttempt = await Promise.race([
            clerk.client.signUp.create({
                emailAddress: email,
                password: password
            }),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Sign up request timed out')), 30000)
            )
        ]);

        console.log('[AUTH-UTILS] Sign-up attempt created, preparing email verification...');

        // Prepare email verification (Clerk sends verification code) with timeout
        await Promise.race([
            signUpAttempt.prepareEmailAddressVerification({ strategy: 'email_code' }),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Email verification preparation timed out')), 30000)
            )
        ]);

        console.log('[AUTH-UTILS] Sign up successful, verification email sent');
        return {
            success: true,
            data: signUpAttempt
        };
    } catch (error) {
        console.error('[AUTH-UTILS] Sign up error:', error);
        console.error('[AUTH-UTILS] Error details:', {
            message: error.message,
            code: error?.errors?.[0]?.code,
            stack: error.stack
        });
        return {
            success: false,
            error: parseClerkError(error)
        };
    }
}

/**
 * Verify email with 6-digit code
 * @param {string} code - 6-digit verification code
 * @returns {Promise<{success: boolean, data?: any, error?: string}>}
 */
async function verifyEmailCode(code) {
    try {
        const clerk = await getClerkInstance();
        const signUp = clerk.client.signUp;

        // ENHANCED: Better error handling for missing sign-up state
        if (!signUp) {
            console.error('[AUTH-UTILS] No sign-up state found');
            console.error('[AUTH-UTILS] This usually means page was refreshed or sign-up was not initiated');
            console.error('[AUTH-UTILS] Clerk client state:', {
                hasClient: !!clerk.client,
                hasSignUp: !!clerk.client?.signUp,
                hasSignIn: !!clerk.client?.signIn,
                hasUser: !!clerk.user
            });
            return {
                success: false,
                error: 'לא נמצא תהליך הרשמה פעיל. אנא התחל מחדש.',
                errorCode: 'SIGNUP_STATE_LOST'
            };
        }

        console.log('[AUTH-UTILS] Sign-up state found, attempting verification');
        console.log('[AUTH-UTILS] Sign-up status:', signUp.status);
        console.log('[AUTH-UTILS] Sign-up email:', signUp.emailAddress);

        // Attempt verification
        const result = await signUp.attemptEmailAddressVerification({ code });

        if (result.status === 'complete') {
            // Set active session
            await clerk.setActive({ session: result.createdSessionId });

            console.log('[AUTH-UTILS] Email verification successful');
            return {
                success: true,
                data: result
            };
        } else {
            console.warn('[AUTH-UTILS] Email verification incomplete, status:', result.status);
            console.warn('[AUTH-UTILS] Result details:', result);
            return {
                success: false,
                error: 'אימות האימייל לא הושלם'
            };
        }
    } catch (error) {
        console.error('[AUTH-UTILS] Email verification error:', error);
        return {
            success: false,
            error: parseClerkError(error)
        };
    }
}

/**
 * Request password reset (sends email with code)
 * @param {string} email - User email
 * @returns {Promise<{success: boolean, data?: any, error?: string}>}
 */
async function requestPasswordReset(email) {
    try {
        const clerk = await getClerkInstance();

        console.log('[AUTH-UTILS] Requesting password reset for:', email);

        // Start password reset flow - create signIn with strategy and identifier
        const signIn = await clerk.client.signIn.create({
            strategy: 'reset_password_email_code',
            identifier: email
        });

        console.log('[AUTH-UTILS] Password reset email sent');
        return {
            success: true,
            data: signIn
        };
    } catch (error) {
        console.error('[AUTH-UTILS] Password reset request error:', error);
        return {
            success: false,
            error: parseClerkError(error)
        };
    }
}

/**
 * Verify password reset code and set new password
 * @param {string} code - Verification code from email
 * @param {string} newPassword - New password
 * @returns {Promise<{success: boolean, data?: any, error?: string}>}
 */
async function verifyPasswordResetCode(code, newPassword) {
    try {
        const clerk = await getClerkInstance();
        const signIn = clerk.client.signIn;

        if (!signIn) {
            return {
                success: false,
                error: 'לא נמצא תהליך איפוס סיסמה פעיל'
            };
        }

        console.log('[AUTH-UTILS] Attempting password reset verification');

        // Attempt password reset
        const result = await signIn.attemptFirstFactor({
            strategy: 'reset_password_email_code',
            code: code,
            password: newPassword
        });

        if (result.status === 'complete') {
            // Set active session
            await clerk.setActive({ session: result.createdSessionId });

            console.log('[AUTH-UTILS] Password reset successful');
            return {
                success: true,
                data: result
            };
        } else {
            console.warn('[AUTH-UTILS] Password reset incomplete, status:', result.status);
            return {
                success: false,
                error: 'איפוס הסיסמה לא הושלם'
            };
        }
    } catch (error) {
        console.error('[AUTH-UTILS] Password reset verification error:', error);
        return {
            success: false,
            error: parseClerkError(error)
        };
    }
}

/**
 * Parse Clerk errors to Hebrew user-friendly messages
 * @param {Error} error - Clerk error object
 * @returns {string} Hebrew error message
 */
function parseClerkError(error) {
    // Extract error code from Clerk error object
    const errorCode = error?.errors?.[0]?.code || error?.code || '';
    const errorMessage = error?.errors?.[0]?.message || error?.message || '';

    // Map common Clerk error codes to Hebrew messages
    const errorMap = {
        // Password errors
        'form_password_pwned': 'סיסמה זו נחשפה בדליפת מידע. אנא בחר סיסמה אחרת',
        'form_password_incorrect': 'סיסמה שגויה',
        'form_password_too_short': 'הסיסמה חייבת להיות לפחות 8 תווים',
        'form_password_validation_failed': 'הסיסמה אינה עומדת בדרישות האבטחה',

        // Email/identifier errors
        'form_identifier_not_found': 'אימייל לא קיים במערכת',
        'form_identifier_exists': 'אימייל זה כבר רשום במערכת',
        'form_param_format_invalid': 'פורמט האימייל אינו תקין',
        'form_param_missing': 'חסרים נתונים נדרשים',

        // Verification errors
        'verification_failed': 'קוד אימות שגוי',
        'verification_expired': 'קוד האימות פג תוקף. אנא בקש קוד חדש',

        // Authentication errors
        'strategy_for_user_invalid': 'שיטת ההתחברות אינה תקינה למשתמש זה',
        'not_allowed_access': 'אין לך הרשאה לבצע פעולה זו',
        'session_exists': 'כבר קיימת התחברות פעילה',

        // Rate limiting
        'too_many_requests': 'יותר מדי ניסיונות. אנא המתן מספר דקות ונסה שוב'
    };

    // Return mapped message or generic error
    const hebrewMessage = errorMap[errorCode];
    if (hebrewMessage) {
        console.log('[AUTH-UTILS] Mapped error:', errorCode, '→', hebrewMessage);
        return hebrewMessage;
    }

    // Fallback to English message or generic
    console.warn('[AUTH-UTILS] Unmapped error code:', errorCode, errorMessage);
    return errorMessage || 'אירעה שגיאה. אנא נסה שוב';
}

// Export functions as global AuthUtils object
window.AuthUtils = {
    getClerkInstance,
    signInWithPassword,
    signUpWithPassword,
    verifyEmailCode,
    requestPasswordReset,
    verifyPasswordResetCode,
    parseClerkError
};

console.log('[AUTH-UTILS] Module loaded successfully');
