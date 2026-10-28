import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ActivityFeedComponent } from '../../components/activity-feed/activity-feed.component';
import { AffiliatedCollegesComponent } from '../../components/affiliated-colleges/affiliated-colleges.component';
import { AiInsightsComponent } from '../../components/ai-insights/ai-insights.component';
import { BarChartComponent, BarChartLayout } from '../../components/bar-chart/bar-chart.component';
import { DigitalEvaluationComponent } from '../../components/digital-evaluation/digital-evaluation.component';
import { EventsCalendarComponent } from '../../components/events-calendar/events-calendar.component';
import { FacultyDevelopmentComponent } from '../../components/faculty-development/faculty-development.component';
import { FeeCollectionComponent } from '../../components/fee-collection/fee-collection.component';
import { FunnelComponent } from '../../components/funnel/funnel.component';
import { IntegrationsComponent } from '../../components/integrations/integrations.component';
import { MetricCardsComponent } from '../../components/metric-cards/metric-cards.component';
import { QuickAccessComponent } from '../../components/quick-access/quick-access.component';
import { ResearchQualityComponent } from '../../components/research-quality/research-quality.component';
import { StatCardComponent } from '../../components/stat-card/stat-card.component';
import { DASHBOARD_DATA } from '../../data/dashboard.data';
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
    EventsCalendarComponent
  ],
  templateUrl: './overview.component.html',
  styleUrl: './overview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OverviewComponent {
  /** Design data with live database figures applied. */
  protected readonly data = inject(DashboardStore).data;
  protected readonly layouts = CHART_LAYOUTS;
  protected readonly screen2 = DASHBOARD_DATA.screen2;
  protected readonly screen3 = DASHBOARD_DATA.screen3;
}
