module.exports = {
  testEnvironment: 'node',
  collectCoverageFrom: [
    'lambda/multi-table/**/*.js',
    'lambda/shared/multi-table-*.js',
    '!lambda/shared/multi-table-mock-db.js',
    '!node_modules/**',
    '!coverage/**',
    '!scripts/**',
    '!tests/**'
  ],
  coverageDirectory: 'coverage/multi-table',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  testMatch: [
    '**/tests/**/*.test.js'
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  verbose: true,
  testTimeout: 10000,
  
  // Test organization
  projects: [
    {
      displayName: 'Unit Tests',
      testMatch: ['<rootDir>/tests/unit/**/*.test.js'],
      setupFilesAfterEnv: ['<rootDir>/tests/setup.js']
    },
    {
      displayName: 'Integration Tests', 
      testMatch: ['<rootDir>/tests/integration/**/*.test.js'],
      setupFilesAfterEnv: ['<rootDir>/tests/setup.js']
    },
    {
      displayName: 'E2E Tests',
      testMatch: ['<rootDir>/tests/e2e/**/*.test.js'],
      setupFilesAfterEnv: ['<rootDir>/tests/setup.js']
    }
  ],

  // Module path mapping for easier imports
  moduleNameMapping: {
    '^@lambda/(.*)$': '<rootDir>/lambda/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1'
  }
};