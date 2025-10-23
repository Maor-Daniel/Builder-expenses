// tests/integration/multi-table-lambdas.test.js
// Integration tests for multi-table Lambda functions

const { mockMultiTableDB } = require('../../lambda/shared/multi-table-mock-db');

// Mock the utils to use the mock database
jest.mock('../../lambda/shared/multi-table-utils', () => {
  const actual = jest.requireActual('../../lambda/shared/multi-table-utils');
  return {
    ...actual,
    dynamodb: mockMultiTableDB,
    isLocal: true
  };
});

const addExpense = require('../../lambda/multi-table/addExpense');
const getExpenses = require('../../lambda/multi-table/getExpenses');
const addProject = require('../../lambda/multi-table/addProject');
const addWork = require('../../lambda/multi-table/addWork');

describe('Multi-Table Lambda Integration Tests', () => {
  beforeEach(() => {
    // Reset mock database before each test
    const {
      resetAllData,
      addTestData
    } = require('../../lambda/shared/multi-table-mock-db');
    
    resetAllData();
    
    // Add test data
    addTestData('construction-expenses-local-users', {
      userId: 'test-user-123',
      email: 'test@example.com',
      name: 'Test User',
      createdAt: '2024-01-01T10:00:00.000Z',
      updatedAt: '2024-01-01T10:00:00.000Z'
    });
    
    addTestData('construction-expenses-local-projects', {
      userId: 'test-user-123',
      projectId: 'test-project-123',
      name: 'Test Project',
      startDate: '2024-01-01',
      description: 'Test project description',
      status: 'active',
      SpentAmount: 0,
      createdAt: '2024-01-01T10:00:00.000Z',
      updatedAt: '2024-01-01T10:00:00.000Z'
    });
    
    addTestData('construction-expenses-local-contractors', {
      userId: 'test-user-123',
      contractorId: 'test-contractor-123',
      name: 'Test Contractor',
      phone: '123-456-7890',
      createdAt: '2024-01-01T10:00:00.000Z',
      updatedAt: '2024-01-01T10:00:00.000Z'
    });
  });

  describe('addProject Integration', () => {
    test('should successfully add a new project', async () => {
      const event = {
        body: JSON.stringify({
          name: 'New Integration Test Project',
          startDate: '2024-02-01',
          description: 'Integration test project',
          status: 'active'
        })
      };

      const result = await addProject.handler(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(201);
      expect(body.success).toBe(true);
      expect(body.message).toBe('Project added successfully');
      expect(body.data.project.name).toBe('New Integration Test Project');
      expect(body.data.project.SpentAmount).toBe(0);
      expect(body.data.projectId).toMatch(/^proj_\d+_[a-z0-9]+$/);
    });

    test('should reject duplicate project names', async () => {
      // First project
      await addProject.handler({
        body: JSON.stringify({
          name: 'Duplicate Test Project',
          startDate: '2024-02-01'
        })
      });

      // Try to add duplicate
      const result = await addProject.handler({
        body: JSON.stringify({
          name: 'Duplicate Test Project',
          startDate: '2024-02-02'
        })
      });

      const body = JSON.parse(result.body);
      expect(result.statusCode).toBe(409);
      expect(body.message).toContain('already exists');
    });

    test('should validate required fields', async () => {
      const event = {
        body: JSON.stringify({
          startDate: '2024-02-01'
          // Missing name
        })
      };

      const result = await addProject.handler(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(400);
      expect(body.message).toContain('Missing required fields: name');
    });
  });

  describe('addExpense Integration', () => {
    test('should successfully add expense with foreign key validation', async () => {
      const event = {
        body: JSON.stringify({
          projectId: 'test-project-123',
          contractorId: 'test-contractor-123',
          invoiceNum: 'TEST-INV-001',
          amount: 5000,
          paymentMethod: 'Bank Transfer',
          date: '2024-01-15',
          description: 'Integration test expense'
        })
      };

      const result = await addExpense.handler(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(201);
      expect(body.success).toBe(true);
      expect(body.data.expense.projectId).toBe('test-project-123');
      expect(body.data.expense.contractorId).toBe('test-contractor-123');
      expect(body.data.expense.amount).toBe(5000);
      expect(body.data.expenseId).toMatch(/^exp_\d+_[a-z0-9]+$/);
    });

    test('should reject expense with invalid projectId', async () => {
      const event = {
        body: JSON.stringify({
          projectId: 'invalid-project-id',
          contractorId: 'test-contractor-123',
          invoiceNum: 'TEST-INV-002',
          amount: 3000,
          paymentMethod: 'Cash',
          date: '2024-01-16'
        })
      };

      const result = await addExpense.handler(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(400);
      expect(body.message).toContain('Foreign key validation error');
      expect(body.message).toContain('Project with ID invalid-project-id not found');
    });

    test('should reject duplicate invoice numbers', async () => {
      // First expense
      await addExpense.handler({
        body: JSON.stringify({
          projectId: 'test-project-123',
          contractorId: 'test-contractor-123',
          invoiceNum: 'DUPLICATE-INV',
          amount: 1000,
          paymentMethod: 'Bank Transfer',
          date: '2024-01-15'
        })
      });

      // Try to add duplicate invoice
      const result = await addExpense.handler({
        body: JSON.stringify({
          projectId: 'test-project-123',
          contractorId: 'test-contractor-123',
          invoiceNum: 'DUPLICATE-INV',
          amount: 2000,
          paymentMethod: 'Cash',
          date: '2024-01-16'
        })
      });

      const body = JSON.parse(result.body);
      expect(result.statusCode).toBe(409);
      expect(body.message).toContain('Invoice number DUPLICATE-INV already exists');
    });
  });

  describe('addWork Integration', () => {
    test('should successfully add work with all required fields', async () => {
      const event = {
        body: JSON.stringify({
          projectId: 'test-project-123',
          contractorId: 'test-contractor-123',
          WorkName: 'Foundation Work',
          description: 'Concrete foundation work',
          TotalWorkCost: 25000,
          status: 'planned'
        })
      };

      const result = await addWork.handler(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(201);
      expect(body.success).toBe(true);
      expect(body.data.work.WorkName).toBe('Foundation Work');
      expect(body.data.work.TotalWorkCost).toBe(25000);
      expect(body.data.workId).toMatch(/^work_\d+_[a-z0-9]+$/);
    });

    test('should validate foreign keys for work', async () => {
      const event = {
        body: JSON.stringify({
          projectId: 'invalid-project',
          contractorId: 'test-contractor-123',
          WorkName: 'Invalid Project Work',
          description: 'This should fail',
          TotalWorkCost: 15000
        })
      };

      const result = await addWork.handler(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(400);
      expect(body.message).toContain('Foreign key validation error');
    });
  });

  describe('getExpenses Integration', () => {
    beforeEach(async () => {
      // Add test expenses
      await addExpense.handler({
        body: JSON.stringify({
          projectId: 'test-project-123',
          contractorId: 'test-contractor-123',
          invoiceNum: 'GET-TEST-001',
          amount: 1000,
          paymentMethod: 'Bank Transfer',
          date: '2024-01-10'
        })
      });

      await addExpense.handler({
        body: JSON.stringify({
          projectId: 'test-project-123',
          contractorId: 'test-contractor-123',
          invoiceNum: 'GET-TEST-002',
          amount: 2000,
          paymentMethod: 'Cash',
          date: '2024-01-20'
        })
      });
    });

    test('should retrieve all expenses for user', async () => {
      const result = await getExpenses.handler({});
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.expenses).toHaveLength(2);
      expect(body.data.summary.totalAmount).toBe(3000);
      expect(body.data.summary.totalCount).toBe(2);
    });

    test('should filter expenses by project', async () => {
      const event = {
        queryStringParameters: {
          projectId: 'test-project-123'
        }
      };

      const result = await getExpenses.handler(event);
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.data.expenses).toHaveLength(2);
      expect(body.data.expenses.every(exp => exp.projectId === 'test-project-123')).toBe(true);
    });

    test('should include related project and contractor information', async () => {
      const result = await getExpenses.handler({});
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(body.data.expenses[0].projectName).toBe('Test Project');
      expect(body.data.expenses[0].contractorName).toBe('Test Contractor');
      expect(body.data.expenses[0].contractorPhone).toBe('123-456-7890');
    });
  });

  describe('Cross-table Data Consistency', () => {
    test('should maintain referential integrity across operations', async () => {
      // Add project
      const projectResult = await addProject.handler({
        body: JSON.stringify({
          name: 'Consistency Test Project',
          startDate: '2024-01-01'
        })
      });
      const projectBody = JSON.parse(projectResult.body);
      const projectId = projectBody.data.projectId;

      // Add contractor  
      const contractorEvent = {
        body: JSON.stringify({
          name: 'Consistency Test Contractor',
          phone: '555-1234'
        })
      };
      // We'd need addContractor function here, but for this test we'll use existing

      // Add expense referencing both
      const expenseResult = await addExpense.handler({
        body: JSON.stringify({
          projectId: projectId,
          contractorId: 'test-contractor-123',
          invoiceNum: 'CONSISTENCY-001',
          amount: 7500,
          paymentMethod: 'Check',
          date: '2024-01-25'
        })
      });

      expect(expenseResult.statusCode).toBe(201);

      // Verify expense references are valid
      const expenseBody = JSON.parse(expenseResult.body);
      expect(expenseBody.data.expense.projectId).toBe(projectId);
      expect(expenseBody.data.expense.contractorId).toBe('test-contractor-123');
    });
  });
});