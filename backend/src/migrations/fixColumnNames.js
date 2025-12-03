/**
 * One-time migration to fix column naming from snake_case to camelCase
 * This runs before Sequelize sync to ensure database columns match model definitions
 */

const sequelize = require('../config/sequelize');

async function fixColumnNames() {
  console.log('🔧 Running column name migration...');

  try {
    // Get all tables that need column renaming
    const [tables] = await sequelize.query(`
      SELECT DISTINCT table_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name NOT LIKE 'pg_%'
      AND table_name NOT LIKE 'sql_%';
    `);

    console.log(`   Found ${tables.length} tables to check`);

    // For each table, rename common timestamp columns
    const migrations = [];
    for (const { table_name } of tables) {
      // Common columns that need renaming
      migrations.push(
        { table: table_name, oldCol: 'created_at', newCol: 'createdAt' },
        { table: table_name, oldCol: 'updated_at', newCol: 'updatedAt' }
      );
    }

    // Add Users table specific columns
    migrations.push(
      { table: 'Users', oldCol: 'profile_picture', newCol: 'profilePicture' },
      { table: 'Users', oldCol: 'reset_password_token', newCol: 'resetPasswordToken' },
      { table: 'Users', oldCol: 'reset_password_expires', newCol: 'resetPasswordExpires' },
      { table: 'Users', oldCol: 'password_changed_at', newCol: 'passwordChangedAt' },
      { table: 'Users', oldCol: 'last_login_at', newCol: 'lastLoginAt' }
    );

    for (const { table, oldCol, newCol } of migrations) {
      try {
        // Check if old column exists before renaming
        const checkQuery = `
          SELECT column_name
          FROM information_schema.columns
          WHERE table_name = '${table}' AND column_name = '${oldCol}';
        `;

        const [results] = await sequelize.query(checkQuery);

        if (results.length > 0) {
          // Column exists, rename it
          await sequelize.query(`
            ALTER TABLE "${table}"
            RENAME COLUMN "${oldCol}" TO "${newCol}";
          `);
          console.log(`   ✅ Renamed ${table}.${oldCol} -> ${newCol}`);
        } else {
          console.log(`   ⏭️  ${table}.${oldCol} already renamed or doesn't exist`);
        }
      } catch (error) {
        // Column might already be renamed or doesn't exist - that's OK
        if (error.message.includes('does not exist')) {
          console.log(`   ⏭️  ${table}.${oldCol} already renamed`);
        } else {
          console.log(`   ⚠️  Could not rename ${table}.${oldCol}: ${error.message}`);
        }
      }
    }

    console.log('✅ Column name migration complete');
    return true;
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    // Don't throw - allow server to continue and let alter: true handle it
    return false;
  }
}

module.exports = fixColumnNames;
