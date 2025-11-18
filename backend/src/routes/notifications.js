const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const config = require('../config/config');
const { Notification, User } = require('../models');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { auditSensitiveOperation } = require('../middleware/auditLog');

/**
 * @route   GET /api/notifications
 * @desc    Get all notifications for current user
 * @access  Private
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20, unreadOnly = false, type, priority } = req.query;
    const offset = (page - 1) * limit;

    const where = { userId: req.user.id };

    // Filter by unread only
    if (unreadOnly === 'true') {
      where.read = false;
    }

    // Filter by type
    if (type) {
      where.type = type;
    }

    // Filter by priority
    if (priority) {
      where.priority = priority;
    }

    const { count, rows: notifications } = await Notification.findAndCountAll({
      where,
      order: [
        ['priority', 'DESC'], // Urgent first
        ['createdAt', 'DESC']
      ],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      notifications,
      pagination: {
        total: count,
        unread: await Notification.count({ where: { userId: req.user.id, read: false } }),
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Get notifications error:', error);

    res.status(500).json({
      error: 'Failed to fetch notifications',
      message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
    });
  }
});

/**
 * @route   GET /api/notifications/unread-count
 * @desc    Get count of unread notifications
 * @access  Private
 */
router.get('/unread-count', authMiddleware, async (req, res) => {
  try {
    const count = await Notification.count({
      where: {
        userId: req.user.id,
        read: false
      }
    });

    res.json({
      success: true,
      unreadCount: count
    });
  } catch (error) {
    console.error('Get unread count error:', error);

    res.status(500).json({
      error: 'Failed to fetch unread count',
      message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
    });
  }
});

/**
 * @route   GET /api/notifications/:id
 * @desc    Get single notification
 * @access  Private
 */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const notification = await Notification.findByPk(req.params.id);

    if (!notification) {
      return res.status(404).json({
        error: 'Notification not found'
      });
    }

    // Users can only view their own notifications
    if (notification.userId !== req.user.id) {
      return res.status(403).json({
        error: 'Access denied'
      });
    }

    res.json({
      success: true,
      notification
    });
  } catch (error) {
    console.error('Get notification error:', error);

    res.status(500).json({
      error: 'Failed to fetch notification',
      message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
    });
  }
});

/**
 * @route   PATCH /api/notifications/:id/read
 * @desc    Mark notification as read
 * @access  Private
 */
router.patch('/:id/read', authMiddleware, async (req, res) => {
  try {
    const notification = await Notification.findByPk(req.params.id);

    if (!notification) {
      return res.status(404).json({
        error: 'Notification not found'
      });
    }

    // Users can only mark their own notifications as read
    if (notification.userId !== req.user.id) {
      return res.status(403).json({
        error: 'Access denied'
      });
    }

    await notification.markAsRead();

    res.json({
      success: true,
      message: 'Notification marked as read',
      notification
    });
  } catch (error) {
    console.error('Mark notification as read error:', error);

    res.status(500).json({
      error: 'Failed to mark notification as read',
      message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
    });
  }
});

/**
 * @route   PATCH /api/notifications/mark-all-read
 * @desc    Mark all notifications as read
 * @access  Private
 */
router.patch('/mark-all-read', authMiddleware, async (req, res) => {
  try {
    const updated = await Notification.update(
      {
        read: true,
        readAt: new Date()
      },
      {
        where: {
          userId: req.user.id,
          read: false
        }
      }
    );

    console.log(`✅ Marked ${updated[0]} notifications as read for ${req.user.email}`);

    res.json({
      success: true,
      message: `Marked ${updated[0]} notifications as read`,
      count: updated[0]
    });
  } catch (error) {
    console.error('Mark all notifications as read error:', error);

    res.status(500).json({
      error: 'Failed to mark notifications as read',
      message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
    });
  }
});

/**
 * @route   DELETE /api/notifications/:id
 * @desc    Delete notification
 * @access  Private
 */
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const notification = await Notification.findByPk(req.params.id);

    if (!notification) {
      return res.status(404).json({
        error: 'Notification not found'
      });
    }

    // Users can only delete their own notifications
    if (notification.userId !== req.user.id) {
      return res.status(403).json({
        error: 'Access denied'
      });
    }

    await notification.destroy();

    res.json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    console.error('Delete notification error:', error);

    res.status(500).json({
      error: 'Failed to delete notification',
      message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
    });
  }
});

/**
 * @route   DELETE /api/notifications/clear-all
 * @desc    Delete all read notifications
 * @access  Private
 */
router.delete('/clear-all', authMiddleware, async (req, res) => {
  try {
    const deleted = await Notification.destroy({
      where: {
        userId: req.user.id,
        read: true
      }
    });

    console.log(`✅ Cleared ${deleted} read notifications for ${req.user.email}`);

    res.json({
      success: true,
      message: `Cleared ${deleted} read notifications`,
      count: deleted
    });
  } catch (error) {
    console.error('Clear notifications error:', error);

    res.status(500).json({
      error: 'Failed to clear notifications',
      message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
    });
  }
});

/**
 * @route   POST /api/notifications/send (Admin/Staff only)
 * @desc    Send notification to specific user(s)
 * @access  Private (Admin/Staff)
 */
router.post('/send',
  authMiddleware,
  requireRole('admin', 'staff'),
  auditSensitiveOperation('SEND_NOTIFICATION'),
  async (req, res) => {
    try {
      const {
        userId,
        userIds,
        type,
        title,
        message,
        priority = 'medium',
        channel = 'in_app',
        relatedEntity,
        relatedEntityId
      } = req.body;

      if (!title || !message) {
        return res.status(400).json({
          error: 'Title and message are required'
        });
      }

      const targetUserIds = userIds || (userId ? [userId] : []);

      if (targetUserIds.length === 0) {
        return res.status(400).json({
          error: 'At least one user ID is required'
        });
      }

      // Create notifications for each user
      const notifications = await Promise.all(
        targetUserIds.map(uid =>
          Notification.create({
            userId: uid,
            type: type || 'general',
            title,
            message,
            priority,
            channel,
            relatedEntity,
            relatedEntityId,
            metadata: {
              sentBy: req.user.email,
              sentAt: new Date()
            }
          })
        )
      );

      console.log(`✅ Sent ${notifications.length} notification(s) by ${req.user.email}`);

      res.status(201).json({
        success: true,
        message: `Sent ${notifications.length} notification(s)`,
        notifications
      });

      // TODO: Send via email/SMS/push if channel is specified
    } catch (error) {
      console.error('Send notification error:', error);

      res.status(500).json({
        error: 'Failed to send notification',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   POST /api/notifications/broadcast (Admin only)
 * @desc    Broadcast notification to all users or specific role
 * @access  Private (Admin)
 */
router.post('/broadcast',
  authMiddleware,
  requireRole('admin'),
  auditSensitiveOperation('BROADCAST_NOTIFICATION'),
  async (req, res) => {
    try {
      const {
        role,
        type,
        title,
        message,
        priority = 'medium',
        channel = 'in_app'
      } = req.body;

      if (!title || !message) {
        return res.status(400).json({
          error: 'Title and message are required'
        });
      }

      // Get all users (optionally filtered by role)
      const where = role ? { role } : {};
      const users = await User.findAll({
        where,
        attributes: ['id']
      });

      if (users.length === 0) {
        return res.status(404).json({
          error: 'No users found to broadcast to'
        });
      }

      // Create notifications for all users
      const notifications = await Promise.all(
        users.map(user =>
          Notification.create({
            userId: user.id,
            type: type || 'announcement',
            title,
            message,
            priority,
            channel,
            metadata: {
              broadcast: true,
              sentBy: req.user.email,
              sentAt: new Date(),
              targetRole: role || 'all'
            }
          })
        )
      );

      console.log(`✅ Broadcast ${notifications.length} notification(s) by ${req.user.email}`);

      res.status(201).json({
        success: true,
        message: `Broadcast notification to ${notifications.length} users`,
        count: notifications.length
      });

      // TODO: Send via email/SMS/push if channel is specified
    } catch (error) {
      console.error('Broadcast notification error:', error);

      res.status(500).json({
        error: 'Failed to broadcast notification',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

module.exports = router;
