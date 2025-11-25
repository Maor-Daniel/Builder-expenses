import { API_CONFIG, API_ENDPOINTS } from '../config/api';

/**
 * Project API Service
 *
 * Handles all project-related API calls including:
 * - Fetching projects list
 * - Creating new projects
 * - Updating existing projects
 * - Deleting projects
 * - Getting project details
 */
class ProjectService {
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
   * Get all projects
   * @param {string} token - Auth token from Clerk
   * @returns {Promise<Array>} - List of projects
   */
  async getProjects(token) {
    return this.request(API_ENDPOINTS.projects, {
      headers: { Authorization: `Bearer ${token}` }
    });
  }

  /**
   * Get project by ID
   * @param {string} id - Project ID
   * @param {string} token - Auth token
   * @returns {Promise<object>} - Project details
   */
  async getProject(id, token) {
    return this.request(API_ENDPOINTS.project(id), {
      headers: { Authorization: `Bearer ${token}` }
    });
  }

  /**
   * Create new project
   * @param {object} data - Project data
   * @param {string} token - Auth token
   * @returns {Promise<object>} - Created project
   */
  async createProject(data, token) {
    return this.request(API_ENDPOINTS.projects, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
  }

  /**
   * Update project
   * @param {string} id - Project ID
   * @param {object} data - Updated project data
   * @param {string} token - Auth token
   * @returns {Promise<object>} - Updated project
   */
  async updateProject(id, data, token) {
    return this.request(API_ENDPOINTS.project(id), {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(data),
    });
  }

  /**
   * Delete project
   * @param {string} id - Project ID
   * @param {string} token - Auth token
   * @returns {Promise<void>}
   */
  async deleteProject(id, token) {
    return this.request(API_ENDPOINTS.project(id), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  /**
   * Get project expenses
   * @param {string} projectId - Project ID
   * @param {string} token - Auth token
   * @returns {Promise<Array>} - List of project expenses
   */
  async getProjectExpenses(projectId, token) {
    return this.request(`${API_ENDPOINTS.project(projectId)}/expenses`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  }
}

export default new ProjectService();
