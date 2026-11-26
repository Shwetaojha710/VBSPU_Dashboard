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

const sessionOf = (source) => {
  const key = String(source || '').toLowerCase();
  if (key === 'ug1' || key === 'pg1') return 'I';
  if (key === 'ug3') return 'III';
  if (key === 'ug5' || key === 'pg5') return 'V';
  return null;
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

const branchSelectSql = ({ level, source, table, dayExpr, courseTypeCol, timeExpr }, dated) => `
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
  ${dated ? 'AND CONVERT(varchar(10), ExamDate, 23) = @examDate' : ''}
`;

const unionSql = (dated) => BRANCHES.map((branch) => branchSelectSql(branch, dated)).join('\nUNION ALL\n');

const scheduleCache = new Map();
const studentCountCache = new Map();
const SCHEDULE_TTL_MS = 90 * 1000;
const COUNT_TTL_MS = 10 * 60 * 1000;

const readCount = (code) => {
  const hit = studentCountCache.get(code);
  if (!hit) return undefined;
  if (Date.now() - hit.at > COUNT_TTL_MS) {
    studentCountCache.delete(code);
    return undefined;
  }
  return hit.n;
};

const rememberCount = (code, n) => {
  studentCountCache.set(code, { n, at: Date.now() });
};

const runPool = async (items, size, worker) => {
  if (!items.length) return;
  let cursor = 0;
  const run = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, run));
};

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
  const dayRaw = String(date || '').trim().toLowerCase();
  const allDates = !dayRaw || dayRaw === 'all';
  const day = allDates ? null : dayRaw;
  if (!allDates && !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
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

  const cacheKey = `${allDates ? 'all' : day}|${levelKey}`;
  const cached = scheduleCache.get(cacheKey);
  if (cached && Date.now() - cached.at < SCHEDULE_TTL_MS) return cached.value;

  const pool = await getPool();
  const req = pool.request();

  let dateFilter = '';
  if (!allDates) {
    req.input('examDate', sql.VarChar(10), day);
    dateFilter = 'AND u.examDate = @examDate';
  }

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
      ${unionSql(!allDates)}
    ) u
    LEFT JOIN dbo.MeetingMaster m ON m.MeetingId = u.meetingId
    WHERE 1 = 1
      ${dateFilter}
      ${levelFilter}
    ORDER BY
      u.examDate ASC,
      u.course ASC,
      CASE u.levelType WHEN 'UG' THEN 0 ELSE 1 END,
      ISNULL(u.meetingId, 99),
      u.paperId
  `);

  const paperCodes = [
    ...new Set(
      (result.recordset || [])
        .map((r) => clean(r.paperId))
        .filter(Boolean)
    ),
  ];
  const studentCounts = new Map();
  const missingCodes = [];
  for (const code of paperCodes) {
    const key = String(code).toUpperCase();
    const cachedCount = readCount(key);
    if (cachedCount === undefined) missingCodes.push(code);
    else studentCounts.set(key, cachedCount);
  }

  const chunkSize = 100;
  const chunks = [];
  for (let i = 0; i < missingCodes.length; i += chunkSize) chunks.push(missingCodes.slice(i, i + chunkSize));

  await runPool(chunks, 4, async (chunk) => {
    const paperReq = pool.request();
    const placeholders = chunk
      .map((code, idx) => {
        paperReq.input(`p${idx}`, sql.VarChar(50), code);
        return `@p${idx}`;
      })
      .join(',');
    const papers = await paperReq.query(`
      SELECT PK_PaperID AS paperId, LTRIM(RTRIM(PaperCode)) AS paperCode
      FROM dbo.PaperMaster WITH (NOLOCK)
      WHERE PaperCode IN (${placeholders})
    `);
    const paperRows = papers.recordset || [];
    const seen = new Set(paperRows.map((row) => String(row.paperCode).trim().toUpperCase()));
    for (const code of chunk) {
      const key = String(code).toUpperCase();
      if (!seen.has(key)) {
        studentCounts.set(key, 0);
        rememberCount(key, 0);
      }
    }
    if (!paperRows.length) return;

    const idToCode = new Map();
    const countReq = pool.request();
    const idPlaceholders = paperRows
      .map((row, idx) => {
        countReq.input(`id${idx}`, sql.BigInt, row.paperId);
        idToCode.set(String(row.paperId), String(row.paperCode).trim().toUpperCase());
        return `@id${idx}`;
      })
      .join(',');
    const counted = await countReq.query(`
      SELECT EP.FK_PaperID AS paperId, COUNT(DISTINCT S.StudentId) AS totalStudents
      FROM dbo.EVEN_SEM_PAPERS EP WITH (NOLOCK)
      INNER JOIN dbo.Student_Data S WITH (NOLOCK)
        ON S.RegistrationNo = EP.ExamFormNo
       AND S.SessionId = 4
       AND S.Semester IN (1, 3, 5, 7)
      WHERE EP.FK_PaperID IN (${idPlaceholders})
      GROUP BY EP.FK_PaperID
    `);
    const totals = new Map();
    for (const row of counted.recordset || []) {
      const code = idToCode.get(String(row.paperId));
      if (!code) continue;
      totals.set(code, (totals.get(code) || 0) + (Number(row.totalStudents) || 0));
    }
    for (const code of seen) {
      const total = totals.get(code) || 0;
      studentCounts.set(code, total);
      rememberCount(code, total);
    }
  });

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
      session: sessionOf(r.sourceTable),
      totalStudents: studentCounts.get(String(clean(r.paperId) || '').toUpperCase()) || 0,
      courseTypeId: r.courseTypeId ?? null,
    };
  });

  const value = {
    date: allDates ? 'all' : day,
    level: levelKey,
    totalRecord: rows.length,
    ugCount: rows.filter((r) => r.level === 'UG').length,
    pgCount: rows.filter((r) => r.level === 'PG').length,
    totalStudents: rows.reduce((sum, r) => sum + (r.totalStudents || 0), 0),
    rows,
  };
  scheduleCache.set(cacheKey, { at: Date.now(), value });
  return value;
};

module.exports = { getDates, getSchedule };
