import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ActivityFeedComponent } from '../../components/activity-feed/activity-feed.component';
import { AffiliatedCollegesComponent } from '../../components/affiliated-colleges/affiliated-colleges.component';
import { AiInsightsComponent } from '../../components/ai-insights/ai-insights.component';
import { BarChartComponent, BarChartLayout } from '../../components/bar-chart/bar-chart.component';
import { DigitalEvaluationComponent } from '../../components/digital-evaluation/digital-evaluation.component';
import { EventsCalendarComponent } from '../../components/events-calendar/events-calendar.component';
import { FacultyDevelopmentComponent } from '../../components/faculty-development/faculty-development.component';
import { FeeCollectionComponent } from '../../components/fee-collection/fee-collection.component';
import { ExamStatusCardComponent } from '../../components/exam-status-card/exam-status-card.component';
import { FunnelComponent } from '../../components/funnel/funnel.component';
import { IntegrationsComponent } from '../../components/integrations/integrations.component';
import { MetricCardsComponent } from '../../components/metric-cards/metric-cards.component';
import { QuickAccessComponent } from '../../components/quick-access/quick-access.component';
import { ResearchQualityComponent } from '../../components/research-quality/research-quality.component';
import { StatCardComponent } from '../../components/stat-card/stat-card.component';
import { DashboardStore } from '../../data/dashboard-store.service';

/** Chart geometry measured from the Figma frame (card-relative px). */
const CHART_LAYOUTS: Record<'enrollment' | 'examResults' | 'grievances', BarChartLayout> = {
  enrollment: {
    width: 460,
    height: 295,
    axisX: 58,
    axisEndX: 438,
    baselineY: 240,
    plotHeight: 156,
    firstBarX: 78,
    groupPitch: 76.5,
    barWidth: 34,
    barGap: 0,
    xLabelY: 257,
    tickSpacing: 31,
    tickZeroOffset: 0,
    valueLabelOffset: 7
  },
  examResults: {
    width: 482,
    height: 295,
    axisX: 61,
    axisEndX: 463,
    baselineY: 268,
    plotHeight: 158,
    firstBarX: 86,
    groupPitch: 80.5,
    barWidth: 35,
    barGap: 0,
    xLabelY: 285,
    tickSpacing: 38.3,
    tickZeroOffset: 3,
    valueLabelOffset: 13
  },
  grievances: {
    width: 468,
    height: 295,
    axisX: 56,
    axisEndX: 450,
    baselineY: 258,
    plotHeight: 177,
    firstBarX: 70,
    groupPitch: 79,
    barWidth: 22,
    barGap: 4,
    xLabelY: 278,
    tickSpacing: 37,
    tickZeroOffset: 5,
    valueLabelOffset: 7,
    strongXLabels: true
  }
};

@Component({
  selector: 'app-overview',
  imports: [
    RouterLink,
    StatCardComponent,
    DigitalEvaluationComponent,
    FeeCollectionComponent,
    AffiliatedCollegesComponent,
    BarChartComponent,
    ResearchQualityComponent,
    FacultyDevelopmentComponent,
    IntegrationsComponent,
    MetricCardsComponent,
    AiInsightsComponent,
    FunnelComponent,
    QuickAccessComponent,
    ActivityFeedComponent,
    EventsCalendarComponent,
    ExamStatusCardComponent
  ],
  templateUrl: './overview.component.html',
  styleUrl: './overview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OverviewComponent {
  /** Design data with live database figures applied. */
  protected readonly data = inject(DashboardStore).data;

  /** The charts were designed for 5 bars; fewer bars keep the same first and last position. */
  protected readonly layouts = computed(() => {
    const charts = this.data().charts;
    return {
      ...CHART_LAYOUTS,
      enrollment: spreadGroups(CHART_LAYOUTS.enrollment, charts.enrollment.groups.length, charts.enrollment.series.length),
      examResults: spreadGroups(CHART_LAYOUTS.examResults, charts.examResults.groups.length, 1),
      grievances: spreadGroups(CHART_LAYOUTS.grievances, charts.grievances.groups.length, charts.grievances.series.length, 2)
    };
  });
}

/**
 * The charts were designed for 5 groups (`designSeries` bars each). Other shapes keep the design's
 * left and right edges: groups with extra bars get narrower bars, and the groups are spread evenly.
 */
function spreadGroups(layout: BarChartLayout, groups: number, series: number, designSeries = 1): BarChartLayout {
  if (groups === 5 && series === designSeries) {
    return layout;
  }
  const barWidth = series > designSeries ? 26 : layout.barWidth;
  const barGap = series > designSeries ? 4 : layout.barGap;
  const groupWidth = series * barWidth + (series - 1) * barGap;
  const designGroupWidth = designSeries * layout.barWidth + (designSeries - 1) * layout.barGap;
  const rightEdge = layout.firstBarX + layout.groupPitch * 4 + designGroupWidth;
  const groupPitch = groups > 1 ? (rightEdge - groupWidth - layout.firstBarX) / (groups - 1) : layout.groupPitch;
  return { ...layout, barWidth, barGap, groupPitch };
}
