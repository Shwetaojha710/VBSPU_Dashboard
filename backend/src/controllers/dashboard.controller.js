const dashboardService = require('../services/dashboard.service');
const ApiError = require('../utils/ApiError');

const getSummary = async (req, res, next) => {
  try {
    res.status(200).json(await dashboardService.getSummary());
  } catch (err) {
    console.error('Dashboard summary failed:', err.message);
    next(new ApiError(503, 'Dashboard data is temporarily unavailable'));
  }
};

module.exports = { getSummary };
