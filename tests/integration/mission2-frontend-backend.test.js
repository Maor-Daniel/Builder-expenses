// tests/integration/mission2-frontend-backend.test.js
// Integration tests for Mission2 frontend-backend alignment

const addExpense = require('../../lambda/addExpense');
const getExpenses = require('../../lambda/getExpenses');
const addProject = require('../../lambda/addProject');
const addContractor = require('../../lambda/addContractor');
const addWork = require('../../lambda/addWork');

describe('Mission2 Frontend-Backend Integration Tests', () => {
  // Mock event structure for testing
  const mockEvent = {
    requestContext: {
      authorizer: {
        claims: {
          sub: 'test-user-123'
        }
      }
    }
  };

  beforeEach(() => {
    // Set environment for local testing
    process.env.NODE_ENV = 'development';
    process.env.IS_LOCAL = 'true';
    
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
  });

  describe('Multi-table Data Structure Validation', () => {
    test('should handle new expense structure with projectId and contractorId', async () => {
      // First add project and contractor
      // Set environment for local testing
      process.env.NODE_ENV = 'development';
      process.env.IS_LOCAL = 'true';
      
      const mockEvent = {
        requestContext: {
          authorizer: {
            claims: {
              sub: 'test-user-123'
            }
          }
        }
      };

      await addProject.handler({
        ...mockEvent,
        body: JSON.stringify({
          name: 'Test Project for Mission2',
          startDate: '2024-01-01',
          description: 'Test project description'
        })
      });

      await addContractor.handler({
        ...mockEvent,
        body: JSON.stringify({
          name: 'Test Contractor for Mission2',
          phone: '555-0123'
        })
      });

      // Get the generated IDs (in real scenario, frontend would get these from API responses)
      const projects = require('../../lambda/shared/multi-table-mock-db').getAllProjectsData();
      const contractors = require('../../lambda/shared/multi-table-mock-db').getAllContractorsData();
      
      const projectId = projects[0].projectId;
      const contractorId = contractors[0].contractorId;

      // Add expense with new structure
      const expenseResult = await addExpense.handler({
        body: JSON.stringify({
          projectId: projectId,
          contractorId: contractorId,
          invoiceNum: 'TEST-INV-001',
          amount: 1000,
          paymentMethod: 'Bank Transfer',
          date: '2024-01-15',
          description: 'Mission2 test expense'
        })
      });

      expect(expenseResult.statusCode).toBe(201);
      const expenseBody = JSON.parse(expenseResult.body);
      expect(expenseBody.success).toBe(true);
      expect(expenseBody.data.expense.projectId).toBe(projectId);
      expect(expenseBody.data.expense.contractorId).toBe(contractorId);
    });

    test('should return enhanced expense data with projectName and contractorName', async () => {
      // Setup test data
      await addProject.handler({
        body: JSON.stringify({
          name: 'Enhanced Display Project',
          startDate: '2024-01-01'
        })
      });

      await addContractor.handler({
        body: JSON.stringify({
          name: 'Enhanced Display Contractor',
          phone: '555-0456'
        })
      });

      const projects = require('../../lambda/shared/multi-table-mock-db').getAllProjectsData();
      const contractors = require('../../lambda/shared/multi-table-mock-db').getAllContractorsData();
      
      const projectId = projects[0].projectId;
      const contractorId = contractors[0].contractorId;

      // Add expense
      await addExpense.handler({
        body: JSON.stringify({
          projectId: projectId,
          contractorId: contractorId,
          invoiceNum: 'ENHANCED-INV-001',
          amount: 2000,
          paymentMethod: 'Check',
          date: '2024-01-20'
        })
      });

      // Get expenses with enhanced data
      const expensesResult = await getExpenses.handler({});
      
      expect(expensesResult.statusCode).toBe(200);
      const expensesBody = JSON.parse(expensesResult.body);
      expect(expensesBody.data.expenses).toHaveLength(1);
      
      const expense = expensesBody.data.expenses[0];
      expect(expense.projectName).toBe('Enhanced Display Project');
      expect(expense.contractorName).toBe('Enhanced Display Contractor');
      expect(expense.contractorPhone).toBe('555-0456');
    });

    test('should validate WorkName and TotalWorkCost fields in works', async () => {
      // Setup prerequisites
      await addProject.handler({
        body: JSON.stringify({
          name: 'Works Test Project',
          startDate: '2024-01-01'
        })
      });

      await addContractor.handler({
        body: JSON.stringify({
          name: 'Works Test Contractor',
          phone: '555-0789'
        })
      });

      const projects = require('../../lambda/shared/multi-table-mock-db').getAllProjectsData();
      const contractors = require('../../lambda/shared/multi-table-mock-db').getAllContractorsData();
      
      const projectId = projects[0].projectId;
      const contractorId = contractors[0].contractorId;

      // Add work with new field structure
      const workResult = await addWork.handler({
        body: JSON.stringify({
          projectId: projectId,
          contractorId: contractorId,
          WorkName: 'Foundation Work Mission2',  // New field name
          TotalWorkCost: 50000,                  // New field name
          description: 'Foundation work for Mission2 testing',
          status: 'planned'
        })
      });

      expect(workResult.statusCode).toBe(201);
      const workBody = JSON.parse(workResult.body);
      expect(workBody.success).toBe(true);
      expect(workBody.data.work.WorkName).toBe('Foundation Work Mission2');
      expect(workBody.data.work.TotalWorkCost).toBe(50000);
    });

    test('should initialize projects with SpentAmount field', async () => {
      // Add proper event structure for local testing
      process.env.NODE_ENV = 'development';
      process.env.IS_LOCAL = 'true';
      
      const projectResult = await addProject.handler({
        body: JSON.stringify({
          name: 'SpentAmount Test Project',
          startDate: '2024-01-01',
          description: 'Project for testing SpentAmount initialization'
        }),
        requestContext: {
          authorizer: {
            claims: {
              sub: 'test-user-123'
            }
          }
        }
      });

      expect(projectResult.statusCode).toBe(201);
      const projectBody = JSON.parse(projectResult.body);
      expect(projectBody.success).toBe(true);
      expect(projectBody.data.project.SpentAmount).toBe(0); // Should initialize to 0
    });
  });

  describe('Double Submission Prevention', () => {
    test('should prevent duplicate invoice numbers', async () => {
      // Setup prerequisites
      await addProject.handler({
        body: JSON.stringify({
          name: 'Duplicate Test Project',
          startDate: '2024-01-01'
        })
      });

      await addContractor.handler({
        body: JSON.stringify({
          name: 'Duplicate Test Contractor',
          phone: '555-1111'
        })
      });

      const projects = require('../../lambda/shared/multi-table-mock-db').getAllProjectsData();
      const contractors = require('../../lambda/shared/multi-table-mock-db').getAllContractorsData();
      
      const projectId = projects[0].projectId;
      const contractorId = contractors[0].contractorId;

      // First expense
      const firstExpense = await addExpense.handler({
        body: JSON.stringify({
          projectId: projectId,
          contractorId: contractorId,
          invoiceNum: 'DUPLICATE-TEST-001',
          amount: 1000,
          paymentMethod: 'Bank Transfer',
          date: '2024-01-15'
        })
      });

      expect(firstExpense.statusCode).toBe(201);

      // Try to add duplicate
      const duplicateExpense = await addExpense.handler({
        body: JSON.stringify({
          projectId: projectId,
          contractorId: contractorId,
          invoiceNum: 'DUPLICATE-TEST-001', // Same invoice number
          amount: 2000,
          paymentMethod: 'Cash',
          date: '2024-01-16'
        })
      });

      expect(duplicateExpense.statusCode).toBe(409);
      const duplicateBody = JSON.parse(duplicateExpense.body);
      expect(duplicateBody.message).toContain('already exists');
    });
  });

  describe('Foreign Key Validation', () => {
    test('should reject expense with invalid projectId', async () => {
      // Add contractor but no project
      await addContractor.handler({
        body: JSON.stringify({
          name: 'Valid Contractor',
          phone: '555-2222'
        })
      });

      const contractors = require('../../lambda/shared/multi-table-mock-db').getAllData('construction-expenses-local-contractors');
      const contractorId = contractors[0].contractorId;

      const result = await addExpense.handler({
        body: JSON.stringify({
          projectId: 'invalid-project-id',
          contractorId: contractorId,
          invoiceNum: 'INVALID-PROJECT-001',
          amount: 1000,
          paymentMethod: 'Bank Transfer',
          date: '2024-01-15'
        })
      });

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('Foreign key validation error');
      expect(body.message).toContain('Project with ID invalid-project-id not found');
    });

    test('should reject work with invalid contractorId', async () => {
      // Add project but no contractor
      await addProject.handler({
        body: JSON.stringify({
          name: 'Valid Project for FK Test',
          startDate: '2024-01-01'
        })
      });

      const projects = require('../../lambda/shared/multi-table-mock-db').getAllData('construction-expenses-local-projects');
      const projectId = projects[0].projectId;

      const result = await addWork.handler({
        body: JSON.stringify({
          projectId: projectId,
          contractorId: 'invalid-contractor-id',
          WorkName: 'Invalid Contractor Work',
          TotalWorkCost: 25000,
          description: 'This should fail'
        })
      });

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('Foreign key validation error');
      expect(body.message).toContain('Contractor with ID invalid-contractor-id not found');
    });
  });

  describe('Field Validation', () => {
    test('should reject expenses without required fields', async () => {
      const result = await addExpense.handler({
        body: JSON.stringify({
          // Missing required fields
          amount: 1000
        })
      });

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('Missing required fields');
    });

    test('should reject works without WorkName', async () => {
      const result = await addWork.handler({
        body: JSON.stringify({
          projectId: 'test-project',
          contractorId: 'test-contractor',
          TotalWorkCost: 25000,
          // Missing WorkName
          description: 'Missing work name test'
        })
      });

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('Missing required fields: WorkName');
    });
  });
});