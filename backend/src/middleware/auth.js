const jwt = require('jsonwebtoken');
const config = require('../config/config');
const User = require('../models/User');

/**
 * Authentication middleware - Verifies JWT token
 */
const authMiddleware = async (req, res, next) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'No token provided'
      });
    }

    const token = authHeader.split(' ')[1];

    // Verify token
    const decoded = jwt.verify(token, config.jwt.secret);

    // Optional: Fetch fresh user data from database
    // This ensures user still exists and hasn't been disabled
    const user = await User.findByPk(decoded.id, {
      attributes: ['id', 'email', 'name', 'role']
    });

    if (!user) {
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'User not found'
      });
    }

    // Attach user to request object
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid token'
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Token expired'
      });
    }

    console.error('Auth middleware error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Authentication error'
    });
  }
};

/**
 * Role-Based Access Control middleware
 * @param {...string} allowedRoles - Roles that are allowed to access the route
 * @returns {Function} Express middleware function
 *
 * @example
 * router.get('/admin', requireRole('admin'), adminController);
 * router.get('/staff', requireRole('admin', 'staff'), staffController);
 */
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please authenticate first'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Access denied',
        message: `This resource requires one of the following roles: ${allowedRoles.join(', ')}`,
        requiredRoles: allowedRoles,
        userRole: req.user.role
      });
    }

    next();
  };
};

/**
 * Optional authentication middleware
 * Attaches user if token is valid, but doesn't block the request
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, config.jwt.secret);

      const user = await User.findByPk(decoded.id, {
        attributes: ['id', 'email', 'name', 'role']
      });

      if (user) {
        req.user = {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role
        };
      }
    }
  } catch (error) {
    // Silently fail - this is optional auth
    console.log('Optional auth failed:', error.message);
  }

  next();
};

/**
 * Check if user owns the resource or is an admin
 * Expects req.params.userId to match the authenticated user
 */
const requireOwnerOrAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication required'
    });
  }

  const resourceUserId = req.params.userId || req.params.id;
  const isOwner = req.user.id === resourceUserId;
  const isAdmin = req.user.role === 'admin';

  if (!isOwner && !isAdmin) {
    return res.status(403).json({
      error: 'Access denied',
      message: 'You can only access your own resources'
    });
  }

  next();
};

module.exports = {
  authMiddleware,
  requireRole,
  optionalAuth,
  requireOwnerOrAdmin
};
