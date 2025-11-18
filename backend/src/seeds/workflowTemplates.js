/**
 * Workflow Templates for Common Permit Types
 * These templates can be loaded into the database to provide
 * automated permit processing workflows
 */

const workflowTemplates = [
  {
    name: 'Building Permit - Standard Review',
    description: 'Automated workflow for standard building permit applications',
    type: 'permit_review',
    triggerType: 'permit_submitted',
    triggerConditions: { permitType: 'building' },
    status: 'active',
    steps: [
      {
        name: 'Initial Notification',
        stepType: 'notification',
        order: 0,
        config: {
          notificationType: 'permit_received',
          title: 'Permit Application Received',
          message: 'Your building permit application has been received and is being processed.',
          priority: 'medium'
        }
      },
      {
        name: 'Document Completeness Check',
        stepType: 'document_check',
        order: 1,
        config: {
          requiredDocuments: 3,
          documentTypes: ['plans', 'survey', 'structural']
        }
      },
      {
        name: 'AI Classification Verification',
        stepType: 'ai_classification',
        order: 2,
        config: {
          minConfidence: 0.85
        }
      },
      {
        name: 'Automatic Review',
        stepType: 'automatic_review',
        order: 3,
        config: {
          criteria: '- Estimated cost under $50,000\n- Standard construction type\n- No zoning violations\n- Complete documentation',
          minConfidence: 0.8
        }
      },
      {
        name: 'Manual Staff Review',
        stepType: 'manual_review',
        order: 4,
        config: {
          taskTitle: 'Review Building Permit Application',
          taskDescription: 'Please review the building permit application for completeness and compliance',
          priority: 'high',
          dueDays: 5
        },
        conditions: {
          requireStepResult: 'Automatic Review'
        }
      },
      {
        name: 'Inspection Scheduling',
        stepType: 'inspection',
        order: 5,
        config: {
          inspectionType: 'pre-construction',
          daysFromNow: 14,
          notes: 'Pre-construction site inspection'
        }
      },
      {
        name: 'Approval Notification',
        stepType: 'notification',
        order: 6,
        config: {
          notificationType: 'permit_approved',
          title: 'Building Permit Approved',
          message: 'Your building permit has been approved. An inspection has been scheduled.',
          priority: 'high'
        }
      },
      {
        name: 'Update Status to Approved',
        stepType: 'update_status',
        order: 7,
        config: {
          status: 'approved'
        }
      }
    ]
  },

  {
    name: 'Electrical Permit - Fast Track',
    description: 'Expedited workflow for minor electrical permits',
    type: 'permit_review',
    triggerType: 'permit_submitted',
    triggerConditions: { permitType: 'electrical' },
    status: 'active',
    steps: [
      {
        name: 'Receive Confirmation',
        stepType: 'notification',
        order: 0,
        config: {
          notificationType: 'permit_received',
          title: 'Electrical Permit Received',
          message: 'Your electrical permit is being processed on the fast-track.',
          priority: 'medium'
        }
      },
      {
        name: 'AI Quick Review',
        stepType: 'automatic_review',
        order: 1,
        config: {
          criteria: '- Minor electrical work only\n- Licensed electrician\n- Cost under $5,000',
          minConfidence: 0.9
        }
      },
      {
        name: 'Auto-Approve Low-Risk',
        stepType: 'update_status',
        order: 2,
        config: {
          status: 'approved'
        },
        conditions: {
          maxCost: 5000
        }
      },
      {
        name: 'Schedule Inspection',
        stepType: 'inspection',
        order: 3,
        config: {
          inspectionType: 'electrical',
          daysFromNow: 7
        }
      },
      {
        name: 'Approval Notice',
        stepType: 'notification',
        order: 4,
        config: {
          notificationType: 'permit_approved',
          title: 'Electrical Permit Approved',
          message: 'Your electrical permit has been automatically approved. Inspection scheduled.',
          priority: 'high'
        }
      }
    ]
  },

  {
    name: 'Plumbing Permit - Standard',
    description: 'Standard workflow for plumbing permits',
    type: 'permit_review',
    triggerType: 'permit_submitted',
    triggerConditions: { permitType: 'plumbing' },
    status: 'active',
    steps: [
      {
        name: 'Application Received',
        stepType: 'notification',
        order: 0,
        config: {
          title: 'Plumbing Permit Received',
          message: 'Your plumbing permit application is under review.',
          priority: 'medium'
        }
      },
      {
        name: 'Check Required Documents',
        stepType: 'document_check',
        order: 1,
        config: {
          requiredDocuments: 2
        }
      },
      {
        name: 'Staff Review',
        stepType: 'manual_review',
        order: 2,
        config: {
          taskTitle: 'Review Plumbing Permit',
          taskDescription: 'Review plumbing permit application and plans',
          priority: 'medium',
          dueDays: 3
        }
      },
      {
        name: 'Schedule Rough-In Inspection',
        stepType: 'inspection',
        order: 3,
        config: {
          inspectionType: 'plumbing-rough',
          daysFromNow: 10
        }
      },
      {
        name: 'Update to Approved',
        stepType: 'update_status',
        order: 4,
        config: {
          status: 'approved'
        }
      },
      {
        name: 'Send Approval',
        stepType: 'notification',
        order: 5,
        config: {
          title: 'Plumbing Permit Approved',
          message: 'Your plumbing permit is approved. Inspection scheduled.',
          priority: 'high'
        }
      }
    ]
  },

  {
    name: 'Demolition Permit - High Priority',
    description: 'Workflow for demolition permits requiring thorough review',
    type: 'permit_review',
    triggerType: 'permit_submitted',
    triggerConditions: { permitType: 'demolition' },
    status: 'active',
    steps: [
      {
        name: 'Urgent Review Notice',
        stepType: 'notification',
        order: 0,
        config: {
          title: 'Demolition Permit Received',
          message: 'Your demolition permit is being prioritized for safety review.',
          priority: 'urgent'
        }
      },
      {
        name: 'Document Verification',
        stepType: 'document_check',
        order: 1,
        config: {
          requiredDocuments: 5,
          documentTypes: ['plans', 'safety_plan', 'asbestos_survey', 'utility_clearance', 'insurance']
        }
      },
      {
        name: 'Safety Review',
        stepType: 'manual_review',
        order: 2,
        config: {
          taskTitle: 'Demolition Safety Review',
          taskDescription: 'Conduct thorough safety review of demolition permit',
          priority: 'urgent',
          dueDays: 2
        }
      },
      {
        name: 'Environmental Check',
        stepType: 'manual_review',
        order: 3,
        config: {
          taskTitle: 'Environmental Assessment',
          taskDescription: 'Review environmental impact and hazardous materials',
          priority: 'high',
          dueDays: 3
        }
      },
      {
        name: 'Final Approval',
        stepType: 'approval',
        order: 4,
        config: {
          taskTitle: 'Approve Demolition Permit',
          taskDescription: 'Final approval for demolition permit',
          priority: 'urgent',
          dueDays: 1
        }
      },
      {
        name: 'Pre-Demolition Inspection',
        stepType: 'inspection',
        order: 5,
        config: {
          inspectionType: 'pre-demolition',
          daysFromNow: 7
        }
      },
      {
        name: 'Approve Permit',
        stepType: 'update_status',
        order: 6,
        config: {
          status: 'approved'
        }
      },
      {
        name: 'Approval Confirmation',
        stepType: 'notification',
        order: 7,
        config: {
          title: 'Demolition Permit Approved',
          message: 'Your demolition permit has been approved after safety review.',
          priority: 'urgent'
        }
      }
    ]
  },

  {
    name: 'Zoning Variance - Complex Review',
    description: 'Multi-step review process for zoning variance requests',
    type: 'permit_review',
    triggerType: 'permit_submitted',
    triggerConditions: { permitType: 'zoning' },
    status: 'active',
    steps: [
      {
        name: 'Application Confirmation',
        stepType: 'notification',
        order: 0,
        config: {
          title: 'Zoning Variance Application Received',
          message: 'Your zoning variance request has been received and will undergo thorough review.',
          priority: 'medium'
        }
      },
      {
        name: 'Initial Review',
        stepType: 'manual_review',
        order: 1,
        config: {
          taskTitle: 'Zoning Variance Initial Review',
          taskDescription: 'Review variance request for completeness and feasibility',
          priority: 'medium',
          dueDays: 7
        }
      },
      {
        name: 'Planning Department Review',
        stepType: 'manual_review',
        order: 2,
        config: {
          taskTitle: 'Planning Review',
          taskDescription: 'Planning department assessment of variance request',
          priority: 'high',
          dueDays: 14
        }
      },
      {
        name: 'Public Notice',
        stepType: 'notification',
        order: 3,
        config: {
          title: 'Variance Under Review',
          message: 'Your variance request is being reviewed. Public hearing may be required.',
          priority: 'medium'
        }
      },
      {
        name: 'Final Decision',
        stepType: 'approval',
        order: 4,
        config: {
          taskTitle: 'Zoning Variance Decision',
          taskDescription: 'Final approval/denial of zoning variance',
          priority: 'high',
          dueDays: 5
        }
      },
      {
        name: 'Decision Notice',
        stepType: 'notification',
        order: 5,
        config: {
          title: 'Zoning Variance Decision',
          message: 'A decision has been made on your zoning variance request.',
          priority: 'high'
        }
      }
    ]
  },

  {
    name: 'General Permit - Simple',
    description: 'Basic workflow for general permits',
    type: 'permit_review',
    triggerType: 'permit_submitted',
    triggerConditions: { permitType: 'general' },
    status: 'active',
    steps: [
      {
        name: 'Receipt Confirmation',
        stepType: 'notification',
        order: 0,
        config: {
          title: 'Permit Application Received',
          message: 'Your permit application has been received.',
          priority: 'low'
        }
      },
      {
        name: 'Quick Review',
        stepType: 'automatic_review',
        order: 1,
        config: {
          criteria: 'Standard permit requirements',
          minConfidence: 0.7
        }
      },
      {
        name: 'Staff Check',
        stepType: 'manual_review',
        order: 2,
        config: {
          taskTitle: 'Review General Permit',
          taskDescription: 'Quick review of general permit application',
          priority: 'low',
          dueDays: 5
        }
      },
      {
        name: 'Approve',
        stepType: 'update_status',
        order: 3,
        config: {
          status: 'approved'
        }
      },
      {
        name: 'Notify Applicant',
        stepType: 'notification',
        order: 4,
        config: {
          title: 'Permit Approved',
          message: 'Your permit has been approved.',
          priority: 'medium'
        }
      }
    ]
  }
];

module.exports = workflowTemplates;
