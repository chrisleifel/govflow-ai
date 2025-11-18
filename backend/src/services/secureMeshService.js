const { SecureChannel, SecureMessage, ChannelMember, User } = require('../models');
const { Op } = require('sequelize');
const crypto = require('crypto');

/**
 * SecureMesh Service
 * Secure communications platform for government entities
 */
class SecureMeshService {
  /**
   * Encryption algorithm and configuration
   */
  static ENCRYPTION_ALGORITHM = 'aes-256-gcm';
  static ENCRYPTION_KEY_LENGTH = 32;
  static IV_LENGTH = 16;
  static AUTH_TAG_LENGTH = 16;

  /**
   * Generate encryption key for channel
   * @returns {string} Base64 encoded encryption key
   */
  static generateEncryptionKey() {
    return crypto.randomBytes(this.ENCRYPTION_KEY_LENGTH).toString('base64');
  }

  /**
   * Encrypt message content
   * @param {string} plaintext - Message content to encrypt
   * @param {string} encryptionKey - Base64 encoded encryption key
   * @returns {Object} Encrypted content with IV and authTag
   */
  static encryptContent(plaintext, encryptionKey) {
    try {
      const key = Buffer.from(encryptionKey, 'base64');
      const iv = crypto.randomBytes(this.IV_LENGTH);
      const cipher = crypto.createCipheriv(this.ENCRYPTION_ALGORITHM, key, iv);

      let encrypted = cipher.update(plaintext, 'utf8', 'base64');
      encrypted += cipher.final('base64');

      const authTag = cipher.getAuthTag();

      return {
        encrypted,
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64')
      };
    } catch (error) {
      console.error('Encryption error:', error);
      throw new Error('Failed to encrypt content');
    }
  }

  /**
   * Decrypt message content
   * @param {string} encrypted - Encrypted content
   * @param {string} iv - Initialization vector (base64)
   * @param {string} authTag - Authentication tag (base64)
   * @param {string} encryptionKey - Base64 encoded encryption key
   * @returns {string} Decrypted plaintext
   */
  static decryptContent(encrypted, iv, authTag, encryptionKey) {
    try {
      const key = Buffer.from(encryptionKey, 'base64');
      const decipher = crypto.createDecipheriv(
        this.ENCRYPTION_ALGORITHM,
        key,
        Buffer.from(iv, 'base64')
      );

      decipher.setAuthTag(Buffer.from(authTag, 'base64'));

      let decrypted = decipher.update(encrypted, 'base64', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      console.error('Decryption error:', error);
      throw new Error('Failed to decrypt content');
    }
  }

  /**
   * Create new secure channel
   * @param {Object} channelData - Channel data
   * @param {string} userId - User creating the channel
   * @returns {Promise<Object>} Created channel
   */
  static async createChannel(channelData, userId) {
    try {
      // Generate encryption key if encryption is enabled
      let encryptionKey = null;
      if (channelData.encryptionEnabled !== false) {
        encryptionKey = this.generateEncryptionKey();
      }

      const channel = await SecureChannel.create({
        ...channelData,
        encryptionKey,
        createdBy: userId,
        ownerId: userId,
        memberCount: 1,
        lastActivityAt: new Date()
      });

      // Add creator as owner
      await ChannelMember.create({
        channelId: channel.id,
        userId,
        role: 'owner',
        status: 'active',
        canPost: true,
        canUploadFiles: true,
        canInviteMembers: true,
        canPinMessages: true,
        createdBy: userId
      });

      console.log(`✅ Secure channel created: ${channel.id} - ${channel.name}`);
      return channel;
    } catch (error) {
      console.error('Create channel error:', error);
      throw error;
    }
  }

  /**
   * Get channel with members and recent messages
   * @param {string} channelId - Channel ID
   * @param {string} userId - User requesting channel
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Channel with messages and members
   */
  static async getChannelWithDetails(channelId, userId, options = {}) {
    try {
      const { messageLimit = 50, includeMembers = true } = options;

      // Check if user is a member
      const membership = await ChannelMember.findOne({
        where: {
          channelId,
          userId,
          status: 'active'
        }
      });

      if (!membership) {
        throw new Error('Not a member of this channel');
      }

      const includeOptions = [
        {
          model: User,
          as: 'owner',
          attributes: ['id', 'name', 'email']
        },
        {
          model: SecureMessage,
          as: 'messages',
          limit: messageLimit,
          order: [['createdAt', 'DESC']],
          include: [
            {
              model: User,
              as: 'sender',
              attributes: ['id', 'name', 'email']
            }
          ]
        }
      ];

      if (includeMembers) {
        includeOptions.push({
          model: ChannelMember,
          as: 'members',
          where: { status: 'active' },
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['id', 'name', 'email', 'role']
            }
          ]
        });
      }

      const channel = await SecureChannel.findByPk(channelId, {
        include: includeOptions
      });

      if (!channel) {
        throw new Error('Channel not found');
      }

      // Decrypt messages if encryption is enabled
      if (channel.encryptionEnabled && channel.encryptionKey) {
        channel.messages = channel.messages.map(msg => {
          try {
            if (msg.isEncrypted && msg.metadata.iv && msg.metadata.authTag) {
              const decrypted = this.decryptContent(
                msg.content,
                msg.metadata.iv,
                msg.metadata.authTag,
                channel.encryptionKey
              );
              return { ...msg.toJSON(), contentPlain: decrypted };
            }
          } catch (error) {
            console.error(`Failed to decrypt message ${msg.id}:`, error);
          }
          return msg;
        });
      }

      return channel;
    } catch (error) {
      console.error('Get channel with details error:', error);
      throw error;
    }
  }

  /**
   * Send message to channel
   * @param {string} channelId - Channel ID
   * @param {string} userId - User sending message
   * @param {Object} messageData - Message data
   * @returns {Promise<Object>} Created message
   */
  static async sendMessage(channelId, userId, messageData) {
    try {
      // Verify user is a member with posting permissions
      const membership = await ChannelMember.findOne({
        where: {
          channelId,
          userId,
          status: 'active',
          canPost: true
        }
      });

      if (!membership) {
        throw new Error('Not authorized to post in this channel');
      }

      // Get channel for encryption key
      const channel = await SecureChannel.findByPk(channelId);
      if (!channel || channel.status !== 'active') {
        throw new Error('Channel is not available');
      }

      // Prepare message content
      let content = messageData.content;
      let isEncrypted = false;
      let metadata = messageData.metadata || {};

      // Encrypt if channel has encryption enabled
      if (channel.encryptionEnabled && channel.encryptionKey) {
        const encrypted = this.encryptContent(content, channel.encryptionKey);
        content = encrypted.encrypted;
        isEncrypted = true;
        metadata = {
          ...metadata,
          iv: encrypted.iv,
          authTag: encrypted.authTag
        };
      }

      // Create message
      const message = await SecureMessage.create({
        channelId,
        senderId: userId,
        content,
        isEncrypted,
        messageType: messageData.messageType || 'text',
        priority: messageData.priority || 'normal',
        isUrgent: messageData.isUrgent || false,
        requiresAcknowledgment: messageData.requiresAcknowledgment || false,
        parentMessageId: messageData.parentMessageId,
        threadId: messageData.threadId,
        mentions: messageData.mentions || [],
        references: messageData.references || {},
        attachments: messageData.attachments || [],
        hasAttachments: messageData.attachments && messageData.attachments.length > 0,
        attachmentCount: messageData.attachments ? messageData.attachments.length : 0,
        securityLevel: messageData.securityLevel || channel.securityLevel,
        incidentId: messageData.incidentId,
        tags: messageData.tags || [],
        metadata,
        status: 'sent'
      });

      // Update channel
      await channel.update({
        lastActivityAt: new Date(),
        messageCount: channel.messageCount + 1
      });

      // Update member activity
      await membership.update({
        lastPostedAt: new Date(),
        messageCount: membership.messageCount + 1
      });

      // Update unread counts for other members
      await this.updateUnreadCounts(channelId, userId, message.id);

      // Handle mentions
      if (messageData.mentions && messageData.mentions.length > 0) {
        await this.handleMentions(message, messageData.mentions);
      }

      console.log(`✅ Message sent: ${message.id} in channel ${channelId}`);
      return message;
    } catch (error) {
      console.error('Send message error:', error);
      throw error;
    }
  }

  /**
   * Update unread counts for channel members
   * @param {string} channelId - Channel ID
   * @param {string} senderId - User who sent the message
   * @param {string} messageId - Message ID
   */
  static async updateUnreadCounts(channelId, senderId, messageId) {
    try {
      const members = await ChannelMember.findAll({
        where: {
          channelId,
          userId: { [Op.ne]: senderId },
          status: 'active'
        }
      });

      for (const member of members) {
        await member.update({
          unreadCount: member.unreadCount + 1
        });
      }
    } catch (error) {
      console.error('Update unread counts error:', error);
      // Don't throw - this is a non-critical operation
    }
  }

  /**
   * Handle message mentions
   * @param {Object} message - Message object
   * @param {Array} mentions - Array of user IDs mentioned
   */
  static async handleMentions(message, mentions) {
    try {
      // TODO: Create notifications for mentioned users
      console.log(`Handling mentions for message ${message.id}:`, mentions);
    } catch (error) {
      console.error('Handle mentions error:', error);
      // Don't throw - this is a non-critical operation
    }
  }

  /**
   * Mark messages as read
   * @param {string} channelId - Channel ID
   * @param {string} userId - User ID
   * @param {string} messageId - Last read message ID
   * @returns {Promise<Object>} Updated membership
   */
  static async markAsRead(channelId, userId, messageId) {
    try {
      const membership = await ChannelMember.findOne({
        where: { channelId, userId, status: 'active' }
      });

      if (!membership) {
        throw new Error('Not a member of this channel');
      }

      await membership.update({
        lastReadAt: new Date(),
        lastReadMessageId: messageId,
        unreadCount: 0
      });

      return membership;
    } catch (error) {
      console.error('Mark as read error:', error);
      throw error;
    }
  }

  /**
   * Add member to channel
   * @param {string} channelId - Channel ID
   * @param {string} userId - User to add
   * @param {string} invitedBy - User inviting the member
   * @param {Object} memberData - Member settings
   * @returns {Promise<Object>} Created membership
   */
  static async addMember(channelId, userId, invitedBy, memberData = {}) {
    try {
      // Verify inviter has permission
      const inviterMembership = await ChannelMember.findOne({
        where: {
          channelId,
          userId: invitedBy,
          status: 'active',
          canInviteMembers: true
        }
      });

      if (!inviterMembership) {
        throw new Error('Not authorized to invite members');
      }

      // Check if user is already a member
      const existingMembership = await ChannelMember.findOne({
        where: { channelId, userId }
      });

      if (existingMembership && existingMembership.status === 'active') {
        throw new Error('User is already a member');
      }

      // Create or update membership
      let membership;
      if (existingMembership) {
        membership = await existingMembership.update({
          status: 'active',
          role: memberData.role || 'member',
          invitedBy,
          joinedAt: new Date()
        });
      } else {
        membership = await ChannelMember.create({
          channelId,
          userId,
          role: memberData.role || 'member',
          status: 'active',
          invitedBy,
          canPost: memberData.canPost !== false,
          canUploadFiles: memberData.canUploadFiles !== false,
          canInviteMembers: memberData.canInviteMembers || false,
          canPinMessages: memberData.canPinMessages || false,
          createdBy: invitedBy
        });
      }

      // Update channel member count
      const channel = await SecureChannel.findByPk(channelId);
      await channel.update({
        memberCount: channel.memberCount + 1
      });

      console.log(`✅ Member added to channel: ${userId} -> ${channelId}`);
      return membership;
    } catch (error) {
      console.error('Add member error:', error);
      throw error;
    }
  }

  /**
   * Remove member from channel
   * @param {string} channelId - Channel ID
   * @param {string} userId - User to remove
   * @param {string} removedBy - User removing the member
   * @param {string} reason - Reason for removal
   * @returns {Promise<Object>} Updated membership
   */
  static async removeMember(channelId, userId, removedBy, reason = null) {
    try {
      // Verify remover has permission (admin or owner)
      const removerMembership = await ChannelMember.findOne({
        where: {
          channelId,
          userId: removedBy,
          status: 'active',
          role: { [Op.in]: ['owner', 'admin'] }
        }
      });

      if (!removerMembership) {
        throw new Error('Not authorized to remove members');
      }

      const membership = await ChannelMember.findOne({
        where: { channelId, userId, status: 'active' }
      });

      if (!membership) {
        throw new Error('Member not found');
      }

      // Can't remove the channel owner
      if (membership.role === 'owner') {
        throw new Error('Cannot remove channel owner');
      }

      await membership.update({
        status: 'removed',
        removedAt: new Date(),
        removedBy,
        removeReason: reason,
        isActive: false
      });

      // Update channel member count
      const channel = await SecureChannel.findByPk(channelId);
      await channel.update({
        memberCount: Math.max(channel.memberCount - 1, 0)
      });

      console.log(`✅ Member removed from channel: ${userId} <- ${channelId}`);
      return membership;
    } catch (error) {
      console.error('Remove member error:', error);
      throw error;
    }
  }

  /**
   * Search channels
   * @param {string} userId - User searching
   * @param {Object} filters - Search filters
   * @returns {Promise<Array>} Matching channels
   */
  static async searchChannels(userId, filters = {}) {
    try {
      const {
        query,
        channelType,
        category,
        securityLevel,
        status = 'active',
        myChannels = false,
        limit = 50,
        offset = 0
      } = filters;

      const where = { status };

      // Text search
      if (query) {
        where[Op.or] = [
          { name: { [Op.iLike]: `%${query}%` } },
          { description: { [Op.iLike]: `%${query}%` } }
        ];
      }

      // Filter by type
      if (channelType) {
        where.channelType = channelType;
      }

      // Filter by category
      if (category) {
        where.category = category;
      }

      // Filter by security level
      if (securityLevel) {
        where.securityLevel = securityLevel;
      }

      const includeOptions = [
        {
          model: User,
          as: 'owner',
          attributes: ['id', 'name', 'email']
        }
      ];

      // Filter by user's channels
      if (myChannels) {
        includeOptions.push({
          model: ChannelMember,
          as: 'members',
          where: { userId, status: 'active' },
          required: true
        });
      }

      const channels = await SecureChannel.findAll({
        where,
        include: includeOptions,
        order: [['lastActivityAt', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      return channels;
    } catch (error) {
      console.error('Search channels error:', error);
      throw error;
    }
  }

  /**
   * Get channel statistics
   * @param {string} channelId - Channel ID
   * @returns {Promise<Object>} Statistics
   */
  static async getChannelStats(channelId) {
    try {
      const channel = await SecureChannel.findByPk(channelId);
      if (!channel) {
        throw new Error('Channel not found');
      }

      const totalMessages = await SecureMessage.count({
        where: { channelId, isDeleted: false }
      });

      const activeMembers = await ChannelMember.count({
        where: { channelId, status: 'active' }
      });

      const messagesByType = await SecureMessage.findAll({
        where: { channelId, isDeleted: false },
        attributes: [
          'messageType',
          [SecureMessage.sequelize.fn('COUNT', SecureMessage.sequelize.col('id')), 'count']
        ],
        group: ['messageType'],
        raw: true
      });

      const membersByRole = await ChannelMember.findAll({
        where: { channelId, status: 'active' },
        attributes: [
          'role',
          [ChannelMember.sequelize.fn('COUNT', ChannelMember.sequelize.col('id')), 'count']
        ],
        group: ['role'],
        raw: true
      });

      return {
        channel: {
          id: channel.id,
          name: channel.name,
          type: channel.channelType,
          status: channel.status
        },
        messages: {
          total: totalMessages,
          byType: messagesByType.reduce((acc, item) => {
            acc[item.messageType] = parseInt(item.count);
            return acc;
          }, {})
        },
        members: {
          total: activeMembers,
          byRole: membersByRole.reduce((acc, item) => {
            acc[item.role] = parseInt(item.count);
            return acc;
          }, {})
        },
        activity: {
          lastActivity: channel.lastActivityAt
        }
      };
    } catch (error) {
      console.error('Get channel stats error:', error);
      throw error;
    }
  }
}

module.exports = SecureMeshService;
