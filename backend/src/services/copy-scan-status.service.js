const { getPool2, sql } = require('../config/db');

/**
 * Copy Scan / Evaluation Tracking — PU_2026 (DB2_*) read-only SELECT only.
 * Never INSERT / UPDATE / DELETE.
 *
 * Tables:
 *   dbo.LOT              → barcode coded lots (course / paper)
 *   dbo.Lot_Allotment    → evaluation allotment + receive (teacher / copies)
 *   dbo.Course           → UG/PG (FK_CourseType)
 *   dbo.tbl_CopyFlap     → flap scanned + AnsNo correction
 *   dbo.OMR_SHEET_New    → OMR sheet imports
 *   dbo.AWARD_SHEET_NEw  → award OCR (M_OCR) / award-OMR (M_OMR)
 *
 * Connection: getPool2 with readOnlyIntent.
 */

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const display = (value) => {
  if (value == null) return null;
  const s = String(value).trim();
  return s && s.toUpperCase() !== 'NULL' ? s : null;
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
  if (level === 'ug') return `AND ${alias}.FK_CourseType = 1`;
  if (level === 'pg') return `AND ${alias}.FK_CourseType = 2`;
  return '';
};

const lotFromSql = (level) =>
  level === 'all'
    ? `FROM dbo.LOT L WITH (NOLOCK)`
    : `FROM dbo.LOT L WITH (NOLOCK)
    INNER JOIN dbo.Course C WITH (NOLOCK)
      ON C.Course = L.COURSE AND ISNULL(C.IsDeleted, 0) = 0`;

const getFilters = async () => {
  const current = String(new Date().getFullYear());
  const years = yearList();
  const pool = await getPool2();
  // Prefer years that actually appear in scan tables; fall back to calendar list.
  let defaultYear = years.includes(current) ? current : years[0];
  try {
    const latest = await pool.request().query(`
      SELECT MAX(y) AS maxYear FROM (
        SELECT YEAR(CreatedDate) AS y FROM dbo.OMR_SHEET_New WITH (NOLOCK) WHERE CreatedDate IS NOT NULL
        UNION ALL
        SELECT YEAR(CreatedDate) FROM dbo.AWARD_SHEET_NEw WITH (NOLOCK) WHERE CreatedDate IS NOT NULL
        UNION ALL
        SELECT YEAR(Createddate) FROM dbo.tbl_CopyFlap WITH (NOLOCK) WHERE Createddate IS NOT NULL
      ) x
    `);
    const maxYear = Number(latest.recordset?.[0]?.maxYear);
    if (maxYear && years.includes(String(maxYear))) defaultYear = String(maxYear);
  } catch (err) {
    console.error('Copy scan filter year probe failed:', err.message);
  }
  return {
    years,
    defaultYear,
    database: 'PU_2026',
    readOnly: true,
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
  const pool = await getPool2();

  // LOT.DATE is unused on PU_2026 (placeholder 1900). Session DB = current lots, no year cut.
  const lotReq = pool.request();
  const lotSql = `
    SELECT
      ISNULL(SUM(TRY_CAST(L.NO_OF_COPIES AS int)), 0) AS totalCopies,
      ISNULL(SUM(CASE
        WHEN NULLIF(LTRIM(RTRIM(L.LOT_BARCODE)), '') IS NOT NULL
        THEN TRY_CAST(L.NO_OF_COPIES AS int) ELSE 0 END), 0) AS barcodeCoded,
      COUNT(*) AS lotCount
    ${lotFromSql(levelKey)}
    WHERE 1 = 1
      ${courseTypeFilter('C', levelKey)}
  `;

  // Evaluation allotment / receive — dbo.Lot_Allotment (+ LOT/Course for UG-PG).
  const allotReq = pool.request();
  const allotFrom =
    levelKey === 'all'
      ? `FROM dbo.Lot_Allotment A WITH (NOLOCK)
    LEFT JOIN dbo.LOT L WITH (NOLOCK) ON L.LOT_NO = A.Lot_No`
      : `FROM dbo.Lot_Allotment A WITH (NOLOCK)
    INNER JOIN dbo.LOT L WITH (NOLOCK) ON L.LOT_NO = A.Lot_No
    INNER JOIN dbo.Course C WITH (NOLOCK)
      ON C.Course = L.COURSE AND ISNULL(C.IsDeleted, 0) = 0`;
  const allotSql = `
    SELECT
      ISNULL(SUM(TRY_CAST(A.NoOfCopies AS int)), 0) AS allotted,
      ISNULL(SUM(CASE
        WHEN A.isReceived = 1 OR A.DateReceived IS NOT NULL
        THEN TRY_CAST(A.NoOfCopies AS int) ELSE 0 END), 0) AS receivedAfterEval,
      COUNT(*) AS allotRows
    ${allotFrom}
    WHERE 1 = 1
      ${courseTypeFilter('C', levelKey)}
  `;

  // Flap: most rows have NULL Createddate — count all for current session year; else year filter.
  const flapReq = pool.request().input('year', sql.Int, y);
  const flapYearSql =
    y >= new Date().getFullYear()
      ? ''
      : `AND Createddate IS NOT NULL AND YEAR(Createddate) = @year`;
  const flapSql = `
    SELECT
      COUNT(*) AS scannedImported,
      SUM(CASE
        WHEN NULLIF(LTRIM(RTRIM(AnsNo)), '') IS NOT NULL THEN 1 ELSE 0
      END) AS codeCorrection
    FROM dbo.tbl_CopyFlap WITH (NOLOCK)
    WHERE 1 = 1
      ${flapYearSql}
  `;

  const omrReq = pool.request().input('year', sql.Int, y);
  const omrSql = `
    SELECT COUNT(*) AS scannedImported
    FROM dbo.OMR_SHEET_New WITH (NOLOCK)
    WHERE CreatedDate IS NOT NULL AND YEAR(CreatedDate) = @year
  `;

  const awardReq = pool.request().input('year', sql.Int, y);
  const awardSql = `
    SELECT
      COUNT(*) AS awardRows,
      SUM(CASE WHEN NULLIF(LTRIM(RTRIM(M_OMR)), '') IS NOT NULL THEN 1 ELSE 0 END) AS omrOnAward,
      SUM(CASE WHEN NULLIF(LTRIM(RTRIM(M_OCR)), '') IS NOT NULL THEN 1 ELSE 0 END) AS awardImported
    FROM dbo.AWARD_SHEET_NEw WITH (NOLOCK)
    WHERE CreatedDate IS NOT NULL AND YEAR(CreatedDate) = @year
  `;

  const [lotResult, allotSettled, flapResult, omrSettled, awardSettled] = await Promise.all([
    lotReq.query(lotSql),
    allotReq.query(allotSql).then(
      (result) => ({ ok: true, result }),
      (err) => {
        console.error('Copy scan allotment count failed:', err.message);
        return { ok: false, result: { recordset: [{ allotted: 0, receivedAfterEval: 0, allotRows: 0 }] } };
      }
    ),
    flapReq.query(flapSql).then(
      (result) => ({ ok: true, result }),
      (err) => {
        console.error('Copy scan flap count failed:', err.message);
        return { ok: false, result: { recordset: [{ scannedImported: 0, codeCorrection: 0 }] } };
      }
    ),
    omrReq.query(omrSql).then(
      (result) => ({ ok: true, result }),
      (err) => {
        console.error('Copy scan OMR count failed:', err.message);
        return { ok: false, result: { recordset: [{ scannedImported: 0 }] } };
      }
    ),
    awardReq.query(awardSql).then(
      (result) => ({ ok: true, result }),
      (err) => {
        console.error('Copy scan award count failed:', err.message);
        return { ok: false, result: { recordset: [{ awardRows: 0, omrOnAward: 0, awardImported: 0 }] } };
      }
    ),
  ]);

  const lot = lotResult.recordset?.[0] || {};
  const allot = allotSettled.result.recordset?.[0] || {};
  const f = flapResult.result.recordset?.[0] || {};
  const omrRow = omrSettled.result.recordset?.[0] || {};
  const award = awardSettled.result.recordset?.[0] || {};

  const barcodeCoded = num(lot.barcodeCoded);
  const allotted = num(allot.allotted);
  const received = num(allot.receivedAfterEval);
  // When receive-after-eval is not yet filled, use coded copies as scan baseline.
  const scanBase = received > 0 ? received : barcodeCoded;

  // Prefer dedicated OMR_SHEET_New; fall back to award-sheet M_OMR if OMR table empty.
  const omrFromSheet = num(omrRow.scannedImported);
  const omrFromAward = num(award.omrOnAward);
  const omrImported = omrFromSheet > 0 ? omrFromSheet : omrFromAward;

  const flapAvailable = levelKey === 'all';
  const flap = {
    codeCorrection: flapAvailable ? num(f.codeCorrection) : 0,
    scannedImported: flapAvailable ? num(f.scannedImported) : 0,
    available: flapAvailable,
    note: flapAvailable
      ? null
      : 'Flap counts are not split by UG/PG in source data. Select Level = All to view.',
  };

  return {
    year: String(y),
    level: levelKey,
    stages: {
      barcodeCoded,
      allotted,
      receivedAfterEval: received,
      flap,
      omr: {
        receivedAfterEval: scanBase,
        scannedImported: omrImported,
      },
      award: {
        receivedAfterEval: scanBase,
        scannedImported: num(award.awardImported),
      },
    },
    meta: {
      lotCount: num(lot.lotCount),
      allotRows: num(allot.allotRows),
      awardDistinctCopies: num(award.awardRows),
      database: 'PU_2026',
      readOnly: true,
      source: {
        barcode: 'dbo.LOT',
        allottedReceived: 'dbo.Lot_Allotment',
        flap: 'dbo.tbl_CopyFlap',
        omr: omrFromSheet > 0 ? 'dbo.OMR_SHEET_New' : 'dbo.AWARD_SHEET_NEw.M_OMR',
        award: 'dbo.AWARD_SHEET_NEw.M_OCR',
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

const formatDateTime = (value) => {
  if (!value) return null;
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    return s;
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const ist = new Date(d.getTime() + 330 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
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
  dateAllot: r.dateAllot ? formatDateTime(r.dateAllot) : display(r.dateAllot),
  dateRece: r.dateRece ? formatDateTime(r.dateRece) : display(r.dateRece),
  scanned: r.scanned != null ? num(r.scanned) : null,
  lots: r.lots != null ? num(r.lots) : null,
});

/** Barcode-coded lots from dbo.LOT (course / paper). */
const getBarcodeStageDetails = async ({ level, page, pageSize, search }) => {
  const pool = await getPool2();
  const offset = (page - 1) * pageSize;
  const searchSql = search
    ? `AND (
        L.LOT_NO LIKE @search OR L.LOT_BARCODE LIKE @search OR L.COURSE LIKE @search
        OR L.SUBJECT LIKE @search OR L.PAPER_CODE LIKE @search OR L.PAPER_NAME LIKE @search
        OR L.CENTER_CODE LIKE @search
      )`
    : '';
  const where = `
    WHERE NULLIF(LTRIM(RTRIM(L.LOT_BARCODE)), '') IS NOT NULL
      ${courseTypeFilter('C', level)}
      ${searchSql}
  `;

  const countReq = pool.request();
  const listReq = pool.request().input('offset', sql.Int, offset).input('pageSize', sql.Int, pageSize);
  if (search) {
    countReq.input('search', sql.NVarChar(80), `%${search}%`);
    listReq.input('search', sql.NVarChar(80), `%${search}%`);
  }

  const [countResult, listResult] = await Promise.all([
    countReq.query(`
      SELECT COUNT(*) AS totalRows,
             ISNULL(SUM(TRY_CAST(L.NO_OF_COPIES AS int)), 0) AS totalCopies
      ${lotFromSql(level)}
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
        TRY_CAST(L.NO_OF_COPIES AS int) AS copies
      ${lotFromSql(level)}
      ${where}
      ORDER BY TRY_CAST(L.NO_OF_COPIES AS int) DESC, L.LOT_NO
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `),
  ]);

  const totals = countResult.recordset?.[0] || {};
  return {
    columns: ['lotNo', 'lotBarcode', 'course', 'subject', 'paperCode', 'paperName', 'copies'],
    totalRows: num(totals.totalRows),
    totalCopies: num(totals.totalCopies),
    rows: (listResult.recordset || []).map((r, i) => mapLotRow(r, i, offset)),
  };
};

/** Allotted / received rows from dbo.Lot_Allotment + LOT (course) + teacher. */
const getAllotmentStageDetails = async ({ level, stage, page, pageSize, search }) => {
  const pool = await getPool2();
  const offset = (page - 1) * pageSize;
  const receivedOnly = stage === 'received';
  // ExaminerName is often null in Lot_Allotment — resolve from Evaluators / PU_Evaluators_Final.
  const teacherApply = `
    OUTER APPLY (
      SELECT TOP 1 EVL_NAME AS teacherName
      FROM dbo.Evaluators WITH (NOLOCK)
      WHERE LTRIM(RTRIM(EVL_CODE)) = LTRIM(RTRIM(A.ExaminerCode))
        AND NULLIF(LTRIM(RTRIM(EVL_NAME)), '') IS NOT NULL
    ) E
    OUTER APPLY (
      SELECT TOP 1 tName AS teacherName
      FROM dbo.PU_Evaluators_Final WITH (NOLOCK)
      WHERE LTRIM(RTRIM(uName)) = LTRIM(RTRIM(A.ExaminerCode))
        AND NULLIF(LTRIM(RTRIM(tName)), '') IS NOT NULL
      ORDER BY CASE WHEN IsApproved = 1 THEN 0 ELSE 1 END, unqID DESC
    ) P`;
  const allotFrom =
    level === 'all'
      ? `FROM dbo.Lot_Allotment A WITH (NOLOCK)
    LEFT JOIN dbo.LOT L WITH (NOLOCK) ON L.LOT_NO = A.Lot_No
    ${teacherApply}`
      : `FROM dbo.Lot_Allotment A WITH (NOLOCK)
    INNER JOIN dbo.LOT L WITH (NOLOCK) ON L.LOT_NO = A.Lot_No
    INNER JOIN dbo.Course C WITH (NOLOCK)
      ON C.Course = L.COURSE AND ISNULL(C.IsDeleted, 0) = 0
    ${teacherApply}`;
  const teacherNameExpr = `COALESCE(
      NULLIF(LTRIM(RTRIM(A.ExaminerName)), ''),
      NULLIF(LTRIM(RTRIM(E.teacherName)), ''),
      NULLIF(LTRIM(RTRIM(P.teacherName)), '')
    )`;
  const searchSql = search
    ? `AND (
        A.Lot_No LIKE @search OR A.ExaminerCode LIKE @search OR A.ExaminerName LIKE @search
        OR E.teacherName LIKE @search OR P.teacherName LIKE @search
        OR L.COURSE LIKE @search OR L.SUBJECT LIKE @search OR L.PAPER_CODE LIKE @search
        OR L.PAPER_NAME LIKE @search OR L.LOT_BARCODE LIKE @search
      )`
    : '';
  const where = `
    WHERE 1 = 1
      ${receivedOnly ? 'AND (A.isReceived = 1 OR A.DateReceived IS NOT NULL)' : ''}
      ${courseTypeFilter('C', level)}
      ${searchSql}
  `;

  const countReq = pool.request();
  const listReq = pool.request().input('offset', sql.Int, offset).input('pageSize', sql.Int, pageSize);
  if (search) {
    countReq.input('search', sql.NVarChar(80), `%${search}%`);
    listReq.input('search', sql.NVarChar(80), `%${search}%`);
  }

  const [countResult, listResult] = await Promise.all([
    countReq.query(`
      SELECT COUNT(*) AS totalRows,
             ISNULL(SUM(TRY_CAST(A.NoOfCopies AS int)), 0) AS totalCopies
      ${allotFrom}
      ${where}
    `),
    listReq.query(`
      SELECT
        A.Lot_No AS lotNo,
        L.LOT_BARCODE AS lotBarcode,
        L.COURSE AS course,
        L.SUBJECT AS subject,
        L.PAPER_CODE AS paperCode,
        L.PAPER_NAME AS paperName,
        L.CENTER_CODE AS centerCode,
        TRY_CAST(A.NoOfCopies AS int) AS copies,
        A.ExaminerCode AS evaluatorCode,
        ${teacherNameExpr} AS evaluatorName,
        A.DateCreated AS dateAllot,
        A.DateReceived AS dateRece
      ${allotFrom}
      ${where}
      ORDER BY A.DateCreated DESC, A.Lot_No
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
    `),
  ]);

  const totals = countResult.recordset?.[0] || {};
  return {
    columns: [
      'lotNo',
      'lotBarcode',
      'course',
      'subject',
      'paperCode',
      'paperName',
      'copies',
      'evaluatorName',
      'evaluatorCode',
      'dateAllot',
      'dateRece',
    ],
    totalRows: num(totals.totalRows),
    totalCopies: num(totals.totalCopies),
    rows: (listResult.recordset || []).map((r, i) => mapLotRow(r, i, offset)),
  };
};

const getLotStageDetails = async ({ level, stage, page, pageSize, search }) => {
  if (stage === 'allotted' || stage === 'received') {
    return getAllotmentStageDetails({ level, stage, page, pageSize, search });
  }
  return getBarcodeStageDetails({ level, page, pageSize, search });
};

const getFlapStageDetails = async ({ year, page, pageSize, search }) => {
  const pool = await getPool2();
  const offset = (page - 1) * pageSize;
  const y = resolveYear(year);
  const yearSql =
    y >= new Date().getFullYear()
      ? ''
      : `AND Createddate IS NOT NULL AND YEAR(Createddate) = @year`;
  const searchSql = search
    ? `AND (
        BarCode LIKE @search OR RollNo LIKE @search OR [PAPER CODE] LIKE @search
        OR AnsNo LIKE @search OR Course LIKE @search OR Lot LIKE @search
        OR CatchNo LIKE @search OR CAST(Status AS nvarchar(40)) LIKE @search
      )`
    : '';

  const countReq = pool.request().input('year', sql.Int, y);
  const listReq = pool
    .request()
    .input('year', sql.Int, y)
    .input('offset', sql.Int, offset)
    .input('pageSize', sql.Int, pageSize);
  countReq.timeout = 90000;
  listReq.timeout = 90000;
  if (search) {
    countReq.input('search', sql.NVarChar(80), `%${search}%`);
    listReq.input('search', sql.NVarChar(80), `%${search}%`);
  }

  // Many recent flap rows have blank Course/Lot/PAPER CODE/Status.
  // Enrich page rows via LOT barcode range (REMARK3) + Student_Data + award CatchNo.
  const [countResult, listResult] = await Promise.all([
    countReq.query(`
      SELECT COUNT(*) AS totalRows,
             SUM(CASE WHEN NULLIF(LTRIM(RTRIM(AnsNo)), '') IS NOT NULL THEN 1 ELSE 0 END) AS codeCorrection
      FROM dbo.tbl_CopyFlap WITH (NOLOCK)
      WHERE 1 = 1
        ${yearSql}
        ${searchSql}
    `),
    listReq.query(`
      SELECT
        F.BarCode AS barcode,
        F.RollNo AS rollNo,
        F.AnsNo AS answerKeyNo,
        COALESCE(
          NULLIF(LTRIM(RTRIM(L.COURSE)), ''),
          NULLIF(LTRIM(RTRIM(S.CourseName)), ''),
          NULLIF(LTRIM(RTRIM(F.Course)), '')
        ) AS course,
        COALESCE(
          NULLIF(LTRIM(RTRIM(F.Lot)), ''),
          NULLIF(LTRIM(RTRIM(L.LOT_NO)), '')
        ) AS lotNo,
        COALESCE(
          NULLIF(LTRIM(RTRIM(F.[PAPER CODE])), ''),
          NULLIF(LTRIM(RTRIM(L.PAPER_CODE)), ''),
          NULLIF(LTRIM(RTRIM(F.CatchNo)), ''),
          NULLIF(LTRIM(RTRIM(A.CatchNo)), '')
        ) AS paperCode,
        COALESCE(
          NULLIF(LTRIM(RTRIM(F.Status)), ''),
          NULLIF(LTRIM(RTRIM(S.ExamType)), '')
        ) AS status
      FROM (
        SELECT
          FlapId, BarCode, RollNo, AnsNo, Course, Lot, Status, CatchNo, [PAPER CODE]
        FROM dbo.tbl_CopyFlap WITH (NOLOCK)
        WHERE 1 = 1
          ${yearSql}
          ${searchSql}
        ORDER BY FlapId DESC
        OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
      ) F
      OUTER APPLY (
        SELECT TOP 1 LOT_NO, COURSE, PAPER_CODE
        FROM dbo.LOT WITH (NOLOCK)
        WHERE CHARINDEX('-', REMARK3) > 0
          AND TRY_CAST(NULLIF(LTRIM(RTRIM(F.BarCode)), '') AS bigint) IS NOT NULL
          AND TRY_CAST(LEFT(REMARK3, CHARINDEX('-', REMARK3) - 1) AS bigint) IS NOT NULL
          AND TRY_CAST(SUBSTRING(REMARK3, CHARINDEX('-', REMARK3) + 1, 30) AS bigint) IS NOT NULL
          AND TRY_CAST(F.BarCode AS bigint) BETWEEN
            TRY_CAST(LEFT(REMARK3, CHARINDEX('-', REMARK3) - 1) AS bigint)
            AND TRY_CAST(SUBSTRING(REMARK3, CHARINDEX('-', REMARK3) + 1, 30) AS bigint)
      ) L
      OUTER APPLY (
        SELECT TOP 1 CourseName, ExamType
        FROM dbo.Student_Data WITH (NOLOCK)
        WHERE RollNo = F.RollNo
        ORDER BY StudentId DESC
      ) S
      OUTER APPLY (
        SELECT TOP 1 CatchNo
        FROM dbo.AWARD_SHEET_NEw WITH (NOLOCK)
        WHERE BarCode = F.BarCode
      ) A
      ORDER BY F.FlapId DESC
    `),
  ]);

  const totals = countResult.recordset?.[0] || {};
  return {
    columns: ['barcode', 'rollNo', 'course', 'lotNo', 'paperCode', 'answerKeyNo', 'status'],
    totalRows: num(totals.totalRows),
    totalCopies: num(totals.totalRows),
    codeCorrection: num(totals.codeCorrection),
    rows: (listResult.recordset || []).map((r, index) => ({
      sNo: offset + index + 1,
      barcode: display(r.barcode),
      rollNo: display(r.rollNo),
      course: display(r.course),
      lotNo: display(r.lotNo),
      paperCode: display(r.paperCode),
      answerKeyNo: display(r.answerKeyNo),
      status: display(r.status),
    })),
  };
};

const getScanStageDetails = async ({ year, stage, page, pageSize, search }) => {
  const pool = await getPool2();
  const offset = (page - 1) * pageSize;
  const y = resolveYear(year);
  const searchSql = search ? `AND Course LIKE @search` : '';

  const req = pool.request().input('year', sql.Int, y);
  req.timeout = 60000;
  if (search) req.input('search', sql.NVarChar(80), `%${search}%`);

  let result;
  if (stage === 'omr') {
    // OMR_SHEET_New has no Course column — resolve name via Student_Data.RollNo.
    const courseExpr = `
      CASE
        WHEN ISNULL(NULLIF(LTRIM(RTRIM(S.CourseName)), ''), '—') IN ('B.A.', 'B. A.') THEN 'B. A.'
        WHEN ISNULL(NULLIF(LTRIM(RTRIM(S.CourseName)), ''), '—') IN ('B.Sc.', 'B. Sc.') THEN 'B. Sc.'
        ELSE ISNULL(NULLIF(LTRIM(RTRIM(S.CourseName)), ''), '—')
      END`;
    const omrSearch = search ? `HAVING ${courseExpr} LIKE @search` : '';
    result = await req.query(`
      ;WITH Stud AS (
        SELECT RollNo, CourseName,
          ROW_NUMBER() OVER (PARTITION BY RollNo ORDER BY StudentId DESC) AS rn
        FROM dbo.Student_Data WITH (NOLOCK)
        WHERE NULLIF(LTRIM(RTRIM(RollNo)), '') IS NOT NULL
      )
      SELECT
        ${courseExpr} AS course,
        COUNT(*) AS scanned
      FROM dbo.OMR_SHEET_New O WITH (NOLOCK)
      LEFT JOIN Stud S ON S.RollNo = O.RollNo AND S.rn = 1
      WHERE O.CreatedDate IS NOT NULL AND YEAR(O.CreatedDate) = @year
      GROUP BY ${courseExpr}
      ${omrSearch}
      ORDER BY scanned DESC
    `);
  } else {
    result = await req.query(`
      SELECT
        ISNULL(NULLIF(LTRIM(RTRIM(Course)), ''), '—') AS course,
        COUNT(*) AS lots,
        SUM(CASE WHEN NULLIF(LTRIM(RTRIM(M_OCR)), '') IS NOT NULL THEN 1 ELSE 0 END) AS scanned
      FROM dbo.AWARD_SHEET_NEw WITH (NOLOCK)
      WHERE CreatedDate IS NOT NULL AND YEAR(CreatedDate) = @year
        AND NULLIF(LTRIM(RTRIM(M_OCR)), '') IS NOT NULL
        ${searchSql}
      GROUP BY ISNULL(NULLIF(LTRIM(RTRIM(Course)), ''), '—')
      ORDER BY scanned DESC
    `);
  }

  const allRows = (result.recordset || []).map((r, index) => ({
    sNo: index + 1,
    course: display(r.course),
    lots: r.lots != null ? num(r.lots) : null,
    scanned: num(r.scanned),
  }));
  const totalScanned = allRows.reduce((n, r) => n + r.scanned, 0);
  const pageRows = allRows.slice(offset, offset + pageSize).map((r, index) => ({
    ...r,
    sNo: offset + index + 1,
  }));

  return {
    columns: stage === 'omr' ? ['course', 'scanned'] : ['course', 'lots', 'scanned'],
    totalRows: allRows.length,
    totalCopies: totalScanned,
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
  const cacheKey = `pu2026:${year}:${level}:${stage}:${page}:${pageSize}:${search.toLowerCase()}`;
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
      message: 'Flap details are not split by UG/PG. Select Level = All.',
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
    detail = await getScanStageDetails({ year, stage, page, pageSize, search });
  } else {
    detail = await getLotStageDetails({ level, stage, page, pageSize, search });
  }

  const value = {
    year: String(year),
    level,
    stage,
    page,
    pageSize,
    search,
    available: true,
    database: 'PU_2026',
    readOnly: true,
    ...detail,
  };
  detailCache.set(cacheKey, { at: Date.now(), value });
  return value;
};

module.exports = { getFilters, getStatus, getStageDetails };
