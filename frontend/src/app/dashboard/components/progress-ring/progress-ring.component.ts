import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Circular progress with a centred percentage label. */
@Component({
  selector: 'app-progress-ring',
  template: `<svg [attr.viewBox]="'0 0 ' + size() + ' ' + size()" [attr.width]="size()" [attr.height]="size()" aria-hidden="true">
    <circle [attr.cx]="center()" [attr.cy]="center()" [attr.r]="radius()" fill="none" [attr.stroke]="track()" [attr.stroke-width]="stroke()" />
    <circle
      [attr.cx]="center()"
      [attr.cy]="center()"
      [attr.r]="radius()"
      fill="none"
      [attr.stroke]="color()"
      [attr.stroke-width]="stroke()"
      [attr.stroke-dasharray]="circumference()"
      [attr.stroke-dashoffset]="offset()"
      [attr.transform]="'rotate(-90 ' + center() + ' ' + center() + ')'"
    />
    <text [attr.x]="center()" [attr.y]="center()" text-anchor="middle" dominant-baseline="central" [attr.fill]="labelColor()" [style.font-size.px]="labelSize()" font-weight="700">{{ percent() }}%</text>
  </svg>`,
  styles: `:host { display: inline-flex; flex: none; } svg { display: block; }`,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProgressRingComponent {
  readonly percent = input.required<number>();
  readonly size = input(46);
  readonly stroke = input(5);
  readonly color = input('#00cf8a');
  readonly track = input('#bce4ff');
  readonly labelColor = input('#001496');
  readonly labelSize = input(12);

  protected readonly center = computed(() => this.size() / 2);
  protected readonly radius = computed(() => (this.size() - this.stroke()) / 2);
  protected readonly circumference = computed(() => 2 * Math.PI * this.radius());
  protected readonly offset = computed(() => this.circumference() * (1 - this.percent() / 100));
}
