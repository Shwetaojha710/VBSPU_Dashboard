import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { retry } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CourseSummary, ExamStatus } from '../dashboard.models';

/** College-wise exam status, loaded once and shared by the overview card and its page. */
@Injectable({ providedIn: 'root' })
export class ExamStatusStore {
  readonly status = signal<ExamStatus | null>(null);
  readonly error = signal(false);
  /** Online/pending course counts per college (second database); null until loaded. */
  readonly courseSummary = signal<CourseSummary | null>(null);

  constructor() {
    const http = inject(HttpClient);
    // On a server's very first load (nothing cached yet) this can take minutes; keep trying.
    http
      .get<ExamStatus>(`${environment.apiUrl}/dashboard/exam-status`)
      .pipe(retry({ count: 30, delay: 20000 }))
      .subscribe({
        next: (s) => this.status.set(s),
        error: () => this.error.set(true)
      });
    http
      .get<CourseSummary>(`${environment.apiUrl}/dashboard/course-status`)
      .pipe(retry({ count: 30, delay: 20000 }))
      .subscribe({ next: (s) => this.courseSummary.set(s), error: () => undefined });
  }

  /** Course counts for a college code ("029" and "29" both match). */
  coursesFor(code: string): CourseSummary['colleges'][string] | undefined {
    return this.courseSummary()?.colleges[String(Number.parseInt(code, 10))];
  }
}
