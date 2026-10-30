import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { StatCard, StatDetail } from '../../dashboard.models';

const indian = new Intl.NumberFormat('en-IN');

/** Database breakdown behind a stat card, shown on the card's section page. */
@Component({
  selector: 'app-stat-detail',
  templateUrl: './stat-detail.component.html',
  styleUrl: './stat-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StatDetailComponent {
  private readonly http = inject(HttpClient);

  readonly card = input.required<StatCard>();

  protected readonly detail = signal<StatDetail | null>(null);
  protected readonly state = signal<'loading' | 'ready' | 'error' | 'unavailable'>('loading');

  constructor() {
    effect((onCleanup) => {
      const key = this.card().key;
      this.detail.set(null);
      if (!key) {
        this.state.set('unavailable');
        return;
      }
      this.state.set('loading');
      const sub = this.http.get<StatDetail>(`${environment.apiUrl}/dashboard/details/${key}`).subscribe({
        next: (d) => {
          this.detail.set(d);
          this.state.set('ready');
        },
        error: () => this.state.set('error')
      });
      onCleanup(() => sub.unsubscribe());
    });
  }

  /** Counts and percentages are right-aligned. */
  protected isNumeric(cell: string | number | undefined): boolean {
    return typeof cell === 'number' || (typeof cell === 'string' && /^(\d+(\.\d+)?%|–)$/.test(cell));
  }

  protected format(cell: string | number): string {
    return typeof cell === 'number' ? indian.format(cell) : cell;
  }
}
