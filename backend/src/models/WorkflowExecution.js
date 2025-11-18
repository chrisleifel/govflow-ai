const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const WorkflowExecution = sequelize.define('WorkflowExecution', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  workflowId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'workflow_id',
    references: {
      model: 'Workflows',
      key: 'id'
    }
  },
  permitId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'permit_id',
    references: {
      model: 'Permits',
      key: 'id'
    }
  },
  relatedEntity: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'related_entity',
    comment: 'Type of related entity if not permit'
  },
  relatedEntityId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'related_entity_id',
    comment: 'ID of related entity'
  },
  status: {
    type: DataTypes.ENUM('pending', 'in_progress', 'completed', 'failed', 'cancelled', 'timeout'),
    defaultValue: 'pending',
    allowNull: false
  },
  currentStepId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'current_step_id',
    references: {
      model: 'WorkflowSteps',
      key: 'id'
    }
  },
  currentStepOrder: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'current_step_order',
    comment: 'Current step order number'
  },
  initiatedBy: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'initiated_by',
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  startedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'started_at'
  },
  completedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'completed_at'
  },
  failedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'failed_at'
  },
  cancelledAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'cancelled_at'
  },
  cancelledBy: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'cancelled_by',
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  cancellationReason: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'cancellation_reason'
  },
  executionData: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {},
    field: 'execution_data',
    comment: 'Data accumulated during workflow execution'
  },
  stepHistory: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: [],
    field: 'step_history',
    comment: 'History of completed steps with timestamps and outcomes'
  },
  variables: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {},
    comment: 'Variables used in workflow execution'
  },
  errors: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: [],
    comment: 'Errors encountered during execution'
  },
  priority: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Execution priority'
  },
  dueDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'due_date',
    comment: 'When workflow execution should be completed'
  },
  actualDuration: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'actual_duration',
    comment: 'Actual duration in minutes (calculated on completion)'
  }
}, {
  tableName: 'WorkflowExecutions',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['workflow_id']
    },
    {
      fields: ['permit_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['initiated_by']
    },
    {
      fields: ['current_step_id']
    },
    {
      fields: ['started_at']
    },
    {
      fields: ['completed_at']
    },
    {
      fields: ['due_date']
    }
  ]
});

// Calculate duration on completion
WorkflowExecution.beforeUpdate(async (execution) => {
  if (execution.changed('status') && execution.status === 'completed' && execution.startedAt) {
    const duration = Math.floor((new Date(execution.completedAt || new Date()) - new Date(execution.startedAt)) / 60000);
    execution.actualDuration = duration;
  }
});

module.exports = WorkflowExecution;
