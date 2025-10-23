// tests/unit/multi-table-utils.test.js
// Unit tests for multi-table utilities

const {
  createResponse,
  createErrorResponse,
  getUserIdFromEvent,
  validateExpense,
  validateProject,
  validateContractor,
  validateWork,
  generateExpenseId,
  generateProjectId,
  generateContractorId,
  generateWorkId,
  getCurrentTimestamp
} = require('../../lambda/shared/multi-table-utils');

describe('Multi-Table Utils - Response Functions', () => {
  test('createResponse should return properly formatted response', () => {
    const response = createResponse(200, { success: true });
    
    expect(response.statusCode).toBe(200);
    expect(response.headers).toEqual({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Content-Type': 'application/json'
    });
    expect(JSON.parse(response.body)).toEqual({ success: true });
  });

  test('createResponse should merge additional headers', () => {
    const response = createResponse(201, { id: 1 }, { 'X-Custom': 'test' });
    
    expect(response.headers['X-Custom']).toBe('test');
    expect(response.headers['Content-Type']).toBe('application/json');
  });

  test('createErrorResponse should return error response with timestamp', () => {
    const response = createErrorResponse(400, 'Validation failed');
    const body = JSON.parse(response.body);
    
    expect(response.statusCode).toBe(400);
    expect(body.error).toBe(true);
    expect(body.message).toBe('Validation failed');
    expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});

describe('Multi-Table Utils - Authentication', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('getUserIdFromEvent should return test user ID in local mode', () => {
    process.env.NODE_ENV = 'development';
    
    const userId = getUserIdFromEvent({});
    expect(userId).toBe('test-user-123');
  });

  test('getUserIdFromEvent should extract user ID from Cognito claims in production', () => {
    process.env.NODE_ENV = 'production';
    
    const event = {
      requestContext: {
        authorizer: {
          claims: {
            sub: 'user-456'
          }
        }
      }
    };
    
    const userId = getUserIdFromEvent(event);
    expect(userId).toBe('user-456');
  });

  test('getUserIdFromEvent should throw error when no user ID found in production', () => {
    process.env.NODE_ENV = 'production';
    
    expect(() => {
      getUserIdFromEvent({});
    }).toThrow('User ID not found in event context');
  });
});

describe('Multi-Table Utils - Validation Functions', () => {
  describe('validateExpense', () => {
    test('should pass validation with all required fields', () => {
      const validExpense = {
        projectId: 'proj_123',
        contractorId: 'contr_456',
        invoiceNum: 'INV-001',
        amount: 1000,
        paymentMethod: 'bank_transfer',
        date: '2024-01-15'
      };
      
      expect(() => validateExpense(validExpense)).not.toThrow();
    });

    test('should fail validation with missing required fields', () => {
      const incompleteExpense = {
        projectId: 'proj_123',
        amount: 1000
      };
      
      expect(() => validateExpense(incompleteExpense)).toThrow('Missing required fields: contractorId, invoiceNum, paymentMethod, date');
    });

    test('should fail validation with invalid amount', () => {
      const invalidExpense = {
        projectId: 'proj_123',
        contractorId: 'contr_456',
        invoiceNum: 'INV-001',
        amount: 'invalid',
        paymentMethod: 'bank_transfer',
        date: '2024-01-15'
      };
      
      expect(() => validateExpense(invalidExpense)).toThrow('Amount must be a positive number');
    });

    test('should fail validation with negative amount', () => {
      const invalidExpense = {
        projectId: 'proj_123',
        contractorId: 'contr_456',
        invoiceNum: 'INV-001',
        amount: -100,
        paymentMethod: 'bank_transfer',
        date: '2024-01-15'
      };
      
      expect(() => validateExpense(invalidExpense)).toThrow('Amount must be a positive number');
    });

    test('should fail validation with invalid date format', () => {
      const invalidExpense = {
        projectId: 'proj_123',
        contractorId: 'contr_456',
        invoiceNum: 'INV-001',
        amount: 1000,
        paymentMethod: 'bank_transfer',
        date: '15/01/2024'
      };
      
      expect(() => validateExpense(invalidExpense)).toThrow('Date must be in YYYY-MM-DD format');
    });
  });

  describe('validateProject', () => {
    test('should pass validation with all required fields', () => {
      const validProject = {
        name: 'Test Project',
        startDate: '2024-01-01'
      };
      
      expect(() => validateProject(validProject)).not.toThrow();
    });

    test('should pass validation with optional SpentAmount', () => {
      const validProject = {
        name: 'Test Project',
        startDate: '2024-01-01',
        SpentAmount: 5000
      };
      
      expect(() => validateProject(validProject)).not.toThrow();
    });

    test('should fail validation with missing name', () => {
      const invalidProject = {
        startDate: '2024-01-01'
      };
      
      expect(() => validateProject(invalidProject)).toThrow('Missing required fields: name');
    });

    test('should fail validation with invalid date format', () => {
      const invalidProject = {
        name: 'Test Project',
        startDate: '01/01/2024'
      };
      
      expect(() => validateProject(invalidProject)).toThrow('Start date must be in YYYY-MM-DD format');
    });

    test('should fail validation with negative SpentAmount', () => {
      const invalidProject = {
        name: 'Test Project',
        startDate: '2024-01-01',
        SpentAmount: -100
      };
      
      expect(() => validateProject(invalidProject)).toThrow('SpentAmount must be a non-negative number');
    });
  });

  describe('validateContractor', () => {
    test('should pass validation with all required fields', () => {
      const validContractor = {
        name: 'Test Contractor',
        phone: '123-456-7890'
      };
      
      expect(() => validateContractor(validContractor)).not.toThrow();
    });

    test('should fail validation with missing phone', () => {
      const invalidContractor = {
        name: 'Test Contractor'
      };
      
      expect(() => validateContractor(invalidContractor)).toThrow('Missing required fields: phone');
    });
  });

  describe('validateWork', () => {
    test('should pass validation with all required fields', () => {
      const validWork = {
        projectId: 'proj_123',
        contractorId: 'contr_456',
        WorkName: 'Foundation Work',
        description: 'Concrete foundation',
        TotalWorkCost: 50000
      };
      
      expect(() => validateWork(validWork)).not.toThrow();
    });

    test('should fail validation with missing WorkName', () => {
      const invalidWork = {
        projectId: 'proj_123',
        contractorId: 'contr_456',
        description: 'Concrete foundation',
        TotalWorkCost: 50000
      };
      
      expect(() => validateWork(invalidWork)).toThrow('Missing required fields: WorkName');
    });

    test('should fail validation with invalid TotalWorkCost', () => {
      const invalidWork = {
        projectId: 'proj_123',
        contractorId: 'contr_456',
        WorkName: 'Foundation Work',
        description: 'Concrete foundation',
        TotalWorkCost: 'invalid'
      };
      
      expect(() => validateWork(invalidWork)).toThrow('TotalWorkCost must be a positive number');
    });
  });
});

describe('Multi-Table Utils - ID Generation', () => {
  test('generateExpenseId should create valid expense ID', () => {
    const id = generateExpenseId();
    expect(id).toMatch(/^exp_\d+_[a-z0-9]+$/);
  });

  test('generateProjectId should create valid project ID', () => {
    const id = generateProjectId();
    expect(id).toMatch(/^proj_\d+_[a-z0-9]+$/);
  });

  test('generateContractorId should create valid contractor ID', () => {
    const id = generateContractorId();
    expect(id).toMatch(/^contr_\d+_[a-z0-9]+$/);
  });

  test('generateWorkId should create valid work ID', () => {
    const id = generateWorkId();
    expect(id).toMatch(/^work_\d+_[a-z0-9]+$/);
  });

  test('generated IDs should be unique', () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) {
      ids.add(generateExpenseId());
    }
    expect(ids.size).toBe(100);
  });
});

describe('Multi-Table Utils - Timestamp', () => {
  test('getCurrentTimestamp should return valid ISO timestamp', () => {
    const timestamp = getCurrentTimestamp();
    expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(new Date(timestamp).toISOString()).toBe(timestamp);
  });

  test('getCurrentTimestamp should return different values when called consecutively', () => {
    const timestamp1 = getCurrentTimestamp();
    // Small delay to ensure different timestamps
    setTimeout(() => {
      const timestamp2 = getCurrentTimestamp();
      expect(timestamp1).not.toBe(timestamp2);
    }, 1);
  });
});