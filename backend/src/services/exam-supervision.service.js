const { getPool, sql } = require('../config/db');

/**
 * Exam supervision प्रपत्र — driven by dbo.ExamEnquiryDetails.
 * SP itself always uses "today IST" (DATEADD(MINUTE,330,GETUTCDATE())).
 * For other selected dates we run the same SP body with @examDate.
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

/**
 * Exact body of dbo.ExamEnquiryDetails, with the SP's "today IST" expression
 * replaced by @examDate so historical dates can use the same logic.
 */
/** Non-blank gender only (matches Male + FeMale sums used for छात्र/छात्राएं). */
const totalStudentExpr = `sum(case when nullif(ltrim(rtrim(s.Gender)),'') is not null then 1 else 0 end)`;

const examEnquiryDetailsSql = `
Select Date,sum(totalstudent) as totalstudent,Meeting,sum(MaleAbsent) as MaleAbsent,sum(FemaleAbsent) FemaleAbsent,sum(TotalFemale) TotalFemale,sum(TotalMale) TotalMale from (select format(ug1.ExamDate,'dd-MMM-yyyy') as Date,${totalStudentExpr} as 'totalstudent',(select MeetingName +' Meeting '+Timing from MeetingMaster where MeetingId= Ug1.MeetingId) as Meeting,
sum(case when ExamAttendance.Present=0 and s.Gender='Male' then  1 else 0 end) MaleAbsent,
sum(case when ExamAttendance.Present=0 and s.Gender='FeMale' then  1 else 0 end) FemaleAbsent,
sum(case when s.Gender='FeMale' then  1 else 0 end) TotalFemale,
sum(case when s.Gender='Male' then  1 else 0 end) TotalMale
FROM  dbo.Student_Data s WITH (NOLOCK)
INNER JOIN EVEN_SEM_PAPERS EP WITH (NOLOCK) ON RegistrationNo = ExamFormNo
INNER JOIN dbo.PaperMaster p WITH (NOLOCK) ON p.PK_PaperID = EP.FK_PaperID
inner Join Ug1 on Ug1.[PAPER ID]=p.PaperCode
left outer join ExamAttendance WITH (NOLOCK) on ExamAttendance.Studentid=s.StudentId and ExamAttendance.Rollno=s.RollNo and paperid=p.PK_PaperID  and cast(CreatedAt as date)=cast(ug1.ExamDate as date)
WHERE   cast(Ug1.ExamDate as date)=@examDate and s.Semester in(1,3,5,7)  and S.SessionId=4
group by format(Ug1.ExamDate,'dd-MMM-yyyy'),Ug1.MeetingId

union all
select format(PG1.ExamDate,'dd-MMM-yyyy') as Date,${totalStudentExpr} as 'totalstudent',(select MeetingName +' Meeting '+Timing from MeetingMaster where MeetingId= PG1.MeetingId) as Meeting,
sum(case when ExamAttendance.Present=0 and s.Gender='Male' then  1 else 0 end) MaleAbsent,
sum(case when ExamAttendance.Present=0 and s.Gender='FeMale' then  1 else 0 end) FemaleAbsent,
sum(case when s.Gender='FeMale' then  1 else 0 end) TotalFemale,
sum(case when s.Gender='Male' then  1 else 0 end) TotalMale
FROM  dbo.Student_Data s WITH (NOLOCK)
INNER JOIN EVEN_SEM_PAPERS EP WITH (NOLOCK) ON RegistrationNo = ExamFormNo
INNER JOIN dbo.PaperMaster p WITH (NOLOCK) ON p.PK_PaperID = EP.FK_PaperID
inner Join PG1 on PG1.[PAPER ID]=p.PaperCode
left outer join ExamAttendance WITH (NOLOCK) on ExamAttendance.Studentid=s.StudentId and ExamAttendance.Rollno=s.RollNo and paperid=p.PK_PaperID  and cast(CreatedAt as date)=cast(PG1.ExamDate as date)
WHERE   cast(PG1.ExamDate as date)=@examDate and s.Semester in (1,3,5,7)  and S.SessionId=4
group by format(PG1.ExamDate,'dd-MMM-yyyy'),PG1.MeetingId

union all
select format(UG3.ExamDate,'dd-MMM-yyyy') as Date,${totalStudentExpr} as 'totalstudent',(select MeetingName +' Meeting '+ Timing from MeetingMaster where MeetingId= UG3.MeetingId) as Meeting,
sum(case when ExamAttendance.Present=0 and s.Gender='Male' then  1 else 0 end) MaleAbsent,
sum(case when ExamAttendance.Present=0 and s.Gender='FeMale' then  1 else 0 end) FemaleAbsent,
sum(case when s.Gender='FeMale' then  1 else 0 end) TotalFemale,
sum(case when s.Gender='Male' then  1 else 0 end) TotalMale
FROM  dbo.Student_Data s WITH (NOLOCK)
INNER JOIN EVEN_SEM_PAPERS EP WITH (NOLOCK) ON RegistrationNo = ExamFormNo
INNER JOIN dbo.PaperMaster p WITH (NOLOCK) ON p.PK_PaperID = EP.FK_PaperID
inner Join UG3 on UG3.[PAPER ID]=p.PaperCode
left outer join ExamAttendance WITH (NOLOCK) on ExamAttendance.Studentid=s.StudentId and ExamAttendance.Rollno=s.RollNo and paperid=p.PK_PaperID  and cast(CreatedAt as date)=cast(UG3.ExamDate as date)
WHERE     cast(UG3.ExamDate as date)=@examDate and s.Semester in (1,3,5,7)  and S.SessionId=4
group by format(UG3.ExamDate,'dd-MMM-yyyy'),UG3.MeetingId

union all
select format(UG5.ExamDate,'dd-MMM-yyyy') as Date,${totalStudentExpr} as 'totalstudent',(select MeetingName +' Meeting '+Timing from MeetingMaster where MeetingId= UG5.MeetingId) as Meeting,
sum(case when ExamAttendance.Present=0 and s.Gender='Male' then  1 else 0 end) MaleAbsent,
sum(case when ExamAttendance.Present=0 and s.Gender='FeMale' then  1 else 0 end) FemaleAbsent,
sum(case when s.Gender='FeMale' then  1 else 0 end) TotalFemale,
sum(case when s.Gender='Male' then  1 else 0 end) TotalMale
FROM  dbo.Student_Data s WITH (NOLOCK)
INNER JOIN EVEN_SEM_PAPERS EP WITH (NOLOCK) ON RegistrationNo = ExamFormNo
INNER JOIN dbo.PaperMaster p WITH (NOLOCK) ON p.PK_PaperID = EP.FK_PaperID
inner Join UG5 on UG5.[PAPER ID]=p.PaperCode
left outer join ExamAttendance WITH (NOLOCK) on ExamAttendance.Studentid=s.StudentId and ExamAttendance.Rollno=s.RollNo and paperid=p.PK_PaperID  and cast(CreatedAt as date)=cast(UG5.ExamDate as date)
WHERE   cast(UG5.ExamDate as date)=@examDate and s.Semester in (1,3,5,7) and S.SessionId=4
group by format(UG5.ExamDate,'dd-MMM-yyyy'),UG5.MeetingId

union all
select format(Pg5.ExamDate,'dd-MMM-yyyy') as Date,${totalStudentExpr} as 'totalstudent',(select MeetingName +' Meeting '+Timing from MeetingMaster where MeetingId= Pg5.MeetingId) as Meeting,
sum(case when ExamAttendance.Present=0 and s.Gender='Male' then  1 else 0 end) MaleAbsent,
sum(case when ExamAttendance.Present=0 and s.Gender='FeMale' then  1 else 0 end) FemaleAbsent,
sum(case when s.Gender='FeMale' then  1 else 0 end) TotalFemale,
sum(case when s.Gender='Male' then  1 else 0 end) TotalMale
FROM  dbo.Student_Data s WITH (NOLOCK)
INNER JOIN EVEN_SEM_PAPERS EP WITH (NOLOCK) ON RegistrationNo = ExamFormNo
INNER JOIN dbo.PaperMaster p WITH (NOLOCK) ON p.PK_PaperID = EP.FK_PaperID
inner Join Pg5 on Pg5.[PAPER ID]=p.PaperCode
left outer join ExamAttendance WITH (NOLOCK) on ExamAttendance.Studentid=s.StudentId and ExamAttendance.Rollno=s.RollNo and paperid=p.PK_PaperID  and cast(CreatedAt as date)=cast(Pg5.ExamDate as date)
WHERE   cast(Pg5.ExamDate as date)=@examDate and s.Semester in (1,3,5,7) and S.SessionId=4
group by format(Pg5.ExamDate,'dd-MMM-yyyy'),Pg5.MeetingId) as t(Date,totalstudent,Meeting,MaleAbsent,FemaleAbsent,TotalFemale,TotalMale) group by Date,Meeting ORDER bY Meeting
`;

const mapRows = (recordset) =>
  (recordset || [])
    .map((r) => {
      const parsed = parseMeeting(r.Meeting);
      const male = Number(r.TotalMale) || 0;
      const female = Number(r.TotalFemale) || 0;
      // Exclude blank/NULL gender — कुल = छात्र + छात्राएं (same as non-blank count).
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

const getTodayIst = async (pool) => {
  const result = await pool.request().query(`
    SELECT CONVERT(varchar(10), CAST(DATEADD(MINUTE, 330, GETUTCDATE()) AS date), 23) AS todayIst
  `);
  return formatDate(result.recordset[0]?.todayIst);
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
  const todayIst = await getTodayIst(pool);

  const [rowsResult, sessionResult] = await Promise.all([
    (async () => {
      // Today → execute the real procedure (same as portal).
      if (day === todayIst) {
        return pool.request().input('CenterLoginId', sql.VarChar(50), '').execute('ExamEnquiryDetails');
      }
      // Other dates → same SP SQL with @examDate.
      return pool.request().input('examDate', sql.Date, day).query(examEnquiryDetailsSql);
    })(),
    pool.request().query(`
      SELECT TOP 1 Session AS session FROM dbo.M_Session WHERE SessionId = 4
    `),
  ]);

  const recordset = rowsResult.recordset || [];
  const rows = mapRows(recordset);
  const reportDate = parseSpDate(recordset[0]?.Date) || day;

  return buildReport(reportDate, rows, sessionResult.recordset[0]?.session);
};

module.exports = { getDates, getReport };
