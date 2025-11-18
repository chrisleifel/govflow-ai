const { Inspection, Permit, User, WorkflowExecution } = require('../models');
const { Op } = require('sequelize');
const NotificationService = require('./notificationService');

/**
 * Inspection Service
 * Comprehensive inspection management with smart scheduling and checklists
 */
class InspectionService {
  /**
   * Inspection checklists by permit type and inspection type
   */
  static INSPECTION_CHECKLISTS = {
    building: {
      initial: [
        { item: 'Foundation inspection complete', category: 'structural', required: true },
        { item: 'Proper excavation depth and footings', category: 'structural', required: true },
        { item: 'Rebar placement and spacing correct', category: 'structural', required: true },
        { item: 'Forms are secure and level', category: 'structural', required: true },
        { item: 'Site drainage adequate', category: 'site', required: true },
        { item: 'Setback requirements met', category: 'zoning', required: true }
      ],
      framing: [
        { item: 'Framing dimensions match approved plans', category: 'structural', required: true },
        { item: 'Structural members properly sized', category: 'structural', required: true },
        { item: 'Load-bearing walls properly supported', category: 'structural', required: true },
        { item: 'Window and door openings have proper headers', category: 'structural', required: true },
        { item: 'Floor joists properly spaced and secured', category: 'structural', required: true },
        { item: 'Fire blocking installed', category: 'safety', required: true }
      ],
      final: [
        { item: 'All work completed per approved plans', category: 'general', required: true },
        { item: 'Electrical fixtures installed and operational', category: 'electrical', required: true },
        { item: 'Plumbing fixtures installed and tested', category: 'plumbing', required: true },
        { item: 'HVAC system operational', category: 'mechanical', required: true },
        { item: 'Smoke detectors installed and tested', category: 'safety', required: true },
        { item: 'CO detectors installed', category: 'safety', required: true },
        { item: 'Handrails and guardrails meet code', category: 'safety', required: true },
        { item: 'Final grading and drainage complete', category: 'site', required: true },
        { item: 'Certificate of Occupancy ready', category: 'general', required: true }
      ]
    },
    electrical: {
      rough: [
        { item: 'Panel installation meets code', category: 'electrical', required: true },
        { item: 'Proper wire sizing for circuits', category: 'electrical', required: true },
        { item: 'GFCI protection where required', category: 'safety', required: true },
        { item: 'Proper grounding and bonding', category: 'safety', required: true },
        { item: 'Box placement meets code requirements', category: 'electrical', required: true }
      ],
      final: [
        { item: 'All fixtures installed and operational', category: 'electrical', required: true },
        { item: 'Panel labeled correctly', category: 'electrical', required: true },
        { item: 'AFCI protection where required', category: 'safety', required: true },
        { item: 'Smoke alarm interconnection tested', category: 'safety', required: true },
        { item: 'No open splices', category: 'safety', required: true }
      ]
    },
    plumbing: {
      rough: [
        { item: 'Water supply lines properly sized', category: 'plumbing', required: true },
        { item: 'Proper slope on drain lines', category: 'plumbing', required: true },
        { item: 'Vent system adequate', category: 'plumbing', required: true },
        { item: 'Pressure test passed', category: 'plumbing', required: true },
        { item: 'Gas lines properly sized and tested', category: 'gas', required: false }
      ],
      final: [
        { item: 'All fixtures installed and leak-free', category: 'plumbing', required: true },
        { item: 'Water heater installed correctly', category: 'plumbing', required: true },
        { item: 'Backflow prevention installed', category: 'safety', required: true },
        { item: 'Final pressure test passed', category: 'plumbing', required: true },
        { item: 'Accessible cleanouts installed', category: 'plumbing', required: true }
      ]
    },
    demolition: {
      initial: [
        { item: 'Asbestos survey complete', category: 'safety', required: true },
        { item: 'Lead paint assessment complete', category: 'safety', required: true },
        { item: 'Utilities disconnected or capped', category: 'safety', required: true },
        { item: 'Rodent baiting complete', category: 'safety', required: false },
        { item: 'Site secured with fencing', category: 'site', required: true }
      ],
      final: [
        { item: 'All debris removed from site', category: 'site', required: true },
        { item: 'Foundation properly filled or removed', category: 'site', required: true },
        { item: 'Site graded and stabilized', category: 'site', required: true },
        { item: 'No hazardous materials remain', category: 'safety', required: true }
      ]
    }
  };

  /**
   * Get inspection checklist for permit and inspection type
   * @param {string} permitType - Type of permit
   * @param {string} inspectionType - Type of inspection
   * @returns {Array} Checklist items
   */
  static getChecklist(permitType, inspectionType) {
    const permitChecklists = this.INSPECTION_CHECKLISTS[permitType];
    if (!permitChecklists) {
      // Return generic checklist for unknown permit types
      return [
        { item: 'Work matches approved plans', category: 'general', required: true },
        { item: 'Code requirements met', category: 'general', required: true },
        { item: 'Safety standards complied with', category: 'safety', required: true }
      ];
    }

    return permitChecklists[inspectionType] || permitChecklists.final || [];
  }

  /**
   * Get required inspection types for permit type
   * @param {string} permitType - Type of permit
   * @returns {Array} Required inspection types
   */
  static getRequiredInspections(permitType) {
    const inspectionTypes = {
      building: ['initial', 'framing', 'final'],
      electrical: ['rough', 'final'],
      plumbing: ['rough', 'final'],
      demolition: ['initial', 'final'],
      zoning: ['final'],
      general: ['final']
    };

    return inspectionTypes[permitType] || ['final'];
  }

  /**
   * Find available inspectors for a date/time
   * @param {Date} scheduledDate - Proposed inspection date
   * @param {string} inspectionType - Type of inspection
   * @returns {Promise<Array>} Available inspectors
   */
  static async findAvailableInspectors(scheduledDate, inspectionType = null) {
    try {
      // Get all inspectors
      const allInspectors = await User.findAll({
        where: { role: 'inspector' },
        attributes: ['id', 'name', 'email']
      });

      if (allInspectors.length === 0) {
        return [];
      }

      // Check which inspectors have conflicts on this date
      const startOfDay = new Date(scheduledDate);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(scheduledDate);
      endOfDay.setHours(23, 59, 59, 999);

      const busyInspectors = await Inspection.findAll({
        where: {
          scheduledDate: {
            [Op.between]: [startOfDay, endOfDay]
          },
          status: {
            [Op.in]: ['scheduled', 'in_progress']
          }
        },
        attributes: ['inspectorId'],
        group: ['inspectorId'],
        raw: true
      });

      const busyIds = busyInspectors.map(i => i.inspectorId);

      // Return inspectors who are not busy
      const available = allInspectors.filter(inspector =>
        !busyIds.includes(inspector.id)
      );

      return available;
    } catch (error) {
      console.error('Find available inspectors error:', error);
      return [];
    }
  }

  /**
   * Auto-assign inspector to inspection
   * @param {Object} inspection - Inspection object
   * @returns {Promise<Object|null>} Assigned inspector
   */
  static async autoAssignInspector(inspection) {
    try {
      const availableInspectors = await this.findAvailableInspectors(
        inspection.scheduledDate,
        inspection.type
      );

      if (availableInspectors.length === 0) {
        console.warn('No available inspectors found for auto-assignment');
        return null;
      }

      // Get workload for each available inspector (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const inspectorWorkloads = await Promise.all(
        availableInspectors.map(async (inspector) => {
          const count = await Inspection.count({
            where: {
              inspectorId: inspector.id,
              createdAt: { [Op.gte]: thirtyDaysAgo }
            }
          });
          return { inspector, workload: count };
        })
      );

      // Sort by workload (ascending) and pick the one with least workload
      inspectorWorkloads.sort((a, b) => a.workload - b.workload);
      const assigned = inspectorWorkloads[0].inspector;

      // Update inspection with assigned inspector
      await inspection.update({ inspectorId: assigned.id });

      console.log(`✅ Auto-assigned inspector ${assigned.name} to inspection ${inspection.id}`);

      return assigned;
    } catch (error) {
      console.error('Auto-assign inspector error:', error);
      return null;
    }
  }

  /**
   * Create inspection with checklist
   * @param {Object} data - Inspection data
   * @returns {Promise<Object>} Created inspection
   */
  static async createInspection(data) {
    try {
      const { permitId, type, scheduledDate, notes, inspectorId, createdBy } = data;

      // Get permit to determine checklist
      const permit = await Permit.findByPk(permitId);
      if (!permit) {
        throw new Error('Permit not found');
      }

      // Get checklist for this inspection type
      const checklistTemplate = this.getChecklist(permit.type, type);

      // Initialize checklist with all items unchecked
      const checklist = {
        items: checklistTemplate.map(item => ({
          ...item,
          checked: false,
          notes: '',
          photo: null
        })),
        completedItems: 0,
        totalItems: checklistTemplate.length,
        percentComplete: 0
      };

      // Create inspection
      const inspection = await Inspection.create({
        permitId,
        inspectorId: inspectorId || null,
        type,
        scheduledDate,
        notes: notes || '',
        status: 'scheduled',
        checklist,
        createdBy
      });

      // Auto-assign inspector if not specified
      if (!inspectorId && scheduledDate) {
        await this.autoAssignInspector(inspection);
        await inspection.reload({
          include: [{ model: User, as: 'inspector' }]
        });
      }

      return inspection;
    } catch (error) {
      console.error('Create inspection error:', error);
      throw error;
    }
  }

  /**
   * Update inspection checklist
   * @param {string} inspectionId - Inspection ID
   * @param {Object} checklist - Updated checklist
   * @returns {Promise<Object>} Updated inspection
   */
  static async updateChecklist(inspectionId, checklist) {
    try {
      const inspection = await Inspection.findByPk(inspectionId);
      if (!inspection) {
        throw new Error('Inspection not found');
      }

      // Calculate completion percentage
      const completedItems = checklist.items.filter(item => item.checked).length;
      const totalItems = checklist.items.length;
      const percentComplete = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

      const updatedChecklist = {
        ...checklist,
        completedItems,
        totalItems,
        percentComplete
      };

      await inspection.update({ checklist: updatedChecklist });

      return inspection;
    } catch (error) {
      console.error('Update checklist error:', error);
      throw error;
    }
  }

  /**
   * Complete inspection and update permit status
   * @param {string} inspectionId - Inspection ID
   * @param {Object} data - Completion data
   * @returns {Promise<Object>} Completed inspection
   */
  static async completeInspection(inspectionId, data) {
    try {
      const { result, notes, checklist, userId } = data;

      const inspection = await Inspection.findByPk(inspectionId, {
        include: [
          { model: Permit, as: 'permit' },
          { model: User, as: 'inspector' }
        ]
      });

      if (!inspection) {
        throw new Error('Inspection not found');
      }

      // Update inspection
      await inspection.update({
        status: 'completed',
        result: result || 'pending',
        notes: notes || inspection.notes,
        checklist: checklist || inspection.checklist,
        completedDate: new Date(),
        updatedBy: userId
      });

      // Update permit status based on inspection result
      if (inspection.permit) {
        await this.updatePermitStatus(inspection.permit, inspection, result);
      }

      // Trigger workflow resume if inspection is part of workflow
      await this.triggerWorkflowContinuation(inspection);

      return inspection;
    } catch (error) {
      console.error('Complete inspection error:', error);
      throw error;
    }
  }

  /**
   * Update permit status based on inspection result
   * @param {Object} permit - Permit object
   * @param {Object} inspection - Inspection object
   * @param {string} result - Inspection result
   */
  static async updatePermitStatus(permit, inspection, result) {
    try {
      if (result === 'passed') {
        // Check if this is the final inspection
        if (inspection.type === 'final') {
          // Final inspection passed - approve permit
          await permit.update({ status: 'approved' });
          console.log(`✅ Permit ${permit.permitNumber} approved after final inspection`);
        } else {
          // Intermediate inspection passed - keep in review
          if (permit.status !== 'under_review') {
            await permit.update({ status: 'under_review' });
          }
        }
      } else if (result === 'failed') {
        // Inspection failed - set permit to needs revision
        await permit.update({ status: 'needs_revision' });
        console.log(`⚠️  Permit ${permit.permitNumber} needs revision after failed inspection`);
      } else if (result === 'conditional') {
        // Conditional pass - keep under review
        await permit.update({ status: 'under_review' });
      }
    } catch (error) {
      console.error('Update permit status error:', error);
    }
  }

  /**
   * Trigger workflow continuation after inspection completion
   * @param {Object} inspection - Completed inspection
   */
  static async triggerWorkflowContinuation(inspection) {
    try {
      // Find active workflow execution for this permit
      const execution = await WorkflowExecution.findOne({
        where: {
          permitId: inspection.permitId,
          status: 'pending' // Workflow paused for inspection
        }
      });

      if (!execution) {
        return; // No pending workflow
      }

      // Import workflow service dynamically to avoid circular dependency
      const workflowService = require('./workflowService');

      // Add inspection result to workflow context
      const updatedContext = {
        ...execution.executionData,
        lastInspectionResult: {
          inspectionId: inspection.id,
          type: inspection.type,
          result: inspection.result,
          completedDate: inspection.completedDate
        }
      };

      await execution.update({
        executionData: updatedContext,
        status: 'in_progress'
      });

      // Resume workflow
      await workflowService.resumeWorkflow(execution.id);

      console.log(`✅ Workflow ${execution.id} resumed after inspection completion`);
    } catch (error) {
      console.error('Trigger workflow continuation error:', error);
    }
  }

  /**
   * Schedule reinspection
   * @param {string} originalInspectionId - Original inspection ID
   * @param {Object} data - Reinspection data
   * @returns {Promise<Object>} New inspection
   */
  static async scheduleReinspection(originalInspectionId, data) {
    try {
      const originalInspection = await Inspection.findByPk(originalInspectionId, {
        include: [{ model: Permit, as: 'permit' }]
      });

      if (!originalInspection) {
        throw new Error('Original inspection not found');
      }

      // Create new inspection
      const reinspection = await this.createInspection({
        permitId: originalInspection.permitId,
        type: originalInspection.type,
        scheduledDate: data.scheduledDate,
        notes: `Re-inspection for ${originalInspection.type}. Original inspection failed: ${originalInspection.notes}`,
        inspectorId: originalInspection.inspectorId, // Same inspector
        createdBy: data.createdBy
      });

      console.log(`✅ Re-inspection scheduled: ${reinspection.id} for permit ${originalInspection.permit.permitNumber}`);

      return reinspection;
    } catch (error) {
      console.error('Schedule reinspection error:', error);
      throw error;
    }
  }

  /**
   * Get inspection statistics
   * @param {Object} filters - Optional filters
   * @returns {Promise<Object>} Statistics
   */
  static async getInspectionStats(filters = {}) {
    try {
      const where = {};

      if (filters.inspectorId) {
        where.inspectorId = filters.inspectorId;
      }

      if (filters.startDate && filters.endDate) {
        where.scheduledDate = {
          [Op.between]: [filters.startDate, filters.endDate]
        };
      }

      const total = await Inspection.count({ where });

      const byStatus = await Inspection.findAll({
        where,
        attributes: [
          'status',
          [Inspection.sequelize.fn('COUNT', Inspection.sequelize.col('id')), 'count']
        ],
        group: ['status'],
        raw: true
      });

      const byResult = await Inspection.findAll({
        where: {
          ...where,
          result: { [Op.ne]: null }
        },
        attributes: [
          'result',
          [Inspection.sequelize.fn('COUNT', Inspection.sequelize.col('id')), 'count']
        ],
        group: ['result'],
        raw: true
      });

      const passRate = byResult.reduce((acc, item) => {
        if (item.result === 'passed') return item.count;
        return acc;
      }, 0);

      const totalCompleted = byStatus.reduce((acc, item) => {
        if (item.status === 'completed') return item.count;
        return acc;
      }, 0);

      return {
        total,
        byStatus: byStatus.reduce((acc, item) => {
          acc[item.status] = parseInt(item.count);
          return acc;
        }, {}),
        byResult: byResult.reduce((acc, item) => {
          acc[item.result] = parseInt(item.count);
          return acc;
        }, {}),
        passRate: totalCompleted > 0 ? ((passRate / totalCompleted) * 100).toFixed(1) : 0
      };
    } catch (error) {
      console.error('Get inspection stats error:', error);
      throw error;
    }
  }
}

module.exports = InspectionService;
