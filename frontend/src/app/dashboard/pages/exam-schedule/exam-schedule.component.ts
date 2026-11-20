import { HttpClient, HttpParams } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
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
  protected readonly selectedDate = signal('');
  protected readonly level = signal<'all' | 'ug' | 'pg'>('all');
  protected readonly rows = signal<ScheduleRow[]>([]);
  protected readonly totalRecord = signal(0);
  protected readonly ugCount = signal(0);
  protected readonly pgCount = signal(0);
  protected readonly loadingDates = signal(true);
  protected readonly loading = signal(false);
  protected readonly error = signal('');

  ngOnInit(): void {
    this.http.get<{ dates: string[] }>(`${environment.apiUrl}/dashboard/exam-schedule/dates`).subscribe({
      next: (res) => {
        const list = [...(res.dates ?? [])].sort();
        this.dates.set(list);
        this.loadingDates.set(false);
        if (!list.length) return;
        const today = localIsoDate();
        const upcoming = list.find((d) => d >= today);
        const initial = list.includes(today) ? today : upcoming ?? list[list.length - 1];
        this.selectedDate.set(initial);
        this.loadSchedule();
      },
      error: () => {
        this.loadingDates.set(false);
        this.error.set('Could not load exam dates.');
      }
    });
  }

  protected onDateChange(value: string): void {
    this.selectedDate.set(value);
    this.loadSchedule();
  }

  protected onLevelChange(value: 'all' | 'ug' | 'pg'): void {
    this.level.set(value);
    this.loadSchedule();
  }

  protected loadSchedule(): void {
    const date = this.selectedDate();
    if (!date) {
      this.rows.set([]);
      this.totalRecord.set(0);
      this.ugCount.set(0);
      this.pgCount.set(0);
      return;
    }
    this.loading.set(true);
    this.error.set('');
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
}

function localIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
