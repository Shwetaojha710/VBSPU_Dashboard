import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { retry } from 'rxjs';
import { environment } from '../../../environments/environment';
import { BarChartData, DashboardData, DashboardSummary, EnrollmentByType, InsightItem, StatCard } from '../dashboard.models';
import { DASHBOARD_DATA } from './dashboard.data';

type StatKey = keyof DashboardSummary['stats'];

const indian = new Intl.NumberFormat('en-IN');

/** Captions for live cards that have no comparison figure in the database. */
const LIVE_CAPTIONS: Partial<Record<StatKey, (s: DashboardSummary['stats']) => string>> = {
  affiliatedColleges: (s) => `in ${s.collegeDistricts} districts`,
  facultyAndStaff: () => 'registered evaluators',
  pendingApprovals: () => 'evaluator approvals',
  activeGrievances: () => 'pending grievances',
  totalStudents: () => 'unique registrations',
  passedStudents: () => 'students passed'
};

/**
 * Dashboard data: the design values from dashboard.data.json, with every figure that
 * exists in the university database replaced by live values from the backend.
 */
@Injectable({ providedIn: 'root' })
export class DashboardStore {
  private readonly http = inject(HttpClient);

  /** Latest summary from the API; null until it loads (or if it fails). */
  readonly summary = signal<DashboardSummary | null>(null);
  readonly error = signal(false);
  /** UG/PG split for the enrollment chart; loaded separately because it takes longer. */
  readonly enrollmentByType = signal<EnrollmentByType | null>(null);

  readonly data = computed<DashboardData>(() => {
    const live = this.summary();
    return live ? applySummary(DASHBOARD_DATA, live, this.enrollmentByType()) : DASHBOARD_DATA;
  });

  constructor() {
    // On a server's very first load (nothing cached yet) this can take minutes; keep trying.
    this.http
      .get<DashboardSummary>(`${environment.apiUrl}/dashboard/summary`)
      .pipe(retry({ count: 30, delay: 20000 }))
      .subscribe({
        next: (s) => this.summary.set(s),
        error: () => this.error.set(true)
      });
    this.http
      .get<EnrollmentByType>(`${environment.apiUrl}/dashboard/enrollment-by-type`)
      .pipe(retry({ count: 30, delay: 20000 }))
      .subscribe({ next: (e) => this.enrollmentByType.set(e), error: () => undefined });
  }
}

function applySummary(base: DashboardData, live: DashboardSummary, byType: EnrollmentByType | null): DashboardData {
  const countFor = (name: string) =>
    live.collegesByDistrict.find((d) => d.name.toLowerCase() === name.toLowerCase())?.colleges;

  // The map shows only the designed districts (Jaunpur, Ghazipur), and its total is their sum.
  const districts = base.affiliatedColleges.districts.map((d) => ({ ...d, count: countFor(d.name) ?? d.count }));

  return {
    ...base,
    stats: base.stats.map((card) => (card.key ? liveCard(card, card.key, live) : card)),
    affiliatedColleges: {
      ...base.affiliatedColleges,
      total: districts.reduce((sum, d) => sum + d.count, 0),
      districts
    },
    charts: {
      ...base.charts,
      enrollment: enrollmentChart(base.charts.enrollment, live, byType),
      examResults: examResultsChart(base.charts.examResults, live),
      grievances: grievanceChart(base.charts.grievances, live)
    },
    screen2: {
      ...base.screen2,
      researchQuality: {
        ...base.screen2.researchQuality,
        scholars: { ...base.screen2.researchQuality.scholars, value: indian.format(live.stats.phdScholars) }
      },
      aiInsights: { ...base.screen2.aiInsights, items: insights(live) }
    },
    screen3: {
      ...base.screen3,
      activity: live.activity.length
        ? {
            ...base.screen3.activity,
            items: live.activity.map((a) => ({ title: a.title, detail: a.detail, time: activityTime(a.at) }))
          }
        : base.screen3.activity
    }
  };
}

/** Rule-based insights from the live figures, in the design's four slots (one-line texts). */
function insights(live: DashboardSummary): InsightItem[] {
  const s = live.stats;
  const years = live.grievancesByYear ?? [];
  const resolved = years.reduce((sum, y) => sum + y.resolved, 0);
  const [prev, cur] = live.passPercentage.slice(-2);
  const passItem: InsightItem =
    prev && cur
      ? {
          title: cur.percent >= prev.percent ? 'Pass Percentage Improved' : 'Pass Percentage Declined',
          text: `Gross pass percentage ${cur.percent >= prev.percent ? 'rose' : 'fell'} from ${prev.percent.toFixed(1)}% (${prev.session}) to ${cur.percent.toFixed(1)}% (${cur.session}).`,
          link: 'exams-certification'
        }
      : { title: 'Exam Results', text: 'Result data for the latest sessions is not available yet.', link: 'exams-certification' };

  return [
    {
      title: 'New Colleges This Session',
      text: `${indian.format(s.newColleges)} colleges have student registrations for the first time this session.`,
      link: 'affiliation-colleges'
    },
    {
      title: 'Grievances Awaiting Resolution',
      text: `${indian.format(s.activeGrievances)} grievances pending; ${indian.format(resolved)} resolved in the last ${years.length} years. Needs attention.`,
      highlight: true,
      link: 'grievances'
    },
    passItem,
    {
      title: 'Evaluator Approvals Pending',
      text: `${indian.format(s.pendingApprovals)} evaluator registrations are awaiting approval. Recommend timely review.`,
      link: 'e-office'
    }
  ];
}

function liveCard(card: StatCard, key: StatKey, live: DashboardSummary): StatCard {
  const value = indian.format(live.stats[key]);

  // Exam card: number of exams this session, with the answer scripts as the highlighted figure.
  if (key === 'examsInProgress') {
    return { ...card, value, highlight: `${(live.stats.answerScripts / 100000).toFixed(2)} Lakh` };
  }

  // Cards with a comparison figure keep the design caption ("vs last year", "this year" etc.).
  const trend =
    key === 'affiliatedColleges'
      ? live.stats.newColleges > 0
        ? { direction: 'up' as const, value: indian.format(live.stats.newColleges) }
        : undefined
      : percentChange(live.stats[key], live.previous[key]);
  if (trend && card.trend) {
    return { ...card, value, trend };
  }
  return {
    ...card,
    value,
    trend: undefined,
    caption: LIVE_CAPTIONS[key]?.(live.stats) ?? card.caption,
    captionMarker: false
  };
}

function percentChange(current: number, previous: number | undefined): StatCard['trend'] {
  if (!previous) {
    return undefined;
  }
  if (current === previous) {
    return { direction: 'flat', value: '0%' };
  }
  const change = ((current - previous) / previous) * 100;
  return { direction: change > 0 ? 'up' : 'down', value: `${Math.abs(change).toFixed(1)}%` };
}

/**
 * Registered students per session, in thousands, labelled like the design ("96K", "3.00L").
 * As in the design, one bar per session shows the total; the UG/PG split is in its tooltip.
 */
function enrollmentChart(base: BarChartData, live: DashboardSummary, byType: EnrollmentByType | null): BarChartData {
  if (!live.enrollment.length) {
    return base;
  }
  const k = (n: number) => n / 1000;
  const short = (v: number) => (v >= 100 ? `${(v / 100).toFixed(v % 100 === 0 ? 0 : 2)}L` : `${Math.round(v)}K`);
  const intervals = base.yTicks.length - 1;
  const step = niceStep(Math.max(...live.enrollment.map((e) => k(e.students))) / intervals);
  return {
    ...base,
    title: base.title.replace(/Last \d+ Years/, `Last ${live.enrollment.length} Years`),
    yMax: step * intervals,
    yTicks: base.yTicks.map((_, i) => ({ value: step * i, label: short(step * i) })),
    groups: live.enrollment.map((e) => {
      const split = byType?.find((t) => t.session === e.session);
      const total = `${e.session} · Total: ${short(k(e.students))}`;
      return {
        label: e.session,
        values: [k(e.students)],
        labels: [short(k(e.students))],
        tooltips: [split ? `${total} (UG ${short(k(split.ug))}, PG ${short(k(split.pg))})` : total]
      };
    })
  };
}

/** Gross pass percentage for the latest result sessions; the 0–100% axis stays as designed. */
function examResultsChart(base: BarChartData, live: DashboardSummary): BarChartData {
  if (!live.passPercentage.length) {
    return base;
  }
  return {
    ...base,
    groups: live.passPercentage.map((p) => {
      const percent = Math.round(p.percent * 10) / 10;
      return { label: p.session, values: [percent], labels: [`${percent.toFixed(1)}%`] };
    })
  };
}

/** Received/resolved grievances per year, on an axis with the design's tick count. */
function grievanceChart(base: BarChartData, live: DashboardSummary): BarChartData {
  const years = live.grievancesByYear;
  if (!years?.length) {
    return base;
  }
  const intervals = base.yTicks.length - 1;
  const step = niceStep(Math.max(...years.flatMap((y) => [y.received, y.resolved])) / intervals);
  return {
    ...base,
    title: base.title.replace(/\(\d{4}\)/, `(Last ${years.length} Years)`),
    yMax: step * intervals,
    yTicks: base.yTicks.map((_, i) => ({ value: step * i, label: String(step * i) })),
    groups: years.map((y) => ({
      label: String(y.year),
      values: [y.received, y.resolved],
      labels: [indian.format(y.received), indian.format(y.resolved)]
    }))
  };
}

/** Smallest "round" step (1, 2, 2.5, 5 × 10ⁿ, at least 1) that covers the given value. */
function niceStep(raw: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * magnitude).find((s) => s >= raw) ?? 10 * magnitude;
  return Math.max(step, 1);
}

/** "11:32 AM" for today, "Yesterday", otherwise "24 May 2025" — as in the design. */
function activityTime(at: string): string {
  const date = new Date(at);
  const today = new Date();
  const days = Math.round(
    (new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() -
      new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()) /
      86400000
  );
  if (days === 0) {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }
  if (days === 1) {
    return 'Yesterday';
  }
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
