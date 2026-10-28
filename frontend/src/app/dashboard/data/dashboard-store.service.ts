import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { DashboardData, DashboardSummary, StatCard } from '../dashboard.models';
import { DASHBOARD_DATA } from './dashboard.data';

const indian = new Intl.NumberFormat('en-IN');

/** Captions describing what each database-backed figure counts. */
const LIVE_CAPTIONS: Record<keyof DashboardSummary['stats'], (s: DashboardSummary['stats']) => string> = {
  totalStudents: () => 'unique registrations',
  affiliatedColleges: (s) => `in ${s.collegeDistricts} districts`,
  collegeDistricts: () => '',
  facultyAndStaff: () => 'registered evaluators',
  pendingApprovals: () => 'evaluator approvals'
};

/**
 * Dashboard data: the design values from dashboard.data.json, with the figures that
 * exist in the *_vbspu tables replaced by live values from the backend.
 */
@Injectable({ providedIn: 'root' })
export class DashboardStore {
  private readonly http = inject(HttpClient);

  /** Latest summary from the API; null until it loads (or if it fails). */
  readonly summary = signal<DashboardSummary | null>(null);
  readonly error = signal(false);

  readonly data = computed<DashboardData>(() => {
    const live = this.summary();
    return live ? applySummary(DASHBOARD_DATA, live) : DASHBOARD_DATA;
  });

  constructor() {
    this.http.get<DashboardSummary>(`${environment.apiUrl}/dashboard/summary`).subscribe({
      next: (s) => this.summary.set(s),
      error: () => this.error.set(true)
    });
  }
}

function applySummary(base: DashboardData, live: DashboardSummary): DashboardData {
  const stats = base.stats.map((card): StatCard => {
    if (!card.key) {
      return card;
    }
    // Trends are not stored in the database, so live cards show the figure and what it counts.
    return {
      ...card,
      value: indian.format(live.stats[card.key]),
      trend: undefined,
      caption: LIVE_CAPTIONS[card.key](live.stats),
      captionMarker: false
    };
  });

  const countFor = (name: string) =>
    live.collegesByDistrict.find((d) => d.name.toLowerCase() === name.toLowerCase())?.colleges;

  return {
    ...base,
    stats,
    affiliatedColleges: {
      ...base.affiliatedColleges,
      total: live.stats.affiliatedColleges,
      districts: base.affiliatedColleges.districts.map((d) => ({ ...d, count: countFor(d.name) ?? d.count }))
    }
  };
}
