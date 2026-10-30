const { getPool } = require('../config/db');
const config = require('../config');
const cached = require('../utils/cached');
const { inScopeExact } = require('./scope');
const { academicYear } = require('./dashboard.service');

/*
 * UG and PG students per session (Course.FK_CourseType: 1 = Under Graduate, 2 = Post Graduate)
 * for the enrollment chart. Kept apart from the summary: distinct counts per course type are
 * slow on Student_Data, and the summary should not wait for them. Read-only SELECT.
 */
const QUERY = `
SELECT s.SessionId AS sessionId, m.Session AS session, c.FK_CourseType AS courseType,
  COUNT(DISTINCT s.RegistrationNo) AS students
FROM dbo.Student_Data s
LEFT JOIN dbo.Course c ON c.PK_CourseID = s.CourseId
LEFT JOIN dbo.M_Session m ON m.SessionId = s.SessionId
WHERE ${inScopeExact('s.CollegeCode')}
GROUP BY s.SessionId, m.Session, c.FK_CourseType;
`;

const load = async () => {
  const pool = await getPool();
  const { recordset } = await pool.request().query(QUERY);
  const sessions = new Map();
  for (const r of recordset) {
    const entry = sessions.get(r.sessionId) || { sessionId: r.sessionId, session: academicYear(r.session), ug: 0, pg: 0 };
    if (r.courseType === 1) entry.ug = r.students;
    if (r.courseType === 2) entry.pg = r.students;
    sessions.set(r.sessionId, entry);
  }
  return [...sessions.values()]
    .sort((a, b) => a.sessionId - b.sessionId)
    .map(({ session, ug, pg }) => ({ session, ug, pg }));
};

const getEnrollmentByType = cached(load, config.dashboardCacheMs, 'enrollment-by-type');

module.exports = { getEnrollmentByType };
