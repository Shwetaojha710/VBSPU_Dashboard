const { getPool, getWritePool, sql } = require('../config/db');

/**
 * Examiner Remuneration Report — dbo.GetExaminerRenumerationReport + AllowanceUpdate.
 * DA / TA / Paper Setter editable until admin verifies the examiner row.
 */

const ALLOWANCE_TYPES = {
  da: 'DearnessAllowance',
  ta: 'TravellingAllowance',
  paperSetter: 'PaperSetter',
};

const clean = (value) => {
  if (value == null) return null;
  const s = String(value).replace(/^[`'\s]+|[`'\s]+$/g, '').trim();
  return s || null;
};

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

let verifyTableReady;
const ensureVerificationTable = async (pool) => {
  if (verifyTableReady) return;
  await pool.request().query(`
    IF OBJECT_ID('dbo.TblAllowanceVerification', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.TblAllowanceVerification (
        EvaluatorCode varchar(80) NOT NULL PRIMARY KEY,
        IsVerified bit NOT NULL CONSTRAINT DF_TblAllowanceVerification_IsVerified DEFAULT(0),
        VerifiedAt datetime NULL,
        VerifiedBy varchar(200) NULL,
        UpdatedAt datetime NOT NULL CONSTRAINT DF_TblAllowanceVerification_UpdatedAt DEFAULT (DATEADD(MINUTE, 330, GETUTCDATE()))
      );
    END
  `);
  verifyTableReady = true;
};

const mapRow = (r, verifiedMap = new Map()) => {
  const copiesUg = num(r.TotalCopiesUG);
  const copiesPg = num(r.TotalCopiesPG);
  const remUg = num(r.RenumerationUG);
  const remPg = num(r.RenumerationPG);
  const da = num(r.DA);
  const ta = num(r.TravelingAllowance);
  const paperSetter = num(r.PaperSetter);
  const code = clean(r.EVL_Code);
  const verified = code ? Boolean(verifiedMap.get(code.toUpperCase())) : false;
  return {
    evlCode: code,
    examinerName: clean(r.tname),
    examinerCollege: clean(r.ExaminerCollege),
    natureOfAppointment: clean(r.NatureCollege),
    subject: clean(r.Subject),
    bankAccNo: clean(r.BankAcno),
    ifsc: clean(r.IFSC),
    totalCopiesUg: copiesUg,
    totalCopiesPg: copiesPg,
    returnCopies: num(r.ReturnCopies),
    remunerationUg: remUg,
    remunerationPg: remPg,
    da,
    ta,
    paperSetter,
    grandTotal: remUg + remPg + da + ta + paperSetter,
    verified,
    canEdit: !verified,
  };
};

const loadVerifiedMap = async (pool, codes) => {
  const map = new Map();
  const list = [...new Set(codes.map((c) => String(c || '').trim().toUpperCase()).filter(Boolean))];
  if (!list.length) return map;

  await ensureVerificationTable(pool);
  // Chunk IN list to avoid huge parameter lists
  const chunkSize = 400;
  for (let i = 0; i < list.length; i += chunkSize) {
    const chunk = list.slice(i, i + chunkSize);
    const req = pool.request();
    const placeholders = chunk
      .map((code, idx) => {
        req.input(`c${idx}`, sql.VarChar(80), code);
        return `@c${idx}`;
      })
      .join(',');
    const result = await req.query(`
      SELECT UPPER(LTRIM(RTRIM(EvaluatorCode))) AS code, IsVerified
      FROM dbo.TblAllowanceVerification WITH (NOLOCK)
      WHERE UPPER(LTRIM(RTRIM(EvaluatorCode))) IN (${placeholders})
    `);
    for (const row of result.recordset || []) {
      map.set(row.code, Boolean(row.IsVerified));
    }
  }
  return map;
};

const getFilters = async () => {
  const pool = await getPool();
  const [subjects, natures, years] = await Promise.all([
    pool.request().query(`
      SELECT DISTINCT LTRIM(RTRIM(Subject)) AS subject
      FROM dbo.PU_Evaluators_Final WITH (NOLOCK)
      WHERE NULLIF(LTRIM(RTRIM(Subject)), '') IS NOT NULL
        AND LTRIM(RTRIM(Subject)) <> '-'
      ORDER BY subject
    `),
    pool.request().query(`
      SELECT DISTINCT LTRIM(RTRIM(NatureCollege)) AS nature
      FROM dbo.PU_Evaluators_Final WITH (NOLOCK)
      WHERE NULLIF(LTRIM(RTRIM(NatureCollege)), '') IS NOT NULL
        AND LEN(LTRIM(RTRIM(NatureCollege))) <= 80
      ORDER BY nature
    `),
    pool.request().query(`
      SELECT ISNULL(MAX(YEAR([DATE])), 2024) AS maxYear
      FROM dbo.LOT WITH (NOLOCK)
      WHERE [DATE] IS NOT NULL
    `),
  ]);

  const currentYear = new Date().getFullYear();
  const dbMax = Number(years.recordset?.[0]?.maxYear) || 2024;
  const endYear = Math.max(currentYear, dbMax, 2024);
  const yearList = [];
  for (let y = endYear; y >= 2024; y -= 1) yearList.push(String(y));

  return {
    subjects: subjects.recordset.map((r) => r.subject).filter(Boolean),
    natures: natures.recordset.map((r) => r.nature).filter(Boolean),
    years: yearList,
    defaultYear: String(currentYear),
  };
};

/** Same aggregation as GetExaminerRenumerationReport, with optional exam year (LOT.DATE) filter. */
const queryReportByYear = async (pool, { examinerCode, subject, nature, year }) => {
  const yearNum = Number(year);
  const result = await pool
    .request()
    .input('ExaminerCode', sql.VarChar(20), examinerCode || null)
    .input('SubjectId', sql.VarChar(600), subject || null)
    .input('NatureCollege', sql.VarChar(300), nature || null)
    .input('Year', sql.Int, Number.isFinite(yearNum) ? yearNum : null)
    .query(`
      ;WITH LotAgg AS (
        SELECT
          L.EVL_CODE,
          L.LOT_NO,
          C.FK_CourseType AS CourseTypeId,
          SUM(CAST(L.NO_OF_COPIES AS INT)) AS TotalCopies,
          (
            SELECT COUNT(u.id)
            FROM dbo.lot l2 WITH (NOLOCK)
            INNER JOIN dbo.ump u WITH (NOLOCK) ON l2.LOT_NO = u.lot_no
            WHERE u.LOT_NO = L.LOT_NO
          ) AS ReturnCopies
        FROM dbo.lot L WITH (NOLOCK)
        INNER JOIN dbo.Course_PU C WITH (NOLOCK) ON L.COURSE = C.Course
        WHERE C.FK_CourseType IN (1, 2)
          AND (@Year IS NULL OR YEAR(L.[DATE]) = @Year)
        GROUP BY L.EVL_CODE, L.LOT_NO, C.FK_CourseType
      ),
      Evl AS (
        SELECT
          EVL_CODE,
          SUM(CASE WHEN CourseTypeId = 1 THEN TotalCopies - ReturnCopies ELSE 0 END) AS TotalCopiesUG,
          SUM(CASE WHEN CourseTypeId = 2 THEN TotalCopies - ReturnCopies ELSE 0 END) AS TotalCopiesPG,
          SUM(ReturnCopies) AS ReturnCopies,
          SUM(CASE WHEN CourseTypeId = 1 THEN (TotalCopies - ReturnCopies) * 20 ELSE 0 END) AS RenumerationUG,
          SUM(CASE WHEN CourseTypeId = 2 THEN (TotalCopies - ReturnCopies) * 25 ELSE 0 END) AS RenumerationPG
        FROM LotAgg
        GROUP BY EVL_CODE
      )
      SELECT
        E.EVL_CODE AS EVL_Code,
        PU.tName AS tname,
        PU.BankAcno,
        PU.IFSC,
        E.TotalCopiesUG,
        E.TotalCopiesPG,
        E.ReturnCopies,
        E.RenumerationUG,
        E.RenumerationPG,
        ISNULL((SELECT SUM(TravelingAllowance) FROM dbo.tblAllowance WITH (NOLOCK) WHERE EvaluatorCode = E.EVL_CODE), 0) AS TravelingAllowance,
        ISNULL((SELECT SUM(PaperSetter) FROM dbo.tblAllowance WITH (NOLOCK) WHERE EvaluatorCode = E.EVL_CODE), 0) AS PaperSetter,
        ISNULL((SELECT SUM(DA) FROM dbo.tblAllowance WITH (NOLOCK) WHERE EvaluatorCode = E.EVL_CODE), 0) AS DA,
        PU.CollegeName AS ExaminerCollege,
        PU.NatureCollege,
        PU.subject AS Subject
      FROM Evl E
      LEFT JOIN dbo.PU_Evaluators_Final PU WITH (NOLOCK) ON E.EVL_CODE = PU.uname
      WHERE (PU.NatureCollege = @NatureCollege OR ISNULL(@NatureCollege, '') = '')
        AND (PU.subject = @SubjectId OR ISNULL(@SubjectId, '') = '')
        AND (E.EVL_CODE = @ExaminerCode OR ISNULL(@ExaminerCode, '') = '')
      ORDER BY E.EVL_CODE
    `);
  return result.recordset || [];
};

const getReport = async (filters = {}) => {
  const examinerCode = String(filters.examinerCode || filters.evlCode || '').trim();
  const subject = String(filters.subject || '').trim();
  const nature = String(filters.nature || filters.natureOfAppointment || '').trim();
  const year = String(filters.year || '').trim();

  const pool = await getPool();
  let raw;
  if (year) {
    raw = await queryReportByYear(pool, { examinerCode, subject, nature, year });
  } else {
    const result = await pool
      .request()
      .input('ExaminerCode', sql.VarChar(20), examinerCode || null)
      .input('SubjectId', sql.VarChar(600), subject || null)
      .input('NatureCollege', sql.VarChar(300), nature || null)
      .execute('GetExaminerRenumerationReport');
    raw = result.recordset || [];
  }

  const verifiedMap = await loadVerifiedMap(
    pool,
    raw.map((r) => r.EVL_Code)
  ).catch((err) => {
    console.error('Remuneration verify lookup failed:', err.message);
    return new Map();
  });

  const rows = raw.map((r) => mapRow(r, verifiedMap));
  return {
    totalRecord: rows.length,
    filters: { examinerCode, subject, nature, year },
    rows,
  };
};

const getBillDetails = async (examinerCode) => {
  const code = String(examinerCode || '').trim();
  if (!code) {
    const err = new Error('Examiner code required');
    err.status = 400;
    throw err;
  }

  const pool = await getPool();
  const [profileResult, lotsResult, verifiedMap, report] = await Promise.all([
    pool.request().input('ExaminerCode', sql.VarChar(20), code).execute('Proc_ExaminerBillProfile'),
    pool.request().input('ExaminerCode', sql.VarChar(20), code).execute('Proc_ExaminerBillDetails'),
    loadVerifiedMap(pool, [code]),
    getReport({ examinerCode: code }),
  ]);

  const p = profileResult.recordset?.[0] || {};
  const reportRow = report.rows?.[0] || null;
  const lots = (lotsResult.recordset || []).map((r) => ({
    lotNo: clean(r.LotNo),
    course: clean(r.Course),
    year: clean(r.Year),
    paperCode: clean(r.PaperCode),
    paperName: clean(r.PaperName),
    level: clean(r.Level),
    totalCopies: num(r.TotalCopies),
    returnCopies: num(r.ReturnCopies),
    netCopies: num(r.NetCopies),
    rate: num(r.Rate),
    amount: num(r.Amount),
    dateAllot: clean(r.DateAllot),
    dateReceived: clean(r.DateReceived),
  }));

  const isPg = (level) => {
    const s = String(level || '').toUpperCase();
    return s === 'PG' || s.includes('POST') || s.includes('P.G');
  };
  const pgLots = lots.filter((l) => isPg(l.level));
  const ugLots = lots.filter((l) => !isPg(l.level));
  const sumLots = (list, key) => list.reduce((n, row) => n + num(row[key]), 0);

  const remunerationUg = reportRow?.remunerationUg ?? sumLots(ugLots, 'amount');
  const remunerationPg = reportRow?.remunerationPg ?? sumLots(pgLots, 'amount');
  const da = reportRow?.da ?? 0;
  const ta = reportRow?.ta ?? 0;
  const paperSetter = reportRow?.paperSetter ?? 0;
  const grandTotal = remunerationUg + remunerationPg + da + ta + paperSetter;

  const verified = Boolean(verifiedMap.get(code.toUpperCase()));
  return {
    billDate: new Date().toLocaleDateString('en-GB').split('/').join('-'),
    profile: {
      evaluatorCode: clean(p.EvaluatorCode) || reportRow?.evlCode || code,
      name: clean(p.Name) || reportRow?.examinerName,
      designation: clean(p.Designation),
      address: clean(p.Address),
      college: clean(p.College) || reportRow?.examinerCollege,
      subject: clean(p.Subject) || reportRow?.subject,
      natureOfAppointment: reportRow?.natureOfAppointment || null,
      panNo: clean(p.PanNo),
      mobileNo: clean(p.MobileNo),
      bankName: clean(p.BankName),
      bankBranch: clean(p.BankBranch),
      bankAccNo: clean(p.BankAcNo) || reportRow?.bankAccNo,
      ifsc: clean(p.IFSC) || reportRow?.ifsc,
    },
    lots,
    ug: {
      lotCount: ugLots.length,
      rate: ugLots[0]?.rate ?? 20,
      copies: sumLots(ugLots, 'totalCopies'),
      returned: sumLots(ugLots, 'returnCopies'),
      net: sumLots(ugLots, 'netCopies'),
      amount: sumLots(ugLots, 'amount'),
      lots: ugLots,
    },
    pg: {
      lotCount: pgLots.length,
      rate: pgLots[0]?.rate ?? 25,
      copies: sumLots(pgLots, 'totalCopies'),
      returned: sumLots(pgLots, 'returnCopies'),
      net: sumLots(pgLots, 'netCopies'),
      amount: sumLots(pgLots, 'amount'),
      lots: pgLots,
    },
    summary: {
      remunerationUg,
      remunerationPg,
      da,
      ta,
      paperSetter,
      grandTotal,
    },
    totalAmount: grandTotal,
    verified,
    canEdit: !verified,
  };
};

const assertEditable = async (pool, examinerCode) => {
  await ensureVerificationTable(pool);
  const result = await pool
    .request()
    .input('code', sql.VarChar(80), examinerCode)
    .query(`
      SELECT TOP 1 IsVerified
      FROM dbo.TblAllowanceVerification WITH (NOLOCK)
      WHERE UPPER(LTRIM(RTRIM(EvaluatorCode))) = UPPER(LTRIM(RTRIM(@code)))
    `);
  if (result.recordset?.[0]?.IsVerified) {
    const err = new Error('This examiner bill is verified. Unverify to edit DA / TA / Paper Setter.');
    err.status = 409;
    throw err;
  }
};

const updateAllowance = async ({ examinerCode, field, amount }) => {
  const code = String(examinerCode || '').trim();
  const type = ALLOWANCE_TYPES[String(field || '').trim()];
  const value = Number(amount);
  if (!code || !type || !Number.isFinite(value) || value < 0) {
    const err = new Error('Valid examinerCode, field (da|ta|paperSetter), and amount required');
    err.status = 400;
    throw err;
  }

  const pool = await getWritePool();
  await assertEditable(pool, code);

  const result = await pool
    .request()
    .input('EvalutaorCode', sql.VarChar(80), code)
    .input('TravellingAllowance', sql.Decimal(18, 2), type === 'TravellingAllowance' ? value : 0)
    .input('PaperSetter', sql.Decimal(18, 2), type === 'PaperSetter' ? value : 0)
    .input('Type', sql.VarChar(90), type)
    .input('DearnessAllowance', sql.Decimal(18, 2), type === 'DearnessAllowance' ? value : 0)
    .execute('AllowanceUpdate');

  const message = result.recordset?.[0]?.Message || 'Updated';
  return { ok: true, examinerCode: code, field, amount: value, message };
};

const setVerified = async ({ examinerCode, verified, verifiedBy }) => {
  const code = String(examinerCode || '').trim();
  if (!code) {
    const err = new Error('Examiner code required');
    err.status = 400;
    throw err;
  }
  const isVerified = Boolean(verified);
  const by = String(verifiedBy || '').trim().slice(0, 200) || null;

  const pool = await getWritePool();
  await ensureVerificationTable(pool);
  await pool
    .request()
    .input('code', sql.VarChar(80), code)
    .input('verified', sql.Bit, isVerified ? 1 : 0)
    .input('by', sql.VarChar(200), by)
    .query(`
      MERGE dbo.TblAllowanceVerification AS target
      USING (SELECT @code AS EvaluatorCode) AS src
        ON UPPER(LTRIM(RTRIM(target.EvaluatorCode))) = UPPER(LTRIM(RTRIM(src.EvaluatorCode)))
      WHEN MATCHED THEN
        UPDATE SET
          IsVerified = @verified,
          VerifiedAt = CASE WHEN @verified = 1 THEN DATEADD(MINUTE, 330, GETUTCDATE()) ELSE NULL END,
          VerifiedBy = CASE WHEN @verified = 1 THEN @by ELSE NULL END,
          UpdatedAt = DATEADD(MINUTE, 330, GETUTCDATE())
      WHEN NOT MATCHED THEN
        INSERT (EvaluatorCode, IsVerified, VerifiedAt, VerifiedBy, UpdatedAt)
        VALUES (
          @code,
          @verified,
          CASE WHEN @verified = 1 THEN DATEADD(MINUTE, 330, GETUTCDATE()) ELSE NULL END,
          CASE WHEN @verified = 1 THEN @by ELSE NULL END,
          DATEADD(MINUTE, 330, GETUTCDATE())
        );
    `);

  return { ok: true, examinerCode: code, verified: isVerified };
};

module.exports = {
  getFilters,
  getReport,
  getBillDetails,
  updateAllowance,
  setVerified,
};
