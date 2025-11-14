const sequelize = require('./config/database');
const User = require('./models/User');
const Permit = require('./models/Permit');

async function initDatabase() {
  try {
    await sequelize.sync({ force: true });
    console.log('✅ Database tables created');

    const admin = await User.create({
      email: 'admin@govli.ai',
      password: 'Admin123!',
      name: 'Admin User',
      role: 'admin'
    });

    console.log('✅ Admin user created: admin@govli.ai / Admin123!');

    await Permit.create({
      permitNumber: 'PERMIT-2024-00001',
      type: 'Building',
      status: 'submitted',
      applicantName: 'John Doe',
      applicantEmail: 'john@example.com',
      propertyAddress: '123 Main St, Anytown, USA',
      projectDescription: 'New deck construction'
    });

    console.log('✅ Sample permit created');
    process.exit(0);
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  }
}

initDatabase();
