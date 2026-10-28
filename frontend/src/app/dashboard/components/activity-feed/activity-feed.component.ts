import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ActivityData } from '../../dashboard.models';

@Component({
  selector: 'app-activity-feed',
  imports: [RouterLink],
  templateUrl: './activity-feed.component.html',
  styleUrl: './activity-feed.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ActivityFeedComponent {
  readonly data = input.required<ActivityData>();
}
