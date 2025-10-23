// lambda/shared/mock-db.js
// Mock database for demonstration without DynamoDB Local

let mockDatabase = [
  // Sample expenses
  {
    userId: 'test-user-123',
    expenseId: 'exp_1700000001_abc123456',
    project: 'בניין מגורים גבעתיים',
    contractor: 'חברת בניה בע"מ',
    invoiceNum: 'INV-001',
    amount: 25000,
    paymentTerms: '30 ימים',
    paymentMethod: 'העברה בנקאית',
    date: '2024-01-15',
    description: 'עבודות בטון',
    status: 'pending',
    createdAt: '2024-01-15T08:00:00.000Z',
    updatedAt: '2024-01-15T08:00:00.000Z'
  },
  {
    userId: 'test-user-123',
    expenseId: 'exp_1700000002_def789012',
    project: 'בניין מגורים גבעתיים',
    contractor: 'אינסטלציה מקצועית',
    invoiceNum: 'INV-002',
    amount: 15000,
    paymentTerms: '15 ימים',
    paymentMethod: 'המחאה',
    date: '2024-01-20',
    description: 'התקנת צנרת מים',
    status: 'pending',
    createdAt: '2024-01-20T09:30:00.000Z',
    updatedAt: '2024-01-20T09:30:00.000Z'
  },
  {
    userId: 'test-user-123',
    expenseId: 'exp_1700000003_ghi345678',
    project: 'משרדים תל אביב',
    contractor: 'חשמלאי מוסמך',
    invoiceNum: 'INV-003',
    amount: 8500,
    paymentTerms: '30 ימים',
    paymentMethod: 'העברה בנקאית',
    date: '2024-01-25',
    description: 'התקנת מערכת חשמל',
    status: 'paid',
    createdAt: '2024-01-25T14:15:00.000Z',
    updatedAt: '2024-01-25T14:15:00.000Z'
  },
  
  // Sample projects
  {
    userId: 'test-user-123',
    projectId: 'proj_1700000001_project001',
    name: 'בניין מגורים גבעתיים',
    startDate: '2024-01-01',
    description: 'בניית בניין מגורים בן 4 קומות בגבעתיים',
    status: 'active',
    createdAt: '2024-01-01T10:00:00.000Z',
    updatedAt: '2024-01-01T10:00:00.000Z'
  },
  {
    userId: 'test-user-123',
    projectId: 'proj_1700000002_project002',
    name: 'משרדים תל אביב',
    startDate: '2024-01-10',
    description: 'שיפוץ חלל משרדים במרכז תל אביב',
    status: 'active',
    createdAt: '2024-01-10T12:00:00.000Z',
    updatedAt: '2024-01-10T12:00:00.000Z'
  },
  
  // Sample contractors
  {
    userId: 'test-user-123',
    contractorId: 'contr_1700000001_contractor001',
    name: 'חברת בניה בע"מ',
    phone: '03-1234567',
    createdAt: '2024-01-01T09:00:00.000Z',
    updatedAt: '2024-01-01T09:00:00.000Z'
  },
  {
    userId: 'test-user-123',
    contractorId: 'contr_1700000002_contractor002',
    name: 'אינסטלציה מקצועית',
    phone: '054-9876543',
    createdAt: '2024-01-05T11:00:00.000Z',
    updatedAt: '2024-01-05T11:00:00.000Z'
  },
  {
    userId: 'test-user-123',
    contractorId: 'contr_1700000003_contractor003',
    name: 'חשמלאי מוסמך',
    phone: '052-1357924',
    createdAt: '2024-01-08T14:00:00.000Z',
    updatedAt: '2024-01-08T14:00:00.000Z'
  }
];

// Mock DynamoDB operations
const mockDynamoDB = {
  async query(params) {
    console.log('[MOCK DB] Query:', JSON.stringify(params, null, 2));
    
    const userId = params.ExpressionAttributeValues[':userId'];
    let items = mockDatabase.filter(item => item.userId === userId);
    
    // Apply filters if they exist
    if (params.FilterExpression) {
      const filterParts = params.FilterExpression.split(' AND ');
      
      filterParts.forEach(filter => {
        // Filter by entity type
        if (filter.includes('attribute_exists(projectId)')) {
          items = items.filter(item => item.projectId);
        }
        
        if (filter.includes('attribute_exists(contractorId)')) {
          items = items.filter(item => item.contractorId);
        }
        
        if (filter.includes('attribute_exists(expenseId)')) {
          items = items.filter(item => item.expenseId);
        }
        
        // Name filter for projects and contractors
        if (filter.includes('#name = :name')) {
          const name = params.ExpressionAttributeValues[':name'];
          if (name) {
            items = items.filter(item => item.name === name);
          }
        }
        
        // Status filter
        if (filter.includes('#status = :status')) {
          const status = params.ExpressionAttributeValues[':status'];
          if (status) {
            items = items.filter(item => item.status === status);
          }
        }
        
        if (filter.includes('BETWEEN')) {
          // Date range filter
          const startDate = params.ExpressionAttributeValues[':startDate'];
          const endDate = params.ExpressionAttributeValues[':endDate'];
          if (startDate && endDate) {
            items = items.filter(item => item.date >= startDate && item.date <= endDate);
          }
        }
        
        if (filter.includes('contains(#project')) {
          // Project filter
          const project = params.ExpressionAttributeValues[':project'];
          if (project) {
            items = items.filter(item => item.project && item.project.includes(project));
          }
        }
        
        if (filter.includes('contains(#contractor')) {
          // Contractor filter
          const contractor = params.ExpressionAttributeValues[':contractor'];
          if (contractor) {
            items = items.filter(item => item.contractor && item.contractor.includes(contractor));
          }
        }
      });
    }
    
    // Handle invoice number filter specifically
    if (params.FilterExpression && params.FilterExpression.includes('invoiceNum = :invoiceNum')) {
      const invoiceNum = params.ExpressionAttributeValues[':invoiceNum'];
      if (invoiceNum) {
        items = items.filter(item => item.invoiceNum === invoiceNum);
      }
    }
    
    // Handle NOT equal filter for updates
    if (params.FilterExpression && params.FilterExpression.includes('expenseId <> :expenseId')) {
      const expenseId = params.ExpressionAttributeValues[':expenseId'];
      if (expenseId) {
        items = items.filter(item => item.expenseId !== expenseId);
      }
    }
    
    return { Items: items };
  },

  async get(params) {
    console.log('[MOCK DB] Get:', JSON.stringify(params, null, 2));
    
    const item = mockDatabase.find(expense => 
      expense.userId === params.Key.userId && 
      expense.expenseId === params.Key.expenseId
    );
    
    return { Item: item };
  },

  async put(params) {
    console.log('[MOCK DB] Put:', JSON.stringify(params, null, 2));
    
    const newItem = { ...params.Item };
    
    // Check for duplicates if ConditionExpression exists
    if (params.ConditionExpression) {
      const existing = mockDatabase.find(item => item.expenseId === newItem.expenseId);
      if (existing) {
        throw { code: 'ConditionalCheckFailedException', message: 'Item already exists' };
      }
    }
    
    mockDatabase.push(newItem);
    return {};
  },

  async update(params) {
    console.log('[MOCK DB] Update:', JSON.stringify(params, null, 2));
    
    const itemIndex = mockDatabase.findIndex(expense => 
      expense.userId === params.Key.userId && 
      expense.expenseId === params.Key.expenseId
    );
    
    if (itemIndex === -1) {
      throw { code: 'ConditionalCheckFailedException', message: 'Item not found' };
    }
    
    // Apply updates
    const item = mockDatabase[itemIndex];
    const updates = {};
    
    // Parse UPDATE expression
    if (params.UpdateExpression && params.ExpressionAttributeValues) {
      Object.keys(params.ExpressionAttributeValues).forEach((key, index) => {
        const fieldName = Object.values(params.ExpressionAttributeNames || {})[index] || key.replace(':', '');
        const fieldValue = params.ExpressionAttributeValues[key];
        updates[fieldName] = fieldValue;
        item[fieldName] = fieldValue;
      });
    }
    
    mockDatabase[itemIndex] = item;
    return { Attributes: item };
  },

  async delete(params) {
    console.log('[MOCK DB] Delete:', JSON.stringify(params, null, 2));
    
    const itemIndex = mockDatabase.findIndex(expense => 
      expense.userId === params.Key.userId && 
      expense.expenseId === params.Key.expenseId
    );
    
    if (itemIndex === -1) {
      throw { code: 'ConditionalCheckFailedException', message: 'Item not found' };
    }
    
    const deletedItem = mockDatabase[itemIndex];
    mockDatabase.splice(itemIndex, 1);
    
    return { Attributes: deletedItem };
  }
};

// Export mock database functions
module.exports = {
  mockDatabase,
  mockDynamoDB,
  
  // Function to get all data for inspection
  getAllData: () => mockDatabase,
  
  // Function to reset data
  resetData: () => {
    mockDatabase.splice(0, mockDatabase.length);
  },
  
  // Function to add test data
  addTestData: (data) => {
    if (Array.isArray(data)) {
      mockDatabase.push(...data);
    } else {
      mockDatabase.push(data);
    }
  }
};