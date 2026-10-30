const { getPool, getPool2 } = require('../config/db');
const config = require('../config');
const cached = require('../utils/cached');
const { DISTRICT_FILTER } = require('./scope');

/*
 * Course-wise exam status per college, from the second database (PU_2026), for the current
 * session. For every college + course + semester it compares the students on the nominal roll
 * (STU_NOMINAL) with those who have theory, practical and internal marks (STUDENT_MARKS) and a
 * declared result (STUDENTRESULT*). Students are matched by roll number and exam ID, because
 * course names are written differently in the result tables. Read-only SELECT aggregates.
 */
const SESSION = '2025-26';

/** A stage counts as done when at least this share of the course's students have it. */
const DONE_SHARE = 0.9;

const QUERY = `
WITH nom AS (
  SELECT DISTINCT CollegeCode, Course, Semester, EXAMID, RollNo
  FROM dbo.STU_NOMINAL WHERE SESSION = @session
),
flags AS (
  SELECT ROLL_NO, EXAMID,
    MAX(CASE WHEN MTYP = 'TH' THEN 1 ELSE 0 END) AS th,
    MAX(CASE WHEN MTYP = 'PR' THEN 1 ELSE 0 END) AS pr,
    MAX(CASE WHEN MTYP IN ('TS', 'PS') THEN 1 ELSE 0 END) AS inl
  FROM dbo.STUDENT_MARKS
  WHERE EXAMID IN (SELECT DISTINCT EXAMID FROM dbo.STU_NOMINAL WHERE SESSION = @session)
  GROUP BY ROLL_NO, EXAMID
),
res AS (
  SELECT ROLL_NO, EXAMID FROM dbo.STUDENTRESULT WHERE SESSION = @session
  UNION SELECT ROLL_NO, EXAMID FROM dbo.STUDENTRESULT_PG_NEP WHERE SESSION = @session
  UNION SELECT ROLL_NO, EXAMID FROM dbo.STUDENTRESULT_SEM WHERE SESSION = @session
)
SELECT TRY_CAST(n.CollegeCode AS int) AS code, LTRIM(RTRIM(n.Course)) AS course, n.Semester AS semester,
  n.EXAMID AS examId, COUNT(*) AS students,
  SUM(ISNULL(f.th, 0)) AS theory, SUM(ISNULL(f.pr, 0)) AS practical, SUM(ISNULL(f.inl, 0)) AS internal,
  SUM(CASE WHEN r.ROLL_NO IS NULL THEN 0 ELSE 1 END) AS result
FROM nom n
LEFT JOIN flags f ON f.ROLL_NO = n.RollNo AND f.EXAMID = n.EXAMID
LEFT JOIN res r ON r.ROLL_NO = n.RollNo AND r.EXAMID = n.EXAMID
GROUP BY TRY_CAST(n.CollegeCode AS int), LTRIM(RTRIM(n.Course)), n.Semester, n.EXAMID;
`;

const REASONS = {
  theoryPending: 'Theory marks pending',
  practicalPending: 'Practical marks pending',
  internalPending: 'Internal marks pending',
  resultPending: 'Result not declared',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Exam IDs are YYMM ("2512" = Dec 2025). */
const examLabel = (examId) => {
  const id = String(examId || '').trim();
  const month = MONTHS[Number(id.slice(2, 4)) - 1];
  return /^\d{4}$/.test(id) && month ? `${month} 20${id.slice(0, 2)}` : id;
};

const load = async () => {
  // Covered colleges come from the main database, so both views list the same colleges.
  const [scopeResult, groupsResult] = await Promise.all([
    getPool().then((pool) => pool.request().query(`SELECT CollegeCode FROM dbo.M_College WHERE ${DISTRICT_FILTER}`)),
    getPool2().then((pool) => pool.request().input('session', SESSION).query(QUERY)),
  ]);
  const scope = new Set(scopeResult.recordset.map((r) => Number.parseInt(r.CollegeCode, 10)));
  const rows = groupsResult.recordset;

  // A course + semester + exam "has" practical or internal marks if any college uploaded them.
  const key = (r) => `${r.course}|${r.semester}|${r.examId}`;
  const hasPractical = new Set(rows.filter((r) => r.practical > 0).map(key));
  const hasInternal = new Set(rows.filter((r) => r.internal > 0).map(key));
  const done = (count, students) => count >= students * DONE_SHARE;

  const colleges = {};
  for (const r of rows) {
    if (!scope.has(r.code)) continue;
    const reasons = [];
    if (!done(r.result, r.students)) {
      if (!done(r.theory, r.students)) reasons.push('theoryPending');
      if (hasPractical.has(key(r)) && !done(r.practical, r.students)) reasons.push('practicalPending');
      if (hasInternal.has(key(r)) && !done(r.internal, r.students)) reasons.push('internalPending');
      if (!reasons.length) reasons.push('resultPending');
    }
    (colleges[r.code] ||= []).push({
      course: r.course,
      semester: String(r.semester || '').trim(),
      exam: examLabel(r.examId),
      students: r.students,
      theory: r.theory,
      practical: hasPractical.has(key(r)) ? r.practical : null,
      internal: hasInternal.has(key(r)) ? r.internal : null,
      result: r.result,
      status: reasons.length ? 'pending' : 'online',
      reasons,
    });
  }
  for (const courses of Object.values(colleges)) {
    courses.sort((a, b) => a.course.localeCompare(b.course) || Number(a.semester) - Number(b.semester));
  }

  return {
    generatedAt: new Date().toISOString(),
    session: SESSION,
    donePercent: Math.round(DONE_SHARE * 100),
    reasons: REASONS,
    colleges,
  };
};

const getCourseStatus = cached(load, config.dashboardCacheMs, 'course-status');

/** Online/pending course counts per college code. */
const getCourseSummary = async () => {
  const data = await getCourseStatus();
  const colleges = Object.fromEntries(
    Object.entries(data.colleges).map(([code, courses]) => {
      const online = courses.filter((c) => c.status === 'online').length;
      return [code, { total: courses.length, online, pending: courses.length - online }];
    })
  );
  return { generatedAt: data.generatedAt, session: data.session, donePercent: data.donePercent, colleges };
};

/** Course list for one college (code compared as a number, so "029" and "29" match). */
const getCollegeCourses = async (code) => {
  const data = await getCourseStatus();
  const number = Number.parseInt(code, 10);
  return {
    code: String(code),
    session: data.session,
    donePercent: data.donePercent,
    reasons: data.reasons,
    courses: Number.isNaN(number) ? [] : data.colleges[number] || [],
  };
};

module.exports = { getCourseStatus, getCourseSummary, getCollegeCourses };
