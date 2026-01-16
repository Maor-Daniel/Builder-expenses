// theme-manager.js
// Dark mode toggle and theme management for authentication pages

const ThemeManager = {
  /**
   * Initialize theme management
   * - Loads saved theme from localStorage
   * - Falls back to system preference
   * - Sets up event listeners
   */
  init() {
    // Check for saved preference or default to system
    const savedTheme = localStorage.getItem('theme');
    const systemPreference = window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';

    const theme = savedTheme || systemPreference;
    this.setTheme(theme);

    // Listen for system preference changes
    // Only applies if user hasn't manually set a preference
    window.matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', (e) => {
        if (!localStorage.getItem('theme')) {
          this.setTheme(e.matches ? 'dark' : 'light');
        }
      });

    // Set up toggle button event listener
    const toggleButton = document.getElementById('themeToggle');
    if (toggleButton) {
      toggleButton.addEventListener('click', () => {
        this.toggle();
      });

      // Add keyboard support for toggle button
      toggleButton.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.toggle();
        }
      });
    }
  },

  /**
   * Set theme to light or dark
   * @param {string} theme - 'light' or 'dark'
   */
  setTheme(theme) {
    if (theme !== 'light' && theme !== 'dark') {
      console.warn(`Invalid theme: ${theme}. Defaulting to 'light'.`);
      theme = 'light';
    }

    // Set the data-theme attribute on the root element
    document.documentElement.setAttribute('data-theme', theme);

    // Save to localStorage for persistence
    localStorage.setItem('theme', theme);

    // Update aria-label on toggle button
    const toggleButton = document.getElementById('themeToggle');
    if (toggleButton) {
      const label = theme === 'dark'
        ? 'החלף למצב בהיר'
        : 'החלף למצב כהה';
      toggleButton.setAttribute('aria-label', label);
    }
  },

  /**
   * Toggle between light and dark themes
   */
  toggle() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    this.setTheme(next);
  },

  /**
   * Get current theme
   * @returns {string} - Current theme ('light' or 'dark')
   */
  getCurrentTheme() {
    return document.documentElement.getAttribute('data-theme') || 'light';
  }
};

// Initialize theme management when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    ThemeManager.init();
  });
} else {
  // DOM is already ready
  ThemeManager.init();
}

// Export for use in other scripts if needed
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ThemeManager;
}
