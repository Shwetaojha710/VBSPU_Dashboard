const { getPool } = require('../config/db');
const config = require('../config');
const cached = require('../utils/cached');
const { RESULTS_CTE, YEARS_SHOWN, toTitle, academicYear } = require('./dashboard.service');
const { DISTRICT_FILTER, inScope, inScopeExact, ATTENDANCE_IN_SCOPE } = require('./scope');

/*
 * Breakdowns shown when a stat card is clicked. Like the summary, every statement is a
 * read-only SELECT of aggregates; names, contact, bank and ID columns are never selected.
 * Like the summary, they cover only colleges in the districts listed in ./scope.js.
 * Each detail is { title, sections: [{ title, columns, rows }] }.
 */

const NOT_SPECIFIED = 'Not specified';
const label = (value) => (value === null || value === undefined || String(value).trim() === '' ? NOT_SPECIFIED : String(value).trim());
const percent = (part, whole) => (whole ? `${((part / whole) * 100).toFixed(1)}%` : '–');
const GENDERS = { F: 'Female', FEMALE: 'Female', M: 'Male', MALE: 'Male', TRANSGENDER: 'Transgender' };

/** Merges rows whose first cell normalises to the same label, summing the numeric cells. */
const mergeRows = (rows) => {
  const merged = new Map();
  for (const [name, ...values] of rows) {
    const existing = merged.get(name);
    merged.set(name, existing ? existing.map((v, i) => v + values[i]) : values);
  }
  return [...merged].map(([name, values]) => [name, ...values]);
};

const DETAILS = {
  totalStudents: {
    query: `
SELECT s.SessionId AS sessionId, m.Session AS session, COUNT(DISTINCT s.RegistrationNo) AS students
FROM dbo.Student_Data s LEFT JOIN dbo.M_Session m ON m.SessionId = s.SessionId
WHERE ${inScopeExact('s.CollegeCode')}
GROUP BY s.SessionId, m.Session ORDER BY s.SessionId;

SELECT UPPER(LTRIM(RTRIM(Gender))) AS gender, COUNT(DISTINCT RegistrationNo) AS students
FROM dbo.Student_Data WHERE SessionId = (SELECT MAX(SessionId) FROM dbo.Student_Data) AND ${inScopeExact('CollegeCode')}
GROUP BY UPPER(LTRIM(RTRIM(Gender))) ORDER BY students DESC;

SELECT TOP 10 LTRIM(RTRIM(Course)) AS course, COUNT(DISTINCT RegistrationNo) AS students
FROM dbo.Student_Data WHERE SessionId = (SELECT MAX(SessionId) FROM dbo.Student_Data) AND ${inScopeExact('CollegeCode')}
GROUP BY LTRIM(RTRIM(Course)) ORDER BY students DESC;`,
    build: ([sessions, genders, courses]) => {
      const current = academicYear(sessions[sessions.length - 1]?.session ?? '');
      return {
        title: 'Total Students',
        sections: [
          {
            title: 'Registered students by session',
            columns: ['Session', 'Students'],
            rows: sessions.map((r) => [academicYear(r.session), r.students]),
          },
          {
            title: `By gender (${current})`,
            columns: ['Gender', 'Students'],
            rows: mergeRows(genders.map((r) => [GENDERS[r.gender] ?? label(r.gender), r.students])),
          },
          {
            title: `Top courses (${current})`,
            columns: ['Course', 'Students'],
            rows: courses.map((r) => [label(r.course), r.students]),
          },
        ],
      };
    },
  },

  affiliatedColleges: {
    query: `
SELECT UPPER(LTRIM(RTRIM(District))) AS district, COUNT(*) AS colleges
FROM dbo.M_College WHERE ${DISTRICT_FILTER} GROUP BY UPPER(LTRIM(RTRIM(District))) ORDER BY colleges DESC;

SELECT UPPER(LTRIM(RTRIM(CollegeType))) AS type, COUNT(*) AS colleges
FROM dbo.M_College WHERE ${DISTRICT_FILTER} GROUP BY UPPER(LTRIM(RTRIM(CollegeType))) ORDER BY colleges DESC;

SELECT c.CollegeCode AS code, c.CollegeName AS name, c.District AS district
FROM dbo.M_College c
WHERE ${DISTRICT_FILTER}
  AND EXISTS (SELECT 1 FROM dbo.Student_Data s
              WHERE s.CollegeCode = c.CollegeCode AND s.SessionId = (SELECT MAX(SessionId) FROM dbo.Student_Data))
  AND NOT EXISTS (SELECT 1 FROM dbo.Student_Data s
                  WHERE s.CollegeCode = c.CollegeCode AND s.SessionId < (SELECT MAX(SessionId) FROM dbo.Student_Data))
ORDER BY c.CollegeCode;`,
    build: ([districts, types, newColleges]) => ({
      title: 'Affiliated Colleges',
      sections: [
        {
          title: 'By district',
          columns: ['District', 'Colleges'],
          rows: districts.map((r) => [r.district ? toTitle(r.district) : NOT_SPECIFIED, r.colleges]),
        },
        {
          title: 'By type',
          columns: ['Type', 'Colleges'],
          rows: types.map((r) => [r.type ? toTitle(r.type) : NOT_SPECIFIED, r.colleges]),
        },
        {
          title: 'New this session (first student registrations)',
          columns: ['Code', 'College', 'District'],
          rows: newColleges.map((r) => [label(r.code), label(r.name), r.district ? toTitle(r.district.trim()) : NOT_SPECIFIED]),
        },
      ],
    }),
  },

  facultyAndStaff: {
    query: `
SELECT
  SUM(CASE WHEN IsApproved = 1 THEN 1 ELSE 0 END) AS approved,
  SUM(CASE WHEN ISNULL(IsApproved, 0) = 0 AND ISNULL(IsDeclined, 0) = 0 THEN 1 ELSE 0 END) AS pending,
  SUM(CASE WHEN IsDeclined = 1 THEN 1 ELSE 0 END) AS declined
FROM dbo.PU_Evaluators_Final WHERE ISNULL(delflg, 0) = 0 AND ${inScope('collegecode')};

SELECT YEAR(CreatedDate) AS [year], COUNT(*) AS evaluators
FROM dbo.PU_Evaluators_Final WHERE ISNULL(delflg, 0) = 0 AND ${inScope('collegecode')}
GROUP BY YEAR(CreatedDate) ORDER BY [year];

SELECT TOP 10 LTRIM(RTRIM(Faculty)) AS faculty, COUNT(*) AS evaluators
FROM dbo.PU_Evaluators_Final WHERE ISNULL(delflg, 0) = 0 AND ${inScope('collegecode')}
GROUP BY LTRIM(RTRIM(Faculty)) ORDER BY evaluators DESC;`,
    build: ([[status], years, faculties]) => ({
      title: 'Faculty & Staff (registered evaluators)',
      sections: [
        {
          title: 'Approval status',
          columns: ['Status', 'Evaluators'],
          rows: [
            ['Approved', status.approved],
            ['Pending', status.pending],
            ['Declined', status.declined],
          ],
        },
        {
          title: 'By registration year',
          columns: ['Year', 'Evaluators'],
          rows: years.map((r) => [label(r.year), r.evaluators]),
        },
        {
          title: 'By faculty',
          columns: ['Faculty', 'Evaluators'],
          rows: faculties.map((r) => [label(r.faculty), r.evaluators]),
        },
      ],
    }),
  },

  pendingApprovals: {
    query: `
SELECT LTRIM(RTRIM(Faculty)) AS faculty, COUNT(*) AS pending
FROM dbo.PU_Evaluators_Final
WHERE ISNULL(delflg, 0) = 0 AND ${inScope('collegecode')} AND ISNULL(IsApproved, 0) = 0 AND ISNULL(IsDeclined, 0) = 0
GROUP BY LTRIM(RTRIM(Faculty)) ORDER BY pending DESC;

SELECT CONVERT(varchar(7), CreatedDate, 120) AS [month], COUNT(*) AS pending
FROM dbo.PU_Evaluators_Final
WHERE ISNULL(delflg, 0) = 0 AND ${inScope('collegecode')} AND ISNULL(IsApproved, 0) = 0 AND ISNULL(IsDeclined, 0) = 0
GROUP BY CONVERT(varchar(7), CreatedDate, 120) ORDER BY [month];`,
    build: ([faculties, months]) => ({
      title: 'Pending Approvals (evaluator registrations)',
      sections: [
        {
          title: 'By faculty',
          columns: ['Faculty', 'Pending'],
          rows: faculties.map((r) => [label(r.faculty), r.pending]),
        },
        {
          title: 'By registration month',
          columns: ['Month', 'Pending'],
          rows: months.map((r) => [label(r.month), r.pending]),
        },
      ],
    }),
  },

  activeGrievances: {
    query: `
SELECT UPPER(status) AS status, COUNT(*) AS grievances FROM dbo.Grievance
WHERE ${inScope('CollegeCode')} GROUP BY UPPER(status) ORDER BY grievances DESC;

SELECT TOP 12 CONVERT(varchar(7), DateCreated, 120) AS [month], COUNT(*) AS received
FROM dbo.Grievance WHERE ${inScope('CollegeCode')}
GROUP BY CONVERT(varchar(7), DateCreated, 120) ORDER BY [month] DESC;

SELECT TOP 10 g.CollegeCode AS code, c.CollegeName AS college, COUNT(*) AS grievances
FROM dbo.Grievance g LEFT JOIN dbo.M_College c ON c.CollegeCode = g.CollegeCode
WHERE ${inScope('g.CollegeCode')} AND UPPER(g.status) NOT IN ('COMPLETED', 'RESOLVED', 'CLOSED')
GROUP BY g.CollegeCode, c.CollegeName ORDER BY grievances DESC;`,
    build: ([statuses, months, colleges]) => ({
      title: 'Active Grievances',
      sections: [
        {
          title: 'By status',
          columns: ['Status', 'Grievances'],
          rows: statuses.map((r) => [r.status ? toTitle(r.status) : NOT_SPECIFIED, r.grievances]),
        },
        {
          title: 'Received by month (latest 12)',
          columns: ['Month', 'Received'],
          rows: months.map((r) => [label(r.month), r.received]),
        },
        {
          title: 'Colleges with most pending grievances',
          columns: ['Code', 'College', 'Pending'],
          rows: colleges.map((r) => [label(r.code), label(r.college), r.grievances]),
        },
      ],
    }),
  },

  examsInProgress: {
    query: `
SELECT
  COUNT(DISTINCT CAST(a.courseId AS varchar(12)) + '-' + CAST(a.[year] AS varchar(12))) AS exams,
  COUNT(*) AS scripts,
  SUM(CASE WHEN a.Present = 1 THEN 1 ELSE 0 END) AS present
FROM dbo.ExamAttendance a
WHERE a.Sessionid = (SELECT MAX(Sessionid) FROM dbo.ExamAttendance) AND ${ATTENDANCE_IN_SCOPE};

SELECT TOP 10 c.Course AS course, COUNT(*) AS scripts, SUM(CASE WHEN a.Present = 1 THEN 1 ELSE 0 END) AS present
FROM dbo.ExamAttendance a LEFT JOIN dbo.Course c ON c.PK_CourseID = a.courseId
WHERE a.Sessionid = (SELECT MAX(Sessionid) FROM dbo.ExamAttendance) AND ${ATTENDANCE_IN_SCOPE}
GROUP BY c.Course ORDER BY scripts DESC;`,
    build: ([[totals], courses]) => ({
      title: 'Exams in Progress (current session)',
      sections: [
        {
          title: 'Summary',
          columns: ['Measure', 'Count'],
          rows: [
            ['Exams (course and year)', totals.exams],
            ['Answer scripts registered', totals.scripts],
            ['Present', totals.present],
            ['Absent', totals.scripts - totals.present],
          ],
        },
        {
          title: 'By course',
          columns: ['Course', 'Scripts', 'Present', 'Attendance'],
          rows: courses.map((r) => [label(r.course), r.scripts, r.present, percent(r.present, r.scripts)]),
        },
      ],
    }),
  },

  passedStudents: {
    query: `
${RESULTS_CTE}
SELECT * FROM (
  SELECT TOP (${YEARS_SHOWN}) session, COUNT(*) AS results,
    SUM(CASE WHEN result LIKE 'PASS%' THEN 1 ELSE 0 END) AS passedResults,
    COUNT(DISTINCT CASE WHEN result LIKE 'PASS%' THEN rollNo END) AS passedStudents
  FROM results
  WHERE session LIKE '20[0-9][0-9]-[0-9][0-9]'
  GROUP BY session ORDER BY session DESC
) recent ORDER BY session;

WITH results AS (
  SELECT SESSION AS session, COURSE AS course, RESULT AS result FROM dbo.STUDENTRESULT_UG_NEP WHERE ${inScope('COLLEGE_CODE')}
  UNION ALL SELECT SESSION, COURSE, RESULT FROM dbo.STUDENTRESULT_PG_NEP WHERE ${inScope('COLLEGE_CODE')}
  UNION ALL SELECT SESSION, COURSE, RESULT FROM dbo.STUDENTRESULT_SEM_Online WHERE ${inScope('COLLEGE_CODE')}
)
SELECT TOP 10 LTRIM(RTRIM(course)) AS course, COUNT(*) AS results,
  SUM(CASE WHEN result LIKE 'PASS%' THEN 1 ELSE 0 END) AS passed
FROM results
WHERE session = (SELECT MAX(session) FROM results WHERE session LIKE '20[0-9][0-9]-[0-9][0-9]')
GROUP BY LTRIM(RTRIM(course)) ORDER BY results DESC;`,
    build: ([sessions, courses]) => {
      const latest = sessions[sessions.length - 1]?.session ?? '';
      return {
        title: 'Students Passed',
        sections: [
          {
            title: 'By session',
            columns: ['Session', 'Results', 'Students passed', 'Pass %'],
            rows: sessions.map((r) => [r.session, r.results, r.passedStudents, percent(r.passedResults, r.results)]),
          },
          {
            title: `Top courses (${latest})`,
            columns: ['Course', 'Results', 'Passed', 'Pass %'],
            rows: courses.map((r) => [label(r.course), r.results, r.passed, percent(r.passed, r.results)]),
          },
        ],
      };
    },
  },
};

/** One cached loader per stat card. */
const loaders = Object.fromEntries(
  Object.entries(DETAILS).map(([key, detail]) => [
    key,
    cached(async () => {
      const pool = await getPool();
      const { recordsets } = await pool.request().query(detail.query);
      return { key, generatedAt: new Date().toISOString(), ...detail.build(recordsets) };
    }, config.dashboardCacheMs, `detail-${key}`),
  ])
);

/** Detail for one stat card; null when the key has no database detail. */
const getDetail = async (key) => (Object.prototype.hasOwnProperty.call(loaders, key) ? loaders[key]() : null);

module.exports = { getDetail, DETAIL_KEYS: Object.keys(DETAILS) };
