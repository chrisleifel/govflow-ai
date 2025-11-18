const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config/config');
const User = require('../models/User');
const { validate } = require('../middleware/validator');
const { authMiddleware } = require('../middleware/auth');
const { logSecurityEvent, auditSensitiveOperation } = require('../middleware/auditLog');

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post('/register', validate.register, async (req, res) => {
  try {
    const { email, password, name, role } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(409).json({
        error: 'Registration failed',
        message: 'User with this email already exists'
      });
    }

    // Create user (password will be hashed automatically by the model)
    const user = await User.create({
      email,
      password,
      name,
      role: role || 'citizen' // Default to citizen if no role specified
    });

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role
      },
      config.jwt.secret,
      {
        expiresIn: config.jwt.expiry,
        algorithm: config.jwt.algorithm
      }
    );

    // Log successful registration
    console.log(`✅ New user registered: ${user.email} (${user.role})`);

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Registration error:', error);

    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({
        error: 'Registration failed',
        message: 'User with this email already exists'
      });
    }

    res.status(500).json({
      error: 'Registration failed',
      message: config.nodeEnv === 'development' ? error.message : 'An error occurred during registration'
    });
  }
});

/**
 * @route   POST /api/auth/login
 * @desc    Login user and return JWT token
 * @access  Public
 */
router.post('/login', validate.login, async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user by email
    const user = await User.findOne({ where: { email } });

    // Verify user exists and password is correct
    if (!user || !(await user.verifyPassword(password))) {
      logSecurityEvent('failed_login', { email }, req);

      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid email or password'
      });
    }

    // TODO: Check if account is locked (implement account lockout logic)

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role
      },
      config.jwt.secret,
      {
        expiresIn: config.jwt.expiry,
        algorithm: config.jwt.algorithm
      }
    );

    // Log successful login
    console.log(`✅ User logged in: ${user.email} (${user.role})`);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);

    res.status(500).json({
      error: 'Authentication failed',
      message: config.nodeEnv === 'development' ? error.message : 'An error occurred during login'
    });
  }
});

/**
 * @route   GET /api/auth/me
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: ['id', 'email', 'name', 'role', 'createdAt']
    });

    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);

    res.status(500).json({
      error: 'Failed to fetch user profile',
      message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
    });
  }
});

/**
 * @route   POST /api/auth/verify
 * @desc    Verify if token is valid
 * @access  Private
 */
router.post('/verify', authMiddleware, (req, res) => {
  // If middleware passes, token is valid
  res.json({
    success: true,
    valid: true,
    user: req.user
  });
});

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user (client-side only for now)
 * @access  Private
 */
router.post('/logout', authMiddleware, (req, res) => {
  // With JWT, logout is primarily client-side (delete token)
  // TODO: Implement token blacklist for more secure logout

  console.log(`✅ User logged out: ${req.user.email}`);

  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Request password reset (generates reset token)
 * @access  Public
 */
router.post('/forgot-password',
  auditSensitiveOperation('FORGOT_PASSWORD'),
  async (req, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({
          error: 'Email is required'
        });
      }

      const user = await User.findOne({ where: { email } });

      // Don't reveal if user exists or not for security
      if (!user) {
        return res.json({
          success: true,
          message: 'If an account with that email exists, a password reset link has been sent'
        });
      }

      // Generate reset token
      const resetToken = user.createPasswordResetToken();
      await user.save();

      // TODO: Send email with reset token
      // For now, we'll log it (in production, this should be sent via email)
      console.log(`🔑 Password reset token for ${user.email}: ${resetToken}`);
      console.log(`   Reset URL: ${config.frontendUrl || 'http://localhost:8080'}/reset-password?token=${resetToken}`);

      res.json({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent',
        // REMOVE THIS IN PRODUCTION - only for development/testing
        ...(config.nodeEnv === 'development' && { resetToken, resetUrl: `/reset-password?token=${resetToken}` })
      });
    } catch (error) {
      console.error('Forgot password error:', error);

      res.status(500).json({
        error: 'Failed to process request',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   POST /api/auth/reset-password
 * @desc    Reset password with token
 * @access  Public
 */
router.post('/reset-password',
  auditSensitiveOperation('RESET_PASSWORD'),
  async (req, res) => {
    try {
      const { token, newPassword } = req.body;

      if (!token || !newPassword) {
        return res.status(400).json({
          error: 'Token and new password are required'
        });
      }

      // Validate new password strength
      if (newPassword.length < 8) {
        return res.status(400).json({
          error: 'Weak password',
          message: 'Password must be at least 8 characters long'
        });
      }

      // Hash the token to find the user
      const hashedToken = crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');

      const user = await User.findOne({
        where: {
          resetPasswordToken: hashedToken
        }
      });

      if (!user) {
        return res.status(400).json({
          error: 'Invalid or expired token',
          message: 'Password reset token is invalid'
        });
      }

      // Verify token hasn't expired
      if (!user.verifyPasswordResetToken(token)) {
        return res.status(400).json({
          error: 'Invalid or expired token',
          message: 'Password reset token has expired'
        });
      }

      // Update password and clear reset token
      user.password = newPassword;
      user.resetPasswordToken = null;
      user.resetPasswordExpires = null;
      user.passwordChangedAt = new Date();
      await user.save();

      console.log(`✅ Password reset successful: ${user.email}`);

      res.json({
        success: true,
        message: 'Password has been reset successfully. You can now login with your new password.'
      });

      // TODO: Send confirmation email
      // TODO: Invalidate all existing tokens/sessions
    } catch (error) {
      console.error('Reset password error:', error);

      res.status(500).json({
        error: 'Failed to reset password',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

module.exports = router;
