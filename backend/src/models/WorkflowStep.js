const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');

const WorkflowStep = sequelize.define('WorkflowStep', {
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
    },
    onDelete: 'CASCADE'
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  stepType: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'step_type',
    comment: 'Step type: task, approval, notification, automation, condition, etc.'
  },
  order: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Step order in workflow'
  },
  config: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {},
    comment: 'Step-specific configuration'
  },
  assignmentType: {
    type: DataTypes.ENUM('user', 'role', 'group', 'auto'),
    allowNull: true,
    field: 'assignment_type',
    comment: 'How tasks are assigned'
  },
  assignedTo: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'assigned_to',
    comment: 'User IDs, role names, or group IDs for assignment'
  },
  requiredApprovals: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    field: 'required_approvals',
    comment: 'Number of approvals required (for approval steps)'
  },
  timeoutDuration: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'timeout_duration',
    comment: 'Timeout in minutes for this step'
  },
  timeoutAction: {
    type: DataTypes.ENUM('escalate', 'auto_approve', 'auto_reject', 'notify'),
    allowNull: true,
    field: 'timeout_action',
    comment: 'Action to take on timeout'
  },
  conditions: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Conditions that must be met to execute this step'
  },
  nextStepOnSuccess: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'next_step_on_success',
    comment: 'Next step if this step succeeds'
  },
  nextStepOnFailure: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'next_step_on_failure',
    comment: 'Next step if this step fails'
  },
  allowSkip: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'allow_skip',
    comment: 'Whether this step can be skipped'
  },
  required: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    comment: 'Whether this step is required for workflow completion'
  },
  formConfig: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'form_config',
    comment: 'Configuration for forms/inputs required in this step'
  }
}, {
  tableName: 'WorkflowSteps',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['workflow_id']
    },
    {
      fields: ['order']
    },
    {
      fields: ['step_type']
    },
    {
      fields: ['workflow_id', 'order'],
      unique: true
    }
  ]
});

module.exports = WorkflowStep;
