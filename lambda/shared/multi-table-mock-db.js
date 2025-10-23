// lambda/shared/multi-table-mock-db.js
// Mock databases for multi-table architecture

// Separate in-memory stores for each table
let usersData = [
  {
    userId: 'test-user-123',
    email: 'test@example.com',
    name: 'Test User',
    createdAt: '2024-01-01T10:00:00.000Z',
    updatedAt: '2024-01-01T10:00:00.000Z'
  }
];

let projectsData = [
  {
    userId: 'test-user-123',
    projectId: 'proj_1700000001_project001',
    name: 'בניין מגורים גבעתיים',
    startDate: '2024-01-01',
    description: 'בניית בניין מגורים בן 4 קומות בגבעתיים',
    status: 'active',
    SpentAmount: 40000,
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
    SpentAmount: 8500,
    createdAt: '2024-01-10T12:00:00.000Z',
    updatedAt: '2024-01-10T12:00:00.000Z'
  }
];

let contractorsData = [
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

let expensesData = [
  {
    userId: 'test-user-123',
    expenseId: 'exp_1700000001_abc123456',
    projectId: 'proj_1700000001_project001',
    contractorId: 'contr_1700000001_contractor001',
    invoiceNum: 'INV-001',
    amount: 25000,
    paymentMethod: 'העברה בנקאית',
    date: '2024-01-15',
    description: 'עבודות בטון',
    createdAt: '2024-01-15T08:00:00.000Z',
    updatedAt: '2024-01-15T08:00:00.000Z'
  },
  {
    userId: 'test-user-123',
    expenseId: 'exp_1700000002_def789012',
    projectId: 'proj_1700000001_project001',
    contractorId: 'contr_1700000002_contractor002',
    invoiceNum: 'INV-002',
    amount: 15000,
    paymentMethod: 'המחאה',
    date: '2024-01-20',
    description: 'התקנת צנרת מים',
    createdAt: '2024-01-20T09:30:00.000Z',
    updatedAt: '2024-01-20T09:30:00.000Z'
  },
  {
    userId: 'test-user-123',
    expenseId: 'exp_1700000003_ghi345678',
    projectId: 'proj_1700000002_project002',
    contractorId: 'contr_1700000003_contractor003',
    invoiceNum: 'INV-003',
    amount: 8500,
    paymentMethod: 'העברה בנקאית',
    date: '2024-01-25',
    description: 'התקנת מערכת חשמל',
    createdAt: '2024-01-25T14:15:00.000Z',
    updatedAt: '2024-01-25T14:15:00.000Z'
  }
];

let worksData = [
  {
    userId: 'test-user-123',
    workId: 'work_1700000001_work001',
    projectId: 'proj_1700000001_project001',
    contractorId: 'contr_1700000001_contractor001',
    expenseId: 'exp_1700000001_abc123456',
    WorkName: 'עבודות יסוד',
    description: 'יציקת יסודות ועמודים',
    TotalWorkCost: 50000,
    status: 'completed',
    createdAt: '2024-01-01T10:00:00.000Z',
    updatedAt: '2024-01-15T08:00:00.000Z'
  },
  {
    userId: 'test-user-123',
    workId: 'work_1700000002_work002',
    projectId: 'proj_1700000001_project001',
    contractorId: 'contr_1700000002_contractor002',
    WorkName: 'עבודות אינסטלציה',
    description: 'התקנת מערכות מים וביוב',
    TotalWorkCost: 30000,
    status: 'in-progress',
    createdAt: '2024-01-10T11:00:00.000Z',
    updatedAt: '2024-01-20T09:30:00.000Z'
  }
];

// Helper function to get table data by table name
function getTableData(tableName) {
  if (tableName.includes('users')) return usersData;
  if (tableName.includes('projects')) return projectsData;
  if (tableName.includes('contractors')) return contractorsData;
  if (tableName.includes('expenses')) return expensesData;
  if (tableName.includes('works')) return worksData;
  throw new Error(`Unknown table: ${tableName}`);
}

// Mock DynamoDB operations for multi-table architecture
const mockMultiTableDB = {
  async query(params) {
    console.log('[MULTI-TABLE MOCK DB] Query:', JSON.stringify(params, null, 2));
    
    const data = getTableData(params.TableName);
    const keyCondition = params.KeyConditionExpression;
    const values = params.ExpressionAttributeValues || {};
    
    let items = [...data];
    
    // Handle different key conditions
    if (keyCondition && keyCondition.includes('userId = :userId')) {
      const userId = values[':userId'];
      items = items.filter(item => item.userId === userId);
      
      // Handle sort key conditions
      if (keyCondition.includes('projectId = :projectId')) {
        const projectId = values[':projectId'];
        items = items.filter(item => item.projectId === projectId);
      }
      
      if (keyCondition.includes('contractorId = :contractorId')) {
        const contractorId = values[':contractorId'];
        items = items.filter(item => item.contractorId === contractorId);
      }
    }
    
    // Apply filters if they exist
    if (params.FilterExpression) {
      const filterParts = params.FilterExpression.split(' AND ');
      
      filterParts.forEach(filter => {
        if (filter.includes('contains(')) {
          // Handle contains filters for string searches
          if (filter.includes('WorkName')) {
            const searchTerm = values[':workName'];
            if (searchTerm) {
              items = items.filter(item => item.WorkName && item.WorkName.includes(searchTerm));
            }
          }
        }
        
        if (filter.includes('status = :status')) {
          const status = values[':status'];
          if (status) {
            items = items.filter(item => item.status === status);
          }
        }
        
        if (filter.includes('BETWEEN')) {
          // Date range filter
          const startDate = values[':startDate'];
          const endDate = values[':endDate'];
          if (startDate && endDate) {
            items = items.filter(item => item.date >= startDate && item.date <= endDate);
          }
        }
      });
    }
    
    return { Items: items };
  },

  async get(params) {
    console.log('[MULTI-TABLE MOCK DB] Get:', JSON.stringify(params, null, 2));
    
    const data = getTableData(params.TableName);
    const key = params.Key;
    
    let item;
    if (key.userId && key.projectId) {
      item = data.find(i => i.userId === key.userId && i.projectId === key.projectId);
    } else if (key.userId && key.contractorId) {
      item = data.find(i => i.userId === key.userId && i.contractorId === key.contractorId);
    } else if (key.userId && key.expenseId) {
      item = data.find(i => i.userId === key.userId && i.expenseId === key.expenseId);
    } else if (key.userId && key.workId) {
      item = data.find(i => i.userId === key.userId && i.workId === key.workId);
    } else if (key.userId) {
      item = data.find(i => i.userId === key.userId);
    }
    
    return { Item: item };
  },

  async put(params) {
    console.log('[MULTI-TABLE MOCK DB] Put:', JSON.stringify(params, null, 2));
    
    const data = getTableData(params.TableName);
    const newItem = { ...params.Item };
    
    // Check for duplicates if ConditionExpression exists
    if (params.ConditionExpression && params.ConditionExpression.includes('attribute_not_exists')) {
      const existing = data.find(item => {
        if (newItem.projectId) return item.userId === newItem.userId && item.projectId === newItem.projectId;
        if (newItem.contractorId) return item.userId === newItem.userId && item.contractorId === newItem.contractorId;
        if (newItem.expenseId) return item.userId === newItem.userId && item.expenseId === newItem.expenseId;
        if (newItem.workId) return item.userId === newItem.userId && item.workId === newItem.workId;
        return item.userId === newItem.userId;
      });
      
      if (existing) {
        throw { code: 'ConditionalCheckFailedException', message: 'Item already exists' };
      }
    }
    
    data.push(newItem);
    return {};
  },

  async update(params) {
    console.log('[MULTI-TABLE MOCK DB] Update:', JSON.stringify(params, null, 2));
    
    const data = getTableData(params.TableName);
    const key = params.Key;
    
    let itemIndex = -1;
    if (key.userId && key.projectId) {
      itemIndex = data.findIndex(i => i.userId === key.userId && i.projectId === key.projectId);
    } else if (key.userId && key.contractorId) {
      itemIndex = data.findIndex(i => i.userId === key.userId && i.contractorId === key.contractorId);
    } else if (key.userId && key.expenseId) {
      itemIndex = data.findIndex(i => i.userId === key.userId && i.expenseId === key.expenseId);
    } else if (key.userId && key.workId) {
      itemIndex = data.findIndex(i => i.userId === key.userId && i.workId === key.workId);
    }
    
    if (itemIndex === -1) {
      throw { code: 'ConditionalCheckFailedException', message: 'Item not found' };
    }
    
    const item = data[itemIndex];
    
    // Handle ADD operations (for SpentAmount)
    if (params.UpdateExpression && params.UpdateExpression.includes('ADD')) {
      const values = params.ExpressionAttributeValues || {};
      if (values[':amount']) {
        item.SpentAmount = (item.SpentAmount || 0) + values[':amount'];
      }
    }
    
    // Handle SET operations
    if (params.UpdateExpression && params.UpdateExpression.includes('SET')) {
      const values = params.ExpressionAttributeValues || {};
      Object.keys(values).forEach(key => {
        const fieldName = key.replace(':', '');
        if (fieldName === 'timestamp') {
          item.updatedAt = values[key];
        } else {
          item[fieldName] = values[key];
        }
      });
    }
    
    data[itemIndex] = item;
    return { Attributes: item };
  },

  async delete(params) {
    console.log('[MULTI-TABLE MOCK DB] Delete:', JSON.stringify(params, null, 2));
    
    const data = getTableData(params.TableName);
    const key = params.Key;
    
    let itemIndex = -1;
    if (key.userId && key.projectId) {
      itemIndex = data.findIndex(i => i.userId === key.userId && i.projectId === key.projectId);
    } else if (key.userId && key.contractorId) {
      itemIndex = data.findIndex(i => i.userId === key.userId && i.contractorId === key.contractorId);
    } else if (key.userId && key.expenseId) {
      itemIndex = data.findIndex(i => i.userId === key.userId && i.expenseId === key.expenseId);
    } else if (key.userId && key.workId) {
      itemIndex = data.findIndex(i => i.userId === key.userId && i.workId === key.workId);
    }
    
    if (itemIndex === -1) {
      throw { code: 'ConditionalCheckFailedException', message: 'Item not found' };
    }
    
    const deletedItem = data[itemIndex];
    data.splice(itemIndex, 1);
    
    return { Attributes: deletedItem };
  },

  async scan(params) {
    console.log('[MULTI-TABLE MOCK DB] Scan:', JSON.stringify(params, null, 2));
    
    const data = getTableData(params.TableName);
    let items = [...data];
    
    // Apply filters
    if (params.FilterExpression && params.ExpressionAttributeValues) {
      const values = params.ExpressionAttributeValues;
      
      if (params.FilterExpression.includes('invoiceNum = :invoiceNum')) {
        const invoiceNum = values[':invoiceNum'];
        items = items.filter(item => item.invoiceNum === invoiceNum);
      }
    }
    
    return { Items: items };
  }
};

// Export mock database functions
module.exports = {
  mockMultiTableDB,
  
  // Functions to get/reset data for testing
  getAllUsersData: () => [...usersData],
  getAllProjectsData: () => [...projectsData],
  getAllContractorsData: () => [...contractorsData],
  getAllExpensesData: () => [...expensesData],
  getAllWorksData: () => [...worksData],
  
  // Function to reset data
  resetAllData: () => {
    usersData.splice(0, usersData.length);
    projectsData.splice(0, projectsData.length);
    contractorsData.splice(0, contractorsData.length);
    expensesData.splice(0, expensesData.length);
    worksData.splice(0, worksData.length);
  },
  
  // Function to add test data
  addTestData: (tableName, data) => {
    const tableData = getTableData(tableName);
    if (Array.isArray(data)) {
      tableData.push(...data);
    } else {
      tableData.push(data);
    }
  }
};