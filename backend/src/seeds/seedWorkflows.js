/**
 * Workflow Template Seeder
 * Run this script to populate the database with predefined workflow templates
 *
 * Usage: node src/seeds/seedWorkflows.js
 */

require('dotenv').config();
const { Workflow, WorkflowStep, User, sequelize } = require('../models');
const workflowTemplates = require('./workflowTemplates');

async function seedWorkflows() {
  try {
    console.log('🌱 Starting workflow template seeding...\n');

    // Connect to database
    await sequelize.authenticate();
    console.log('✅ Database connection established\n');

    // Get admin user for createdBy field
    const adminUser = await User.findOne({ where: { email: 'admin@govli.ai' } });
    if (!adminUser) {
      throw new Error('Admin user not found. Please ensure the server has been started at least once to create the admin user.');
    }

    let created = 0;
    let skipped = 0;

    for (const template of workflowTemplates) {
      // Check if workflow already exists
      const existing = await Workflow.findOne({
        where: {
          name: template.name,
          type: template.type
        }
      });

      if (existing) {
        console.log(`⏭️  Skipping existing workflow: ${template.name}`);
        skipped++;
        continue;
      }

      // Create workflow
      const workflow = await Workflow.create({
        name: template.name,
        description: template.description,
        type: template.type,
        triggerType: template.triggerType,
        triggerConditions: template.triggerConditions,
        status: template.status,
        createdBy: adminUser.id
      });

      console.log(`✅ Created workflow: ${template.name}`);

      // Create workflow steps
      if (template.steps && Array.isArray(template.steps)) {
        for (const step of template.steps) {
          await WorkflowStep.create({
            workflowId: workflow.id,
            name: step.name,
            stepType: step.stepType,
            order: step.order,
            config: step.config || {},
            conditions: step.conditions || null
          });
        }
        console.log(`   └─ Added ${template.steps.length} steps`);
      }

      created++;
    }

    console.log(`\n📊 Seeding Summary:`);
    console.log(`   Created: ${created} workflows`);
    console.log(`   Skipped: ${skipped} workflows (already exist)`);
    console.log(`   Total: ${workflowTemplates.length} templates processed`);

    console.log('\n✅ Workflow seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error seeding workflows:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  seedWorkflows();
}

module.exports = seedWorkflows;
