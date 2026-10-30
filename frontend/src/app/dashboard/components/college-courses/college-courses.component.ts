import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { CollegeCourses } from '../../dashboard.models';
import { PagerComponent } from '../pager/pager.component';

type Filter = 'all' | 'pending' | 'online';

/** How one step (theory, practical, internal, result) of a course looks in the table. */
interface Step {
  text: string;
  percent: number;
  state: 'done' | 'short' | 'na';
  /** Full sentence for screen readers and the hover tooltip. */
  label: string;
}

const indian = new Intl.NumberFormat('en-IN');

/** Course-wise exam status of one college, shown when its row is expanded on the Exam Status page. */
@Component({
  selector: 'app-college-courses',
  imports: [PagerComponent],
  templateUrl: './college-courses.component.html',
  styleUrl: './college-courses.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CollegeCoursesComponent {
  private readonly http = inject(HttpClient);

  readonly code = input.required<string>();
  readonly name = input('');

  protected readonly data = signal<CollegeCourses | null>(null);
  protected readonly error = signal(false);
  protected readonly filter = signal<Filter>('all');
  protected readonly query = signal('');
  protected readonly page = signal(0);
  protected readonly pageSize = signal(10);

  protected readonly counts = computed(() => {
    const all = this.data()?.courses ?? [];
    const online = all.filter((c) => c.status === 'online').length;
    return { all: all.length, online, pending: all.length - online };
  });

  protected readonly filters = computed(() => [
    { key: 'all' as Filter, label: 'All', count: this.counts().all },
    { key: 'pending' as Filter, label: 'Pending', count: this.counts().pending },
    { key: 'online' as Filter, label: 'Online', count: this.counts().online }
  ]);

  protected readonly rows = computed(() => {
    const f = this.filter();
    const q = this.query().trim().toLowerCase();
    return (this.data()?.courses ?? [])
      .filter((c) => (f === 'all' || c.status === f) && (!q || c.course.toLowerCase().includes(q)))
      .map((c) => ({
        ...c,
        steps: [
          this.step('Theory marks', c.theory, c.students),
          this.step('Practical marks', c.practical, c.students),
          this.step('Internal marks', c.internal, c.students),
          this.step('Result declared', c.result, c.students)
        ]
      }));
  });

  protected readonly pageRows = computed(() => {
    const start = this.page() * this.pageSize();
    return this.rows().slice(start, start + this.pageSize());
  });

  protected readonly range = computed(() => {
    const total = this.rows().length;
    const from = total ? this.page() * this.pageSize() + 1 : 0;
    return { from, to: Math.min(total, from + this.pageSize() - 1), total };
  });

  constructor() {
    effect((onCleanup) => {
      const code = this.code();
      untracked(() => {
        this.data.set(null);
        this.error.set(false);
        this.filter.set('all');
        this.query.set('');
      });
      const sub = this.http
        .get<CollegeCourses>(`${environment.apiUrl}/dashboard/course-status/${encodeURIComponent(code)}`)
        .subscribe({
          next: (d) => {
            this.data.set(d);
            // Open on the pending courses when there are any; that is what needs attention.
            if (d.courses.some((c) => c.status === 'pending')) this.filter.set('pending');
          },
          error: () => this.error.set(true)
        });
      onCleanup(() => sub.unsubscribe());
    });

    // A new filter or search starts again from the first page.
    effect(() => {
      this.filter();
      this.query();
      untracked(() => this.page.set(0));
    });
  }

  protected format(n: number): string {
    return indian.format(n);
  }

  private step(name: string, done: number | null, students: number): Step {
    if (done === null) {
      return { text: '—', percent: 0, state: 'na', label: `${name}: not part of this course` };
    }
    const percent = students ? Math.round((done / students) * 100) : 0;
    const share = this.data()?.donePercent ?? 90;
    return {
      text: `${indian.format(done)} / ${indian.format(students)}`,
      percent,
      state: percent >= share ? 'done' : 'short',
      label: `${name}: ${indian.format(done)} of ${indian.format(students)} students (${percent}%)`
    };
  }
}
