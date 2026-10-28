const { Router } = require('express');
const healthRoutes = require('./health.routes');
const dashboardRoutes = require('./dashboard.routes');

const router = Router();

router.use('/health', healthRoutes);
router.use('/dashboard', dashboardRoutes);

module.exports = router;
