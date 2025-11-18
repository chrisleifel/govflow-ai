const { Workflow, WorkflowStep, WorkflowExecution, Task, Permit, User, sequelize } = require('../models');
const { Op } = require('sequelize');
const NotificationService = require('./notificationService');
const aiService = require('./aiService');

/**
 * Workflow Execution Service
 * Handles automated permit processing through configurable workflow steps
 */
class WorkflowService {
  /**
   * Start a new workflow execution for a permit
   * @param {Object} permit - Permit instance
   * @param {String} trigger - What triggered the workflow (e.g., 'permit_submitted')
   * @returns {Object} WorkflowExecution instance
   */
  async startWorkflow(permit, trigger = 'permit_submitted') {
    try {
      console.log(`🔄 Starting workflow for permit ${permit.permitNumber}, trigger: ${trigger}`);

      // Find applicable workflow for this permit type and trigger
      const workflow = await Workflow.findOne({
        where: {
          triggerType: trigger,
          status: 'active',
          [Op.or]: [
            { triggerConditions: { permitType: permit.type } },
            { triggerConditions: null }
          ]
        },
        include: [{
          model: WorkflowStep,
          as: 'steps'
        }],
        order: [[{ model: WorkflowStep, as: 'steps' }, 'order', 'ASC']]
      });

      if (!workflow) {
        console.log(`ℹ️  No active workflow found for permit type: ${permit.type}, trigger: ${trigger}`);
        return null;
      }

      // Get the user who initiated this workflow (permit applicant)
      const applicant = await User.findOne({ where: { email: permit.applicantEmail } });
      if (!applicant) {
        throw new Error(`User not found for applicant email: ${permit.applicantEmail}`);
      }

      // Create workflow execution
      const execution = await WorkflowExecution.create({
        workflowId: workflow.id,
        permitId: permit.id,
        initiatedBy: applicant.id,
        status: 'in_progress',
        currentStepOrder: 0,
        startedAt: new Date(),
        executionData: {
          permitType: permit.type,
          permitNumber: permit.permitNumber,
          trigger
        },
        variables: {}
      });

      console.log(`✅ Workflow execution created: ${execution.id}`);

      // Start processing the first step
      await this.processNextStep(execution);

      return execution;
    } catch (error) {
      console.error('Error starting workflow:', error);
      throw error;
    }
  }

  /**
   * Process the next step in a workflow execution
   * @param {Object} execution - WorkflowExecution instance
   */
  async processNextStep(execution) {
    try {
      // Reload execution with all associations
      const exec = await WorkflowExecution.findByPk(execution.id, {
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

      if (!exec || (exec.status !== 'in_progress' && exec.status !== 'pending')) {
        console.log(`⚠️  Workflow execution ${execution.id} is not running (status: ${exec?.status})`);
        return;
      }

      const steps = exec.workflow.steps;
      const currentStepIndex = exec.currentStepOrder;

      // Check if workflow is complete
      if (currentStepIndex >= steps.length) {
        await this.completeWorkflow(exec);
        return;
      }

      const step = steps[currentStepIndex];
      console.log(`🔄 Processing step ${currentStepIndex + 1}/${steps.length}: ${step.name} (${step.stepType})`);

      // Evaluate conditions
      if (step.conditions && !this.evaluateConditions(step.conditions, exec)) {
        console.log(`⏭️  Step conditions not met, skipping: ${step.name}`);
        await exec.update({
          currentStepOrder: currentStepIndex + 1,
          stepHistory: [...(exec.stepHistory || []), {
            stepId: step.id,
            stepName: step.name,
            stepType: step.stepType,
            skipped: true,
            timestamp: new Date().toISOString()
          }]
        });
        // Process next step
        await this.processNextStep(exec);
        return;
      }

      // Execute step based on type
      const result = await this.executeStep(step, exec);

      // Update execution step history
      const updatedHistory = [...(exec.stepHistory || []), {
        stepId: step.id,
        stepName: step.name,
        stepType: step.stepType,
        result,
        timestamp: new Date().toISOString()
      }];

      // Check if step requires manual intervention
      if (step.stepType === 'manual_review' || step.stepType === 'approval') {
        await exec.update({
          status: 'pending',
          stepHistory: updatedHistory
        });
        console.log(`⏸️  Workflow paused, waiting for manual intervention: ${step.name}`);
      } else {
        // Move to next step
        await exec.update({
          currentStepOrder: currentStepIndex + 1,
          stepHistory: updatedHistory
        });
        console.log(`✅ Step completed: ${step.name}`);

        // Continue to next step
        await this.processNextStep(exec);
      }
    } catch (error) {
      console.error('Error processing workflow step:', error);

      // Mark execution as failed
      await execution.update({
        status: 'failed',
        context: {
          ...execution.context,
          error: error.message,
          failedAt: new Date().toISOString()
        }
      });
    }
  }

  /**
   * Execute a workflow step
   * @param {Object} step - WorkflowStep instance
   * @param {Object} execution - WorkflowExecution instance
   * @returns {Object} Step execution result
   */
  async executeStep(step, execution) {
    const { permit } = execution;
    const config = step.config || {};

    switch (step.stepType) {
      case 'automatic_review':
        return await this.executeAutomaticReview(permit, config);

      case 'ai_classification':
        return await this.executeAIClassification(permit, config);

      case 'document_check':
        return await this.executeDocumentCheck(permit, config);

      case 'payment_check':
        return await this.executePaymentCheck(permit, config);

      case 'notification':
        return await this.executeNotification(permit, config);

      case 'manual_review':
        return await this.executeManualReview(permit, config, execution);

      case 'approval':
        return await this.executeApproval(permit, config, execution);

      case 'inspection':
        return await this.executeInspectionSchedule(permit, config);

      case 'update_status':
        return await this.executeStatusUpdate(permit, config);

      default:
        console.warn(`⚠️  Unknown step type: ${step.stepType}`);
        return { success: false, message: 'Unknown step type' };
    }
  }

  /**
   * Execute automatic review step using AI
   */
  async executeAutomaticReview(permit, config) {
    try {
      if (!aiService.isAvailable()) {
        return { success: false, message: 'AI service not available', skipped: true };
      }

      const prompt = `Review this permit application and determine if it can be automatically approved:

Permit Type: ${permit.type}
Description: ${permit.description || 'N/A'}
Property Address: ${permit.propertyAddress}
Estimated Cost: $${permit.estimatedCost || 'N/A'}

Criteria for automatic approval:
${config.criteria || '- All required information provided\n- Cost under threshold\n- No red flags'}

Respond with JSON: { "approved": boolean, "reason": "explanation", "confidence": 0.0-1.0 }`;

      const response = await aiService.complete(prompt, { temperature: 0.3 });
      const result = JSON.parse(response.match(/\{[\s\S]*\}/)[0]);

      return {
        success: true,
        aiReview: result,
        autoApproved: result.approved && result.confidence > (config.minConfidence || 0.8)
      };
    } catch (error) {
      console.error('Automatic review error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute AI classification step
   */
  async executeAIClassification(permit, config) {
    try {
      if (!aiService.isAvailable()) {
        return { success: false, message: 'AI service not available', skipped: true };
      }

      const classification = await aiService.classifyPermit(permit.description, {
        currentType: permit.type,
        propertyAddress: permit.propertyAddress
      });

      // Update permit type if different and confidence is high
      if (classification.type !== permit.type && classification.confidence > 0.9) {
        await permit.update({
          type: classification.type,
          aiClassified: true
        });

        return {
          success: true,
          reclassified: true,
          oldType: permit.type,
          newType: classification.type,
          confidence: classification.confidence
        };
      }

      return {
        success: true,
        reclassified: false,
        confirmedType: permit.type,
        confidence: classification.confidence
      };
    } catch (error) {
      console.error('AI classification error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute document check step
   */
  async executeDocumentCheck(permit, config) {
    const { Document } = require('../models');

    const documentCount = await Document.count({
      where: { permitId: permit.id }
    });

    const requiredDocs = config.requiredDocuments || 1;
    const passed = documentCount >= requiredDocs;

    return {
      success: true,
      passed,
      documentCount,
      requiredDocuments: requiredDocs,
      message: passed ? 'Document check passed' : `Missing documents (${documentCount}/${requiredDocs})`
    };
  }

  /**
   * Execute payment check step
   */
  async executePaymentCheck(permit, config) {
    const { Payment } = require('../models');

    const completedPayment = await Payment.findOne({
      where: {
        permitId: permit.id,
        status: 'completed'
      }
    });

    return {
      success: true,
      passed: !!completedPayment,
      paymentCompleted: !!completedPayment,
      message: completedPayment ? 'Payment verified' : 'Payment not found'
    };
  }

  /**
   * Execute notification step
   */
  async executeNotification(permit, config) {
    try {
      const user = await User.findOne({ where: { email: permit.applicantEmail } });

      if (!user) {
        return { success: false, message: 'User not found' };
      }

      await NotificationService.create({
        userId: user.id,
        type: config.notificationType || 'workflow_update',
        title: config.title || 'Permit Update',
        message: config.message || `Your permit ${permit.permitNumber} has been updated.`,
        priority: config.priority || 'medium',
        relatedEntity: 'permit',
        relatedEntityId: permit.id
      });

      return { success: true, notificationSent: true };
    } catch (error) {
      console.error('Notification error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute manual review step (create task for staff)
   */
  async executeManualReview(permit, config, execution) {
    try {
      // Find available staff or use configured assignee
      let assigneeId = config.assignTo;

      if (!assigneeId) {
        const staff = await User.findOne({
          where: { role: 'staff', status: 'active' },
          order: [['createdAt', 'ASC']]
        });
        assigneeId = staff?.id;
      }

      const task = await Task.create({
        workflowExecutionId: execution.id,
        permitId: permit.id,
        assignedTo: assigneeId,
        title: config.taskTitle || `Review permit ${permit.permitNumber}`,
        description: config.taskDescription || `Manual review required for ${permit.type} permit`,
        type: 'review',
        priority: config.priority || 'medium',
        status: 'pending',
        dueDate: config.dueDays ? new Date(Date.now() + config.dueDays * 24 * 60 * 60 * 1000) : null
      });

      // Notify assigned staff
      if (assigneeId) {
        await NotificationService.create({
          userId: assigneeId,
          type: 'task_assigned',
          title: 'New Task Assigned',
          message: `You have been assigned to review permit ${permit.permitNumber}`,
          priority: 'high',
          relatedEntity: 'task',
          relatedEntityId: task.id
        });
      }

      return { success: true, taskCreated: true, taskId: task.id };
    } catch (error) {
      console.error('Manual review error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute approval step
   */
  async executeApproval(permit, config, execution) {
    // Similar to manual review, creates approval task
    return await this.executeManualReview(permit, {
      ...config,
      taskTitle: `Approve permit ${permit.permitNumber}`,
      taskDescription: `Approval required for ${permit.type} permit`,
      type: 'approval'
    }, execution);
  }

  /**
   * Execute inspection schedule step
   */
  async executeInspectionSchedule(permit, config) {
    const { Inspection } = require('../models');

    try {
      // Find available inspector
      const inspector = await User.findOne({
        where: { role: 'inspector', status: 'active' }
      });

      const scheduledDate = new Date(Date.now() + (config.daysFromNow || 7) * 24 * 60 * 60 * 1000);

      const inspection = await Inspection.create({
        permitId: permit.id,
        inspectorId: inspector?.id,
        type: config.inspectionType || 'general',
        scheduledDate,
        status: 'scheduled',
        notes: config.notes || `Scheduled via workflow automation`
      });

      return { success: true, inspectionScheduled: true, inspectionId: inspection.id };
    } catch (error) {
      console.error('Inspection schedule error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute status update step
   */
  async executeStatusUpdate(permit, config) {
    try {
      const newStatus = config.status;

      if (!newStatus) {
        return { success: false, message: 'No status specified' };
      }

      await permit.update({ status: newStatus });

      return { success: true, statusUpdated: true, newStatus };
    } catch (error) {
      console.error('Status update error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Evaluate step conditions
   */
  evaluateConditions(conditions, execution) {
    // Simple condition evaluation
    // Can be extended to support complex logic

    if (!conditions || typeof conditions !== 'object') {
      return true;
    }

    const permit = execution.permit;
    const stepHistory = execution.stepHistory || [];

    // Check permit field conditions
    if (conditions.permitType && permit && permit.type !== conditions.permitType) {
      return false;
    }

    if (conditions.minCost && permit && permit.estimatedCost < conditions.minCost) {
      return false;
    }

    if (conditions.maxCost && permit && permit.estimatedCost > conditions.maxCost) {
      return false;
    }

    // Check previous step results
    if (conditions.requireStepResult) {
      const requiredStep = stepHistory.find(s => s.stepName === conditions.requireStepResult);

      if (!requiredStep || !requiredStep.result?.success) {
        return false;
      }
    }

    return true;
  }

  /**
   * Complete a workflow execution
   */
  async completeWorkflow(execution) {
    try {
      await execution.update({
        status: 'completed',
        completedAt: new Date(),
        context: {
          ...execution.context,
          completedAt: new Date().toISOString()
        }
      });

      console.log(`✅ Workflow execution completed: ${execution.id}`);

      // Notify permit owner
      const permit = await Permit.findByPk(execution.permitId);
      const user = await User.findOne({ where: { email: permit.applicantEmail } });

      if (user) {
        await NotificationService.create({
          userId: user.id,
          type: 'workflow_completed',
          title: 'Permit Processing Complete',
          message: `Processing workflow for permit ${permit.permitNumber} has been completed.`,
          priority: 'medium',
          relatedEntity: 'permit',
          relatedEntityId: permit.id
        });
      }
    } catch (error) {
      console.error('Error completing workflow:', error);
      throw error;
    }
  }

  /**
   * Resume a paused workflow execution (after manual task completion)
   */
  async resumeWorkflow(executionId) {
    try {
      const execution = await WorkflowExecution.findByPk(executionId);

      if (!execution || execution.status !== 'waiting') {
        throw new Error('Workflow execution is not waiting');
      }

      // Update status and move to next step
      await execution.update({
        status: 'running',
        currentStepOrder: execution.currentStepOrder + 1
      });

      console.log(`▶️  Resuming workflow execution: ${executionId}`);

      // Process next step
      await this.processNextStep(execution);

      return execution;
    } catch (error) {
      console.error('Error resuming workflow:', error);
      throw error;
    }
  }

  /**
   * Cancel a workflow execution
   */
  async cancelWorkflow(executionId, reason = 'User cancelled') {
    try {
      const execution = await WorkflowExecution.findByPk(executionId);

      if (!execution) {
        throw new Error('Workflow execution not found');
      }

      await execution.update({
        status: 'cancelled',
        context: {
          ...execution.context,
          cancelledAt: new Date().toISOString(),
          cancelReason: reason
        }
      });

      console.log(`❌ Workflow execution cancelled: ${executionId}`);

      return execution;
    } catch (error) {
      console.error('Error cancelling workflow:', error);
      throw error;
    }
  }
}

module.exports = new WorkflowService();
