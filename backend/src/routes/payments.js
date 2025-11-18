const express = require('express');
const router = express.Router();
const config = require('../config/config');
const { Payment, Permit, User } = require('../models');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { auditSensitiveOperation } = require('../middleware/auditLog');
const NotificationService = require('../services/notificationService');

/**
 * @route   GET /api/payments
 * @desc    Get all payments (filtered by role)
 * @access  Private
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 10, status, permitId } = req.query;
    const offset = (page - 1) * limit;

    const where = {};

    // Filter by permit if specified
    if (permitId) {
      where.permitId = permitId;
    }

    // Filter by status if specified
    if (status) {
      where.status = status;
    }

    // Citizens can only see their own payments
    if (req.user.role === 'citizen') {
      where.userId = req.user.id;
    }

    const { count, rows: payments } = await Payment.findAndCountAll({
      where,
      include: [
        {
          model: Permit,
          as: 'permit',
          attributes: ['id', 'permitNumber', 'type']
        },
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      payments,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Get payments error:', error);

    res.status(500).json({
      error: 'Failed to fetch payments',
      message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
    });
  }
});

/**
 * @route   GET /api/payments/:id
 * @desc    Get single payment
 * @access  Private
 */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const payment = await Payment.findByPk(req.params.id, {
      include: [
        {
          model: Permit,
          as: 'permit',
          attributes: ['id', 'permitNumber', 'type']
        },
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email']
        }
      ]
    });

    if (!payment) {
      return res.status(404).json({
        error: 'Payment not found'
      });
    }

    // Citizens can only view their own payments
    if (req.user.role === 'citizen' && payment.userId !== req.user.id) {
      return res.status(403).json({
        error: 'Access denied'
      });
    }

    res.json({
      success: true,
      payment
    });
  } catch (error) {
    console.error('Get payment error:', error);

    res.status(500).json({
      error: 'Failed to fetch payment',
      message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
    });
  }
});

/**
 * @route   POST /api/payments
 * @desc    Create a payment (initiate payment process)
 * @access  Private
 */
router.post('/',
  authMiddleware,
  auditSensitiveOperation('CREATE_PAYMENT'),
  async (req, res) => {
    try {
      const {
        permitId,
        amount,
        paymentType,
        paymentMethod,
        description
      } = req.body;

      // Verify permit exists
      const permit = await Permit.findByPk(permitId);
      if (!permit) {
        return res.status(404).json({
          error: 'Permit not found'
        });
      }

      // Citizens can only create payments for their own permits
      if (req.user.role === 'citizen' && permit.applicantEmail !== req.user.email) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You can only create payments for your own permits'
        });
      }

      // Create payment record
      const payment = await Payment.create({
        permitId,
        userId: req.user.id,
        amount,
        currency: 'USD',
        status: 'pending',
        paymentMethod,
        paymentType,
        description: description || `Payment for permit ${permit.permitNumber}`,
        metadata: {
          initiatedBy: req.user.email,
          initiatedAt: new Date()
        }
      });

      console.log(`✅ Payment created: ${payment.id} - ${payment.receiptNumber} for permit ${permit.permitNumber}`);

      res.status(201).json({
        success: true,
        message: 'Payment created successfully',
        payment: {
          id: payment.id,
          receiptNumber: payment.receiptNumber,
          amount: payment.amount,
          currency: payment.currency,
          status: payment.status,
          paymentType: payment.paymentType
        }
      });

      // TODO: Integrate with payment gateway (Stripe, PayPal, etc.)
      // TODO: Send payment link or initiate payment flow
      // TODO: Send notification
    } catch (error) {
      console.error('Create payment error:', error);

      res.status(500).json({
        error: 'Failed to create payment',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   PATCH /api/payments/:id/process
 * @desc    Process a payment (simulate payment processing)
 * @access  Private (Staff/Admin for now, will be webhook in production)
 */
router.patch('/:id/process',
  authMiddleware,
  requireRole('staff', 'admin'),
  auditSensitiveOperation('PROCESS_PAYMENT'),
  async (req, res) => {
    try {
      const { transactionId, paymentProcessor } = req.body;

      const payment = await Payment.findByPk(req.params.id, {
        include: [{
          model: Permit,
          as: 'permit'
        }]
      });

      if (!payment) {
        return res.status(404).json({
          error: 'Payment not found'
        });
      }

      if (payment.status === 'completed') {
        return res.status(400).json({
          error: 'Payment already completed'
        });
      }

      // Update payment as completed
      await payment.update({
        status: 'completed',
        transactionId: transactionId || `TXN-${Date.now()}`,
        paymentProcessor: paymentProcessor || 'manual',
        paidAt: new Date(),
        metadata: {
          ...payment.metadata,
          processedBy: req.user.email,
          processedAt: new Date()
        }
      });

      console.log(`✅ Payment processed: ${payment.id} - ${payment.receiptNumber}`);

      res.json({
        success: true,
        message: 'Payment processed successfully',
        payment
      });

      // Send payment received notification
      if (payment.permit) {
        NotificationService.notifyPaymentReceived(payment, payment.permit)
          .catch(err => console.error('Failed to send payment notification:', err));
      }

      // TODO: Update permit status if applicable
      // TODO: Send receipt to user
    } catch (error) {
      console.error('Process payment error:', error);

      res.status(500).json({
        error: 'Failed to process payment',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   PATCH /api/payments/:id/refund
 * @desc    Refund a payment
 * @access  Private (Admin only)
 */
router.patch('/:id/refund',
  authMiddleware,
  requireRole('admin'),
  auditSensitiveOperation('REFUND_PAYMENT'),
  async (req, res) => {
    try {
      const { refundAmount, refundReason } = req.body;

      const payment = await Payment.findByPk(req.params.id, {
        include: [{
          model: Permit,
          as: 'permit'
        }]
      });

      if (!payment) {
        return res.status(404).json({
          error: 'Payment not found'
        });
      }

      if (payment.status !== 'completed') {
        return res.status(400).json({
          error: 'Can only refund completed payments'
        });
      }

      const amount = refundAmount || payment.amount;

      if (amount > payment.amount) {
        return res.status(400).json({
          error: 'Refund amount cannot exceed payment amount'
        });
      }

      await payment.update({
        status: 'refunded',
        refundAmount: amount,
        refundReason: refundReason || 'Refund requested',
        refundedAt: new Date(),
        metadata: {
          ...payment.metadata,
          refundedBy: req.user.email,
          refundedAt: new Date()
        }
      });

      console.log(`✅ Payment refunded: ${payment.id} - Amount: $${amount}`);

      res.json({
        success: true,
        message: 'Payment refunded successfully',
        payment
      });

      // Send refund notification
      if (payment.permit) {
        NotificationService.notifyPaymentRefunded(payment, payment.permit)
          .catch(err => console.error('Failed to send refund notification:', err));
      }

      // TODO: Process refund with payment gateway
    } catch (error) {
      console.error('Refund payment error:', error);

      res.status(500).json({
        error: 'Failed to refund payment',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   GET /api/payments/stats
 * @desc    Get payment statistics
 * @access  Private (Staff/Admin)
 */
router.get('/stats/summary',
  authMiddleware,
  requireRole('staff', 'admin'),
  async (req, res) => {
    try {
      const totalPayments = await Payment.count();

      // Payments by status
      const paymentsByStatus = await Payment.findAll({
        attributes: [
          'status',
          [Payment.sequelize.fn('COUNT', Payment.sequelize.col('id')), 'count'],
          [Payment.sequelize.fn('SUM', Payment.sequelize.col('amount')), 'total']
        ],
        group: ['status']
      });

      // Total revenue (completed payments)
      const revenueData = await Payment.findOne({
        where: { status: 'completed' },
        attributes: [
          [Payment.sequelize.fn('SUM', Payment.sequelize.col('amount')), 'totalRevenue'],
          [Payment.sequelize.fn('COUNT', Payment.sequelize.col('id')), 'completedCount']
        ],
        raw: true
      });

      res.json({
        success: true,
        statistics: {
          total: totalPayments,
          totalRevenue: parseFloat(revenueData?.totalRevenue || 0),
          completedPayments: parseInt(revenueData?.completedCount || 0),
          byStatus: paymentsByStatus.map(item => ({
            status: item.status,
            count: parseInt(item.dataValues.count),
            total: parseFloat(item.dataValues.total || 0)
          }))
        }
      });
    } catch (error) {
      console.error('Get payment statistics error:', error);

      res.status(500).json({
        error: 'Failed to fetch payment statistics',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

module.exports = router;
