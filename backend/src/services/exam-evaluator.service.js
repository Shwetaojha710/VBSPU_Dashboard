const config = require('../config');
const { getPool, sql } = require('../config/db');

/**
 * Exam Evaluator List — wraps dbo.Proc_ExamEvaluatorList (PU_Evaluators_Final).
 * @approveOrDevline: '' = all, 'P' = pending, 'A' = approved, 'D' = declined
 *
 * SP text filters are exact equality; we pass status to the SP and apply
 * case-insensitive contains filters here so Search matches expected UI behaviour.
 */

const STATUS_MAP = {
  all: '',
  pending: 'P',
  approved: 'A',
  declined: 'D',
};

const REGISTRATION_TYPE = {
  0: '',
  1: 'Theory',
  2: 'Practical',
  3: 'Evaluation',
  4: 'Evaluation/Practical Both',
};

const display = (value) => {
  if (value === null || value === undefined) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  if (!s || s.toUpperCase() === 'NULL') return null;
  return s;
};

const yesNo = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  const s = String(value).trim().toLowerCase();
  if (!s) return null;
  if (['1', 'y', 'yes', 'true'].includes(s)) return 'Yes';
  if (['0', 'n', 'no', 'false'].includes(s)) return 'No';
  return display(value);
};

/** `~/Content/...` → https://vbspuresult.org.in/Content/... */
const toPublicUrl = (path) => {
  const p = display(path);
  if (!p) return null;
  if (/^https?:\/\//i.test(p)) return p;
  const cleaned = p.replace(/^~\/?/, '').replace(/^\/+/, '');
  return `${config.evaluatorFileBaseUrl}/${cleaned}`;
};

const fileMeta = (path) => {
  const p = display(path);
  if (!p) return null;
  const name = p.split(/[/\\]/).pop() || p;
  const url = toPublicUrl(p);
  const lower = name.toLowerCase();
  const isImage = /\.(jpe?g|png|gif|webp|bmp)$/i.test(lower);
  return { path: p, name, url, isImage };
};

const contains = (haystack, needle) => {
  if (!needle) return true;
  return String(haystack || '')
    .toLowerCase()
    .includes(needle);
};

const mapListRow = (r, index) => ({
  sNo: index + 1,
  evaluatorId: display(r.EvaluatorId),
  formUniqueId: display(r.FormUniqueId),
  name: display(r.Name),
  designation: display(r.Designation),
  instituteName: display(r.InstituteName),
  subject: display(r.Subject),
  teachingExpUg: r.TeachingExpUG ?? null,
  teachingExpPg: r.TeachingExpPG ?? null,
  teachingExperience: `${r.TeachingExpUG ?? 0} / ${r.TeachingExpPG ?? 0}`,
  specialization: display(r.Speclization) ?? display(r.speci),
  contactNo: display(r.ContactNo),
  alternateNo: display(r.AlternateNo),
  contactDisplay: [display(r.ContactNo), display(r.AlternateNo)].filter(Boolean).join(' / ') || null,
  emailId: display(r.EmailId),
  panNo: display(r.PanNo),
  adharNo: display(r.AdharNo),
  panAdharDisplay: [display(r.PanNo), display(r.AdharNo)].filter(Boolean).join(' / ') || null,
  files: {
    aadhar: fileMeta(r.AdharNoFile),
    pan: fileMeta(r.PanNoFile),
    photo: fileMeta(r.Photo),
    sign: fileMeta(r.Sign),
    appointmentLetter: fileMeta(r.AppointmentLetter),
    experienceLetter: fileMeta(r.ExperienceLetter),
  },
  photoUrl: toPublicUrl(r.Photo),
  signUrl: toPublicUrl(r.Sign),
  isApproved: !!r.IsApproved,
  isDeclined: !!r.IsDeclined,
  status: r.IsApproved ? 'Approved' : r.IsDeclined ? 'Declined' : 'Pending',
});

const mapPrintDetail = (r) => {
  const examinerTypeId = Number(r.ExaminerTypeId ?? 0);
  return {
    formUniqueId: display(r.uName),
    registrationType: REGISTRATION_TYPE[examinerTypeId] || display(r.ExaminerTypeId) || '',
    name: display(r.tName),
    gender: display(r.sex),
    dateOfBirth: display(r.dob),
    fatherName: display(r.fname),
    motherName: display(r.Moname),
    residentialAddress: display(r.TAddress),
    mobileNo: display(r.mobileno),
    alternateNo: display(r.Phoneno),
    emailId: display(r.emailid),
    aadharNo: display(r.adharno),
    panNo: display(r.PANno),
    bankName: display(r.BankName),
    bankAccountNo: display(r.BankAcno) ?? display(r.bankACnumber),
    ifscCode: display(r.IFSC) ?? display(r.bankIfsccode),
    bankBranch: display(r.Bankbranch),
    affiliatedToVbspu: yesNo(r.AffiliatedVbspuOrNot),
    universityName: display(r.NameUniversity) || 'Veer Bahadur Singh Purvanchal University, Jaunpur',
    collegeName: display(r.CollegeName) ?? display(r.NameCollege),
    natureOfCollege: display(r.NatureCollege) ?? display(r.CollegeType),
    postHeld: display(r.designation),
    natureOfAppointment: display(r.NatureAppoint),
    dateOfJoining: display(r.appointDate) ?? display(r.DateAppointment),
    approvalDate: display(r.appointHEDUdate),
    facultyName: display(r.Faculty),
    departmentName: display(r.branchtxt) ?? display(r.HODDept),
    subject: display(r.subject),
    specialization1: display(r.Specilization_one) ?? display(r.speci),
    specialization2: display(r.Specilization_Two),
    specialization3: display(r.Specilization_Three),
    teachingExpUg: r.EXPUG ?? null,
    teachingExpPg: r.EXPPG ?? null,
    photoUrl: toPublicUrl(r.phFile),
    signUrl: toPublicUrl(r.signFile),
    aadharFile: fileMeta(r.adharcard),
    panFile: fileMeta(r.pancard),
    status: r.IsApproved ? 'Approved' : r.IsDeclined ? 'Declined' : 'Pending',
  };
};

const statusWhereSql = (statusKey) => {
  if (statusKey === 'approved') return 'AND ISNULL(IsApproved,0) = 1';
  if (statusKey === 'declined') return 'AND ISNULL(IsDeclined,0) = 1';
  if (statusKey === 'pending') return 'AND ISNULL(IsApproved,0) = 0 AND ISNULL(IsDeclined,0) = 0';
  return '';
};

const getSubjects = async (status = 'pending') => {
  const statusKey = String(status || 'pending').toLowerCase();
  const statusFilter = statusWhereSql(
    Object.prototype.hasOwnProperty.call(STATUS_MAP, statusKey) ? statusKey : 'pending'
  );

  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT DISTINCT LTRIM(RTRIM(Subject)) AS subject
    FROM dbo.PU_Evaluators_Final
    WHERE Subject IS NOT NULL
      AND LTRIM(RTRIM(Subject)) <> ''
      AND LTRIM(RTRIM(Subject)) <> '-'
      ${statusFilter}
    ORDER BY subject
  `);
  return { subjects: result.recordset.map((row) => row.subject).filter(Boolean) };
};

const getList = async (filters = {}) => {
  const statusKey = String(filters.status || 'pending').toLowerCase();
  const approveOrDevline = Object.prototype.hasOwnProperty.call(STATUS_MAP, statusKey)
    ? STATUS_MAP[statusKey]
    : 'P';

  const uniqueId = String(filters.uniqueId || '').trim().toLowerCase();
  const name = String(filters.name || '').trim().toLowerCase();
  const contactNo = String(filters.contactNo || '').trim().toLowerCase();
  const adharNo = String(filters.adharNo || '').trim().toLowerCase();
  const subject = String(filters.subject || '').trim().toLowerCase();

  const pool = await getPool();
  const req = pool.request();
  req.input('FormUniqueId', sql.NVarChar(200), '');
  req.input('Name', sql.NVarChar(200), '');
  req.input('ContactNo', sql.NVarChar(20), '');
  req.input('AdharNo', sql.NVarChar(20), '');
  req.input('approveOrDevline', sql.NVarChar(5), approveOrDevline);

  const result = await req.execute('Proc_ExamEvaluatorList');
  let rows = (result.recordset || []).map(mapListRow);

  if (uniqueId || name || contactNo || adharNo || subject) {
    rows = rows.filter((r) => {
      const subjectOk = !subject
        ? true
        : String(r.subject || '')
            .toLowerCase()
            .trim() === subject;
      return (
        contains(r.formUniqueId, uniqueId) &&
        contains(r.name, name) &&
        (contains(r.contactNo, contactNo) || contains(r.alternateNo, contactNo)) &&
        contains(r.adharNo, adharNo) &&
        subjectOk
      );
    });
  }

  rows = rows.map((r, index) => ({ ...r, sNo: index + 1 }));

  return {
    totalRecord: rows.length,
    status: statusKey,
    rows,
  };
};

const getPrintDetail = async (uniqueId) => {
  const id = String(uniqueId || '').trim();
  if (!id) return null;

  const pool = await getPool();
  const result = await pool
    .request()
    .input('uName', sql.NVarChar(200), id)
    .query(`
      SELECT TOP 1
        uName, tName, sex, dob, fname, Moname, TAddress,
        mobileno, Phoneno, emailid, adharno, PANno,
        BankName, BankAcno, bankACnumber, IFSC, bankIfsccode, Bankbranch,
        AffiliatedVbspuOrNot, NameUniversity, CollegeName, NameCollege,
        NatureCollege, CollegeType, designation, NatureAppoint,
        appointDate, DateAppointment, appointHEDUdate,
        Faculty, branchtxt, HODDept, subject,
        Specilization_one, Specilization_Two, Specilization_Three, speci,
        EXPUG, EXPPG, phFile, signFile, adharcard, pancard,
        ExaminerTypeId, IsApproved, IsDeclined
      FROM dbo.PU_Evaluators_Final
      WHERE uName = @uName
    `);

  const row = result.recordset?.[0];
  return row ? mapPrintDetail(row) : null;
};

module.exports = { getList, getSubjects, getPrintDetail };
