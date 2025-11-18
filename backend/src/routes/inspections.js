const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const config = require('../config/config');
const { Inspection, Permit, User } = require('../models');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { auditSensitiveOperation } = require('../middleware/auditLog');
const NotificationService = require('../services/notificationService');
const InspectionService = require('../services/inspectionService');

/**
 * @route   GET /api/inspections
 * @desc    Get all inspections (filtered by role)
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

    // Inspectors only see their own inspections
    if (req.user.role === 'inspector') {
      where.inspectorId = req.user.id;
    }

    const { count, rows: inspections } = await Inspection.findAndCountAll({
      where,
      include: [
        {
          model: Permit,
          as: 'permit',
          attributes: ['id', 'permitNumber', 'type', 'propertyAddress']
        },
        {
          model: User,
          as: 'inspector',
          attributes: ['id', 'name', 'email']
        }
      ],
      order: [['scheduledDate', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      inspections,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Get inspections error:', error);

    res.status(500).json({
      error: 'Failed to fetch inspections',
      message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
    });
  }
});

/**
 * @route   GET /api/inspections/:id
 * @desc    Get single inspection
 * @access  Private
 */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const inspection = await Inspection.findByPk(req.params.id, {
      include: [
        {
          model: Permit,
          as: 'permit',
          attributes: ['id', 'permitNumber', 'type', 'propertyAddress', 'applicantName']
        },
        {
          model: User,
          as: 'inspector',
          attributes: ['id', 'name', 'email']
        }
      ]
    });

    if (!inspection) {
      return res.status(404).json({
        error: 'Inspection not found'
      });
    }

    // Inspectors can only view their own inspections
    if (req.user.role === 'inspector' && inspection.inspectorId !== req.user.id) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only view your own inspections'
      });
    }

    res.json({
      success: true,
      inspection
    });
  } catch (error) {
    console.error('Get inspection error:', error);

    res.status(500).json({
      error: 'Failed to fetch inspection',
      message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
    });
  }
});

/**
 * @route   POST /api/inspections
 * @desc    Schedule a new inspection
 * @access  Private (Staff/Admin)
 */
router.post('/',
  authMiddleware,
  requireRole('staff', 'admin'),
  auditSensitiveOperation('CREATE_INSPECTION'),
  async (req, res) => {
    try {
      const {
        permitId,
        inspectorId,
        type,
        scheduledDate,
        notes
      } = req.body;

      // Verify permit exists
      const permit = await Permit.findByPk(permitId);
      if (!permit) {
        return res.status(404).json({
          error: 'Permit not found'
        });
      }

      // Verify inspector exists if specified
      let inspector = null;
      if (inspectorId) {
        inspector = await User.findOne({
          where: {
            id: inspectorId,
            role: 'inspector'
          }
        });

        if (!inspector) {
          return res.status(404).json({
            error: 'Inspector not found or invalid'
          });
        }
      }

      // Create inspection
      const inspection = await Inspection.create({
        permitId,
        inspectorId: inspectorId || null,
        type,
        scheduledDate,
        notes,
        status: 'scheduled',
        createdBy: req.user.id
      });

      console.log(`✅ Inspection scheduled: ${inspection.id} for permit ${permit.permitNumber}`);

      res.status(201).json({
        success: true,
        message: 'Inspection scheduled successfully',
        inspection
      });

      // Send notification to permit applicant
      NotificationService.notifyInspectionScheduled(inspection, permit)
        .catch(err => console.error('Failed to send inspection notification to applicant:', err));

      // Send notification to inspector if assigned
      if (inspector) {
        NotificationService.notifyInspectorAssigned(inspection, permit, inspector)
          .catch(err => console.error('Failed to send inspection notification to inspector:', err));
      }
    } catch (error) {
      console.error('Create inspection error:', error);

      res.status(500).json({
        error: 'Failed to schedule inspection',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   PUT /api/inspections/:id
 * @desc    Update inspection
 * @access  Private (Staff/Admin/Inspector)
 */
router.put('/:id',
  authMiddleware,
  requireRole('staff', 'admin', 'inspector'),
  auditSensitiveOperation('UPDATE_INSPECTION'),
  async (req, res) => {
    try {
      const inspection = await Inspection.findByPk(req.params.id);

      if (!inspection) {
        return res.status(404).json({
          error: 'Inspection not found'
        });
      }

      // Inspectors can only update their own inspections
      if (req.user.role === 'inspector' && inspection.inspectorId !== req.user.id) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You can only update your own inspections'
        });
      }

      await inspection.update({
        ...req.body,
        updatedBy: req.user.id
      });

      console.log(`✅ Inspection updated: ${inspection.id} by ${req.user.email}`);

      res.json({
        success: true,
        message: 'Inspection updated successfully',
        inspection
      });

      // TODO: Send notification if status changed
    } catch (error) {
      console.error('Update inspection error:', error);

      res.status(500).json({
        error: 'Failed to update inspection',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   PATCH /api/inspections/:id/complete
 * @desc    Complete an inspection
 * @access  Private (Inspector/Staff/Admin)
 */
router.patch('/:id/complete',
  authMiddleware,
  requireRole('inspector', 'staff', 'admin'),
  auditSensitiveOperation('COMPLETE_INSPECTION'),
  async (req, res) => {
    try {
      const { result, notes, checklist } = req.body;

      const inspection = await Inspection.findByPk(req.params.id, {
        include: [{
          model: Permit,
          as: 'permit'
        }]
      });

      if (!inspection) {
        return res.status(404).json({
          error: 'Inspection not found'
        });
      }

      // Inspectors can only complete their own inspections
      if (req.user.role === 'inspector' && inspection.inspectorId !== req.user.id) {
        return res.status(403).json({
          error: 'Access denied'
        });
      }

      await inspection.update({
        status: 'completed',
        result: result || 'pending',
        notes: notes || inspection.notes,
        checklist: checklist || inspection.checklist,
        completedDate: new Date(),
        updatedBy: req.user.id
      });

      console.log(`✅ Inspection completed: ${inspection.id} - Result: ${result}`);

      res.json({
        success: true,
        message: 'Inspection completed successfully',
        inspection
      });

      // Send notification to applicant
      if (inspection.permit) {
        NotificationService.notifyInspectionCompleted(inspection, inspection.permit, result || 'pending')
          .catch(err => console.error('Failed to send inspection completion notification:', err));
      }

      // TODO: Update permit status based on inspection result
    } catch (error) {
      console.error('Complete inspection error:', error);

      res.status(500).json({
        error: 'Failed to complete inspection',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   DELETE /api/inspections/:id
 * @desc    Cancel/delete an inspection
 * @access  Private (Staff/Admin)
 */
router.delete('/:id',
  authMiddleware,
  requireRole('staff', 'admin'),
  auditSensitiveOperation('DELETE_INSPECTION'),
  async (req, res) => {
    try {
      const inspection = await Inspection.findByPk(req.params.id);

      if (!inspection) {
        return res.status(404).json({
          error: 'Inspection not found'
        });
      }

      // Update to cancelled status instead of hard delete
      await inspection.update({
        status: 'cancelled',
        updatedBy: req.user.id
      });

      console.log(`✅ Inspection cancelled: ${inspection.id} by ${req.user.email}`);

      res.json({
        success: true,
        message: 'Inspection cancelled successfully'
      });

      // TODO: Send cancellation notification
    } catch (error) {
      console.error('Cancel inspection error:', error);

      res.status(500).json({
        error: 'Failed to cancel inspection',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   GET /api/inspections/checklist/:permitType/:inspectionType
 * @desc    Get inspection checklist template
 * @access  Public
 */
router.get('/checklist/:permitType/:inspectionType', (req, res) => {
  try {
    const { permitType, inspectionType } = req.params;

    const checklist = InspectionService.getChecklist(permitType, inspectionType);

    res.json({
      success: true,
      permitType,
      inspectionType,
      checklist
    });
  } catch (error) {
    console.error('Get checklist error:', error);

    res.status(500).json({
      error: 'Failed to fetch checklist',
      message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
    });
  }
});

/**
 * @route   GET /api/inspections/required/:permitType
 * @desc    Get required inspection types for permit type
 * @access  Public
 */
router.get('/required/:permitType', (req, res) => {
  try {
    const { permitType } = req.params;

    const requiredInspections = InspectionService.getRequiredInspections(permitType);

    res.json({
      success: true,
      permitType,
      requiredInspections
    });
  } catch (error) {
    console.error('Get required inspections error:', error);

    res.status(500).json({
      error: 'Failed to fetch required inspections',
      message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
    });
  }
});

/**
 * @route   GET /api/inspections/available-inspectors
 * @desc    Find available inspectors for a date
 * @access  Private (Staff/Admin)
 */
router.get('/available-inspectors',
  authMiddleware,
  requireRole('staff', 'admin'),
  async (req, res) => {
    try {
      const { scheduledDate, inspectionType } = req.query;

      if (!scheduledDate) {
        return res.status(400).json({
          error: 'Scheduled date is required'
        });
      }

      const availableInspectors = await InspectionService.findAvailableInspectors(
        new Date(scheduledDate),
        inspectionType
      );

      res.json({
        success: true,
        scheduledDate,
        availableInspectors,
        count: availableInspectors.length
      });
    } catch (error) {
      console.error('Find available inspectors error:', error);

      res.status(500).json({
        error: 'Failed to find available inspectors',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   POST /api/inspections/:id/auto-assign
 * @desc    Auto-assign inspector to inspection
 * @access  Private (Staff/Admin)
 */
router.post('/:id/auto-assign',
  authMiddleware,
  requireRole('staff', 'admin'),
  async (req, res) => {
    try {
      const inspection = await Inspection.findByPk(req.params.id);

      if (!inspection) {
        return res.status(404).json({
          error: 'Inspection not found'
        });
      }

      const assigned = await InspectionService.autoAssignInspector(inspection);

      if (!assigned) {
        return res.status(400).json({
          error: 'No available inspectors found'
        });
      }

      res.json({
        success: true,
        message: `Inspector ${assigned.name} assigned successfully`,
        inspector: assigned
      });

      // Send notification to inspector
      NotificationService.notifyInspectorAssigned(inspection, inspection.permit, assigned)
        .catch(err => console.error('Failed to send assignment notification:', err));
    } catch (error) {
      console.error('Auto-assign inspector error:', error);

      res.status(500).json({
        error: 'Failed to auto-assign inspector',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   PATCH /api/inspections/:id/checklist
 * @desc    Update inspection checklist
 * @access  Private (Inspector/Staff/Admin)
 */
router.patch('/:id/checklist',
  authMiddleware,
  requireRole('inspector', 'staff', 'admin'),
  async (req, res) => {
    try {
      const { checklist } = req.body;

      if (!checklist) {
        return res.status(400).json({
          error: 'Checklist data is required'
        });
      }

      const inspection = await InspectionService.updateChecklist(req.params.id, checklist);

      res.json({
        success: true,
        message: 'Checklist updated successfully',
        checklist: inspection.checklist
      });
    } catch (error) {
      console.error('Update checklist error:', error);

      res.status(500).json({
        error: 'Failed to update checklist',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   POST /api/inspections/:id/reinspect
 * @desc    Schedule reinspection
 * @access  Private (Staff/Admin)
 */
router.post('/:id/reinspect',
  authMiddleware,
  requireRole('staff', 'admin'),
  auditSensitiveOperation('SCHEDULE_REINSPECTION'),
  async (req, res) => {
    try {
      const { scheduledDate } = req.body;

      if (!scheduledDate) {
        return res.status(400).json({
          error: 'Scheduled date is required'
        });
      }

      const reinspection = await InspectionService.scheduleReinspection(req.params.id, {
        scheduledDate: new Date(scheduledDate),
        createdBy: req.user.id
      });

      res.status(201).json({
        success: true,
        message: 'Re-inspection scheduled successfully',
        inspection: reinspection
      });
    } catch (error) {
      console.error('Schedule reinspection error:', error);

      res.status(500).json({
        error: 'Failed to schedule reinspection',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   GET /api/inspections/stats
 * @desc    Get inspection statistics
 * @access  Private (Staff/Admin/Inspector)
 */
router.get('/stats',
  authMiddleware,
  requireRole('staff', 'admin', 'inspector'),
  async (req, res) => {
    try {
      const { inspectorId, startDate, endDate } = req.query;

      const filters = {};

      if (inspectorId) {
        filters.inspectorId = inspectorId;
      }

      if (startDate && endDate) {
        filters.startDate = new Date(startDate);
        filters.endDate = new Date(endDate);
      }

      const stats = await InspectionService.getInspectionStats(filters);

      res.json({
        success: true,
        stats
      });
    } catch (error) {
      console.error('Get inspection stats error:', error);

      res.status(500).json({
        error: 'Failed to fetch inspection statistics',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

module.exports = router;
