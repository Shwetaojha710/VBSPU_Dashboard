const dashboardService = require('../services/dashboard.service');
const detailsService = require('../services/dashboard-details.service');
const examStatusService = require('../services/exam-status.service');
const enrollmentByTypeService = require('../services/enrollment-by-type.service');
const courseStatusService = require('../services/course-status.service');
const examSupervisionService = require('../services/exam-supervision.service');
const ApiError = require('../utils/ApiError');

const getSummary = async (req, res, next) => {
  try {
    res.status(200).json(await dashboardService.getSummary());
  } catch (err) {
    console.error('Dashboard summary failed:', err.message);
    next(new ApiError(503, 'Dashboard data is temporarily unavailable'));
  }
};

const getDetail = async (req, res, next) => {
  let detail;
  try {
    detail = await detailsService.getDetail(req.params.key);
  } catch (err) {
    console.error(`Dashboard detail "${req.params.key}" failed:`, err.message);
    return next(new ApiError(503, 'Dashboard data is temporarily unavailable'));
  }
  if (!detail) {
    return next(new ApiError(404, 'No database detail for this metric'));
  }
  res.status(200).json(detail);
};

const getExamStatus = async (req, res, next) => {
  try {
    res.status(200).json(await examStatusService.getExamStatus());
  } catch (err) {
    console.error('Exam status failed:', err.message);
    next(new ApiError(503, 'Dashboard data is temporarily unavailable'));
  }
};

const getEnrollmentByType = async (req, res, next) => {
  try {
    res.status(200).json(await enrollmentByTypeService.getEnrollmentByType());
  } catch (err) {
    console.error('Enrollment by type failed:', err.message);
    next(new ApiError(503, 'Dashboard data is temporarily unavailable'));
  }
};

const getCourseSummary = async (req, res, next) => {
  try {
    res.status(200).json(await courseStatusService.getCourseSummary());
  } catch (err) {
    console.error('Course status failed:', err.message);
    next(new ApiError(503, 'Dashboard data is temporarily unavailable'));
  }
};

const getCollegeCourses = async (req, res, next) => {
  try {
    res.status(200).json(await courseStatusService.getCollegeCourses(req.params.code));
  } catch (err) {
    console.error('College courses failed:', err.message);
    next(new ApiError(503, 'Dashboard data is temporarily unavailable'));
  }
};

const getExamSupervisionDates = async (req, res, next) => {
  try {
    res.status(200).json(await examSupervisionService.getDates());
  } catch (err) {
    console.error('Exam supervision dates failed:', err.message);
    next(new ApiError(503, 'Dashboard data is temporarily unavailable'));
  }
};

const getExamSupervision = async (req, res, next) => {
  try {
    res.status(200).json(await examSupervisionService.getReport(req.query.date));
  } catch (err) {
    if (err.status === 400) {
      return next(new ApiError(400, 'Valid date query required (YYYY-MM-DD)'));
    }
    console.error('Exam supervision report failed:', err.message);
    next(new ApiError(503, 'Dashboard data is temporarily unavailable'));
  }
};

module.exports = {
  getSummary,
  getDetail,
  getExamStatus,
  getEnrollmentByType,
  getCourseSummary,
  getCollegeCourses,
  getExamSupervisionDates,
  getExamSupervision,
};
