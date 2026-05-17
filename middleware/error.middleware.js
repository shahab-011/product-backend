const AppError = require('../utils/AppError');

exports.errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || err.status || 500;
  let message    = err.message    || 'Server Error';
  let code       = err.code       || null;

  if (process.env.NODE_ENV === 'development') console.error(err.stack);

  // Mongoose validation
  if (err.name === 'ValidationError') {
    statusCode = 400;
    const fields = Object.fromEntries(
      Object.entries(err.errors).map(([k, v]) => [k, v.message])
    );
    message = Object.values(fields).join(', ');
    return res.status(400).json({ success: false, message, fields, code: 'VALIDATION_ERROR' });
  }

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    statusCode = 404;
    message = `Invalid ${err.path}: ${err.value}`;
    code    = 'CAST_ERROR';
  }

  // MongoDB duplicate key
  if (err.code === 11000 || err.name === 'MongoServerError' && err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    message = `${field} already exists`;
    code    = 'DUPLICATE_KEY';
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token — please log in again';
    code    = 'INVALID_TOKEN';
  }
  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired — please log in again';
    code    = 'TOKEN_EXPIRED';
  }

  // Multer / file upload errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    statusCode = 413;
    message = 'File is too large';
    code    = 'FILE_TOO_LARGE';
  }

  res.status(statusCode).json({ success: false, message, ...(code ? { code } : {}) });
};

exports.notFound = (req, res, next) => {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404, 'NOT_FOUND'));
};
