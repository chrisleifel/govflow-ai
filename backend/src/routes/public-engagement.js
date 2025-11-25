const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const config = require('../config/config');
const { PublicComment, TownHallMeeting, Survey, Poll, User } = require('../models');
const { authMiddleware, requireRole, optionalAuth } = require('../middleware/auth');

// ============================================================================
// PUBLIC COMMENTS ROUTES
// ============================================================================

/**
 * @route   GET /api/public-engagement/comments
 * @desc    Get public comments (with optional filters)
 * @access  Public
 */
router.get('/comments', optionalAuth, async (req, res) => {
  try {
    const {
      referenceType,
      referenceId,
      status = 'approved',
      page = 1,
      limit = 50,
      sortBy = 'createdAt',
      sortOrder = 'DESC'
    } = req.query;

    const where = {
      isPublic: true
    };

    // Filter by reference
    if (referenceType) where.referenceType = referenceType;
    if (referenceId) where.referenceId = referenceId;

    // Only show approved comments to public, all to staff
    if (!req.user || req.user.role !== 'staff') {
      where.status = 'approved';
    } else if (status) {
      where.status = status;
    }

    const offset = (page - 1) * limit;

    const comments = await PublicComment.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email']
        },
        {
          model: PublicComment,
          as: 'replies',
          where: { status: 'approved', isPublic: true },
          required: false,
          include: [{
            model: User,
            as: 'user',
            attributes: ['id', 'name']
          }]
        }
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [[sortBy, sortOrder]]
    });

    res.json({
      success: true,
      comments: comments.rows,
      pagination: {
        total: comments.count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(comments.count / limit)
      }
    });
  } catch (error) {
    console.error('Get comments error:', error);
    res.status(500).json({
      error: 'Failed to fetch comments',
      message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
    });
  }
});

/**
 * @route   POST /api/public-engagement/comments
 * @desc    Submit a public comment
 * @access  Public
 */
router.post('/comments', optionalAuth, async (req, res) => {
  try {
    const {
      referenceType,
      referenceId,
      subject,
      content,
      commenterName,
      commenterEmail,
      commenterPhone,
      commenterAddress,
      parentCommentId
    } = req.body;

    // Validation
    if (!content || !commenterName) {
      return res.status(400).json({
        error: 'Comment content and name are required'
      });
    }

    const commentData = {
      referenceType,
      referenceId,
      subject,
      content,
      commenterName,
      commenterEmail,
      commenterPhone,
      commenterAddress,
      parentCommentId,
      userId: req.user ? req.user.id : null,
      status: 'pending', // Requires moderation
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      createdBy: req.user ? req.user.id : null
    };

    const comment = await PublicComment.create(commentData);

    res.status(201).json({
      success: true,
      message: 'Comment submitted successfully and pending moderation',
      comment: {
        id: comment.id,
        content: comment.content,
        commenterName: comment.commenterName,
        createdAt: comment.createdAt
      }
    });
  } catch (error) {
    console.error('Submit comment error:', error);
    res.status(500).json({
      error: 'Failed to submit comment',
      message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
    });
  }
});

/**
 * @route   PATCH /api/public-engagement/comments/:id/moderate
 * @desc    Moderate a comment (approve/reject)
 * @access  Private (Staff only)
 */
router.patch('/comments/:id/moderate',
  authMiddleware,
  requireRole(['staff', 'admin']),
  async (req, res) => {
    try {
      const { status, moderationNotes } = req.body;

      if (!['approved', 'rejected', 'flagged'].includes(status)) {
        return res.status(400).json({
          error: 'Invalid status'
        });
      }

      const comment = await PublicComment.findByPk(req.params.id);

      if (!comment) {
        return res.status(404).json({
          error: 'Comment not found'
        });
      }

      await comment.update({
        status,
        moderationNotes,
        moderatedBy: req.user.id,
        moderatedAt: new Date(),
        updatedBy: req.user.id
      });

      res.json({
        success: true,
        message: `Comment ${status}`,
        comment
      });
    } catch (error) {
      console.error('Moderate comment error:', error);
      res.status(500).json({
        error: 'Failed to moderate comment',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   POST /api/public-engagement/comments/:id/vote
 * @desc    Vote on a comment (upvote/downvote)
 * @access  Public
 */
router.post('/comments/:id/vote', async (req, res) => {
  try {
    const { voteType } = req.body; // 'upvote' or 'downvote'

    if (!['upvote', 'downvote'].includes(voteType)) {
      return res.status(400).json({
        error: 'Invalid vote type'
      });
    }

    const comment = await PublicComment.findByPk(req.params.id);

    if (!comment) {
      return res.status(404).json({
        error: 'Comment not found'
      });
    }

    const updateField = voteType === 'upvote' ? 'upvotes' : 'downvotes';
    await comment.increment(updateField, { by: 1 });

    res.json({
      success: true,
      message: `Comment ${voteType}d`,
      votes: {
        upvotes: comment.upvotes + (voteType === 'upvote' ? 1 : 0),
        downvotes: comment.downvotes + (voteType === 'downvote' ? 1 : 0)
      }
    });
  } catch (error) {
    console.error('Vote comment error:', error);
    res.status(500).json({
      error: 'Failed to vote on comment',
      message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
    });
  }
});

// ============================================================================
// TOWN HALL MEETINGS ROUTES
// ============================================================================

/**
 * @route   GET /api/public-engagement/meetings
 * @desc    Get upcoming town hall meetings
 * @access  Public
 */
router.get('/meetings', async (req, res) => {
  try {
    const {
      status = 'published',
      upcoming = 'true',
      department,
      page = 1,
      limit = 20
    } = req.query;

    const where = { status };
    if (department) where.department = department;

    // Filter upcoming meetings
    if (upcoming === 'true') {
      where.scheduledDate = {
        [Op.gte]: new Date()
      };
    }

    const offset = (page - 1) * limit;

    const meetings = await TownHallMeeting.findAndCountAll({
      where,
      include: [{
        model: User,
        as: 'host',
        attributes: ['id', 'name', 'email']
      }],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['scheduledDate', 'ASC']]
    });

    res.json({
      success: true,
      meetings: meetings.rows,
      pagination: {
        total: meetings.count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(meetings.count / limit)
      }
    });
  } catch (error) {
    console.error('Get meetings error:', error);
    res.status(500).json({
      error: 'Failed to fetch meetings',
      message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
    });
  }
});

/**
 * @route   GET /api/public-engagement/meetings/:id
 * @desc    Get single meeting details
 * @access  Public
 */
router.get('/meetings/:id', async (req, res) => {
  try {
    const meeting = await TownHallMeeting.findByPk(req.params.id, {
      include: [{
        model: User,
        as: 'host',
        attributes: ['id', 'name', 'email', 'phone']
      }]
    });

    if (!meeting) {
      return res.status(404).json({
        error: 'Meeting not found'
      });
    }

    res.json({
      success: true,
      meeting
    });
  } catch (error) {
    console.error('Get meeting error:', error);
    res.status(500).json({
      error: 'Failed to fetch meeting',
      message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
    });
  }
});

/**
 * @route   POST /api/public-engagement/meetings
 * @desc    Create a new town hall meeting
 * @access  Private (Staff/Admin only)
 */
router.post('/meetings',
  authMiddleware,
  requireRole(['staff', 'admin']),
  async (req, res) => {
    try {
      const meetingData = {
        ...req.body,
        hostUserId: req.user.id,
        createdBy: req.user.id
      };

      const meeting = await TownHallMeeting.create(meetingData);

      res.status(201).json({
        success: true,
        message: 'Meeting created successfully',
        meeting
      });
    } catch (error) {
      console.error('Create meeting error:', error);
      res.status(500).json({
        error: 'Failed to create meeting',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

/**
 * @route   POST /api/public-engagement/meetings/:id/register
 * @desc    Register for a town hall meeting
 * @access  Public
 */
router.post('/meetings/:id/register', optionalAuth, async (req, res) => {
  try {
    const { name, email, phone } = req.body;

    const meeting = await TownHallMeeting.findByPk(req.params.id);

    if (!meeting) {
      return res.status(404).json({
        error: 'Meeting not found'
      });
    }

    // Check if registration is required and if meeting is full
    if (meeting.requiresRegistration) {
      if (meeting.maxAttendees && meeting.currentRegistrations >= meeting.maxAttendees) {
        if (!meeting.waitlistEnabled) {
          return res.status(400).json({
            error: 'Meeting is full and waitlist is not enabled'
          });
        }
      }

      // Check registration deadline
      if (meeting.registrationDeadline && new Date() > meeting.registrationDeadline) {
        return res.status(400).json({
          error: 'Registration deadline has passed'
        });
      }
    }

    // Increment registration count
    await meeting.increment('currentRegistrations', { by: 1 });

    // TODO: Store registration details in a separate MeetingRegistration model
    // For now, just return success

    res.json({
      success: true,
      message: 'Successfully registered for meeting',
      meeting: {
        id: meeting.id,
        title: meeting.title,
        scheduledDate: meeting.scheduledDate,
        currentRegistrations: meeting.currentRegistrations + 1
      }
    });
  } catch (error) {
    console.error('Register meeting error:', error);
    res.status(500).json({
      error: 'Failed to register for meeting',
      message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
    });
  }
});

/**
 * @route   PATCH /api/public-engagement/meetings/:id/status
 * @desc    Update meeting status
 * @access  Private (Staff/Admin only)
 */
router.patch('/meetings/:id/status',
  authMiddleware,
  requireRole(['staff', 'admin']),
  async (req, res) => {
    try {
      const { status, cancellationReason } = req.body;

      const meeting = await TownHallMeeting.findByPk(req.params.id);

      if (!meeting) {
        return res.status(404).json({
          error: 'Meeting not found'
        });
      }

      await meeting.update({
        status,
        cancellationReason,
        updatedBy: req.user.id
      });

      res.json({
        success: true,
        message: `Meeting ${status}`,
        meeting
      });
    } catch (error) {
      console.error('Update meeting status error:', error);
      res.status(500).json({
        error: 'Failed to update meeting status',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

// ============================================================================
// SURVEYS ROUTES
// ============================================================================

/**
 * @route   GET /api/public-engagement/surveys
 * @desc    Get available surveys
 * @access  Public
 */
router.get('/surveys', async (req, res) => {
  try {
    const {
      status = 'active',
      category,
      department,
      page = 1,
      limit = 20
    } = req.query;

    const where = { isPublic: true };
    if (status) where.status = status;
    if (category) where.category = category;
    if (department) where.department = department;

    // Only show active surveys within date range
    if (status === 'active') {
      const now = new Date();
      where[Op.and] = [
        {
          [Op.or]: [
            { startDate: null },
            { startDate: { [Op.lte]: now } }
          ]
        },
        {
          [Op.or]: [
            { endDate: null },
            { endDate: { [Op.gte]: now } }
          ]
        }
      ];
    }

    const offset = (page - 1) * limit;

    const surveys = await Survey.findAndCountAll({
      where,
      attributes: { exclude: ['questions'] }, // Don't send questions in list
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      surveys: surveys.rows,
      pagination: {
        total: surveys.count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(surveys.count / limit)
      }
    });
  } catch (error) {
    console.error('Get surveys error:', error);
    res.status(500).json({
      error: 'Failed to fetch surveys',
      message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
    });
  }
});

/**
 * @route   GET /api/public-engagement/surveys/:id
 * @desc    Get survey with questions
 * @access  Public
 */
router.get('/surveys/:id', optionalAuth, async (req, res) => {
  try {
    const survey = await Survey.findByPk(req.params.id);

    if (!survey) {
      return res.status(404).json({
        error: 'Survey not found'
      });
    }

    // Check access requirements
    if (!survey.isPublic) {
      if (!req.user) {
        return res.status(403).json({
          error: 'This survey requires authentication'
        });
      }
    }

    if (survey.requiresAuth && !req.user) {
      return res.status(403).json({
        error: 'Authentication required to access this survey'
      });
    }

    // Check if survey is within active date range
    const now = new Date();
    if (survey.startDate && now < survey.startDate) {
      return res.status(400).json({
        error: 'Survey has not started yet'
      });
    }
    if (survey.endDate && now > survey.endDate) {
      return res.status(400).json({
        error: 'Survey has ended'
      });
    }

    res.json({
      success: true,
      survey
    });
  } catch (error) {
    console.error('Get survey error:', error);
    res.status(500).json({
      error: 'Failed to fetch survey',
      message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
    });
  }
});

/**
 * @route   POST /api/public-engagement/surveys/:id/submit
 * @desc    Submit survey response
 * @access  Public
 */
router.post('/surveys/:id/submit', optionalAuth, async (req, res) => {
  try {
    const { responses } = req.body;

    const survey = await Survey.findByPk(req.params.id);

    if (!survey) {
      return res.status(404).json({
        error: 'Survey not found'
      });
    }

    // TODO: Store response in a separate SurveyResponse model
    // For now, just update the count

    const isComplete = true; // Determine based on required questions

    if (isComplete) {
      await survey.increment('completeResponses', { by: 1 });
    } else {
      await survey.increment('partialResponses', { by: 1 });
    }
    await survey.increment('totalResponses', { by: 1 });

    res.json({
      success: true,
      message: 'Survey response submitted successfully',
      completionMessage: survey.completionMessage
    });
  } catch (error) {
    console.error('Submit survey error:', error);
    res.status(500).json({
      error: 'Failed to submit survey',
      message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
    });
  }
});

/**
 * @route   POST /api/public-engagement/surveys
 * @desc    Create a new survey
 * @access  Private (Staff/Admin only)
 */
router.post('/surveys',
  authMiddleware,
  requireRole(['staff', 'admin']),
  async (req, res) => {
    try {
      const surveyData = {
        ...req.body,
        ownerId: req.user.id,
        createdBy: req.user.id,
        questionCount: req.body.questions ? req.body.questions.length : 0
      };

      const survey = await Survey.create(surveyData);

      res.status(201).json({
        success: true,
        message: 'Survey created successfully',
        survey
      });
    } catch (error) {
      console.error('Create survey error:', error);
      res.status(500).json({
        error: 'Failed to create survey',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

// ============================================================================
// POLLS ROUTES
// ============================================================================

/**
 * @route   GET /api/public-engagement/polls
 * @desc    Get available polls
 * @access  Public
 */
router.get('/polls', async (req, res) => {
  try {
    const {
      status = 'active',
      category,
      page = 1,
      limit = 20
    } = req.query;

    const where = { isPublic: true };
    if (status) where.status = status;
    if (category) where.category = category;

    const offset = (page - 1) * limit;

    const polls = await Poll.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      polls: polls.rows,
      pagination: {
        total: polls.count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(polls.count / limit)
      }
    });
  } catch (error) {
    console.error('Get polls error:', error);
    res.status(500).json({
      error: 'Failed to fetch polls',
      message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
    });
  }
});

/**
 * @route   GET /api/public-engagement/polls/:id
 * @desc    Get poll details
 * @access  Public
 */
router.get('/polls/:id', async (req, res) => {
  try {
    const poll = await Poll.findByPk(req.params.id);

    if (!poll) {
      return res.status(404).json({
        error: 'Poll not found'
      });
    }

    res.json({
      success: true,
      poll
    });
  } catch (error) {
    console.error('Get poll error:', error);
    res.status(500).json({
      error: 'Failed to fetch poll',
      message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
    });
  }
});

/**
 * @route   POST /api/public-engagement/polls/:id/vote
 * @desc    Submit a poll vote
 * @access  Public
 */
router.post('/polls/:id/vote', optionalAuth, async (req, res) => {
  try {
    const { optionIds, rating, otherText } = req.body;

    const poll = await Poll.findByPk(req.params.id);

    if (!poll) {
      return res.status(404).json({
        error: 'Poll not found'
      });
    }

    if (poll.status !== 'active') {
      return res.status(400).json({
        error: 'Poll is not active'
      });
    }

    // TODO: Store vote in a separate PollVote model
    // TODO: Implement IP/user duplicate vote checking
    // For now, just update the poll options

    const options = poll.options;
    if (poll.pollType === 'rating') {
      // Handle rating vote
      await poll.increment('totalVotes', { by: 1 });
    } else {
      // Handle choice-based vote
      optionIds.forEach(optionId => {
        const option = options.find(o => o.id === optionId);
        if (option) {
          option.votes = (option.votes || 0) + 1;
        }
      });
      poll.options = options;
      await poll.save();
      await poll.increment('totalVotes', { by: 1 });
    }

    res.json({
      success: true,
      message: 'Vote submitted successfully',
      showResults: poll.showResults === 'always' || poll.showResults === 'after_vote',
      poll: poll.showResults === 'never' ? null : poll
    });
  } catch (error) {
    console.error('Submit poll vote error:', error);
    res.status(500).json({
      error: 'Failed to submit vote',
      message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
    });
  }
});

/**
 * @route   POST /api/public-engagement/polls
 * @desc    Create a new poll
 * @access  Private (Staff/Admin only)
 */
router.post('/polls',
  authMiddleware,
  requireRole(['staff', 'admin']),
  async (req, res) => {
    try {
      const pollData = {
        ...req.body,
        ownerId: req.user.id,
        createdBy: req.user.id
      };

      const poll = await Poll.create(pollData);

      res.status(201).json({
        success: true,
        message: 'Poll created successfully',
        poll
      });
    } catch (error) {
      console.error('Create poll error:', error);
      res.status(500).json({
        error: 'Failed to create poll',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

// ============================================================================
// ANALYTICS AND STATISTICS
// ============================================================================

/**
 * @route   GET /api/public-engagement/stats
 * @desc    Get public engagement statistics
 * @access  Private (Staff/Admin only)
 */
router.get('/stats',
  authMiddleware,
  requireRole(['staff', 'admin']),
  async (req, res) => {
    try {
      const [
        totalComments,
        pendingComments,
        totalMeetings,
        upcomingMeetings,
        totalSurveys,
        activeSurveys,
        totalPolls,
        activePolls
      ] = await Promise.all([
        PublicComment.count(),
        PublicComment.count({ where: { status: 'pending' } }),
        TownHallMeeting.count(),
        TownHallMeeting.count({
          where: {
            status: 'published',
            scheduledDate: { [Op.gte]: new Date() }
          }
        }),
        Survey.count(),
        Survey.count({ where: { status: 'active' } }),
        Poll.count(),
        Poll.count({ where: { status: 'active' } })
      ]);

      res.json({
        success: true,
        stats: {
          comments: {
            total: totalComments,
            pending: pendingComments
          },
          meetings: {
            total: totalMeetings,
            upcoming: upcomingMeetings
          },
          surveys: {
            total: totalSurveys,
            active: activeSurveys
          },
          polls: {
            total: totalPolls,
            active: activePolls
          }
        }
      });
    } catch (error) {
      console.error('Get stats error:', error);
      res.status(500).json({
        error: 'Failed to fetch statistics',
        message: config.nodeEnv === 'development' ? error.message : 'An error occurred'
      });
    }
  }
);

module.exports = router;
