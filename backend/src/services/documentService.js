const { Document, Permit, User } = require('../models');
const { Op } = require('sequelize');
const ocrService = require('./ocrService');
const aiService = require('./aiService');
const config = require('../config/config');

/**
 * Document Service
 * Comprehensive document management with AI-powered categorization
 */
class DocumentService {
  /**
   * Document templates per permit type
   * Defines required and optional documents
   */
  static DOCUMENT_TEMPLATES = {
    building: {
      required: [
        { category: 'blueprint', name: 'Site Plan', description: 'Detailed site layout and building placement' },
        { category: 'blueprint', name: 'Floor Plans', description: 'All floor layouts with dimensions' },
        { category: 'blueprint', name: 'Elevation Drawings', description: 'Building elevations from all sides' }
      ],
      optional: [
        { category: 'report', name: 'Soil Report', description: 'Geotechnical soil analysis' },
        { category: 'report', name: 'Energy Compliance', description: 'Energy efficiency calculations' },
        { category: 'photo', name: 'Site Photos', description: 'Current site condition photographs' }
      ]
    },
    electrical: {
      required: [
        { category: 'blueprint', name: 'Electrical Plan', description: 'Single-line diagram and panel schedule' },
        { category: 'report', name: 'Load Calculation', description: 'Electrical load calculations' }
      ],
      optional: [
        { category: 'certification', name: 'Electrician License', description: 'Licensed electrician certification' }
      ]
    },
    plumbing: {
      required: [
        { category: 'blueprint', name: 'Plumbing Plan', description: 'Water supply and drainage layout' },
        { category: 'report', name: 'Fixture Schedule', description: 'List of all plumbing fixtures' }
      ],
      optional: [
        { category: 'certification', name: 'Plumber License', description: 'Licensed plumber certification' }
      ]
    },
    demolition: {
      required: [
        { category: 'blueprint', name: 'Demolition Plan', description: 'What will be demolished' },
        { category: 'report', name: 'Hazardous Materials Report', description: 'Asbestos, lead paint assessment' },
        { category: 'report', name: 'Waste Disposal Plan', description: 'How debris will be handled' }
      ],
      optional: [
        { category: 'photo', name: 'Pre-Demolition Photos', description: 'Current structure photographs' }
      ]
    },
    zoning: {
      required: [
        { category: 'blueprint', name: 'Site Plan', description: 'Property layout and use' },
        { category: 'report', name: 'Variance Justification', description: 'Reason for zoning variance' }
      ],
      optional: [
        { category: 'report', name: 'Traffic Study', description: 'Traffic impact analysis' },
        { category: 'report', name: 'Environmental Impact', description: 'Environmental assessment' }
      ]
    },
    general: {
      required: [
        { category: 'application', name: 'Permit Application', description: 'Completed permit application form' }
      ],
      optional: []
    }
  };

  /**
   * Get required documents for permit type
   * @param {string} permitType - Type of permit
   * @returns {Array} Required documents
   */
  static getRequiredDocuments(permitType) {
    const template = this.DOCUMENT_TEMPLATES[permitType] || this.DOCUMENT_TEMPLATES.general;
    return template.required;
  }

  /**
   * Get optional documents for permit type
   * @param {string} permitType - Type of permit
   * @returns {Array} Optional documents
   */
  static getOptionalDocuments(permitType) {
    const template = this.DOCUMENT_TEMPLATES[permitType] || this.DOCUMENT_TEMPLATES.general;
    return template.optional;
  }

  /**
   * Check if permit has all required documents
   * @param {string} permitId - Permit ID
   * @returns {Promise<Object>} Validation result
   */
  static async validatePermitDocuments(permitId) {
    try {
      const permit = await Permit.findByPk(permitId);
      if (!permit) {
        throw new Error('Permit not found');
      }

      const documents = await Document.findAll({
        where: { permitId },
        attributes: ['category', 'originalName', 'processed', 'ocrText']
      });

      const requiredDocs = this.getRequiredDocuments(permit.type);
      const missingDocs = [];
      const foundDocs = [];

      requiredDocs.forEach(reqDoc => {
        const found = documents.find(doc => doc.category === reqDoc.category);
        if (found) {
          foundDocs.push({
            ...reqDoc,
            fileName: found.originalName,
            processed: found.processed
          });
        } else {
          missingDocs.push(reqDoc);
        }
      });

      const isComplete = missingDocs.length === 0;
      const completionRate = (foundDocs.length / requiredDocs.length) * 100;

      return {
        isComplete,
        completionRate: completionRate.toFixed(1),
        totalRequired: requiredDocs.length,
        foundDocuments: foundDocs.length,
        missingDocuments: missingDocs,
        documents: foundDocs
      };
    } catch (error) {
      console.error('Validate permit documents error:', error);
      throw error;
    }
  }

  /**
   * Auto-categorize document using AI
   * @param {Object} document - Document object
   * @returns {Promise<string>} Detected category
   */
  static async categorizeDocument(document) {
    try {
      // If OCR text is available, use it for categorization
      if (document.ocrText && config.ai.features.enableClassification) {
        const prompt = `Analyze this document text and categorize it into one of these categories:
        - blueprint (architectural drawings, plans, elevations)
        - report (technical reports, calculations, assessments)
        - photo (photographs, images)
        - certification (licenses, certificates, credentials)
        - application (forms, applications)
        - other (anything else)

        Document text: ${document.ocrText.substring(0, 1000)}

        Respond with ONLY the category name, nothing else.`;

        const response = await aiService.generateText(prompt, {
          maxTokens: 50,
          temperature: 0.1
        });

        const category = response.text.trim().toLowerCase();

        // Validate category
        const validCategories = ['blueprint', 'report', 'photo', 'certification', 'application', 'other'];
        if (validCategories.includes(category)) {
          return category;
        }
      }

      // Fallback: Categorize by file type
      return this.categorizByFileType(document.fileType, document.originalName);
    } catch (error) {
      console.error('Auto-categorize error:', error);
      return this.categorizeByFileType(document.fileType, document.originalName);
    }
  }

  /**
   * Categorize document by file type and name
   * @param {string} fileType - MIME type
   * @param {string} fileName - Original filename
   * @returns {string} Category
   */
  static categorizeByFileType(fileType, fileName) {
    const nameLower = fileName.toLowerCase();

    // Check filename keywords
    if (nameLower.includes('plan') || nameLower.includes('blueprint') || nameLower.includes('drawing')) {
      return 'blueprint';
    }
    if (nameLower.includes('report') || nameLower.includes('calculation') || nameLower.includes('assessment')) {
      return 'report';
    }
    if (nameLower.includes('license') || nameLower.includes('cert') || nameLower.includes('credential')) {
      return 'certification';
    }
    if (nameLower.includes('application') || nameLower.includes('form')) {
      return 'application';
    }

    // Check file type
    if (fileType.startsWith('image/')) {
      return 'photo';
    }
    if (fileType === 'application/pdf') {
      return 'report'; // Default PDFs to reports
    }

    return 'other';
  }

  /**
   * Extract key information from document using AI
   * @param {Object} document - Document object
   * @returns {Promise<Object>} Extracted data
   */
  static async extractDocumentData(document) {
    try {
      if (!document.ocrText || !config.ai.features.enableExtraction) {
        return null;
      }

      const prompt = `Extract key information from this document. Look for:
      - Applicant name
      - Applicant email
      - Applicant phone
      - Property address
      - Project description
      - Dates
      - Important measurements or values

      Document text:
      ${document.ocrText}

      Respond in JSON format with keys: applicantName, applicantEmail, applicantPhone, propertyAddress, description, dates, measurements.
      If information is not found, use null for that field.`;

      const response = await aiService.generateText(prompt, {
        maxTokens: 500,
        temperature: 0.1
      });

      try {
        // Extract JSON from response
        const jsonMatch = response.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      } catch (parseError) {
        console.error('Failed to parse AI extraction response:', parseError);
      }

      return null;
    } catch (error) {
      console.error('Extract document data error:', error);
      return null;
    }
  }

  /**
   * Process document with OCR and AI categorization
   * @param {Object} document - Document object
   * @returns {Promise<Object>} Processing result
   */
  static async processDocument(document) {
    try {
      const result = {
        ocrCompleted: false,
        categorized: false,
        extracted: false,
        category: document.category,
        extractedData: null
      };

      // Step 1: OCR Processing
      if (!document.processed && config.ai.features.enableOCR) {
        console.log(`🔄 Processing document ${document.id} with OCR...`);

        const ocrResult = await ocrService.processDocument(document.filePath, document.fileType);

        if (ocrResult.processed && ocrResult.text) {
          await document.update({
            ocrText: ocrResult.text,
            ocrMetadata: {
              confidence: ocrResult.confidence,
              words: ocrResult.words,
              lines: ocrResult.lines,
              language: ocrResult.language,
              processedAt: new Date()
            },
            processed: true,
            processedAt: new Date()
          });

          result.ocrCompleted = true;
          console.log(`✅ OCR completed for document ${document.id}: ${ocrResult.words} words`);
        }
      }

      // Step 2: Auto-categorization
      if (!document.category && document.ocrText) {
        const category = await this.categorizeDocument(document);
        await document.update({ category });
        result.category = category;
        result.categorized = true;
        console.log(`✅ Document ${document.id} categorized as: ${category}`);
      }

      // Step 3: Data extraction
      if (document.ocrText && config.ai.features.enableExtraction) {
        const extractedData = await this.extractDocumentData(document);
        if (extractedData) {
          await document.update({
            metadata: {
              ...document.metadata,
              extractedData,
              extractedAt: new Date()
            }
          });
          result.extractedData = extractedData;
          result.extracted = true;
          console.log(`✅ Data extracted from document ${document.id}`);
        }
      }

      return result;
    } catch (error) {
      console.error('Process document error:', error);
      throw error;
    }
  }

  /**
   * Get document statistics for permit
   * @param {string} permitId - Permit ID
   * @returns {Promise<Object>} Document statistics
   */
  static async getPermitDocumentStats(permitId) {
    try {
      const documents = await Document.findAll({
        where: { permitId },
        attributes: ['category', 'fileType', 'fileSize', 'processed']
      });

      const stats = {
        total: documents.length,
        byCategory: {},
        byFileType: {},
        totalSize: 0,
        processed: 0,
        unprocessed: 0
      };

      documents.forEach(doc => {
        // Count by category
        if (doc.category) {
          stats.byCategory[doc.category] = (stats.byCategory[doc.category] || 0) + 1;
        }

        // Count by file type
        stats.byFileType[doc.fileType] = (stats.byFileType[doc.fileType] || 0) + 1;

        // Total size
        stats.totalSize += doc.fileSize || 0;

        // Processed count
        if (doc.processed) {
          stats.processed++;
        } else {
          stats.unprocessed++;
        }
      });

      // Convert total size to MB
      stats.totalSizeMB = (stats.totalSize / (1024 * 1024)).toFixed(2);

      return stats;
    } catch (error) {
      console.error('Get document stats error:', error);
      throw error;
    }
  }

  /**
   * Search documents by OCR text
   * @param {string} query - Search query
   * @param {Object} filters - Additional filters
   * @returns {Promise<Array>} Matching documents
   */
  static async searchDocuments(query, filters = {}) {
    try {
      const where = {
        ocrText: {
          [Op.iLike]: `%${query}%`
        }
      };

      if (filters.permitId) {
        where.permitId = filters.permitId;
      }

      if (filters.category) {
        where.category = filters.category;
      }

      if (filters.uploadedBy) {
        where.uploadedBy = filters.uploadedBy;
      }

      const documents = await Document.findAll({
        where,
        include: [
          {
            model: Permit,
            as: 'permit',
            attributes: ['id', 'permitNumber', 'type']
          },
          {
            model: User,
            as: 'uploader',
            attributes: ['id', 'name', 'email']
          }
        ],
        order: [['createdAt', 'DESC']],
        limit: 50
      });

      return documents;
    } catch (error) {
      console.error('Search documents error:', error);
      throw error;
    }
  }

  /**
   * Bulk process documents for a permit
   * @param {string} permitId - Permit ID
   * @returns {Promise<Object>} Processing summary
   */
  static async bulkProcessPermitDocuments(permitId) {
    try {
      const documents = await Document.findAll({
        where: {
          permitId,
          processed: false
        }
      });

      const results = {
        total: documents.length,
        successful: 0,
        failed: 0,
        errors: []
      };

      for (const document of documents) {
        try {
          await this.processDocument(document);
          results.successful++;
        } catch (error) {
          results.failed++;
          results.errors.push({
            documentId: document.id,
            error: error.message
          });
        }
      }

      return results;
    } catch (error) {
      console.error('Bulk process error:', error);
      throw error;
    }
  }
}

module.exports = DocumentService;
