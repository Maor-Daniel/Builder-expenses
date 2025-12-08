// lambda/shared/input-validator.js
// Input validation and sanitization utilities for production security

const { createLogger } = require('./logger');
const logger = createLogger('input-validator');

/**
 * Validation rules for common field types
 */
const VALIDATION_RULES = {
  email: {
    maxLength: 254,
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    message: 'Invalid email format'
  },
  name: {
    minLength: 1,
    maxLength: 100,
    pattern: /^[\p{L}\p{M}\s\-'.]+$/u,
    message: 'Name contains invalid characters'
  },
  phone: {
    maxLength: 20,
    pattern: /^[\d\s\-+().]+$/,
    message: 'Invalid phone number format'
  },
  date: {
    pattern: /^\d{4}-\d{2}-\d{2}$/,
    message: 'Date must be in YYYY-MM-DD format'
  },
  amount: {
    min: 0,
    max: 100000000,
    message: 'Amount must be between 0 and 100,000,000'
  },
  percentage: {
    min: 0,
    max: 100,
    message: 'Percentage must be between 0 and 100'
  },
  description: {
    maxLength: 5000,
    message: 'Description exceeds maximum length'
  },
  shortText: {
    maxLength: 255,
    message: 'Text exceeds maximum length'
  },
  invoiceNumber: {
    maxLength: 50,
    pattern: /^[\w\-./]+$/,
    message: 'Invoice number contains invalid characters'
  },
  id: {
    maxLength: 100,
    pattern: /^[\w\-]+$/,
    message: 'Invalid ID format'
  }
};

/**
 * Dangerous patterns that indicate potential attacks
 */
const DANGEROUS_PATTERNS = [
  // Script injection
  /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
  /javascript:/gi,
  /on\w+\s*=/gi,

  // SQL injection patterns
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|TRUNCATE)\b[\s\S]*\b(FROM|INTO|TABLE|DATABASE)\b)/gi,
  /(['"])\s*;\s*(--|#|\/\*)/gi,
  /\b(OR|AND)\b\s+['"]?\d+['"]?\s*=\s*['"]?\d+/gi,

  // Path traversal
  /\.\.\//g,
  /\.\.\\/,

  // Command injection
  /[;&|`$(){}[\]]/,

  // Null bytes
  /\x00/g
];

/**
 * Sanitize string input by removing dangerous characters
 * @param {string} input - Input string to sanitize
 * @returns {string} Sanitized string
 */
function sanitizeString(input) {
  if (typeof input !== 'string') {
    return input;
  }

  let sanitized = input;

  // Remove null bytes
  sanitized = sanitized.replace(/\x00/g, '');

  // Trim whitespace
  sanitized = sanitized.trim();

  // HTML encode dangerous characters
  sanitized = sanitized
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');

  return sanitized;
}

/**
 * Check if input contains dangerous patterns
 * @param {string} input - Input to check
 * @returns {Object} { safe: boolean, pattern?: string }
 */
function checkDangerousPatterns(input) {
  if (typeof input !== 'string') {
    return { safe: true };
  }

  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(input)) {
      logger.warn('Dangerous pattern detected in input', {
        pattern: pattern.toString().substring(0, 50),
        inputLength: input.length
      });
      return { safe: false, pattern: pattern.toString() };
    }
    // Reset regex lastIndex for global patterns
    pattern.lastIndex = 0;
  }

  return { safe: true };
}

/**
 * Validate a single field against rules
 * @param {any} value - Value to validate
 * @param {string} fieldName - Name of the field
 * @param {Object} rules - Validation rules
 * @returns {Object} { valid: boolean, error?: string }
 */
function validateField(value, fieldName, rules) {
  // Check if required field is missing
  if (rules.required && (value === undefined || value === null || value === '')) {
    return { valid: false, error: `${fieldName} is required` };
  }

  // If value is empty and not required, it's valid
  if (value === undefined || value === null || value === '') {
    return { valid: true };
  }

  // String validations
  if (typeof value === 'string') {
    // Check dangerous patterns first
    const patternCheck = checkDangerousPatterns(value);
    if (!patternCheck.safe) {
      return { valid: false, error: `${fieldName} contains potentially malicious content` };
    }

    // Length checks
    if (rules.minLength !== undefined && value.length < rules.minLength) {
      return { valid: false, error: `${fieldName} must be at least ${rules.minLength} characters` };
    }

    if (rules.maxLength !== undefined && value.length > rules.maxLength) {
      return { valid: false, error: `${fieldName} must not exceed ${rules.maxLength} characters` };
    }

    // Pattern check
    if (rules.pattern && !rules.pattern.test(value)) {
      return { valid: false, error: rules.message || `${fieldName} format is invalid` };
    }
  }

  // Number validations
  if (typeof value === 'number' || (typeof value === 'string' && !isNaN(parseFloat(value)))) {
    const numValue = typeof value === 'number' ? value : parseFloat(value);

    if (rules.min !== undefined && numValue < rules.min) {
      return { valid: false, error: `${fieldName} must be at least ${rules.min}` };
    }

    if (rules.max !== undefined && numValue > rules.max) {
      return { valid: false, error: `${fieldName} must not exceed ${rules.max}` };
    }
  }

  // Enum validation
  if (rules.enum && !rules.enum.includes(value)) {
    return { valid: false, error: `${fieldName} must be one of: ${rules.enum.join(', ')}` };
  }

  return { valid: true };
}

/**
 * Validate and sanitize an object of fields
 * @param {Object} data - Data object to validate
 * @param {Object} schema - Validation schema
 * @returns {Object} { valid: boolean, errors: string[], sanitized: Object }
 */
function validateAndSanitize(data, schema) {
  const errors = [];
  const sanitized = {};

  for (const [fieldName, rules] of Object.entries(schema)) {
    let value = data[fieldName];

    // Get predefined rules if using a rule type
    let fieldRules = rules;
    if (typeof rules === 'string' && VALIDATION_RULES[rules]) {
      fieldRules = VALIDATION_RULES[rules];
    } else if (rules.type && VALIDATION_RULES[rules.type]) {
      fieldRules = { ...VALIDATION_RULES[rules.type], ...rules };
    }

    // Validate
    const validation = validateField(value, fieldName, fieldRules);
    if (!validation.valid) {
      errors.push(validation.error);
    }

    // Sanitize string values
    if (typeof value === 'string' && fieldRules.sanitize !== false) {
      value = sanitizeString(value);
    }

    // Only include in sanitized if value exists
    if (value !== undefined && value !== null) {
      sanitized[fieldName] = value;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized
  };
}

/**
 * Create validation schema for expense creation
 */
const EXPENSE_SCHEMA = {
  projectId: { type: 'id', required: true },
  contractorId: { type: 'id', required: true },
  invoiceNum: { type: 'invoiceNumber', required: true },
  amount: { type: 'amount', required: true },
  paymentMethod: {
    required: true,
    maxLength: 50,
    enum: ['העברה בנקאית', "צ'ק", 'מזומן', 'כרטיס אשראי']
  },
  date: { type: 'date', required: true },
  description: { type: 'description' },
  workId: { type: 'id' },
  status: { enum: ['pending', 'approved', 'rejected', 'paid'], maxLength: 20 }
};

/**
 * Create validation schema for project creation
 */
const PROJECT_SCHEMA = {
  name: { type: 'name', required: true },
  startDate: { type: 'date', required: true },
  endDate: { type: 'date' },
  description: { type: 'description' },
  status: { enum: ['active', 'completed', 'on-hold', 'cancelled'], maxLength: 20 },
  budget: { type: 'amount' },
  location: { type: 'shortText' },
  clientName: { type: 'name' }
};

/**
 * Create validation schema for contractor creation
 */
const CONTRACTOR_SCHEMA = {
  name: { type: 'name', required: true },
  contactPerson: { type: 'name' },
  phone: { type: 'phone' },
  email: { type: 'email' },
  address: { type: 'description' },
  specialty: { type: 'shortText' },
  licenseNumber: { type: 'shortText' },
  taxId: { type: 'shortText' },
  paymentTerms: { type: 'shortText' },
  notes: { type: 'description' },
  status: { enum: ['active', 'inactive'], maxLength: 20 },
  rating: { type: 'percentage', min: 1, max: 5 }
};

/**
 * Create validation schema for work creation
 */
const WORK_SCHEMA = {
  projectId: { type: 'id', required: true },
  contractorId: { type: 'id', required: true },
  workName: { type: 'name', required: true },
  description: { type: 'description' },
  totalWorkCost: { type: 'amount' },
  status: { enum: ['planned', 'in-progress', 'completed', 'cancelled'], maxLength: 20 },
  startDate: { type: 'date' },
  endDate: { type: 'date' },
  progress: { type: 'percentage' },
  notes: { type: 'description' }
};

/**
 * Create validation schema for invitation
 */
const INVITATION_SCHEMA = {
  email: { type: 'email', required: true },
  role: { required: true, enum: ['admin', 'manager', 'editor', 'viewer'], maxLength: 20 },
  name: { type: 'name' },
  personalMessage: { type: 'description' }
};

/**
 * Middleware for request body validation
 * @param {Object} schema - Validation schema
 * @returns {Function} Middleware function
 */
function validateRequestBody(schema) {
  return (event) => {
    try {
      const body = JSON.parse(event.body || '{}');
      return validateAndSanitize(body, schema);
    } catch (parseError) {
      return {
        valid: false,
        errors: ['Invalid JSON in request body'],
        sanitized: {}
      };
    }
  };
}

module.exports = {
  VALIDATION_RULES,
  sanitizeString,
  checkDangerousPatterns,
  validateField,
  validateAndSanitize,
  validateRequestBody,
  // Pre-defined schemas
  EXPENSE_SCHEMA,
  PROJECT_SCHEMA,
  CONTRACTOR_SCHEMA,
  WORK_SCHEMA,
  INVITATION_SCHEMA
};
