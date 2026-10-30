const { Router } = require('express');
const dashboardController = require('../controllers/dashboard.controller');

const router = Router();

router.get('/summary', dashboardController.getSummary);
router.get('/details/:key', dashboardController.getDetail);
router.get('/exam-status', dashboardController.getExamStatus);
router.get('/enrollment-by-type', dashboardController.getEnrollmentByType);
router.get('/course-status', dashboardController.getCourseSummary);
router.get('/course-status/:code', dashboardController.getCollegeCourses);

module.exports = router;
