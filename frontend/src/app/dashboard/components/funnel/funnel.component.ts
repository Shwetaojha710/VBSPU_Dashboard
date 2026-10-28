import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FunnelData } from '../../dashboard.models';

/** Funnel geometry measured from the Figma frame (panel-relative px). */
const TOP_Y = 89;
const BAND_HEIGHT = 32;
const TOP_LEFT = 31;
const TOP_RIGHT = 282;
/** Horizontal inset per px of height on each side. */
const SLOPE = 47 / 127;
const PERCENT_X = 362;

@Component({
  selector: 'app-funnel',
  imports: [RouterLink],
  templateUrl: './funnel.component.html',
  styleUrl: './funnel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FunnelComponent {
  readonly data = input.required<FunnelData>();

  protected readonly percentX = PERCENT_X;
  protected readonly centerX = (TOP_LEFT + TOP_RIGHT) / 2;

  protected readonly bands = computed(() =>
    this.data().stages.map((stage, i) => {
      const y0 = TOP_Y + i * BAND_HEIGHT;
      const y1 = y0 + BAND_HEIGHT;
      const in0 = (y0 - TOP_Y) * SLOPE;
      const in1 = (y1 - TOP_Y) * SLOPE;
      return {
        ...stage,
        points: `${TOP_LEFT + in0},${y0} ${TOP_RIGHT - in0},${y0} ${TOP_RIGHT - in1},${y1} ${TOP_LEFT + in1},${y1}`,
        centerY: y0 + BAND_HEIGHT / 2
      };
    })
  );
}
