import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FeeCollectionData } from '../../dashboard.models';

@Component({
  selector: 'app-fee-collection',
  templateUrl: './fee-collection.component.html',
  styleUrl: './fee-collection.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FeeCollectionComponent {
  readonly data = input.required<FeeCollectionData>();

  /** Target bar length as a share of the axis. */
  protected readonly targetWidth = computed(() => (this.data().target.value / this.data().axis.max) * 100);

  /** Collected bar is drawn as a share of the target bar. */
  protected readonly collectedWidth = computed(() => (this.targetWidth() * this.data().collected.percent) / 100);

  protected tickPosition(tick: number): number {
    return (tick / this.data().axis.max) * 100;
  }
}
