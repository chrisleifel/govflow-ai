const { Notification, User, Permit } = require('../models');

/**
 * Notification Service
 * Centralized service for creating and sending notifications
 */
class NotificationService {
  /**
   * Create a notification
   * @param {Object} options - Notification options
   * @returns {Promise<Notification>}
   */
  static async create({
    userId,
    type,
    title,
    message,
    priority = 'medium',
    channel = 'in_app',
    relatedEntity = null,
    relatedEntityId = null,
    metadata = {}
  }) {
    try {
      const notification = await Notification.create({
        userId,
        type,
        title,
        message,
        priority,
        channel,
        relatedEntity,
        relatedEntityId,
        metadata
      });

      console.log(`📬 Notification created: ${type} for user ${userId}`);

      // TODO: Send via email/SMS/push based on channel and user preferences
      if (channel === 'email' || channel === 'all') {
        await this.sendEmail(notification);
      }

      return notification;
    } catch (error) {
      console.error('Failed to create notification:', error);
      throw error;
    }
  }

  /**
   * Notify user about permit status change
   */
  static async notifyPermitStatusChange(permit, oldStatus, newStatus) {
    try {
      // Find the applicant user
      const user = await User.findOne({ where: { email: permit.applicantEmail } });

      if (!user) {
        console.warn(`User not found for permit ${permit.permitNumber}`);
        return null;
      }

      const statusMessages = {
        submitted: 'Your permit application has been submitted successfully',
        under_review: 'Your permit application is now under review',
        approved: 'Congratulations! Your permit has been approved',
        rejected: 'Your permit application has been rejected',
        expired: 'Your permit has expired',
        revoked: 'Your permit has been revoked'
      };

      const priorityMap = {
        approved: 'high',
        rejected: 'high',
        revoked: 'urgent',
        expired: 'high'
      };

      return await this.create({
        userId: user.id,
        type: 'permit_status',
        title: `Permit ${permit.permitNumber} - Status Update`,
        message: statusMessages[newStatus] || `Permit status changed to ${newStatus}`,
        priority: priorityMap[newStatus] || 'medium',
        channel: 'in_app',
        relatedEntity: 'permit',
        relatedEntityId: permit.id,
        metadata: {
          permitNumber: permit.permitNumber,
          oldStatus,
          newStatus,
          permitType: permit.type
        }
      });
    } catch (error) {
      console.error('Failed to notify permit status change:', error);
      return null;
    }
  }

  /**
   * Notify user about new inspection scheduled
   */
  static async notifyInspectionScheduled(inspection, permit) {
    try {
      const user = await User.findOne({ where: { email: permit.applicantEmail } });

      if (!user) {
        console.warn(`User not found for permit ${permit.permitNumber}`);
        return null;
      }

      const scheduledDate = new Date(inspection.scheduledDate).toLocaleDateString();

      return await this.create({
        userId: user.id,
        type: 'inspection_scheduled',
        title: 'Inspection Scheduled',
        message: `An inspection has been scheduled for your permit ${permit.permitNumber} on ${scheduledDate}`,
        priority: 'high',
        channel: 'in_app',
        relatedEntity: 'inspection',
        relatedEntityId: inspection.id,
        metadata: {
          permitNumber: permit.permitNumber,
          inspectionType: inspection.type,
          scheduledDate: inspection.scheduledDate
        }
      });
    } catch (error) {
      console.error('Failed to notify inspection scheduled:', error);
      return null;
    }
  }

  /**
   * Notify inspector about inspection assignment
   */
  static async notifyInspectorAssigned(inspection, permit, inspector) {
    try {
      const scheduledDate = new Date(inspection.scheduledDate).toLocaleDateString();

      return await this.create({
        userId: inspector.id,
        type: 'inspection_assigned',
        title: 'New Inspection Assignment',
        message: `You have been assigned to inspect ${permit.permitNumber} on ${scheduledDate}`,
        priority: 'high',
        channel: 'in_app',
        relatedEntity: 'inspection',
        relatedEntityId: inspection.id,
        metadata: {
          permitNumber: permit.permitNumber,
          inspectionType: inspection.type,
          scheduledDate: inspection.scheduledDate,
          propertyAddress: permit.propertyAddress
        }
      });
    } catch (error) {
      console.error('Failed to notify inspector:', error);
      return null;
    }
  }

  /**
   * Notify user about inspection completion
   */
  static async notifyInspectionCompleted(inspection, permit, result) {
    try {
      const user = await User.findOne({ where: { email: permit.applicantEmail } });

      if (!user) {
        console.warn(`User not found for permit ${permit.permitNumber}`);
        return null;
      }

      const resultMessages = {
        passed: 'Your inspection has passed!',
        failed: 'Your inspection did not pass. Please review the notes.',
        conditional: 'Your inspection passed with conditions. Please review the notes.',
        pending: 'Your inspection is complete and pending review.'
      };

      return await this.create({
        userId: user.id,
        type: 'inspection_completed',
        title: 'Inspection Completed',
        message: resultMessages[result] || 'Your inspection has been completed.',
        priority: result === 'failed' ? 'high' : 'medium',
        channel: 'in_app',
        relatedEntity: 'inspection',
        relatedEntityId: inspection.id,
        metadata: {
          permitNumber: permit.permitNumber,
          inspectionType: inspection.type,
          result
        }
      });
    } catch (error) {
      console.error('Failed to notify inspection completed:', error);
      return null;
    }
  }

  /**
   * Notify user about document upload
   */
  static async notifyDocumentUploaded(document, permit, uploader) {
    try {
      const user = await User.findOne({ where: { email: permit.applicantEmail } });

      if (!user || user.id === uploader.id) {
        // Don't notify if user is the uploader
        return null;
      }

      return await this.create({
        userId: user.id,
        type: 'document_uploaded',
        title: 'New Document Added',
        message: `A new document (${document.originalName}) has been uploaded to permit ${permit.permitNumber}`,
        priority: 'low',
        channel: 'in_app',
        relatedEntity: 'document',
        relatedEntityId: document.id,
        metadata: {
          permitNumber: permit.permitNumber,
          documentName: document.originalName,
          uploadedBy: uploader.name
        }
      });
    } catch (error) {
      console.error('Failed to notify document uploaded:', error);
      return null;
    }
  }

  /**
   * Notify user about payment received
   */
  static async notifyPaymentReceived(payment, permit) {
    try {
      const user = await User.findOne({ where: { id: payment.userId } });

      if (!user) {
        console.warn(`User not found for payment ${payment.id}`);
        return null;
      }

      return await this.create({
        userId: user.id,
        type: 'payment_received',
        title: 'Payment Received',
        message: `Your payment of $${payment.amount} for permit ${permit.permitNumber} has been received`,
        priority: 'medium',
        channel: 'in_app',
        relatedEntity: 'payment',
        relatedEntityId: payment.id,
        metadata: {
          permitNumber: permit.permitNumber,
          amount: payment.amount,
          receiptNumber: payment.receiptNumber
        }
      });
    } catch (error) {
      console.error('Failed to notify payment received:', error);
      return null;
    }
  }

  /**
   * Notify user about payment refund
   */
  static async notifyPaymentRefunded(payment, permit) {
    try {
      const user = await User.findOne({ where: { id: payment.userId } });

      if (!user) {
        console.warn(`User not found for payment ${payment.id}`);
        return null;
      }

      return await this.create({
        userId: user.id,
        type: 'payment_refunded',
        title: 'Payment Refunded',
        message: `A refund of $${payment.refundAmount} has been processed for permit ${permit.permitNumber}`,
        priority: 'high',
        channel: 'in_app',
        relatedEntity: 'payment',
        relatedEntityId: payment.id,
        metadata: {
          permitNumber: permit.permitNumber,
          refundAmount: payment.refundAmount,
          refundReason: payment.refundReason
        }
      });
    } catch (error) {
      console.error('Failed to notify payment refunded:', error);
      return null;
    }
  }

  /**
   * Send email notification (stub for future implementation)
   */
  static async sendEmail(notification) {
    // TODO: Implement email sending logic
    // This would integrate with services like SendGrid, AWS SES, etc.
    console.log(`📧 Email notification queued: ${notification.title}`);

    try {
      await notification.update({
        sent: true,
        sentAt: new Date(),
        deliveryStatus: 'sent'
      });
    } catch (error) {
      console.error('Failed to update notification delivery status:', error);
    }
  }

  /**
   * Send SMS notification (stub for future implementation)
   */
  static async sendSMS(notification) {
    // TODO: Implement SMS sending logic
    // This would integrate with services like Twilio, AWS SNS, etc.
    console.log(`📱 SMS notification queued: ${notification.title}`);

    try {
      await notification.update({
        sent: true,
        sentAt: new Date(),
        deliveryStatus: 'sent'
      });
    } catch (error) {
      console.error('Failed to update notification delivery status:', error);
    }
  }

  /**
   * Send push notification (stub for future implementation)
   */
  static async sendPushNotification(notification) {
    // TODO: Implement push notification logic
    // This would integrate with FCM, APNs, etc.
    console.log(`🔔 Push notification queued: ${notification.title}`);

    try {
      await notification.update({
        sent: true,
        sentAt: new Date(),
        deliveryStatus: 'sent'
      });
    } catch (error) {
      console.error('Failed to update notification delivery status:', error);
    }
  }
}

module.exports = NotificationService;
