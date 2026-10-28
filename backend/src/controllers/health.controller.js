const healthService = require('../services/health.service');

const getHealth = (req, res) => {
  res.status(200).json(healthService.getHealth());
};

module.exports = { getHealth };
