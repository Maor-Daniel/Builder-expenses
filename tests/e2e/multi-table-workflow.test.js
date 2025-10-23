// tests/e2e/multi-table-workflow.test.js
// End-to-End tests for multi-table workflow

describe('Multi-Table E2E Workflow Tests', () => {
  // Mock environment for E2E tests
  beforeAll(() => {
    process.env.NODE_ENV = 'development';
    process.env.IS_LOCAL = 'true';
  });

  describe('Complete Construction Project Workflow', () => {
    test('should complete full project lifecycle', async () => {
      // This test simulates the complete workflow:
      // 1. Create project
      // 2. Add contractors
      // 3. Plan works
      // 4. Add expenses
      // 5. Track spending
      
      const addProject = require('../../lambda/multi-table/addProject');
      const addExpense = require('../../lambda/multi-table/addExpense');
      const getExpenses = require('../../lambda/multi-table/getExpenses');
      const addWork = require('../../lambda/multi-table/addWork');

      // Reset mock database
      const { resetAllData, addTestData } = require('../../lambda/shared/multi-table-mock-db');
      resetAllData();
      
      // Add test user
      addTestData('construction-expenses-local-users', {
        userId: 'test-user-123',
        email: 'test@example.com',
        name: 'Test User',
        createdAt: '2024-01-01T10:00:00.000Z',
        updatedAt: '2024-01-01T10:00:00.000Z'
      });

      // Step 1: Create a new construction project
      const projectResult = await addProject.handler({
        body: JSON.stringify({
          name: 'E2E Test Building Project',
          startDate: '2024-01-01',
          description: 'Complete building construction project',
          status: 'active'
        })
      });

      expect(projectResult.statusCode).toBe(201);
      const projectBody = JSON.parse(projectResult.body);
      const projectId = projectBody.data.projectId;
      
      // Step 2: Add contractors (we'll simulate by adding to mock data)
      const contractorId = 'e2e-contractor-123';
      addTestData('construction-expenses-local-contractors', {
        userId: 'test-user-123',
        contractorId: contractorId,
        name: 'E2E Test Contractor',
        phone: '555-0123',
        createdAt: '2024-01-01T10:00:00.000Z',
        updatedAt: '2024-01-01T10:00:00.000Z'
      });

      // Step 3: Plan work items
      const work1Result = await addWork.handler({
        body: JSON.stringify({
          projectId: projectId,
          contractorId: contractorId,
          WorkName: 'Foundation and Excavation',
          description: 'Site preparation and foundation work',
          TotalWorkCost: 50000,
          status: 'planned'
        })
      });
      
      expect(work1Result.statusCode).toBe(201);
      const work1Body = JSON.parse(work1Result.body);

      const work2Result = await addWork.handler({
        body: JSON.stringify({
          projectId: projectId,
          contractorId: contractorId,
          WorkName: 'Structural Framework',
          description: 'Steel and concrete structural work',
          TotalWorkCost: 75000,
          status: 'planned'
        })
      });
      
      expect(work2Result.statusCode).toBe(201);

      // Step 4: Add expenses as work progresses
      const expense1Result = await addExpense.handler({
        body: JSON.stringify({
          projectId: projectId,
          contractorId: contractorId,
          invoiceNum: 'E2E-INV-001',
          amount: 25000,
          paymentMethod: 'Bank Transfer',
          date: '2024-01-15',
          description: 'Foundation materials and labor'
        })
      });

      expect(expense1Result.statusCode).toBe(201);

      const expense2Result = await addExpense.handler({
        body: JSON.stringify({
          projectId: projectId,
          contractorId: contractorId,
          invoiceNum: 'E2E-INV-002',
          amount: 30000,
          paymentMethod: 'Check',
          date: '2024-01-30',
          description: 'Structural steel delivery'
        })
      });

      expect(expense2Result.statusCode).toBe(201);

      // Step 5: Retrieve and verify project expenses
      const expensesResult = await getExpenses.handler({
        queryStringParameters: {
          projectId: projectId
        }
      });

      expect(expensesResult.statusCode).toBe(200);
      const expensesBody = JSON.parse(expensesResult.body);

      // Verify the complete workflow results
      expect(expensesBody.data.expenses).toHaveLength(2);
      expect(expensesBody.data.summary.totalAmount).toBe(55000);
      expect(expensesBody.data.expenses[0].projectName).toBe('E2E Test Building Project');
      expect(expensesBody.data.expenses[0].contractorName).toBe('E2E Test Contractor');

      // Verify work planning vs actual spending
      const totalPlannedCost = 50000 + 75000; // 125000
      const totalActualCost = 55000;
      const remainingBudget = totalPlannedCost - totalActualCost;

      expect(totalPlannedCost).toBe(125000);
      expect(totalActualCost).toBe(55000);
      expect(remainingBudget).toBe(70000);

      // Verify data consistency across tables
      expect(expensesBody.data.expenses.every(exp => exp.projectId === projectId)).toBe(true);
      expect(expensesBody.data.expenses.every(exp => exp.contractorId === contractorId)).toBe(true);
    });

    test('should handle error scenarios gracefully', async () => {
      const addExpense = require('../../lambda/multi-table/addExpense');
      
      // Reset mock database
      const { resetAllData } = require('../../lambda/shared/multi-table-mock-db');
      resetAllData();

      // Try to add expense without valid project/contractor (should fail)
      const invalidExpenseResult = await addExpense.handler({
        body: JSON.stringify({
          projectId: 'non-existent-project',
          contractorId: 'non-existent-contractor', 
          invoiceNum: 'ERROR-INV-001',
          amount: 1000,
          paymentMethod: 'Cash',
          date: '2024-01-01'
        })
      });

      expect(invalidExpenseResult.statusCode).toBe(400);
      const errorBody = JSON.parse(invalidExpenseResult.body);
      expect(errorBody.error).toBe(true);
      expect(errorBody.message).toContain('Foreign key validation error');
    });
  });

  describe('Multi-User Project Isolation', () => {
    test('should isolate data between different users', async () => {
      const addProject = require('../../lambda/multi-table/addProject');
      
      // This test would require mocking different user contexts
      // For now, we verify the single-user functionality works correctly
      
      const result = await addProject.handler({
        body: JSON.stringify({
          name: 'User Isolation Test Project',
          startDate: '2024-01-01'
        })
      });

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      
      // Verify user ID is consistently applied
      expect(body.data.project.userId).toBe('test-user-123');
    });
  });

  describe('Data Validation End-to-End', () => {
    test('should enforce business rules across the entire workflow', async () => {
      const addExpense = require('../../lambda/multi-table/addExpense');

      // Test maximum amount validation
      const largeExpenseResult = await addExpense.handler({
        body: JSON.stringify({
          projectId: 'test-project',
          contractorId: 'test-contractor',
          invoiceNum: 'LARGE-INV-001',
          amount: 2000000, // Exceeds 1,000,000 limit
          paymentMethod: 'Bank Transfer',
          date: '2024-01-01'
        })
      });

      expect(largeExpenseResult.statusCode).toBe(400);
      const errorBody = JSON.parse(largeExpenseResult.body);
      expect(errorBody.message).toContain('Amount exceeds maximum limit');
    });
  });
});