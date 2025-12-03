const { sequelize, User } = require('./models');

async function upgradeUserToAdmin() {
  try {
    console.log('🔄 Connecting to database...');
    await sequelize.authenticate();
    console.log('✅ Database connected');

    // Find the test user
    const user = await User.findOne({ where: { email: 'test@govli.ai' } });

    if (!user) {
      console.error('❌ User test@govli.ai not found');
      process.exit(1);
    }

    console.log(`📧 Found user: ${user.email} (Current role: ${user.role})`);

    // Update role to admin
    await user.update({ role: 'admin' });

    console.log('✅ User upgraded to admin successfully!');
    console.log(`📧 Email: ${user.email}`);
    console.log(`👤 Name: ${user.name}`);
    console.log(`🔐 Role: ${user.role}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error upgrading user:', error);
    process.exit(1);
  }
}

upgradeUserToAdmin();
