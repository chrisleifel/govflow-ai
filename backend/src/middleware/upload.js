const multer = require('multer');
const path = require('path');
const fs = require('fs');
const config = require('../config/config');

// Ensure uploads directory exists
const uploadsDir = config.storage.path || './uploads';
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Create subdirectories by permit ID if available
    const permitId = req.body.permitId || req.params.permitId || 'general';
    const destPath = path.join(uploadsDir, permitId);

    if (!fs.existsSync(destPath)) {
      fs.mkdirSync(destPath, { recursive: true });
    }

    cb(null, destPath);
  },
  filename: function (req, file, cb) {
    // Generate unique filename: timestamp-randomstring-originalname
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext);
    const filename = `${basename}-${uniqueSuffix}${ext}`;
    cb(null, filename);
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  // Get allowed file types from config
  const allowedTypes = config.upload.allowedFileTypes || ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'gif'];
  const ext = path.extname(file.originalname).toLowerCase().slice(1);

  // Check file extension
  if (allowedTypes.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`File type .${ext} is not allowed. Allowed types: ${allowedTypes.join(', ')}`), false);
  }
};

// Create multer upload instance
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: config.upload.maxFileSize || 10 * 1024 * 1024 // 10MB default
  }
});

// Error handler for multer
const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'File too large',
        message: `Maximum file size is ${config.upload.maxFileSize / 1024 / 1024}MB`
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        error: 'Too many files',
        message: err.message
      });
    }
    return res.status(400).json({
      error: 'Upload error',
      message: err.message
    });
  }

  if (err) {
    return res.status(400).json({
      error: 'Upload failed',
      message: err.message
    });
  }

  next();
};

module.exports = {
  upload,
  handleUploadError
};
