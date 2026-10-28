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
  /** How long dashboard aggregates are reused before querying the database again. */
  dashboardCacheMs: Number(process.env.DASHBOARD_CACHE_SECONDS || 300) * 1000,
};
