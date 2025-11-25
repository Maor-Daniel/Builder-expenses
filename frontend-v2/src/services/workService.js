import { API_CONFIG, API_ENDPOINTS } from '../config/api';

/**
 * Work API Service
 *
 * Handles all work-related API calls including:
 * - Fetching work records
 * - Creating new work entries
 * - Updating existing work entries
 * - Deleting work entries
 * - Getting work details
 */
class WorkService {
  /**
   * Make authenticated API request
   * @param {string} endpoint - API endpoint path
   * @param {object} options - Fetch options
   * @returns {Promise<object>} - Response data
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
   * Get all work records
   * @param {string} token - Auth token from Clerk
   * @returns {Promise<Array>} - List of work records
   */
  async getWorks(token) {
    return this.request(API_ENDPOINTS.works, {
      headers: { Authorization: `Bearer ${token}` }
    });
  }

  /**
   * Get work by ID
   * @param {string} id - Work ID
   * @param {string} token - Auth token
   * @returns {Promise<object>} - Work details
   */
  async getWork(id, token) {
    return this.request(API_ENDPOINTS.work(id), {
      headers: { Authorization: `Bearer ${token}` }
    });
  }

  /**
   * Create new work entry
   * @param {object} data - Work data
   * @param {string} token - Auth token
   * @returns {Promise<object>} - Created work record
   */
  async createWork(data, token) {
    return this.request(API_ENDPOINTS.works, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
  }

  /**
   * Update work entry
   * @param {string} id - Work ID
   * @param {object} data - Updated work data
   * @param {string} token - Auth token
   * @returns {Promise<object>} - Updated work record
   */
  async updateWork(id, data, token) {
    return this.request(API_ENDPOINTS.work(id), {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
  }

  /**
   * Delete work entry
   * @param {string} id - Work ID
   * @param {string} token - Auth token
   * @returns {Promise<void>}
   */
  async deleteWork(id, token) {
    return this.request(API_ENDPOINTS.work(id), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  /**
   * Get works by project
   * @param {string} projectId - Project ID
   * @param {string} token - Auth token
   * @returns {Promise<Array>} - List of work records for project
   */
  async getProjectWorks(projectId, token) {
    return this.request(`${API_ENDPOINTS.project(projectId)}/works`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  }

  /**
   * Get works by contractor
   * @param {string} contractorId - Contractor ID
   * @param {string} token - Auth token
   * @returns {Promise<Array>} - List of work records for contractor
   */
  async getContractorWorks(contractorId, token) {
    return this.request(`${API_ENDPOINTS.contractor(contractorId)}/works`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  }
}

export default new WorkService();
