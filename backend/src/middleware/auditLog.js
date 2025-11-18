/**
 * Audit Logging Middleware
 * Logs all API requests for security and compliance purposes
 */

const config = require('../config/config');

/**
 * Request logger middleware
 * Logs all incoming requests with user info, timestamps, and request details
 */
const requestLogger = (req, res, next) => {
  const startTime = Date.now();

  // Capture original res.json to log response
  const originalJson = res.json;
  let responseBody;

  res.json = function(data) {
    responseBody = data;
    return originalJson.call(this, data);
  };

  // Log after response is sent
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const log = {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent'),
      user: req.user ? {
        id: req.user.id,
        email: req.user.email,
        role: req.user.role
      } : null
    };

    // Log level based on status code
    if (res.statusCode >= 500) {
      console.error('❌ SERVER ERROR:', JSON.stringify(log, null, 2));
    } else if (res.statusCode >= 400) {
      console.warn('⚠️  CLIENT ERROR:', JSON.stringify(log, null, 2));
    } else if (config.nodeEnv === 'development') {
      console.log('✅ REQUEST:', JSON.stringify(log, null, 2));
    }

    // TODO: In production, send to centralized logging service (e.g., ELK, CloudWatch, etc.)
    // Example: logstash.send(log);
  });

  next();
};

/**
 * Audit sensitive operations
 * Use this middleware for operations that require audit trail (CRUD on sensitive data)
 */
const auditSensitiveOperation = (action) => {
  return (req, res, next) => {
    const audit = {
      timestamp: new Date().toISOString(),
      action: action,
      user: req.user ? {
        id: req.user.id,
        email: req.user.email,
        role: req.user.role
      } : null,
      ip: req.ip || req.connection.remoteAddress,
      path: req.path,
      method: req.method,
      params: req.params,
      query: req.query,
      // Don't log sensitive data like passwords
      body: sanitizeBody(req.body)
    };

    console.log('🔒 AUDIT:', JSON.stringify(audit, null, 2));

    // TODO: Store audit logs in database for compliance
    // Example: AuditLog.create(audit);

    next();
  };
};

/**
 * Remove sensitive fields from body before logging
 */
const sanitizeBody = (body) => {
  if (!body) return body;

  const sanitized = { ...body };
  const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'creditCard', 'ssn'];

  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  });

  return sanitized;
};

/**
 * Security event logger
 * Log security-related events (failed logins, unauthorized access, etc.)
 */
const logSecurityEvent = (event, details, req) => {
  const log = {
    timestamp: new Date().toISOString(),
    event: event,
    severity: getSeverity(event),
    details: details,
    ip: req ? (req.ip || req.connection.remoteAddress) : null,
    userAgent: req ? req.get('user-agent') : null,
    user: req && req.user ? {
      id: req.user.id,
      email: req.user.email
    } : null
  };

  if (log.severity === 'high' || log.severity === 'critical') {
    console.error('🚨 SECURITY EVENT:', JSON.stringify(log, null, 2));
    // TODO: Send alert to security team
    // Example: securityAlert.send(log);
  } else {
    console.warn('⚠️  SECURITY EVENT:', JSON.stringify(log, null, 2));
  }

  // TODO: Store in security events database
  // Example: SecurityEvent.create(log);
};

/**
 * Determine severity level of security event
 */
const getSeverity = (event) => {
  const severityMap = {
    'failed_login': 'medium',
    'multiple_failed_logins': 'high',
    'account_locked': 'high',
    'unauthorized_access': 'high',
    'permission_denied': 'medium',
    'invalid_token': 'medium',
    'token_expired': 'low',
    'suspicious_activity': 'high',
    'brute_force_attempt': 'critical',
    'sql_injection_attempt': 'critical',
    'xss_attempt': 'critical'
  };

  return severityMap[event] || 'medium';
};

module.exports = {
  requestLogger,
  auditSensitiveOperation,
  logSecurityEvent
};
