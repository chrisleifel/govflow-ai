const { Contact, ContactInteraction, Permit, User } = require('../models');
const { Op } = require('sequelize');

/**
 * CRM Service
 * Comprehensive contact and relationship management
 */
class CRMService {
  /**
   * Create or update contact from permit application
   * @param {Object} permitData - Permit application data
   * @returns {Promise<Object>} Contact object
   */
  static async createOrUpdateFromPermit(permitData) {
    try {
      const { applicantName, applicantEmail, applicantPhone, propertyAddress } = permitData;

      // Parse name (handle "First Last" format)
      const nameParts = (applicantName || '').trim().split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      // Check if contact exists by email
      let contact = null;
      if (applicantEmail) {
        contact = await Contact.findOne({ where: { email: applicantEmail } });
      }

      if (contact) {
        // Update existing contact
        await contact.update({
          lastContactDate: new Date(),
          totalInteractions: contact.totalInteractions + 1,
          source: contact.source || 'permit_application'
        });
      } else {
        // Create new contact
        contact = await Contact.create({
          firstName,
          lastName,
          email: applicantEmail,
          phone: applicantPhone,
          address: propertyAddress,
          contactType: 'citizen',
          source: 'permit_application',
          sourceDetails: 'Created from permit application',
          lastContactDate: new Date(),
          totalInteractions: 1,
          tags: ['permit_applicant']
        });
      }

      return contact;
    } catch (error) {
      console.error('Create/update contact from permit error:', error);
      throw error;
    }
  }

  /**
   * Log interaction with contact
   * @param {Object} data - Interaction data
   * @returns {Promise<Object>} ContactInteraction object
   */
  static async logInteraction(data) {
    try {
      const {
        contactId,
        type,
        direction = 'system',
        subject,
        content,
        outcome = 'successful',
        permitId,
        inspectionId,
        documentId,
        paymentId,
        handledBy,
        metadata = {}
      } = data;

      // Create interaction
      const interaction = await ContactInteraction.create({
        contactId,
        type,
        direction,
        subject,
        content,
        outcome,
        status: 'completed',
        completedDate: new Date(),
        permitId,
        inspectionId,
        documentId,
        paymentId,
        handledBy,
        metadata,
        createdBy: handledBy
      });

      // Update contact's last contact date and interaction count
      const contact = await Contact.findByPk(contactId);
      if (contact) {
        await contact.update({
          lastContactDate: new Date(),
          totalInteractions: contact.totalInteractions + 1
        });
      }

      return interaction;
    } catch (error) {
      console.error('Log interaction error:', error);
      throw error;
    }
  }

  /**
   * Search contacts with advanced filters
   * @param {Object} filters - Search filters
   * @returns {Promise<Array>} Matching contacts
   */
  static async searchContacts(filters = {}) {
    try {
      const {
        query,
        contactType,
        status,
        tags,
        source,
        hasEmail,
        hasPhone,
        limit = 50,
        offset = 0
      } = filters;

      const where = {};

      // Text search across name, email, organization
      if (query) {
        where[Op.or] = [
          { firstName: { [Op.iLike]: `%${query}%` } },
          { lastName: { [Op.iLike]: `%${query}%` } },
          { email: { [Op.iLike]: `%${query}%` } },
          { organization: { [Op.iLike]: `%${query}%` } },
          { phone: { [Op.iLike]: `%${query}%` } }
        ];
      }

      // Filter by contact type
      if (contactType) {
        where.contactType = contactType;
      }

      // Filter by status
      if (status) {
        where.status = status;
      } else {
        // Default: exclude archived
        where.status = { [Op.ne]: 'archived' };
      }

      // Filter by tags
      if (tags && tags.length > 0) {
        where.tags = { [Op.overlap]: tags };
      }

      // Filter by source
      if (source) {
        where.source = source;
      }

      // Filter by has email
      if (hasEmail) {
        where.email = { [Op.ne]: null };
      }

      // Filter by has phone
      if (hasPhone) {
        where.phone = { [Op.ne]: null };
      }

      // Exclude duplicates (only show primary contacts)
      where.duplicateOf = null;

      const contacts = await Contact.findAll({
        where,
        include: [
          {
            model: User,
            as: 'linkedUser',
            attributes: ['id', 'email', 'role']
          }
        ],
        order: [['lastName', 'ASC'], ['firstName', 'ASC']],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      return contacts;
    } catch (error) {
      console.error('Search contacts error:', error);
      throw error;
    }
  }

  /**
   * Find potential duplicate contacts
   * @param {string} contactId - Contact ID to check for duplicates
   * @returns {Promise<Array>} Potential duplicates
   */
  static async findPotentialDuplicates(contactId) {
    try {
      const contact = await Contact.findByPk(contactId);
      if (!contact) {
        throw new Error('Contact not found');
      }

      const potentialDuplicates = [];

      // Exact email match
      if (contact.email) {
        const emailMatches = await Contact.findAll({
          where: {
            email: contact.email,
            id: { [Op.ne]: contactId },
            duplicateOf: null
          }
        });
        potentialDuplicates.push(...emailMatches);
      }

      // Exact phone match
      if (contact.phone) {
        const phoneMatches = await Contact.findAll({
          where: {
            phone: contact.phone,
            id: { [Op.ne]: contactId },
            duplicateOf: null
          }
        });
        potentialDuplicates.push(...phoneMatches);
      }

      // Name similarity (same first and last name)
      const nameMatches = await Contact.findAll({
        where: {
          firstName: { [Op.iLike]: contact.firstName },
          lastName: { [Op.iLike]: contact.lastName },
          id: { [Op.ne]: contactId },
          duplicateOf: null
        }
      });
      potentialDuplicates.push(...nameMatches);

      // Remove duplicates from array and return unique contacts
      const uniqueIds = new Set();
      return potentialDuplicates.filter(dup => {
        if (uniqueIds.has(dup.id)) {
          return false;
        }
        uniqueIds.add(dup.id);
        return true;
      });
    } catch (error) {
      console.error('Find potential duplicates error:', error);
      throw error;
    }
  }

  /**
   * Merge duplicate contacts
   * @param {string} primaryContactId - Primary contact to keep
   * @param {string} duplicateContactId - Duplicate contact to merge
   * @returns {Promise<Object>} Merged contact
   */
  static async mergeDuplicates(primaryContactId, duplicateContactId) {
    try {
      const primaryContact = await Contact.findByPk(primaryContactId);
      const duplicateContact = await Contact.findByPk(duplicateContactId);

      if (!primaryContact || !duplicateContact) {
        throw new Error('One or both contacts not found');
      }

      // Merge data from duplicate into primary (keep non-null values)
      const mergedData = {
        phone: primaryContact.phone || duplicateContact.phone,
        alternatePhone: primaryContact.alternatePhone || duplicateContact.alternatePhone,
        organization: primaryContact.organization || duplicateContact.organization,
        title: primaryContact.title || duplicateContact.title,
        department: primaryContact.department || duplicateContact.department,
        address: primaryContact.address || duplicateContact.address,
        city: primaryContact.city || duplicateContact.city,
        state: primaryContact.state || duplicateContact.state,
        zipCode: primaryContact.zipCode || duplicateContact.zipCode,
        website: primaryContact.website || duplicateContact.website,
        linkedIn: primaryContact.linkedIn || duplicateContact.linkedIn,
        notes: primaryContact.notes
          ? (duplicateContact.notes ? `${primaryContact.notes}\n\n--- Merged from duplicate ---\n${duplicateContact.notes}` : primaryContact.notes)
          : duplicateContact.notes,
        tags: [...new Set([...primaryContact.tags, ...duplicateContact.tags])],
        totalInteractions: primaryContact.totalInteractions + duplicateContact.totalInteractions
      };

      // Update primary contact
      await primaryContact.update(mergedData);

      // Move all interactions from duplicate to primary
      await ContactInteraction.update(
        { contactId: primaryContactId },
        { where: { contactId: duplicateContactId } }
      );

      // Mark duplicate as merged
      await duplicateContact.update({
        duplicateOf: primaryContactId,
        status: 'archived'
      });

      console.log(`✅ Merged contact ${duplicateContactId} into ${primaryContactId}`);

      return primaryContact;
    } catch (error) {
      console.error('Merge duplicates error:', error);
      throw error;
    }
  }

  /**
   * Get contact with full interaction history
   * @param {string} contactId - Contact ID
   * @returns {Promise<Object>} Contact with interactions
   */
  static async getContactWithHistory(contactId) {
    try {
      const contact = await Contact.findByPk(contactId, {
        include: [
          {
            model: User,
            as: 'linkedUser',
            attributes: ['id', 'name', 'email', 'role']
          },
          {
            model: ContactInteraction,
            as: 'interactions',
            include: [
              {
                model: User,
                as: 'handler',
                attributes: ['id', 'name']
              },
              {
                model: Permit,
                as: 'permit',
                attributes: ['id', 'permitNumber', 'type', 'status']
              }
            ],
            order: [['createdAt', 'DESC']],
            limit: 100
          },
          {
            model: Permit,
            as: 'permits',
            attributes: ['id', 'permitNumber', 'type', 'status', 'createdAt']
          },
          {
            model: Contact,
            as: 'duplicates',
            attributes: ['id', 'firstName', 'lastName', 'email']
          }
        ]
      });

      return contact;
    } catch (error) {
      console.error('Get contact with history error:', error);
      throw error;
    }
  }

  /**
   * Get contact statistics
   * @param {Object} filters - Optional filters
   * @returns {Promise<Object>} Statistics
   */
  static async getContactStats(filters = {}) {
    try {
      const where = { duplicateOf: null }; // Exclude duplicates

      if (filters.contactType) {
        where.contactType = filters.contactType;
      }

      const total = await Contact.count({ where });

      const byType = await Contact.findAll({
        where,
        attributes: [
          'contactType',
          [Contact.sequelize.fn('COUNT', Contact.sequelize.col('id')), 'count']
        ],
        group: ['contactType'],
        raw: true
      });

      const byStatus = await Contact.findAll({
        where,
        attributes: [
          'status',
          [Contact.sequelize.fn('COUNT', Contact.sequelize.col('id')), 'count']
        ],
        group: ['status'],
        raw: true
      });

      const withEmail = await Contact.count({
        where: {
          ...where,
          email: { [Op.ne]: null }
        }
      });

      const withPhone = await Contact.count({
        where: {
          ...where,
          phone: { [Op.ne]: null }
        }
      });

      const recentlyActive = await Contact.count({
        where: {
          ...where,
          lastContactDate: {
            [Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
          }
        }
      });

      return {
        total,
        byType: byType.reduce((acc, item) => {
          acc[item.contactType] = parseInt(item.count);
          return acc;
        }, {}),
        byStatus: byStatus.reduce((acc, item) => {
          acc[item.status] = parseInt(item.count);
          return acc;
        }, {}),
        withEmail,
        withPhone,
        contactability: total > 0 ? ((withEmail + withPhone) / total * 100).toFixed(1) : 0,
        recentlyActive
      };
    } catch (error) {
      console.error('Get contact stats error:', error);
      throw error;
    }
  }

  /**
   * Import contacts from CSV data
   * @param {Array} csvData - Array of contact objects
   * @param {string} userId - User performing import
   * @returns {Promise<Object>} Import results
   */
  static async importContacts(csvData, userId) {
    try {
      const results = {
        total: csvData.length,
        created: 0,
        updated: 0,
        skipped: 0,
        errors: []
      };

      for (const row of csvData) {
        try {
          const { firstName, lastName, email, phone, organization, contactType = 'citizen' } = row;

          // Skip if missing required fields
          if (!firstName || !lastName) {
            results.skipped++;
            continue;
          }

          // Check if contact exists
          let contact = null;
          if (email) {
            contact = await Contact.findOne({ where: { email } });
          }

          if (contact) {
            // Update existing
            await contact.update({
              phone: phone || contact.phone,
              organization: organization || contact.organization,
              updatedBy: userId
            });
            results.updated++;
          } else {
            // Create new
            contact = await Contact.create({
              firstName,
              lastName,
              email,
              phone,
              organization,
              contactType,
              source: 'csv_import',
              createdBy: userId
            });
            results.created++;
          }
        } catch (error) {
          results.errors.push({
            row,
            error: error.message
          });
        }
      }

      return results;
    } catch (error) {
      console.error('Import contacts error:', error);
      throw error;
    }
  }

  /**
   * Export contacts to CSV format
   * @param {Object} filters - Search filters
   * @returns {Promise<string>} CSV string
   */
  static async exportContacts(filters = {}) {
    try {
      const contacts = await this.searchContacts({ ...filters, limit: 10000 });

      // CSV headers
      const headers = [
        'First Name',
        'Last Name',
        'Email',
        'Phone',
        'Organization',
        'Title',
        'Contact Type',
        'Status',
        'Address',
        'City',
        'State',
        'Zip Code',
        'Last Contact Date',
        'Total Interactions',
        'Tags',
        'Source'
      ];

      // CSV rows
      const rows = contacts.map(contact => [
        contact.firstName,
        contact.lastName,
        contact.email || '',
        contact.phone || '',
        contact.organization || '',
        contact.title || '',
        contact.contactType,
        contact.status,
        contact.address || '',
        contact.city || '',
        contact.state || '',
        contact.zipCode || '',
        contact.lastContactDate ? new Date(contact.lastContactDate).toISOString().split('T')[0] : '',
        contact.totalInteractions,
        contact.tags.join('; '),
        contact.source || ''
      ]);

      // Build CSV
      const csv = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      ].join('\n');

      return csv;
    } catch (error) {
      console.error('Export contacts error:', error);
      throw error;
    }
  }
}

module.exports = CRMService;
