import { DecimalPipe } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { environment } from '../../../../environments/environment';

interface SummaryCards {
  totalAttendance: number;
  totalPresent: number;
  totalAbsent: number;
  totalVerified: number;
  totalDeclined: number;
  totalColleges: number;
  totalCentres: number;
  totalPapers: number;
}

interface UserWiseRow {
  sNo: number;
  userId: number | null;
  userName: string | null;
  verified: number;
  declined: number;
  total: number;
  present: number;
  lastActionDate: string | null;
}

interface VerificationRow {
  sNo: number;
  rollNo: string | null;
  studentName: string | null;
  semNo: number | null;
  course: string | null;
  subject: string | null;
  paperCode: string | null;
  paperName: string | null;
  examDate: string | null;
  attendance: string | null;
  verifyStatus: string | null;
  actionBy: string | null;
  actionDate: string | null;
  declineReason: string | null;
}

interface ReportResponse {
  sessionId?: number;
  summary: SummaryCards;
  userWise?: UserWiseRow[];
  totalRecord: number;
  rows: VerificationRow[];
  listSkipped?: boolean;
  message?: string;
}

const emptySummary = (): SummaryCards => ({
  totalAttendance: 0,
  totalPresent: 0,
  totalAbsent: 0,
  totalVerified: 0,
  totalDeclined: 0,
  totalColleges: 0,
  totalCentres: 0,
  totalPapers: 0
});

/** Attendance Verification Summary — portal VerifiedAttendanceSummary (live DB). */
@Component({
  selector: 'app-attendance-verification-summary',
  imports: [RouterLink, FormsModule, DecimalPipe],
  templateUrl: './attendance-verification-summary.component.html',
  styleUrl: './attendance-verification-summary.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AttendanceVerificationSummaryComponent implements OnInit {
  private readonly http = inject(HttpClient);

  protected readonly examDates = signal<string[]>([]);
  protected readonly verifiedDates = signal<string[]>([]);
  protected readonly rows = signal<VerificationRow[]>([]);
  protected readonly userWise = signal<UserWiseRow[]>([]);
  protected readonly summary = signal<SummaryCards>(emptySummary());
  protected readonly listSkipped = signal(false);
  protected readonly listHint = signal('');
  protected readonly loadingFilters = signal(true);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly searchQuery = signal('');
  protected readonly page = signal(1);
  protected readonly pageSize = 40;

  protected filters = {
    examDate: '',
    verifiedDate: '',
    courseTypeId: 0,
    status: ''
  };

  protected readonly busy = computed(() => this.loading() || this.loadingFilters());

  protected readonly filteredRows = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const list = this.rows();
    if (!q) return list;
    return list.filter((r) => rowMatches(r, q));
  });

  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filteredRows().length / this.pageSize)));

  protected readonly pagedRows = computed(() => {
    const start = (this.page() - 1) * this.pageSize;
    return this.filteredRows().slice(start, start + this.pageSize);
  });

  ngOnInit(): void {
    this.http
      .get<{
        examDates: string[];
        verifiedDates: string[];
        defaultExamDate: string | null;
      }>(`${environment.apiUrl}/dashboard/attendance-verification-summary/filters`)
      .subscribe({
        next: (res) => {
          this.examDates.set(res.examDates ?? []);
          this.verifiedDates.set(res.verifiedDates ?? []);
          // Portal default: All dates — live session totals, not only today.
          this.filters.examDate = '';
          this.loadingFilters.set(false);
          this.search();
        },
        error: () => {
          this.loadingFilters.set(false);
          this.error.set('Could not load filter options.');
        }
      });
  }

  protected onFilterChange(): void {
    this.search();
  }

  protected search(): void {
    this.loading.set(true);
    this.error.set('');
    this.page.set(1);
    this.searchQuery.set('');
    let params = new HttpParams();
    if (this.filters.examDate) params = params.set('examDate', this.filters.examDate);
    if (this.filters.verifiedDate) params = params.set('verifiedDate', this.filters.verifiedDate);
    if (this.filters.courseTypeId) params = params.set('courseTypeId', String(this.filters.courseTypeId));
    if (this.filters.status) params = params.set('status', this.filters.status);

    this.http
      .get<ReportResponse>(`${environment.apiUrl}/dashboard/attendance-verification-summary`, { params })
      .subscribe({
        next: (res) => {
          this.summary.set(res.summary ?? emptySummary());
          this.userWise.set(res.userWise ?? []);
          this.rows.set(res.rows ?? []);
          this.listSkipped.set(Boolean(res.listSkipped));
          this.listHint.set(res.message || '');
          this.loading.set(false);
        },
        error: () => {
          this.rows.set([]);
          this.userWise.set([]);
          this.summary.set(emptySummary());
          this.loading.set(false);
          this.error.set('Could not load attendance verification summary.');
        }
      });
  }

  protected reset(): void {
    this.filters = { examDate: '', verifiedDate: '', courseTypeId: 0, status: '' };
    this.searchQuery.set('');
    this.search();
  }

  protected onSearchChange(value: string): void {
    this.searchQuery.set(value);
    this.page.set(1);
  }

  protected prevPage(): void {
    this.page.update((p) => Math.max(1, p - 1));
  }

  protected nextPage(): void {
    this.page.update((p) => Math.min(this.totalPages(), p + 1));
  }

  protected exportExcel(): void {
    const list = this.filteredRows();
    if (!list.length) {
      this.error.set('No student rows to export. Select a date or status first.');
      return;
    }
    const headers = [
      'S.No.',
      'Roll No',
      'Student Name',
      'Sem',
      'Course',
      'Subject',
      'Paper Code',
      'Paper Name',
      'Exam Date',
      'Attendance',
      'Verify Status',
      'Action By',
      'Action Date',
      'Decline Reason'
    ];
    const lines = [
      headers.join(','),
      ...list.map((r) =>
        [
          r.sNo,
          csv(r.rollNo),
          csv(r.studentName),
          r.semNo ?? '',
          csv(r.course),
          csv(r.subject),
          csv(r.paperCode),
          csv(r.paperName),
          csv(r.examDate),
          csv(r.attendance),
          csv(r.verifyStatus),
          csv(r.actionBy),
          csv(r.actionDate),
          csv(r.declineReason)
        ].join(',')
      )
    ];
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance-verification-summary-${this.filters.examDate || 'all'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  protected formatDate(value: string | null | undefined): string {
    if (!value) return '—';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (!m) return value;
    return `${m[3]}-${m[2]}-${m[1]}`;
  }
}

function csv(value: unknown): string {
  const s = value == null ? '' : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

function rowMatches(row: VerificationRow, q: string): boolean {
  return [
    row.rollNo,
    row.studentName,
    row.semNo,
    row.course,
    row.subject,
    row.paperCode,
    row.paperName,
    row.examDate,
    row.attendance,
    row.verifyStatus,
    row.actionBy,
    row.actionDate,
    row.declineReason
  ]
    .map((v) => String(v ?? '').toLowerCase())
    .join(' ')
    .includes(q);
}
