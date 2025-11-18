const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { Op } = require('sequelize');
const config = require('../config/config');
const { User, Permit, Inspection, Document, Payment } = require('../models');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { upload, handleUploadError } = require('../middleware/upload');
const { uploadLimiter } = require('../middleware/rateLimiter');
const { auditSensitiveOperation } = require('../middleware/auditLog');

/**
 * @route   GET /api/users/profile
 * @desc    Get current user's profile
 * @access  Private
 */
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ['password'] }
    });

    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    // Get user statistics
    const stats = {};

    if (user.role === 'citizen') {
      stats.totalPermits = await Permit.count({
        where: { applicantEmail: user.email }
      });
      stats.activePermits = await Permit.count({
        where: {
          applicantEmail: user.email,
          status: ['submitted', 'under_review', 'approved']
        }
      });
    } else if (user.role === 'inspector') {
      stats.assignedInspections = await Inspection.count({
        where: { inspectorId: user.id }
      });
      stats.completedInspections = await Inspection.count({
        where: {
          inspectorId: user.id,
          status: 'completed'
        }
      });
    }

    res.json({
      success: true,
      user,
      statistics: stats
    });
  } catch (error) {
    console.error('Get profile error:', error);

    res.status(500).json({
      error: 'Failed to fetch profile',
      message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
    });
  }
});

/**
 * @route   PUT /api/users/profile
 * @desc    Update current user's profile
 * @access  Private
 */
router.put('/profile',
  authMiddleware,
  auditSensitiveOperation('UPDATE_PROFILE'),
  async (req, res) => {
    try {
      const { name, email, phone, address, bio, preferences } = req.body;

      const user = await User.findByPk(req.user.id);

      if (!user) {
        return res.status(404).json({
          error: 'User not found'
        });
      }

      // Check if email is being changed and if it's already taken
      if (email && email !== user.email) {
        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) {
          return res.status(400).json({
            error: 'Email already in use',
            message: 'This email is already registered to another account'
          });
        }
      }

      // Update allowed fields
      const updateData = {};
      if (name) updateData.name = name;
      if (email) updateData.email = email;
      if (phone !== undefined) updateData.phone = phone;
      if (address !== undefined) updateData.address = address;
      if (bio !== undefined) updateData.bio = bio;
      if (preferences !== undefined) {
        updateData.preferences = {
          ...user.preferences,
          ...preferences
        };
      }

      await user.update(updateData);

      console.log(`✅ Profile updated: ${user.email}`);

      res.json({
        success: true,
        message: 'Profile updated successfully',
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          phone: user.phone,
          address: user.address,
          bio: user.bio,
          role: user.role,
          profilePicture: user.profilePicture,
          preferences: user.preferences,
          updatedAt: user.updatedAt
        }
      });
    } catch (error) {
      console.error('Update profile error:', error);

      res.status(500).json({
        error: 'Failed to update profile',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   POST /api/users/change-password
 * @desc    Change current user's password
 * @access  Private
 */
router.post('/change-password',
  authMiddleware,
  auditSensitiveOperation('CHANGE_PASSWORD'),
  async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          error: 'Missing required fields',
          message: 'Current password and new password are required'
        });
      }

      // Validate new password strength
      if (newPassword.length < 8) {
        return res.status(400).json({
          error: 'Weak password',
          message: 'Password must be at least 8 characters long'
        });
      }

      const user = await User.findByPk(req.user.id);

      if (!user) {
        return res.status(404).json({
          error: 'User not found'
        });
      }

      // Verify current password
      const isValidPassword = await bcrypt.compare(currentPassword, user.password);
      if (!isValidPassword) {
        return res.status(401).json({
          error: 'Invalid password',
          message: 'Current password is incorrect'
        });
      }

      // Hash and update new password
      const hashedPassword = await bcrypt.hash(newPassword, config.security.bcryptRounds);
      await user.update({
        password: hashedPassword,
        passwordChangedAt: new Date()
      });

      console.log(`✅ Password changed: ${user.email}`);

      res.json({
        success: true,
        message: 'Password changed successfully'
      });
    } catch (error) {
      console.error('Change password error:', error);

      res.status(500).json({
        error: 'Failed to change password',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   POST /api/users/profile/picture
 * @desc    Upload profile picture
 * @access  Private
 */
router.post('/profile/picture',
  authMiddleware,
  uploadLimiter,
  upload.single('profilePicture'),
  handleUploadError,
  auditSensitiveOperation('UPDATE_PROFILE_PICTURE'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: 'No file uploaded',
          message: 'Please select an image file'
        });
      }

      const user = await User.findByPk(req.user.id);

      if (!user) {
        return res.status(404).json({
          error: 'User not found'
        });
      }

      // Update user's profile picture path
      await user.update({
        profilePicture: req.file.path
      });

      console.log(`✅ Profile picture updated: ${user.email}`);

      res.json({
        success: true,
        message: 'Profile picture uploaded successfully',
        profilePicture: user.profilePicture
      });
    } catch (error) {
      console.error('Upload profile picture error:', error);

      res.status(500).json({
        error: 'Failed to upload profile picture',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   GET /api/users
 * @desc    Get all users (admin/staff only)
 * @access  Private (Admin/Staff)
 */
router.get('/',
  authMiddleware,
  requireRole('admin', 'staff'),
  async (req, res) => {
    try {
      const { page = 1, limit = 10, role, search } = req.query;
      const offset = (page - 1) * limit;

      const where = {};

      // Filter by role if specified
      if (role) {
        where.role = role;
      }

      // Search by name or email
      if (search) {
        where[Op.or] = [
          { name: { [Op.iLike]: `%${search}%` } },
          { email: { [Op.iLike]: `%${search}%` } }
        ];
      }

      const { count, rows: users } = await User.findAndCountAll({
        where,
        attributes: { exclude: ['password'] },
        order: [['createdAt', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      res.json({
        success: true,
        users,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit)
        }
      });
    } catch (error) {
      console.error('Get users error:', error);

      res.status(500).json({
        error: 'Failed to fetch users',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   GET /api/users/:id
 * @desc    Get user by ID (admin/staff only)
 * @access  Private (Admin/Staff)
 */
router.get('/:id',
  authMiddleware,
  requireRole('admin', 'staff'),
  async (req, res) => {
    try {
      const user = await User.findByPk(req.params.id, {
        attributes: { exclude: ['password'] }
      });

      if (!user) {
        return res.status(404).json({
          error: 'User not found'
        });
      }

      // Get user activity counts
      const activity = {
        permits: await Permit.count({ where: { applicantEmail: user.email } }),
        inspections: user.role === 'inspector'
          ? await Inspection.count({ where: { inspectorId: user.id } })
          : 0,
        documents: await Document.count({ where: { uploadedBy: user.id } }),
        payments: await Payment.count({ where: { userId: user.id } })
      };

      res.json({
        success: true,
        user,
        activity
      });
    } catch (error) {
      console.error('Get user error:', error);

      res.status(500).json({
        error: 'Failed to fetch user',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   PUT /api/users/:id
 * @desc    Update user (admin only)
 * @access  Private (Admin)
 */
router.put('/:id',
  authMiddleware,
  requireRole('admin'),
  auditSensitiveOperation('UPDATE_USER'),
  async (req, res) => {
    try {
      const { name, email, phone, address, status } = req.body;

      const user = await User.findByPk(req.params.id);

      if (!user) {
        return res.status(404).json({
          error: 'User not found'
        });
      }

      // Check if email is being changed and if it's already taken
      if (email && email !== user.email) {
        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) {
          return res.status(400).json({
            error: 'Email already in use'
          });
        }
      }

      // Update user
      const updateData = {};
      if (name) updateData.name = name;
      if (email) updateData.email = email;
      if (phone !== undefined) updateData.phone = phone;
      if (address !== undefined) updateData.address = address;
      if (status) updateData.status = status;

      await user.update(updateData);

      console.log(`✅ User updated: ${user.email} by ${req.user.email}`);

      res.json({
        success: true,
        message: 'User updated successfully',
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          status: user.status
        }
      });
    } catch (error) {
      console.error('Update user error:', error);

      res.status(500).json({
        error: 'Failed to update user',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   PUT /api/users/:id/role
 * @desc    Update user role (admin only)
 * @access  Private (Admin)
 */
router.put('/:id/role',
  authMiddleware,
  requireRole('admin'),
  auditSensitiveOperation('UPDATE_USER_ROLE'),
  async (req, res) => {
    try {
      const { role } = req.body;

      if (!role) {
        return res.status(400).json({
          error: 'Role is required'
        });
      }

      const validRoles = ['citizen', 'staff', 'admin', 'inspector'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({
          error: 'Invalid role',
          message: `Role must be one of: ${validRoles.join(', ')}`
        });
      }

      const user = await User.findByPk(req.params.id);

      if (!user) {
        return res.status(404).json({
          error: 'User not found'
        });
      }

      // Prevent admin from changing their own role
      if (user.id === req.user.id) {
        return res.status(403).json({
          error: 'Cannot change your own role'
        });
      }

      await user.update({ role });

      console.log(`✅ User role updated: ${user.email} -> ${role} by ${req.user.email}`);

      res.json({
        success: true,
        message: 'User role updated successfully',
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role
        }
      });
    } catch (error) {
      console.error('Update user role error:', error);

      res.status(500).json({
        error: 'Failed to update user role',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   DELETE /api/users/:id
 * @desc    Deactivate user (admin only)
 * @access  Private (Admin)
 */
router.delete('/:id',
  authMiddleware,
  requireRole('admin'),
  auditSensitiveOperation('DEACTIVATE_USER'),
  async (req, res) => {
    try {
      const user = await User.findByPk(req.params.id);

      if (!user) {
        return res.status(404).json({
          error: 'User not found'
        });
      }

      // Prevent admin from deactivating themselves
      if (user.id === req.user.id) {
        return res.status(403).json({
          error: 'Cannot deactivate your own account'
        });
      }

      // Soft delete by updating status
      await user.update({ status: 'inactive' });

      console.log(`✅ User deactivated: ${user.email} by ${req.user.email}`);

      res.json({
        success: true,
        message: 'User deactivated successfully'
      });
    } catch (error) {
      console.error('Deactivate user error:', error);

      res.status(500).json({
        error: 'Failed to deactivate user',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

module.exports = router;
