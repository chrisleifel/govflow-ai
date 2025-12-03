const express = require('express');
const router = express.Router();
const seedDemoData = require('../seeds/seedDemoData');

/**
 * @route   POST /api/demo/seed
 * @desc    Populate database with demo data
 * @access  Public (protected by secret)
 */
router.post('/seed', async (req, res) => {
  try {
    const { secret } = req.body;

    // Simple secret to prevent unauthorized use
    if (secret !== 'seed-demo-2024') {
      return res.status(403).json({ error: 'Invalid secret' });
    }

    console.log('🌱 Demo data seeding requested...');

    await seedDemoData();

    res.json({
      success: true,
      message: 'Demo data seeded successfully',
      credentials: {
        admin: 'demo.admin@govli.ai / Demo123$',
        staff: 'demo.staff@govli.ai / Demo123$',
        inspector: 'demo.inspector@govli.ai / Demo123$',
        citizen: 'james.wilson@example.com / Demo123$'
      }
    });
  } catch (error) {
    console.error('Seed demo data error:', error);
    res.status(500).json({
      error: 'Failed to seed demo data',
      message: error.message
    });
  }
});

/**
 * @route   GET /api/demo/info
 * @desc    Get demo environment information
 * @access  Public
 */
router.get('/info', (req, res) => {
  res.json({
    success: true,
    message: 'Govli AI Demo Environment',
    demoCredentials: {
      admin: 'demo.admin@govli.ai / Demo123$',
      staff: 'demo.staff@govli.ai / Demo123$',
      inspector: 'demo.inspector@govli.ai / Demo123$',
      citizens: [
        'james.wilson@example.com / Demo123$',
        'maria.garcia@example.com / Demo123$',
        'robert.taylor@example.com / Demo123$'
      ]
    },
    features: [
      '15 sample permits',
      '10 inspections',
      '12 payments',
      '5 CRM contacts',
      '4 grants with applications',
      '8 notifications',
      '10 tasks'
    ]
  });
});

module.exports = router;
