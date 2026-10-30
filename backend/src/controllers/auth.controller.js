const authService = require('../services/auth.service');
const ApiError = require('../utils/ApiError');

/** Failed logins per client IP; after MAX_FAILURES further attempts wait out the window. */
const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60 * 1000;
const failures = new Map();

const login = (req, res, next) => {
  const key = req.ip;
  const now = Date.now();
  const record = failures.get(key);
  if (record && now - record.since < WINDOW_MS && record.count >= MAX_FAILURES) {
    return next(new ApiError(429, 'Too many failed attempts. Please try again in 15 minutes.'));
  }

  const { email, password } = req.body || {};
  if (!email || !password) {
    return next(new ApiError(400, 'Email and password are required'));
  }

  const session = authService.login(email, password);
  if (!session) {
    const fresh = !record || now - record.since >= WINDOW_MS;
    failures.set(key, { since: fresh ? now : record.since, count: fresh ? 1 : record.count + 1 });
    return next(new ApiError(401, 'Incorrect email or password'));
  }

  failures.delete(key);
  res.status(200).json(session);
};

const me = (req, res) => {
  res.status(200).json(req.user);
};

module.exports = { login, me };
