const { getPool, sql } = require('../config/db');

/**
 * Exam supervision प्रपत्र — driven by dbo.ExamEnquiryDetails.
 * The procedure takes @CenterLoginId (blank = all centres) and @ExamDate.
 */

const SCHEDULE_TABLES = ['dbo.Ug1', 'dbo.PG1', 'dbo.UG3', 'dbo.UG5', 'dbo.Pg5'];

const formatDate = (value) => {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/** Parse SP Date column like "20-Nov-2026" → YYYY-MM-DD. */
const parseSpDate = (value) => {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const parseMeeting = (meeting) => {
  const text = String(meeting || '').trim();
  const m = text.match(/^(I{1,3}|IV|V|\d+)\s+Meeting\s*(.*)$/i);
  if (!m) {
    return { shift: text || 'Meeting', meetingName: text, time: '' };
  }
  const name = m[1].toUpperCase();
  return {
    shift: `${name} Meeting`,
    meetingName: name,
    time: String(m[2] || '').trim(),
  };
};

const shiftOrder = (name) => {
  const n = String(name || '').trim().toUpperCase();
  if (n === 'I' || n === '1') return 1;
  if (n === 'II' || n === '2') return 2;
  if (n === 'III' || n === '3') return 3;
  return 9;
};

const meetingKey = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * ExamEnquiryDetails counts every non-Female row as male, so blank gender inflates छात्र.
 * This uses the same joins and date, but Male and Female only.
 */
const genderCountSql = `
SELECT
  Meeting,
  SUM(TotalMale) AS TotalMale,
  SUM(TotalFemale) AS TotalFemale,
  SUM(MaleAbsent) AS MaleAbsent,
  SUM(FemaleAbsent) AS FemaleAbsent
FROM (
  ${['Ug1', 'PG1', 'UG3', 'UG5', 'Pg5']
    .map(
      (table) => `
  SELECT
    (SELECT MeetingName + ' Meeting ' + Timing FROM MeetingMaster WHERE MeetingId = src.MeetingId) AS Meeting,
    SUM(CASE WHEN UPPER(LTRIM(RTRIM(ISNULL(s.Gender, '')))) = 'MALE' THEN 1 ELSE 0 END) AS TotalMale,
    SUM(CASE WHEN UPPER(LTRIM(RTRIM(ISNULL(s.Gender, '')))) = 'FEMALE' THEN 1 ELSE 0 END) AS TotalFemale,
    SUM(CASE WHEN ExamAttendance.Present = 0 AND UPPER(LTRIM(RTRIM(ISNULL(s.Gender, '')))) = 'MALE' THEN 1 ELSE 0 END) AS MaleAbsent,
    SUM(CASE WHEN ExamAttendance.Present = 0 AND UPPER(LTRIM(RTRIM(ISNULL(s.Gender, '')))) = 'FEMALE' THEN 1 ELSE 0 END) AS FemaleAbsent
  FROM dbo.Student_Data s WITH (NOLOCK)
  INNER JOIN EVEN_SEM_PAPERS EP WITH (NOLOCK) ON RegistrationNo = ExamFormNo
  INNER JOIN dbo.PaperMaster p WITH (NOLOCK) ON p.PK_PaperID = EP.FK_PaperID
  INNER JOIN dbo.${table} src ON src.[PAPER ID] = p.PaperCode
  LEFT OUTER JOIN ExamAttendance WITH (NOLOCK)
    ON ExamAttendance.Studentid = s.StudentId
   AND ExamAttendance.Rollno = s.RollNo
   AND paperid = p.PK_PaperID
   AND CAST(CreatedAt AS date) = CAST(src.ExamDate AS date)
  WHERE CAST(src.ExamDate AS date) = @examDate
    AND s.Semester IN (1, 3, 5, 7)
    AND s.SessionId = 4
  GROUP BY src.MeetingId`
    )
    .join('\n  UNION ALL')}
) g
GROUP BY Meeting
`;

/** Replace procedure gender columns with strict Male / Female counts for the same meetings. */
const applyGenderCounts = (recordset, genderRows) => {
  const byMeeting = new Map((genderRows || []).map((row) => [meetingKey(row.Meeting), row]));
  return (recordset || []).map((row) => {
    const match = byMeeting.get(meetingKey(row.Meeting));
    if (!match) return row;
    return {
      ...row,
      TotalMale: match.TotalMale,
      TotalFemale: match.TotalFemale,
      MaleAbsent: match.MaleAbsent,
      FemaleAbsent: match.FemaleAbsent,
    };
  });
};

const mapRows = (recordset) =>
  (recordset || [])
    .map((r) => {
      const parsed = parseMeeting(r.Meeting);
      const male = Number(r.TotalMale) || 0;
      const female = Number(r.TotalFemale) || 0;
      // Blank and other genders stay out, so कुल = छात्र + छात्राएं.
      const total = male + female;
      const absentMale = Number(r.MaleAbsent) || 0;
      const absentFemale = Number(r.FemaleAbsent) || 0;
      return {
        shift: parsed.shift,
        meetingName: parsed.meetingName,
        time: parsed.time,
        male,
        female,
        total,
        absentMale,
        absentFemale,
        absentTotal: absentMale + absentFemale,
        ufm: {
          male: 0,
          female: 0,
          total: 0,
          action: 'नियमानुसार UFM के अन्तर्गत कार्यवाही की जायेगी।',
        },
        staffCases: { count: 0, action: '' },
        remarks: '',
        _order: shiftOrder(parsed.meetingName),
      };
    })
    .sort((a, b) => a._order - b._order)
    .map(({ _order, ...row }) => row);

const buildReport = (day, rows, session) => {
  const sum = (key) => rows.reduce((n, r) => n + (Number(r[key]) || 0), 0);
  return {
    date: day,
    session: session ?? '2027',
    university: 'Veer Bahadur Singh Purvanchal University, Jaunpur',
    titleHi: 'उत्तर प्रदेश राज्य विश्वविद्यालय की परीक्षा के अनुश्रवण हेतु प्रपत्र',
    source: 'ExamEnquiryDetails',
    rows,
    totals: {
      male: sum('male'),
      female: sum('female'),
      total: sum('total'),
      absentMale: sum('absentMale'),
      absentFemale: sum('absentFemale'),
      absentTotal: sum('absentTotal'),
    },
  };
};

const getDates = async () => {
  const pool = await getPool();
  const union = SCHEDULE_TABLES.map(
    (table) => `SELECT CAST(ExamDate AS date) AS examDate FROM ${table} WHERE ExamDate IS NOT NULL`
  ).join('\nUNION\n');
  const result = await pool.request().query(`
    SELECT DISTINCT CONVERT(varchar(10), examDate, 23) AS examDate
    FROM (
      ${union}
    ) d
    ORDER BY examDate ASC
  `);
  const dates = result.recordset.map((r) => formatDate(r.examDate)).filter(Boolean);
  return { dates: [...new Set(dates)].sort() };
};

const getReport = async (date) => {
  const day = String(date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    const err = new Error('Invalid date');
    err.status = 400;
    throw err;
  }

  const pool = await getPool();

  const [rowsResult, sessionResult, genderResult] = await Promise.all([
    pool
      .request()
      .input('CenterLoginId', sql.VarChar(50), '')
      .input('ExamDate', sql.VarChar(80), day)
      .execute('ExamEnquiryDetails'),
    pool.request().query(`
      SELECT TOP 1 Session AS session FROM dbo.M_Session WHERE SessionId = 4
    `),
    pool
      .request()
      .input('examDate', sql.Date, day)
      .query(genderCountSql)
      .catch((err) => {
        console.error('Supervision gender split failed, using procedure counts:', err.message);
        return null;
      }),
  ]);

  const recordset = applyGenderCounts(rowsResult.recordset || [], genderResult?.recordset);
  const rows = mapRows(recordset);
  const reportDate = parseSpDate(recordset[0]?.Date) || day;

  return buildReport(reportDate, rows, sessionResult.recordset[0]?.session);
};

module.exports = { getDates, getReport };
