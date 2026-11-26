const dashboardService = require('../services/dashboard.service');
const detailsService = require('../services/dashboard-details.service');
const examStatusService = require('../services/exam-status.service');
const enrollmentByTypeService = require('../services/enrollment-by-type.service');
const courseStatusService = require('../services/course-status.service');
const examSupervisionService = require('../services/exam-supervision.service');
const examEvaluatorService = require('../services/exam-evaluator.service');
const examScheduleService = require('../services/exam-schedule.service');
const examAttendanceService = require('../services/exam-attendance.service');
const examRemunerationService = require('../services/exam-remuneration.service');
const copyScanStatusService = require('../services/copy-scan-status.service');
const attendanceVerificationSummaryService = require('../services/attendance-verification-summary.service');
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

const getExamEvaluatorSubjects = async (req, res, next) => {
  try {
    res.status(200).json(await examEvaluatorService.getSubjects(req.query.status));
  } catch (err) {
    console.error('Exam evaluator subjects failed:', err.message);
    next(new ApiError(503, 'Dashboard data is temporarily unavailable'));
  }
};

const getExamEvaluators = async (req, res, next) => {
  try {
    res.status(200).json(
      await examEvaluatorService.getList({
        status: req.query.status,
        uniqueId: req.query.uniqueId,
        name: req.query.name,
        contactNo: req.query.contactNo,
        adharNo: req.query.adharNo,
        subject: req.query.subject,
      })
    );
  } catch (err) {
    console.error('Exam evaluator list failed:', err.message);
    next(new ApiError(503, 'Dashboard data is temporarily unavailable'));
  }
};

const getExamEvaluatorPrint = async (req, res, next) => {
  try {
    const detail = await examEvaluatorService.getPrintDetail(req.params.uniqueId);
    if (!detail) {
      return next(new ApiError(404, 'Evaluator not found'));
    }
    res.status(200).json(detail);
  } catch (err) {
    console.error('Exam evaluator print detail failed:', err.message);
    next(new ApiError(503, 'Dashboard data is temporarily unavailable'));
  }
};

const getExamScheduleDates = async (req, res, next) => {
  try {
    res.status(200).json(await examScheduleService.getDates());
  } catch (err) {
    console.error('Exam schedule dates failed:', err.message);
    next(new ApiError(503, 'Dashboard data is temporarily unavailable'));
  }
};

const getExamSchedule = async (req, res, next) => {
  try {
    res.status(200).json(
      await examScheduleService.getSchedule({
        date: req.query.date,
        level: req.query.level,
      })
    );
  } catch (err) {
    if (err.status === 400) {
      return next(new ApiError(400, err.message));
    }
    console.error('Exam schedule failed:', err.message);
    next(new ApiError(503, 'Dashboard data is temporarily unavailable'));
  }
};

const getExamAttendanceMeetings = async (req, res, next) => {
  try {
    res.status(200).json(await examAttendanceService.getMeetings(req.query.courseTypeId));
  } catch (err) {
    console.error('Exam attendance meetings failed:', err.message);
    next(new ApiError(503, 'Dashboard data is temporarily unavailable'));
  }
};

const getExamAttendanceDates = async (req, res, next) => {
  try {
    res.status(200).json(await examAttendanceService.getDates());
  } catch (err) {
    console.error('Exam attendance dates failed:', err.message);
    next(new ApiError(503, 'Dashboard data is temporarily unavailable'));
  }
};

const getExamAttendance = async (req, res, next) => {
  try {
    res.status(200).json(
      await examAttendanceService.getReport({
        courseTypeId: req.query.courseTypeId,
        meetingId: req.query.meetingId,
        examDate: req.query.examDate,
        centerCode: req.query.centerCode,
        status: req.query.status,
      })
    );
  } catch (err) {
    console.error('Exam attendance report failed:', err.message);
    next(new ApiError(503, 'Dashboard data is temporarily unavailable'));
  }
};

const getExamRemunerationFilters = async (req, res, next) => {
  try {
    res.status(200).json(await examRemunerationService.getFilters());
  } catch (err) {
    console.error('Exam remuneration filters failed:', err.message);
    next(new ApiError(503, 'Dashboard data is temporarily unavailable'));
  }
};

const getExamRemuneration = async (req, res, next) => {
  try {
    res.status(200).json(
      await examRemunerationService.getReport({
        examinerCode: req.query.examinerCode || req.query.evlCode,
        subject: req.query.subject,
        nature: req.query.nature || req.query.natureOfAppointment,
        year: req.query.year,
      })
    );
  } catch (err) {
    console.error('Exam remuneration report failed:', err.message);
    next(new ApiError(503, 'Dashboard data is temporarily unavailable'));
  }
};

const getExamRemunerationBill = async (req, res, next) => {
  try {
    res.status(200).json(await examRemunerationService.getBillDetails(req.params.examinerCode));
  } catch (err) {
    if (err.status === 400) {
      return next(new ApiError(400, 'Valid examiner code required'));
    }
    console.error('Exam remuneration bill failed:', err.message);
    next(new ApiError(503, 'Dashboard data is temporarily unavailable'));
  }
};

const updateExamRemunerationAllowance = async (req, res, next) => {
  try {
    res.status(200).json(
      await examRemunerationService.updateAllowance({
        examinerCode: req.params.examinerCode,
        field: req.body?.field,
        amount: req.body?.amount,
      })
    );
  } catch (err) {
    if (err.status === 400) {
      return next(new ApiError(400, err.message));
    }
    if (err.status === 409) {
      return next(new ApiError(409, err.message));
    }
    console.error('Exam remuneration allowance update failed:', err.message);
    next(new ApiError(503, 'Could not update allowance'));
  }
};

const getAttendanceVerificationFilters = async (req, res, next) => {
  try {
    res.status(200).json(await attendanceVerificationSummaryService.getFilters());
  } catch (err) {
    console.error('Attendance verification filters failed:', err.message);
    next(new ApiError(503, 'Dashboard data is temporarily unavailable'));
  }
};

const getAttendanceVerificationSummary = async (req, res, next) => {
  try {
    res.status(200).json(
      await attendanceVerificationSummaryService.getReport({
        examDate: req.query.examDate,
        verifiedDate: req.query.verifiedDate,
        courseTypeId: req.query.courseTypeId,
        status: req.query.status,
      })
    );
  } catch (err) {
    console.error('Attendance verification summary failed:', err.message);
    next(new ApiError(503, 'Dashboard data is temporarily unavailable'));
  }
};

const getCopyScanStatusFilters = async (req, res, next) => {
  try {
    res.status(200).json(await copyScanStatusService.getFilters());
  } catch (err) {
    console.error('Copy scan status filters failed:', err.message);
    next(new ApiError(503, 'Dashboard data is temporarily unavailable'));
  }
};

const getCopyScanStatus = async (req, res, next) => {
  try {
    res.status(200).json(
      await copyScanStatusService.getStatus({
        year: req.query.year,
        level: req.query.level,
      })
    );
  } catch (err) {
    console.error('Copy scan status failed:', err.message);
    next(new ApiError(503, 'Dashboard data is temporarily unavailable'));
  }
};

const getCopyScanStatusDetails = async (req, res, next) => {
  try {
    res.status(200).json(
      await copyScanStatusService.getStageDetails({
        year: req.query.year,
        level: req.query.level,
        stage: req.query.stage,
        page: req.query.page,
        pageSize: req.query.pageSize,
        search: req.query.search,
      })
    );
  } catch (err) {
    if (err.status === 400) {
      return next(new ApiError(400, err.message));
    }
    console.error('Copy scan status details failed:', err.message);
    next(new ApiError(503, 'Dashboard data is temporarily unavailable'));
  }
};

const setExamRemunerationVerified = async (req, res, next) => {
  try {
    res.status(200).json(
      await examRemunerationService.setVerified({
        examinerCode: req.params.examinerCode,
        verified: req.body?.verified,
        verifiedBy: req.user?.email,
      })
    );
  } catch (err) {
    if (err.status === 400) {
      return next(new ApiError(400, err.message));
    }
    console.error('Exam remuneration verify failed:', err.message);
    next(new ApiError(503, 'Could not update verification'));
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
  getExamEvaluatorSubjects,
  getExamEvaluators,
  getExamEvaluatorPrint,
  getExamScheduleDates,
  getExamSchedule,
  getExamAttendanceMeetings,
  getExamAttendanceDates,
  getExamAttendance,
  getExamRemunerationFilters,
  getExamRemuneration,
  getExamRemunerationBill,
  updateExamRemunerationAllowance,
  setExamRemunerationVerified,
  getCopyScanStatusFilters,
  getCopyScanStatus,
  getCopyScanStatusDetails,
  getAttendanceVerificationFilters,
  getAttendanceVerificationSummary,
};
