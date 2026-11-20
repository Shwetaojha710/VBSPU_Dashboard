const { getPool, sql } = require('../config/db');

/**
 * Exam supervision प्रपत्र — same logic as dbo.ExamEnquiryDetails
 * (Student_Data → EVEN_SEM_PAPERS → PaperMaster → Ug1/PG1/UG3/UG5/Pg5 → MeetingMaster,
 * ExamAttendance on CreatedAt date). COUNT(*) + Gender 'Male'/'FeMale'. SessionId = 4.
 */

const SCHEDULE_BRANCHES = [
  { alias: 'Ug1', table: 'dbo.Ug1', paperCol: '[PAPER ID]' },
  { alias: 'PG1', table: 'dbo.PG1', paperCol: '[PAPER ID]' },
  { alias: 'UG3', table: 'dbo.UG3', paperCol: '[PAPER ID]' },
  { alias: 'UG5', table: 'dbo.UG5', paperCol: '[PAPER ID]' },
  { alias: 'Pg5', table: 'dbo.Pg5', paperCol: '[PAPER ID]' },
];

const formatDate = (value) => {
  if (!value) return null;
  // Already YYYY-MM-DD from SQL CONVERT / ISO string — avoid TZ day-shift.
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  // mssql DATE often arrives as UTC midnight; use UTC parts so the calendar day stays correct.
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const parseMeeting = (meeting) => {
  const text = String(meeting || '').trim();
  // e.g. "II Meeting 11:00AM - 01:00PM"
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

const scheduleDateUnionSql = () =>
  SCHEDULE_BRANCHES.map(
    ({ table }) => `SELECT CAST(ExamDate AS date) AS examDate FROM ${table} WHERE ExamDate IS NOT NULL`
  ).join('\nUNION\n');

/** One branch of ExamEnquiryDetails (parameterized date instead of "today IST"). */
const enquiryBranchSql = ({ alias, table, paperCol }) => `
  SELECT
    FORMAT(${alias}.ExamDate, 'dd-MMM-yyyy') AS [Date],
    COUNT(*) AS totalstudent,
    (SELECT MeetingName + ' Meeting ' + Timing FROM dbo.MeetingMaster WHERE MeetingId = ${alias}.MeetingId) AS Meeting,
    SUM(CASE WHEN ExamAttendance.Present = 0 AND s.Gender = 'Male' THEN 1 ELSE 0 END) AS MaleAbsent,
    SUM(CASE WHEN ExamAttendance.Present = 0 AND s.Gender = 'FeMale' THEN 1 ELSE 0 END) AS FemaleAbsent,
    SUM(CASE WHEN s.Gender = 'FeMale' THEN 1 ELSE 0 END) AS TotalFemale,
    SUM(CASE WHEN s.Gender = 'Male' THEN 1 ELSE 0 END) AS TotalMale
  FROM dbo.Student_Data s WITH (NOLOCK)
  INNER JOIN dbo.EVEN_SEM_PAPERS EP WITH (NOLOCK) ON s.RegistrationNo = EP.ExamFormNo
  INNER JOIN dbo.PaperMaster p WITH (NOLOCK) ON p.PK_PaperID = EP.FK_PaperID
  INNER JOIN ${table} ${alias} ON ${alias}.${paperCol} = p.PaperCode
  LEFT OUTER JOIN dbo.ExamAttendance WITH (NOLOCK)
    ON ExamAttendance.Studentid = s.StudentId
   AND ExamAttendance.Rollno = s.RollNo
   AND ExamAttendance.paperid = p.PK_PaperID
   AND CAST(ExamAttendance.CreatedAt AS date) = CAST(${alias}.ExamDate AS date)
  WHERE CAST(${alias}.ExamDate AS date) = @examDate
    AND s.Semester IN (1, 3, 5, 7)
    AND s.SessionId = 4
  GROUP BY FORMAT(${alias}.ExamDate, 'dd-MMM-yyyy'), ${alias}.MeetingId
`;

const enquiryUnionSql = () => SCHEDULE_BRANCHES.map(enquiryBranchSql).join('\nUNION ALL\n');

const getDates = async () => {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT DISTINCT CONVERT(varchar(10), examDate, 23) AS examDate
    FROM (
      ${scheduleDateUnionSql()}
    ) d
    ORDER BY examDate ASC
  `);
  const dates = result.recordset
    .map((r) => formatDate(r.examDate))
    .filter(Boolean);
  // Chronological order (oldest → newest); de-dupe after formatting.
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
  const request = pool.request();
  request.input('examDate', sql.Date, day);

  const [rowsResult, sessionResult] = await Promise.all([
    request.query(`
      SELECT
        [Date],
        SUM(totalstudent) AS totalstudent,
        Meeting,
        SUM(MaleAbsent) AS MaleAbsent,
        SUM(FemaleAbsent) AS FemaleAbsent,
        SUM(TotalFemale) AS TotalFemale,
        SUM(TotalMale) AS TotalMale
      FROM (
        ${enquiryUnionSql()}
      ) AS t([Date], totalstudent, Meeting, MaleAbsent, FemaleAbsent, TotalFemale, TotalMale)
      GROUP BY [Date], Meeting
      ORDER BY Meeting
    `),
    pool.request().query(`
      SELECT TOP 1 Session AS session FROM dbo.M_Session WHERE SessionId = 4
    `),
  ]);

  const rows = rowsResult.recordset
    .map((r) => {
      const parsed = parseMeeting(r.Meeting);
      const male = Number(r.TotalMale) || 0;
      const female = Number(r.TotalFemale) || 0;
      const total = Number(r.totalstudent) || 0;
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

  const sum = (key) => rows.reduce((n, r) => n + (Number(r[key]) || 0), 0);
  const totals = {
    male: sum('male'),
    female: sum('female'),
    total: sum('total'),
    absentMale: sum('absentMale'),
    absentFemale: sum('absentFemale'),
    absentTotal: sum('absentTotal'),
  };

  return {
    date: day,
    session: sessionResult.recordset[0]?.session ?? '2027',
    university: 'Veer Bahadur Singh Purvanchal University, Jaunpur',
    titleHi: 'उत्तर प्रदेश राज्य विश्वविद्यालय की परीक्षा के अनुश्रवण हेतु प्रपत्र',
    rows,
    totals,
  };
};

module.exports = { getDates, getReport };
