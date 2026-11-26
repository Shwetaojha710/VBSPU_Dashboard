const { getPool, sql } = require('../config/db');

/**
 * Copy Scan / Evaluation Tracking — read-only pipeline counts.
 * Sources (unchanged existing tables):
 *   LOT           → barcode coded, allotted, received after evaluation
 *   tbl_CopyFlap  → flap code correction / scanned import
 *   AWARD_SHEET   → OMR (OMRmarks) and Award OCR (OCRMarks), joined via Lot → LOT
 *
 * Does not write, alter, or depend on other dashboard services.
 */

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const yearList = () => {
  const current = new Date().getFullYear();
  const end = Math.max(current, 2024);
  const years = [];
  for (let y = end; y >= 2024; y -= 1) years.push(String(y));
  return years;
};

const resolveYear = (raw) => {
  const years = yearList();
  const y = String(raw || '').trim();
  if (years.includes(y)) return Number(y);
  return Number(years[0]);
};

const resolveLevel = (raw) => {
  const key = String(raw || 'all').trim().toLowerCase();
  return ['all', 'ug', 'pg'].includes(key) ? key : 'all';
};

const courseTypeFilter = (alias, level) => {
  if (level === 'ug') return `AND ${alias}.FK_Coursetype = 1`;
  if (level === 'pg') return `AND ${alias}.FK_Coursetype = 2`;
  return '';
};

const getFilters = async () => {
  const current = String(new Date().getFullYear());
  const years = yearList();
  // Prefer current year when it exists in LOT; else latest year with LOT rows.
  const pool = await getPool();
  const latest = await pool.request().query(`
    SELECT MAX(YEAR([DATE])) AS maxYear
    FROM dbo.LOT WITH (NOLOCK)
    WHERE [DATE] IS NOT NULL AND YEAR([DATE]) >= 2024
  `);
  const maxYear = Number(latest.recordset?.[0]?.maxYear) || 2024;
  const defaultYear = years.includes(current) && maxYear >= Number(current) ? current : String(maxYear);
  return {
    years,
    defaultYear: years.includes(defaultYear) ? defaultYear : years[0],
    levels: [
      { value: 'all', label: 'All' },
      { value: 'ug', label: 'UG' },
      { value: 'pg', label: 'PG' },
    ],
  };
};

const loadPipeline = async ({ year, level }) => {
  const y = resolveYear(year);
  const levelKey = resolveLevel(level);
  const yy = String(y).slice(-2);
  const pool = await getPool();

  const lotReq = pool.request();
  lotReq.input('year', sql.Int, y);
  const lotFrom =
    levelKey === 'all'
      ? `FROM dbo.LOT L WITH (NOLOCK)`
      : `FROM dbo.LOT L WITH (NOLOCK)
    INNER JOIN dbo.Course_PU C WITH (NOLOCK) ON L.COURSE = C.Course`;
  const lotSql = `
    SELECT
      ISNULL(SUM(TRY_CAST(L.NO_OF_COPIES AS int)), 0) AS totalCopies,
      ISNULL(SUM(CASE
        WHEN NULLIF(LTRIM(RTRIM(L.LOT_BARCODE)), '') IS NOT NULL
        THEN TRY_CAST(L.NO_OF_COPIES AS int) ELSE 0 END), 0) AS barcodeCoded,
      ISNULL(SUM(CASE
        WHEN NULLIF(LTRIM(RTRIM(L.EVL_CODE)), '') IS NOT NULL
         AND NULLIF(LTRIM(RTRIM(L.DATE_ALLOT)), '') IS NOT NULL
        THEN TRY_CAST(L.NO_OF_COPIES AS int) ELSE 0 END), 0) AS allotted,
      ISNULL(SUM(CASE
        WHEN NULLIF(LTRIM(RTRIM(L.DATE_RECE)), '') IS NOT NULL
        THEN TRY_CAST(L.NO_OF_COPIES AS int) ELSE 0 END), 0) AS receivedAfterEval,
      COUNT(*) AS lotCount
    ${lotFrom}
    WHERE YEAR(L.[DATE]) = @year
      ${courseTypeFilter('C', levelKey)}
  `;

  const flapReq = pool.request();
  flapReq.input('yy', sql.VarChar(2), yy);
  // Flap has no course join; year via barcode prefix (24… for 2024). Level filter skipped here.
  const flapSql = `
    SELECT
      COUNT(*) AS scannedImported,
      SUM(CASE
        WHEN NULLIF(LTRIM(RTRIM([ANSWER KEY NO])), '') IS NOT NULL THEN 1 ELSE 0
      END) AS codeCorrection
    FROM dbo.tbl_CopyFlap WITH (NOLOCK)
    WHERE LEFT(LTRIM(RTRIM(BARCODE)), 2) = @yy
  `;

  const awardReq = pool.request();
  awardReq.input('year', sql.Int, y);
  const yearLotsBody =
    levelKey === 'all'
      ? `
      SELECT LOT_NO AS lotNo
      FROM dbo.LOT WITH (NOLOCK)
      WHERE YEAR([DATE]) = @year
        AND NULLIF(LTRIM(RTRIM(DATE_RECE)), '') IS NOT NULL
    `
      : `
      SELECT L.LOT_NO AS lotNo
      FROM dbo.LOT L WITH (NOLOCK)
      INNER JOIN dbo.Course_PU C WITH (NOLOCK) ON L.COURSE = C.Course
      WHERE YEAR(L.[DATE]) = @year
        AND NULLIF(LTRIM(RTRIM(L.DATE_RECE)), '') IS NOT NULL
        ${courseTypeFilter('C', levelKey)}
    `;
  const awardSql = `
    ;WITH YearLots AS (${yearLotsBody})
    SELECT
      COUNT(DISTINCT A.CopyCode) AS awardRows,
      COUNT(DISTINCT CASE
        WHEN NULLIF(LTRIM(RTRIM(CAST(A.OMRmarks AS nvarchar(40)))), '') IS NOT NULL
        THEN A.CopyCode END) AS omrImported,
      COUNT(DISTINCT CASE
        WHEN NULLIF(LTRIM(RTRIM(CAST(A.OCRMarks AS nvarchar(40)))), '') IS NOT NULL
        THEN A.CopyCode END) AS awardImported
    FROM dbo.AWARD_SHEET A WITH (NOLOCK)
    INNER JOIN YearLots Y ON Y.lotNo = A.Lot
  `;

  const [lotResult, flapResult, awardSettled] = await Promise.all([
    lotReq.query(lotSql),
    flapReq.query(flapSql),
    awardReq.query(awardSql).then(
      (result) => ({ ok: true, result }),
      (err) => {
        console.error('Copy scan award/OMR count failed:', err.message);
        return { ok: false, result: { recordset: [{ awardRows: 0, omrImported: 0, awardImported: 0 }] } };
      }
    ),
  ]);
  const awardResult = awardSettled.result;

  // Flap has no UG/PG column — only expose numbers when Level = All to avoid misleading filters.
  const f = flapResult.recordset?.[0] || {};
  const flapAvailable = levelKey === 'all';
  const flap = {
    codeCorrection: flapAvailable ? num(f.codeCorrection) : 0,
    scannedImported: flapAvailable ? num(f.scannedImported) : 0,
    available: flapAvailable,
    note: flapAvailable
      ? null
      : 'Flap counts are year-wide only (not split by UG/PG in source data). Select Level = All to view.',
  };

  const lot = lotResult.recordset?.[0] || {};
  const award = awardResult.recordset?.[0] || {};
  const received = num(lot.receivedAfterEval);

  return {
    year: String(y),
    level: levelKey,
    stages: {
      barcodeCoded: num(lot.barcodeCoded),
      allotted: num(lot.allotted),
      receivedAfterEval: received,
      flap,
      omr: {
        receivedAfterEval: received,
        scannedImported: num(award.omrImported),
      },
      award: {
        receivedAfterEval: received,
        scannedImported: num(award.awardImported),
      },
    },
    meta: {
      lotCount: num(lot.lotCount),
      awardDistinctCopies: num(award.awardRows),
      source: {
        barcodeAllottedReceived: 'dbo.LOT',
        flap: 'dbo.tbl_CopyFlap',
        omrAward: 'dbo.AWARD_SHEET + dbo.LOT',
      },
    },
  };
};

const statusCache = new Map();
const STATUS_TTL_MS = 120000;

const getStatus = async (filters = {}) => {
  const year = resolveYear(filters.year);
  const level = resolveLevel(filters.level);
  const key = `${year}:${level}`;
  const hit = statusCache.get(key);
  if (hit && Date.now() - hit.at < STATUS_TTL_MS) return hit.value;
  const value = await loadPipeline({ year, level });
  statusCache.set(key, { at: Date.now(), value });
  return value;
};

const STAGE_KEYS = new Set(['barcode', 'allotted', 'received', 'flap', 'omr', 'award']);

const resolveStage = (raw) => {
  const key = String(raw || '').trim().toLowerCase();
  return STAGE_KEYS.has(key) ? key : null;
};

const resolvePage = (raw, fallback = 1) => {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
};

const resolvePageSize = (raw) => {
  const n = Number(raw);
  if ([25, 50, 100].includes(n)) return n;
  return 25;
};

const display = (value) => {
  if (value == null) return null;
  const s = String(value).trim();
  return s && s.toUpperCase() !== 'NULL' ? s : null;
};

const lotStageWhere = (stage) => {
  if (stage === 'barcode') {
    return `AND NULLIF(LTRIM(RTRIM(L.LOT_BARCODE)), '') IS NOT NULL`;
  }
  if (stage === 'allotted') {
    return `AND NULLIF(LTRIM(RTRIM(L.EVL_CODE)), '') IS NOT NULL
      AND NULLIF(LTRIM(RTRIM(L.DATE_ALLOT)), '') IS NOT NULL`;
  }
  if (stage === 'received') {
    return `AND NULLIF(LTRIM(RTRIM(L.DATE_RECE)), '') IS NOT NULL`;
  }
  return '';
};

const mapLotRow = (r, index, offset) => ({
  sNo: offset + index + 1,
  lotNo: display(r.lotNo),
  lotBarcode: display(r.lotBarcode),
  course: display(r.course),
  subject: display(r.subject),
  paperCode: display(r.paperCode),
  paperName: display(r.paperName),
  centerCode: display(r.centerCode),
  copies: num(r.copies),
  evaluatorCode: display(r.evaluatorCode),
  evaluatorName: display(r.evaluatorName),
  dateAllot: display(r.dateAllot),
  dateRece: display(r.dateRece),
  scanned: r.scanned != null ? num(r.scanned) : null,
});

const getLotStageDetails = async ({ year, level, stage, page, pageSize, search }) => {
  const pool = await getPool();
  const offset = (page - 1) * pageSize;
  const lotFrom =
    level === 'all'
      ? `FROM dbo.LOT L WITH (NOLOCK)`
      : `FROM dbo.LOT L WITH (NOLOCK)
    INNER JOIN dbo.Course_PU C WITH (NOLOCK) ON L.COURSE = C.Course`;
  const searchSql = search
    ? `AND (
        L.LOT_NO LIKE @search OR L.LOT_BARCODE LIKE @search OR L.COURSE LIKE @search
        OR L.SUBJECT LIKE @search OR L.PAPER_CODE LIKE @search OR L.EVL_CODE LIKE @search
        OR L.EVL_NAME LIKE @search OR L.CENTER_CODE LIKE @search
      )`
    : '';
  const where = `
    WHERE YEAR(L.[DATE]) = @year
      ${lotStageWhere(stage)}
      ${courseTypeFilter('C', level)}
      ${searchSql}
  `;

  const countReq = pool.request().input('year', sql.Int, year);
  const listReq = pool
    .request()
    .input('year', sql.Int, year)
    .input('offset', sql.Int, offset)
    .input('pageSize', sql.Int, pageSize);
  if (search) {
    countReq.input('search', sql.NVarChar(80), `%${search}%`);
    listReq.input('search', sql.NVarChar(80), `%${search}%`);
  }

  const [countResult, listResult] = await Promise.all([
    countReq.query(`
      SELECT COUNT(*) AS totalRows,
             ISNULL(SUM(TRY_CAST(L.NO_OF_COPIES AS int)), 0) AS totalCopies
      ${lotFrom}
      ${where}
    `),
    listReq.query(`
      SELECT
        L.LOT_NO AS lotNo,
        L.LOT_BARCODE AS lotBarcode,
        L.COURSE AS course,
        L.SUBJECT AS subject,
        L.PAPER_CODE AS paperCode,
        L.PAPER_NAME AS paperName,
        L.CENTER_CODE AS centerCode,
        TRY_CAST(L.NO_OF_COPIES AS int) AS copies,
        L.EVL_CODE AS evaluatorCode,
        L.EVL_NAME AS evaluatorName,
        L.DATE_ALLOT AS dateAllot,
        L.DATE_RECE AS dateRece
      ${lotFrom}
      ${where}
      ORDER BY TRY_CAST(L.NO_OF_COPIES AS int) DESC, L.LOT_NO
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `),
  ]);

  const totals = countResult.recordset?.[0] || {};
  return {
    columns: ['lotNo', 'lotBarcode', 'course', 'subject', 'paperCode', 'copies', 'evaluatorCode', 'dateAllot', 'dateRece'],
    totalRows: num(totals.totalRows),
    totalCopies: num(totals.totalCopies),
    rows: (listResult.recordset || []).map((r, i) => mapLotRow(r, i, offset)),
  };
};

const getFlapStageDetails = async ({ year, page, pageSize, search }) => {
  const pool = await getPool();
  const offset = (page - 1) * pageSize;
  const yy = String(year).slice(-2);
  const searchSql = search
    ? `AND (
        BARCODE LIKE @search OR [ROLL NO] LIKE @search OR [PAPER CODE] LIKE @search
        OR [ANSWER KEY NO] LIKE @search OR CAST(STATUS AS nvarchar(40)) LIKE @search
      )`
    : '';

  const countReq = pool.request().input('yy', sql.VarChar(2), yy);
  const listReq = pool
    .request()
    .input('yy', sql.VarChar(2), yy)
    .input('offset', sql.Int, offset)
    .input('pageSize', sql.Int, pageSize);
  if (search) {
    countReq.input('search', sql.NVarChar(80), `%${search}%`);
    listReq.input('search', sql.NVarChar(80), `%${search}%`);
  }

  const [countResult, listResult] = await Promise.all([
    countReq.query(`
      SELECT COUNT(*) AS totalRows,
             SUM(CASE WHEN NULLIF(LTRIM(RTRIM([ANSWER KEY NO])), '') IS NOT NULL THEN 1 ELSE 0 END) AS codeCorrection
      FROM dbo.tbl_CopyFlap WITH (NOLOCK)
      WHERE LEFT(LTRIM(RTRIM(BARCODE)), 2) = @yy
        ${searchSql}
    `),
    listReq.query(`
      SELECT
        BARCODE AS barcode,
        [ROLL NO] AS rollNo,
        [PAPER CODE] AS paperCode,
        [ANSWER KEY NO] AS answerKeyNo,
        STATUS AS status
      FROM dbo.tbl_CopyFlap WITH (NOLOCK)
      WHERE LEFT(LTRIM(RTRIM(BARCODE)), 2) = @yy
        ${searchSql}
      ORDER BY FlapID DESC
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `),
  ]);

  const totals = countResult.recordset?.[0] || {};
  return {
    columns: ['barcode', 'rollNo', 'paperCode', 'answerKeyNo', 'status'],
    totalRows: num(totals.totalRows),
    totalCopies: num(totals.totalRows),
    codeCorrection: num(totals.codeCorrection),
    rows: (listResult.recordset || []).map((r, index) => ({
      sNo: offset + index + 1,
      barcode: display(r.barcode),
      rollNo: display(r.rollNo),
      paperCode: display(r.paperCode),
      answerKeyNo: display(r.answerKeyNo),
      status: display(r.status),
    })),
  };
};

const getScanStageDetails = async ({ year, level, stage, page, pageSize, search }) => {
  const pool = await getPool();
  const offset = (page - 1) * pageSize;
  const markCol = stage === 'omr' ? 'A.OMRmarks' : 'A.OCRMarks';
  const lotJoin =
    level === 'all'
      ? ''
      : `INNER JOIN dbo.Course_PU C WITH (NOLOCK) ON L.COURSE = C.Course`;
  const searchSql = search ? `AND L.COURSE LIKE @search` : '';

  // Course-wise rollup — lot-level AWARD grouping is too heavy for click/drill-down.
  const req = pool.request().input('year', sql.Int, year);
  req.timeout = 60000;
  if (search) req.input('search', sql.NVarChar(80), `%${search}%`);

  const result = await req.query(`
    ;WITH YearLots AS (
      SELECT
        L.LOT_NO AS lotNo,
        L.COURSE AS course,
        TRY_CAST(L.NO_OF_COPIES AS int) AS copies
      FROM dbo.LOT L WITH (NOLOCK)
      ${lotJoin}
      WHERE YEAR(L.[DATE]) = @year
        AND NULLIF(LTRIM(RTRIM(L.DATE_RECE)), '') IS NOT NULL
        ${courseTypeFilter('C', level)}
        ${searchSql}
    ),
    LotCopies AS (
      SELECT course, COUNT(*) AS lots, ISNULL(SUM(copies), 0) AS copies
      FROM YearLots
      GROUP BY course
    ),
    CourseScan AS (
      SELECT Y.course, COUNT(DISTINCT A.CopyCode) AS scanned
      FROM YearLots Y
      INNER JOIN dbo.AWARD_SHEET A WITH (NOLOCK) ON A.Lot = Y.lotNo
      WHERE NULLIF(LTRIM(RTRIM(CAST(${markCol} AS nvarchar(40)))), '') IS NOT NULL
      GROUP BY Y.course
    )
    SELECT
      L.course,
      L.lots,
      L.copies,
      ISNULL(S.scanned, 0) AS scanned
    FROM LotCopies L
    INNER JOIN CourseScan S ON S.course = L.course
    ORDER BY S.scanned DESC, L.course
  `);

  const allRows = (result.recordset || []).map((r, index) => ({
    sNo: index + 1,
    course: display(r.course),
    lots: num(r.lots),
    copies: num(r.copies),
    scanned: num(r.scanned),
  }));
  const totalCopies = allRows.reduce((n, r) => n + r.copies, 0);
  const totalScanned = allRows.reduce((n, r) => n + r.scanned, 0);
  const pageRows = allRows.slice(offset, offset + pageSize).map((r, index) => ({
    ...r,
    sNo: offset + index + 1,
  }));

  return {
    columns: ['course', 'lots', 'copies', 'scanned'],
    totalRows: allRows.length,
    totalCopies,
    totalScanned,
    rows: pageRows,
  };
};

const detailCache = new Map();
const DETAIL_TTL_MS = 180000;

const getStageDetails = async (filters = {}) => {
  const stage = resolveStage(filters.stage);
  if (!stage) {
    const err = new Error('Invalid stage');
    err.status = 400;
    throw err;
  }

  const year = resolveYear(filters.year);
  const level = resolveLevel(filters.level);
  const page = resolvePage(filters.page);
  const pageSize = resolvePageSize(filters.pageSize);
  const search = String(filters.search || '').trim().slice(0, 60);
  const cacheKey = `${year}:${level}:${stage}:${page}:${pageSize}:${search.toLowerCase()}`;
  const hit = detailCache.get(cacheKey);
  if (hit && Date.now() - hit.at < DETAIL_TTL_MS) return hit.value;

  if (stage === 'flap' && level !== 'all') {
    return {
      year: String(year),
      level,
      stage,
      page,
      pageSize,
      search,
      available: false,
      message: 'Flap details are year-wide only. Select Level = All.',
      columns: [],
      totalRows: 0,
      totalCopies: 0,
      rows: [],
    };
  }

  let detail;
  if (stage === 'flap') {
    detail = await getFlapStageDetails({ year, page, pageSize, search });
  } else if (stage === 'omr' || stage === 'award') {
    detail = await getScanStageDetails({ year, level, stage, page, pageSize, search });
  } else {
    detail = await getLotStageDetails({ year, level, stage, page, pageSize, search });
  }

  const value = {
    year: String(year),
    level,
    stage,
    page,
    pageSize,
    search,
    available: true,
    ...detail,
  };
  detailCache.set(cacheKey, { at: Date.now(), value });
  return value;
};

module.exports = { getFilters, getStatus, getStageDetails };
