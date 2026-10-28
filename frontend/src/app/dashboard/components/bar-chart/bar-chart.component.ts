import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { BarChartData } from '../../dashboard.models';

/** Pixel geometry of a chart card, measured from the Figma frame (card-relative). */
export interface BarChartLayout {
  width: number;
  height: number;
  axisX: number;
  axisEndX: number;
  baselineY: number;
  /** Height in px that corresponds to `yMax`. */
  plotHeight: number;
  firstBarX: number;
  groupPitch: number;
  barWidth: number;
  barGap: number;
  xLabelY: number;
  /** Distance between y-axis tick labels; the design spaces them independently of the bar scale. */
  tickSpacing: number;
  /** Vertical offset of the zero tick from the baseline. */
  tickZeroOffset: number;
  /** Gap between a bar top and its value label baseline. */
  valueLabelOffset: number;
  /** X labels use the primary text colour and a larger size (Grievance chart). */
  strongXLabels?: boolean;
}

interface Bar {
  x: number;
  y: number;
  height: number;
  label: string;
  series: number;
}

@Component({
  selector: 'app-bar-chart',
  templateUrl: './bar-chart.component.html',
  styleUrl: './bar-chart.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BarChartComponent {
  readonly data = input.required<BarChartData>();
  readonly layout = input.required<BarChartLayout>();
  readonly chartId = input.required<string>();

  protected readonly scale = computed(() => this.layout().plotHeight / this.data().yMax);

  protected readonly ticks = computed(() =>
    this.data().yTicks.map((t, i) => {
      const l = this.layout();
      return { ...t, y: l.baselineY + l.tickZeroOffset - i * l.tickSpacing };
    })
  );

  protected readonly groups = computed(() => {
    const l = this.layout();
    const seriesCount = this.data().series.length;
    const groupWidth = seriesCount * l.barWidth + (seriesCount - 1) * l.barGap;
    return this.data().groups.map((g, gi) => {
      const left = l.firstBarX + gi * l.groupPitch;
      const bars: Bar[] = g.values.map((v, si) => {
        const height = v * this.scale();
        return {
          x: left + si * (l.barWidth + l.barGap),
          y: l.baselineY - height,
          height,
          label: g.labels[si],
          series: si
        };
      });
      return { label: g.label, center: left + groupWidth / 2, bars };
    });
  });

  protected readonly trendPoints = computed(() =>
    this.groups().map((g) => ({ x: g.bars[0].x + this.layout().barWidth / 2, y: g.bars[0].y }))
  );

  protected readonly trendPath = computed(() => this.trendPoints().map((p) => `${p.x},${p.y}`).join(' '));

  protected gradientId(series: number): string {
    return `${this.chartId()}-bar-${series}`;
  }

  /** Bar with rounded top corners only. */
  protected barPath(bar: Bar): string {
    const w = this.layout().barWidth;
    const r = Math.min(2, w / 2, bar.height);
    const { x, y, height } = bar;
    const bottom = y + height;
    return `M${x},${bottom} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${bottom} Z`;
  }
}
