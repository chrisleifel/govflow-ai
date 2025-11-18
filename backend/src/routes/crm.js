const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const config = require('../config/config');
const { Contact, ContactInteraction, User } = require('../models');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { auditSensitiveOperation } = require('../middleware/auditLog');
const CRMService = require('../services/crmService');

/**
 * @route   GET /api/crm/contacts
 * @desc    Search and list contacts
 * @access  Private (Staff/Admin)
 */
router.get('/contacts',
  authMiddleware,
  requireRole('staff', 'admin'),
  async (req, res) => {
    try {
      const { query, contactType, status, tags, source, hasEmail, hasPhone, page = 1, limit = 50 } = req.query;

      const offset = (page - 1) * limit;

      const filters = {
        query,
        contactType,
        status,
        tags: tags ? tags.split(',') : null,
        source,
        hasEmail: hasEmail === 'true',
        hasPhone: hasPhone === 'true',
        limit: parseInt(limit),
        offset: parseInt(offset)
      };

      const contacts = await CRMService.searchContacts(filters);
      const total = await Contact.count({
        where: { duplicateOf: null, status: status || { [Op.ne]: 'archived' } }
      });

      res.json({
        success: true,
        contacts,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      console.error('Get contacts error:', error);

      res.status(500).json({
        error: 'Failed to fetch contacts',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   GET /api/crm/contacts/:id
 * @desc    Get single contact with full history
 * @access  Private (Staff/Admin)
 */
router.get('/contacts/:id',
  authMiddleware,
  requireRole('staff', 'admin'),
  async (req, res) => {
    try {
      const contact = await CRMService.getContactWithHistory(req.params.id);

      if (!contact) {
        return res.status(404).json({
          error: 'Contact not found'
        });
      }

      res.json({
        success: true,
        contact
      });
    } catch (error) {
      console.error('Get contact error:', error);

      res.status(500).json({
        error: 'Failed to fetch contact',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   POST /api/crm/contacts
 * @desc    Create new contact
 * @access  Private (Staff/Admin)
 */
router.post('/contacts',
  authMiddleware,
  requireRole('staff', 'admin'),
  auditSensitiveOperation('CREATE_CONTACT'),
  async (req, res) => {
    try {
      const contactData = {
        ...req.body,
        createdBy: req.user.id
      };

      const contact = await Contact.create(contactData);

      console.log(`✅ Contact created: ${contact.id} - ${contact.fullName}`);

      res.status(201).json({
        success: true,
        message: 'Contact created successfully',
        contact
      });
    } catch (error) {
      console.error('Create contact error:', error);

      res.status(500).json({
        error: 'Failed to create contact',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   PUT /api/crm/contacts/:id
 * @desc    Update contact
 * @access  Private (Staff/Admin)
 */
router.put('/contacts/:id',
  authMiddleware,
  requireRole('staff', 'admin'),
  auditSensitiveOperation('UPDATE_CONTACT'),
  async (req, res) => {
    try {
      const contact = await Contact.findByPk(req.params.id);

      if (!contact) {
        return res.status(404).json({
          error: 'Contact not found'
        });
      }

      await contact.update({
        ...req.body,
        updatedBy: req.user.id
      });

      console.log(`✅ Contact updated: ${contact.id} - ${contact.fullName}`);

      res.json({
        success: true,
        message: 'Contact updated successfully',
        contact
      });
    } catch (error) {
      console.error('Update contact error:', error);

      res.status(500).json({
        error: 'Failed to update contact',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   DELETE /api/crm/contacts/:id
 * @desc    Delete contact (soft delete)
 * @access  Private (Admin only)
 */
router.delete('/contacts/:id',
  authMiddleware,
  requireRole('admin'),
  auditSensitiveOperation('DELETE_CONTACT'),
  async (req, res) => {
    try {
      const contact = await Contact.findByPk(req.params.id);

      if (!contact) {
        return res.status(404).json({
          error: 'Contact not found'
        });
      }

      // Soft delete
      await contact.update({ status: 'archived' });

      console.log(`✅ Contact archived: ${contact.id} - ${contact.fullName}`);

      res.json({
        success: true,
        message: 'Contact archived successfully'
      });
    } catch (error) {
      console.error('Delete contact error:', error);

      res.status(500).json({
        error: 'Failed to delete contact',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   POST /api/crm/contacts/:id/interactions
 * @desc    Log interaction with contact
 * @access  Private (Staff/Admin)
 */
router.post('/contacts/:id/interactions',
  authMiddleware,
  requireRole('staff', 'admin', 'inspector'),
  async (req, res) => {
    try {
      const { type, direction, subject, content, outcome, permitId, inspectionId } = req.body;

      const interaction = await CRMService.logInteraction({
        contactId: req.params.id,
        type,
        direction,
        subject,
        content,
        outcome,
        permitId,
        inspectionId,
        handledBy: req.user.id
      });

      res.status(201).json({
        success: true,
        message: 'Interaction logged successfully',
        interaction
      });
    } catch (error) {
      console.error('Log interaction error:', error);

      res.status(500).json({
        error: 'Failed to log interaction',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   GET /api/crm/contacts/:id/duplicates
 * @desc    Find potential duplicate contacts
 * @access  Private (Staff/Admin)
 */
router.get('/contacts/:id/duplicates',
  authMiddleware,
  requireRole('staff', 'admin'),
  async (req, res) => {
    try {
      const duplicates = await CRMService.findPotentialDuplicates(req.params.id);

      res.json({
        success: true,
        duplicates,
        count: duplicates.length
      });
    } catch (error) {
      console.error('Find duplicates error:', error);

      res.status(500).json({
        error: 'Failed to find duplicates',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   POST /api/crm/contacts/:id/merge
 * @desc    Merge duplicate contact into primary
 * @access  Private (Admin only)
 */
router.post('/contacts/:id/merge',
  authMiddleware,
  requireRole('admin'),
  auditSensitiveOperation('MERGE_CONTACTS'),
  async (req, res) => {
    try {
      const { duplicateContactId } = req.body;

      if (!duplicateContactId) {
        return res.status(400).json({
          error: 'Duplicate contact ID is required'
        });
      }

      const mergedContact = await CRMService.mergeDuplicates(req.params.id, duplicateContactId);

      res.json({
        success: true,
        message: 'Contacts merged successfully',
        contact: mergedContact
      });
    } catch (error) {
      console.error('Merge contacts error:', error);

      res.status(500).json({
        error: 'Failed to merge contacts',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   GET /api/crm/stats
 * @desc    Get contact statistics
 * @access  Private (Staff/Admin)
 */
router.get('/stats',
  authMiddleware,
  requireRole('staff', 'admin'),
  async (req, res) => {
    try {
      const { contactType } = req.query;

      const stats = await CRMService.getContactStats({ contactType });

      res.json({
        success: true,
        stats
      });
    } catch (error) {
      console.error('Get contact stats error:', error);

      res.status(500).json({
        error: 'Failed to fetch contact statistics',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   POST /api/crm/import
 * @desc    Import contacts from CSV
 * @access  Private (Admin only)
 */
router.post('/import',
  authMiddleware,
  requireRole('admin'),
  auditSensitiveOperation('IMPORT_CONTACTS'),
  async (req, res) => {
    try {
      const { csvData } = req.body;

      if (!csvData || !Array.isArray(csvData)) {
        return res.status(400).json({
          error: 'Invalid CSV data format'
        });
      }

      const results = await CRMService.importContacts(csvData, req.user.id);

      res.json({
        success: true,
        message: `Import completed: ${results.created} created, ${results.updated} updated, ${results.skipped} skipped`,
        results
      });
    } catch (error) {
      console.error('Import contacts error:', error);

      res.status(500).json({
        error: 'Failed to import contacts',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   GET /api/crm/export
 * @desc    Export contacts to CSV
 * @access  Private (Staff/Admin)
 */
router.get('/export',
  authMiddleware,
  requireRole('staff', 'admin'),
  async (req, res) => {
    try {
      const { contactType, status, tags } = req.query;

      const filters = {
        contactType,
        status,
        tags: tags ? tags.split(',') : null
      };

      const csv = await CRMService.exportContacts(filters);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="contacts-export-${Date.now()}.csv"`);
      res.send(csv);
    } catch (error) {
      console.error('Export contacts error:', error);

      res.status(500).json({
        error: 'Failed to export contacts',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   GET /api/crm/interactions
 * @desc    Get all interactions (with filters)
 * @access  Private (Staff/Admin)
 */
router.get('/interactions',
  authMiddleware,
  requireRole('staff', 'admin', 'inspector'),
  async (req, res) => {
    try {
      const { contactId, type, handledBy, page = 1, limit = 50 } = req.query;
      const offset = (page - 1) * limit;

      const where = {};

      if (contactId) {
        where.contactId = contactId;
      }

      if (type) {
        where.type = type;
      }

      if (handledBy) {
        where.handledBy = handledBy;
      }

      const { count, rows: interactions } = await ContactInteraction.findAndCountAll({
        where,
        include: [
          {
            model: Contact,
            as: 'contact',
            attributes: ['id', 'firstName', 'lastName', 'email']
          },
          {
            model: User,
            as: 'handler',
            attributes: ['id', 'name']
          }
        ],
        order: [['createdAt', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      res.json({
        success: true,
        interactions,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit)
        }
      });
    } catch (error) {
      console.error('Get interactions error:', error);

      res.status(500).json({
        error: 'Failed to fetch interactions',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

module.exports = router;
