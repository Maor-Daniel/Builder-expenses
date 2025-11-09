/**
 * Sentry initialization for frontend
 * This should be loaded as early as possible in the application lifecycle
 */

(function() {
    // Check if Sentry is available
    if (typeof Sentry === 'undefined') {
        return;
    }

    // Initialize Sentry
    Sentry.init({
        dsn: "https://a03183645096b8be557a31afbed9889d@o4510329645891584.ingest.de.sentry.io/4510329647267920",

        // Set environment based on hostname
        environment: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
            ? 'development'
            : 'production',

        // Enable automatic session tracking
        autoSessionTracking: true,

        // Setting this option to true will send default PII data to Sentry
        sendDefaultPii: true,

        // Set sample rate for performance monitoring (0.0 to 1.0)
        // 1.0 = 100% of transactions are sent
        tracesSampleRate: 1.0,

        // Capture unhandled promise rejections
        integrations: [
            Sentry.browserTracingIntegration(),
            Sentry.replayIntegration({
                maskAllText: false,
                blockAllMedia: false,
            }),
        ],

        // Session Replay sample rate
        replaysSessionSampleRate: 0.1, // 10% of sessions
        replaysOnErrorSampleRate: 1.0, // 100% of sessions with errors

        // Before send hook - useful for filtering or modifying events
        beforeSend(event, hint) {
            // Don't send events in development (optional)
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                return null; // Return null to prevent sending
            }
            return event;
        },
    });

    // Set user context when available
    window.setSentryUser = function(user) {
        if (user && user.username) {
            Sentry.setUser({
                id: user.username,
                username: user.username,
                email: user.attributes?.email,
            });
        }
    };

    // Clear user context on logout
    window.clearSentryUser = function() {
        Sentry.setUser(null);
    };

})();
