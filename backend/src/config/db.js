const sql = require('mssql');
const config = require('./index');

let poolPromise;

/**
 * Shared SQL Server connection pool. The dashboard only reads data, so the
 * connection declares read-only intent; queries in this app are SELECT-only.
 */
const getPool = () => {
  if (!config.db.server || !config.db.database) {
    throw new Error('Database is not configured (DB_HOST / DB_NAME missing in .env)');
  }
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool({
      server: config.db.server,
      port: config.db.port,
      database: config.db.database,
      user: config.db.user,
      password: config.db.password,
      options: { encrypt: config.db.encrypt, trustServerCertificate: true, readOnlyIntent: true },
      pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
      connectionTimeout: 20000,
      requestTimeout: 60000,
    })
      .connect()
      .catch((err) => {
        poolPromise = undefined;
        throw err;
      });
  }
  return poolPromise;
};

module.exports = { sql, getPool };
