const { Grant, GrantApplication, User, WorkflowExecution, Document } = require('../models');
const { Op } = require('sequelize');
const aiService = require('./aiService');

/**
 * Grant Management Service
 * Comprehensive grant discovery, matching, and application tracking
 */
class GrantService {
  /**
   * Search grants with advanced filters
   * @param {Object} filters - Search filters
   * @returns {Promise<Array>} Matching grants
   */
  static async searchGrants(filters = {}) {
    try {
      const {
        query,
        category,
        status,
        agencyName,
        minAward,
        maxAward,
        eligibleApplicant,
        keywords,
        closeDateAfter,
        closeDateBefore,
        matchScoreMin,
        limit = 50,
        offset = 0,
        sortBy = 'closeDate',
        sortOrder = 'ASC'
      } = filters;

      const where = {};

      // Text search across title, description, agency
      if (query) {
        where[Op.or] = [
          { title: { [Op.iLike]: `%${query}%` } },
          { description: { [Op.iLike]: `%${query}%` } },
          { summary: { [Op.iLike]: `%${query}%` } },
          { agencyName: { [Op.iLike]: `%${query}%` } },
          { programName: { [Op.iLike]: `%${query}%` } }
        ];
      }

      // Filter by category
      if (category) {
        where.category = category;
      }

      // Filter by status
      if (status) {
        where.status = status;
      } else {
        // Default: only show open grants
        where.status = 'open';
      }

      // Filter by agency
      if (agencyName) {
        where.agencyName = { [Op.iLike]: `%${agencyName}%` };
      }

      // Filter by award amount
      if (minAward) {
        where.awardCeiling = { [Op.gte]: parseFloat(minAward) };
      }
      if (maxAward) {
        where.awardFloor = { [Op.lte]: parseFloat(maxAward) };
      }

      // Filter by eligible applicant type
      if (eligibleApplicant) {
        where.eligibleApplicants = { [Op.contains]: [eligibleApplicant] };
      }

      // Filter by keywords
      if (keywords && keywords.length > 0) {
        where.keywords = { [Op.overlap]: keywords };
      }

      // Filter by close date range
      if (closeDateAfter) {
        where.closeDate = { [Op.gte]: new Date(closeDateAfter) };
      }
      if (closeDateBefore) {
        if (where.closeDate) {
          where.closeDate[Op.lte] = new Date(closeDateBefore);
        } else {
          where.closeDate = { [Op.lte]: new Date(closeDateBefore) };
        }
      }

      // Filter by AI match score
      if (matchScoreMin) {
        where.matchScore = { [Op.gte]: parseFloat(matchScoreMin) };
      }

      // Build order clause
      const orderMap = {
        closeDate: 'close_date',
        matchScore: 'match_score',
        awardCeiling: 'award_ceiling',
        postDate: 'post_date',
        title: 'title'
      };
      const orderField = orderMap[sortBy] || 'close_date';
      const order = [[orderField, sortOrder]];

      const grants = await Grant.findAll({
        where,
        include: [
          {
            model: User,
            as: 'creator',
            attributes: ['id', 'name', 'email']
          }
        ],
        order,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      return grants;
    } catch (error) {
      console.error('Search grants error:', error);
      throw error;
    }
  }

  /**
   * Get grant by ID with applications
   * @param {string} grantId - Grant ID
   * @returns {Promise<Object>} Grant with applications
   */
  static async getGrantWithApplications(grantId) {
    try {
      const grant = await Grant.findByPk(grantId, {
        include: [
          {
            model: User,
            as: 'creator',
            attributes: ['id', 'name', 'email']
          },
          {
            model: GrantApplication,
            as: 'applications',
            include: [
              {
                model: User,
                as: 'applicant',
                attributes: ['id', 'name', 'email']
              }
            ],
            order: [['createdAt', 'DESC']]
          }
        ]
      });

      return grant;
    } catch (error) {
      console.error('Get grant with applications error:', error);
      throw error;
    }
  }

  /**
   * Create new grant opportunity
   * @param {Object} grantData - Grant data
   * @param {string} userId - User creating the grant
   * @returns {Promise<Object>} Created grant
   */
  static async createGrant(grantData, userId) {
    try {
      const grant = await Grant.create({
        ...grantData,
        createdBy: userId
      });

      console.log(`✅ Grant created: ${grant.id} - ${grant.title}`);
      return grant;
    } catch (error) {
      console.error('Create grant error:', error);
      throw error;
    }
  }

  /**
   * Update grant opportunity
   * @param {string} grantId - Grant ID
   * @param {Object} updateData - Update data
   * @param {string} userId - User updating the grant
   * @returns {Promise<Object>} Updated grant
   */
  static async updateGrant(grantId, updateData, userId) {
    try {
      const grant = await Grant.findByPk(grantId);
      if (!grant) {
        throw new Error('Grant not found');
      }

      await grant.update({
        ...updateData,
        updatedBy: userId
      });

      console.log(`✅ Grant updated: ${grant.id} - ${grant.title}`);
      return grant;
    } catch (error) {
      console.error('Update grant error:', error);
      throw error;
    }
  }

  /**
   * AI-powered grant matching for municipality
   * Analyzes municipality needs and matches with available grants
   * @param {Object} municipalityProfile - Municipality data and needs
   * @param {Object} options - Matching options
   * @returns {Promise<Array>} Matched grants with scores
   */
  static async matchGrantsToMunicipality(municipalityProfile, options = {}) {
    try {
      const {
        categories = [],
        minMatchScore = 0.5,
        limit = 20
      } = options;

      // Get all open grants
      const where = {
        status: 'open',
        closeDate: { [Op.gte]: new Date() } // Only future deadlines
      };

      if (categories.length > 0) {
        where.category = { [Op.in]: categories };
      }

      const grants = await Grant.findAll({ where });

      // AI-powered matching using embeddings and semantic similarity
      const matchedGrants = [];

      for (const grant of grants) {
        try {
          // Build grant context for AI matching
          const grantContext = `
Grant: ${grant.title}
Agency: ${grant.agencyName}
Category: ${grant.category}
Description: ${grant.description || grant.summary || ''}
Eligibility: ${grant.eligibilityRequirements || ''}
Keywords: ${grant.keywords.join(', ')}
Award Range: $${grant.awardFloor || 0} - $${grant.awardCeiling || 0}
          `.trim();

          // Build municipality context
          const municipalityContext = `
Municipality: ${municipalityProfile.name || 'Unknown'}
Population: ${municipalityProfile.population || 'Unknown'}
Needs: ${municipalityProfile.needs?.join(', ') || ''}
Priorities: ${municipalityProfile.priorities?.join(', ') || ''}
Budget Constraints: ${municipalityProfile.budgetConstraints || ''}
Previous Projects: ${municipalityProfile.previousProjects?.join(', ') || ''}
          `.trim();

          // Use AI to calculate match score and reasons
          const prompt = `You are a grant matching expert. Analyze how well this grant matches the municipality's needs.

${grantContext}

${municipalityContext}

Provide:
1. A match score from 0.00 to 1.00 (where 1.00 is perfect match)
2. 2-5 specific reasons why this grant matches or doesn't match

Respond in JSON format:
{
  "matchScore": 0.85,
  "matchReasons": ["reason 1", "reason 2", "reason 3"]
}`;

          // Get AI analysis (using a simple heuristic for now, can be enhanced with actual AI)
          const analysis = await this.calculateMatchScore(grant, municipalityProfile);

          if (analysis.matchScore >= minMatchScore) {
            matchedGrants.push({
              ...grant.toJSON(),
              matchScore: analysis.matchScore,
              matchReasons: analysis.matchReasons
            });

            // Update grant with match score
            await grant.update({
              matchScore: analysis.matchScore,
              matchReasons: analysis.matchReasons
            });
          }
        } catch (error) {
          console.error(`Error matching grant ${grant.id}:`, error);
          // Continue with next grant
        }
      }

      // Sort by match score descending
      matchedGrants.sort((a, b) => b.matchScore - a.matchScore);

      return matchedGrants.slice(0, limit);
    } catch (error) {
      console.error('Match grants to municipality error:', error);
      throw error;
    }
  }

  /**
   * Calculate match score between grant and municipality
   * (Heuristic-based matching - can be enhanced with actual AI/ML)
   * @param {Object} grant - Grant object
   * @param {Object} municipality - Municipality profile
   * @returns {Promise<Object>} Match score and reasons
   */
  static async calculateMatchScore(grant, municipality) {
    let score = 0;
    const reasons = [];

    // Category matching (30% weight)
    if (municipality.priorities && municipality.priorities.includes(grant.category)) {
      score += 0.3;
      reasons.push(`Matches priority category: ${grant.category}`);
    }

    // Keyword matching (25% weight)
    if (municipality.needs && grant.keywords) {
      const matchingKeywords = grant.keywords.filter(keyword =>
        municipality.needs.some(need =>
          need.toLowerCase().includes(keyword.toLowerCase()) ||
          keyword.toLowerCase().includes(need.toLowerCase())
        )
      );
      if (matchingKeywords.length > 0) {
        const keywordScore = Math.min(matchingKeywords.length / grant.keywords.length, 1) * 0.25;
        score += keywordScore;
        reasons.push(`Matching keywords: ${matchingKeywords.slice(0, 3).join(', ')}`);
      }
    }

    // Eligibility matching (20% weight)
    if (grant.eligibleApplicants.includes('city') ||
        grant.eligibleApplicants.includes('county') ||
        grant.eligibleApplicants.includes('local_government')) {
      score += 0.2;
      reasons.push('Municipality is eligible to apply');
    }

    // Award amount matching (15% weight)
    if (municipality.budgetConstraints) {
      const budget = parseFloat(municipality.budgetConstraints);
      if (grant.awardCeiling && budget >= grant.awardFloor && budget <= grant.awardCeiling) {
        score += 0.15;
        reasons.push(`Award amount aligns with budget ($${grant.awardFloor?.toLocaleString()} - $${grant.awardCeiling?.toLocaleString()})`);
      }
    }

    // Timeline matching (10% weight)
    if (grant.closeDate) {
      const daysUntilClose = Math.floor((new Date(grant.closeDate) - new Date()) / (1000 * 60 * 60 * 24));
      if (daysUntilClose > 30) {
        score += 0.1;
        reasons.push(`Sufficient time to prepare application (${daysUntilClose} days)`);
      } else if (daysUntilClose > 0) {
        reasons.push(`Limited time to apply (${daysUntilClose} days remaining)`);
      }
    }

    // Ensure reasons array is not empty
    if (reasons.length === 0) {
      reasons.push('General eligibility for this grant type');
    }

    // Add competitiveness assessment
    if (grant.competitiveness === 'low' || grant.competitiveness === 'medium') {
      reasons.push(`${grant.competitiveness} competitiveness level`);
    }

    return {
      matchScore: Math.min(score, 1.0),
      matchReasons: reasons
    };
  }

  /**
   * Create grant application
   * @param {Object} applicationData - Application data
   * @param {string} userId - User creating application
   * @returns {Promise<Object>} Created application
   */
  static async createApplication(applicationData, userId) {
    try {
      // Generate unique application number
      const applicationNumber = await this.generateApplicationNumber();

      const application = await GrantApplication.create({
        ...applicationData,
        applicationNumber,
        applicantId: userId,
        createdBy: userId,
        draftCreatedDate: new Date()
      });

      console.log(`✅ Grant application created: ${application.id} - ${application.applicationNumber}`);
      return application;
    } catch (error) {
      console.error('Create application error:', error);
      throw error;
    }
  }

  /**
   * Update grant application
   * @param {string} applicationId - Application ID
   * @param {Object} updateData - Update data
   * @param {string} userId - User updating application
   * @returns {Promise<Object>} Updated application
   */
  static async updateApplication(applicationId, updateData, userId) {
    try {
      const application = await GrantApplication.findByPk(applicationId);
      if (!application) {
        throw new Error('Application not found');
      }

      await application.update({
        ...updateData,
        updatedBy: userId
      });

      console.log(`✅ Grant application updated: ${application.id}`);
      return application;
    } catch (error) {
      console.error('Update application error:', error);
      throw error;
    }
  }

  /**
   * Submit grant application
   * @param {string} applicationId - Application ID
   * @param {string} userId - User submitting application
   * @returns {Promise<Object>} Submitted application
   */
  static async submitApplication(applicationId, userId) {
    try {
      const application = await GrantApplication.findByPk(applicationId, {
        include: [{ model: Grant, as: 'grant' }]
      });

      if (!application) {
        throw new Error('Application not found');
      }

      if (application.status !== 'draft' && application.status !== 'in_review') {
        throw new Error('Application cannot be submitted in current status');
      }

      // Validate required fields
      const missingFields = [];
      if (!application.projectTitle) missingFields.push('projectTitle');
      if (!application.projectDescription) missingFields.push('projectDescription');
      if (!application.requestedAmount) missingFields.push('requestedAmount');

      if (missingFields.length > 0) {
        throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
      }

      // Check if grant is still open
      if (application.grant.status !== 'open') {
        throw new Error('Grant opportunity is no longer open');
      }

      if (application.grant.closeDate && new Date(application.grant.closeDate) < new Date()) {
        throw new Error('Grant application deadline has passed');
      }

      await application.update({
        status: 'submitted',
        submittedDate: new Date(),
        updatedBy: userId
      });

      console.log(`✅ Grant application submitted: ${application.id} - ${application.applicationNumber}`);
      return application;
    } catch (error) {
      console.error('Submit application error:', error);
      throw error;
    }
  }

  /**
   * Get grant application with full details
   * @param {string} applicationId - Application ID
   * @returns {Promise<Object>} Application with related data
   */
  static async getApplicationWithDetails(applicationId) {
    try {
      const application = await GrantApplication.findByPk(applicationId, {
        include: [
          {
            model: Grant,
            as: 'grant'
          },
          {
            model: User,
            as: 'applicant',
            attributes: ['id', 'name', 'email']
          },
          {
            model: User,
            as: 'decisionMaker',
            attributes: ['id', 'name', 'email']
          },
          {
            model: WorkflowExecution,
            as: 'workflowExecution'
          }
        ]
      });

      return application;
    } catch (error) {
      console.error('Get application with details error:', error);
      throw error;
    }
  }

  /**
   * Get grant statistics
   * @param {Object} filters - Optional filters
   * @returns {Promise<Object>} Statistics
   */
  static async getGrantStats(filters = {}) {
    try {
      const { userId } = filters;

      const totalGrants = await Grant.count({
        where: { status: 'open' }
      });

      const byCategory = await Grant.findAll({
        where: { status: 'open' },
        attributes: [
          'category',
          [Grant.sequelize.fn('COUNT', Grant.sequelize.col('id')), 'count']
        ],
        group: ['category'],
        raw: true
      });

      const closingSoon = await Grant.count({
        where: {
          status: 'open',
          closeDate: {
            [Op.between]: [new Date(), new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)]
          }
        }
      });

      // Application statistics
      const applicationWhere = userId ? { applicantId: userId } : {};

      const totalApplications = await GrantApplication.count({ where: applicationWhere });

      const applicationsByStatus = await GrantApplication.findAll({
        where: applicationWhere,
        attributes: [
          'status',
          [GrantApplication.sequelize.fn('COUNT', GrantApplication.sequelize.col('id')), 'count']
        ],
        group: ['status'],
        raw: true
      });

      const awardedApplications = await GrantApplication.count({
        where: { ...applicationWhere, status: 'awarded' }
      });

      const totalAwarded = await GrantApplication.sum('awardedAmount', {
        where: { ...applicationWhere, status: 'awarded' }
      });

      return {
        grants: {
          total: totalGrants,
          byCategory: byCategory.reduce((acc, item) => {
            acc[item.category] = parseInt(item.count);
            return acc;
          }, {}),
          closingSoon
        },
        applications: {
          total: totalApplications,
          byStatus: applicationsByStatus.reduce((acc, item) => {
            acc[item.status] = parseInt(item.count);
            return acc;
          }, {}),
          awarded: awardedApplications,
          totalAwarded: totalAwarded || 0
        }
      };
    } catch (error) {
      console.error('Get grant stats error:', error);
      throw error;
    }
  }

  /**
   * Generate unique application number
   * @returns {Promise<string>} Application number
   */
  static async generateApplicationNumber() {
    const year = new Date().getFullYear();
    const prefix = `GA-${year}`;

    // Find the latest application number for this year
    const latestApp = await GrantApplication.findOne({
      where: {
        applicationNumber: { [Op.like]: `${prefix}%` }
      },
      order: [['createdAt', 'DESC']]
    });

    let sequence = 1;
    if (latestApp) {
      const lastSequence = parseInt(latestApp.applicationNumber.split('-').pop());
      sequence = lastSequence + 1;
    }

    return `${prefix}-${sequence.toString().padStart(5, '0')}`;
  }

  /**
   * Sync grants from Grants.gov API
   * (Framework for future implementation)
   * @param {Object} options - Sync options
   * @returns {Promise<Object>} Sync results
   */
  static async syncFromGrantsGov(options = {}) {
    try {
      // TODO: Implement Grants.gov API integration
      // This is a placeholder for future implementation
      console.log('🔄 Grants.gov sync not yet implemented');

      return {
        success: false,
        message: 'Grants.gov integration not yet implemented',
        imported: 0,
        updated: 0
      };
    } catch (error) {
      console.error('Sync from Grants.gov error:', error);
      throw error;
    }
  }
}

module.exports = GrantService;
