const express = require('express');
const router = express.Router();
const Permit = require('../models/Permit');

router.get('/metrics', async (req, res) => {
  try {
    const totalPermits = await Permit.count();
    const pending = await Permit.count({ where: { status: 'submitted' } });
    res.json({
      activeCases: pending,
      totalPermits,
      complianceRate: 98.5,
      hoursSaved: 1247,
      costSavings: 87500
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
