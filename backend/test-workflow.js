/**
 * Test script to verify workflow automation
 * Creates a building permit and checks if workflow triggers
 */

require('dotenv').config();
const { Permit, User, Workflow, WorkflowExecution, sequelize } = require('./src/models');
const workflowService = require('./src/services/workflowService');

async function testWorkflowAutomation() {
  try {
    console.log('🧪 Testing workflow automation...\n');

    // Connect to database
    await sequelize.authenticate();
    console.log('✅ Database connected\n');

    // Get admin user
    const admin = await User.findOne({ where: { email: 'admin@govli.ai' } });
    if (!admin) {
      throw new Error('Admin user not found');
    }

    // Check if workflows exist
    const workflows = await Workflow.findAll({ where: { status: 'active' } });
    console.log(`📋 Found ${workflows.length} active workflows:`);
    workflows.forEach(w => {
      const conditions = w.triggerConditions || {};
      console.log(`   - ${w.name} (type: ${w.type}, trigger: ${w.triggerType}, permitType: ${conditions.permitType || 'any'})`);
    });
    console.log('');

    // Create a test building permit
    const permitCount = await Permit.count();
    const permitNumber = `TEST-${new Date().getFullYear()}-${String(permitCount + 1).padStart(5, '0')}`;

    console.log('🏗️  Creating test building permit...');
    const permit = await Permit.create({
      permitNumber,
      applicantName: admin.name,
      applicantEmail: admin.email,
      applicantPhone: '555-1234',
      propertyAddress: '123 Test Street, Test City, TS 12345',
      type: 'building',
      description: 'Test building permit for workflow automation',
      estimatedCost: 45000,
      status: 'submitted'
    });

    console.log(`✅ Permit created: ${permit.permitNumber}`);
    console.log(`   Type: ${permit.type}`);
    console.log(`   Status: ${permit.status}`);
    console.log('');

    // Manually trigger workflow (simulating the POST /api/permits trigger)
    console.log('⚙️  Triggering workflow automation...');
    const execution = await workflowService.startWorkflow(permit, 'permit_submitted');

    if (execution) {
      console.log(`✅ Workflow execution started: ${execution.id}`);
      console.log(`   Workflow ID: ${execution.workflowId}`);
      console.log(`   Status: ${execution.status}`);
      console.log(`   Current Step: ${execution.currentStep}`);
      console.log('');

      // Wait a moment for async processing
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check execution status
      const updatedExecution = await WorkflowExecution.findByPk(execution.id);
      console.log('📊 Workflow execution status after processing:');
      console.log(`   Status: ${updatedExecution.status}`);
      console.log(`   Current Step: ${updatedExecution.currentStep}`);
      console.log(`   Result: ${JSON.stringify(updatedExecution.result || {}, null, 2)}`);
      console.log('');

      // Get all executions for this permit
      const executions = await WorkflowExecution.findAll({
        where: { permitId: permit.id },
        order: [['createdAt', 'DESC']]
      });

      console.log(`📈 Total workflow executions for this permit: ${executions.length}`);
      console.log('');

      console.log('✅ Workflow automation test completed successfully!');
      console.log('\n✨ Summary:');
      console.log(`   - Permit created: ${permit.permitNumber}`);
      console.log(`   - Workflow triggered: YES`);
      console.log(`   - Execution ID: ${execution.id}`);
      console.log(`   - Final status: ${updatedExecution.status}`);
      console.log(`   - Steps processed: ${updatedExecution.currentStep}`);
    } else {
      console.log('⚠️  No workflow was triggered for this permit');
      console.log('   This might be expected if no workflow matches the permit type and trigger');
    }

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error testing workflow automation:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run test
testWorkflowAutomation();
