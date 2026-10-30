import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CollegeCoursesComponent } from '../../components/college-courses/college-courses.component';
import { PagerComponent } from '../../components/pager/pager.component';
import { ExamStatusStore } from '../../data/exam-status.service';
import { ExamStatusReason } from '../../dashboard.models';

type Filter = 'all' | 'online' | 'pending' | ExamStatusReason;

const indian = new Intl.NumberFormat('en-IN');


/** College-wise exam status: who appeared, and which colleges are online or still pending (and why). */
@Component({
  selector: 'app-exam-status',
  imports: [RouterLink, PagerComponent, CollegeCoursesComponent],
  templateUrl: './exam-status.component.html',
  styleUrl: './exam-status.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExamStatusComponent {
  private readonly store = inject(ExamStatusStore);

  protected readonly status = this.store.status;
  protected readonly error = this.store.error;
  protected readonly courseSummary = this.store.courseSummary;
  /** College whose course-wise status is expanded. */
  protected readonly openCode = signal<string | null>(null);
  protected readonly filter = signal<Filter>('all');
  protected readonly query = signal('');
  protected readonly pageSize = signal(25);
  /** Zero-based page index. */
  protected readonly page = signal(0);

  constructor() {
    // A new filter or search starts again from the first page.
    effect(() => {
      this.filter();
      this.query();
      untracked(() => this.page.set(0));
    });
  }

  protected readonly reasonLabels = computed(
    () => new Map((this.status()?.reasons ?? []).map((r) => [r.key, r.label] as const))
  );

  protected readonly filters = computed(() => {
    const s = this.status();
    if (!s) {
      return [];
    }
    return [
      { key: 'all' as Filter, label: 'All', count: s.totals.colleges },
      { key: 'online' as Filter, label: 'Online', count: s.totals.online },
      { key: 'pending' as Filter, label: 'Pending', count: s.totals.pending },
      ...s.reasons.map((r) => ({ key: r.key as Filter, label: r.label, count: r.colleges }))
    ];
  });

  protected readonly rows = computed(() => {
    const s = this.status();
    if (!s) {
      return [];
    }
    const f = this.filter();
    const q = this.query().trim().toLowerCase();
    return s.colleges.filter(
      (c) =>
        (f === 'all' || c.status === f || c.reasons.includes(f as ExamStatusReason)) &&
        (!q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q))
    );
  });

  protected readonly pageRows = computed(() => {
    const start = this.page() * this.pageSize();
    return this.rows().slice(start, start + this.pageSize());
  });

  /** "Showing 26–50 of 585" figures. */
  protected readonly range = computed(() => {
    const total = this.rows().length;
    const from = total ? this.page() * this.pageSize() + 1 : 0;
    return { from, to: Math.min(total, from + this.pageSize() - 1), total };
  });

  protected coursesFor(code: string) {
    return this.store.coursesFor(code);
  }

  protected toggle(code: string): void {
    this.openCode.update((open) => (open === code ? null : code));
  }

  protected format(n: number): string {
    return indian.format(n);
  }
}
