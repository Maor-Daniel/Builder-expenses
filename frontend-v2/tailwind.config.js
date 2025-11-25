/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Primary Brand Colors
        primary: {
          50: '#f0f7ff',
          100: '#e0effe',
          500: '#667eea',  // Current primary
          600: '#5a67d8',
          700: '#4c51bf',
          900: '#2d3748'
        },

        // Sidebar Dark Theme
        sidebar: {
          bg: '#1a202c',      // Dark gray-blue
          hover: '#2d3748',
          active: '#4a5568',
          text: '#e2e8f0',
          border: '#2d3748'
        },

        // Content Area
        content: {
          bg: '#f7fafc',      // Very light gray
          card: '#ffffff',
          border: '#e2e8f0',
          text: '#2d3748'
        },

        // Status Colors
        success: '#48bb78',
        warning: '#f6ad55',
        danger: '#f56565',
        info: '#4299e1',

        // Data Visualization
        chart: {
          blue: '#667eea',
          green: '#48bb78',
          yellow: '#f6ad55',
          red: '#f56565',
          purple: '#9f7aea',
          teal: '#38b2ac'
        }
      },

      // Custom Fonts (Keep Rubik for Hebrew)
      fontFamily: {
        sans: ['Rubik', 'system-ui', 'sans-serif'],
      },

      // Custom animations
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-in': 'slideIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'spin-slow': 'spin 2s linear infinite',
      },

      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideIn: {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        }
      }
    },
  },
  plugins: [],
}