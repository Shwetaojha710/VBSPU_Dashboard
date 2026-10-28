import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EventsData } from '../../dashboard.models';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-events-calendar',
  imports: [RouterLink, IconComponent],
  templateUrl: './events-calendar.component.html',
  styleUrl: './events-calendar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EventsCalendarComponent {
  readonly data = input.required<EventsData>();
}
