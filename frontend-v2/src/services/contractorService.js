import { API_CONFIG, API_ENDPOINTS } from '../config/api';

/**
 * Contractor API Service
 *
 * Handles all contractor-related API calls including:
 * - Fetching contractors list
 * - Creating new contractors
 * - Updating existing contractors
 * - Deleting contractors
 * - Getting contractor details
 */
class ContractorService {
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
   * Get all contractors
   * @param {string} token - Auth token from Clerk
   * @returns {Promise<Array>} - List of contractors
   */
  async getContractors(token) {
    return this.request(API_ENDPOINTS.contractors, {
      headers: { Authorization: `Bearer ${token}` }
    });
  }

  /**
   * Get contractor by ID
   * @param {string} id - Contractor ID
   * @param {string} token - Auth token
   * @returns {Promise<object>} - Contractor details
   */
  async getContractor(id, token) {
    return this.request(API_ENDPOINTS.contractor(id), {
      headers: { Authorization: `Bearer ${token}` }
    });
  }

  /**
   * Create new contractor
   * @param {object} data - Contractor data
   * @param {string} token - Auth token
   * @returns {Promise<object>} - Created contractor
   */
  async createContractor(data, token) {
    return this.request(API_ENDPOINTS.contractors, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
  }

  /**
   * Update contractor
   * @param {string} id - Contractor ID
   * @param {object} data - Updated contractor data
   * @param {string} token - Auth token
   * @returns {Promise<object>} - Updated contractor
   */
  async updateContractor(id, data, token) {
    return this.request(API_ENDPOINTS.contractor(id), {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
  }

  /**
   * Delete contractor
   * @param {string} id - Contractor ID
   * @param {string} token - Auth token
   * @returns {Promise<void>}
   */
  async deleteContractor(id, token) {
    return this.request(API_ENDPOINTS.contractor(id), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  /**
   * Get contractor's work history
   * @param {string} contractorId - Contractor ID
   * @param {string} token - Auth token
   * @returns {Promise<Array>} - List of work records
   */
  async getContractorWorks(contractorId, token) {
    return this.request(`${API_ENDPOINTS.contractor(contractorId)}/works`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  }
}

export default new ContractorService();
