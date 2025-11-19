'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // Check if Users table exists
      const tables = await queryInterface.showAllTables();
      if (!tables.includes('Users')) {
        console.log('Users table does not exist yet, skipping migration');
        await transaction.commit();
        return;
      }

      // Check if role column exists
      const tableDescription = await queryInterface.describeTable('Users');
      if (!tableDescription.role) {
        console.log('Role column does not exist yet, skipping migration');
        await transaction.commit();
        return;
      }

      console.log('Fixing enum_Users_role type...');

      // Step 1: Change column to VARCHAR temporarily
      await queryInterface.sequelize.query(
        'ALTER TABLE "Users" ALTER COLUMN "role" TYPE VARCHAR(50) USING "role"::VARCHAR;',
        { transaction }
      );
      console.log('✓ Converted role to VARCHAR');

      // Step 2: Drop the old enum type if it exists
      await queryInterface.sequelize.query(
        'DROP TYPE IF EXISTS "enum_Users_role" CASCADE;',
        { transaction }
      );
      console.log('✓ Dropped old enum type');

      // Step 3: Create the correct enum type
      await queryInterface.sequelize.query(
        "CREATE TYPE \"enum_Users_role\" AS ENUM ('citizen', 'staff', 'admin', 'inspector');",
        { transaction }
      );
      console.log('✓ Created new enum type');

      // Step 4: Convert role column back to ENUM
      await queryInterface.sequelize.query(
        'ALTER TABLE "Users" ALTER COLUMN "role" TYPE "enum_Users_role" USING "role"::"enum_Users_role";',
        { transaction }
      );
      console.log('✓ Converted role back to enum');

      // Step 5: Set default and constraints
      await queryInterface.sequelize.query(
        'ALTER TABLE "Users" ALTER COLUMN "role" SET DEFAULT \'citizen\';',
        { transaction }
      );
      await queryInterface.sequelize.query(
        'ALTER TABLE "Users" ALTER COLUMN "role" SET NOT NULL;',
        { transaction }
      );
      console.log('✓ Set default value and NOT NULL constraint');

      await transaction.commit();
      console.log('✅ Successfully fixed enum_Users_role type');

    } catch (error) {
      await transaction.rollback();
      console.error('❌ Error fixing role enum:', error.message);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    // This migration is a fix, so down migration would restore the broken state
    // which doesn't make sense. Leave it as no-op.
    console.log('This migration cannot be reverted as it fixes a data type issue');
  }
};
