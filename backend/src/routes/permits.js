const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { sequelize } = require('../models');
const config = require('../config/config');
const Permit = require('../models/Permit');
const { authMiddleware, requireRole, optionalAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validator');
const { auditSensitiveOperation } = require('../middleware/auditLog');
const NotificationService = require('../services/notificationService');
const workflowService = require('../services/workflowService');

/**
 * @route   GET /api/permits
 * @desc    Get all permits (with pagination and filtering)
 * @access  Private (Citizens see only their own, staff/admin see all)
 */
router.get('/', authMiddleware, validate.listPermits, async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const offset = (page - 1) * limit;

    // Build query conditions
    const where = {};

    // Citizens can only see their own permits
    if (req.user.role === 'citizen') {
      where.applicantEmail = req.user.email;
    }

    // Filter by status if provided
    if (status) {
      where.status = status;
    }

    // Fetch permits with pagination
    const { count, rows: permits } = await Permit.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      permits,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Get permits error:', error);

    res.status(500).json({
      error: 'Failed to fetch permits',
      message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
    });
  }
});

/**
 * @route   GET /api/permits/:id
 * @desc    Get single permit by ID
 * @access  Private (Owner or staff/admin)
 */
router.get('/:id', authMiddleware, validate.permitId, async (req, res) => {
  try {
    const permit = await Permit.findByPk(req.params.id);

    if (!permit) {
      return res.status(404).json({
        error: 'Permit not found',
        message: 'No permit found with that ID'
      });
    }

    // Check if user has permission to view this permit
    if (req.user.role === 'citizen' && permit.applicantEmail !== req.user.email) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only view your own permits'
      });
    }

    res.json({
      success: true,
      permit
    });
  } catch (error) {
    console.error('Get permit error:', error);

    res.status(500).json({
      error: 'Failed to fetch permit',
      message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
    });
  }
});

/**
 * @route   POST /api/permits
 * @desc    Create a new permit
 * @access  Private (Authenticated users)
 */
router.post('/',
  authMiddleware,
  validate.createPermit,
  auditSensitiveOperation('CREATE_PERMIT'),
  async (req, res) => {
    try {
      // Generate unique permit number
      const count = await Permit.count();
      const permitNumber = `PERMIT-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

      // For citizens, ensure they're creating a permit with their own email
      const permitData = { ...req.body };

      if (req.user.role === 'citizen') {
        permitData.applicantEmail = req.user.email;
        permitData.applicantName = req.user.name;
      }

      // Create permit
      const permit = await Permit.create({
        ...permitData,
        permitNumber,
        status: 'submitted'
      });

      console.log(`✅ Permit created: ${permit.permitNumber} by ${req.user.email}`);

      res.status(201).json({
        success: true,
        message: 'Permit created successfully',
        permit
      });

      // Trigger workflow for automatic processing (async, don't wait)
      workflowService.startWorkflow(permit, 'permit_submitted')
        .catch(err => console.error('Workflow trigger error:', err));
    } catch (error) {
      console.error('Create permit error:', error);

      res.status(500).json({
        error: 'Failed to create permit',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   PUT /api/permits/:id
 * @desc    Update permit
 * @access  Private (Staff/Admin only for now)
 */
router.put('/:id',
  authMiddleware,
  requireRole('staff', 'admin', 'inspector'),
  validate.updatePermit,
  auditSensitiveOperation('UPDATE_PERMIT'),
  async (req, res) => {
    try {
      const permit = await Permit.findByPk(req.params.id);

      if (!permit) {
        return res.status(404).json({
          error: 'Permit not found',
          message: 'No permit found with that ID'
        });
      }

      // Update permit
      await permit.update(req.body);

      console.log(`✅ Permit updated: ${permit.permitNumber} by ${req.user.email}`);

      res.json({
        success: true,
        message: 'Permit updated successfully',
        permit
      });

      // TODO: Send notification if status changed
      // TODO: Trigger workflow based on status change
    } catch (error) {
      console.error('Update permit error:', error);

      res.status(500).json({
        error: 'Failed to update permit',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   PATCH /api/permits/:id/status
 * @desc    Update permit status
 * @access  Private (Staff/Admin only)
 */
router.patch('/:id/status',
  authMiddleware,
  requireRole('staff', 'admin', 'inspector'),
  validate.permitId,
  auditSensitiveOperation('UPDATE_PERMIT_STATUS'),
  async (req, res) => {
    try {
      const { status } = req.body;
      const permit = await Permit.findByPk(req.params.id);

      if (!permit) {
        return res.status(404).json({
          error: 'Permit not found'
        });
      }

      const oldStatus = permit.status;
      await permit.update({ status });

      console.log(`✅ Permit status updated: ${permit.permitNumber} from ${oldStatus} to ${status} by ${req.user.email}`);

      res.json({
        success: true,
        message: 'Permit status updated successfully',
        permit,
        oldStatus,
        newStatus: status
      });

      // Send notification to applicant
      NotificationService.notifyPermitStatusChange(permit, oldStatus, status)
        .catch(err => console.error('Failed to send permit status notification:', err));

      // TODO: Trigger workflow based on status
    } catch (error) {
      console.error('Update permit status error:', error);

      res.status(500).json({
        error: 'Failed to update permit status',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   DELETE /api/permits/:id
 * @desc    Delete permit (soft delete)
 * @access  Private (Admin only)
 */
router.delete('/:id',
  authMiddleware,
  requireRole('admin'),
  validate.permitId,
  auditSensitiveOperation('DELETE_PERMIT'),
  async (req, res) => {
    try {
      const permit = await Permit.findByPk(req.params.id);

      if (!permit) {
        return res.status(404).json({
          error: 'Permit not found'
        });
      }

      await permit.destroy();

      console.log(`✅ Permit deleted: ${permit.permitNumber} by ${req.user.email}`);

      res.json({
        success: true,
        message: 'Permit deleted successfully'
      });
    } catch (error) {
      console.error('Delete permit error:', error);

      res.status(500).json({
        error: 'Failed to delete permit',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   GET /api/permits/stats
 * @desc    Get permit statistics
 * @access  Private (Staff/Admin/Inspector)
 */
router.get('/stats',
  authMiddleware,
  requireRole('staff', 'admin', 'inspector'),
  async (req, res) => {
    try {
      // Get total permits
      const totalPermits = await Permit.count();

      // Get permits by status
      const permitsByStatus = await Permit.findAll({
        attributes: [
          'status',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        group: ['status']
      });

      // Get permits by type
      const permitsByType = await Permit.findAll({
        attributes: [
          'type',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        group: ['type'],
        order: [[sequelize.fn('COUNT', sequelize.col('id')), 'DESC']],
        limit: 10
      });

      // Get recent permits (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const recentPermits = await Permit.count({
        where: {
          createdAt: {
            [Op.gte]: thirtyDaysAgo
          }
        }
      });

      // Average processing time (for completed permits)
      const completedPermits = await Permit.findAll({
        where: {
          status: {
            [Op.in]: ['approved', 'rejected']
          }
        },
        attributes: [
          [sequelize.fn('AVG',
            sequelize.literal('EXTRACT(EPOCH FROM ("updated_at" - "created_at"))')
          ), 'avg_processing_seconds']
        ],
        raw: true
      });

      const avgProcessingDays = completedPermits[0]?.avg_processing_seconds
        ? Math.round(completedPermits[0].avg_processing_seconds / 86400)
        : 0;

      res.json({
        success: true,
        statistics: {
          total: totalPermits,
          recent30Days: recentPermits,
          averageProcessingDays: avgProcessingDays,
          byStatus: permitsByStatus.reduce((acc, item) => {
            acc[item.status] = parseInt(item.dataValues.count);
            return acc;
          }, {}),
          byType: permitsByType.map(item => ({
            type: item.type,
            count: parseInt(item.dataValues.count)
          }))
        }
      });
    } catch (error) {
      console.error('Get permit statistics error:', error);

      res.status(500).json({
        error: 'Failed to fetch permit statistics',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   GET /api/permits/search
 * @desc    Search permits
 * @access  Private (Staff/Admin)
 */
router.get('/search',
  authMiddleware,
  requireRole('staff', 'admin', 'inspector'),
  validate.searchPermits,
  async (req, res) => {
    try {
      const { q, page = 1, limit = 10 } = req.query;
      const offset = (page - 1) * limit;

      // Search in multiple fields
      const { count, rows: permits } = await Permit.findAndCountAll({
        where: {
          [Op.or]: [
            { permitNumber: { [Op.iLike]: `%${q}%` } },
            { applicantName: { [Op.iLike]: `%${q}%` } },
            { applicantEmail: { [Op.iLike]: `%${q}%` } },
            { propertyAddress: { [Op.iLike]: `%${q}%` } },
            { type: { [Op.iLike]: `%${q}%` } }
          ]
        },
        order: [['createdAt', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      res.json({
        success: true,
        permits,
        query: q,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit)
        }
      });
    } catch (error) {
      console.error('Search permits error:', error);

      res.status(500).json({
        error: 'Failed to search permits',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

module.exports = router;
