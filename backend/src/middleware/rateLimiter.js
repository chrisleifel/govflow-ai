const rateLimit = require('express-rate-limit');
const config = require('../config/config');

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: Math.ceil(config.rateLimit.windowMs / 1000 / 60) + ' minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks in development
    return config.nodeEnv === 'development' && req.path === '/health';
  }
});

// Stricter rate limiter for authentication routes
const authLimiter = rateLimit({
  windowMs: config.rateLimit.authWindowMs,
  max: config.rateLimit.authMaxRequests,
  message: {
    error: 'Too many authentication attempts, please try again later.',
    retryAfter: Math.ceil(config.rateLimit.authWindowMs / 1000 / 60) + ' minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true // Don't count successful logins
});

// File upload rate limiter
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 uploads per hour
  message: {
    error: 'Too many file uploads, please try again later.',
    retryAfter: '1 hour'
  }
});

module.exports = {
  apiLimiter,
  authLimiter,
  uploadLimiter
};
