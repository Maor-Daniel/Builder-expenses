// lambda/shared/table-config.js
// Centralized DynamoDB table configuration with environment support
//
// This module provides environment-aware table names for all DynamoDB tables.
// Supports production, staging, and development environments.
//
// Usage:
//   const { COMPANY_TABLE_NAMES, PADDLE_TABLE_NAMES } = require('./shared/table-config');
//   const tableName = COMPANY_TABLE_NAMES.COMPANIES;

const ENVIRONMENT = process.env.ENVIRONMENT || process.env.NODE_ENV || 'production';
const TABLE_PREFIX = process.env.TABLE_PREFIX || 'construction-expenses';

/**
 * Generate table name with environment-aware prefix
 * @param {string} tableSuffix - The table suffix (e.g., 'companies', 'company-users')
 * @returns {string} Full table name with environment prefix
 *
 * Examples:
 *   production: construction-expenses-companies
 *   staging: construction-expenses-staging-companies
 *   dev: construction-expenses-dev-companies
 */
function getTableName(tableSuffix) {
  if (ENVIRONMENT === 'production') {
    return `${TABLE_PREFIX}-${tableSuffix}`;
  }
  return `${TABLE_PREFIX}-${ENVIRONMENT}-${tableSuffix}`;
}

// Company-related table names
const COMPANY_TABLE_NAMES = {
  COMPANIES: getTableName('companies'),
  USERS: getTableName('company-users'),
  INVITATIONS: getTableName('invitations'),
  PROJECTS: getTableName('company-projects'),
  CONTRACTORS: getTableName('company-contractors'),
  EXPENSES: getTableName('company-expenses'),
  WORKS: getTableName('company-works')
};

// Paddle subscription table names
const PADDLE_TABLE_NAMES = {
  SUBSCRIPTIONS: getTableName('paddle-subscriptions'),
  CUSTOMERS: getTableName('paddle-customers'),
  PAYMENTS: getTableName('paddle-payments'),
  WEBHOOKS: getTableName('paddle-webhooks'),
  WEBHOOK_DLQ: getTableName('paddle-webhook-dlq')
};

module.exports = {
  ENVIRONMENT,
  TABLE_PREFIX,
  getTableName,
  COMPANY_TABLE_NAMES,
  PADDLE_TABLE_NAMES
};
