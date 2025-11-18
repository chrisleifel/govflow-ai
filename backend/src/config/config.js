require('dotenv').config();

module.exports = {
  // Server Configuration
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',

  // Database Configuration
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    name: process.env.DB_NAME || 'govli_ai',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    dialect: 'postgres',
    logging: process.env.NODE_ENV === 'development' ? console.log : false
  },

  // JWT Configuration
  jwt: {
    secret: process.env.JWT_SECRET,
    expiry: process.env.JWT_EXPIRY || '8h',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
    algorithm: 'HS256'
  },

  // Security Configuration
  security: {
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS) || 12,
    maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5,
    lockTime: parseInt(process.env.LOCK_TIME) || 15 * 60 * 1000, // 15 minutes
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:8080'
  },

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    authWindowMs: 15 * 60 * 1000, // 15 minutes for auth routes
    authMaxRequests: 5 // Stricter limit for auth routes
  },

  // File Upload Configuration
  upload: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
    allowedFileTypes: process.env.ALLOWED_FILE_TYPES?.split(',') || ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'gif']
  },

  // Email Configuration
  email: {
    service: process.env.EMAIL_SERVICE || '',
    from: process.env.EMAIL_FROM || 'noreply@govli.ai',
    apiKey: process.env.EMAIL_API_KEY || ''
  },

  // Redis Configuration
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379'
  },

  // Storage Configuration
  storage: {
    type: process.env.STORAGE_TYPE || 'local', // 'local' or 's3'
    path: process.env.STORAGE_PATH || './uploads',
    aws: {
      region: process.env.AWS_REGION || '',
      bucket: process.env.AWS_BUCKET || '',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
    }
  },

  // AI Configuration
  ai: {
    provider: process.env.AI_PROVIDER || 'openai', // 'openai' or 'anthropic'
    openai: {
      apiKey: process.env.OPENAI_API_KEY || '',
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 4000,
      temperature: parseFloat(process.env.OPENAI_TEMPERATURE) || 0.7
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY || '',
      model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
      maxTokens: parseInt(process.env.ANTHROPIC_MAX_TOKENS) || 4000,
      temperature: parseFloat(process.env.ANTHROPIC_TEMPERATURE) || 0.7
    },
    features: {
      enableOCR: process.env.AI_ENABLE_OCR !== 'false', // Default true
      enableClassification: process.env.AI_ENABLE_CLASSIFICATION !== 'false',
      enableRouting: process.env.AI_ENABLE_ROUTING !== 'false',
      enableChatbot: process.env.AI_ENABLE_CHATBOT !== 'false'
    }
  },

  // OCR Configuration
  ocr: {
    provider: process.env.OCR_PROVIDER || 'tesseract', // 'tesseract' or 'cloud'
    language: process.env.OCR_LANGUAGE || 'eng',
    confidence: parseFloat(process.env.OCR_CONFIDENCE) || 0.7
  },

  // Frontend URL
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:8080',

  // Validation
  validateConfig() {
    const errors = [];

    if (!this.jwt.secret || this.jwt.secret.length < 32) {
      errors.push('JWT_SECRET must be at least 32 characters long');
    }

    if (this.nodeEnv === 'production') {
      if (!this.database.password) {
        errors.push('DB_PASSWORD is required in production');
      }
      if (this.jwt.secret.includes('change-in-production')) {
        errors.push('JWT_SECRET must be changed in production');
      }
    }

    if (errors.length > 0) {
      console.error('❌ Configuration validation failed:');
      errors.forEach(err => console.error(`   - ${err}`));
      if (this.nodeEnv === 'production') {
        process.exit(1);
      } else {
        console.warn('⚠️  Continuing in development mode with configuration warnings');
      }
    }

    return errors.length === 0;
  }
};
