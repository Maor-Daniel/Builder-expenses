// lambda/shared/webhook-retry-utils.js
// Retry logic and Dead-Letter Queue utilities for Paddle webhook processing
//
// Provides exponential backoff retry mechanism and DLQ operations for reliable
// webhook processing with idempotency checks.

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  QueryCommand
} = require('@aws-sdk/lib-dynamodb');
const { PADDLE_TABLE_NAMES } = require('./table-config');

// DynamoDB client setup
const ddbClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1'
});
const dynamodb = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: {
    convertEmptyValues: false,
    removeUndefinedValues: true,
    convertClassInstanceToMap: false
  },
  unmarshallOptions: {
    wrapNumbers: false
  }
});

/**
 * Retry configuration
 * - 5 retries with exponential backoff
 * - Delays: 1s, 2s, 4s, 8s, 16s
 */
const RETRY_CONFIG = {
  maxRetries: 5,
  baseDelayMs: 1000,
  maxDelayMs: 16000,
  backoffMultiplier: 2
};

/**
 * Calculate exponential backoff delay
 * @param {number} retryCount - Current retry attempt (0-indexed)
 * @returns {number} Delay in milliseconds
 */
function calculateBackoffDelay(retryCount) {
  const delay = RETRY_CONFIG.baseDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, retryCount);
  return Math.min(delay, RETRY_CONFIG.maxDelayMs);
}

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get current ISO timestamp
 * @returns {string} ISO 8601 timestamp
 */
function getCurrentTimestamp() {
  return new Date().toISOString();
}

/**
 * Determine if an error is transient and should be retried
 * @param {Error} error - The error to check
 * @returns {boolean} True if error is transient
 */
function isTransientError(error) {
  const transientCodes = [
    'ProvisionedThroughputExceededException',
    'ThrottlingException',
    'ServiceUnavailable',
    'InternalServerError',
    'RequestTimeout',
    'ETIMEDOUT',
    'ECONNRESET',
    'ENOTFOUND',
    'ECONNREFUSED',
    'NetworkingError'
  ];

  // Check error code, name, or if message contains transient indicator
  return transientCodes.some(code =>
    error.code === code ||
    error.name === code ||
    error.$metadata?.httpStatusCode >= 500 ||
    error.message?.includes(code)
  );
}

/**
 * Execute an operation with retry logic and exponential backoff
 * @param {Function} operation - Async function to execute
 * @param {Object} context - Context for logging (correlationId, eventId, etc.)
 * @param {Object} logger - Logger instance
 * @returns {Promise<Object>} Result object with success status, result/error, and retry info
 */
async function executeWithRetry(operation, context, logger) {
  let lastError = null;
  const processingHistory = [];

  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      // Apply delay before retry (not on first attempt)
      if (attempt > 0) {
        const delay = calculateBackoffDelay(attempt - 1);
        logger.info('Retry attempt starting', {
          correlationId: context.correlationId,
          attempt,
          maxRetries: RETRY_CONFIG.maxRetries,
          delayMs: delay,
          eventId: context.eventId,
          companyId: context.companyId
        });
        await sleep(delay);
      }

      // Execute the operation
      const result = await operation();

      // Log success after retry
      if (attempt > 0) {
        logger.info('Retry succeeded', {
          correlationId: context.correlationId,
          attempt,
          eventId: context.eventId,
          companyId: context.companyId
        });
      }

      return {
        success: true,
        result,
        retryCount: attempt,
        processingHistory
      };

    } catch (error) {
      lastError = error;

      // Record attempt in history
      processingHistory.push({
        attempt,
        timestamp: getCurrentTimestamp(),
        error: error.message,
        errorName: error.name,
        isTransient: isTransientError(error)
      });

      logger.warn('Operation failed', {
        correlationId: context.correlationId,
        attempt,
        maxRetries: RETRY_CONFIG.maxRetries,
        error: error.message,
        errorName: error.name,
        eventId: context.eventId,
        companyId: context.companyId,
        isTransient: isTransientError(error),
        willRetry: attempt < RETRY_CONFIG.maxRetries && isTransientError(error)
      });

      // Only retry transient errors
      if (!isTransientError(error)) {
        logger.error('Non-transient error, skipping retries', {
          correlationId: context.correlationId,
          error: error.message,
          errorName: error.name,
          eventId: context.eventId,
          companyId: context.companyId
        });
        break;
      }
    }
  }

  // All retries exhausted or non-retryable error
  return {
    success: false,
    error: lastError,
    retryCount: processingHistory.length,
    processingHistory
  };
}

/**
 * Add a failed webhook to the Dead Letter Queue
 * @param {Object} webhookData - Full webhook payload from Paddle
 * @param {Error} error - The error that caused failure
 * @param {number} retryCount - Number of retry attempts made
 * @param {Array} processingHistory - Array of attempt records
 * @returns {Promise<Object>} The created DLQ entry
 */
async function addToDLQ(webhookData, error, retryCount, processingHistory = []) {
  const timestamp = getCurrentTimestamp();
  const companyId = webhookData.data?.custom_data?.companyId || 'unknown';
  const userId = webhookData.data?.custom_data?.userId || 'unknown';

  const dlqEntry = {
    dlqEntryId: `dlq_${webhookData.event_id}_${Date.now()}`,
    webhookId: webhookData.event_id,
    eventType: webhookData.event_type,
    eventId: webhookData.event_id,
    payload: JSON.stringify(webhookData),
    companyId,
    userId,
    failureReason: error?.message || 'Unknown error',
    failureStack: error?.stack || null,
    retryCount,
    maxRetries: RETRY_CONFIG.maxRetries,
    firstFailedAt: processingHistory[0]?.timestamp || timestamp,
    lastFailedAt: timestamp,
    status: 'exhausted',
    processingHistory,
    ttl: Math.floor(Date.now() / 1000) + (180 * 24 * 60 * 60), // 180 days
    createdAt: timestamp,
    updatedAt: timestamp
  };

  await dynamodb.send(new PutCommand({
    TableName: PADDLE_TABLE_NAMES.WEBHOOK_DLQ,
    Item: dlqEntry
  }));

  // Log for CloudWatch alerting
  console.error(JSON.stringify({
    level: 'ERROR',
    type: 'WEBHOOK_DLQ_ENTRY',
    dlqEntryId: dlqEntry.dlqEntryId,
    eventId: webhookData.event_id,
    eventType: webhookData.event_type,
    companyId,
    userId,
    failureReason: error?.message,
    retryCount,
    timestamp
  }));

  return dlqEntry;
}

/**
 * Check if a webhook has already been successfully processed (idempotency check)
 * @param {string} eventId - Paddle event ID
 * @returns {Promise<boolean>} True if webhook was already processed
 */
async function isWebhookProcessed(eventId) {
  try {
    const result = await dynamodb.send(new GetCommand({
      TableName: PADDLE_TABLE_NAMES.WEBHOOKS,
      Key: { webhookId: eventId }
    }));

    if (result.Item) {
      // Check if it was successfully processed
      return result.Item.status === 'processed';
    }

    return false;
  } catch (error) {
    // If check fails, assume not processed to allow processing
    console.warn('Idempotency check failed, allowing processing:', error.message);
    return false;
  }
}

/**
 * Get DLQ entries by status for manual processing
 * @param {string} status - Status to filter by ('exhausted', 'pending_retry', 'manually_resolved')
 * @param {number} limit - Maximum entries to return
 * @returns {Promise<Array>} Array of DLQ entries
 */
async function getDLQEntries(status = 'exhausted', limit = 50) {
  try {
    const result = await dynamodb.send(new QueryCommand({
      TableName: PADDLE_TABLE_NAMES.WEBHOOK_DLQ,
      IndexName: 'statusIndex',
      KeyConditionExpression: '#status = :status',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': status },
      Limit: limit,
      ScanIndexForward: false // Most recent first
    }));

    return result.Items || [];
  } catch (error) {
    console.error('Failed to get DLQ entries:', error.message);
    return [];
  }
}

/**
 * Mark a DLQ entry as manually resolved
 * @param {string} dlqEntryId - DLQ entry ID
 * @param {string} resolution - Resolution description
 * @returns {Promise<void>}
 */
async function resolveDLQEntry(dlqEntryId, resolution) {
  const timestamp = getCurrentTimestamp();

  await dynamodb.send(new UpdateCommand({
    TableName: PADDLE_TABLE_NAMES.WEBHOOK_DLQ,
    Key: { dlqEntryId },
    UpdateExpression: 'SET #status = :status, resolution = :resolution, resolvedAt = :resolved, updatedAt = :updated',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: {
      ':status': 'manually_resolved',
      ':resolution': resolution,
      ':resolved': timestamp,
      ':updated': timestamp
    }
  }));
}

/**
 * Get a DLQ entry for manual retry
 * @param {string} dlqEntryId - DLQ entry ID
 * @returns {Promise<Object|null>} The webhook data to retry, or null if not found
 */
async function getDLQEntryForRetry(dlqEntryId) {
  const result = await dynamodb.send(new GetCommand({
    TableName: PADDLE_TABLE_NAMES.WEBHOOK_DLQ,
    Key: { dlqEntryId }
  }));

  if (!result.Item) {
    return null;
  }

  // Mark as pending retry
  await dynamodb.send(new UpdateCommand({
    TableName: PADDLE_TABLE_NAMES.WEBHOOK_DLQ,
    Key: { dlqEntryId },
    UpdateExpression: 'SET #status = :status, updatedAt = :updated',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: {
      ':status': 'pending_retry',
      ':updated': getCurrentTimestamp()
    }
  }));

  return JSON.parse(result.Item.payload);
}

module.exports = {
  RETRY_CONFIG,
  calculateBackoffDelay,
  sleep,
  getCurrentTimestamp,
  isTransientError,
  executeWithRetry,
  addToDLQ,
  isWebhookProcessed,
  getDLQEntries,
  resolveDLQEntry,
  getDLQEntryForRetry
};
