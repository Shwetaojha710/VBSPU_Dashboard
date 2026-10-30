const { getPool } = require('../config/db');
const config = require('../config');
const cached = require('../utils/cached');
const { DISTRICT_FILTER, inScope, inScopeExact, ATTENDANCE_IN_SCOPE } = require('./scope');

/*
 * Dashboard figures. Every statement here is a read-only SELECT of aggregates;
 * personal columns (names, contact, bank, ID numbers, passwords) are never selected.
 * All figures cover only colleges in the districts listed in ./scope.js.
 */

/** Result rows from all three result tables, limited to proper "YYYY-YY" sessions. */
const RESULTS_CTE = `
WITH results AS (
  SELECT SESSION AS session, ROLL_NO AS rollNo, RESULT AS result FROM dbo.STUDENTRESULT_UG_NEP WHERE ${inScope('COLLEGE_CODE')}
  UNION ALL SELECT SESSION, ROLL_NO, RESULT FROM dbo.STUDENTRESULT_PG_NEP WHERE ${inScope('COLLEGE_CODE')}
  UNION ALL SELECT SESSION, ROLL_NO, RESULT FROM dbo.STUDENTRESULT_SEM_Online WHERE ${inScope('COLLEGE_CODE')}
)`;

/** Dashboard charts and figures cover this many recent years (academic sessions / calendar years). */
const YEARS_SHOWN = 3;

const SUMMARY_QUERY = `
SELECT
  (SELECT COUNT(*) FROM dbo.M_College WHERE ${DISTRICT_FILTER}) AS affiliatedColleges,
  (SELECT COUNT(*) FROM dbo.M_College c
     WHERE ${DISTRICT_FILTER} AND EXISTS (SELECT 1 FROM dbo.Student_Data s
                   WHERE s.CollegeCode = c.CollegeCode AND s.SessionId = (SELECT MAX(SessionId) FROM dbo.Student_Data))
       AND NOT EXISTS (SELECT 1 FROM dbo.Student_Data s
                       WHERE s.CollegeCode = c.CollegeCode AND s.SessionId < (SELECT MAX(SessionId) FROM dbo.Student_Data))) AS newColleges,
  (SELECT COUNT(DISTINCT District) FROM dbo.M_College WHERE ${DISTRICT_FILTER}) AS collegeDistricts,
  (SELECT COUNT(*) FROM dbo.PU_Evaluators_Final WHERE ISNULL(delflg, 0) = 0 AND ${inScope('collegecode')}) AS evaluators,
  (SELECT COUNT(*) FROM dbo.PU_Evaluators_Final
     WHERE ISNULL(delflg, 0) = 0 AND ${inScope('collegecode')} AND CreatedDate < DATEADD(YEAR, -1, GETDATE())) AS evaluatorsPrevious,
  (SELECT COUNT(*) FROM dbo.PU_Evaluators_Final
     WHERE ISNULL(delflg, 0) = 0 AND ${inScope('collegecode')}
       AND ISNULL(IsApproved, 0) = 0 AND ISNULL(IsDeclined, 0) = 0) AS pendingEvaluatorApprovals,
  -- Approximation for "vs last week": registrations still pending that were already in a week ago.
  (SELECT COUNT(*) FROM dbo.PU_Evaluators_Final
     WHERE ISNULL(delflg, 0) = 0 AND ${inScope('collegecode')}
       AND ISNULL(IsApproved, 0) = 0 AND ISNULL(IsDeclined, 0) = 0
       AND CreatedDate < DATEADD(DAY, -7, GETDATE())) AS pendingEvaluatorApprovalsPrevious,
  (SELECT COUNT(*) FROM dbo.Grievance
     WHERE ${inScope('CollegeCode')} AND UPPER(status) NOT IN ('COMPLETED', 'RESOLVED', 'CLOSED')) AS activeGrievances,
  (SELECT COUNT(*) FROM dbo.Grievance
     WHERE ${inScope('CollegeCode')} AND UPPER(status) NOT IN ('COMPLETED', 'RESOLVED', 'CLOSED')
       AND DateCreated < DATEADD(MONTH, -1, GETDATE())) AS activeGrievancesPrevious,
  (SELECT COUNT(DISTINCT CAST(a.courseId AS varchar(12)) + '-' + CAST(a.[year] AS varchar(12)))
     FROM dbo.ExamAttendance a
     WHERE a.Sessionid = (SELECT MAX(Sessionid) FROM dbo.ExamAttendance) AND ${ATTENDANCE_IN_SCOPE}) AS examsInProgress,
  (SELECT COUNT(*) FROM dbo.ExamAttendance a
     WHERE a.Sessionid = (SELECT MAX(Sessionid) FROM dbo.ExamAttendance) AND a.Present = 1 AND ${ATTENDANCE_IN_SCOPE}) AS answerScripts;

SELECT UPPER(LTRIM(RTRIM(District))) AS district, COUNT(*) AS colleges
FROM dbo.M_College
WHERE ${DISTRICT_FILTER}
GROUP BY UPPER(LTRIM(RTRIM(District)))
ORDER BY colleges DESC;

${RESULTS_CTE}
SELECT TOP (${YEARS_SHOWN}) session,
  COUNT(*) AS results,
  SUM(CASE WHEN result LIKE 'PASS%' THEN 1 ELSE 0 END) AS passedResults,
  COUNT(DISTINCT CASE WHEN result LIKE 'PASS%' THEN rollNo END) AS passedStudents
FROM results
WHERE session LIKE '20[0-9][0-9]-[0-9][0-9]'
GROUP BY session
ORDER BY session DESC;

SELECT YEAR(DateCreated) AS [year], MONTH(DateCreated) AS [month], COUNT(*) AS received, 0 AS resolved
FROM dbo.Grievance WHERE ${inScope('CollegeCode')} GROUP BY YEAR(DateCreated), MONTH(DateCreated)
UNION ALL
SELECT YEAR(UpdatedOn), MONTH(UpdatedOn), 0, COUNT(*)
FROM dbo.Grievance
WHERE ${inScope('CollegeCode')} AND UPPER(status) IN ('COMPLETED', 'RESOLVED', 'CLOSED') AND UpdatedOn IS NOT NULL
GROUP BY YEAR(UpdatedOn), MONTH(UpdatedOn);

SELECT COUNT(DISTINCT ROLL_NO) AS phdScholars FROM dbo.PHD_Data_24 WHERE ${inScope('CollegeCode')};

SELECT TOP 8 'result' AS type, Course AS course, [Year] AS part, SemesterType AS semesterType, Session AS session, UploadOn AS at
FROM dbo.TblExamUploadSummary WHERE ISNULL(Isdeleted, 0) = 0 ORDER BY UploadOn DESC;

SELECT TOP 8 ID AS id, UPPER(status) AS status, DateCreated AS createdAt, UpdatedOn AS updatedAt
FROM dbo.Grievance WHERE ${inScope('CollegeCode')} ORDER BY COALESCE(UpdatedOn, DateCreated) DESC;

SELECT s.SessionId AS sessionId, m.Session AS session, COUNT(DISTINCT s.RegistrationNo) AS students
FROM dbo.Student_Data s LEFT JOIN dbo.M_Session m ON m.SessionId = s.SessionId
WHERE ${inScopeExact('s.CollegeCode')}
GROUP BY s.SessionId, m.Session
ORDER BY s.SessionId;
`;

const toTitle = (s) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const RESOLVED = ['COMPLETED', 'RESOLVED', 'CLOSED'];
/** M_Session names the session by its closing year ("2026"); show it as "2025-26". */
const academicYear = (session) => {
  const year = Number(String(session).trim());
  return Number.isInteger(year) && year > 2000 ? `${year - 1}-${String(year).slice(2)}` : String(session).trim();
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Received/resolved counts for the five months ending at the latest month with grievance activity. */
const grievanceTrend = (rows) => {
  const byMonth = new Map();
  for (const r of rows) {
    const key = r.year * 12 + (r.month - 1);
    const m = byMonth.get(key) || { received: 0, resolved: 0 };
    m.received += r.received;
    m.resolved += r.resolved;
    byMonth.set(key, m);
  }
  if (!byMonth.size) {
    return [];
  }
  const last = Math.max(...byMonth.keys());
  return Array.from({ length: 5 }, (_, i) => {
    const key = last - 4 + i;
    const m = byMonth.get(key) || { received: 0, resolved: 0 };
    return { year: Math.floor(key / 12), month: MONTHS[key % 12], ...m };
  });
};

/** Received/resolved grievances per calendar year, for the last YEARS_SHOWN years up to this year. */
const grievancesByYear = (rows) => {
  const thisYear = new Date().getFullYear();
  return Array.from({ length: YEARS_SHOWN }, (_, i) => {
    const year = thisYear - YEARS_SHOWN + 1 + i;
    const inYear = rows.filter((r) => r.year === year);
    return {
      year,
      received: inYear.reduce((sum, r) => sum + r.received, 0),
      resolved: inYear.reduce((sum, r) => sum + r.resolved, 0),
    };
  });
};

/** Latest result publications and grievance updates, newest first. */
const recentActivity = (uploads, grievances) =>
  [
    ...uploads.map((u) => ({
      title: 'Exam result published',
      detail: `${u.course.trim()} ${/annual/i.test(u.semesterType || '') ? 'Year' : 'Sem'} ${String(u.part).trim()} (${u.session.trim()})`,
      at: u.at,
    })),
    ...grievances.map((g) => {
      const resolved = RESOLVED.includes(g.status) && g.updatedAt;
      const at = resolved ? g.updatedAt : g.createdAt;
      return {
        title: resolved ? 'Grievance resolved' : 'Grievance received',
        detail: `#GRV-${new Date(g.createdAt).getFullYear()}-${g.id}`,
        at,
      };
    }),
  ]
    .filter((a) => a.at)
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, 8);

const fetchSummary = async () => {
  const pool = await getPool();
  const { recordsets } = await pool.request().query(SUMMARY_QUERY);
  const [[totals], districts, sessions, grievanceMonths, [phd], uploads, grievances, enrollmentRows] = recordsets;
  const [latest, previous] = sessions;
  const enrollment = enrollmentRows
    .map((r) => ({ session: academicYear(r.session), students: r.students }))
    .slice(-YEARS_SHOWN);
  const [currentEnrollment, previousEnrollment] = enrollment.slice(-2).reverse();

  return {
    source: 'database',
    generatedAt: new Date().toISOString(),
    resultSession: latest ? latest.session : null,
    stats: {
      totalStudents: currentEnrollment ? currentEnrollment.students : 0,
      affiliatedColleges: totals.affiliatedColleges,
      /** Colleges whose first student registrations are in the current session. */
      newColleges: totals.newColleges,
      collegeDistricts: totals.collegeDistricts,
      facultyAndStaff: totals.evaluators,
      pendingApprovals: totals.pendingEvaluatorApprovals,
      activeGrievances: totals.activeGrievances,
      examsInProgress: totals.examsInProgress,
      answerScripts: totals.answerScripts,
      passedStudents: latest ? latest.passedStudents : 0,
      phdScholars: phd.phdScholars,
    },
    /** Comparison values for the "vs last ..." trends. */
    previous: {
      totalStudents: previousEnrollment ? previousEnrollment.students : 0,
      facultyAndStaff: totals.evaluatorsPrevious,
      activeGrievances: totals.activeGrievancesPrevious,
      pendingApprovals: totals.pendingEvaluatorApprovalsPrevious,
      passedStudents: previous ? previous.passedStudents : 0,
    },
    /** Students registered per session (Student_Data), oldest first. */
    enrollment,
    collegesByDistrict: districts.map((r) => ({ name: toTitle(r.district), colleges: r.colleges })),
    passPercentage: sessions
      .slice()
      .reverse()
      .map((s) => ({ session: s.session, percent: s.results ? (s.passedResults / s.results) * 100 : 0 })),
    grievanceTrend: grievanceTrend(grievanceMonths),
    grievancesByYear: grievancesByYear(grievanceMonths),
    activity: recentActivity(uploads, grievances),
  };
};

/** Cached summary, so the large student and result tables are not scanned on every page load. */
const getSummary = cached(fetchSummary, config.dashboardCacheMs, 'summary-v2');

module.exports = { getSummary, RESULTS_CTE, YEARS_SHOWN, toTitle, academicYear };
