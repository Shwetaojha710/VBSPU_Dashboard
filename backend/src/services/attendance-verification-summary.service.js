const { getPool, sql } = require('../config/db');

/**
 * Attendance Verification Summary — wraps portal SPs + paginated student list.
 *   dbo.Proc_VerifiedAttendanceSummary
 *   dbo.Proc_VerifiedAttendanceUserWise
 * Student rows: same joins/filters as Proc_VerifiedAttendanceList, with OFFSET/FETCH.
 * Read-only SELECT only.
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

const resolvePage = (raw) => {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
};

const PAGE_SIZE_ALL = 5000;

const resolvePageSize = (raw) => {
  const key = String(raw ?? '').trim().toLowerCase();
  if (key === 'all') return PAGE_SIZE_ALL;
  const n = Number(raw);
  if ([25, 40, 50, 100, 500, 1000, 2000, PAGE_SIZE_ALL].includes(n)) return n;
  return 40;
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

/** Paginated student rows — same filters as Proc_VerifiedAttendanceList. */
const getStudentRowsPaged = async (pool, sessionId, filters = {}) => {
  const examDate = normalizeDate(filters.examDate);
  const verifiedDate = normalizeDate(filters.verifiedDate);
  const courseTypeId = normalizeCourseType(filters.courseTypeId);
  const status = normalizeStatus(filters.status);
  const page = resolvePage(filters.page);
  const pageSize = resolvePageSize(filters.pageSize);
  const offset = (page - 1) * pageSize;
  const search = String(filters.search || '').trim().slice(0, 80);

  const reqCount = pool
    .request()
    .input('SessionId', sql.Int, sessionId)
    .input('ExamDate', sql.VarChar(20), examDate)
    .input('VerifiedDate', sql.VarChar(20), verifiedDate)
    .input('CourseTypeId', sql.Int, courseTypeId)
    .input('Status', sql.Char(1), status);

  const reqList = pool
    .request()
    .input('SessionId', sql.Int, sessionId)
    .input('ExamDate', sql.VarChar(20), examDate)
    .input('VerifiedDate', sql.VarChar(20), verifiedDate)
    .input('CourseTypeId', sql.Int, courseTypeId)
    .input('Status', sql.Char(1), status)
    .input('offset', sql.Int, offset)
    .input('pageSize', sql.Int, pageSize);

  if (search) {
    reqCount.input('search', sql.NVarChar(80), `%${search}%`);
    reqList.input('search', sql.NVarChar(80), `%${search}%`);
  }

  const where = `
    WHERE EA.Sessionid = @SessionId
      AND (@ExamDate IS NULL OR CAST(COALESCE(EA.ExamDate, EA.CreatedAt) AS DATE) = TRY_CONVERT(DATE, @ExamDate, 23))
      AND (@CourseTypeId IS NULL OR EA.CourseTypeId = @CourseTypeId)
      AND (@VerifiedDate IS NULL OR (ISNULL(EA.ApprovedBy, 0) <> 0 AND CAST(EA.ApprovedDate AS DATE) = TRY_CONVERT(DATE, @VerifiedDate, 23)))
      AND (@Status IS NULL
           OR (@Status = 'V' AND ISNULL(EA.ApprovedBy, 0) <> 0)
           OR (@Status = 'D' AND ISNULL(EA.DeclinedBy, 0) <> 0)
           OR (@Status = 'P' AND ISNULL(EA.ApprovedBy, 0) = 0 AND ISNULL(EA.DeclinedBy, 0) = 0))
      ${
        search
          ? `AND (
              EA.Rollno LIKE @search OR S.StudentName LIKE @search OR C.Course LIKE @search
              OR SM.SubjectName LIKE @search OR P.PaperCode LIKE @search OR P.PaperName LIKE @search
            )`
          : ''
      }
  `;

  const from = `
    FROM dbo.ExamAttendance EA WITH (NOLOCK)
    INNER JOIN dbo.Student_Data S WITH (NOLOCK) ON S.StudentId = EA.Studentid
    LEFT JOIN dbo.Course C WITH (NOLOCK) ON C.PK_CourseID = EA.courseId
    LEFT JOIN dbo.SubjectMaster SM WITH (NOLOCK) ON SM.PK_SubjectID = EA.SubjectId
    LEFT JOIN dbo.PaperMaster P WITH (NOLOCK) ON P.PK_PaperID = EA.Paperid
    LEFT JOIN dbo.SecLogin UA WITH (NOLOCK) ON UA.PK_UserID = NULLIF(EA.ApprovedBy, 0)
    LEFT JOIN dbo.SecLogin UD WITH (NOLOCK) ON UD.PK_UserID = NULLIF(EA.DeclinedBy, 0)
  `;

  const [countResult, listResult] = await Promise.all([
    reqCount.query(`SELECT COUNT(*) AS totalRows ${from} ${where}`),
    reqList.query(`
      SELECT
        EA.Rollno AS RollNo,
        S.StudentName,
        EA.[year] AS SemNo,
        C.Course,
        LTRIM(RTRIM(SM.SubjectName)) AS Subject,
        P.PaperCode,
        P.PaperName,
        CAST(COALESCE(EA.ExamDate, EA.CreatedAt) AS DATE) AS ExamDate,
        CASE WHEN ISNULL(EA.Present, 0) = 1 THEN 'Present' ELSE 'Absent' END AS Attendance,
        CASE WHEN ISNULL(EA.ApprovedBy, 0) <> 0 THEN 'Verified'
             WHEN ISNULL(EA.DeclinedBy, 0) <> 0 THEN 'Declined'
             ELSE 'Not Verified' END AS VerifyStatus,
        CASE WHEN ISNULL(EA.ApprovedBy, 0) <> 0 THEN UA.Name
             WHEN ISNULL(EA.DeclinedBy, 0) <> 0 THEN UD.Name END AS ActionBy,
        CASE WHEN ISNULL(EA.ApprovedBy, 0) <> 0 THEN EA.ApprovedDate
             WHEN ISNULL(EA.DeclinedBy, 0) <> 0 THEN EA.DeclinedDate END AS ActionDate,
        EA.DeclineReason
      ${from}
      ${where}
      ORDER BY ActionDate DESC, ExamDate, EA.Rollno
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `),
  ]);

  const totalRows = Number(countResult.recordset?.[0]?.totalRows) || 0;
  const rows = (listResult.recordset || []).map((r, index) => ({
    sNo: offset + index + 1,
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

  return { totalRows, page, pageSize, rows };
};

const getReport = async (filters = {}) => {
  const examDate = normalizeDate(filters.examDate);
  const verifiedDate = normalizeDate(filters.verifiedDate);
  const courseTypeId = normalizeCourseType(filters.courseTypeId);
  const status = normalizeStatus(filters.status);
  const page = resolvePage(filters.page);
  const pageSize = resolvePageSize(filters.pageSize);
  const search = String(filters.search || '').trim().slice(0, 80);

  const pool = await getPool();
  const sessionId = await resolveSessionId(pool);

  const [summary, userWise, studentPage] = await Promise.all([
    getSummary(pool, sessionId, { examDate, verifiedDate, courseTypeId }),
    getUserWise(pool, sessionId, { examDate, verifiedDate, courseTypeId }),
    getStudentRowsPaged(pool, sessionId, {
      examDate,
      verifiedDate,
      courseTypeId,
      status,
      page,
      pageSize,
      search,
    }),
  ]);

  return {
    sessionId,
    filters: {
      examDate,
      verifiedDate,
      courseTypeId: courseTypeId || 0,
      status: status || '',
      page: studentPage.page,
      pageSize: studentPage.pageSize,
      search,
    },
    summary,
    userWise,
    totalRecord: studentPage.totalRows,
    page: studentPage.page,
    pageSize: studentPage.pageSize,
    rows: studentPage.rows,
    listSkipped: false,
  };
};

module.exports = { getFilters, getReport };
