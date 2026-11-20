import { HttpClient, HttpParams } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  HostListener,
  inject,
  OnInit,
  signal,
  viewChild
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { environment } from '../../../../environments/environment';

/** Filter form model — kept as one object so ngModel + OnPush stay in sync. */
interface EvaluatorFilters {
  status: string;
  uniqueId: string;
  name: string;
  contactNo: string;
  adharNo: string;
  subject: string;
}

interface EvaluatorFile {
  path: string;
  name: string;
  url?: string | null;
  isImage?: boolean;
}

interface EvaluatorRow {
  sNo: number;
  evaluatorId: string | null;
  formUniqueId: string | null;
  name: string | null;
  designation: string | null;
  instituteName: string | null;
  subject: string | null;
  teachingExperience: string;
  specialization: string | null;
  contactDisplay: string | null;
  emailId: string | null;
  panAdharDisplay: string | null;
  photoUrl?: string | null;
  signUrl?: string | null;
  files: {
    aadhar: EvaluatorFile | null;
    pan: EvaluatorFile | null;
    photo: EvaluatorFile | null;
    sign: EvaluatorFile | null;
    appointmentLetter: EvaluatorFile | null;
    experienceLetter: EvaluatorFile | null;
  };
  status: string;
}

interface EvaluatorListResponse {
  totalRecord: number;
  status: string;
  rows: EvaluatorRow[];
}

/** Full teacher-registration print payload (PDF layout). */
interface EvaluatorPrintDetail {
  formUniqueId: string | null;
  registrationType: string | null;
  name: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  fatherName: string | null;
  motherName: string | null;
  residentialAddress: string | null;
  mobileNo: string | null;
  alternateNo: string | null;
  emailId: string | null;
  aadharNo: string | null;
  panNo: string | null;
  bankName: string | null;
  bankAccountNo: string | null;
  ifscCode: string | null;
  bankBranch: string | null;
  affiliatedToVbspu: string | null;
  universityName: string | null;
  collegeName: string | null;
  natureOfCollege: string | null;
  postHeld: string | null;
  natureOfAppointment: string | null;
  dateOfJoining: string | null;
  approvalDate: string | null;
  facultyName: string | null;
  departmentName: string | null;
  subject: string | null;
  specialization1: string | null;
  specialization2: string | null;
  specialization3: string | null;
  teachingExpUg: number | null;
  teachingExpPg: number | null;
  photoUrl: string | null;
  signUrl: string | null;
  aadharFile: EvaluatorFile | null;
  panFile: EvaluatorFile | null;
  status: string;
}

/** Exam Evaluator List — filters + table + Excel export + print (Proc_ExamEvaluatorList). */
@Component({
  selector: 'app-exam-evaluators',
  imports: [RouterLink, FormsModule],
  templateUrl: './exam-evaluators.component.html',
  styleUrl: './exam-evaluators.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExamEvaluatorsComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly subjectInput = viewChild<ElementRef<HTMLInputElement>>('subjectInput');

  protected readonly subjects = signal<string[]>([]);
  protected readonly subjectQuery = signal('');
  protected readonly subjectOpen = signal(false);
  protected readonly subjectHighlight = signal(-1);
  protected readonly filteredSubjects = computed(() => {
    const q = this.subjectQuery().trim().toLowerCase();
    const list = this.subjects();
    if (!q) return list;
    return list.filter((s) => s.toLowerCase().includes(q));
  });

  protected readonly rows = signal<EvaluatorRow[]>([]);
  protected readonly totalRecord = signal(0);
  protected readonly loading = signal(false);
  protected readonly error = signal('');

  protected filters: EvaluatorFilters = {
    status: 'pending',
    uniqueId: '',
    name: '',
    contactNo: '',
    adharNo: '',
    subject: ''
  };

  ngOnInit(): void {
    this.loadSubjects(this.filters.status);
    this.search();
  }

  protected onStatusChange(status: string): void {
    this.filters.status = status;
    this.filters.subject = '';
    this.subjectQuery.set('');
    this.subjectOpen.set(false);
    this.loadSubjects(status);
  }

  private loadSubjects(status: string): void {
    const params = new HttpParams().set('status', status || 'pending');
    this.http
      .get<{ subjects: string[] }>(`${environment.apiUrl}/dashboard/exam-evaluators/subjects`, { params })
      .subscribe({
        next: (res) => this.subjects.set(res.subjects ?? []),
        error: () => this.subjects.set([])
      });
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    const target = event.target as Node | null;
    if (!target || !this.host.nativeElement.contains(target)) {
      this.closeSubjectDropdown(true);
      return;
    }
    const combo = this.host.nativeElement.querySelector('.combo');
    if (combo && !combo.contains(target)) {
      this.closeSubjectDropdown(true);
    }
  }

  protected openSubjectDropdown(): void {
    this.subjectOpen.set(true);
    this.subjectHighlight.set(-1);
  }

  protected onSubjectQueryInput(value: string): void {
    this.subjectQuery.set(value);
    // Keep selection if the typed text still matches the chosen subject.
    if (value.trim().toLowerCase() !== (this.filters.subject || '').trim().toLowerCase()) {
      this.filters.subject = '';
    }
    this.subjectOpen.set(true);
    this.subjectHighlight.set(0);
  }

  protected selectSubject(subject: string): void {
    this.filters.subject = subject;
    this.subjectQuery.set(subject);
    this.subjectOpen.set(false);
    this.subjectHighlight.set(-1);
    queueMicrotask(() => this.subjectInput()?.nativeElement.focus());
  }

  protected clearSubject(): void {
    this.filters.subject = '';
    this.subjectQuery.set('');
    this.subjectHighlight.set(-1);
    this.subjectOpen.set(true);
    this.subjectInput()?.nativeElement.focus();
  }

  protected onSubjectKeydown(event: KeyboardEvent): void {
    const list = this.filteredSubjects();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.subjectOpen.set(true);
      const next = Math.min(this.subjectHighlight() + 1, list.length - 1);
      this.subjectHighlight.set(next < 0 ? 0 : next);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.subjectHighlight.set(Math.max(this.subjectHighlight() - 1, 0));
      return;
    }
    if (event.key === 'Enter') {
      const idx = this.subjectHighlight();
      if (this.subjectOpen() && idx >= 0 && idx < list.length) {
        event.preventDefault();
        this.selectSubject(list[idx]);
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeSubjectDropdown(true);
    }
  }

  private closeSubjectDropdown(syncQuery: boolean): void {
    this.subjectOpen.set(false);
    this.subjectHighlight.set(-1);
    if (syncQuery) {
      // Keep typed text only if it matches a selected subject; else restore selection.
      this.subjectQuery.set(this.filters.subject || '');
    }
  }

  protected search(): void {
    this.loading.set(true);
    this.error.set('');
    // If user typed an exact subject but didn't click the option, resolve it.
    if (!this.filters.subject.trim() && this.subjectQuery().trim()) {
      const q = this.subjectQuery().trim().toLowerCase();
      const match = this.subjects().find((s) => s.toLowerCase() === q);
      if (match) {
        this.filters.subject = match;
        this.subjectQuery.set(match);
      }
    }
    this.closeSubjectDropdown(true);
    const f = this.filters;
    let params = new HttpParams().set('status', f.status || 'pending');
    if (f.uniqueId.trim()) params = params.set('uniqueId', f.uniqueId.trim());
    if (f.name.trim()) params = params.set('name', f.name.trim());
    if (f.contactNo.trim()) params = params.set('contactNo', f.contactNo.trim());
    if (f.adharNo.trim()) params = params.set('adharNo', f.adharNo.trim());
    if (f.subject.trim()) params = params.set('subject', f.subject.trim());

    this.http.get<EvaluatorListResponse>(`${environment.apiUrl}/dashboard/exam-evaluators`, { params }).subscribe({
      next: (res) => {
        this.rows.set(res.rows ?? []);
        this.totalRecord.set(res.totalRecord ?? 0);
        this.loading.set(false);
      },
      error: () => {
        this.rows.set([]);
        this.totalRecord.set(0);
        this.loading.set(false);
        this.error.set('Could not load evaluator list.');
      }
    });
  }

  protected clearFilters(): void {
    this.filters = {
      status: 'pending',
      uniqueId: '',
      name: '',
      contactNo: '',
      adharNo: '',
      subject: ''
    };
    this.subjectQuery.set('');
    this.subjectOpen.set(false);
    this.subjectHighlight.set(-1);
    this.loadSubjects('pending');
    this.search();
  }

  protected exportExcel(): void {
    const list = this.rows();
    if (!list.length) {
      this.error.set('No rows to export.');
      return;
    }
    const headers = [
      'S.No.',
      'Unique Id',
      'Name',
      'Designation',
      'Institute Name',
      'Subject',
      'Teaching Experience UG/PG',
      'Specialization',
      'Contact No./Alternate No.',
      'EmailId',
      'Pan No./Adhar No.',
      'Status'
    ];
    const lines = [
      headers.join(','),
      ...list.map((r) =>
        [
          r.sNo,
          csv(r.formUniqueId),
          csv(r.name),
          csv(r.designation),
          csv(r.instituteName),
          csv(r.subject),
          csv(r.teachingExperience),
          csv(r.specialization),
          csv(r.contactDisplay),
          csv(r.emailId),
          csv(r.panAdharDisplay),
          csv(r.status)
        ].join(',')
      )
    ];
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `exam-evaluator-list-${this.filters.status}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  protected printRow(row: EvaluatorRow): void {
    const id = row.formUniqueId?.trim();
    if (!id) {
      this.error.set('Unique Id missing for print.');
      return;
    }
    this.error.set('');
    this.http
      .get<EvaluatorPrintDetail>(
        `${environment.apiUrl}/dashboard/exam-evaluators/${encodeURIComponent(id)}/print`
      )
      .subscribe({
        next: (detail) => printHtml(buildTeacherRegistrationHtml(detail), true),
        error: () => {
          this.error.set('Could not load print details.');
        }
      });
  }

  protected printAll(): void {
    const list = this.rows();
    if (!list.length) {
      this.error.set('No rows to print.');
      return;
    }
    printHtml(buildListPrintHtml(list, this.filters.status));
  }

  protected hasFile(file: EvaluatorFile | null | undefined): boolean {
    return !!file?.path;
  }
}

function csv(value: unknown): string {
  const s = value == null ? '' : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function printHtml(html: string, waitForImages = false): void {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);
  const win = iframe.contentWindow;
  const doc = win?.document;
  if (!win || !doc) {
    iframe.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  const cleanup = () => setTimeout(() => iframe.remove(), 500);
  win.addEventListener('afterprint', cleanup, { once: true });

  let printed = false;
  const doPrint = () => {
    if (printed) return;
    printed = true;
    win.focus();
    win.print();
    setTimeout(cleanup, 2500);
  };

  if (!waitForImages) {
    setTimeout(doPrint, 300);
    return;
  }

  const images = Array.from(doc.images);
  if (!images.length) {
    setTimeout(doPrint, 300);
    return;
  }
  let pending = images.length;
  const done = () => {
    pending -= 1;
    if (pending <= 0) setTimeout(doPrint, 200);
  };
  images.forEach((img) => {
    if (img.complete) done();
    else {
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
    }
  });
  setTimeout(doPrint, 4000);
}

function val(value: unknown): string {
  const s = displayOrBlank(value);
  return s ? esc(s) : '&nbsp;';
}

function displayOrBlank(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value).trim();
  return !s || s.toUpperCase() === 'NULL' ? '' : s;
}

function field(label: string, value: unknown): string {
  return `<div class="field"><span class="lbl">${esc(label)}:</span><span class="v">${val(value)}</span></div>`;
}

function buildTeacherRegistrationHtml(d: EvaluatorPrintDetail): string {
  const logo = 'https://vbspuresult.org.in/WebAssets/img/logo.png';
  const photo = d.photoUrl
    ? `<img class="photo" src="${esc(d.photoUrl)}" alt="Photo" />`
    : `<div class="photo photo--empty">Photo</div>`;
  const sign = d.signUrl
    ? `<img class="sign" src="${esc(d.signUrl)}" alt="Signature" />`
    : `<div class="sign sign--empty"></div>`;
  const aadharAtt =
    d.aadharFile?.url && d.aadharFile.isImage
      ? `<img class="aadhar-img" src="${esc(d.aadharFile.url)}" alt="Aadhar" />`
      : d.aadharFile?.url
        ? `<p class="aadhar-note">Aadhar document on file (${esc(d.aadharFile.name)}).</p>`
        : `<p class="aadhar-note">Aadhar attachment not available.</p>`;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Teacher Registration – ${esc(d.formUniqueId)}</title>
  <style>
    @page { size: A4; margin: 8mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; height: 100%; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 12.5px; }
    .sheet {
      width: 100%;
      max-width: 194mm;
      margin: 0 auto;
      min-height: 277mm;
      display: flex;
      flex-direction: column;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .sheet__main { flex: 1 1 auto; }
    .sheet__footer {
      flex: 0 0 auto;
      margin-top: auto;
      padding-top: 4px;
      border-top: 1px solid #222;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .header { display: grid; grid-template-columns: 58px 1fr; gap: 8px; align-items: center; margin-bottom: 4px; }
    .header img.logo { width: 56px; height: 56px; object-fit: contain; }
    .header h1 { margin: 0; font-size: 15px; text-align: center; letter-spacing: .2px; }
    .header h2 { margin: 2px 0 0; font-size: 12.5px; font-weight: 600; text-align: center; }
    .title { text-align: center; font-size: 14.5px; font-weight: 700; margin: 3px 0 7px; text-decoration: underline; }
    .box { border: 1px solid #222; margin-bottom: 6px; }
    .box__head { background: #d9d9d9; border-bottom: 1px solid #222; padding: 3px 7px; font-weight: 700; text-align: center; font-size: 12.5px; }
    .box__body { padding: 6px 7px; }
    .cols { display: grid; grid-template-columns: 1.35fr 1fr; gap: 8px; }
    .field { display: grid; grid-template-columns: 138px 1fr; gap: 4px; margin-bottom: 3px; align-items: start; }
    .field .lbl { font-weight: 700; line-height: 1.3; font-size: 12.5px; }
    .field .v { border-bottom: 1px dotted #666; min-height: 14px; padding-bottom: 0; word-break: break-word; line-height: 1.3; font-size: 12.5px; }
    .photo-wrap { display: flex; justify-content: flex-end; margin-bottom: 4px; }
    .photo { width: 92px; height: 110px; object-fit: cover; border: 1px solid #222; background: #f5f5f5; }
    .photo--empty { display: flex; align-items: center; justify-content: center; color: #888; font-size: 11px; }
    .sign { max-width: 130px; max-height: 32px; object-fit: contain; display: block; margin-top: 2px; }
    .sign--empty { width: 130px; height: 24px; border-bottom: 1px solid #222; }
    .cert { margin: 5px 0 0; font-size: 11.5px; }
    .principal { margin-top: 8px; display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 11.5px; }
    .forward { border: 1px solid #222; padding: 6px 7px; margin-bottom: 0; }
    .forward h3 { margin: 0 0 4px; font-size: 12.5px; text-align: center; text-decoration: underline; }
    .forward__foot { display: flex; justify-content: space-between; margin-top: 14px; font-size: 11.5px; }
    .attach-title { font-weight: 700; margin: 0 0 3px; font-size: 12.5px; }
    .aadhar-img {
      max-width: 100%;
      max-height: 88px;
      width: auto;
      height: auto;
      object-fit: contain;
      object-position: left top;
      border: 1px solid #bbb;
      display: block;
    }
    .aadhar-note { margin: 0; color: #444; font-size: 11.5px; }
    @media print {
      html, body { height: auto; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .box__head { background: #d9d9d9 !important; }
      .sheet { min-height: 0; height: auto; max-height: 277mm; overflow: hidden; }
      .sheet__footer { page-break-before: avoid; break-before: avoid; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="sheet__main">
      <div class="header">
        <img class="logo" src="${logo}" alt="VBSPU" onerror="this.style.visibility='hidden'"/>
        <div>
          <h1>VEER BAHADUR SINGH PURVANCHAL UNIVERSITY, JAUNPUR</h1>
          <h2>वीर बहादुर सिंह पूर्वांचल विश्वविद्यालय, जौनपुर</h2>
        </div>
      </div>
      <div class="title">TEACHER REGISTRATION</div>

      <div class="box">
        <div class="box__head">Personal Details</div>
        <div class="box__body cols">
          <div>
            ${field('Registration No.', d.formUniqueId)}
            ${field('Registration Type', d.registrationType)}
            ${field('Name', d.name)}
            ${field('Gender', d.gender)}
            ${field("Date of Birth", d.dateOfBirth)}
            ${field("Father's Name", d.fatherName)}
            ${field('Residential Address', d.residentialAddress)}
            ${field('Mobile No', d.mobileNo)}
            ${field('Email ID', d.emailId)}
            <div class="field"><span class="lbl">Signature:</span><span class="v">${sign}</span></div>
          </div>
          <div>
            <div class="photo-wrap">${photo}</div>
            ${field('Aadhar Card No', d.aadharNo)}
            ${field('PAN No', d.panNo)}
            ${field('Bank Name', d.bankName)}
            ${field('Bank Account No', d.bankAccountNo)}
            ${field('IFSC Code', d.ifscCode)}
          </div>
        </div>
      </div>

      <div class="box">
        <div class="box__head">Institutional Details</div>
        <div class="box__body cols">
          <div>
            ${field('Associated with VBSPU, Jaunpur', d.affiliatedToVbspu)}
            ${field('Name of the University', d.universityName)}
            ${field('Name of College (District)', d.collegeName)}
            ${field('Nature of College', d.natureOfCollege)}
            ${field('Post Held', d.postHeld)}
            ${field('Nature of Appointment', d.natureOfAppointment)}
            ${field('Date Of Joining', d.dateOfJoining)}
            ${field('Approval from University (Date)', d.approvalDate)}
          </div>
          <div>
            ${field('Name of Faculty', d.facultyName)}
            ${field('Name of Department', d.departmentName || d.subject)}
            ${field('Specialization 1', d.specialization1)}
            ${field('Specialization 2', d.specialization2)}
            ${field('Specialization 3', d.specialization3)}
            ${field('Teaching Exp. UG (years)', d.teachingExpUg ?? 0)}
            ${field('Teaching Exp. PG (years)', d.teachingExpPg ?? 0)}
            <p class="cert">The above information are certified as per College records.</p>
            <div class="principal">
              <div>( Principal )<br/>Name :<br/>Signature :</div>
              <div></div>
            </div>
          </div>
        </div>
      </div>

      <div class="forward">
        <h3>Forwarding Note of Evaluation Coordinator</h3>
        <div>Allocate Teacher ID and issue card.</div>
        <div class="forward__foot">
          <span>(Date and Seal)</span>
          <span>(Evaluation Coordinator)</span>
        </div>
      </div>
    </div>

    <div class="sheet__footer">
      <div class="attach-title">Attachment (copy of Aadhar card):</div>
      ${aadharAtt}
    </div>
  </div>
</body>
</html>`;
}

function buildListPrintHtml(rows: EvaluatorRow[], status: string): string {
  const body = rows
    .map(
      (r) => `<tr>
      <td>${r.sNo}</td><td>${esc(r.formUniqueId)}</td><td>${esc(r.name)}</td>
      <td>${esc(r.designation)}</td><td>${esc(r.instituteName)}</td><td>${esc(r.subject)}</td>
      <td>${esc(r.teachingExperience)}</td><td>${esc(r.specialization)}</td>
      <td>${esc(r.contactDisplay)}</td><td>${esc(r.emailId)}</td><td>${esc(r.panAdharDisplay)}</td>
      <td>${esc(r.status)}</td>
    </tr>`
    )
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"/><title>Exam Evaluator List</title>
  <style>body{font-family:Arial,sans-serif;padding:16px;font-size:11px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #333;padding:4px;text-align:left}th{background:#1f4b7a;color:#fff}</style>
  </head><body>
  <h2>Exam Evaluator List (${esc(status)})</h2>
  <table>
    <thead><tr>
      <th>S.No.</th><th>Unique Id</th><th>Name</th><th>Designation</th><th>Institute Name</th>
      <th>Subject</th><th>Exp UG/PG</th><th>Specialization</th><th>Contact</th><th>Email</th><th>Pan/Aadhar</th><th>Status</th>
    </tr></thead>
    <tbody>${body}</tbody>
  </table>
  </body></html>`;
}
