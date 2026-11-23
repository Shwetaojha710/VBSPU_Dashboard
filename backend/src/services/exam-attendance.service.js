const { getPool, sql } = require('../config/db');

/**
 * Exam Attendance — wraps dbo.CentreWiseAttendanceReport.
 * Filters: courseTypeId (0 all / 1 UG / 2 PG), meetingId, examDate, centerCode (LoginId).
 */

const formatDate = (value) => {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  // Local midnight IST often arrives as previous-day 18:30Z — shift to IST calendar day.
  const ist = new Date(d.getTime() + 330 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
};

const display = (value) => {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s && s.toUpperCase() !== 'NULL' ? s : null;
};

const deriveStatus = (totalStudent, totalFeed) => {
  const t = Number(totalStudent) || 0;
  const f = Number(totalFeed) || 0;
  if (t > 0 && f >= t) return 'Completed';
  if (f > 0) return 'Partial';
  return 'Pending';
};

const getMeetings = async (courseTypeId = 0) => {
  const pool = await getPool();
  const ct = Number(courseTypeId) || 0;
  const req = pool.request();
  let where = 'WHERE ISNULL(Isdeleted, 0) = 0';
  if (ct === 1 || ct === 2) {
    req.input('courseTypeId', sql.Int, ct);
    where += ' AND Fk_CourseId = @courseTypeId';
  }
  const result = await req.query(`
    SELECT MeetingId AS meetingId,
           MeetingName AS meetingName,
           Timing AS timing,
           CourseName AS courseName,
           Fk_CourseId AS courseTypeId,
           MeetingName + ' (' + Timing + ')' AS label
    FROM dbo.MeetingMaster
    ${where}
    ORDER BY Fk_CourseId, MeetingId
  `);
  return { meetings: result.recordset || [] };
};

const getDates = async () => {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT DISTINCT CONVERT(varchar(10), examDate, 23) AS examDate
    FROM (
      SELECT CAST(ExamDate AS date) AS examDate FROM dbo.Ug1 WHERE ExamDate IS NOT NULL
      UNION
      SELECT CAST(ExamDate AS date) FROM dbo.PG1 WHERE ExamDate IS NOT NULL
      UNION
      SELECT CAST(ExamDate AS date) FROM dbo.UG3 WHERE ExamDate IS NOT NULL
      UNION
      SELECT CAST(ExamDate AS date) FROM dbo.UG5 WHERE ExamDate IS NOT NULL
      UNION
      SELECT CAST(ExamDate AS date) FROM dbo.Pg5 WHERE ExamDate IS NOT NULL
    ) d
    ORDER BY examDate ASC
  `);
  const dates = [...new Set((result.recordset || []).map((r) => formatDate(r.examDate)).filter(Boolean))].sort();
  return { dates };
};

const getReport = async (filters = {}) => {
  const courseTypeId = Number(filters.courseTypeId) || 0;
  const meetingId = Number(filters.meetingId) || 0;
  const centerCode = String(filters.centerCode || filters.loginId || '').trim();
  const examDateRaw = String(filters.examDate || '').trim();
  const examDate = /^\d{4}-\d{2}-\d{2}$/.test(examDateRaw) ? examDateRaw : '';
  const statusFilter = String(filters.status || 'all').toLowerCase();

  const pool = await getPool();
  const result = await pool
    .request()
    .input('LoginId', sql.VarChar(10), centerCode || '')
    .input('CourseTypeId', sql.Int, courseTypeId)
    .input('MeetingId', sql.Int, meetingId)
    .input('ExamDate', sql.VarChar(80), examDate || null)
    .execute('CentreWiseAttendanceReport');

  let rows = (result.recordset || []).map((r, index) => {
    const totalStudent = Number(r.TotalStudent) || 0;
    const totalFeed = Number(r.TotalFeed) || 0;
    const totalNotFeed = Number(r.TotalNotFeeded) ?? Math.max(totalStudent - totalFeed, 0);
    const status = deriveStatus(totalStudent, totalFeed);
    return {
      sNo: index + 1,
      date: formatDate(r.Date),
      meetingId: r.MeetingId ?? null,
      meeting: display(r.Meeting),
      centerCode: display(r.CenterCode),
      centreName: display(r.CentreName),
      managerName: display(r.InchargeName),
      managerMobile: display(r.InchargeMobile),
      totalStudent,
      totalFeed,
      totalNotFeed,
      status,
    };
  });

  if (statusFilter && statusFilter !== 'all') {
    const wanted =
      statusFilter === 'completed'
        ? 'Completed'
        : statusFilter === 'partial'
          ? 'Partial'
          : statusFilter === 'pending'
            ? 'Pending'
            : null;
    if (wanted) rows = rows.filter((r) => r.status === wanted);
  }

  rows = rows.map((r, index) => ({ ...r, sNo: index + 1 }));

  const summary = {
    totalCentres: rows.length,
    completed: rows.filter((r) => r.status === 'Completed').length,
    partial: rows.filter((r) => r.status === 'Partial').length,
    pending: rows.filter((r) => r.status === 'Pending').length,
    totalStudent: rows.reduce((n, r) => n + r.totalStudent, 0),
    totalFeed: rows.reduce((n, r) => n + r.totalFeed, 0),
    totalNotFeed: rows.reduce((n, r) => n + r.totalNotFeed, 0),
  };

  return {
    filters: {
      courseTypeId,
      meetingId,
      examDate: examDate || null,
      centerCode: centerCode || null,
      status: statusFilter || 'all',
    },
    summary,
    totalRecord: rows.length,
    rows,
  };
};

module.exports = { getMeetings, getDates, getReport };
