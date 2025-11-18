const express = require('express');
const router = express.Router();
const config = require('../config/config');
const { SecureChannel, SecureMessage, ChannelMember, User } = require('../models');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { auditSensitiveOperation } = require('../middleware/auditLog');
const SecureMeshService = require('../services/secureMeshService');

// ============================================================================
// CHANNEL ROUTES
// ============================================================================

/**
 * @route   GET /api/securemesh/channels
 * @desc    Search and list channels
 * @access  Private (All authenticated users)
 */
router.get('/channels',
  authMiddleware,
  async (req, res) => {
    try {
      const {
        query,
        channelType,
        category,
        securityLevel,
        status,
        myChannels,
        page = 1,
        limit = 50
      } = req.query;

      const offset = (page - 1) * limit;

      const filters = {
        query,
        channelType,
        category,
        securityLevel,
        status,
        myChannels: myChannels === 'true',
        limit: parseInt(limit),
        offset: parseInt(offset)
      };

      const channels = await SecureMeshService.searchChannels(req.user.id, filters);

      res.json({
        success: true,
        channels,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit)
        }
      });
    } catch (error) {
      console.error('Get channels error:', error);

      res.status(500).json({
        error: 'Failed to fetch channels',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   GET /api/securemesh/channels/:id
 * @desc    Get channel with messages and members
 * @access  Private (Channel members only)
 */
router.get('/channels/:id',
  authMiddleware,
  async (req, res) => {
    try {
      const { messageLimit = 50, includeMembers = true } = req.query;

      const channel = await SecureMeshService.getChannelWithDetails(
        req.params.id,
        req.user.id,
        {
          messageLimit: parseInt(messageLimit),
          includeMembers: includeMembers !== 'false'
        }
      );

      res.json({
        success: true,
        channel
      });
    } catch (error) {
      console.error('Get channel error:', error);

      res.status(error.message.includes('Not a member') ? 403 : 500).json({
        error: 'Failed to fetch channel',
        message: error.message
      });
    }
  }
);

/**
 * @route   POST /api/securemesh/channels
 * @desc    Create new secure channel
 * @access  Private (Staff/Admin for official channels)
 */
router.post('/channels',
  authMiddleware,
  async (req, res) => {
    try {
      const channelData = req.body;

      // Only staff/admin can create certain channel types
      const restrictedTypes = ['broadcast', 'emergency', 'inter_municipal'];
      if (restrictedTypes.includes(channelData.channelType)) {
        if (req.user.role !== 'staff' && req.user.role !== 'admin') {
          return res.status(403).json({
            error: 'Not authorized to create this channel type'
          });
        }
      }

      const channel = await SecureMeshService.createChannel(channelData, req.user.id);

      res.status(201).json({
        success: true,
        message: 'Channel created successfully',
        channel
      });
    } catch (error) {
      console.error('Create channel error:', error);

      res.status(500).json({
        error: 'Failed to create channel',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   PUT /api/securemesh/channels/:id
 * @desc    Update channel settings
 * @access  Private (Channel owner/admin only)
 */
router.put('/channels/:id',
  authMiddleware,
  async (req, res) => {
    try {
      // Verify user is owner or admin
      const membership = await ChannelMember.findOne({
        where: {
          channelId: req.params.id,
          userId: req.user.id,
          status: 'active',
          role: ['owner', 'admin']
        }
      });

      if (!membership) {
        return res.status(403).json({
          error: 'Not authorized to update this channel'
        });
      }

      const channel = await SecureChannel.findByPk(req.params.id);
      if (!channel) {
        return res.status(404).json({
          error: 'Channel not found'
        });
      }

      await channel.update({
        ...req.body,
        updatedBy: req.user.id
      });

      res.json({
        success: true,
        message: 'Channel updated successfully',
        channel
      });
    } catch (error) {
      console.error('Update channel error:', error);

      res.status(500).json({
        error: 'Failed to update channel',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   DELETE /api/securemesh/channels/:id
 * @desc    Archive channel
 * @access  Private (Channel owner only)
 */
router.delete('/channels/:id',
  authMiddleware,
  auditSensitiveOperation('ARCHIVE_CHANNEL'),
  async (req, res) => {
    try {
      // Verify user is owner
      const membership = await ChannelMember.findOne({
        where: {
          channelId: req.params.id,
          userId: req.user.id,
          status: 'active',
          role: 'owner'
        }
      });

      if (!membership) {
        return res.status(403).json({
          error: 'Only channel owner can archive channel'
        });
      }

      const channel = await SecureChannel.findByPk(req.params.id);
      await channel.update({
        status: 'archived',
        isArchived: true,
        archivedBy: req.user.id,
        archivedAt: new Date()
      });

      console.log(`✅ Channel archived: ${channel.id} - ${channel.name}`);

      res.json({
        success: true,
        message: 'Channel archived successfully'
      });
    } catch (error) {
      console.error('Archive channel error:', error);

      res.status(500).json({
        error: 'Failed to archive channel',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   GET /api/securemesh/channels/:id/stats
 * @desc    Get channel statistics
 * @access  Private (Channel members only)
 */
router.get('/channels/:id/stats',
  authMiddleware,
  async (req, res) => {
    try {
      const stats = await SecureMeshService.getChannelStats(req.params.id);

      res.json({
        success: true,
        stats
      });
    } catch (error) {
      console.error('Get channel stats error:', error);

      res.status(500).json({
        error: 'Failed to fetch channel statistics',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

// ============================================================================
// MESSAGE ROUTES
// ============================================================================

/**
 * @route   POST /api/securemesh/channels/:id/messages
 * @desc    Send message to channel
 * @access  Private (Channel members with post permission)
 */
router.post('/channels/:id/messages',
  authMiddleware,
  async (req, res) => {
    try {
      const message = await SecureMeshService.sendMessage(
        req.params.id,
        req.user.id,
        req.body
      );

      res.status(201).json({
        success: true,
        message
      });
    } catch (error) {
      console.error('Send message error:', error);

      res.status(error.message.includes('Not authorized') ? 403 : 500).json({
        error: 'Failed to send message',
        message: error.message
      });
    }
  }
);

/**
 * @route   GET /api/securemesh/messages/:id
 * @desc    Get single message
 * @access  Private (Channel members only)
 */
router.get('/messages/:id',
  authMiddleware,
  async (req, res) => {
    try {
      const message = await SecureMessage.findByPk(req.params.id, {
        include: [
          {
            model: User,
            as: 'sender',
            attributes: ['id', 'name', 'email']
          },
          {
            model: SecureChannel,
            as: 'channel'
          }
        ]
      });

      if (!message) {
        return res.status(404).json({
          error: 'Message not found'
        });
      }

      // Verify user is a channel member
      const membership = await ChannelMember.findOne({
        where: {
          channelId: message.channelId,
          userId: req.user.id,
          status: 'active'
        }
      });

      if (!membership) {
        return res.status(403).json({
          error: 'Not a member of this channel'
        });
      }

      res.json({
        success: true,
        message
      });
    } catch (error) {
      console.error('Get message error:', error);

      res.status(500).json({
        error: 'Failed to fetch message',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   PUT /api/securemesh/messages/:id
 * @desc    Edit message
 * @access  Private (Message sender only)
 */
router.put('/messages/:id',
  authMiddleware,
  async (req, res) => {
    try {
      const message = await SecureMessage.findByPk(req.params.id);

      if (!message) {
        return res.status(404).json({
          error: 'Message not found'
        });
      }

      // Only sender can edit
      if (message.senderId !== req.user.id) {
        return res.status(403).json({
          error: 'Not authorized to edit this message'
        });
      }

      // Store edit history
      const editHistory = message.editHistory || [];
      editHistory.push({
        editedAt: new Date(),
        contentHash: crypto.createHash('sha256').update(message.content).digest('hex')
      });

      await message.update({
        content: req.body.content,
        isEdited: true,
        editedAt: new Date(),
        editHistory
      });

      res.json({
        success: true,
        message: 'Message updated successfully',
        message: message
      });
    } catch (error) {
      console.error('Edit message error:', error);

      res.status(500).json({
        error: 'Failed to edit message',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   DELETE /api/securemesh/messages/:id
 * @desc    Delete message
 * @access  Private (Message sender or channel moderator)
 */
router.delete('/messages/:id',
  authMiddleware,
  async (req, res) => {
    try {
      const message = await SecureMessage.findByPk(req.params.id);

      if (!message) {
        return res.status(404).json({
          error: 'Message not found'
        });
      }

      // Check if user is sender or moderator
      const membership = await ChannelMember.findOne({
        where: {
          channelId: message.channelId,
          userId: req.user.id,
          status: 'active'
        }
      });

      const canDelete = message.senderId === req.user.id ||
                       ['owner', 'admin', 'moderator'].includes(membership?.role);

      if (!canDelete) {
        return res.status(403).json({
          error: 'Not authorized to delete this message'
        });
      }

      await message.update({
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: req.user.id
      });

      res.json({
        success: true,
        message: 'Message deleted successfully'
      });
    } catch (error) {
      console.error('Delete message error:', error);

      res.status(500).json({
        error: 'Failed to delete message',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   POST /api/securemesh/channels/:id/read
 * @desc    Mark messages as read
 * @access  Private (Channel members only)
 */
router.post('/channels/:id/read',
  authMiddleware,
  async (req, res) => {
    try {
      const { messageId } = req.body;

      const membership = await SecureMeshService.markAsRead(
        req.params.id,
        req.user.id,
        messageId
      );

      res.json({
        success: true,
        message: 'Messages marked as read',
        unreadCount: membership.unreadCount
      });
    } catch (error) {
      console.error('Mark as read error:', error);

      res.status(500).json({
        error: 'Failed to mark messages as read',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

// ============================================================================
// MEMBER ROUTES
// ============================================================================

/**
 * @route   POST /api/securemesh/channels/:id/members
 * @desc    Add member to channel
 * @access  Private (Channel members with invite permission)
 */
router.post('/channels/:id/members',
  authMiddleware,
  async (req, res) => {
    try {
      const { userId, role, permissions } = req.body;

      const membership = await SecureMeshService.addMember(
        req.params.id,
        userId,
        req.user.id,
        { role, ...permissions }
      );

      res.status(201).json({
        success: true,
        message: 'Member added successfully',
        membership
      });
    } catch (error) {
      console.error('Add member error:', error);

      res.status(error.message.includes('Not authorized') ? 403 : 500).json({
        error: 'Failed to add member',
        message: error.message
      });
    }
  }
);

/**
 * @route   DELETE /api/securemesh/channels/:channelId/members/:userId
 * @desc    Remove member from channel
 * @access  Private (Channel owner/admin only)
 */
router.delete('/channels/:channelId/members/:userId',
  authMiddleware,
  auditSensitiveOperation('REMOVE_CHANNEL_MEMBER'),
  async (req, res) => {
    try {
      const { reason } = req.body;

      await SecureMeshService.removeMember(
        req.params.channelId,
        req.params.userId,
        req.user.id,
        reason
      );

      res.json({
        success: true,
        message: 'Member removed successfully'
      });
    } catch (error) {
      console.error('Remove member error:', error);

      res.status(error.message.includes('Not authorized') ? 403 : 500).json({
        error: 'Failed to remove member',
        message: error.message
      });
    }
  }
);

/**
 * @route   PUT /api/securemesh/channels/:channelId/members/:userId
 * @desc    Update member role/permissions
 * @access  Private (Channel owner/admin only)
 */
router.put('/channels/:channelId/members/:userId',
  authMiddleware,
  async (req, res) => {
    try {
      // Verify user has permission
      const requesterMembership = await ChannelMember.findOne({
        where: {
          channelId: req.params.channelId,
          userId: req.user.id,
          status: 'active',
          role: ['owner', 'admin']
        }
      });

      if (!requesterMembership) {
        return res.status(403).json({
          error: 'Not authorized to update member permissions'
        });
      }

      const membership = await ChannelMember.findOne({
        where: {
          channelId: req.params.channelId,
          userId: req.params.userId,
          status: 'active'
        }
      });

      if (!membership) {
        return res.status(404).json({
          error: 'Member not found'
        });
      }

      await membership.update({
        ...req.body,
        updatedBy: req.user.id
      });

      res.json({
        success: true,
        message: 'Member updated successfully',
        membership
      });
    } catch (error) {
      console.error('Update member error:', error);

      res.status(500).json({
        error: 'Failed to update member',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

module.exports = router;
