const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const config = require('../config/config');
const { Grant, GrantApplication, User } = require('../models');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { auditSensitiveOperation } = require('../middleware/auditLog');
const GrantService = require('../services/grantService');

/**
 * @route   GET /api/grants
 * @desc    Search and list grant opportunities
 * @access  Private (All authenticated users)
 */
router.get('/',
  authMiddleware,
  async (req, res) => {
    try {
      const {
        query,
        category,
        status,
        agencyName,
        minAward,
        maxAward,
        eligibleApplicant,
        keywords,
        closeDateAfter,
        closeDateBefore,
        matchScoreMin,
        page = 1,
        limit = 50,
        sortBy = 'closeDate',
        sortOrder = 'ASC'
      } = req.query;

      const offset = (page - 1) * limit;

      const filters = {
        query,
        category,
        status,
        agencyName,
        minAward,
        maxAward,
        eligibleApplicant,
        keywords: keywords ? keywords.split(',') : null,
        closeDateAfter,
        closeDateBefore,
        matchScoreMin,
        limit: parseInt(limit),
        offset: parseInt(offset),
        sortBy,
        sortOrder
      };

      const grants = await GrantService.searchGrants(filters);
      const total = await Grant.count({
        where: { status: status || 'open' }
      });

      res.json({
        success: true,
        grants,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      console.error('Get grants error:', error);

      res.status(500).json({
        error: 'Failed to fetch grants',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   GET /api/grants/:id
 * @desc    Get single grant with applications
 * @access  Private (All authenticated users)
 */
router.get('/:id',
  authMiddleware,
  async (req, res) => {
    try {
      const grant = await GrantService.getGrantWithApplications(req.params.id);

      if (!grant) {
        return res.status(404).json({
          error: 'Grant not found'
        });
      }

      res.json({
        success: true,
        grant
      });
    } catch (error) {
      console.error('Get grant error:', error);

      res.status(500).json({
        error: 'Failed to fetch grant',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   POST /api/grants
 * @desc    Create new grant opportunity
 * @access  Private (Admin only)
 */
router.post('/',
  authMiddleware,
  requireRole('admin'),
  auditSensitiveOperation('CREATE_GRANT'),
  async (req, res) => {
    try {
      const grantData = req.body;
      const grant = await GrantService.createGrant(grantData, req.user.id);

      res.status(201).json({
        success: true,
        message: 'Grant created successfully',
        grant
      });
    } catch (error) {
      console.error('Create grant error:', error);

      res.status(500).json({
        error: 'Failed to create grant',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   PUT /api/grants/:id
 * @desc    Update grant opportunity
 * @access  Private (Admin only)
 */
router.put('/:id',
  authMiddleware,
  requireRole('admin'),
  auditSensitiveOperation('UPDATE_GRANT'),
  async (req, res) => {
    try {
      const grant = await GrantService.updateGrant(req.params.id, req.body, req.user.id);

      res.json({
        success: true,
        message: 'Grant updated successfully',
        grant
      });
    } catch (error) {
      console.error('Update grant error:', error);

      res.status(500).json({
        error: 'Failed to update grant',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   DELETE /api/grants/:id
 * @desc    Archive grant (soft delete)
 * @access  Private (Admin only)
 */
router.delete('/:id',
  authMiddleware,
  requireRole('admin'),
  auditSensitiveOperation('DELETE_GRANT'),
  async (req, res) => {
    try {
      const grant = await Grant.findByPk(req.params.id);

      if (!grant) {
        return res.status(404).json({
          error: 'Grant not found'
        });
      }

      // Soft delete by updating status
      await grant.update({ status: 'archived' });

      console.log(`✅ Grant archived: ${grant.id} - ${grant.title}`);

      res.json({
        success: true,
        message: 'Grant archived successfully'
      });
    } catch (error) {
      console.error('Delete grant error:', error);

      res.status(500).json({
        error: 'Failed to delete grant',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   POST /api/grants/match
 * @desc    AI-powered grant matching for municipality
 * @access  Private (Staff/Admin)
 */
router.post('/match',
  authMiddleware,
  requireRole('staff', 'admin'),
  async (req, res) => {
    try {
      const { municipalityProfile, categories, minMatchScore = 0.5, limit = 20 } = req.body;

      if (!municipalityProfile) {
        return res.status(400).json({
          error: 'Municipality profile is required'
        });
      }

      const matchedGrants = await GrantService.matchGrantsToMunicipality(
        municipalityProfile,
        { categories, minMatchScore, limit }
      );

      res.json({
        success: true,
        message: `Found ${matchedGrants.length} matching grants`,
        matches: matchedGrants,
        municipalityProfile
      });
    } catch (error) {
      console.error('Match grants error:', error);

      res.status(500).json({
        error: 'Failed to match grants',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   GET /api/grants/stats
 * @desc    Get grant statistics
 * @access  Private (All authenticated users)
 */
router.get('/stats/overview',
  authMiddleware,
  async (req, res) => {
    try {
      const filters = {
        userId: req.query.userId === 'me' ? req.user.id : req.query.userId
      };

      const stats = await GrantService.getGrantStats(filters);

      res.json({
        success: true,
        stats
      });
    } catch (error) {
      console.error('Get grant stats error:', error);

      res.status(500).json({
        error: 'Failed to fetch grant statistics',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   POST /api/grants/sync
 * @desc    Sync grants from Grants.gov API
 * @access  Private (Admin only)
 */
router.post('/sync',
  authMiddleware,
  requireRole('admin'),
  auditSensitiveOperation('SYNC_GRANTS'),
  async (req, res) => {
    try {
      const result = await GrantService.syncFromGrantsGov(req.body);

      res.json({
        success: result.success,
        message: result.message,
        imported: result.imported,
        updated: result.updated
      });
    } catch (error) {
      console.error('Sync grants error:', error);

      res.status(500).json({
        error: 'Failed to sync grants',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

// ============================================================================
// GRANT APPLICATION ROUTES
// ============================================================================

/**
 * @route   GET /api/grants/applications/list
 * @desc    List grant applications
 * @access  Private (All authenticated users - filtered by role)
 */
router.get('/applications/list',
  authMiddleware,
  async (req, res) => {
    try {
      const { status, grantId, page = 1, limit = 50 } = req.query;
      const offset = (page - 1) * limit;

      const where = {};

      // Filter by status
      if (status) {
        where.status = status;
      }

      // Filter by grant
      if (grantId) {
        where.grantId = grantId;
      }

      // Non-admin users can only see their own applications
      if (req.user.role !== 'admin' && req.user.role !== 'staff') {
        where.applicantId = req.user.id;
      }

      const { count, rows: applications } = await GrantApplication.findAndCountAll({
        where,
        include: [
          {
            model: Grant,
            as: 'grant',
            attributes: ['id', 'title', 'agencyName', 'category', 'status', 'closeDate']
          },
          {
            model: User,
            as: 'applicant',
            attributes: ['id', 'name', 'email']
          }
        ],
        order: [['createdAt', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      res.json({
        success: true,
        applications,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit)
        }
      });
    } catch (error) {
      console.error('Get applications error:', error);

      res.status(500).json({
        error: 'Failed to fetch applications',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   GET /api/grants/applications/:id
 * @desc    Get single grant application with details
 * @access  Private (Owner, Staff, Admin)
 */
router.get('/applications/:id',
  authMiddleware,
  async (req, res) => {
    try {
      const application = await GrantService.getApplicationWithDetails(req.params.id);

      if (!application) {
        return res.status(404).json({
          error: 'Application not found'
        });
      }

      // Check permissions
      if (req.user.role !== 'admin' &&
          req.user.role !== 'staff' &&
          application.applicantId !== req.user.id) {
        return res.status(403).json({
          error: 'Not authorized to view this application'
        });
      }

      res.json({
        success: true,
        application
      });
    } catch (error) {
      console.error('Get application error:', error);

      res.status(500).json({
        error: 'Failed to fetch application',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   POST /api/grants/applications
 * @desc    Create new grant application
 * @access  Private (All authenticated users)
 */
router.post('/applications',
  authMiddleware,
  async (req, res) => {
    try {
      const applicationData = req.body;
      const application = await GrantService.createApplication(applicationData, req.user.id);

      res.status(201).json({
        success: true,
        message: 'Grant application created successfully',
        application
      });
    } catch (error) {
      console.error('Create application error:', error);

      res.status(500).json({
        error: 'Failed to create application',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   PUT /api/grants/applications/:id
 * @desc    Update grant application
 * @access  Private (Owner, Staff, Admin)
 */
router.put('/applications/:id',
  authMiddleware,
  async (req, res) => {
    try {
      const application = await GrantApplication.findByPk(req.params.id);

      if (!application) {
        return res.status(404).json({
          error: 'Application not found'
        });
      }

      // Check permissions
      if (req.user.role !== 'admin' &&
          req.user.role !== 'staff' &&
          application.applicantId !== req.user.id) {
        return res.status(403).json({
          error: 'Not authorized to update this application'
        });
      }

      const updatedApplication = await GrantService.updateApplication(
        req.params.id,
        req.body,
        req.user.id
      );

      res.json({
        success: true,
        message: 'Application updated successfully',
        application: updatedApplication
      });
    } catch (error) {
      console.error('Update application error:', error);

      res.status(500).json({
        error: 'Failed to update application',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   POST /api/grants/applications/:id/submit
 * @desc    Submit grant application
 * @access  Private (Owner only)
 */
router.post('/applications/:id/submit',
  authMiddleware,
  auditSensitiveOperation('SUBMIT_GRANT_APPLICATION'),
  async (req, res) => {
    try {
      const application = await GrantApplication.findByPk(req.params.id);

      if (!application) {
        return res.status(404).json({
          error: 'Application not found'
        });
      }

      // Only the applicant can submit their own application
      if (application.applicantId !== req.user.id) {
        return res.status(403).json({
          error: 'Not authorized to submit this application'
        });
      }

      const submittedApplication = await GrantService.submitApplication(req.params.id, req.user.id);

      res.json({
        success: true,
        message: 'Application submitted successfully',
        application: submittedApplication
      });
    } catch (error) {
      console.error('Submit application error:', error);

      res.status(400).json({
        error: 'Failed to submit application',
        message: error.message
      });
    }
  }
);

/**
 * @route   POST /api/grants/applications/:id/review
 * @desc    Update application review status/notes
 * @access  Private (Staff/Admin only)
 */
router.post('/applications/:id/review',
  authMiddleware,
  requireRole('staff', 'admin'),
  auditSensitiveOperation('REVIEW_GRANT_APPLICATION'),
  async (req, res) => {
    try {
      const { reviewNotes, reviewScore, status } = req.body;

      const application = await GrantApplication.findByPk(req.params.id);

      if (!application) {
        return res.status(404).json({
          error: 'Application not found'
        });
      }

      const updateData = {
        reviewNotes,
        reviewScore,
        updatedBy: req.user.id
      };

      if (status) {
        updateData.status = status;
        updateData.reviewStartDate = new Date();
      }

      await application.update(updateData);

      console.log(`✅ Application reviewed: ${application.id} - ${application.applicationNumber}`);

      res.json({
        success: true,
        message: 'Application review updated successfully',
        application
      });
    } catch (error) {
      console.error('Review application error:', error);

      res.status(500).json({
        error: 'Failed to review application',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   POST /api/grants/applications/:id/decision
 * @desc    Make award/decline decision on application
 * @access  Private (Admin only)
 */
router.post('/applications/:id/decision',
  authMiddleware,
  requireRole('admin'),
  auditSensitiveOperation('GRANT_APPLICATION_DECISION'),
  async (req, res) => {
    try {
      const { status, awardedAmount, decisionNotes } = req.body;

      if (!status || !['awarded', 'declined'].includes(status)) {
        return res.status(400).json({
          error: 'Valid decision status required (awarded or declined)'
        });
      }

      const application = await GrantApplication.findByPk(req.params.id);

      if (!application) {
        return res.status(404).json({
          error: 'Application not found'
        });
      }

      const updateData = {
        status,
        decisionNotes,
        decisionDate: new Date(),
        decisionMadeBy: req.user.id,
        updatedBy: req.user.id
      };

      if (status === 'awarded' && awardedAmount) {
        updateData.awardedAmount = awardedAmount;
      }

      await application.update(updateData);

      console.log(`✅ Application decision: ${application.id} - ${status.toUpperCase()}`);

      res.json({
        success: true,
        message: `Application ${status} successfully`,
        application
      });
    } catch (error) {
      console.error('Application decision error:', error);

      res.status(500).json({
        error: 'Failed to process decision',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   DELETE /api/grants/applications/:id
 * @desc    Delete grant application (soft delete)
 * @access  Private (Owner or Admin)
 */
router.delete('/applications/:id',
  authMiddleware,
  auditSensitiveOperation('DELETE_GRANT_APPLICATION'),
  async (req, res) => {
    try {
      const application = await GrantApplication.findByPk(req.params.id);

      if (!application) {
        return res.status(404).json({
          error: 'Application not found'
        });
      }

      // Only the applicant or admin can delete
      if (req.user.role !== 'admin' && application.applicantId !== req.user.id) {
        return res.status(403).json({
          error: 'Not authorized to delete this application'
        });
      }

      // Only allow deletion of draft or withdrawn applications
      if (!['draft', 'withdrawn'].includes(application.status)) {
        return res.status(400).json({
          error: 'Only draft or withdrawn applications can be deleted'
        });
      }

      await application.destroy();

      console.log(`✅ Application deleted: ${application.id} - ${application.applicationNumber}`);

      res.json({
        success: true,
        message: 'Application deleted successfully'
      });
    } catch (error) {
      console.error('Delete application error:', error);

      res.status(500).json({
        error: 'Failed to delete application',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

module.exports = router;
