const { body, param, query, validationResult } = require('express-validator');

/**
 * Middleware to handle validation errors
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array().map(err => ({
        field: err.path || err.param,
        message: err.msg,
        value: err.value
      }))
    });
  }

  next();
};

/**
 * Common validation rules
 */
const validationRules = {
  // User validation
  email: body('email')
    .trim()
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),

  password: body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),

  name: body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters')
    .matches(/^[a-zA-Z\s\-']+$/)
    .withMessage('Name can only contain letters, spaces, hyphens, and apostrophes'),

  role: body('role')
    .optional()
    .isIn(['citizen', 'staff', 'admin', 'inspector'])
    .withMessage('Invalid role'),

  // Permit validation
  permitType: body('type')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Permit type is required and must be between 2 and 100 characters'),

  applicantName: body('applicantName')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Applicant name is required'),

  applicantEmail: body('applicantEmail')
    .trim()
    .isEmail()
    .withMessage('Valid email address is required')
    .normalizeEmail(),

  propertyAddress: body('propertyAddress')
    .trim()
    .isLength({ min: 5, max: 500 })
    .withMessage('Property address is required'),

  projectDescription: body('projectDescription')
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage('Project description cannot exceed 5000 characters'),

  permitStatus: body('status')
    .optional()
    .isIn(['submitted', 'under_review', 'approved', 'rejected', 'on_hold'])
    .withMessage('Invalid permit status'),

  // UUID validation
  uuid: param('id')
    .isUUID()
    .withMessage('Invalid ID format'),

  // Pagination validation
  page: query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),

  limit: query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),

  // Search validation
  searchQuery: query('q')
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Search query must be between 1 and 200 characters')
};

/**
 * Validation chain builders for common operations
 */
const validate = {
  // Auth validations
  register: [
    validationRules.email,
    validationRules.password,
    validationRules.name,
    validationRules.role,
    handleValidationErrors
  ],

  login: [
    validationRules.email,
    body('password').notEmpty().withMessage('Password is required'),
    handleValidationErrors
  ],

  // Permit validations
  createPermit: [
    validationRules.permitType,
    validationRules.applicantName,
    validationRules.applicantEmail,
    validationRules.propertyAddress,
    validationRules.projectDescription,
    handleValidationErrors
  ],

  updatePermit: [
    validationRules.uuid,
    body('type').optional().trim().isLength({ min: 2, max: 100 }),
    body('applicantName').optional().trim().isLength({ min: 2, max: 100 }),
    body('applicantEmail').optional().trim().isEmail(),
    body('propertyAddress').optional().trim().isLength({ min: 5, max: 500 }),
    body('projectDescription').optional().trim().isLength({ max: 5000 }),
    validationRules.permitStatus,
    handleValidationErrors
  ],

  permitId: [
    validationRules.uuid,
    handleValidationErrors
  ],

  // List/search validations
  listPermits: [
    validationRules.page,
    validationRules.limit,
    query('status')
      .optional()
      .isIn(['submitted', 'under_review', 'approved', 'rejected', 'on_hold'])
      .withMessage('Invalid status filter'),
    handleValidationErrors
  ],

  searchPermits: [
    validationRules.searchQuery,
    validationRules.page,
    validationRules.limit,
    handleValidationErrors
  ]
};

module.exports = {
  validate,
  validationRules,
  handleValidationErrors
};
