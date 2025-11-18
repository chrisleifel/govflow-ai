const config = require('../config/config');
const path = require('path');
const fs = require('fs');

/**
 * OCR Service
 * Extracts text from images and PDFs using Tesseract.js
 */
class OCRService {
  constructor() {
    this.worker = null;
    this.initialized = false;
  }

  /**
   * Initialize Tesseract worker
   */
  async initialize() {
    if (this.initialized) return;

    if (!config.ai.features.enableOCR) {
      console.log('ℹ️  OCR is disabled in configuration');
      return;
    }

    try {
      // Dynamic import of Tesseract
      const { createWorker } = await import('tesseract.js');

      this.worker = await createWorker(config.ocr.language);
      this.initialized = true;
      console.log(`✅ OCR service initialized (language: ${config.ocr.language})`);
    } catch (error) {
      console.error('❌ Failed to initialize OCR service:', error.message);
      console.warn('⚠️  OCR features will be disabled');
    }
  }

  /**
   * Check if OCR service is available
   */
  isAvailable() {
    return this.initialized && this.worker !== null;
  }

  /**
   * Extract text from image file
   * @param {string} imagePath - Path to image file
   * @param {Object} options - OCR options
   * @returns {Promise<Object>} OCR result with text and confidence
   */
  async extractTextFromImage(imagePath, options = {}) {
    if (!this.isAvailable()) {
      return {
        text: '',
        confidence: 0,
        error: 'OCR service is not available',
        processed: false
      };
    }

    try {
      // Verify file exists
      if (!fs.existsSync(imagePath)) {
        throw new Error('File not found');
      }

      console.log(`🔍 Starting OCR for: ${path.basename(imagePath)}`);

      const { data } = await this.worker.recognize(imagePath);

      const result = {
        text: data.text.trim(),
        confidence: data.confidence / 100, // Convert to 0-1 range
        words: data.words?.length || 0,
        lines: data.lines?.length || 0,
        processed: true,
        language: config.ocr.language,
        processingTime: data.jobId ? 'completed' : 'unknown'
      };

      console.log(`✅ OCR completed: ${result.words} words extracted (confidence: ${(result.confidence * 100).toFixed(1)}%)`);

      return result;
    } catch (error) {
      console.error('OCR extraction error:', error);
      return {
        text: '',
        confidence: 0,
        error: error.message,
        processed: false
      };
    }
  }

  /**
   * Extract text from PDF (first page only for now)
   * @param {string} pdfPath - Path to PDF file
   * @returns {Promise<Object>} OCR result
   */
  async extractTextFromPDF(pdfPath) {
    // Note: For production, consider using pdf-parse or pdf.js
    // For now, we'll treat PDFs as images if they're scanned
    console.warn('⚠️  PDF OCR support is limited. Consider using pdf-parse for better results.');

    return {
      text: '',
      confidence: 0,
      error: 'PDF OCR not fully implemented. Please convert to image format or use pdf-parse library.',
      processed: false
    };
  }

  /**
   * Process document based on file type
   * @param {string} filePath - Path to document
   * @param {string} fileType - MIME type
   * @returns {Promise<Object>} OCR result
   */
  async processDocument(filePath, fileType) {
    const imageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/tiff', 'image/bmp'];
    const pdfTypes = ['application/pdf'];

    if (imageTypes.includes(fileType)) {
      return await this.extractTextFromImage(filePath);
    } else if (pdfTypes.includes(fileType)) {
      return await this.extractTextFromPDF(filePath);
    } else {
      return {
        text: '',
        confidence: 0,
        error: `Unsupported file type: ${fileType}`,
        processed: false
      };
    }
  }

  /**
   * Extract structured data from permit application
   * @param {string} text - Extracted text
   * @returns {Object} Structured data
   */
  extractPermitData(text) {
    const data = {
      applicantName: null,
      applicantEmail: null,
      applicantPhone: null,
      propertyAddress: null,
      description: null
    };

    // Simple regex patterns for common fields
    const patterns = {
      email: /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi,
      phone: /(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/g,
      // Add more patterns as needed
    };

    // Extract email
    const emailMatch = text.match(patterns.email);
    if (emailMatch) {
      data.applicantEmail = emailMatch[0];
    }

    // Extract phone
    const phoneMatch = text.match(patterns.phone);
    if (phoneMatch) {
      data.applicantPhone = phoneMatch[0];
    }

    // For more complex extraction, integrate with AI service
    return data;
  }

  /**
   * Cleanup worker on shutdown
   */
  async terminate() {
    if (this.worker) {
      await this.worker.terminate();
      this.initialized = false;
      console.log('✅ OCR service terminated');
    }
  }
}

// Export singleton instance
module.exports = new OCRService();
