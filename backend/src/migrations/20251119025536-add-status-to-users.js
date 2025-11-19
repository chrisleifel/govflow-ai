'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    /**
     * Add 'status' column to Users table
     * This migration adds the missing status column that tracks user account status
     */

    // Check if the column already exists (in case migration is run on a database that already has it)
    const tableDescription = await queryInterface.describeTable('Users');

    if (!tableDescription.status) {
      // Add status column with ENUM type
      await queryInterface.addColumn('Users', 'status', {
        type: Sequelize.ENUM('active', 'inactive', 'suspended', 'pending'),
        defaultValue: 'active',
        allowNull: false
      });

      console.log('✓ Added status column to Users table');
    } else {
      console.log('✓ Status column already exists, skipping');
    }
  },

  async down (queryInterface, Sequelize) {
    /**
     * Revert the migration by removing the status column
     */

    // Remove the status column
    await queryInterface.removeColumn('Users', 'status');

    // Drop the ENUM type
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_Users_status";');

    console.log('✓ Removed status column from Users table');
  }
};
