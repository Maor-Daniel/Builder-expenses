import { API_CONFIG, API_ENDPOINTS } from '../config/api';

/**
 * Expense API Service
 */
class ExpenseService {
  /**
   * Get auth token from Clerk
   */
  async getAuthToken() {
    // Token will be provided via Clerk's useAuth hook
    return null;
  }

  /**
   * Make authenticated API request
   */
  async request(endpoint, options = {}) {
    const url = `${API_CONFIG.endpoint}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
  }

  /**
   * Get all expenses
   */
  async getExpenses(token) {
    return this.request(API_ENDPOINTS.expenses, {
      headers: { Authorization: `Bearer ${token}` }
    });
  }

  /**
   * Get expense by ID
   */
  async getExpense(id, token) {
    return this.request(API_ENDPOINTS.expense(id), {
      headers: { Authorization: `Bearer ${token}` }
    });
  }

  /**
   * Create new expense
   */
  async createExpense(data, token) {
    return this.request(API_ENDPOINTS.expenses, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
  }

  /**
   * Update expense
   */
  async updateExpense(id, data, token) {
    return this.request(API_ENDPOINTS.expense(id), {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
  }

  /**
   * Delete expense
   */
  async deleteExpense(id, token) {
    return this.request(API_ENDPOINTS.expense(id), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  }
}

export default new ExpenseService();
