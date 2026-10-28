import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MetricCardsData } from '../../dashboard.models';
import { IconComponent } from '../icon/icon.component';

/** Panel with a row of metric cards (Communication & Engagement, RTI). */
@Component({
  selector: 'app-metric-cards',
  imports: [RouterLink, IconComponent],
  templateUrl: './metric-cards.component.html',
  styleUrl: './metric-cards.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MetricCardsComponent {
  readonly data = input.required<MetricCardsData>();
  /** Panel height in px, as measured in the design. */
  readonly height = input(137);
  /** Card height in px. */
  readonly cardHeight = input(64);

  protected readonly columns = computed(() => this.data().items.length);
}
