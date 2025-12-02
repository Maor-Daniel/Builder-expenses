// lambda/getWorks.js
// Get all works with related project and contractor data

const {
  createResponse,
  createErrorResponse,
  getUserIdFromEvent,
  getCurrentTimestamp,
  dynamodb,
  isLocal,
  TABLE_NAMES
} = require('./shared/multi-table-utils');
const { withSecureCors } = require('./shared/cors-config');

exports.handler = withSecureCors(async (event) => {

  try {
    // Get user ID from event context
    const userId = getUserIdFromEvent(event);

    // Parse query parameters for filtering
    const queryParams = event.queryStringParameters || {};
    const { projectId, contractorId, status, sortBy } = queryParams;
    

    let works = [];

    if (projectId) {
      // Query works by project using GSI
      const params = {
        TableName: TABLE_NAMES.WORKS,
        IndexName: 'project-status-index',
        KeyConditionExpression: 'userId = :userProjectId',
        ExpressionAttributeValues: {
          ':userProjectId': `${userId}#${projectId}`
        }
      };

      // Add status filter if provided
      if (status) {
        params.KeyConditionExpression += ' AND begins_with(#statusWorkName, :status)';
        params.ExpressionAttributeNames = { '#statusWorkName': 'status#WorkName' };
        params.ExpressionAttributeValues[':status'] = status;
      }

      const result = await dynamodb.query(params).promise();
      works = result.Items || [];
      
    } else if (contractorId) {
      // Query works by contractor using GSI
      const params = {
        TableName: TABLE_NAMES.WORKS,
        IndexName: 'contractor-index',
        KeyConditionExpression: 'userId = :userContractorId',
        ExpressionAttributeValues: {
          ':userContractorId': `${userId}#${contractorId}`
        }
      };

      const result = await dynamodb.query(params).promise();
      works = result.Items || [];
      
    } else {
      // Get all works for the user
      const params = {
        TableName: TABLE_NAMES.WORKS,
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': userId
        }
      };

      // Add status filter if provided
      if (status) {
        params.FilterExpression = '#status = :status';
        params.ExpressionAttributeNames = { '#status': 'status' };
        params.ExpressionAttributeValues[':status'] = status;
      }

      const result = await dynamodb.query(params).promise();
      works = result.Items || [];
    }


    // Enhance works with project and contractor information
    const enhancedWorks = await Promise.all(
      works.map(async (work) => {
        try {
          // Get project information
          const projectParams = {
            TableName: TABLE_NAMES.PROJECTS,
            Key: { userId: work.userId, projectId: work.projectId }
          };
          
          const projectResult = await dynamodb.get(projectParams).promise();
          const project = projectResult.Item;

          // Get contractor information  
          const contractorParams = {
            TableName: TABLE_NAMES.CONTRACTORS,
            Key: { userId: work.userId, contractorId: work.contractorId }
          };
          
          const contractorResult = await dynamodb.get(contractorParams).promise();
          const contractor = contractorResult.Item;

          // Return enhanced work with related data
          return {
            ...work,
            projectName: project ? project.name : 'Unknown Project',
            contractorName: contractor ? contractor.name : 'Unknown Contractor',
            contractorPhone: contractor ? contractor.phone : ''
          };
        } catch (enhanceError) {
          // Return original work if enhancement fails
          return {
            ...work,
            projectName: 'Error loading project',
            contractorName: 'Error loading contractor',
            contractorPhone: ''
          };
        }
      })
    );

    // Sort works based on sortBy parameter
    if (sortBy === 'name') {
      enhancedWorks.sort((a, b) => a.WorkName.localeCompare(b.WorkName));
    } else if (sortBy === 'cost') {
      enhancedWorks.sort((a, b) => (b.TotalWorkCost || 0) - (a.TotalWorkCost || 0)); // Highest cost first
    } else if (sortBy === 'status') {
      enhancedWorks.sort((a, b) => a.status.localeCompare(b.status));
    } else {
      // Default sort by creation date (newest first)
      enhancedWorks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    // Calculate summary statistics
    const summary = {
      totalCount: enhancedWorks.length,
      totalPlannedCost: enhancedWorks.reduce((sum, work) => sum + (work.TotalWorkCost || 0), 0),
      averagePlannedCost: enhancedWorks.length > 0 ? 
        enhancedWorks.reduce((sum, work) => sum + (work.TotalWorkCost || 0), 0) / enhancedWorks.length : 0,
      statusCounts: enhancedWorks.reduce((counts, work) => {
        const status = work.status || 'unknown';
        counts[status] = (counts[status] || 0) + 1;
        return counts;
      }, {})
    };


    return createResponse(200, {
      success: true,
      message: `Retrieved ${enhancedWorks.length} works`,
      data: {
        works: enhancedWorks,
        summary,
        filters: {
          projectId: projectId || null,
          contractorId: contractorId || null,
          status: status || null,
          sortBy: sortBy || 'createdAt'
        }
      },
      timestamp: getCurrentTimestamp()
    });

  } catch (error) {

    if (error.message.includes('User ID not found')) {
      return createErrorResponse(401, 'Unauthorized: Invalid user context');
    }

    return createErrorResponse(500, 'Failed to retrieve works', error);
  }
};