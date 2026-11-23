import { HttpClient, HttpParams } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { environment } from '../../../../environments/environment';

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
}

interface ScheduleResponse {
  date: string;
  level: string;
  totalRecord: number;
  ugCount: number;
  pgCount: number;
  rows: ScheduleRow[];
}

/** Exam Schedule — Ug1/UG3/UG5/PG1/Pg5 UNION ALL with exam-date + UG/PG filters. */
@Component({
  selector: 'app-exam-schedule',
  imports: [RouterLink, FormsModule],
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
  protected readonly loadingDates = signal(true);
  protected readonly loading = signal(false);
  protected readonly error = signal('');

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
    const subject = this.selectedSubject();
    let list = this.rows();
    if (subject !== 'all') {
      list = list.filter((r) => (r.subject ?? '').trim() === subject);
    }
    if (!q) return list;
    return list.filter((r) => rowMatchesQuery(r, q));
  });

  protected readonly visibleTotal = computed(() => this.filteredRows().length);
  protected readonly visibleUg = computed(() => this.filteredRows().filter((r) => r.level === 'UG').length);
  protected readonly visiblePg = computed(() => this.filteredRows().filter((r) => r.level === 'PG').length);

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
    this.loadSchedule();
  }

  protected onLevelChange(value: 'all' | 'ug' | 'pg'): void {
    this.level.set(value);
    this.loadSchedule();
  }

  protected onSubjectChange(value: string): void {
    this.selectedSubject.set(value || 'all');
  }

  protected onSearchChange(value: string): void {
    this.searchQuery.set(value);
  }

  protected clearSearch(): void {
    this.searchQuery.set('');
  }

  protected loadSchedule(): void {
    this.loading.set(true);
    this.error.set('');
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
      'Paper Name',
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
          csv(r.paperName),
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
    printHtml(buildSchedulePrintHtml(list, this.selectedDate(), this.level()));
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

function buildSchedulePrintHtml(rows: ScheduleRow[], date: string, level: string): string {
  const body = rows
    .map(
      (r) => `<tr>
      <td>${r.sNo}</td>
      <td>${esc(r.examDate)}</td>
      <td>${esc(r.level)}</td>
      <td>${esc(r.source)}</td>
      <td>${esc(r.course)}</td>
      <td>${esc(r.subject)}</td>
      <td>${esc(r.paperId)}</td>
      <td>${esc(r.paperName)}</td>
      <td>${esc(r.meeting || r.timing)}</td>
    </tr>`
    )
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"/>
  <title>Exam Schedule</title>
  <style>
    body{font-family:Arial,sans-serif;padding:16px;font-size:11px;color:#111}
    h1{margin:0 0 4px;font-size:18px}
    .meta{margin:0 0 12px;color:#444}
    table{border-collapse:collapse;width:100%}
    th,td{border:1px solid #333;padding:5px 6px;text-align:left;vertical-align:top}
    th{background:#1f4b7a;color:#fff}
    @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style></head><body>
  <h1>Exam Schedule</h1>
  <p class="meta">Date: ${esc(date === 'all' ? 'All' : date)} · Level: ${esc(level.toUpperCase())} · Total: ${rows.length}</p>
  <table>
    <thead><tr>
      <th>S.No.</th><th>Exam Date</th><th>Level</th><th>Source</th><th>Course</th>
      <th>Subject</th><th>Paper ID</th><th>Paper Name</th><th>Meeting / Time</th>
    </tr></thead>
    <tbody>${body}</tbody>
  </table>
  </body></html>`;
}
