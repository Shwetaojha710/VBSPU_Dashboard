const { getPool, sql } = require('../config/db');

/**
 * Exam Schedule — UNION ALL of Ug1 / UG3 / UG5 / PG1 / Pg5.
 * Filters: examDate (YYYY-MM-DD), level (all | ug | pg).
 */

const BRANCHES = [
  {
    level: 'UG',
    source: 'ug1',
    table: 'dbo.Ug1',
    dayExpr: 'CAST(DA_Y AS int)',
    courseTypeCol: 'Fk_courseTypeId',
    timeExpr: 'CAST(NULL AS nvarchar(100))',
  },
  {
    level: 'UG',
    source: 'ug3',
    table: 'dbo.UG3',
    dayExpr: 'CAST(DAY AS int)',
    courseTypeCol: 'Fk_courseTypeId',
    timeExpr: 'CAST(NULL AS nvarchar(100))',
  },
  {
    level: 'UG',
    source: 'ug5',
    table: 'dbo.UG5',
    dayExpr: 'CAST(DAY AS int)',
    courseTypeCol: 'Fk_courseTypeId',
    timeExpr: 'CAST(NULL AS nvarchar(100))',
  },
  {
    level: 'PG',
    source: 'pg1',
    table: 'dbo.PG1',
    dayExpr: 'CAST(SN AS int)',
    courseTypeCol: 'Fk_CourseTypeId',
    timeExpr: 'LTRIM(RTRIM(TIME))',
  },
  {
    level: 'PG',
    source: 'pg5',
    table: 'dbo.Pg5',
    dayExpr: 'CAST(SN AS int)',
    courseTypeCol: 'Fk_CourseTypeId',
    timeExpr: 'LTRIM(RTRIM(TIME))',
  },
];

const clean = (value) => {
  if (value === null || value === undefined) return null;
  const s = String(value)
    .replace(/\r\n|\n|\r/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s || null;
};

const formatDate = (value) => {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const branchSelectSql = ({ level, source, table, dayExpr, courseTypeCol, timeExpr }) => `
  SELECT
    '${level}' AS levelType,
    '${source}' AS sourceTable,
    ${dayExpr} AS dayNo,
    CONVERT(varchar(10), ExamDate, 23) AS examDate,
    LTRIM(RTRIM(COURSE)) AS course,
    LTRIM(RTRIM(SUBJECT)) AS subject,
    LTRIM(RTRIM([PAPER ID])) AS paperId,
    LTRIM(RTRIM([PAPER NAME])) AS paperName,
    MeetingId AS meetingId,
    ${courseTypeCol} AS courseTypeId,
    ${timeExpr} AS timeText
  FROM ${table}
  WHERE ExamDate IS NOT NULL
`;

const unionSql = () => BRANCHES.map(branchSelectSql).join('\nUNION ALL\n');

const dateUnionSql = () =>
  BRANCHES.map(({ table }) => `SELECT CAST(ExamDate AS date) AS examDate FROM ${table} WHERE ExamDate IS NOT NULL`).join(
    '\nUNION\n'
  );

const getDates = async () => {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT DISTINCT CONVERT(varchar(10), examDate, 23) AS examDate
    FROM (
      ${dateUnionSql()}
    ) d
    ORDER BY examDate ASC
  `);
  const dates = result.recordset.map((r) => formatDate(r.examDate)).filter(Boolean);
  return { dates: [...new Set(dates)].sort() };
};

const getSchedule = async ({ date, level = 'all' } = {}) => {
  const day = String(date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    const err = new Error('Invalid date');
    err.status = 400;
    throw err;
  }

  const levelKey = String(level || 'all').toLowerCase();
  if (!['all', 'ug', 'pg'].includes(levelKey)) {
    const err = new Error('Invalid level');
    err.status = 400;
    throw err;
  }

  const pool = await getPool();
  const req = pool.request();
  req.input('examDate', sql.VarChar(10), day);

  let levelFilter = '';
  if (levelKey === 'ug') levelFilter = `AND u.levelType = 'UG'`;
  if (levelKey === 'pg') levelFilter = `AND u.levelType = 'PG'`;

  const result = await req.query(`
    SELECT
      u.levelType,
      u.sourceTable,
      u.dayNo,
      u.examDate,
      u.course,
      u.subject,
      u.paperId,
      u.paperName,
      u.meetingId,
      u.courseTypeId,
      u.timeText,
      m.MeetingName AS meetingName,
      m.Timing AS meetingTiming
    FROM (
      ${unionSql()}
    ) u
    LEFT JOIN dbo.MeetingMaster m ON m.MeetingId = u.meetingId
    WHERE u.examDate = @examDate
      ${levelFilter}
    ORDER BY
      CASE u.levelType WHEN 'UG' THEN 0 ELSE 1 END,
      u.sourceTable,
      ISNULL(u.meetingId, 99),
      u.paperId
  `);

  const rows = (result.recordset || []).map((r, index) => {
    const meetingName = clean(r.meetingName);
    const meetingTiming = clean(r.meetingTiming);
    const timeText = clean(r.timeText);
    const timing = timeText || meetingTiming || null;
    const meeting =
      meetingName && timing
        ? `${meetingName} Meeting ${timing}`
        : meetingName
          ? `${meetingName} Meeting`
          : timing;

    return {
      sNo: index + 1,
      level: r.levelType,
      source: r.sourceTable,
      dayNo: r.dayNo ?? null,
      examDate: formatDate(r.examDate) || day,
      course: clean(r.course),
      subject: clean(r.subject),
      paperId: clean(r.paperId),
      paperName: clean(r.paperName),
      meetingId: r.meetingId ?? null,
      meetingName,
      timing,
      meeting,
      courseTypeId: r.courseTypeId ?? null,
    };
  });

  return {
    date: day,
    level: levelKey,
    totalRecord: rows.length,
    ugCount: rows.filter((r) => r.level === 'UG').length,
    pgCount: rows.filter((r) => r.level === 'PG').length,
    rows,
  };
};

module.exports = { getDates, getSchedule };
