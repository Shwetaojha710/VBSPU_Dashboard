require('dotenv').config({ quiet: true });

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5000,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:4200',
  db: {
    server: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 1433,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    encrypt: process.env.DB_ENCRYPT === 'true',
  },
  /** Second SQL Server (PU_2026) with course-wise nominal rolls, marks and results. */
  db2: {
    server: process.env.DB2_HOST,
    port: Number(process.env.DB2_PORT) || 1433,
    database: process.env.DB2_NAME,
    user: process.env.DB2_USER,
    password: process.env.DB2_PASSWORD,
    encrypt: process.env.DB2_ENCRYPT === 'true',
  },
  /** How long dashboard aggregates are reused before querying the database again. */
  dashboardCacheMs: Number(process.env.DASHBOARD_CACHE_SECONDS || 1800) * 1000,
  auth: {
    /** "email:scrypt:salt:hash" entries separated by commas (see `npm run add-user`). */
    users: parseUsers(process.env.AUTH_USERS),
    /** Secret that signs login tokens; changing it signs everyone out. */
    secret: process.env.AUTH_SECRET,
    tokenTtlMs: Number(process.env.AUTH_TOKEN_HOURS || 8) * 60 * 60 * 1000,
  },
};

function parseUsers(value) {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const at = entry.indexOf(':');
      return { email: entry.slice(0, at).trim().toLowerCase(), passwordHash: entry.slice(at + 1).trim() };
    })
    .filter((u) => u.email && u.passwordHash);
}
