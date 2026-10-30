const { getPool } = require('../config/db');
const config = require('../config');
const cached = require('../utils/cached');
const { DISTRICT_FILTER, inScopeExact } = require('./scope');
const { academicYear, toTitle } = require('./dashboard.service');

/*
 * Exam status of every affiliated college (covered districts) in the current session.
 * Appeared comes from the result tables (STUDENTRESULT_*), not from ExamAttendance.
 * A college is "online" (fully settled) when its students are registered, appeared (have a
 * result in the result tables), and have practical and internal marks uploaded; otherwise it is pending with
 * the missing steps as reasons. Read-only SELECT aggregates, no personal columns.
 */
const QUERY = `
WITH stu AS (
  SELECT StudentId, RegistrationNo, CollegeCode FROM dbo.Student_Data
  WHERE SessionId = (SELECT MAX(SessionId) FROM dbo.Student_Data) AND ${inScopeExact('CollegeCode')}
),
registered AS (SELECT CollegeCode, COUNT(DISTINCT RegistrationNo) AS students FROM stu GROUP BY CollegeCode),
-- Marks are matched by StudentId, which is unique to one session's registration, so the
-- StudentId indexes on the marks tables answer this without scanning them by SessionId.
practical AS (
  SELECT stu.CollegeCode, COUNT(*) AS students FROM stu
  WHERE EXISTS (SELECT 1 FROM dbo.ExternalExamData e WHERE e.StudentId = stu.StudentId)
  GROUP BY stu.CollegeCode
),
internal AS (
  SELECT stu.CollegeCode, COUNT(*) AS students FROM stu
  WHERE EXISTS (SELECT 1 FROM dbo.InternalExamData i WHERE i.StudentId = stu.StudentId)
  GROUP BY stu.CollegeCode
)
SELECT c.CollegeCode AS code, c.CollegeName AS name, c.District AS district,
  ISNULL(r.students, 0) AS registered,
  ISNULL(p.students, 0) AS practical, ISNULL(i.students, 0) AS internal
FROM dbo.M_College c
LEFT JOIN registered r ON r.CollegeCode = c.CollegeCode
LEFT JOIN practical p ON p.CollegeCode = c.CollegeCode
LEFT JOIN internal i ON i.CollegeCode = c.CollegeCode
WHERE ${DISTRICT_FILTER}
ORDER BY TRY_CAST(c.CollegeCode AS int);

SELECT Session AS session FROM dbo.M_Session WHERE SessionId = (SELECT MAX(SessionId) FROM dbo.Student_Data);
`;

/*
 * Appeared = students with a result in the current session, from the result tables ("2026" in
 * M_Session is "2025-26" there). Result tables pad college codes ("0601"), so codes are compared
 * as numbers. Run as its own query, in parallel with QUERY, to keep the total time down.
 */
const APPEARED_QUERY = `
SELECT TRY_CAST(r.COLLEGE_CODE AS int) AS code, COUNT(DISTINCT r.ROLL_NO) AS students
FROM (
  SELECT COLLEGE_CODE, ROLL_NO, SESSION FROM dbo.STUDENTRESULT_UG_NEP
  UNION ALL SELECT COLLEGE_CODE, ROLL_NO, SESSION FROM dbo.STUDENTRESULT_PG_NEP
  UNION ALL SELECT COLLEGE_CODE, ROLL_NO, SESSION FROM dbo.STUDENTRESULT_SEM_Online
) r
WHERE r.SESSION = (
  SELECT CONCAT(TRY_CAST(Session AS int) - 1, '-', RIGHT(LTRIM(RTRIM(Session)), 2))
  FROM dbo.M_Session WHERE SessionId = (SELECT MAX(SessionId) FROM dbo.Student_Data)
)
GROUP BY TRY_CAST(r.COLLEGE_CODE AS int);
`;

/** Pending reasons, in the order a college goes through them. */
const REASONS = {
  noStudents: 'No student registrations',
  examNotHeld: 'No exam result (not appeared)',
  practicalPending: 'Practical marks not uploaded',
  internalPending: 'Internal marks not uploaded',
};

const reasonsFor = (c) => {
  if (!c.registered) return ['noStudents'];
  return [
    !c.appeared && 'examNotHeld',
    !c.practical && 'practicalPending',
    !c.internal && 'internalPending',
  ].filter(Boolean);
};

const load = async () => {
  const pool = await getPool();
  const [{ recordsets }, appearedResult] = await Promise.all([
    pool.request().query(QUERY),
    pool.request().query(APPEARED_QUERY),
  ]);
  const [rows, [session]] = recordsets;
  const appearedByCode = new Map(appearedResult.recordset.map((a) => [a.code, a.students]));

  const colleges = rows.map((row) => {
    const r = { ...row, appeared: appearedByCode.get(Number.parseInt(row.code, 10)) ?? 0 };
    const reasons = reasonsFor(r);
    return {
      code: String(r.code).trim(),
      name: String(r.name || '').trim(),
      district: r.district ? toTitle(r.district.trim()) : '',
      registered: r.registered,
      appeared: r.appeared,
      practical: r.practical,
      internal: r.internal,
      status: reasons.length ? 'pending' : 'online',
      reasons,
    };
  });

  const count = (key) => colleges.filter((c) => c.reasons.includes(key)).length;
  return {
    generatedAt: new Date().toISOString(),
    session: session ? academicYear(session.session) : null,
    totals: {
      colleges: colleges.length,
      online: colleges.filter((c) => c.status === 'online').length,
      pending: colleges.filter((c) => c.status === 'pending').length,
      registered: colleges.reduce((sum, c) => sum + c.registered, 0),
      appeared: colleges.reduce((sum, c) => sum + c.appeared, 0),
      collegesAppeared: colleges.filter((c) => c.appeared > 0).length,
    },
    /** Pending colleges per reason; a college can be missing more than one step. */
    reasons: Object.entries(REASONS).map(([key, label]) => ({ key, label, colleges: count(key) })),
    colleges,
  };
};

const getExamStatus = cached(load, config.dashboardCacheMs, 'exam-status');

module.exports = { getExamStatus, REASONS };
