const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const config = require('../config/config');
const { Document, Permit, Inspection, User } = require('../models');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { upload, handleUploadError } = require('../middleware/upload');
const { uploadLimiter } = require('../middleware/rateLimiter');
const { auditSensitiveOperation } = require('../middleware/auditLog');
const NotificationService = require('../services/notificationService');
const ocrService = require('../services/ocrService');
const DocumentService = require('../services/documentService');

/**
 * @route   GET /api/documents
 * @desc    Get all documents (filtered by permissions)
 * @access  Private
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 10, permitId, inspectionId } = req.query;
    const offset = (page - 1) * limit;

    const where = {};

    // Filter by permit or inspection
    if (permitId) {
      where.permitId = permitId;
    }
    if (inspectionId) {
      where.inspectionId = inspectionId;
    }

    // Citizens can only see documents for their permits
    if (req.user.role === 'citizen') {
      const permits = await Permit.findAll({
        where: { applicantEmail: req.user.email },
        attributes: ['id']
      });
      where.permitId = permits.map(p => p.id);
    }

    const { count, rows: documents } = await Document.findAndCountAll({
      where,
      include: [
        {
          model: Permit,
          as: 'permit',
          attributes: ['id', 'permitNumber']
        },
        {
          model: User,
          as: 'uploader',
          attributes: ['id', 'name']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      documents,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Get documents error:', error);

    res.status(500).json({
      error: 'Failed to fetch documents',
      message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
    });
  }
});

/**
 * @route   GET /api/documents/:id
 * @desc    Get single document metadata
 * @access  Private
 */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const document = await Document.findByPk(req.params.id, {
      include: [
        {
          model: Permit,
          as: 'permit',
          attributes: ['id', 'permitNumber', 'applicantEmail']
        },
        {
          model: User,
          as: 'uploader',
          attributes: ['id', 'name', 'email']
        }
      ]
    });

    if (!document) {
      return res.status(404).json({
        error: 'Document not found'
      });
    }

    // Check permissions
    if (req.user.role === 'citizen' &&
        document.permit &&
        document.permit.applicantEmail !== req.user.email) {
      return res.status(403).json({
        error: 'Access denied'
      });
    }

    res.json({
      success: true,
      document
    });
  } catch (error) {
    console.error('Get document error:', error);

    res.status(500).json({
      error: 'Failed to fetch document',
      message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
    });
  }
});

/**
 * @route   GET /api/documents/:id/download
 * @desc    Download a document file
 * @access  Private
 */
router.get('/:id/download', authMiddleware, async (req, res) => {
  try {
    const document = await Document.findByPk(req.params.id, {
      include: [{
        model: Permit,
        as: 'permit',
        attributes: ['applicantEmail']
      }]
    });

    if (!document) {
      return res.status(404).json({
        error: 'Document not found'
      });
    }

    // Check permissions
    if (req.user.role === 'citizen' &&
        document.permit &&
        document.permit.applicantEmail !== req.user.email) {
      return res.status(403).json({
        error: 'Access denied'
      });
    }

    // Check if file exists
    const filePath = path.resolve(document.filePath);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        error: 'File not found on server'
      });
    }

    console.log(`📥 Document downloaded: ${document.id} by ${req.user.email}`);

    // Send file
    res.download(filePath, document.originalName, (err) => {
      if (err) {
        console.error('Download error:', err);
        if (!res.headersSent) {
          res.status(500).json({
            error: 'Download failed',
            message: config.nodeEnv === 'development' ? err.message : 'An error occurred'
          });
        }
      }
    });
  } catch (error) {
    console.error('Download document error:', error);

    res.status(500).json({
      error: 'Failed to download document',
      message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
    });
  }
});

/**
 * @route   POST /api/documents/upload
 * @desc    Upload a document
 * @access  Private
 */
router.post('/upload',
  authMiddleware,
  uploadLimiter,
  upload.single('file'),
  handleUploadError,
  auditSensitiveOperation('UPLOAD_DOCUMENT'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: 'No file uploaded',
          message: 'Please select a file to upload'
        });
      }

      const { permitId, inspectionId, category, description } = req.body;

      // Verify permit exists if specified
      let permit = null;
      if (permitId) {
        permit = await Permit.findByPk(permitId);
        if (!permit) {
          // Clean up uploaded file
          fs.unlinkSync(req.file.path);
          return res.status(404).json({
            error: 'Permit not found'
          });
        }

        // Citizens can only upload to their own permits
        if (req.user.role === 'citizen' && permit.applicantEmail !== req.user.email) {
          fs.unlinkSync(req.file.path);
          return res.status(403).json({
            error: 'Access denied',
            message: 'You can only upload documents to your own permits'
          });
        }
      }

      // Verify inspection exists if specified
      if (inspectionId) {
        const inspection = await Inspection.findByPk(inspectionId);
        if (!inspection) {
          fs.unlinkSync(req.file.path);
          return res.status(404).json({
            error: 'Inspection not found'
          });
        }
      }

      // Create document record
      const document = await Document.create({
        permitId: permitId || null,
        inspectionId: inspectionId || null,
        fileName: req.file.filename,
        originalName: req.file.originalname,
        filePath: req.file.path,
        fileType: req.file.mimetype,
        fileSize: req.file.size,
        category: category || null,
        description: description || null,
        uploadedBy: req.user.id,
        metadata: {
          encoding: req.file.encoding,
          destination: req.file.destination
        }
      });

      console.log(`✅ Document uploaded: ${document.id} - ${req.file.originalname} by ${req.user.email}`);

      res.status(201).json({
        success: true,
        message: 'Document uploaded successfully',
        document: {
          id: document.id,
          fileName: document.fileName,
          originalName: document.originalName,
          fileType: document.fileType,
          fileSize: document.fileSize,
          category: document.category,
          createdAt: document.createdAt
        }
      });

      // Send notification if document uploaded to a permit
      if (permit) {
        NotificationService.notifyDocumentUploaded(document, permit, req.user)
          .catch(err => console.error('Failed to send document upload notification:', err));
      }

      // Trigger OCR processing in background (don't await)
      processDocumentOCR(document)
        .catch(err => console.error('Background OCR processing failed:', err));
    } catch (error) {
      // Clean up file on error
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }

      console.error('Upload document error:', error);

      res.status(500).json({
        error: 'Failed to upload document',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   DELETE /api/documents/:id
 * @desc    Delete a document (soft delete)
 * @access  Private (Staff/Admin or owner)
 */
router.delete('/:id',
  authMiddleware,
  auditSensitiveOperation('DELETE_DOCUMENT'),
  async (req, res) => {
    try {
      const document = await Document.findByPk(req.params.id, {
        include: [{
          model: Permit,
          as: 'permit',
          attributes: ['applicantEmail']
        }]
      });

      if (!document) {
        return res.status(404).json({
          error: 'Document not found'
        });
      }

      // Check permissions - only uploader, admin, or staff can delete
      const canDelete =
        req.user.role === 'admin' ||
        req.user.role === 'staff' ||
        document.uploadedBy === req.user.id;

      if (!canDelete) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You can only delete your own documents'
        });
      }

      // Soft delete (paranoid model)
      await document.destroy();

      console.log(`✅ Document deleted: ${document.id} by ${req.user.email}`);

      res.json({
        success: true,
        message: 'Document deleted successfully'
      });

      // Note: File remains on disk for recovery purposes
      // TODO: Implement permanent file deletion after retention period
    } catch (error) {
      console.error('Delete document error:', error);

      res.status(500).json({
        error: 'Failed to delete document',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   GET /api/documents/requirements/:permitType
 * @desc    Get required documents for permit type
 * @access  Public
 */
router.get('/requirements/:permitType', async (req, res) => {
  try {
    const { permitType } = req.params;

    const required = DocumentService.getRequiredDocuments(permitType);
    const optional = DocumentService.getOptionalDocuments(permitType);

    res.json({
      success: true,
      permitType,
      required,
      optional,
      totalRequired: required.length
    });
  } catch (error) {
    console.error('Get requirements error:', error);

    res.status(500).json({
      error: 'Failed to fetch requirements',
      message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
    });
  }
});

/**
 * @route   GET /api/documents/validate/:permitId
 * @desc    Validate permit has all required documents
 * @access  Private
 */
router.get('/validate/:permitId', authMiddleware, async (req, res) => {
  try {
    const validation = await DocumentService.validatePermitDocuments(req.params.permitId);

    res.json({
      success: true,
      validation
    });
  } catch (error) {
    console.error('Validate documents error:', error);

    res.status(500).json({
      error: 'Failed to validate documents',
      message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
    });
  }
});

/**
 * @route   GET /api/documents/stats/:permitId
 * @desc    Get document statistics for permit
 * @access  Private
 */
router.get('/stats/:permitId', authMiddleware, async (req, res) => {
  try {
    const stats = await DocumentService.getPermitDocumentStats(req.params.permitId);

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Get document stats error:', error);

    res.status(500).json({
      error: 'Failed to fetch document statistics',
      message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
    });
  }
});

/**
 * @route   POST /api/documents/:id/categorize
 * @desc    Auto-categorize a document using AI
 * @access  Private (Staff/Admin)
 */
router.post('/:id/categorize',
  authMiddleware,
  requireRole('staff', 'admin', 'inspector'),
  async (req, res) => {
    try {
      const document = await Document.findByPk(req.params.id);

      if (!document) {
        return res.status(404).json({
          error: 'Document not found'
        });
      }

      const category = await DocumentService.categorizeDocument(document);
      await document.update({ category });

      console.log(`✅ Document ${document.id} categorized as: ${category}`);

      res.json({
        success: true,
        category,
        message: `Document categorized as: ${category}`
      });
    } catch (error) {
      console.error('Categorize document error:', error);

      res.status(500).json({
        error: 'Failed to categorize document',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   POST /api/documents/:id/process
 * @desc    Process document with OCR and AI
 * @access  Private (Staff/Admin)
 */
router.post('/:id/process',
  authMiddleware,
  requireRole('staff', 'admin', 'inspector'),
  async (req, res) => {
    try {
      const document = await Document.findByPk(req.params.id);

      if (!document) {
        return res.status(404).json({
          error: 'Document not found'
        });
      }

      const result = await DocumentService.processDocument(document);

      res.json({
        success: true,
        result,
        message: 'Document processed successfully'
      });
    } catch (error) {
      console.error('Process document error:', error);

      res.status(500).json({
        error: 'Failed to process document',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   POST /api/documents/bulk-process/:permitId
 * @desc    Bulk process all documents for a permit
 * @access  Private (Staff/Admin)
 */
router.post('/bulk-process/:permitId',
  authMiddleware,
  requireRole('staff', 'admin'),
  async (req, res) => {
    try {
      const results = await DocumentService.bulkProcessPermitDocuments(req.params.permitId);

      res.json({
        success: true,
        results,
        message: `Processed ${results.successful} of ${results.total} documents`
      });
    } catch (error) {
      console.error('Bulk process error:', error);

      res.status(500).json({
        error: 'Failed to bulk process documents',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   GET /api/documents/search
 * @desc    Search documents by OCR text
 * @access  Private (Staff/Admin)
 */
router.get('/search',
  authMiddleware,
  requireRole('staff', 'admin', 'inspector'),
  async (req, res) => {
    try {
      const { query, permitId, category, uploadedBy } = req.query;

      if (!query) {
        return res.status(400).json({
          error: 'Search query is required'
        });
      }

      const filters = { permitId, category, uploadedBy };
      const documents = await DocumentService.searchDocuments(query, filters);

      res.json({
        success: true,
        query,
        count: documents.length,
        documents
      });
    } catch (error) {
      console.error('Search documents error:', error);

      res.status(500).json({
        error: 'Failed to search documents',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * Background OCR processing function
 * @param {Object} document - Document to process
 */
async function processDocumentOCR(document) {
  try {
    if (!config.ai.features.enableOCR) {
      console.log(`ℹ️  OCR disabled, skipping for document ${document.id}`);
      return;
    }

    console.log(`🔄 Starting OCR processing for document ${document.id}`);

    const ocrResult = await ocrService.processDocument(document.filePath, document.fileType);

    if (ocrResult.processed && ocrResult.text) {
      // Update document with OCR results
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

      console.log(`✅ OCR completed for document ${document.id}: ${ocrResult.words} words extracted`);
    } else {
      console.warn(`⚠️  OCR processing failed for document ${document.id}: ${ocrResult.error || 'Unknown error'}`);

      await document.update({
        ocrMetadata: {
          error: ocrResult.error,
          processedAt: new Date()
        },
        processed: false,
        processedAt: new Date()
      });
    }
  } catch (error) {
    console.error(`❌ OCR processing error for document ${document.id}:`, error);

    try {
      await document.update({
        ocrMetadata: {
          error: error.message,
          processedAt: new Date()
        },
        processed: false,
        processedAt: new Date()
      });
    } catch (updateError) {
      console.error('Failed to update document with OCR error:', updateError);
    }
  }
}

module.exports = router;
