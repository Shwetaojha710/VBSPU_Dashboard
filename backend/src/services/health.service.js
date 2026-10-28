const config = require('../config');

const getHealth = () => ({
  status: 'ok',
  environment: config.env,
  uptime: process.uptime(),
  timestamp: new Date().toISOString(),
});

module.exports = { getHealth };
