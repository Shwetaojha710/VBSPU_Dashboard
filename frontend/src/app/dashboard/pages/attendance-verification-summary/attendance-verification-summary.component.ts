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
  page?: number;
  pageSize?: number;
  rows: VerificationRow[];
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
  protected readonly totalRecord = signal(0);
  protected readonly loadingFilters = signal(true);
  protected readonly loading = signal(false);
  protected readonly loadingRows = signal(false);
  protected readonly error = signal('');
  protected readonly searchQuery = signal('');
  protected readonly page = signal(1);
  /** 0 = All (capped at 5,000 server-side). */
  protected readonly pageSize = signal(40);
  protected readonly pageSizeOptions: Array<number | 'all'> = [25, 40, 50, 100, 'all'];
  private static readonly ALL_PAGE_SIZE = 5000;

  protected filters = {
    examDate: '',
    verifiedDate: '',
    courseTypeId: 0,
    status: ''
  };

  protected readonly busy = computed(() => this.loading() || this.loadingFilters());

  protected readonly effectivePageSize = computed(() => {
    const size = this.pageSize();
    if (size === 0) {
      const total = this.totalRecord();
      return Math.min(
        Math.max(total || AttendanceVerificationSummaryComponent.ALL_PAGE_SIZE, 1),
        AttendanceVerificationSummaryComponent.ALL_PAGE_SIZE
      );
    }
    return size;
  });

  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.totalRecord() / this.effectivePageSize()))
  );

  protected readonly pageStart = computed(() => {
    if (!this.totalRecord()) return 0;
    return (Math.min(this.page(), this.totalPages()) - 1) * this.effectivePageSize() + 1;
  });

  protected readonly pageEnd = computed(() =>
    Math.min(this.pageStart() + this.effectivePageSize() - 1, this.totalRecord())
  );

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
    this.page.set(1);
    this.search();
  }

  protected search(): void {
    this.page.set(1);
    this.loadReport(true);
  }

  protected reset(): void {
    this.filters = { examDate: '', verifiedDate: '', courseTypeId: 0, status: '' };
    this.searchQuery.set('');
    this.page.set(1);
    this.search();
  }

  protected onSearchChange(value: string): void {
    this.searchQuery.set(value);
  }

  protected applySearch(): void {
    this.page.set(1);
    this.loadReport(false);
  }

  protected onPageSizeChange(value: number | string): void {
    if (value === 'all' || value === 'All') this.pageSize.set(0);
    else this.pageSize.set(Number(value) || 40);
    this.page.set(1);
    this.loadReport(false);
  }

  protected pageSizeLabel(size: number | 'all'): string {
    return size === 'all' ? 'All' : String(size);
  }

  protected pageSizeSelectValue(): number | 'all' {
    return this.pageSize() === 0 ? 'all' : this.pageSize();
  }

  protected firstPage(): void {
    if (this.page() <= 1) return;
    this.page.set(1);
    this.loadReport(false);
  }

  protected prevPage(): void {
    if (this.page() <= 1) return;
    this.page.update((p) => p - 1);
    this.loadReport(false);
  }

  protected nextPage(): void {
    if (this.page() >= this.totalPages()) return;
    this.page.update((p) => p + 1);
    this.loadReport(false);
  }

  protected lastPage(): void {
    const last = this.totalPages();
    if (this.page() >= last) return;
    this.page.set(last);
    this.loadReport(false);
  }

  protected exportExcel(): void {
    const list = this.rows();
    if (!list.length) {
      this.error.set('No student rows to export on this page.');
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
    a.download = `attendance-verification-summary-${this.filters.examDate || 'all'}-p${this.page()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  protected formatDate(value: string | null | undefined): string {
    if (!value) return '—';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (!m) return value;
    return `${m[3]}-${m[2]}-${m[1]}`;
  }

  private loadReport(fullBusy: boolean): void {
    if (fullBusy) this.loading.set(true);
    else this.loadingRows.set(true);
    this.error.set('');

    const pageSizeParam = this.pageSize() === 0 ? 'all' : String(this.effectivePageSize());
    let params = new HttpParams()
      .set('page', String(this.page()))
      .set('pageSize', pageSizeParam);
    if (this.filters.examDate) params = params.set('examDate', this.filters.examDate);
    if (this.filters.verifiedDate) params = params.set('verifiedDate', this.filters.verifiedDate);
    if (this.filters.courseTypeId) params = params.set('courseTypeId', String(this.filters.courseTypeId));
    if (this.filters.status) params = params.set('status', this.filters.status);
    const q = this.searchQuery().trim();
    if (q) params = params.set('search', q);

    this.http
      .get<ReportResponse>(`${environment.apiUrl}/dashboard/attendance-verification-summary`, { params })
      .subscribe({
        next: (res) => {
          this.summary.set(res.summary ?? emptySummary());
          this.userWise.set(res.userWise ?? []);
          this.rows.set(res.rows ?? []);
          this.totalRecord.set(res.totalRecord ?? 0);
          if (res.page) this.page.set(res.page);
          // Keep local "All" (0); don't overwrite with capped server pageSize.
          if (res.pageSize && this.pageSize() !== 0) this.pageSize.set(res.pageSize);
          this.loading.set(false);
          this.loadingRows.set(false);
        },
        error: () => {
          this.rows.set([]);
          this.userWise.set([]);
          this.summary.set(emptySummary());
          this.totalRecord.set(0);
          this.loading.set(false);
          this.loadingRows.set(false);
          this.error.set('Could not load attendance verification summary.');
        }
      });
  }
}

function csv(value: unknown): string {
  const s = value == null ? '' : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}
