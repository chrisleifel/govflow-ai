const express = require('express');
const router = express.Router();
const Permit = require('../models/Permit');

router.get('/', async (req, res) => {
  try {
    const permits = await Permit.findAll({ order: [['createdAt', 'DESC']] });
    res.json({ permits });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const count = await Permit.count();
    const permitNumber = `PERMIT-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;
    const permit = await Permit.create({ ...req.body, permitNumber });
    res.status(201).json(permit);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
