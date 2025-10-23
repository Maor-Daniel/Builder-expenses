// tests/setup.js
// Global test setup for multi-table architecture tests

// Set up environment variables for testing
process.env.NODE_ENV = 'test';
process.env.IS_LOCAL = 'true';

// Mock AWS SDK to prevent real AWS calls during testing
jest.mock('aws-sdk', () => {
  return {
    DynamoDB: {
      DocumentClient: jest.fn(() => ({
        query: jest.fn(),
        get: jest.fn(),
        put: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        scan: jest.fn(),
        batchGet: jest.fn(),
        batchWrite: jest.fn()
      }))
    }
  };
});

// Global test utilities
global.testUtils = {
  // Helper to create mock event
  createMockEvent: (body = {}, queryParams = {}, pathParams = {}) => ({
    body: JSON.stringify(body),
    queryStringParameters: queryParams,
    pathParameters: pathParams,
    requestContext: {
      authorizer: {
        claims: {
          sub: 'test-user-123'
        }
      }
    }
  }),

  // Helper to parse Lambda response
  parseResponse: (response) => ({
    statusCode: response.statusCode,
    body: JSON.parse(response.body),
    headers: response.headers
  }),

  // Helper to create test data
  createTestProject: (overrides = {}) => ({
    name: 'Test Project',
    startDate: '2024-01-01',
    description: 'Test project description',
    status: 'active',
    ...overrides
  }),

  createTestContractor: (overrides = {}) => ({
    name: 'Test Contractor',
    phone: '123-456-7890',
    ...overrides
  }),

  createTestExpense: (overrides = {}) => ({
    projectId: 'test-project-123',
    contractorId: 'test-contractor-123',
    invoiceNum: 'TEST-INV-001',
    amount: 1000,
    paymentMethod: 'Bank Transfer',
    date: '2024-01-15',
    description: 'Test expense',
    ...overrides
  }),

  createTestWork: (overrides = {}) => ({
    projectId: 'test-project-123',
    contractorId: 'test-contractor-123',
    WorkName: 'Test Work',
    description: 'Test work description',
    TotalWorkCost: 5000,
    status: 'planned',
    ...overrides
  })
};

// Console override to reduce noise during testing
const originalError = console.error;
beforeAll(() => {
  console.error = (...args) => {
    // Only show errors that are not expected test errors
    if (!args[0]?.includes?.('[MOCK DB]') && 
        !args[0]?.includes?.('[DEBUG]') &&
        !args[0]?.includes?.('DynamoDB') &&
        !args[0]?.includes?.('Using Mock Database')) {
      originalError(...args);
    }
  };
});

afterAll(() => {
  console.error = originalError;
});

// Global test timeout
jest.setTimeout(30000);