const express = require('express');
const router = express.Router();
const { User } = require('../models');

/**
 * TEMPORARY ENDPOINT - Remove after upgrading test user to admin
 * @route   POST /api/admin-upgrade
 * @desc    Upgrade test@govli.ai to admin role
 * @access  Public (TEMPORARY - should be removed after use)
 */
router.post('/', async (req, res) => {
  try {
    const { secret } = req.body;

    // Simple secret to prevent unauthorized use
    // You can call this with: POST /api/admin-upgrade with body: {"secret": "upgrade-admin-2024"}
    if (secret !== 'upgrade-admin-2024') {
      return res.status(403).json({ error: 'Invalid secret' });
    }

    // Find the test user
    const user = await User.findOne({ where: { email: 'test@govli.ai' } });

    if (!user) {
      return res.status(404).json({ error: 'User test@govli.ai not found' });
    }

    // Update role to admin
    await user.update({ role: 'admin' });

    res.json({
      success: true,
      message: 'User upgraded to admin successfully',
      user: {
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Upgrade error:', error);
    res.status(500).json({ error: 'Failed to upgrade user' });
  }
});

module.exports = router;
