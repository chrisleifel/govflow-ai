/**
 * Analytics Service
 * Provides comprehensive analytics and reporting capabilities
 */

const { Op } = require('sequelize');
const {
  Permit,
  Workflow,
  WorkflowExecution,
  Task,
  User,
  Notification,
  Inspection,
  Payment,
  sequelize
} = require('../models');

class AnalyticsService {
  /**
   * Get comprehensive dashboard metrics
   */
  async getDashboardMetrics(timeRange = '30d') {
    const { startDate, endDate } = this.getDateRange(timeRange);

    const [
      permitMetrics,
      workflowMetrics,
      taskMetrics,
      performanceMetrics,
      userMetrics
    ] = await Promise.all([
      this.getPermitMetrics(startDate, endDate),
      this.getWorkflowMetrics(startDate, endDate),
      this.getTaskMetrics(startDate, endDate),
      this.getPerformanceMetrics(startDate, endDate),
      this.getUserMetrics(startDate, endDate)
    ]);

    return {
      timeRange,
      startDate,
      endDate,
      permits: permitMetrics,
      workflows: workflowMetrics,
      tasks: taskMetrics,
      performance: performanceMetrics,
      users: userMetrics,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Get permit-specific metrics
   */
  async getPermitMetrics(startDate, endDate) {
    // Total permits in period
    const totalPermits = await Permit.count({
      where: {
        createdAt: { [Op.between]: [startDate, endDate] }
      }
    });

    // Permits by status
    const permitsByStatus = await Permit.findAll({
      where: {
        createdAt: { [Op.between]: [startDate, endDate] }
      },
      attributes: [
        'status',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['status'],
      raw: true
    });

    // Permits by type
    const permitsByType = await Permit.findAll({
      where: {
        createdAt: { [Op.between]: [startDate, endDate] }
      },
      attributes: [
        'type',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['type'],
      order: [[sequelize.fn('COUNT', sequelize.col('id')), 'DESC']],
      raw: true
    });

    // Average processing time (submitted to approved/rejected)
    const processingTimes = await Permit.findAll({
      where: {
        createdAt: { [Op.between]: [startDate, endDate] },
        status: { [Op.in]: ['approved', 'rejected'] }
      },
      attributes: [
        [sequelize.fn('AVG',
          sequelize.literal('EXTRACT(EPOCH FROM ("updatedAt" - "createdAt"))')
        ), 'avg_seconds']
      ],
      raw: true
    });

    const avgProcessingDays = processingTimes[0]?.avg_seconds
      ? Math.round(processingTimes[0].avg_seconds / 86400)
      : 0;

    // Approval rate
    const approvedCount = await Permit.count({
      where: {
        createdAt: { [Op.between]: [startDate, endDate] },
        status: 'approved'
      }
    });

    const completedCount = await Permit.count({
      where: {
        createdAt: { [Op.between]: [startDate, endDate] },
        status: { [Op.in]: ['approved', 'rejected'] }
      }
    });

    const approvalRate = completedCount > 0
      ? Math.round((approvedCount / completedCount) * 100)
      : 0;

    // Daily trend
    const dailyTrend = await Permit.findAll({
      where: {
        createdAt: { [Op.between]: [startDate, endDate] }
      },
      attributes: [
        [sequelize.fn('DATE', sequelize.col('createdAt')), 'date'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: [sequelize.fn('DATE', sequelize.col('createdAt'))],
      order: [[sequelize.fn('DATE', sequelize.col('createdAt')), 'ASC']],
      raw: true
    });

    return {
      total: totalPermits,
      byStatus: permitsByStatus.reduce((acc, item) => {
        acc[item.status] = parseInt(item.count);
        return acc;
      }, {}),
      byType: permitsByType.map(item => ({
        type: item.type,
        count: parseInt(item.count)
      })),
      avgProcessingDays,
      approvalRate,
      dailyTrend: dailyTrend.map(item => ({
        date: item.date,
        count: parseInt(item.count)
      }))
    };
  }

  /**
   * Get workflow-specific metrics
   */
  async getWorkflowMetrics(startDate, endDate) {
    // Total executions
    const totalExecutions = await WorkflowExecution.count({
      where: {
        createdAt: { [Op.between]: [startDate, endDate] }
      }
    });

    // Executions by status
    const executionsByStatus = await WorkflowExecution.findAll({
      where: {
        createdAt: { [Op.between]: [startDate, endDate] }
      },
      attributes: [
        'status',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['status'],
      raw: true
    });

    // Success rate
    const completedCount = await WorkflowExecution.count({
      where: {
        createdAt: { [Op.between]: [startDate, endDate] },
        status: 'completed'
      }
    });

    const failedCount = await WorkflowExecution.count({
      where: {
        createdAt: { [Op.between]: [startDate, endDate] },
        status: 'failed'
      }
    });

    const successRate = (completedCount + failedCount) > 0
      ? Math.round((completedCount / (completedCount + failedCount)) * 100)
      : 0;

    // Average execution time
    const executionTimes = await WorkflowExecution.findAll({
      where: {
        createdAt: { [Op.between]: [startDate, endDate] },
        status: 'completed',
        completedAt: { [Op.ne]: null }
      },
      attributes: [
        [sequelize.fn('AVG',
          sequelize.literal('EXTRACT(EPOCH FROM ("completedAt" - "startedAt"))')
        ), 'avg_seconds']
      ],
      raw: true
    });

    const avgExecutionMinutes = executionTimes[0]?.avg_seconds
      ? Math.round(executionTimes[0].avg_seconds / 60)
      : 0;

    // Top workflows by execution count
    const topWorkflows = await WorkflowExecution.findAll({
      where: {
        createdAt: { [Op.between]: [startDate, endDate] }
      },
      attributes: [
        'workflowId',
        [sequelize.fn('COUNT', sequelize.col('WorkflowExecution.id')), 'executionCount']
      ],
      include: [{
        model: Workflow,
        as: 'workflow',
        attributes: ['name', 'type']
      }],
      group: ['workflowId', 'workflow.id'],
      order: [[sequelize.fn('COUNT', sequelize.col('WorkflowExecution.id')), 'DESC']],
      limit: 5,
      raw: true,
      nest: true
    });

    return {
      totalExecutions,
      byStatus: executionsByStatus.reduce((acc, item) => {
        acc[item.status] = parseInt(item.count);
        return acc;
      }, {}),
      successRate,
      avgExecutionMinutes,
      topWorkflows: topWorkflows.map(item => ({
        workflowId: item.workflowId,
        name: item.workflow.name,
        type: item.workflow.type,
        executionCount: parseInt(item.executionCount)
      }))
    };
  }

  /**
   * Get task-specific metrics
   */
  async getTaskMetrics(startDate, endDate) {
    // Total tasks
    const totalTasks = await Task.count({
      where: {
        createdAt: { [Op.between]: [startDate, endDate] }
      }
    });

    // Tasks by status
    const tasksByStatus = await Task.findAll({
      where: {
        createdAt: { [Op.between]: [startDate, endDate] }
      },
      attributes: [
        'status',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['status'],
      raw: true
    });

    // Tasks by priority
    const tasksByPriority = await Task.findAll({
      where: {
        createdAt: { [Op.between]: [startDate, endDate] }
      },
      attributes: [
        'priority',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['priority'],
      raw: true
    });

    // Average completion time
    const completionTimes = await Task.findAll({
      where: {
        createdAt: { [Op.between]: [startDate, endDate] },
        status: 'completed',
        completedAt: { [Op.ne]: null }
      },
      attributes: [
        [sequelize.fn('AVG',
          sequelize.literal('EXTRACT(EPOCH FROM ("completedAt" - "createdAt"))')
        ), 'avg_seconds']
      ],
      raw: true
    });

    const avgCompletionHours = completionTimes[0]?.avg_seconds
      ? Math.round(completionTimes[0].avg_seconds / 3600)
      : 0;

    // Completion rate
    const completedTasks = await Task.count({
      where: {
        createdAt: { [Op.between]: [startDate, endDate] },
        status: 'completed'
      }
    });

    const completionRate = totalTasks > 0
      ? Math.round((completedTasks / totalTasks) * 100)
      : 0;

    return {
      total: totalTasks,
      byStatus: tasksByStatus.reduce((acc, item) => {
        acc[item.status] = parseInt(item.count);
        return acc;
      }, {}),
      byPriority: tasksByPriority.reduce((acc, item) => {
        acc[item.priority || 'medium'] = parseInt(item.count);
        return acc;
      }, {}),
      avgCompletionHours,
      completionRate
    };
  }

  /**
   * Get performance metrics
   */
  async getPerformanceMetrics(startDate, endDate) {
    // System uptime metrics
    const inspectionCount = await Inspection.count({
      where: {
        createdAt: { [Op.between]: [startDate, endDate] }
      }
    });

    const paymentCount = await Payment.count({
      where: {
        createdAt: { [Op.between]: [startDate, endDate] }
      }
    });

    const notificationCount = await Notification.count({
      where: {
        createdAt: { [Op.between]: [startDate, endDate] }
      }
    });

    // Automation efficiency (% of permits processed automatically)
    const totalPermits = await Permit.count({
      where: {
        createdAt: { [Op.between]: [startDate, endDate] }
      }
    });

    const automatedPermits = await WorkflowExecution.count({
      where: {
        createdAt: { [Op.between]: [startDate, endDate] },
        status: 'completed'
      }
    });

    const automationRate = totalPermits > 0
      ? Math.round((automatedPermits / totalPermits) * 100)
      : 0;

    return {
      inspections: inspectionCount,
      payments: paymentCount,
      notifications: notificationCount,
      automationRate
    };
  }

  /**
   * Get user/staff metrics
   */
  async getUserMetrics(startDate, endDate) {
    // Active users
    const activeUsers = await User.count({
      where: {
        lastLoginAt: { [Op.between]: [startDate, endDate] }
      }
    });

    // Users by role
    const usersByRole = await User.findAll({
      attributes: [
        'role',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['role'],
      raw: true
    });

    // Staff productivity (tasks completed per staff member)
    const staffProductivity = await Task.findAll({
      where: {
        createdAt: { [Op.between]: [startDate, endDate] },
        status: 'completed',
        completedBy: { [Op.ne]: null }
      },
      attributes: [
        'completedBy',
        [sequelize.fn('COUNT', sequelize.col('id')), 'tasksCompleted']
      ],
      group: ['completedBy'],
      order: [[sequelize.fn('COUNT', sequelize.col('id')), 'DESC']],
      limit: 10,
      raw: true
    });

    return {
      activeUsers,
      byRole: usersByRole.reduce((acc, item) => {
        acc[item.role] = parseInt(item.count);
        return acc;
      }, {}),
      staffProductivity: staffProductivity.map(item => ({
        userId: item.completedBy,
        tasksCompleted: parseInt(item.tasksCompleted)
      }))
    };
  }

  /**
   * Get workflow performance analytics
   */
  async getWorkflowPerformance(workflowId = null, timeRange = '30d') {
    const { startDate, endDate } = this.getDateRange(timeRange);

    const where = {
      createdAt: { [Op.between]: [startDate, endDate] }
    };

    if (workflowId) {
      where.workflowId = workflowId;
    }

    const executions = await WorkflowExecution.findAll({
      where,
      include: [{
        model: Workflow,
        as: 'workflow',
        attributes: ['name', 'type']
      }],
      order: [['createdAt', 'DESC']]
    });

    // Calculate metrics per workflow
    const workflowStats = {};

    executions.forEach(exec => {
      const wfId = exec.workflowId;
      if (!workflowStats[wfId]) {
        workflowStats[wfId] = {
          workflowId: wfId,
          name: exec.workflow.name,
          type: exec.workflow.type,
          totalExecutions: 0,
          completed: 0,
          failed: 0,
          cancelled: 0,
          pending: 0,
          inProgress: 0,
          totalDuration: 0,
          durations: []
        };
      }

      workflowStats[wfId].totalExecutions++;
      workflowStats[wfId][exec.status]++;

      if (exec.status === 'completed' && exec.actualDuration) {
        workflowStats[wfId].totalDuration += exec.actualDuration;
        workflowStats[wfId].durations.push(exec.actualDuration);
      }
    });

    // Calculate final metrics
    const performanceData = Object.values(workflowStats).map(stats => {
      const successRate = (stats.completed + stats.failed) > 0
        ? Math.round((stats.completed / (stats.completed + stats.failed)) * 100)
        : 0;

      const avgDuration = stats.durations.length > 0
        ? Math.round(stats.totalDuration / stats.durations.length)
        : 0;

      const minDuration = stats.durations.length > 0
        ? Math.min(...stats.durations)
        : 0;

      const maxDuration = stats.durations.length > 0
        ? Math.max(...stats.durations)
        : 0;

      return {
        workflowId: stats.workflowId,
        name: stats.name,
        type: stats.type,
        totalExecutions: stats.totalExecutions,
        completed: stats.completed,
        failed: stats.failed,
        cancelled: stats.cancelled,
        pending: stats.pending,
        inProgress: stats.inProgress,
        successRate,
        avgDuration,
        minDuration,
        maxDuration
      };
    });

    return performanceData;
  }

  /**
   * Get staff productivity report
   */
  async getStaffProductivity(timeRange = '30d') {
    const { startDate, endDate } = this.getDateRange(timeRange);

    const staffMembers = await User.findAll({
      where: {
        role: { [Op.in]: ['staff', 'inspector', 'admin'] }
      }
    });

    const productivityData = await Promise.all(
      staffMembers.map(async (staff) => {
        const tasksCompleted = await Task.count({
          where: {
            completedBy: staff.id,
            completedAt: { [Op.between]: [startDate, endDate] }
          }
        });

        const tasksAssigned = await Task.count({
          where: {
            assignedTo: staff.id,
            createdAt: { [Op.between]: [startDate, endDate] }
          }
        });

        const avgCompletionTime = await Task.findAll({
          where: {
            completedBy: staff.id,
            completedAt: { [Op.between]: [startDate, endDate] },
            status: 'completed'
          },
          attributes: [
            [sequelize.fn('AVG',
              sequelize.literal('EXTRACT(EPOCH FROM ("completedAt" - "createdAt"))')
            ), 'avg_seconds']
          ],
          raw: true
        });

        const avgHours = avgCompletionTime[0]?.avg_seconds
          ? Math.round(avgCompletionTime[0].avg_seconds / 3600)
          : 0;

        return {
          userId: staff.id,
          name: staff.name,
          email: staff.email,
          role: staff.role,
          tasksCompleted,
          tasksAssigned,
          completionRate: tasksAssigned > 0
            ? Math.round((tasksCompleted / tasksAssigned) * 100)
            : 0,
          avgCompletionHours: avgHours
        };
      })
    );

    return productivityData.sort((a, b) => b.tasksCompleted - a.tasksCompleted);
  }

  /**
   * Export data to CSV format
   */
  async exportToCSV(dataType, timeRange = '30d') {
    const { startDate, endDate } = this.getDateRange(timeRange);

    let data, headers;

    switch (dataType) {
      case 'permits':
        data = await Permit.findAll({
          where: {
            createdAt: { [Op.between]: [startDate, endDate] }
          },
          order: [['createdAt', 'DESC']]
        });
        headers = ['permitNumber', 'type', 'status', 'applicantName', 'applicantEmail', 'propertyAddress', 'estimatedCost', 'createdAt'];
        break;

      case 'workflows':
        data = await WorkflowExecution.findAll({
          where: {
            createdAt: { [Op.between]: [startDate, endDate] }
          },
          include: [
            { model: Workflow, as: 'workflow', attributes: ['name'] },
            { model: Permit, as: 'permit', attributes: ['permitNumber'] }
          ],
          order: [['createdAt', 'DESC']]
        });
        headers = ['id', 'workflow.name', 'permit.permitNumber', 'status', 'startedAt', 'completedAt', 'actualDuration'];
        break;

      case 'tasks':
        data = await Task.findAll({
          where: {
            createdAt: { [Op.between]: [startDate, endDate] }
          },
          include: [
            { model: User, as: 'assignedToUser', attributes: ['name'] },
            { model: Permit, as: 'Permit', attributes: ['permitNumber'] }
          ],
          order: [['createdAt', 'DESC']]
        });
        headers = ['id', 'title', 'type', 'status', 'priority', 'assignedToUser.name', 'Permit.permitNumber', 'createdAt', 'completedAt'];
        break;

      default:
        throw new Error('Invalid data type for export');
    }

    return this.convertToCSV(data, headers);
  }

  /**
   * Helper: Convert data to CSV format
   */
  convertToCSV(data, headers) {
    const rows = data.map(item => {
      const obj = item.toJSON ? item.toJSON() : item;
      return headers.map(header => {
        const keys = header.split('.');
        let value = obj;
        for (const key of keys) {
          value = value?.[key];
        }
        // Escape quotes and wrap in quotes if contains comma
        const stringValue = value !== null && value !== undefined ? String(value) : '';
        return stringValue.includes(',') ? `"${stringValue.replace(/"/g, '""')}"` : stringValue;
      }).join(',');
    });

    return [headers.join(','), ...rows].join('\n');
  }

  /**
   * Helper: Get date range based on time range string
   */
  getDateRange(timeRange) {
    const endDate = new Date();
    const startDate = new Date();

    switch (timeRange) {
      case '7d':
        startDate.setDate(endDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(endDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(endDate.getDate() - 90);
        break;
      case '1y':
        startDate.setFullYear(endDate.getFullYear() - 1);
        break;
      default:
        startDate.setDate(endDate.getDate() - 30);
    }

    return { startDate, endDate };
  }
}

module.exports = new AnalyticsService();
