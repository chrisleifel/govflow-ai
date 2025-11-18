const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const config = require('../config/config');
const { Workflow, WorkflowStep, WorkflowExecution, Task, Permit, User } = require('../models');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { auditSensitiveOperation } = require('../middleware/auditLog');
const workflowService = require('../services/workflowService');

/**
 * @route   GET /api/workflows
 * @desc    Get all workflows
 * @access  Private (Staff/Admin)
 */
router.get('/',
  authMiddleware,
  requireRole('staff', 'admin'),
  async (req, res) => {
    try {
      const { status, permitType } = req.query;

      const where = {};

      if (status) {
        where.status = status;
      }

      if (permitType) {
        where.triggerConditions = { permitType };
      }

      const workflows = await Workflow.findAll({
        where,
        include: [{
          model: WorkflowStep,
          as: 'steps'
        }],
        order: [
          ['createdAt', 'DESC'],
          [{ model: WorkflowStep, as: 'steps' }, 'order', 'ASC']
        ]
      });

      res.json({
        success: true,
        workflows
      });
    } catch (error) {
      console.error('Get workflows error:', error);

      res.status(500).json({
        error: 'Failed to fetch workflows',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   GET /api/workflows/:id
 * @desc    Get single workflow with steps
 * @access  Private (Staff/Admin)
 */
router.get('/:id',
  authMiddleware,
  requireRole('staff', 'admin'),
  async (req, res) => {
    try {
      const workflow = await Workflow.findByPk(req.params.id, {
        include: [{
          model: WorkflowStep,
          as: 'steps',
          order: [['order', 'ASC']]
        }]
      });

      if (!workflow) {
        return res.status(404).json({
          error: 'Workflow not found'
        });
      }

      res.json({
        success: true,
        workflow
      });
    } catch (error) {
      console.error('Get workflow error:', error);

      res.status(500).json({
        error: 'Failed to fetch workflow',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   POST /api/workflows
 * @desc    Create a new workflow
 * @access  Private (Admin)
 */
router.post('/',
  authMiddleware,
  requireRole('admin'),
  auditSensitiveOperation('CREATE_WORKFLOW'),
  async (req, res) => {
    try {
      const { name, description, permitType, trigger, steps } = req.body;

      if (!name || !permitType) {
        return res.status(400).json({
          error: 'Name and permit type are required'
        });
      }

      // Create workflow
      const workflow = await Workflow.create({
        name,
        description,
        permitType,
        trigger: trigger || 'permit_submitted',
        active: true
      });

      // Create workflow steps if provided
      if (steps && Array.isArray(steps)) {
        for (let i = 0; i < steps.length; i++) {
          await WorkflowStep.create({
            workflowId: workflow.id,
            name: steps[i].name,
            type: steps[i].type,
            order: i,
            config: steps[i].config || {},
            conditions: steps[i].conditions || null
          });
        }
      }

      // Reload with steps
      const created = await Workflow.findByPk(workflow.id, {
        include: [{
          model: WorkflowStep,
          as: 'steps',
          order: [['order', 'ASC']]
        }]
      });

      console.log(`✅ Workflow created: ${workflow.name} by ${req.user.email}`);

      res.status(201).json({
        success: true,
        message: 'Workflow created successfully',
        workflow: created
      });
    } catch (error) {
      console.error('Create workflow error:', error);

      res.status(500).json({
        error: 'Failed to create workflow',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   PUT /api/workflows/:id
 * @desc    Update a workflow
 * @access  Private (Admin)
 */
router.put('/:id',
  authMiddleware,
  requireRole('admin'),
  auditSensitiveOperation('UPDATE_WORKFLOW'),
  async (req, res) => {
    try {
      const workflow = await Workflow.findByPk(req.params.id);

      if (!workflow) {
        return res.status(404).json({
          error: 'Workflow not found'
        });
      }

      const { name, description, permitType, trigger, active } = req.body;

      await workflow.update({
        name: name !== undefined ? name : workflow.name,
        description: description !== undefined ? description : workflow.description,
        permitType: permitType !== undefined ? permitType : workflow.permitType,
        trigger: trigger !== undefined ? trigger : workflow.trigger,
        active: active !== undefined ? active : workflow.active
      });

      console.log(`✅ Workflow updated: ${workflow.id} by ${req.user.email}`);

      res.json({
        success: true,
        message: 'Workflow updated successfully',
        workflow
      });
    } catch (error) {
      console.error('Update workflow error:', error);

      res.status(500).json({
        error: 'Failed to update workflow',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   DELETE /api/workflows/:id
 * @desc    Delete a workflow (soft delete)
 * @access  Private (Admin)
 */
router.delete('/:id',
  authMiddleware,
  requireRole('admin'),
  auditSensitiveOperation('DELETE_WORKFLOW'),
  async (req, res) => {
    try {
      const workflow = await Workflow.findByPk(req.params.id);

      if (!workflow) {
        return res.status(404).json({
          error: 'Workflow not found'
        });
      }

      // Soft delete
      await workflow.destroy();

      console.log(`✅ Workflow deleted: ${workflow.id} by ${req.user.email}`);

      res.json({
        success: true,
        message: 'Workflow deleted successfully'
      });
    } catch (error) {
      console.error('Delete workflow error:', error);

      res.status(500).json({
        error: 'Failed to delete workflow',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   POST /api/workflows/:id/steps
 * @desc    Add a step to a workflow
 * @access  Private (Admin)
 */
router.post('/:id/steps',
  authMiddleware,
  requireRole('admin'),
  async (req, res) => {
    try {
      const workflow = await Workflow.findByPk(req.params.id);

      if (!workflow) {
        return res.status(404).json({
          error: 'Workflow not found'
        });
      }

      const { name, type, config, conditions, order } = req.body;

      if (!name || !type) {
        return res.status(400).json({
          error: 'Name and type are required'
        });
      }

      // Get current max order
      const maxOrder = await WorkflowStep.max('order', {
        where: { workflowId: workflow.id }
      }) || -1;

      const step = await WorkflowStep.create({
        workflowId: workflow.id,
        name,
        type,
        order: order !== undefined ? order : maxOrder + 1,
        config: config || {},
        conditions: conditions || null
      });

      console.log(`✅ Workflow step added: ${step.name} to workflow ${workflow.id}`);

      res.status(201).json({
        success: true,
        message: 'Workflow step added successfully',
        step
      });
    } catch (error) {
      console.error('Add workflow step error:', error);

      res.status(500).json({
        error: 'Failed to add workflow step',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   PUT /api/workflows/:workflowId/steps/:stepId
 * @desc    Update a workflow step
 * @access  Private (Admin)
 */
router.put('/:workflowId/steps/:stepId',
  authMiddleware,
  requireRole('admin'),
  async (req, res) => {
    try {
      const step = await WorkflowStep.findOne({
        where: {
          id: req.params.stepId,
          workflowId: req.params.workflowId
        }
      });

      if (!step) {
        return res.status(404).json({
          error: 'Workflow step not found'
        });
      }

      const { name, type, config, conditions, order } = req.body;

      await step.update({
        name: name !== undefined ? name : step.name,
        type: type !== undefined ? type : step.type,
        config: config !== undefined ? config : step.config,
        conditions: conditions !== undefined ? conditions : step.conditions,
        order: order !== undefined ? order : step.order
      });

      console.log(`✅ Workflow step updated: ${step.id}`);

      res.json({
        success: true,
        message: 'Workflow step updated successfully',
        step
      });
    } catch (error) {
      console.error('Update workflow step error:', error);

      res.status(500).json({
        error: 'Failed to update workflow step',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   DELETE /api/workflows/:workflowId/steps/:stepId
 * @desc    Delete a workflow step
 * @access  Private (Admin)
 */
router.delete('/:workflowId/steps/:stepId',
  authMiddleware,
  requireRole('admin'),
  async (req, res) => {
    try {
      const step = await WorkflowStep.findOne({
        where: {
          id: req.params.stepId,
          workflowId: req.params.workflowId
        }
      });

      if (!step) {
        return res.status(404).json({
          error: 'Workflow step not found'
        });
      }

      await step.destroy();

      console.log(`✅ Workflow step deleted: ${step.id}`);

      res.json({
        success: true,
        message: 'Workflow step deleted successfully'
      });
    } catch (error) {
      console.error('Delete workflow step error:', error);

      res.status(500).json({
        error: 'Failed to delete workflow step',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   GET /api/workflows/executions
 * @desc    Get workflow executions
 * @access  Private (Staff/Admin)
 */
router.get('/executions/list',
  authMiddleware,
  requireRole('staff', 'admin'),
  async (req, res) => {
    try {
      const { status, permitId, page = 1, limit = 10 } = req.query;
      const offset = (page - 1) * limit;

      const where = {};

      if (status) {
        where.status = status;
      }

      if (permitId) {
        where.permitId = permitId;
      }

      const { count, rows: executions } = await WorkflowExecution.findAndCountAll({
        where,
        include: [
          {
            model: Workflow,
            as: 'workflow',
            attributes: ['id', 'name', 'permitType']
          },
          {
            model: Permit,
            as: 'permit',
            attributes: ['id', 'permitNumber', 'type', 'status']
          }
        ],
        order: [['createdAt', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      res.json({
        success: true,
        executions,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit)
        }
      });
    } catch (error) {
      console.error('Get workflow executions error:', error);

      res.status(500).json({
        error: 'Failed to fetch workflow executions',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   GET /api/workflows/executions/:id
 * @desc    Get single workflow execution with full details
 * @access  Private (Staff/Admin)
 */
router.get('/executions/:id',
  authMiddleware,
  requireRole('staff', 'admin'),
  async (req, res) => {
    try {
      const execution = await WorkflowExecution.findByPk(req.params.id, {
        include: [
          {
            model: Workflow,
            as: 'workflow',
            include: [{
              model: WorkflowStep,
              as: 'steps',
              order: [['order', 'ASC']]
            }]
          },
          {
            model: Permit,
            as: 'permit'
          }
        ]
      });

      if (!execution) {
        return res.status(404).json({
          error: 'Workflow execution not found'
        });
      }

      res.json({
        success: true,
        execution
      });
    } catch (error) {
      console.error('Get workflow execution error:', error);

      res.status(500).json({
        error: 'Failed to fetch workflow execution',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   POST /api/workflows/executions/:id/resume
 * @desc    Resume a paused workflow execution
 * @access  Private (Staff/Admin)
 */
router.post('/executions/:id/resume',
  authMiddleware,
  requireRole('staff', 'admin'),
  auditSensitiveOperation('RESUME_WORKFLOW'),
  async (req, res) => {
    try {
      const execution = await workflowService.resumeWorkflow(req.params.id);

      console.log(`▶️  Workflow resumed: ${req.params.id} by ${req.user.email}`);

      res.json({
        success: true,
        message: 'Workflow resumed successfully',
        execution
      });
    } catch (error) {
      console.error('Resume workflow error:', error);

      res.status(500).json({
        error: 'Failed to resume workflow',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   POST /api/workflows/executions/:id/cancel
 * @desc    Cancel a workflow execution
 * @access  Private (Staff/Admin)
 */
router.post('/executions/:id/cancel',
  authMiddleware,
  requireRole('staff', 'admin'),
  auditSensitiveOperation('CANCEL_WORKFLOW'),
  async (req, res) => {
    try {
      const { reason } = req.body;

      const execution = await workflowService.cancelWorkflow(
        req.params.id,
        reason || `Cancelled by ${req.user.email}`
      );

      console.log(`❌ Workflow cancelled: ${req.params.id} by ${req.user.email}`);

      res.json({
        success: true,
        message: 'Workflow cancelled successfully',
        execution
      });
    } catch (error) {
      console.error('Cancel workflow error:', error);

      res.status(500).json({
        error: 'Failed to cancel workflow',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   GET /api/workflows/tasks
 * @desc    Get tasks (from workflow executions)
 * @access  Private
 */
router.get('/tasks',
  authMiddleware,
  async (req, res) => {
    try {
      const { status, page = 1, limit = 10 } = req.query;
      const offset = (page - 1) * limit;

      const where = {};

      // Filter by assignment
      if (req.user.role === 'staff' || req.user.role === 'inspector') {
        where.assignedTo = req.user.id;
      }

      if (status) {
        where.status = status;
      }

      const { count, rows: tasks } = await Task.findAndCountAll({
        where,
        include: [
          {
            model: Permit,
            as: 'permit',
            attributes: ['id', 'permitNumber', 'type', 'applicantName']
          },
          {
            model: User,
            as: 'assignee',
            attributes: ['id', 'name', 'email']
          },
          {
            model: WorkflowExecution,
            as: 'workflowExecution',
            attributes: ['id', 'status']
          }
        ],
        order: [['createdAt', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      res.json({
        success: true,
        tasks,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit)
        }
      });
    } catch (error) {
      console.error('Get tasks error:', error);

      res.status(500).json({
        error: 'Failed to fetch tasks',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   PATCH /api/workflows/tasks/:id/complete
 * @desc    Complete a task and resume workflow
 * @access  Private
 */
router.patch('/tasks/:id/complete',
  authMiddleware,
  async (req, res) => {
    try {
      const task = await Task.findByPk(req.params.id);

      if (!task) {
        return res.status(404).json({
          error: 'Task not found'
        });
      }

      // Check if user is assigned or is admin/staff
      if (task.assignedTo !== req.user.id && !['admin', 'staff'].includes(req.user.role)) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You can only complete tasks assigned to you'
        });
      }

      const { result, notes } = req.body;

      await task.update({
        status: 'completed',
        result: result || 'completed',
        completedBy: req.user.id,
        completedAt: new Date(),
        notes: notes || task.notes
      });

      console.log(`✅ Task completed: ${task.id} by ${req.user.email}`);

      // Resume workflow if task has execution
      if (task.workflowExecutionId) {
        try {
          await workflowService.resumeWorkflow(task.workflowExecutionId);
        } catch (error) {
          console.error('Error resuming workflow after task completion:', error);
        }
      }

      res.json({
        success: true,
        message: 'Task completed successfully',
        task
      });
    } catch (error) {
      console.error('Complete task error:', error);

      res.status(500).json({
        error: 'Failed to complete task',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

module.exports = router;
