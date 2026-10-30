const ApiError = require('../utils/ApiError');
const { userForToken } = require('../services/auth.service');

/** Lets a request through only with a valid "Authorization: Bearer <token>" header. */
const requireAuth = (req, res, next) => {
  const [scheme, token] = String(req.headers.authorization || '').split(' ');
  const user = scheme === 'Bearer' && token ? userForToken(token) : null;
  if (!user) {
    return next(new ApiError(401, 'Please log in'));
  }
  req.user = user;
  next();
};

module.exports = requireAuth;
