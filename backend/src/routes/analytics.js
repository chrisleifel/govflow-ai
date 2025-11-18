const express = require('express');
const router = express.Router();
const config = require('../config/config');
const { authMiddleware, requireRole } = require('../middleware/auth');
const analyticsService = require('../services/analyticsService');

/**
 * @route   GET /api/analytics/dashboard
 * @desc    Get comprehensive dashboard metrics
 * @access  Private (Staff/Admin/Inspector)
 */
router.get('/dashboard',
  authMiddleware,
  requireRole('staff', 'admin', 'inspector'),
  async (req, res) => {
    try {
      const { timeRange = '30d' } = req.query;

      const metrics = await analyticsService.getDashboardMetrics(timeRange);

      res.json({
        success: true,
        metrics
      });
    } catch (error) {
      console.error('Get dashboard metrics error:', error);

      res.status(500).json({
        error: 'Failed to fetch dashboard metrics',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   GET /api/analytics/permits
 * @desc    Get permit analytics
 * @access  Private (Staff/Admin/Inspector)
 */
router.get('/permits',
  authMiddleware,
  requireRole('staff', 'admin', 'inspector'),
  async (req, res) => {
    try {
      const { timeRange = '30d' } = req.query;
      const { startDate, endDate } = analyticsService.getDateRange(timeRange);

      const permitMetrics = await analyticsService.getPermitMetrics(startDate, endDate);

      res.json({
        success: true,
        timeRange,
        startDate,
        endDate,
        metrics: permitMetrics
      });
    } catch (error) {
      console.error('Get permit analytics error:', error);

      res.status(500).json({
        error: 'Failed to fetch permit analytics',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   GET /api/analytics/workflows
 * @desc    Get workflow analytics
 * @access  Private (Staff/Admin)
 */
router.get('/workflows',
  authMiddleware,
  requireRole('staff', 'admin'),
  async (req, res) => {
    try {
      const { timeRange = '30d' } = req.query;
      const { startDate, endDate } = analyticsService.getDateRange(timeRange);

      const workflowMetrics = await analyticsService.getWorkflowMetrics(startDate, endDate);

      res.json({
        success: true,
        timeRange,
        startDate,
        endDate,
        metrics: workflowMetrics
      });
    } catch (error) {
      console.error('Get workflow analytics error:', error);

      res.status(500).json({
        error: 'Failed to fetch workflow analytics',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   GET /api/analytics/tasks
 * @desc    Get task analytics
 * @access  Private (Staff/Admin/Inspector)
 */
router.get('/tasks',
  authMiddleware,
  requireRole('staff', 'admin', 'inspector'),
  async (req, res) => {
    try {
      const { timeRange = '30d' } = req.query;
      const { startDate, endDate } = analyticsService.getDateRange(timeRange);

      const taskMetrics = await analyticsService.getTaskMetrics(startDate, endDate);

      res.json({
        success: true,
        timeRange,
        startDate,
        endDate,
        metrics: taskMetrics
      });
    } catch (error) {
      console.error('Get task analytics error:', error);

      res.status(500).json({
        error: 'Failed to fetch task analytics',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   GET /api/analytics/workflow-performance
 * @desc    Get workflow performance analytics
 * @access  Private (Admin)
 */
router.get('/workflow-performance',
  authMiddleware,
  requireRole('admin'),
  async (req, res) => {
    try {
      const { workflowId, timeRange = '30d' } = req.query;

      const performanceData = await analyticsService.getWorkflowPerformance(workflowId, timeRange);

      res.json({
        success: true,
        timeRange,
        performanceData
      });
    } catch (error) {
      console.error('Get workflow performance error:', error);

      res.status(500).json({
        error: 'Failed to fetch workflow performance',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   GET /api/analytics/staff-productivity
 * @desc    Get staff productivity report
 * @access  Private (Admin)
 */
router.get('/staff-productivity',
  authMiddleware,
  requireRole('admin'),
  async (req, res) => {
    try {
      const { timeRange = '30d' } = req.query;

      const productivityData = await analyticsService.getStaffProductivity(timeRange);

      res.json({
        success: true,
        timeRange,
        productivityData
      });
    } catch (error) {
      console.error('Get staff productivity error:', error);

      res.status(500).json({
        error: 'Failed to fetch staff productivity',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   GET /api/analytics/export/:dataType
 * @desc    Export data to CSV
 * @access  Private (Admin)
 */
router.get('/export/:dataType',
  authMiddleware,
  requireRole('admin'),
  async (req, res) => {
    try {
      const { dataType } = req.params;
      const { timeRange = '30d' } = req.query;

      const csv = await analyticsService.exportToCSV(dataType, timeRange);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${dataType}-export-${Date.now()}.csv"`);
      res.send(csv);
    } catch (error) {
      console.error('Export data error:', error);

      res.status(500).json({
        error: 'Failed to export data',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

module.exports = router;
