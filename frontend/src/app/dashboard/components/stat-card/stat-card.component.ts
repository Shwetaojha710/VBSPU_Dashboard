import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { StatCard } from '../../dashboard.models';
import { IconComponent } from '../icon/icon.component';

const SPARK_STEP = 4;
const SPARK_BASE = 45;
const SPARK_FILL_BOTTOM = 48;
const RING_RADIUS = 20.5;

@Component({
  selector: 'app-stat-card',
  imports: [IconComponent],
  templateUrl: './stat-card.component.html',
  styleUrl: './stat-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StatCardComponent {
  readonly card = input.required<StatCard>();
  readonly sparkline = input.required<number[]>();
  /** Unique id for the SVG gradient. */
  readonly index = input(0);

  protected readonly ringCircumference = 2 * Math.PI * RING_RADIUS;
  protected readonly ringRadius = RING_RADIUS;

  protected readonly sparkPoints = computed(() =>
    this.sparkline().map((v, i) => [SPARK_STEP * (i + 1), SPARK_BASE - v] as const)
  );

  protected readonly sparkLine = computed(() =>
    this.sparkPoints().map(([x, y]) => `${x},${y}`).join(' ')
  );

  protected readonly sparkArea = computed(() => {
    const pts = this.sparkPoints();
    const first = pts[0][0];
    const last = pts[pts.length - 1][0];
    return `M${first},${SPARK_FILL_BOTTOM} L${this.sparkLine()} L${last},${SPARK_FILL_BOTTOM} Z`;
  });

  protected readonly ringOffset = computed(() => {
    const percent = this.card().progress?.percent ?? 0;
    return this.ringCircumference * (1 - percent / 100);
  });
}
