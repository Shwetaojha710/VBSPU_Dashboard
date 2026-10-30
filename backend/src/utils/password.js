const crypto = require('crypto');

/*
 * Password hashes stored in AUTH_USERS look like "scrypt:<salt hex>:<hash hex>".
 * scrypt is built into Node, so no extra dependency is needed.
 */
const KEY_LENGTH = 64;

const hashPassword = (password) => {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, KEY_LENGTH);
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
};

/** Constant-time check of a password against a stored hash; false for malformed hashes. */
const verifyPassword = (password, stored) => {
  const [scheme, saltHex, hashHex] = String(stored).split(':');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) {
    return false;
  }
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return expected.length === KEY_LENGTH && crypto.timingSafeEqual(actual, expected);
};

module.exports = { hashPassword, verifyPassword };
