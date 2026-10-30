/*
 * The dashboard covers only colleges in these districts (M_College.District). Every figure is
 * limited to them through the college code. Codes differ in format between tables ("0601" in
 * the result tables, "601" in M_College), so they are compared as numbers.
 */
const DISTRICTS = ['GHAZIPUR', 'JAUNPUR'];

/** WHERE condition on M_College rows. */
const DISTRICT_FILTER = `UPPER(LTRIM(RTRIM(District))) IN (${DISTRICTS.map((d) => `'${d}'`).join(', ')})`;

/** WHERE condition: the college code in `column` belongs to a covered district. */
const inScope = (column) =>
  `TRY_CAST(${column} AS int) IN (SELECT TRY_CAST(CollegeCode AS int) FROM dbo.M_College WHERE ${DISTRICT_FILTER})`;

/**
 * Faster variant for tables whose codes are stored exactly as in M_College (Student_Data):
 * a plain comparison that can use indexes on the large tables.
 */
const inScopeExact = (column) => `${column} IN (SELECT CollegeCode FROM dbo.M_College WHERE ${DISTRICT_FILTER})`;

/** WHERE condition for ExamAttendance rows (alias `a`): the student studies at a covered college. */
const ATTENDANCE_IN_SCOPE = `EXISTS (SELECT 1 FROM dbo.Student_Data sd
  WHERE sd.StudentId = a.Studentid AND sd.SessionId = a.Sessionid AND ${inScopeExact('sd.CollegeCode')})`;

module.exports = { DISTRICTS, DISTRICT_FILTER, inScope, inScopeExact, ATTENDANCE_IN_SCOPE };
