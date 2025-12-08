// tests/security-modules.test.js
// Unit tests for critical security modules

const {
  sanitizeString,
  checkDangerousPatterns,
  validateField,
  validateAndSanitize,
  validateRequestBody,
  VALIDATION_RULES,
  EXPENSE_SCHEMA,
  PROJECT_SCHEMA,
  CONTRACTOR_SCHEMA,
  WORK_SCHEMA
} = require('../lambda/shared/input-validator');

const { createLogger } = require('../lambda/shared/logger');

const {
  createAuditLogger,
  AUDIT_ACTIONS,
  RESOURCE_TYPES
} = require('../lambda/shared/audit-logger');

// ============================================
// INPUT SANITIZATION TESTS
// ============================================

describe('input-validator', () => {
  describe('sanitizeString', () => {
    test('encodes HTML special characters', () => {
      expect(sanitizeString('<script>alert("xss")</script>')).toContain('&lt;');
      expect(sanitizeString('<script>alert("xss")</script>')).toContain('&gt;');
    });

    test('encodes quotes', () => {
      expect(sanitizeString('"test"')).toBe('&quot;test&quot;');
      expect(sanitizeString("'test'")).toBe('&#x27;test&#x27;');
    });

    test('encodes ampersands', () => {
      expect(sanitizeString('test & value')).toBe('test &amp; value');
    });

    test('removes null bytes', () => {
      expect(sanitizeString('test\x00value')).toBe('testvalue');
    });

    test('preserves safe strings', () => {
      expect(sanitizeString('Hello World')).toBe('Hello World');
      expect(sanitizeString('Test123')).toBe('Test123');
    });

    test('trims whitespace', () => {
      expect(sanitizeString('  hello  ')).toBe('hello');
      expect(sanitizeString('\n\ttest\n\t')).toBe('test');
    });

    test('handles non-string inputs', () => {
      expect(sanitizeString(123)).toBe(123);
      expect(sanitizeString(null)).toBe(null);
      expect(sanitizeString(undefined)).toBe(undefined);
    });
  });

  describe('checkDangerousPatterns', () => {
    test('detects script injection', () => {
      expect(checkDangerousPatterns('<script>alert(1)</script>').safe).toBe(false);
      expect(checkDangerousPatterns('javascript:alert(1)').safe).toBe(false);
    });

    test('detects event handlers', () => {
      expect(checkDangerousPatterns('onclick=alert(1)').safe).toBe(false);
      expect(checkDangerousPatterns('onerror=evil()').safe).toBe(false);
    });

    test('detects SQL injection', () => {
      expect(checkDangerousPatterns("'; DROP TABLE users; --").safe).toBe(false);
      expect(checkDangerousPatterns("1' OR '1'='1").safe).toBe(false);
      expect(checkDangerousPatterns("admin'; DELETE FROM users; --").safe).toBe(false);
    });

    test('detects path traversal', () => {
      expect(checkDangerousPatterns('../../../etc/passwd').safe).toBe(false);
      expect(checkDangerousPatterns('..\\..\\windows').safe).toBe(false);
    });

    test('allows safe strings', () => {
      expect(checkDangerousPatterns('Hello World').safe).toBe(true);
      expect(checkDangerousPatterns('user@example.com').safe).toBe(true);
      expect(checkDangerousPatterns('Normal text 123').safe).toBe(true);
    });

    test('handles non-string inputs', () => {
      expect(checkDangerousPatterns(123).safe).toBe(true);
      expect(checkDangerousPatterns(null).safe).toBe(true);
    });
  });

  describe('validateField', () => {
    test('validates required fields', () => {
      const rules = { required: true };

      expect(validateField('Test', 'name', rules).valid).toBe(true);
      expect(validateField('', 'name', rules).valid).toBe(false);
      expect(validateField(null, 'name', rules).valid).toBe(false);
      expect(validateField(undefined, 'name', rules).valid).toBe(false);
    });

    test('validates string length', () => {
      const rules = { minLength: 2, maxLength: 50 };

      expect(validateField('Jo', 'name', rules).valid).toBe(true);
      expect(validateField('J', 'name', rules).valid).toBe(false);
      expect(validateField('a'.repeat(51), 'name', rules).valid).toBe(false);
    });

    test('validates numeric range', () => {
      const rules = { min: 0, max: 1000000 };

      expect(validateField(100, 'amount', rules).valid).toBe(true);
      expect(validateField(-1, 'amount', rules).valid).toBe(false);
      expect(validateField(2000000, 'amount', rules).valid).toBe(false);
    });

    test('validates pattern matching', () => {
      const rules = { pattern: /^[A-Z]{3}-\d{4}$/ };

      expect(validateField('ABC-1234', 'code', rules).valid).toBe(true);
      expect(validateField('invalid', 'code', rules).valid).toBe(false);
    });

    test('validates enum values', () => {
      const rules = { enum: ['active', 'inactive', 'pending'] };

      expect(validateField('active', 'status', rules).valid).toBe(true);
      expect(validateField('invalid', 'status', rules).valid).toBe(false);
    });

    test('returns error messages', () => {
      const rules = { required: true };
      const result = validateField('', 'name', rules);

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('detects dangerous patterns in strings', () => {
      const rules = {};
      const result = validateField('<script>alert(1)</script>', 'input', rules);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('malicious');
    });
  });

  describe('validateAndSanitize', () => {
    test('validates multiple fields', () => {
      const schema = {
        name: { required: true, minLength: 2 },
        email: { type: 'email' }
      };

      const result = validateAndSanitize(
        { name: 'John', email: 'john@example.com' },
        schema
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('collects all validation errors', () => {
      const schema = {
        name: { required: true },
        email: { required: true }
      };

      const result = validateAndSanitize({}, schema);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(2);
    });

    test('sanitizes string values', () => {
      const schema = {
        name: { required: true }
      };

      const result = validateAndSanitize(
        { name: '  John  ' },
        schema
      );

      expect(result.sanitized.name).toBe('John');
    });

    test('uses predefined validation rules', () => {
      const schema = {
        email: { type: 'email', required: true }
      };

      const validResult = validateAndSanitize(
        { email: 'test@example.com' },
        schema
      );
      expect(validResult.valid).toBe(true);

      const invalidResult = validateAndSanitize(
        { email: 'invalid-email' },
        schema
      );
      expect(invalidResult.valid).toBe(false);
    });
  });

  describe('validateRequestBody', () => {
    test('parses and validates JSON body', () => {
      const schema = { name: { required: true } };
      const validator = validateRequestBody(schema);

      const event = { body: JSON.stringify({ name: 'Test' }) };
      const result = validator(event);

      expect(result.valid).toBe(true);
    });

    test('handles invalid JSON', () => {
      const schema = { name: { required: true } };
      const validator = validateRequestBody(schema);

      const event = { body: 'invalid json' };
      const result = validator(event);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid JSON in request body');
    });

    test('handles empty body', () => {
      const schema = { name: { required: true } };
      const validator = validateRequestBody(schema);

      const event = { body: null };
      const result = validator(event);

      expect(result.valid).toBe(false);
    });
  });
});

// ============================================
// VALIDATION RULES TESTS
// ============================================

describe('VALIDATION_RULES', () => {
  test('email rule is defined correctly', () => {
    expect(VALIDATION_RULES.email).toBeDefined();
    expect(VALIDATION_RULES.email.pattern).toBeDefined();
    expect(VALIDATION_RULES.email.maxLength).toBe(254);
  });

  test('name rule is defined correctly', () => {
    expect(VALIDATION_RULES.name).toBeDefined();
    expect(VALIDATION_RULES.name.minLength).toBe(1);
    expect(VALIDATION_RULES.name.maxLength).toBe(100);
  });

  test('amount rule is defined correctly', () => {
    expect(VALIDATION_RULES.amount).toBeDefined();
    expect(VALIDATION_RULES.amount.min).toBe(0);
    expect(VALIDATION_RULES.amount.max).toBe(100000000);
  });

  test('date rule is defined correctly', () => {
    expect(VALIDATION_RULES.date).toBeDefined();
    expect(VALIDATION_RULES.date.pattern).toBeDefined();
  });
});

// ============================================
// SCHEMA TESTS
// ============================================

describe('Schema definitions', () => {
  test('EXPENSE_SCHEMA has required fields', () => {
    expect(EXPENSE_SCHEMA.projectId.required).toBe(true);
    expect(EXPENSE_SCHEMA.contractorId.required).toBe(true);
    expect(EXPENSE_SCHEMA.invoiceNum.required).toBe(true);
    expect(EXPENSE_SCHEMA.amount.required).toBe(true);
    expect(EXPENSE_SCHEMA.date.required).toBe(true);
  });

  test('PROJECT_SCHEMA has required fields', () => {
    expect(PROJECT_SCHEMA.name.required).toBe(true);
    expect(PROJECT_SCHEMA.startDate.required).toBe(true);
  });

  test('CONTRACTOR_SCHEMA has required fields', () => {
    expect(CONTRACTOR_SCHEMA.name.required).toBe(true);
  });

  test('WORK_SCHEMA has required fields', () => {
    expect(WORK_SCHEMA.projectId.required).toBe(true);
    expect(WORK_SCHEMA.contractorId.required).toBe(true);
    expect(WORK_SCHEMA.workName.required).toBe(true);
  });
});

// ============================================
// STRUCTURED LOGGER TESTS
// ============================================

describe('logger', () => {
  let logger;
  let consoleSpy;

  beforeEach(() => {
    logger = createLogger('test-service');
    consoleSpy = {
      log: jest.spyOn(console, 'log').mockImplementation(),
      error: jest.spyOn(console, 'error').mockImplementation(),
      warn: jest.spyOn(console, 'warn').mockImplementation()
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('creates logger with service name', () => {
    expect(logger).toBeDefined();
    expect(logger.info).toBeDefined();
    expect(logger.error).toBeDefined();
    expect(logger.warn).toBeDefined();
    expect(logger.debug).toBeDefined();
  });

  test('logs info messages with structured format', () => {
    logger.info('Test message', { key: 'value' });

    expect(consoleSpy.log).toHaveBeenCalled();
    const logCall = consoleSpy.log.mock.calls[0][0];
    const parsed = JSON.parse(logCall);

    expect(parsed.level).toBe('INFO');
    expect(parsed.message).toBe('Test message');
    expect(parsed.service).toBeDefined();
    expect(parsed.module).toBe('test-service');
    expect(parsed.key).toBe('value');
    expect(parsed.timestamp).toBeDefined();
  });

  test('logs error messages', () => {
    const error = new Error('Test error');
    logger.error('Error occurred', { error });

    expect(consoleSpy.error).toHaveBeenCalled();
    const logCall = consoleSpy.error.mock.calls[0][0];
    const parsed = JSON.parse(logCall);

    expect(parsed.level).toBe('ERROR');
    expect(parsed.message).toBe('Error occurred');
  });

  test('logs warn messages', () => {
    logger.warn('Warning message', { details: 'test' });

    expect(consoleSpy.warn).toHaveBeenCalled();
    const logCall = consoleSpy.warn.mock.calls[0][0];
    const parsed = JSON.parse(logCall);

    expect(parsed.level).toBe('WARN');
  });
});

// ============================================
// AUDIT LOGGER TESTS
// ============================================

describe('audit-logger', () => {
  let auditLogger;
  let consoleSpy;

  beforeEach(() => {
    auditLogger = createAuditLogger(RESOURCE_TYPES.EXPENSE);
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('exports correct action types', () => {
    expect(AUDIT_ACTIONS.CREATE).toBe('CREATE');
    expect(AUDIT_ACTIONS.READ).toBe('READ');
    expect(AUDIT_ACTIONS.UPDATE).toBe('UPDATE');
    expect(AUDIT_ACTIONS.DELETE).toBe('DELETE');
  });

  test('exports correct resource types', () => {
    expect(RESOURCE_TYPES.EXPENSE).toBe('expense');
    expect(RESOURCE_TYPES.PROJECT).toBe('project');
    expect(RESOURCE_TYPES.CONTRACTOR).toBe('contractor');
    expect(RESOURCE_TYPES.WORK).toBe('work');
    expect(RESOURCE_TYPES.COMPANY).toBe('company');
    expect(RESOURCE_TYPES.USER).toBe('user');
  });

  test('logs CREATE action with required fields', () => {
    const event = {
      requestContext: {
        identity: { sourceIp: '127.0.0.1' },
        requestId: 'req-123'
      },
      headers: { 'User-Agent': 'test-agent' },
      httpMethod: 'POST',
      path: '/expenses'
    };

    auditLogger.logCreate({
      resourceId: 'exp-123',
      companyId: 'comp-456',
      userId: 'user-789',
      userRole: 'admin',
      data: { amount: 100 },
      request: event
    });

    expect(consoleSpy).toHaveBeenCalled();
    const logCall = consoleSpy.mock.calls[0][0];
    const parsed = JSON.parse(logCall);

    expect(parsed.auditType).toBe('AUDIT_LOG');
    expect(parsed.action).toBe('CREATE');
    expect(parsed.resourceType).toBe('expense');
    expect(parsed.resourceId).toBe('exp-123');
    expect(parsed.companyId).toBe('comp-456');
    expect(parsed.userId).toBe('user-789');
    expect(parsed.userRole).toBe('admin');
    expect(parsed.success).toBe(true);
    expect(parsed.requestContext).toBeDefined();
  });

  test('logs READ action with count metadata', () => {
    const event = {
      requestContext: {
        identity: { sourceIp: '127.0.0.1' },
        requestId: 'req-123'
      },
      headers: {},
      httpMethod: 'GET',
      path: '/expenses'
    };

    auditLogger.logRead({
      companyId: 'comp-456',
      userId: 'user-789',
      userRole: 'admin',
      count: 25,
      request: event
    });

    expect(consoleSpy).toHaveBeenCalled();
    const logCall = consoleSpy.mock.calls[0][0];
    const parsed = JSON.parse(logCall);

    expect(parsed.action).toBe('READ');
    expect(parsed.metadata.recordsReturned).toBe(25);
  });

  test('logs UPDATE action with before/after state', () => {
    const event = {
      requestContext: {
        identity: { sourceIp: '127.0.0.1' },
        requestId: 'req-123'
      },
      headers: {},
      httpMethod: 'PUT',
      path: '/expenses'
    };

    auditLogger.logUpdate({
      resourceId: 'exp-123',
      companyId: 'comp-456',
      userId: 'user-789',
      userRole: 'admin',
      before: { amount: 100 },
      after: { amount: 150 },
      request: event
    });

    expect(consoleSpy).toHaveBeenCalled();
    const logCall = consoleSpy.mock.calls[0][0];
    const parsed = JSON.parse(logCall);

    expect(parsed.action).toBe('UPDATE');
    expect(parsed.before).toBeDefined();
    expect(parsed.after).toBeDefined();
  });

  test('logs DELETE action with deleted data', () => {
    const event = {
      requestContext: {
        identity: { sourceIp: '127.0.0.1' },
        requestId: 'req-123'
      },
      headers: {},
      httpMethod: 'DELETE',
      path: '/expenses/exp-123'
    };

    auditLogger.logDelete({
      resourceId: 'exp-123',
      companyId: 'comp-456',
      userId: 'user-789',
      userRole: 'admin',
      deletedData: { amount: 100, description: 'Test' },
      request: event
    });

    expect(consoleSpy).toHaveBeenCalled();
    const logCall = consoleSpy.mock.calls[0][0];
    const parsed = JSON.parse(logCall);

    expect(parsed.action).toBe('DELETE');
    expect(parsed.resourceId).toBe('exp-123');
  });

  test('logs failure with error message', () => {
    // Failure logs go to console.error, not console.log
    const errorSpy = jest.spyOn(console, 'error').mockImplementation();

    const event = {
      requestContext: {
        identity: { sourceIp: '127.0.0.1' },
        requestId: 'req-123'
      },
      headers: {},
      httpMethod: 'POST',
      path: '/expenses'
    };

    auditLogger.logCreate({
      resourceId: 'exp-123',
      companyId: 'comp-456',
      userId: 'user-789',
      userRole: 'admin',
      data: { amount: 100 },
      request: event,
      success: false,
      errorMessage: 'Validation failed'
    });

    expect(errorSpy).toHaveBeenCalled();
    const logCall = errorSpy.mock.calls[0][0];
    const parsed = JSON.parse(logCall);

    expect(parsed.success).toBe(false);
    expect(parsed.errorMessage).toBe('Validation failed');
  });

  test('extracts request context correctly', () => {
    const event = {
      requestContext: {
        identity: {
          sourceIp: '192.168.1.100',
          userAgent: 'Mozilla/5.0'
        },
        requestId: 'aws-req-12345'
      },
      headers: {
        'User-Agent': 'Chrome/100.0',
        'X-Forwarded-For': '10.0.0.1'
      },
      httpMethod: 'GET',
      path: '/expenses'
    };

    auditLogger.logRead({
      companyId: 'comp-456',
      userId: 'user-789',
      userRole: 'admin',
      request: event
    });

    const logCall = consoleSpy.mock.calls[0][0];
    const parsed = JSON.parse(logCall);

    expect(parsed.requestContext.ip).toBeDefined();
    expect(parsed.requestContext.method).toBe('GET');
    expect(parsed.requestContext.path).toBe('/expenses');
    expect(parsed.requestContext.requestId).toBe('aws-req-12345');
  });
});
