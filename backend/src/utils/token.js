const crypto = require('crypto');

/*
 * Minimal signed session token: base64url(JSON payload) + "." + base64url(HMAC-SHA256).
 * The payload carries the user's email and an expiry time (ms since epoch).
 */
const encode = (value) => Buffer.from(value).toString('base64url');
const sign = (data, secret) => crypto.createHmac('sha256', secret).update(data).digest('base64url');

const createToken = (payload, secret) => {
  const body = encode(JSON.stringify(payload));
  return `${body}.${sign(body, secret)}`;
};

/** The payload of a valid, unexpired token; otherwise null. */
const readToken = (token, secret) => {
  const [body, signature] = String(token).split('.');
  if (!body || !signature) {
    return null;
  }
  const expected = Buffer.from(sign(body, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return typeof payload.exp === 'number' && payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
};

module.exports = { createToken, readToken };
