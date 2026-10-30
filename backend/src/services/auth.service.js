const crypto = require('crypto');
const config = require('../config');
const { hashPassword, verifyPassword } = require('../utils/password');
const { createToken, readToken } = require('../utils/token');

/*
 * Login against the accounts in AUTH_USERS (backend/.env). Nothing is read from or written to
 * the database. Without AUTH_SECRET a random secret is used, so logins end when the API restarts.
 */
const secret = config.auth.secret || crypto.randomBytes(32).toString('hex');
if (!config.auth.secret) {
  console.warn('AUTH_SECRET is not set; using a temporary secret (everyone is logged out on restart).');
}
if (!config.auth.users.length) {
  console.warn('AUTH_USERS is empty; nobody can log in. Add an account with `npm run add-user`.');
}

/** Used when the email is unknown, so a wrong email takes as long as a wrong password. */
const DUMMY_HASH = hashPassword(crypto.randomBytes(16).toString('hex'));

/** A session for valid credentials, otherwise null. */
const login = (email, password) => {
  const normalised = String(email || '').trim().toLowerCase();
  const user = config.auth.users.find((u) => u.email === normalised);
  const valid = verifyPassword(String(password || ''), user ? user.passwordHash : DUMMY_HASH);
  if (!user || !valid) {
    return null;
  }
  const expiresAt = Date.now() + config.auth.tokenTtlMs;
  return { token: createToken({ email: user.email, exp: expiresAt }, secret), email: user.email, expiresAt };
};

/** The signed-in user for a token, or null when it is invalid, expired or the account was removed. */
const userForToken = (token) => {
  const payload = readToken(token, secret);
  return payload && config.auth.users.some((u) => u.email === payload.email)
    ? { email: payload.email, expiresAt: payload.exp }
    : null;
};

module.exports = { login, userForToken };
