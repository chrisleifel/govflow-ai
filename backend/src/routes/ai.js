const express = require('express');
const router = express.Router();
const config = require('../config/config');
const { Permit, User } = require('../models');
const { authMiddleware, requireRole, optionalAuth } = require('../middleware/auth');
const aiService = require('../services/aiService');

/**
 * @route   POST /api/ai/chat
 * @desc    AI assistant chatbot for citizen questions
 * @access  Private (optional for public FAQ mode)
 */
router.post('/chat',
  optionalAuth,
  async (req, res) => {
    try {
      const { question, conversationId } = req.body;

      if (!question || question.trim().length === 0) {
        return res.status(400).json({
          error: 'Question is required'
        });
      }

      // Get user context if authenticated
      let context = {};
      if (req.user) {
        const permits = await Permit.findAll({
          where: { applicantEmail: req.user.email },
          attributes: ['permitNumber', 'type', 'status', 'createdAt'],
          limit: 10,
          order: [['createdAt', 'DESC']]
        });

        context.permits = permits;
      }

      // Get AI response
      const answer = await aiService.answerQuestion(question, context);

      res.json({
        success: true,
        question,
        answer,
        conversationId: conversationId || `conv-${Date.now()}`,
        timestamp: new Date().toISOString()
      });

      console.log(`🤖 AI Chat: "${question.substring(0, 50)}..." - Response provided`);
    } catch (error) {
      console.error('AI chat error:', error);

      res.status(500).json({
        error: 'Failed to get AI response',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred',
        fallback: 'I apologize, but I\'m having trouble processing your question right now. Please contact support for assistance.'
      });
    }
  }
);

/**
 * @route   POST /api/ai/classify-permit
 * @desc    Classify permit type from description (Staff/Admin)
 * @access  Private (Staff/Admin)
 */
router.post('/classify-permit',
  authMiddleware,
  requireRole('staff', 'admin'),
  async (req, res) => {
    try {
      const { description, additionalInfo } = req.body;

      if (!description) {
        return res.status(400).json({
          error: 'Description is required'
        });
      }

      const classification = await aiService.classifyPermit(description, additionalInfo);

      res.json({
        success: true,
        classification
      });

      console.log(`🎯 Permit classified: ${classification.type} (confidence: ${(classification.confidence * 100).toFixed(1)}%)`);
    } catch (error) {
      console.error('Permit classification error:', error);

      res.status(500).json({
        error: 'Failed to classify permit',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   POST /api/ai/route-permit
 * @desc    Get AI recommendation for permit routing
 * @access  Private (Staff/Admin)
 */
router.post('/route-permit',
  authMiddleware,
  requireRole('staff', 'admin'),
  async (req, res) => {
    try {
      const { permitId } = req.body;

      if (!permitId) {
        return res.status(400).json({
          error: 'Permit ID is required'
        });
      }

      const permit = await Permit.findByPk(permitId);
      if (!permit) {
        return res.status(404).json({
          error: 'Permit not found'
        });
      }

      // Get available staff (simplified - in production, filter by availability, role, etc.)
      const staffMembers = await User.findAll({
        where: { role: 'staff', status: 'active' },
        attributes: ['id', 'name', 'email']
      });

      if (staffMembers.length === 0) {
        return res.json({
          success: true,
          routing: {
            staffId: null,
            confidence: 0,
            aiGenerated: false,
            message: 'No available staff members found'
          }
        });
      }

      // Add mock workload data (in production, this would come from real data)
      const staffWithWorkload = staffMembers.map(s => ({
        ...s.toJSON(),
        workload: Math.floor(Math.random() * 10), // Mock workload
        specialization: s.email.includes('building') ? 'Building' : 'General'
      }));

      const routing = await aiService.routePermit(permit, staffWithWorkload);

      res.json({
        success: true,
        routing,
        availableStaff: staffWithWorkload.length
      });

      console.log(`🧭 Permit routing: ${routing.staffId || 'No recommendation'} (confidence: ${(routing.confidence * 100).toFixed(1)}%)`);
    } catch (error) {
      console.error('Permit routing error:', error);

      res.status(500).json({
        error: 'Failed to route permit',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   POST /api/ai/validate-document
 * @desc    Validate document completeness using AI
 * @access  Private (Staff/Admin)
 */
router.post('/validate-document',
  authMiddleware,
  requireRole('staff', 'admin'),
  async (req, res) => {
    try {
      const { documentText, permitType } = req.body;

      if (!documentText || !permitType) {
        return res.status(400).json({
          error: 'Document text and permit type are required'
        });
      }

      const validation = await aiService.validateDocument(documentText, permitType);

      res.json({
        success: true,
        validation
      });

      console.log(`📋 Document validated: ${validation.isComplete ? 'Complete' : 'Incomplete'} (${validation.missingItems?.length || 0} missing items)`);
    } catch (error) {
      console.error('Document validation error:', error);

      res.status(500).json({
        error: 'Failed to validate document',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   GET /api/ai/status
 * @desc    Get AI service status
 * @access  Private (Admin)
 */
router.get('/status',
  authMiddleware,
  requireRole('admin'),
  async (req, res) => {
    try {
      res.json({
        success: true,
        ai: {
          provider: config.ai.provider,
          available: aiService.isAvailable(),
          features: config.ai.features,
          models: {
            openai: config.ai.openai.model,
            anthropic: config.ai.anthropic.model
          }
        }
      });
    } catch (error) {
      console.error('Get AI status error:', error);

      res.status(500).json({
        error: 'Failed to get AI status',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   POST /api/ai/suggest-permit-requirements
 * @desc    Get AI suggestions for permit requirements
 * @access  Private
 */
router.post('/suggest-permit-requirements',
  authMiddleware,
  async (req, res) => {
    try {
      const { permitType, description, propertyAddress } = req.body;

      if (!permitType) {
        return res.status(400).json({
          error: 'Permit type is required'
        });
      }

      const prompt = `What are the typical requirements and documents needed for a ${permitType} permit?

${description ? `Project Description: ${description}` : ''}
${propertyAddress ? `Location: ${propertyAddress}` : ''}

Provide a concise list of:
1. Required documents
2. Typical timeline
3. Common fees (general ranges)
4. Important considerations`;

      const suggestions = await aiService.complete(prompt, {
        systemPrompt: 'You are a helpful assistant providing permit requirement information. Be specific and accurate.',
        temperature: 0.5
      });

      res.json({
        success: true,
        permitType,
        suggestions,
        disclaimer: 'These are general suggestions. Actual requirements may vary. Please verify with your local authority.'
      });

      console.log(`💡 Permit suggestions provided for: ${permitType}`);
    } catch (error) {
      console.error('Permit suggestions error:', error);

      res.status(500).json({
        error: 'Failed to get permit suggestions',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

module.exports = router;
