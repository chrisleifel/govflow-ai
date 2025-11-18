const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { sequelize } = require('../models');
const config = require('../config/config');
const { Permit, User, Inspection, Document, Payment, Notification } = require('../models');
const { authMiddleware, requireRole } = require('../middleware/auth');

/**
 * @route   GET /api/dashboard/admin
 * @desc    Get admin dashboard with system-wide statistics
 * @access  Private (Admin/Staff)
 */
router.get('/admin',
  authMiddleware,
  requireRole('admin', 'staff'),
  async (req, res) => {
    try {
      const { period = '30d' } = req.query; // 7d, 30d, 90d, 1y

      // Calculate date range
      const dateRange = getDateRange(period);

      // Get overall statistics
      const stats = await Promise.all([
        // Total permits by status
        Permit.count({ where: { status: 'submitted' } }),
        Permit.count({ where: { status: 'under_review' } }),
        Permit.count({ where: { status: 'approved' } }),
        Permit.count({ where: { status: 'rejected' } }),
        Permit.count(),

        // Total users by role
        User.count({ where: { role: 'citizen' } }),
        User.count({ where: { role: 'staff' } }),
        User.count({ where: { role: 'inspector' } }),
        User.count(),

        // Inspections
        Inspection.count({ where: { status: 'scheduled' } }),
        Inspection.count({ where: { status: 'completed' } }),
        Inspection.count(),

        // Documents
        Document.count({ where: { processed: true } }),
        Document.count(),

        // Payments
        Payment.sum('amount', { where: { status: 'completed' } }),
        Payment.count({ where: { status: 'completed' } }),
        Payment.count(),

        // Notifications
        Notification.count({ where: { read: false } })
      ]);

      const [
        submittedPermits, underReviewPermits, approvedPermits, rejectedPermits, totalPermits,
        totalCitizens, totalStaff, totalInspectors, totalUsers,
        scheduledInspections, completedInspections, totalInspections,
        processedDocuments, totalDocuments,
        totalRevenue, completedPayments, totalPayments,
        unreadNotifications
      ] = stats;

      // Permit trends (last 30 days)
      const permitTrends = await Permit.findAll({
        attributes: [
          [sequelize.fn('DATE', sequelize.col('createdAt')), 'date'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        where: {
          createdAt: { [Op.gte]: dateRange.start }
        },
        group: [sequelize.fn('DATE', sequelize.col('createdAt'))],
        order: [[sequelize.fn('DATE', sequelize.col('createdAt')), 'ASC']],
        raw: true
      });

      // Permits by type
      const permitsByType = await Permit.findAll({
        attributes: [
          'type',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        group: ['type'],
        raw: true
      });

      // Calculate metrics
      const approvalRate = totalPermits > 0
        ? ((approvedPermits / totalPermits) * 100).toFixed(1)
        : 0;

      const processingRate = totalDocuments > 0
        ? ((processedDocuments / totalDocuments) * 100).toFixed(1)
        : 0;

      res.json({
        success: true,
        period,
        overview: {
          permits: {
            total: totalPermits,
            submitted: submittedPermits,
            underReview: underReviewPermits,
            approved: approvedPermits,
            rejected: rejectedPermits,
            approvalRate: parseFloat(approvalRate)
          },
          users: {
            total: totalUsers,
            citizens: totalCitizens,
            staff: totalStaff,
            inspectors: totalInspectors
          },
          inspections: {
            total: totalInspections,
            scheduled: scheduledInspections,
            completed: completedInspections,
            completionRate: totalInspections > 0
              ? ((completedInspections / totalInspections) * 100).toFixed(1)
              : 0
          },
          documents: {
            total: totalDocuments,
            processed: processedDocuments,
            processingRate: parseFloat(processingRate)
          },
          payments: {
            total: totalPayments,
            completed: completedPayments,
            totalRevenue: parseFloat(totalRevenue || 0),
            avgPayment: completedPayments > 0
              ? (parseFloat(totalRevenue || 0) / completedPayments).toFixed(2)
              : 0
          },
          notifications: {
            unread: unreadNotifications
          }
        },
        trends: {
          permits: permitTrends,
          permitsByType
        }
      });
    } catch (error) {
      console.error('Admin dashboard error:', error);

      res.status(500).json({
        error: 'Failed to fetch admin dashboard',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   GET /api/dashboard/staff
 * @desc    Get staff dashboard with workload metrics
 * @access  Private (Staff/Admin)
 */
router.get('/staff',
  authMiddleware,
  requireRole('staff', 'admin'),
  async (req, res) => {
    try {
      // Get permits assigned to or relevant for staff
      const assignedPermits = await Permit.count({
        where: {
          status: { [Op.in]: ['submitted', 'under_review'] }
        }
      });

      // Get today's inspections (all staff can see)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const todaysInspections = await Inspection.count({
        where: {
          scheduledDate: {
            [Op.gte]: today,
            [Op.lt]: tomorrow
          }
        }
      });

      // Pending documents review
      const pendingDocuments = await Document.count({
        where: { processed: false }
      });

      // Recent permits (last 10)
      const recentPermits = await Permit.findAll({
        limit: 10,
        order: [['createdAt', 'DESC']],
        attributes: ['id', 'permitNumber', 'type', 'status', 'applicantName', 'createdAt']
      });

      // Upcoming inspections
      const upcomingInspections = await Inspection.findAll({
        where: {
          scheduledDate: { [Op.gte]: new Date() },
          status: { [Op.in]: ['scheduled', 'in_progress'] }
        },
        limit: 10,
        order: [['scheduledDate', 'ASC']],
        include: [{
          model: Permit,
          as: 'permit',
          attributes: ['permitNumber', 'type', 'propertyAddress']
        }]
      });

      // Workload by staff member
      const staffWorkload = await User.findAll({
        where: { role: 'staff', status: 'active' },
        attributes: ['id', 'name', 'email'],
        limit: 10
      });

      // Get permit counts for each staff (simplified)
      const workloadData = await Promise.all(
        staffWorkload.map(async (staff) => ({
          id: staff.id,
          name: staff.name,
          email: staff.email,
          // In production, track actual assignments
          assignedPermits: Math.floor(Math.random() * 10),
          completedToday: Math.floor(Math.random() * 5)
        }))
      );

      res.json({
        success: true,
        workload: {
          assignedPermits,
          todaysInspections,
          pendingDocuments
        },
        recentPermits,
        upcomingInspections,
        staffWorkload: workloadData
      });
    } catch (error) {
      console.error('Staff dashboard error:', error);

      res.status(500).json({
        error: 'Failed to fetch staff dashboard',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   GET /api/dashboard/inspector
 * @desc    Get inspector dashboard with assigned inspections
 * @access  Private (Inspector)
 */
router.get('/inspector',
  authMiddleware,
  requireRole('inspector', 'admin'),
  async (req, res) => {
    try {
      const inspectorId = req.user.role === 'inspector' ? req.user.id : null;

      // Get inspector's inspections
      const where = inspectorId ? { inspectorId } : {};

      const [
        totalAssigned,
        scheduledCount,
        completedToday,
        pendingReports
      ] = await Promise.all([
        Inspection.count({ where }),
        Inspection.count({ where: { ...where, status: 'scheduled' } }),
        Inspection.count({
          where: {
            ...where,
            status: 'completed',
            completedDate: {
              [Op.gte]: new Date(new Date().setHours(0, 0, 0, 0))
            }
          }
        }),
        Inspection.count({
          where: { ...where, status: 'completed', result: 'pending' }
        })
      ]);

      // Today's schedule
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const todaysSchedule = await Inspection.findAll({
        where: {
          ...where,
          scheduledDate: {
            [Op.gte]: today,
            [Op.lt]: tomorrow
          }
        },
        include: [{
          model: Permit,
          as: 'permit',
          attributes: ['permitNumber', 'type', 'propertyAddress', 'applicantName']
        }],
        order: [['scheduledDate', 'ASC']]
      });

      // Upcoming inspections
      const upcomingInspections = await Inspection.findAll({
        where: {
          ...where,
          scheduledDate: { [Op.gt]: tomorrow },
          status: { [Op.in]: ['scheduled', 'in_progress'] }
        },
        limit: 10,
        order: [['scheduledDate', 'ASC']],
        include: [{
          model: Permit,
          as: 'permit',
          attributes: ['permitNumber', 'type', 'propertyAddress']
        }]
      });

      res.json({
        success: true,
        summary: {
          totalAssigned,
          scheduled: scheduledCount,
          completedToday,
          pendingReports
        },
        todaysSchedule,
        upcomingInspections
      });
    } catch (error) {
      console.error('Inspector dashboard error:', error);

      res.status(500).json({
        error: 'Failed to fetch inspector dashboard',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   GET /api/dashboard/citizen
 * @desc    Get citizen dashboard with personal permits and notifications
 * @access  Private (Citizen)
 */
router.get('/citizen',
  authMiddleware,
  async (req, res) => {
    try {
      const userEmail = req.user.email;

      // Get user's permits
      const permits = await Permit.findAll({
        where: { applicantEmail: userEmail },
        order: [['createdAt', 'DESC']],
        limit: 10
      });

      // Count by status
      const permitCounts = await Permit.findAll({
        where: { applicantEmail: userEmail },
        attributes: [
          'status',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        group: ['status'],
        raw: true
      });

      // Get related inspections
      const permitIds = permits.map(p => p.id);
      const inspections = permitIds.length > 0
        ? await Inspection.findAll({
            where: { permitId: { [Op.in]: permitIds } },
            order: [['scheduledDate', 'DESC']],
            limit: 5,
            include: [{
              model: Permit,
              as: 'permit',
              attributes: ['permitNumber', 'type']
            }]
          })
        : [];

      // Get payments
      const payments = await Payment.findAll({
        where: { userId: req.user.id },
        order: [['createdAt', 'DESC']],
        limit: 5,
        include: [{
          model: Permit,
          as: 'permit',
          attributes: ['permitNumber']
        }]
      });

      // Get unread notifications
      const notifications = await Notification.findAll({
        where: {
          userId: req.user.id,
          read: false
        },
        order: [['createdAt', 'DESC']],
        limit: 5
      });

      // Calculate totals
      const totalPaid = await Payment.sum('amount', {
        where: { userId: req.user.id, status: 'completed' }
      });

      res.json({
        success: true,
        summary: {
          totalPermits: permits.length,
          activePermits: permits.filter(p =>
            ['submitted', 'under_review', 'approved'].includes(p.status)
          ).length,
          completedPayments: payments.filter(p => p.status === 'completed').length,
          totalPaid: parseFloat(totalPaid || 0),
          unreadNotifications: notifications.length
        },
        permits: {
          recent: permits,
          byStatus: permitCounts
        },
        inspections,
        payments,
        notifications
      });
    } catch (error) {
      console.error('Citizen dashboard error:', error);

      res.status(500).json({
        error: 'Failed to fetch citizen dashboard',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   GET /api/dashboard/metrics
 * @desc    Get basic metrics (public endpoint for frontend)
 * @access  Public
 */
router.get('/metrics', async (req, res) => {
  try {
    const totalPermits = await Permit.count();
    const pending = await Permit.count({ where: { status: 'submitted' } });
    const approved = await Permit.count({ where: { status: 'approved' } });

    res.json({
      activeCases: pending,
      totalPermits,
      approvedPermits: approved,
      complianceRate: totalPermits > 0
        ? ((approved / totalPermits) * 100).toFixed(1)
        : 98.5,
      // Placeholder metrics (calculate from real data in production)
      hoursSaved: Math.floor(totalPermits * 3.5), // Assume 3.5 hours saved per permit
      costSavings: Math.floor(totalPermits * 250) // Assume $250 saved per permit
    });
  } catch (error) {
    console.error('Metrics error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   GET /api/dashboard/analytics/revenue-trends
 * @desc    Get revenue trends over time for charts
 * @access  Private (Admin/Staff)
 */
router.get('/analytics/revenue-trends',
  authMiddleware,
  requireRole('admin', 'staff'),
  async (req, res) => {
    try {
      const { period = '30d' } = req.query;
      const dateRange = getDateRange(period);

      // Daily revenue aggregation
      const revenueTrends = await Payment.findAll({
        attributes: [
          [sequelize.fn('DATE', sequelize.col('paidAt')), 'date'],
          [sequelize.fn('SUM', sequelize.col('amount')), 'revenue'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'transactions']
        ],
        where: {
          status: 'completed',
          paidAt: { [Op.gte]: dateRange.start }
        },
        group: [sequelize.fn('DATE', sequelize.col('paidAt'))],
        order: [[sequelize.fn('DATE', sequelize.col('paidAt')), 'ASC']],
        raw: true
      });

      // Revenue by permit type
      const revenueByType = await Payment.findAll({
        attributes: [
          [sequelize.literal('"permit"."type"'), 'permitType'],
          [sequelize.fn('SUM', sequelize.col('Payment.amount')), 'revenue'],
          [sequelize.fn('COUNT', sequelize.col('Payment.id')), 'count']
        ],
        include: [{
          model: Permit,
          as: 'permit',
          attributes: []
        }],
        where: {
          status: 'completed',
          paidAt: { [Op.gte]: dateRange.start }
        },
        group: [sequelize.literal('"permit"."type"')],
        raw: true
      });

      // Total revenue stats
      const totalRevenue = await Payment.sum('amount', {
        where: {
          status: 'completed',
          paidAt: { [Op.gte]: dateRange.start }
        }
      });

      res.json({
        success: true,
        period,
        totalRevenue: parseFloat(totalRevenue || 0),
        trends: revenueTrends.map(r => ({
          date: r.date,
          revenue: parseFloat(r.revenue || 0),
          transactions: parseInt(r.transactions || 0)
        })),
        byType: revenueByType.map(r => ({
          permitType: r.permitType,
          revenue: parseFloat(r.revenue || 0),
          count: parseInt(r.count || 0)
        }))
      });
    } catch (error) {
      console.error('Revenue trends error:', error);

      res.status(500).json({
        error: 'Failed to fetch revenue trends',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   GET /api/dashboard/analytics/permit-timeline
 * @desc    Get permit processing timeline statistics
 * @access  Private (Admin/Staff)
 */
router.get('/analytics/permit-timeline',
  authMiddleware,
  requireRole('admin', 'staff'),
  async (req, res) => {
    try {
      const { period = '30d' } = req.query;
      const dateRange = getDateRange(period);

      // Get permits with processing times
      const permits = await Permit.findAll({
        where: {
          createdAt: { [Op.gte]: dateRange.start }
        },
        attributes: ['id', 'type', 'status', 'createdAt', 'updatedAt'],
        raw: true
      });

      // Calculate average processing time by type
      const processingTimeByType = {};
      const statusByType = {};

      permits.forEach(permit => {
        const type = permit.type || 'general';

        if (!processingTimeByType[type]) {
          processingTimeByType[type] = [];
          statusByType[type] = { submitted: 0, under_review: 0, approved: 0, rejected: 0 };
        }

        // Calculate days from creation to current status
        const daysDiff = Math.floor((new Date(permit.updatedAt) - new Date(permit.createdAt)) / (1000 * 60 * 60 * 24));
        processingTimeByType[type].push(daysDiff);

        if (statusByType[type][permit.status] !== undefined) {
          statusByType[type][permit.status]++;
        }
      });

      // Calculate averages
      const timeline = Object.keys(processingTimeByType).map(type => {
        const times = processingTimeByType[type];
        const avg = times.length > 0
          ? times.reduce((a, b) => a + b, 0) / times.length
          : 0;

        return {
          permitType: type,
          avgProcessingDays: parseFloat(avg.toFixed(1)),
          totalPermits: times.length,
          statusBreakdown: statusByType[type]
        };
      });

      res.json({
        success: true,
        period,
        timeline,
        totalPermitsAnalyzed: permits.length
      });
    } catch (error) {
      console.error('Permit timeline error:', error);

      res.status(500).json({
        error: 'Failed to fetch permit timeline',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   GET /api/dashboard/analytics/inspection-rates
 * @desc    Get inspection completion rates and statistics
 * @access  Private (Admin/Staff)
 */
router.get('/analytics/inspection-rates',
  authMiddleware,
  requireRole('admin', 'staff', 'inspector'),
  async (req, res) => {
    try {
      const { period = '30d' } = req.query;
      const dateRange = getDateRange(period);

      // Inspection completion over time
      const inspectionTrends = await Inspection.findAll({
        attributes: [
          [sequelize.fn('DATE', sequelize.col('scheduledDate')), 'date'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'total'],
          [sequelize.fn('SUM', sequelize.literal("CASE WHEN status = 'completed' THEN 1 ELSE 0 END")), 'completed'],
          [sequelize.fn('SUM', sequelize.literal("CASE WHEN result = 'passed' THEN 1 ELSE 0 END")), 'passed']
        ],
        where: {
          scheduledDate: { [Op.gte]: dateRange.start }
        },
        group: [sequelize.fn('DATE', sequelize.col('scheduledDate'))],
        order: [[sequelize.fn('DATE', sequelize.col('scheduledDate')), 'ASC']],
        raw: true
      });

      // Inspection results breakdown
      const resultBreakdown = await Inspection.findAll({
        attributes: [
          'result',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        where: {
          status: 'completed',
          completedDate: { [Op.gte]: dateRange.start }
        },
        group: ['result'],
        raw: true
      });

      // Inspector performance
      const inspectorPerformance = await Inspection.findAll({
        attributes: [
          'inspectorId',
          [sequelize.fn('COUNT', sequelize.col('Inspection.id')), 'total'],
          [sequelize.fn('SUM', sequelize.literal("CASE WHEN status = 'completed' THEN 1 ELSE 0 END")), 'completed']
        ],
        include: [{
          model: User,
          as: 'inspector',
          attributes: ['name', 'email']
        }],
        where: {
          scheduledDate: { [Op.gte]: dateRange.start }
        },
        group: ['inspectorId', 'inspector.id', 'inspector.name', 'inspector.email'],
        raw: true
      });

      res.json({
        success: true,
        period,
        trends: inspectionTrends.map(t => ({
          date: t.date,
          total: parseInt(t.total || 0),
          completed: parseInt(t.completed || 0),
          passed: parseInt(t.passed || 0),
          completionRate: t.total > 0 ? ((t.completed / t.total) * 100).toFixed(1) : 0,
          passRate: t.completed > 0 ? ((t.passed / t.completed) * 100).toFixed(1) : 0
        })),
        results: resultBreakdown,
        inspectorPerformance: inspectorPerformance.map(ip => ({
          inspectorId: ip.inspectorId,
          name: ip['inspector.name'],
          email: ip['inspector.email'],
          total: parseInt(ip.total || 0),
          completed: parseInt(ip.completed || 0),
          completionRate: ip.total > 0 ? ((ip.completed / ip.total) * 100).toFixed(1) : 0
        }))
      });
    } catch (error) {
      console.error('Inspection rates error:', error);

      res.status(500).json({
        error: 'Failed to fetch inspection rates',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   GET /api/dashboard/analytics/document-processing
 * @desc    Get document processing statistics
 * @access  Private (Admin/Staff)
 */
router.get('/analytics/document-processing',
  authMiddleware,
  requireRole('admin', 'staff'),
  async (req, res) => {
    try {
      const { period = '30d' } = req.query;
      const dateRange = getDateRange(period);

      // Document upload trends
      const uploadTrends = await Document.findAll({
        attributes: [
          [sequelize.fn('DATE', sequelize.col('createdAt')), 'date'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'uploaded'],
          [sequelize.fn('SUM', sequelize.literal("CASE WHEN processed = true THEN 1 ELSE 0 END")), 'processed']
        ],
        where: {
          createdAt: { [Op.gte]: dateRange.start }
        },
        group: [sequelize.fn('DATE', sequelize.col('createdAt'))],
        order: [[sequelize.fn('DATE', sequelize.col('createdAt')), 'ASC']],
        raw: true,
        paranoid: false
      });

      // Documents by category
      const documentsByCategory = await Document.findAll({
        attributes: [
          'category',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
          [sequelize.fn('AVG', sequelize.col('fileSize')), 'avgSize']
        ],
        where: {
          createdAt: { [Op.gte]: dateRange.start }
        },
        group: ['category'],
        raw: true,
        paranoid: false
      });

      // OCR processing stats
      const ocrStats = await Document.findAll({
        attributes: [
          [sequelize.fn('COUNT', sequelize.col('id')), 'total'],
          [sequelize.fn('SUM', sequelize.literal("CASE WHEN processed = true THEN 1 ELSE 0 END")), 'processed'],
          [sequelize.fn('SUM', sequelize.literal("CASE WHEN ocrText IS NOT NULL THEN 1 ELSE 0 END")), 'ocrCompleted']
        ],
        where: {
          createdAt: { [Op.gte]: dateRange.start }
        },
        raw: true,
        paranoid: false
      });

      const stats = ocrStats[0] || { total: 0, processed: 0, ocrCompleted: 0 };

      res.json({
        success: true,
        period,
        summary: {
          total: parseInt(stats.total || 0),
          processed: parseInt(stats.processed || 0),
          ocrCompleted: parseInt(stats.ocrCompleted || 0),
          processingRate: stats.total > 0
            ? ((stats.processed / stats.total) * 100).toFixed(1)
            : 0
        },
        trends: uploadTrends.map(t => ({
          date: t.date,
          uploaded: parseInt(t.uploaded || 0),
          processed: parseInt(t.processed || 0),
          processingRate: t.uploaded > 0
            ? ((t.processed / t.uploaded) * 100).toFixed(1)
            : 0
        })),
        byCategory: documentsByCategory.map(d => ({
          category: d.category || 'uncategorized',
          count: parseInt(d.count || 0),
          avgSize: parseFloat((d.avgSize || 0) / 1024).toFixed(2) // KB
        }))
      });
    } catch (error) {
      console.error('Document processing error:', error);

      res.status(500).json({
        error: 'Failed to fetch document processing stats',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   GET /api/dashboard/analytics/user-growth
 * @desc    Get user registration and growth trends
 * @access  Private (Admin)
 */
router.get('/analytics/user-growth',
  authMiddleware,
  requireRole('admin'),
  async (req, res) => {
    try {
      const { period = '30d' } = req.query;
      const dateRange = getDateRange(period);

      // User registration trends
      const registrationTrends = await User.findAll({
        attributes: [
          [sequelize.fn('DATE', sequelize.col('createdAt')), 'date'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'registrations'],
          'role'
        ],
        where: {
          createdAt: { [Op.gte]: dateRange.start }
        },
        group: [sequelize.fn('DATE', sequelize.col('createdAt')), 'role'],
        order: [[sequelize.fn('DATE', sequelize.col('createdAt')), 'ASC']],
        raw: true
      });

      // Group by date and aggregate roles
      const trendsByDate = {};
      registrationTrends.forEach(trend => {
        if (!trendsByDate[trend.date]) {
          trendsByDate[trend.date] = { date: trend.date, total: 0, byRole: {} };
        }
        trendsByDate[trend.date].total += parseInt(trend.registrations || 0);
        trendsByDate[trend.date].byRole[trend.role] = parseInt(trend.registrations || 0);
      });

      // User activity by status
      const usersByStatus = await User.findAll({
        attributes: [
          'status',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        group: ['status'],
        raw: true
      });

      res.json({
        success: true,
        period,
        trends: Object.values(trendsByDate),
        byStatus: usersByStatus,
        totalUsers: await User.count()
      });
    } catch (error) {
      console.error('User growth error:', error);

      res.status(500).json({
        error: 'Failed to fetch user growth data',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   GET /api/dashboard/export/permits
 * @desc    Export permits data as CSV
 * @access  Private (Admin/Staff)
 */
router.get('/export/permits',
  authMiddleware,
  requireRole('admin', 'staff'),
  async (req, res) => {
    try {
      const { period = '30d', status } = req.query;
      const dateRange = getDateRange(period);

      const where = {
        createdAt: { [Op.gte]: dateRange.start }
      };

      if (status) {
        where.status = status;
      }

      const permits = await Permit.findAll({
        where,
        order: [['createdAt', 'DESC']],
        raw: true
      });

      // Generate CSV
      const csv = generateCSV(permits, [
        'permitNumber',
        'type',
        'status',
        'applicantName',
        'applicantEmail',
        'propertyAddress',
        'description',
        'estimatedCost',
        'createdAt',
        'updatedAt'
      ]);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="permits-${period}-${Date.now()}.csv"`);
      res.send(csv);

      console.log(`📥 Permits exported: ${permits.length} records by ${req.user.email}`);
    } catch (error) {
      console.error('Export permits error:', error);

      res.status(500).json({
        error: 'Failed to export permits',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   GET /api/dashboard/export/payments
 * @desc    Export payments/revenue data as CSV
 * @access  Private (Admin/Staff)
 */
router.get('/export/payments',
  authMiddleware,
  requireRole('admin', 'staff'),
  async (req, res) => {
    try {
      const { period = '30d', status } = req.query;
      const dateRange = getDateRange(period);

      const where = {
        createdAt: { [Op.gte]: dateRange.start }
      };

      if (status) {
        where.status = status;
      }

      const payments = await Payment.findAll({
        where,
        include: [{
          model: Permit,
          as: 'permit',
          attributes: ['permitNumber', 'type']
        }],
        order: [['createdAt', 'DESC']]
      });

      // Format for CSV
      const formattedData = payments.map(p => ({
        receiptNumber: p.receiptNumber,
        permitNumber: p.permit?.permitNumber || 'N/A',
        permitType: p.permit?.type || 'N/A',
        amount: p.amount,
        status: p.status,
        paymentMethod: p.paymentMethod || 'N/A',
        transactionId: p.transactionId || 'N/A',
        paidAt: p.paidAt || 'N/A',
        createdAt: p.createdAt
      }));

      const csv = generateCSV(formattedData, [
        'receiptNumber',
        'permitNumber',
        'permitType',
        'amount',
        'status',
        'paymentMethod',
        'transactionId',
        'paidAt',
        'createdAt'
      ]);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="payments-${period}-${Date.now()}.csv"`);
      res.send(csv);

      console.log(`📥 Payments exported: ${payments.length} records by ${req.user.email}`);
    } catch (error) {
      console.error('Export payments error:', error);

      res.status(500).json({
        error: 'Failed to export payments',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   GET /api/dashboard/export/inspections
 * @desc    Export inspections data as CSV
 * @access  Private (Admin/Staff/Inspector)
 */
router.get('/export/inspections',
  authMiddleware,
  requireRole('admin', 'staff', 'inspector'),
  async (req, res) => {
    try {
      const { period = '30d', status } = req.query;
      const dateRange = getDateRange(period);

      const where = {
        scheduledDate: { [Op.gte]: dateRange.start }
      };

      if (status) {
        where.status = status;
      }

      // Inspectors can only export their own
      if (req.user.role === 'inspector') {
        where.inspectorId = req.user.id;
      }

      const inspections = await Inspection.findAll({
        where,
        include: [
          {
            model: Permit,
            as: 'permit',
            attributes: ['permitNumber', 'type', 'propertyAddress']
          },
          {
            model: User,
            as: 'inspector',
            attributes: ['name', 'email']
          }
        ],
        order: [['scheduledDate', 'DESC']]
      });

      // Format for CSV
      const formattedData = inspections.map(i => ({
        permitNumber: i.permit?.permitNumber || 'N/A',
        permitType: i.permit?.type || 'N/A',
        propertyAddress: i.permit?.propertyAddress || 'N/A',
        inspectionType: i.type,
        status: i.status,
        result: i.result || 'N/A',
        inspectorName: i.inspector?.name || 'Unassigned',
        inspectorEmail: i.inspector?.email || 'N/A',
        scheduledDate: i.scheduledDate,
        completedDate: i.completedDate || 'N/A',
        notes: i.notes || 'N/A'
      }));

      const csv = generateCSV(formattedData, [
        'permitNumber',
        'permitType',
        'propertyAddress',
        'inspectionType',
        'status',
        'result',
        'inspectorName',
        'inspectorEmail',
        'scheduledDate',
        'completedDate',
        'notes'
      ]);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="inspections-${period}-${Date.now()}.csv"`);
      res.send(csv);

      console.log(`📥 Inspections exported: ${inspections.length} records by ${req.user.email}`);
    } catch (error) {
      console.error('Export inspections error:', error);

      res.status(500).json({
        error: 'Failed to export inspections',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   GET /api/dashboard/export/users
 * @desc    Export users data as CSV
 * @access  Private (Admin)
 */
router.get('/export/users',
  authMiddleware,
  requireRole('admin'),
  async (req, res) => {
    try {
      const { role, status } = req.query;

      const where = {};

      if (role) {
        where.role = role;
      }

      if (status) {
        where.status = status;
      }

      const users = await User.findAll({
        where,
        attributes: [
          'id',
          'email',
          'name',
          'role',
          'status',
          'phone',
          'address',
          'createdAt',
          'lastLogin'
        ],
        order: [['createdAt', 'DESC']],
        raw: true
      });

      const csv = generateCSV(users, [
        'id',
        'email',
        'name',
        'role',
        'status',
        'phone',
        'address',
        'createdAt',
        'lastLogin'
      ]);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="users-${Date.now()}.csv"`);
      res.send(csv);

      console.log(`📥 Users exported: ${users.length} records by ${req.user.email}`);
    } catch (error) {
      console.error('Export users error:', error);

      res.status(500).json({
        error: 'Failed to export users',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   GET /api/dashboard/export/summary-report
 * @desc    Generate comprehensive summary report as CSV
 * @access  Private (Admin/Staff)
 */
router.get('/export/summary-report',
  authMiddleware,
  requireRole('admin', 'staff'),
  async (req, res) => {
    try {
      const { period = '30d' } = req.query;
      const dateRange = getDateRange(period);

      // Gather summary statistics
      const [
        totalPermits,
        approvedPermits,
        rejectedPermits,
        totalInspections,
        completedInspections,
        totalRevenue,
        totalUsers
      ] = await Promise.all([
        Permit.count({ where: { createdAt: { [Op.gte]: dateRange.start } } }),
        Permit.count({ where: { status: 'approved', createdAt: { [Op.gte]: dateRange.start } } }),
        Permit.count({ where: { status: 'rejected', createdAt: { [Op.gte]: dateRange.start } } }),
        Inspection.count({ where: { scheduledDate: { [Op.gte]: dateRange.start } } }),
        Inspection.count({ where: { status: 'completed', scheduledDate: { [Op.gte]: dateRange.start } } }),
        Payment.sum('amount', { where: { status: 'completed', paidAt: { [Op.gte]: dateRange.start } } }),
        User.count({ where: { createdAt: { [Op.gte]: dateRange.start } } })
      ]);

      // Create summary report data
      const reportData = [
        { metric: 'Reporting Period', value: period },
        { metric: 'Date Range', value: `${dateRange.start.toISOString().split('T')[0]} to ${dateRange.end.toISOString().split('T')[0]}` },
        { metric: '', value: '' },
        { metric: 'PERMITS', value: '' },
        { metric: 'Total Permits', value: totalPermits },
        { metric: 'Approved Permits', value: approvedPermits },
        { metric: 'Rejected Permits', value: rejectedPermits },
        { metric: 'Approval Rate', value: totalPermits > 0 ? `${((approvedPermits / totalPermits) * 100).toFixed(1)}%` : '0%' },
        { metric: '', value: '' },
        { metric: 'INSPECTIONS', value: '' },
        { metric: 'Total Inspections', value: totalInspections },
        { metric: 'Completed Inspections', value: completedInspections },
        { metric: 'Completion Rate', value: totalInspections > 0 ? `${((completedInspections / totalInspections) * 100).toFixed(1)}%` : '0%' },
        { metric: '', value: '' },
        { metric: 'REVENUE', value: '' },
        { metric: 'Total Revenue', value: `$${parseFloat(totalRevenue || 0).toFixed(2)}` },
        { metric: '', value: '' },
        { metric: 'USERS', value: '' },
        { metric: 'New Users', value: totalUsers },
        { metric: '', value: '' },
        { metric: 'Report Generated', value: new Date().toISOString() },
        { metric: 'Generated By', value: req.user.email }
      ];

      const csv = generateCSV(reportData, ['metric', 'value']);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="summary-report-${period}-${Date.now()}.csv"`);
      res.send(csv);

      console.log(`📥 Summary report exported for ${period} by ${req.user.email}`);
    } catch (error) {
      console.error('Export summary report error:', error);

      res.status(500).json({
        error: 'Failed to export summary report',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * Helper function to generate CSV from array of objects
 * @param {Array} data - Array of objects to convert to CSV
 * @param {Array} columns - Array of column names to include
 * @returns {String} CSV string
 */
function generateCSV(data, columns) {
  if (!data || data.length === 0) {
    return columns.join(',') + '\n';
  }

  // Create header row
  const header = columns.join(',');

  // Create data rows
  const rows = data.map(row => {
    return columns.map(col => {
      let value = row[col];

      // Handle null/undefined
      if (value === null || value === undefined) {
        return '';
      }

      // Convert to string and escape quotes
      value = String(value);

      // Escape quotes and wrap in quotes if contains comma, newline, or quote
      if (value.includes(',') || value.includes('\n') || value.includes('"')) {
        value = '"' + value.replace(/"/g, '""') + '"';
      }

      return value;
    }).join(',');
  });

  return header + '\n' + rows.join('\n');
}

/**
 * Helper function to get date range based on period
 */
function getDateRange(period) {
  const end = new Date();
  const start = new Date();

  switch (period) {
    case '7d':
      start.setDate(start.getDate() - 7);
      break;
    case '30d':
      start.setDate(start.getDate() - 30);
      break;
    case '90d':
      start.setDate(start.getDate() - 90);
      break;
    case '1y':
      start.setFullYear(start.getFullYear() - 1);
      break;
    default:
      start.setDate(start.getDate() - 30);
  }

  return { start, end };
}

module.exports = router;
