const { getPool, sql } = require('../config/db');

/**
 * Attendance Verification Summary — wraps portal SPs:
 *   dbo.Proc_VerifiedAttendanceSummary
 *   dbo.Proc_VerifiedAttendanceUserWise
 *   dbo.Proc_VerifiedAttendanceList
 * Read-only. Live DB data; session resolved dynamically.
 */

const formatDate = (value) => {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const ist = new Date(d.getTime() + 330 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
};

const formatDateTime = (value) => {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const ist = new Date(d.getTime() + 330 * 60 * 1000);
  return ist.toISOString().replace('T', ' ').slice(0, 19);
};

const display = (value) => {
  if (value == null) return null;
  const s = String(value).trim();
  return s && s.toUpperCase() !== 'NULL' ? s : null;
};

const normalizeDate = (raw) => {
  const s = String(raw || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

const normalizeCourseType = (raw) => {
  const n = Number(raw);
  if (n === 1 || n === 2) return n;
  return null;
};

const normalizeStatus = (raw) => {
  const s = String(raw || '').trim().toUpperCase();
  if (s === 'V' || s === 'D' || s === 'P') return s;
  return null;
};

const resolveSessionId = async (pool) => {
  const result = await pool.request().query(`
    SELECT ISNULL(MAX(Sessionid), 4) AS sessionId
    FROM dbo.ExamAttendance WITH (NOLOCK)
  `);
  return Number(result.recordset?.[0]?.sessionId) || 4;
};

const getFilters = async () => {
  const pool = await getPool();
  const sessionId = await resolveSessionId(pool);
  const [examDates, verifiedDates] = await Promise.all([
    pool.request().input('sessionId', sql.Int, sessionId).query(`
      SELECT DISTINCT CONVERT(varchar(10), CAST(COALESCE(ExamDate, CreatedAt) AS date), 23) AS examDate
      FROM dbo.ExamAttendance WITH (NOLOCK)
      WHERE Sessionid = @sessionId
        AND COALESCE(ExamDate, CreatedAt) IS NOT NULL
      ORDER BY examDate DESC
    `),
    pool.request().input('sessionId', sql.Int, sessionId).query(`
      SELECT DISTINCT CONVERT(varchar(10), CAST(ApprovedDate AS date), 23) AS verifiedDate
      FROM dbo.ExamAttendance WITH (NOLOCK)
      WHERE Sessionid = @sessionId
        AND ISNULL(ApprovedBy, 0) <> 0
        AND ApprovedDate IS NOT NULL
      ORDER BY verifiedDate DESC
    `),
  ]);

  const dates = (examDates.recordset || []).map((r) => formatDate(r.examDate)).filter(Boolean);
  const verified = (verifiedDates.recordset || []).map((r) => formatDate(r.verifiedDate)).filter(Boolean);

  return {
    sessionId,
    examDates: dates,
    verifiedDates: verified,
    defaultExamDate: null,
    courseTypes: [
      { value: 0, label: 'All' },
      { value: 1, label: 'Under Graduate (U.G)' },
      { value: 2, label: 'Post Graduate (P.G)' },
    ],
    statuses: [
      { value: '', label: 'All' },
      { value: 'V', label: 'Verified' },
      { value: 'D', label: 'Declined' },
      { value: 'P', label: 'Not Verified' },
    ],
  };
};

const getSummary = async (pool, sessionId, filters = {}) => {
  const examDate = normalizeDate(filters.examDate);
  const verifiedDate = normalizeDate(filters.verifiedDate);
  const courseTypeId = normalizeCourseType(filters.courseTypeId);

  const result = await pool
    .request()
    .input('ExamDate', sql.VarChar(20), examDate)
    .input('CourseTypeId', sql.Int, courseTypeId)
    .input('SessionId', sql.Int, sessionId)
    .input('VerifiedDate', sql.VarChar(20), verifiedDate)
    .execute('Proc_VerifiedAttendanceSummary');

  const row = result.recordset?.[0] || {};
  return {
    totalAttendance: Number(row.TotalAttendance) || 0,
    totalPresent: Number(row.TotalPresent) || 0,
    totalAbsent: Number(row.TotalAbsent) || 0,
    totalVerified: Number(row.TotalVerified) || 0,
    totalDeclined: Number(row.TotalDeclined) || 0,
    totalColleges: Number(row.TotalColleges) || 0,
    totalCentres: Number(row.TotalCentres) || 0,
    totalPapers: Number(row.TotalPapers) || 0,
  };
};

const getUserWise = async (pool, sessionId, filters = {}) => {
  const examDate = normalizeDate(filters.examDate);
  const verifiedDate = normalizeDate(filters.verifiedDate);
  const courseTypeId = normalizeCourseType(filters.courseTypeId);

  const result = await pool
    .request()
    .input('ExamDate', sql.VarChar(20), examDate)
    .input('CourseTypeId', sql.Int, courseTypeId)
    .input('SessionId', sql.Int, sessionId)
    .input('VerifiedDate', sql.VarChar(20), verifiedDate)
    .execute('Proc_VerifiedAttendanceUserWise');

  return (result.recordset || []).map((r, index) => ({
    sNo: index + 1,
    userId: r.UserId ?? null,
    userName: display(r.UserName),
    verified: Number(r.Verified) || 0,
    declined: Number(r.Declined) || 0,
    total: Number(r.Total) || 0,
    present: Number(r.Present) || 0,
    lastActionDate: r.LastActionDate ? formatDateTime(r.LastActionDate) : null,
  }));
};

const getStudentRows = async (pool, sessionId, filters = {}) => {
  const examDate = normalizeDate(filters.examDate);
  const verifiedDate = normalizeDate(filters.verifiedDate);
  const courseTypeId = normalizeCourseType(filters.courseTypeId);
  const status = normalizeStatus(filters.status);

  const result = await pool
    .request()
    .input('ExamDate', sql.VarChar(20), examDate)
    .input('CourseTypeId', sql.Int, courseTypeId)
    .input('SessionId', sql.Int, sessionId)
    .input('VerifiedDate', sql.VarChar(20), verifiedDate)
    .input('Status', sql.Char(1), status)
    .input('UserId', sql.BigInt, null)
    .execute('Proc_VerifiedAttendanceList');

  return (result.recordset || []).map((r, index) => ({
    sNo: index + 1,
    rollNo: display(r.RollNo),
    studentName: display(r.StudentName),
    semNo: r.SemNo ?? null,
    course: display(r.Course),
    subject: display(r.Subject),
    paperCode: display(r.PaperCode),
    paperName: display(r.PaperName),
    examDate: formatDate(r.ExamDate),
    attendance: display(r.Attendance),
    verifyStatus: display(r.VerifyStatus),
    actionBy: display(r.ActionBy),
    actionDate: r.ActionDate ? formatDate(r.ActionDate) : null,
    actionDateTime: r.ActionDate ? formatDateTime(r.ActionDate) : null,
    declineReason: display(r.DeclineReason),
  }));
};

const getReport = async (filters = {}) => {
  const examDate = normalizeDate(filters.examDate);
  const verifiedDate = normalizeDate(filters.verifiedDate);
  const courseTypeId = normalizeCourseType(filters.courseTypeId);
  const status = normalizeStatus(filters.status);

  // Full unscoped list is ~140k rows — only load when a date/status filter is set.
  const hasListScope = Boolean(examDate || verifiedDate || status);
  const pool = await getPool();
  const sessionId = await resolveSessionId(pool);

  const [summary, userWise] = await Promise.all([
    getSummary(pool, sessionId, { examDate, verifiedDate, courseTypeId }),
    getUserWise(pool, sessionId, { examDate, verifiedDate, courseTypeId }),
  ]);

  if (!hasListScope) {
    return {
      sessionId,
      filters: { examDate, verifiedDate, courseTypeId: courseTypeId || 0, status: status || '' },
      summary,
      userWise,
      totalRecord: 0,
      rows: [],
      listSkipped: true,
      message: 'Select Exam Date, Verified Date, or Status to load student-wise rows.',
    };
  }

  const rows = await getStudentRows(pool, sessionId, { examDate, verifiedDate, courseTypeId, status });

  return {
    sessionId,
    filters: { examDate, verifiedDate, courseTypeId: courseTypeId || 0, status: status || '' },
    summary,
    userWise,
    totalRecord: rows.length,
    rows,
    listSkipped: false,
  };
};

module.exports = { getFilters, getReport };
