const config = require('../config');

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  if (statusCode >= 500) console.error(err);

  res.status(statusCode).json({
    status: 'error',
    message: statusCode >= 500 && config.env === 'production' ? 'Internal server error' : err.message,
  });
};

module.exports = errorHandler;
