import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { StatDetailComponent } from '../../components/stat-detail/stat-detail.component';
import { DashboardStore } from '../../data/dashboard-store.service';
import { DASHBOARD_DATA } from '../../data/dashboard.data';
import { matchSearchEntries } from '../../data/search-index';

/**
 * Section pages: the database breakdown for sections that a stat card links to, a placeholder
 * for sections that have no design yet, and the search results page.
 */
@Component({
  selector: 'app-section',
  imports: [RouterLink, StatDetailComponent],
  templateUrl: './section.component.html',
  styleUrl: './section.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SectionComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly store = inject(DashboardStore);

  protected readonly path = toSignal(this.route.paramMap.pipe(map((p) => p.get('section') ?? '')), {
    initialValue: ''
  });

  protected readonly query = toSignal(this.route.queryParamMap.pipe(map((p) => (p.get('q') ?? '').trim())), {
    initialValue: ''
  });

  protected readonly item = computed(() =>
    [...DASHBOARD_DATA.navigation, ...DASHBOARD_DATA.header.user.menu, ...DASHBOARD_DATA.header.actions].find(
      (n) => n.path === this.path()
    )
  );

  /** Stat card (with live figures) whose link opens this section, if any. */
  protected readonly metric = computed(() => this.store.data().stats.find((c) => c.link === this.path()));

  protected readonly results = computed(() => matchSearchEntries(this.query(), 40));
}
