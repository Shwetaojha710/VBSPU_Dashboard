const { Router } = require('express');
const dashboardController = require('../controllers/dashboard.controller');

const router = Router();

router.get('/summary', dashboardController.getSummary);
router.get('/details/:key', dashboardController.getDetail);
router.get('/exam-status', dashboardController.getExamStatus);
router.get('/enrollment-by-type', dashboardController.getEnrollmentByType);
router.get('/course-status', dashboardController.getCourseSummary);
router.get('/course-status/:code', dashboardController.getCollegeCourses);
router.get('/exam-supervision/dates', dashboardController.getExamSupervisionDates);
router.get('/exam-supervision', dashboardController.getExamSupervision);
router.get('/exam-evaluators/subjects', dashboardController.getExamEvaluatorSubjects);
router.get('/exam-evaluators/:uniqueId/print', dashboardController.getExamEvaluatorPrint);
router.get('/exam-evaluators', dashboardController.getExamEvaluators);
router.get('/exam-schedule/dates', dashboardController.getExamScheduleDates);
router.get('/exam-schedule', dashboardController.getExamSchedule);
router.get('/exam-attendance/meetings', dashboardController.getExamAttendanceMeetings);
router.get('/exam-attendance/dates', dashboardController.getExamAttendanceDates);
router.get('/exam-attendance', dashboardController.getExamAttendance);
router.get('/exam-remuneration/filters', dashboardController.getExamRemunerationFilters);
router.get('/exam-remuneration/:examinerCode/bill', dashboardController.getExamRemunerationBill);
router.post('/exam-remuneration/:examinerCode/allowance', dashboardController.updateExamRemunerationAllowance);
router.post('/exam-remuneration/:examinerCode/verify', dashboardController.setExamRemunerationVerified);
router.get('/exam-remuneration', dashboardController.getExamRemuneration);
router.get('/copy-scan-status/filters', dashboardController.getCopyScanStatusFilters);
router.get('/copy-scan-status/details', dashboardController.getCopyScanStatusDetails);
router.get('/copy-scan-status', dashboardController.getCopyScanStatus);
router.get('/attendance-verification-summary/filters', dashboardController.getAttendanceVerificationFilters);
router.get('/attendance-verification-summary', dashboardController.getAttendanceVerificationSummary);

module.exports = router;
