import { DecimalPipe } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { IconComponent } from '../../components/icon/icon.component';

interface ScheduleRow {
  sNo: number;
  level: 'UG' | 'PG' | string;
  source: string;
  dayNo: number | null;
  examDate: string;
  course: string | null;
  subject: string | null;
  paperId: string | null;
  paperName: string | null;
  meeting: string | null;
  timing: string | null;
  meetingName: string | null;
  session?: string | null;
  totalStudents?: number;
}

interface ScheduleResponse {
  date: string;
  level: string;
  totalRecord: number;
  ugCount: number;
  pgCount: number;
  totalStudents?: number;
  rows: ScheduleRow[];
}

/** Exam Schedule — Ug1/UG3/UG5/PG1/Pg5 UNION ALL with exam-date + UG/PG filters. */
@Component({
  selector: 'app-exam-schedule',
  imports: [RouterLink, FormsModule, DecimalPipe, IconComponent],
  templateUrl: './exam-schedule.component.html',
  styleUrl: './exam-schedule.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExamScheduleComponent implements OnInit {
  private readonly http = inject(HttpClient);

  protected readonly dates = signal<string[]>([]);
  protected readonly selectedDate = signal('all');
  protected readonly level = signal<'all' | 'ug' | 'pg'>('all');
  protected readonly selectedSubject = signal('all');
  protected readonly rows = signal<ScheduleRow[]>([]);
  protected readonly searchQuery = signal('');
  protected readonly totalRecord = signal(0);
  protected readonly ugCount = signal(0);
  protected readonly pgCount = signal(0);
  protected readonly downloadingAll = signal(false);
  protected readonly downloadingSubjectWise = signal(false);
  protected readonly loadingDates = signal(true);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly page = signal(1);
  protected readonly pageSize = 40;

  protected readonly busy = computed(
    () => this.loading() || this.loadingDates() || this.downloadingAll() || this.downloadingSubjectWise()
  );

  protected readonly subjects = computed(() => {
    const set = new Set<string>();
    for (const r of this.rows()) {
      const s = (r.subject ?? '').trim();
      if (s) set.add(s);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  });

  protected readonly filteredRows = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const subject = this.selectedSubject().trim().toLowerCase();
    let list = this.rows();
    if (subject && subject !== 'all') {
      list = list.filter((r) => (r.subject ?? '').trim().toLowerCase() === subject);
    }
    if (!q) return list;
    return list.filter((r) => rowMatchesQuery(r, q));
  });

  protected readonly visibleTotal = computed(() => this.filteredRows().length);
  protected readonly visibleUg = computed(() => this.filteredRows().filter((r) => r.level === 'UG').length);
  protected readonly visiblePg = computed(() => this.filteredRows().filter((r) => r.level === 'PG').length);
  protected readonly visibleStudents = computed(() =>
    this.filteredRows().reduce((sum, r) => sum + (Number(r.totalStudents) || 0), 0)
  );

  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filteredRows().length / this.pageSize)));

  protected readonly pagedRows = computed(() => {
    const start = (this.page() - 1) * this.pageSize;
    return this.filteredRows().slice(start, start + this.pageSize);
  });

  ngOnInit(): void {
    this.http.get<{ dates: string[] }>(`${environment.apiUrl}/dashboard/exam-schedule/dates`).subscribe({
      next: (res) => {
        const list = [...(res.dates ?? [])].sort();
        this.dates.set(list);
        this.loadingDates.set(false);
        // Prefer today when available; otherwise keep All.
        const today = localIsoDate();
        if (list.includes(today)) {
          this.selectedDate.set(today);
        } else {
          this.selectedDate.set('all');
        }
        this.loadSchedule();
      },
      error: () => {
        this.loadingDates.set(false);
        this.error.set('Could not load exam dates.');
      }
    });
  }

  protected onDateChange(value: string): void {
    this.selectedDate.set(value || 'all');
    this.page.set(1);
    this.loadSchedule();
  }

  protected onLevelChange(value: 'all' | 'ug' | 'pg'): void {
    this.level.set(value);
    this.page.set(1);
    this.loadSchedule();
  }

  protected onSubjectChange(value: string): void {
    this.selectedSubject.set(value || 'all');
    this.page.set(1);
  }

  protected onSearchChange(value: string): void {
    this.searchQuery.set(value);
    this.page.set(1);
  }

  protected firstPage(): void {
    this.page.set(1);
  }

  protected prevPage(): void {
    this.page.update((p) => Math.max(1, p - 1));
  }

  protected nextPage(): void {
    this.page.update((p) => Math.min(this.totalPages(), p + 1));
  }

  protected lastPage(): void {
    this.page.set(this.totalPages());
  }

  protected clearSearch(): void {
    this.searchQuery.set('');
  }

  protected loadSchedule(): void {
    this.loading.set(true);
    this.error.set('');
    this.page.set(1);
    this.searchQuery.set('');
    this.selectedSubject.set('all');
    const date = this.selectedDate() || 'all';
    const params = new HttpParams().set('date', date).set('level', this.level());
    this.http.get<ScheduleResponse>(`${environment.apiUrl}/dashboard/exam-schedule`, { params }).subscribe({
      next: (res) => {
        this.rows.set(res.rows ?? []);
        this.totalRecord.set(res.totalRecord ?? 0);
        this.ugCount.set(res.ugCount ?? 0);
        this.pgCount.set(res.pgCount ?? 0);
        this.loading.set(false);
      },
      error: () => {
        this.rows.set([]);
        this.totalRecord.set(0);
        this.ugCount.set(0);
        this.pgCount.set(0);
        this.loading.set(false);
        this.error.set('Could not load exam schedule.');
      }
    });
  }

  protected exportExcel(): void {
    const list = this.filteredRows();
    if (!list.length) {
      this.error.set('No rows to export.');
      return;
    }
    const headers = [
      'S.No.',
      'Exam Date',
      'Level',
      'Source',
      'Course',
      'Subject',
      'Paper ID',
      'Total Students',
      'Paper Name',
      'Session',
      'Meeting / Time'
    ];
    const lines = [
      headers.join(','),
      ...list.map((r) =>
        [
          r.sNo,
          csv(r.examDate),
          csv(r.level),
          csv(r.source),
          csv(r.course),
          csv(r.subject),
          csv(r.paperId),
          r.totalStudents ?? 0,
          csv(r.paperName),
          csv(r.session),
          csv(r.meeting || r.timing)
        ].join(',')
      )
    ];
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `exam-schedule-${this.selectedDate() || 'all'}-${this.level()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  protected downloadPdf(): void {
    const list = this.filteredRows();
    if (!list.length) {
      this.error.set('No rows to download as PDF.');
      return;
    }
    this.error.set('');
    printHtml(buildSchedulePrintHtml(list, this.selectedDate(), this.level(), this.selectedSubject()));
  }

  protected downloadSubjectWisePdf(): void {
    if (this.downloadingSubjectWise()) return;
    this.error.set('');
    const level = this.level();
    const subject = this.selectedSubject();
    const query = this.searchQuery().trim().toLowerCase();

    // Already on all-dates view — print filtered rows grouped by subject.
    if (this.selectedDate() === 'all' && !this.loading()) {
      const list = this.filteredRows();
      if (!list.length) {
        this.error.set('No rows to download as PDF.');
        return;
      }
      printHtml(buildSchedulePrintHtml(list, 'all', level, subject, 'subject'));
      return;
    }

    this.downloadingSubjectWise.set(true);
    const params = new HttpParams().set('date', 'all').set('level', level);
    this.http.get<ScheduleResponse>(`${environment.apiUrl}/dashboard/exam-schedule`, { params }).subscribe({
      next: (res) => {
        let list = res.rows ?? [];
        if (subject && subject !== 'all') {
          list = list.filter((r) => (r.subject ?? '').trim().toLowerCase() === subject.trim().toLowerCase());
        }
        if (query) list = list.filter((r) => rowMatchesQuery(r, query));
        this.downloadingSubjectWise.set(false);
        if (!list.length) {
          this.error.set('No rows to download as PDF.');
          return;
        }
        printHtml(buildSchedulePrintHtml(list, 'all', level, subject, 'subject'));
      },
      error: () => {
        this.downloadingSubjectWise.set(false);
        this.error.set('Could not download subject-wise PDF.');
      }
    });
  }

  protected downloadAllDatesPdf(): void {
    if (this.downloadingAll()) return;
    this.error.set('');
    const level = this.level();
    const subject = this.selectedSubject();
    const query = this.searchQuery().trim().toLowerCase();

    if (this.selectedDate() === 'all' && !this.loading()) {
      const list = this.filteredRows();
      if (!list.length) {
        this.error.set('No rows to download as PDF.');
        return;
      }
      printHtml(buildSchedulePrintHtml(list, 'all', level, subject, 'date'));
      return;
    }

    this.downloadingAll.set(true);
    const params = new HttpParams().set('date', 'all').set('level', level);
    this.http.get<ScheduleResponse>(`${environment.apiUrl}/dashboard/exam-schedule`, { params }).subscribe({
      next: (res) => {
        let list = res.rows ?? [];
        if (subject && subject !== 'all') {
          list = list.filter((r) => (r.subject ?? '').trim().toLowerCase() === subject.trim().toLowerCase());
        }
        if (query) list = list.filter((r) => rowMatchesQuery(r, query));
        this.downloadingAll.set(false);
        if (!list.length) {
          this.error.set('No rows to download as PDF.');
          return;
        }
        printHtml(buildSchedulePrintHtml(list, 'all', level, subject, 'date'));
      },
      error: () => {
        this.downloadingAll.set(false);
        this.error.set('Could not download all-dates PDF.');
      }
    });
  }

  protected formatDate(value: string | null | undefined): string {
    return displayDate(value);
  }
}

function rowMatchesQuery(row: ScheduleRow, q: string): boolean {
  const haystack = [
    row.sNo,
    row.examDate,
    row.level,
    row.source,
    row.course,
    row.subject,
    row.paperId,
    row.paperName,
    row.session,
    row.totalStudents,
    row.meeting,
    row.timing,
    row.meetingName
  ]
    .map((v) => String(v ?? '').toLowerCase())
    .join(' ');
  return haystack.includes(q);
}

function localIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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

function printHtml(html: string): void {
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
  setTimeout(() => {
    win.focus();
    win.print();
    setTimeout(cleanup, 2000);
  }, 300);
}

function displayDate(value: string | null | undefined): string {
  if (!value) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return value;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function meetingCell(row: ScheduleRow): string {
  const name = String(row.meetingName || '')
    .replace(/meeting/gi, '')
    .trim();
  const time = String(row.timing || '').trim();
  if (name && time) return `${name} ( ${time} )`;
  return row.meeting || time || '—';
}

function generatedStamp(): string {
  const d = new Date();
  const date = d.toLocaleDateString('en-GB');
  const time = d
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })
    .toLowerCase();
  return `${date}, ${time}`;
}

function paperRowHtml(r: ScheduleRow, index: number, groupBy: 'subject' | 'date'): string {
  const levelClass = String(r.level).toUpperCase() === 'PG' ? 'pg' : 'ug';
  const middle =
    groupBy === 'date'
      ? `<td>${esc(r.subject)}</td><td>${esc(r.course)}</td>`
      : `<td>${esc(displayDate(r.examDate))}</td><td>${esc(r.course)}</td>`;
  return `<tr>
    <td class="sno">${index + 1}</td>
    <td><span class="badge ${levelClass}">${esc(r.level)}</span></td>
    <td>${esc(r.source)}</td>
    ${middle}
    <td>${esc(r.paperId)}</td>
    <td class="num">${Number(r.totalStudents) || 0}</td>
    <td>${esc(r.paperName)}</td>
    <td>${esc(meetingCell(r))}</td>
  </tr>`;
}

function sectionHtml(title: string, list: ScheduleRow[], groupBy: 'subject' | 'date'): string {
  const ugRows = list.filter((r) => r.level === 'UG');
  const pgRows = list.filter((r) => r.level === 'PG');
  const ugStudents = ugRows.reduce((sum, r) => sum + (Number(r.totalStudents) || 0), 0);
  const pgStudents = pgRows.reduce((sum, r) => sum + (Number(r.totalStudents) || 0), 0);
  const body = list.map((r, index) => paperRowHtml(r, index, groupBy)).join('');
  const midHead = groupBy === 'date' ? '<th>Subject</th><th>Course</th>' : '<th>Exam Date</th><th>Course</th>';
  const counts =
    groupBy === 'date'
      ? `UG: ${ugRows.length} papers, ${ugStudents.toLocaleString('en-IN')} students &nbsp;|&nbsp; PG: ${pgRows.length} papers, ${pgStudents.toLocaleString('en-IN')} students`
      : `UG: ${ugRows.length}, PG: ${pgRows.length}, Students: ${(ugStudents + pgStudents).toLocaleString('en-IN')}`;
  return `<section class="subject">
    <h2>${esc(title)} <span>(${counts})</span></h2>
    <table>
      <thead>
        <tr>
          <th>S.No.</th>
          <th>Level</th>
          <th>Source</th>
          ${midHead}
          <th>Paper ID</th>
          <th>Students</th>
          <th>Paper Name</th>
          <th>Meeting / Time</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  </section>`;
}

function buildSchedulePrintHtml(
  rows: ScheduleRow[],
  date: string,
  level: string,
  subject: string,
  groupBy: 'subject' | 'date' = 'subject'
): string {
  const students = rows.reduce((sum, r) => sum + (Number(r.totalStudents) || 0), 0);
  const groups = new Map<string, ScheduleRow[]>();
  for (const row of rows) {
    const key = groupBy === 'date' ? String(row.examDate || '') : (row.subject || '—').trim() || '—';
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }
  const sections = [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, list]) => {
      const sorted = [...list].sort((a, b) => {
        const levelOrder = (String(a.level).toUpperCase() === 'UG' ? 0 : 1) - (String(b.level).toUpperCase() === 'UG' ? 0 : 1);
        if (groupBy === 'date' && levelOrder) return levelOrder;
        const bySubject = String(a.subject || '').localeCompare(String(b.subject || ''));
        if (groupBy === 'date' && bySubject) return bySubject;
        const byDate = String(a.examDate || '').localeCompare(String(b.examDate || ''));
        if (byDate) return byDate;
        return String(a.paperId || '').localeCompare(String(b.paperId || ''));
      });
      const title = groupBy === 'date' ? displayDate(key) : key;
      return sectionHtml(title, sorted, groupBy);
    })
    .join('');

  const dateLabel = date === 'all' ? 'All dates' : displayDate(date);
  const levelLabel = level === 'all' ? 'All' : level.toUpperCase();
  const subjectBit = subject && subject !== 'all' ? ` &nbsp;|&nbsp; Subject: ${esc(subject)}` : '';
  const ugTotal = rows.filter((r) => r.level === 'UG').length;
  const pgTotal = rows.filter((r) => r.level === 'PG').length;
  const splitBit =
    groupBy === 'date' ? ` &nbsp;|&nbsp; UG: <b>${ugTotal}</b> &nbsp;|&nbsp; PG: <b>${pgTotal}</b>` : '';
  const heading =
    groupBy === 'subject' && date === 'all' ? 'Exam Schedule (Subject-wise)' : 'Exam Schedule';
  const layoutBit = groupBy === 'subject' ? ' &nbsp;|&nbsp; Layout: Subject-wise' : ' &nbsp;|&nbsp; Layout: Date-wise';

  return `<!doctype html><html><head><meta charset="utf-8"/>
  <title>${esc(heading)}</title>
  <style>
    @page { size: A4 landscape; margin: 12mm 10mm 14mm;
      @bottom-right { content: "Page " counter(page) " of " counter(pages); font-family: Arial, sans-serif; font-size: 10px; color: #667085; }
    }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #1d2939; margin: 0; font-size: 11px; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
    h1 { margin: 0; color: #1d4f91; font-size: 22px; font-weight: 700; }
    .generated { margin: 4px 0 0; color: #667085; font-size: 11px; white-space: nowrap; }
    .meta { margin: 4px 0 14px; color: #475467; font-size: 12px; }
    .meta b { color: #1d2939; }
    h2 { margin: 16px 0 6px; color: #1d4f91; font-size: 13px; font-weight: 700; letter-spacing: 0.02em; }
    h2 span { font-weight: 700; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #d0d5dd; padding: 4px 6px; vertical-align: middle; }
    th { background: #1e3a5f; color: #fff; font-size: 11px; font-weight: 700; text-align: left; }
    td { font-size: 10.5px; }
    tbody tr:nth-child(even) td { background: #f8fafc; }
    .sno, .num { text-align: right; font-variant-numeric: tabular-nums; }
    .badge { display: inline-block; min-width: 28px; padding: 1px 6px; border-radius: 3px; font-size: 10px; font-weight: 700; text-align: center; }
    .badge.ug { background: #d1fae5; color: #166534; }
    .badge.pg { background: #fde68a; color: #92400e; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style></head><body>
  <header class="head">
    <div>
      <h1>${esc(heading)}</h1>
      <p class="meta">
        ${esc(dateLabel)} &nbsp;|&nbsp; Level: ${esc(levelLabel)}${subjectBit}${layoutBit}
        &nbsp;|&nbsp; Total papers: <b>${rows.length}</b>${splitBit}
        &nbsp;|&nbsp; Total students: <b>${students.toLocaleString('en-IN')}</b>
      </p>
    </div>
    <p class="generated">Generated: ${esc(generatedStamp())}</p>
  </header>
  ${sections || '<p>No papers.</p>'}
  </body></html>`;
}
