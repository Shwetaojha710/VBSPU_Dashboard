import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { StatDetailComponent } from '../../components/stat-detail/stat-detail.component';
import { DashboardStore } from '../../data/dashboard-store.service';
import { DASHBOARD_DATA } from '../../data/dashboard.data';

interface SearchEntry {
  label: string;
  path: string;
  context: string;
}

/** Everything the header search can find, each with the page it opens. */
const SEARCH_INDEX: SearchEntry[] = [
  ...DASHBOARD_DATA.navigation.map((n) => ({ label: n.label, path: n.path, context: 'Section' })),
  ...DASHBOARD_DATA.stats.map((s) => ({ label: s.title, path: s.link ?? '', context: 'Key metric' })),
  ...DASHBOARD_DATA.screen2.quickAccess.items.map((q) => ({ label: q.label, path: q.link, context: 'Quick access' })),
  ...DASHBOARD_DATA.screen2.aiInsights.items.map((i) => ({ label: i.title, path: i.link ?? '', context: 'AI insight' })),
  ...DASHBOARD_DATA.header.actions.map((a) => ({ label: a.label, path: a.path, context: 'Header' }))
];

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

  protected readonly results = computed(() => {
    const q = this.query().toLowerCase();
    return q ? SEARCH_INDEX.filter((e) => e.label.toLowerCase().includes(q)) : [];
  });
}
