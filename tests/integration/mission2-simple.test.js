// tests/integration/mission2-simple.test.js
// Simple integration test for Mission2 implementation

describe('Mission2 Multi-Table Implementation', () => {
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
  });

  test('should create project with SpentAmount field', async () => {
    const addProject = require('../../lambda/addProject');
    
    const result = await addProject.handler({
      ...mockEvent,
      body: JSON.stringify({
        name: 'Test Project',
        startDate: '2024-01-01',
        description: 'Test description'
      })
    });

    expect(result.statusCode).toBe(201);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.data.project.SpentAmount).toBe(0);
    expect(body.data.project.name).toBe('Test Project');
  });

  test('should create contractor with phone field', async () => {
    const addContractor = require('../../lambda/addContractor');
    
    const result = await addContractor.handler({
      ...mockEvent,
      body: JSON.stringify({
        name: 'Test Contractor',
        phone: '123-456-7890'
      })
    });

    expect(result.statusCode).toBe(201);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.data.contractor.name).toBe('Test Contractor');
    expect(body.data.contractor.phone).toBe('123-456-7890');
  });

  test('should create work with WorkName and TotalWorkCost fields', async () => {
    // First create dependencies
    const addProject = require('../../lambda/addProject');
    const addContractor = require('../../lambda/addContractor');
    const addWork = require('../../lambda/addWork');
    
    // Create project
    const projectResult = await addProject.handler({
      ...mockEvent,
      body: JSON.stringify({
        name: 'Work Test Project',
        startDate: '2024-01-01'
      })
    });
    expect(projectResult.statusCode).toBe(201);
    const projectBody = JSON.parse(projectResult.body);
    const projectId = projectBody.data.projectId;

    // Create contractor
    const contractorResult = await addContractor.handler({
      ...mockEvent,
      body: JSON.stringify({
        name: 'Work Test Contractor',
        phone: '555-0123'
      })
    });
    expect(contractorResult.statusCode).toBe(201);
    const contractorBody = JSON.parse(contractorResult.body);
    const contractorId = contractorBody.data.contractorId;

    // Create work with new field names
    const workResult = await addWork.handler({
      ...mockEvent,
      body: JSON.stringify({
        projectId: projectId,
        contractorId: contractorId,
        WorkName: 'Foundation Work',
        TotalWorkCost: 50000,
        description: 'Foundation work description'
      })
    });

    expect(workResult.statusCode).toBe(201);
    const workBody = JSON.parse(workResult.body);
    expect(workBody.success).toBe(true);
    expect(workBody.data.work.WorkName).toBe('Foundation Work');
    expect(workBody.data.work.TotalWorkCost).toBe(50000);
    expect(workBody.data.work.projectId).toBe(projectId);
    expect(workBody.data.work.contractorId).toBe(contractorId);
  });

  test('should create expense with projectId and contractorId fields', async () => {
    // First create dependencies
    const addProject = require('../../lambda/addProject');
    const addContractor = require('../../lambda/addContractor');
    const addExpense = require('../../lambda/addExpense');
    
    // Create project
    const projectResult = await addProject.handler({
      ...mockEvent,
      body: JSON.stringify({
        name: 'Expense Test Project',
        startDate: '2024-01-01'
      })
    });
    const projectId = JSON.parse(projectResult.body).data.projectId;

    // Create contractor
    const contractorResult = await addContractor.handler({
      ...mockEvent,
      body: JSON.stringify({
        name: 'Expense Test Contractor',
        phone: '555-0456'
      })
    });
    const contractorId = JSON.parse(contractorResult.body).data.contractorId;

    // Create expense with new field names (no paymentTerms)
    const expenseResult = await addExpense.handler({
      ...mockEvent,
      body: JSON.stringify({
        projectId: projectId,
        contractorId: contractorId,
        invoiceNum: 'TEST-001',
        amount: 1000,
        paymentMethod: 'Bank Transfer',
        date: '2024-01-15',
        description: 'Test expense'
      })
    });

    expect(expenseResult.statusCode).toBe(201);
    const expenseBody = JSON.parse(expenseResult.body);
    expect(expenseBody.success).toBe(true);
    expect(expenseBody.data.expense.projectId).toBe(projectId);
    expect(expenseBody.data.expense.contractorId).toBe(contractorId);
    expect(expenseBody.data.expense.invoiceNum).toBe('TEST-001');
    expect(expenseBody.data.expense.amount).toBe(1000);
    // Verify paymentTerms field is not present (removed in Mission2)
    expect(expenseBody.data.expense.paymentTerms).toBeUndefined();
  });

  test('should get expenses with enhanced data (projectName, contractorName)', async () => {
    // Setup test data
    const addProject = require('../../lambda/addProject');
    const addContractor = require('../../lambda/addContractor');
    const addExpense = require('../../lambda/addExpense');
    const getExpenses = require('../../lambda/getExpenses');
    
    // Create dependencies
    const projectResult = await addProject.handler({
      ...mockEvent,
      body: JSON.stringify({
        name: 'Enhanced Display Project',
        startDate: '2024-01-01'
      })
    });
    const projectId = JSON.parse(projectResult.body).data.projectId;

    const contractorResult = await addContractor.handler({
      ...mockEvent,
      body: JSON.stringify({
        name: 'Enhanced Display Contractor',
        phone: '555-0789'
      })
    });
    const contractorId = JSON.parse(contractorResult.body).data.contractorId;

    // Create expense
    await addExpense.handler({
      ...mockEvent,
      body: JSON.stringify({
        projectId: projectId,
        contractorId: contractorId,
        invoiceNum: 'ENHANCED-001',
        amount: 2000,
        paymentMethod: 'Check',
        date: '2024-01-20'
      })
    });

    // Get expenses with enhanced data
    const expensesResult = await getExpenses.handler(mockEvent);
    
    expect(expensesResult.statusCode).toBe(200);
    const expensesBody = JSON.parse(expensesResult.body);
    expect(expensesBody.success).toBe(true);
    expect(expensesBody.data.expenses).toHaveLength(1);
    
    const expense = expensesBody.data.expenses[0];
    expect(expense.projectName).toBe('Enhanced Display Project');
    expect(expense.contractorName).toBe('Enhanced Display Contractor');
    expect(expense.contractorPhone).toBe('555-0789');
    expect(expense.projectId).toBe(projectId);
    expect(expense.contractorId).toBe(contractorId);
  });

  test('should validate foreign keys and reject invalid data', async () => {
    const addExpense = require('../../lambda/addExpense');
    
    // Try to create expense with invalid projectId and contractorId
    const result = await addExpense.handler({
      ...mockEvent,
      body: JSON.stringify({
        projectId: 'invalid-project-id',
        contractorId: 'invalid-contractor-id',
        invoiceNum: 'INVALID-001',
        amount: 1000,
        paymentMethod: 'Bank Transfer',
        date: '2024-01-15'
      })
    });

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.message).toContain('Foreign key validation error');
  });

  test('should prevent duplicate invoice numbers', async () => {
    // Setup dependencies
    const addProject = require('../../lambda/addProject');
    const addContractor = require('../../lambda/addContractor');
    const addExpense = require('../../lambda/addExpense');
    
    const projectResult = await addProject.handler({
      ...mockEvent,
      body: JSON.stringify({
        name: 'Duplicate Test Project',
        startDate: '2024-01-01'
      })
    });
    const projectId = JSON.parse(projectResult.body).data.projectId;

    const contractorResult = await addContractor.handler({
      ...mockEvent,
      body: JSON.stringify({
        name: 'Duplicate Test Contractor',
        phone: '555-1111'
      })
    });
    const contractorId = JSON.parse(contractorResult.body).data.contractorId;

    // Create first expense
    const firstResult = await addExpense.handler({
      ...mockEvent,
      body: JSON.stringify({
        projectId: projectId,
        contractorId: contractorId,
        invoiceNum: 'DUPLICATE-001',
        amount: 1000,
        paymentMethod: 'Bank Transfer',
        date: '2024-01-15'
      })
    });
    expect(firstResult.statusCode).toBe(201);

    // Try to create duplicate
    const duplicateResult = await addExpense.handler({
      ...mockEvent,
      body: JSON.stringify({
        projectId: projectId,
        contractorId: contractorId,
        invoiceNum: 'DUPLICATE-001', // Same invoice number
        amount: 2000,
        paymentMethod: 'Cash',
        date: '2024-01-16'
      })
    });

    expect(duplicateResult.statusCode).toBe(409);
    const duplicateBody = JSON.parse(duplicateResult.body);
    expect(duplicateBody.message).toContain('already exists');
  });
});