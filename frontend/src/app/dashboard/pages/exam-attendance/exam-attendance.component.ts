import { DecimalPipe } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { environment } from '../../../../environments/environment';

interface MeetingOption {
  meetingId: number;
  meetingName: string;
  timing: string;
  courseName: string;
  courseTypeId: number;
  label: string;
}

interface AttendanceRow {
  sNo: number;
  date: string | null;
  meetingId: number | null;
  meeting: string | null;
  centerCode: string | null;
  centreName: string | null;
  managerName: string | null;
  managerMobile: string | null;
  totalStudent: number;
  totalFeed: number;
  totalNotFeed: number;
  status: 'Completed' | 'Partial' | 'Pending' | string;
}

interface AttendanceSummary {
  totalCentres: number;
  completed: number;
  partial: number;
  pending: number;
  totalStudent: number;
  totalFeed: number;
  totalNotFeed: number;
}

interface AttendanceResponse {
  summary: AttendanceSummary;
  totalRecord: number;
  rows: AttendanceRow[];
}

interface AttendanceFilters {
  courseTypeId: number;
  meetingId: number;
  examDate: string;
  centerCode: string;
  status: string;
}

/** Exam Attendance — CentreWiseAttendanceReport with filters, KPIs, table, Excel export. */
@Component({
  selector: 'app-exam-attendance',
  imports: [RouterLink, FormsModule, DecimalPipe],
  templateUrl: './exam-attendance.component.html',
  styleUrl: './exam-attendance.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExamAttendanceComponent implements OnInit {
  private readonly http = inject(HttpClient);

  protected readonly dates = signal<string[]>([]);
  protected readonly meetings = signal<MeetingOption[]>([]);
  protected readonly rows = signal<AttendanceRow[]>([]);
  protected readonly summary = signal<AttendanceSummary>({
    totalCentres: 0,
    completed: 0,
    partial: 0,
    pending: 0,
    totalStudent: 0,
    totalFeed: 0,
    totalNotFeed: 0
  });
  protected readonly loadingMeta = signal(true);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly searchQuery = signal('');
  protected readonly page = signal(1);
  /** 0 = All rows on one page. */
  protected readonly pageSize = signal(25);
  protected readonly pageSizeOptions: Array<number | 'all'> = [25, 50, 100, 'all'];

  protected readonly filteredRows = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const list = this.rows();
    if (!q) return list;
    return list.filter((r) => attendanceRowMatches(r, q));
  });

  protected readonly filteredSummary = computed(() => {
    const list = this.filteredRows();
    return {
      totalCentres: list.length,
      completed: list.filter((r) => r.status === 'Completed').length,
      partial: list.filter((r) => r.status === 'Partial').length,
      pending: list.filter((r) => r.status === 'Pending').length,
      totalStudent: list.reduce((n, r) => n + r.totalStudent, 0),
      totalFeed: list.reduce((n, r) => n + r.totalFeed, 0),
      totalNotFeed: list.reduce((n, r) => n + r.totalNotFeed, 0)
    };
  });

  protected readonly effectivePageSize = computed(() => {
    const size = this.pageSize();
    if (size === 0) return Math.max(this.filteredRows().length, 1);
    return size;
  });

  protected readonly totalPages = computed(() => {
    const total = this.filteredRows().length;
    const size = this.effectivePageSize();
    return total === 0 ? 1 : Math.ceil(total / size);
  });

  protected readonly pagedRows = computed(() => {
    const size = this.effectivePageSize();
    const current = Math.min(this.page(), this.totalPages());
    const start = (current - 1) * size;
    return this.filteredRows().slice(start, start + size);
  });

  protected readonly pageStart = computed(() => {
    if (!this.filteredRows().length) return 0;
    return (Math.min(this.page(), this.totalPages()) - 1) * this.effectivePageSize() + 1;
  });

  protected readonly pageEnd = computed(() => {
    if (!this.filteredRows().length) return 0;
    return Math.min(this.pageStart() + this.effectivePageSize() - 1, this.filteredRows().length);
  });

  protected filters: AttendanceFilters = {
    courseTypeId: 1,
    meetingId: 1,
    examDate: '',
    centerCode: '',
    status: 'all'
  };

  ngOnInit(): void {
    this.http.get<{ dates: string[] }>(`${environment.apiUrl}/dashboard/exam-attendance/dates`).subscribe({
      next: (res) => {
        const list = [...(res.dates ?? [])].sort();
        this.dates.set(list);
        const today = localIsoDate();
        const upcoming = list.find((d) => d >= today);
        this.filters.examDate = list.includes(today) ? today : upcoming ?? list[list.length - 1] ?? '';
        this.loadingMeta.set(false);
        this.loadMeetings(true);
      },
      error: () => {
        this.loadingMeta.set(false);
        this.error.set('Could not load exam dates.');
      }
    });
  }

  protected onCourseTypeChange(value: string | number): void {
    this.filters.courseTypeId = Number(value) || 0;
    this.filters.meetingId = 0;
    this.clearList();
    this.loadMeetings(true);
  }

  protected onExamDateChange(value: string): void {
    this.filters.examDate = value;
    this.clearList();
    this.page.set(1);
    this.loadReport();
  }

  protected onMeetingChange(value: string | number): void {
    this.filters.meetingId = Number(value) || 0;
    this.clearList();
    this.page.set(1);
    this.loadReport();
  }

  protected onStatusChange(value: string): void {
    this.filters.status = value || 'all';
    this.clearList();
    this.page.set(1);
    this.loadReport();
  }

  protected onSearchChange(value: string): void {
    this.searchQuery.set(value);
    this.page.set(1);
  }

  protected clearSearch(): void {
    this.searchQuery.set('');
    this.page.set(1);
  }

  protected search(): void {
    this.page.set(1);
    this.loadReport();
  }

  private clearList(): void {
    this.rows.set([]);
    this.searchQuery.set('');
    this.summary.set({
      totalCentres: 0,
      completed: 0,
      partial: 0,
      pending: 0,
      totalStudent: 0,
      totalFeed: 0,
      totalNotFeed: 0
    });
    this.error.set('');
  }

  protected reset(): void {
    const dates = this.dates();
    const today = localIsoDate();
    const upcoming = dates.find((d) => d >= today);
    this.filters = {
      courseTypeId: 1,
      meetingId: 1,
      examDate: dates.includes(today) ? today : upcoming ?? dates[dates.length - 1] ?? '',
      centerCode: '',
      status: 'all'
    };
    this.page.set(1);
    this.pageSize.set(25);
    this.searchQuery.set('');
    this.loadMeetings(true);
  }

  protected onPageSizeChange(value: string | number): void {
    if (value === 'all' || value === 'All') this.pageSize.set(0);
    else this.pageSize.set(Number(value) || 25);
    this.page.set(1);
  }

  protected pageSizeLabel(size: number | 'all'): string {
    return size === 'all' ? 'All' : String(size);
  }

  protected pageSizeSelectValue(): number | 'all' {
    return this.pageSize() === 0 ? 'all' : this.pageSize();
  }

  protected goToPage(page: number): void {
    const max = this.totalPages();
    const next = Math.max(1, Math.min(page, max));
    this.page.set(next);
  }

  protected firstPage(): void {
    this.goToPage(1);
  }

  protected prevPage(): void {
    this.goToPage(this.page() - 1);
  }

  protected nextPage(): void {
    this.goToPage(this.page() + 1);
  }

  protected lastPage(): void {
    this.goToPage(this.totalPages());
  }

  protected exportExcel(): void {
    const list = this.filteredRows();
    if (!list.length) {
      this.error.set('No rows to export.');
      return;
    }
    const headers = [
      'S.No.',
      'Date',
      'Meeting',
      'Center Code',
      'Center Name',
      'Manager Name',
      'Manager Mobile',
      'Total Student',
      'Total Feed',
      'Total Not Feed',
      'Status'
    ];
    const lines = [
      headers.join(','),
      ...list.map((r) =>
        [
          r.sNo,
          csv(r.date),
          csv(r.meeting),
          csv(r.centerCode),
          csv(r.centreName),
          csv(r.managerName),
          csv(r.managerMobile),
          r.totalStudent,
          r.totalFeed,
          r.totalNotFeed,
          csv(r.status)
        ].join(',')
      )
    ];
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `exam-attendance-${this.filters.examDate || 'all'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  private loadMeetings(thenSearch: boolean): void {
    const params = new HttpParams().set('courseTypeId', String(this.filters.courseTypeId || 0));
    this.http
      .get<{ meetings: MeetingOption[] }>(`${environment.apiUrl}/dashboard/exam-attendance/meetings`, { params })
      .subscribe({
        next: (res) => {
          const list = res.meetings ?? [];
          this.meetings.set(list);
          if (!list.some((m) => m.meetingId === this.filters.meetingId)) {
            this.filters.meetingId = list[0]?.meetingId ?? 0;
          }
          if (thenSearch) this.loadReport();
        },
        error: () => {
          this.meetings.set([]);
          if (thenSearch) this.loadReport();
        }
      });
  }

  private loadReport(): void {
    this.loading.set(true);
    this.error.set('');
    let params = new HttpParams()
      .set('courseTypeId', String(this.filters.courseTypeId || 0))
      .set('meetingId', String(this.filters.meetingId || 0))
      .set('status', this.filters.status || 'all');
    if (this.filters.examDate) params = params.set('examDate', this.filters.examDate);
    if (this.filters.centerCode.trim()) params = params.set('centerCode', this.filters.centerCode.trim());

    this.http.get<AttendanceResponse>(`${environment.apiUrl}/dashboard/exam-attendance`, { params }).subscribe({
      next: (res) => {
        this.rows.set(res.rows ?? []);
        this.searchQuery.set('');
        this.page.set(1);
        this.summary.set(
          res.summary ?? {
            totalCentres: 0,
            completed: 0,
            partial: 0,
            pending: 0,
            totalStudent: 0,
            totalFeed: 0,
            totalNotFeed: 0
          }
        );
        this.loading.set(false);
      },
      error: () => {
        this.rows.set([]);
        this.page.set(1);
        this.summary.set({
          totalCentres: 0,
          completed: 0,
          partial: 0,
          pending: 0,
          totalStudent: 0,
          totalFeed: 0,
          totalNotFeed: 0
        });
        this.loading.set(false);
        this.error.set('Could not load attendance report.');
      }
    });
  }
}

function localIsoDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function csv(value: unknown): string {
  const s = value == null ? '' : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

function attendanceRowMatches(row: AttendanceRow, q: string): boolean {
  const haystack = [
    row.sNo,
    row.date,
    row.meeting,
    row.centerCode,
    row.centreName,
    row.managerName,
    row.managerMobile,
    row.totalStudent,
    row.totalFeed,
    row.totalNotFeed,
    row.status
  ]
    .map((v) => String(v ?? '').toLowerCase())
    .join(' ');
  return haystack.includes(q);
}
