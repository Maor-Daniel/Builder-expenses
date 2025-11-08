// lambda/getProjects.js
// Get all company projects with role-based filtering and permissions

const {
  createResponse,
  createErrorResponse,
  getCompanyUserFromEvent,
  getCurrentTimestamp,
  dynamoOperation,
  COMPANY_TABLE_NAMES,
  PERMISSIONS,
  hasPermission,
  applyDataFiltering,
  withCompanyAuth,
  debugLog
} = require('./shared/company-utils');

// Main handler with permission-based filtering
async function getProjectsHandler(event) {
  debugLog('getProjects request received', { 
    httpMethod: event.httpMethod,
    queryParameters: event.queryStringParameters 
  });

  try {
    // Get company and user context
    const { companyId, userId, userRole } = getCompanyUserFromEvent(event);
    debugLog('User context', { companyId, userId, userRole });

    // Parse query parameters for filtering
    const queryParams = event.queryStringParameters || {};
    const { status, sortBy } = queryParams;
    
    debugLog('Query parameters', queryParams);

    // Build company-scoped DynamoDB query parameters
    let params = {
      TableName: COMPANY_TABLE_NAMES.PROJECTS,
      KeyConditionExpression: 'companyId = :companyId',
      ExpressionAttributeValues: {
        ':companyId': companyId
      }
    };

    // Add status filter if provided
    if (status) {
      params.FilterExpression = '#status = :status';
      params.ExpressionAttributeNames = { '#status': 'status' };
      params.ExpressionAttributeValues[':status'] = status;
    }

    debugLog('DynamoDB query params', params);

    const result = await dynamoOperation('query', params);
    let projects = result.Items || [];

    debugLog(`Found ${projects.length} projects before filtering`);

    // Apply role-based data filtering
    if (!hasPermission(userRole, PERMISSIONS.VIEW_ALL_DATA)) {
      // Filter to only show projects created by or assigned to the user
      projects = projects.filter(project => {
        if (project.createdBy === userId) {
          return true;
        }
        
        // Check if assigned to user
        if (project.assignedTo && Array.isArray(project.assignedTo) && project.assignedTo.includes(userId)) {
          return true;
        }
        
        return false;
      });
      
      debugLog(`After permission filtering: ${projects.length} projects`);
    }

    // Sort projects based on sortBy parameter
    if (sortBy === 'name') {
      projects.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'date') {
      projects.sort((a, b) => new Date(b.startDate) - new Date(a.startDate)); // Newest first
    } else if (sortBy === 'spent') {
      projects.sort((a, b) => (b.SpentAmount || 0) - (a.SpentAmount || 0)); // Highest spending first
    } else {
      // Default sort by creation date (newest first)
      projects.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    // Calculate summary statistics
    const summary = {
      totalCount: projects.length,
      totalSpentAmount: projects.reduce((sum, project) => sum + (project.SpentAmount || 0), 0),
      averageSpentAmount: projects.length > 0 ? 
        projects.reduce((sum, project) => sum + (project.SpentAmount || 0), 0) / projects.length : 0,
      statusCounts: projects.reduce((counts, project) => {
        const status = project.status || 'unknown';
        counts[status] = (counts[status] || 0) + 1;
        return counts;
      }, {}),
      // Add permission-aware metadata
      userPermissions: {
        canViewAll: hasPermission(userRole, PERMISSIONS.VIEW_ALL_DATA),
        canCreateProjects: hasPermission(userRole, PERMISSIONS.CREATE_PROJECTS),
        canEditAll: hasPermission(userRole, PERMISSIONS.EDIT_ALL_PROJECTS),
        canEditOwn: hasPermission(userRole, PERMISSIONS.EDIT_OWN_PROJECTS),
        canDelete: hasPermission(userRole, PERMISSIONS.DELETE_PROJECTS)
      }
    };

    debugLog('Projects retrieved successfully', { 
      companyId, 
      totalCount: projects.length,
      userRole,
      hasViewAllPermission: hasPermission(userRole, PERMISSIONS.VIEW_ALL_DATA)
    });

    return createResponse(200, {
      success: true,
      message: `Retrieved ${projects.length} projects for ${userRole} user`,
      data: {
        projects,
        summary,
        filters: {
          status: status || null,
          sortBy: sortBy || 'createdAt'
        }
      },
      timestamp: getCurrentTimestamp()
    });

  } catch (error) {
    console.error('Error in getProjects:', error);

    if (error.message.includes('Company authentication required')) {
      return createErrorResponse(401, 'Authentication required');
    }

    if (error.message.includes('missing company')) {
      return createErrorResponse(401, 'Invalid company context');
    }

    return createErrorResponse(500, 'Failed to retrieve projects', error);
  }
}

// Export handler wrapped with company authentication middleware
exports.handler = withCompanyAuth(getProjectsHandler);