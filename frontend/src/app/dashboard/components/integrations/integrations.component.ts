import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IntegrationsData } from '../../dashboard.models';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-integrations',
  imports: [RouterLink, IconComponent],
  templateUrl: './integrations.component.html',
  styleUrl: './integrations.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class IntegrationsComponent {
  readonly data = input.required<IntegrationsData>();
}
