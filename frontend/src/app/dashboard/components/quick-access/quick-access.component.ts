import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { QuickAccessData } from '../../dashboard.models';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-quick-access',
  imports: [RouterLink, IconComponent],
  templateUrl: './quick-access.component.html',
  styleUrl: './quick-access.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class QuickAccessComponent {
  readonly data = input.required<QuickAccessData>();
}
