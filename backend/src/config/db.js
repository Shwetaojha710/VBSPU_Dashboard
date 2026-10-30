const sql = require('mssql');
const config = require('./index');

/**
 * Lazily created SQL Server connection pool. The dashboard only reads data, so the
 * connection declares read-only intent; queries in this app are SELECT-only.
 */
const poolFor = (settings, label) => {
  let poolPromise;
  return () => {
    if (!settings.server || !settings.database) {
      throw new Error(`${label} is not configured (host / database name missing in .env)`);
    }
    if (!poolPromise) {
      poolPromise = new sql.ConnectionPool({
        server: settings.server,
        port: settings.port,
        database: settings.database,
        user: settings.user,
        password: settings.password,
        // useUTC: false — the databases store local (IST) timestamps.
        options: { encrypt: settings.encrypt, trustServerCertificate: true, readOnlyIntent: true, useUTC: false },
        pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
        connectionTimeout: 20000,
        // Dashboard queries scan multi-million-row tables on shared, often busy servers. They run
        // one at a time in the background (results are cached on disk), so allow up to 10 minutes.
        requestTimeout: 600000,
      })
        .connect()
        .catch((err) => {
          poolPromise = undefined;
          throw err;
        });
    }
    return poolPromise;
  };
};

/** Main university database (DB_* in .env). */
const getPool = poolFor(config.db, 'Database');

/** Second database, PU_2026: course-wise nominal rolls, marks and results (DB2_* in .env). */
const getPool2 = poolFor(config.db2, 'Second database (DB2)');

module.exports = { sql, getPool, getPool2 };
