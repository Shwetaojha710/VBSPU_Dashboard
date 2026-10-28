import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { InsightsData } from '../../dashboard.models';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-ai-insights',
  imports: [RouterLink, IconComponent],
  templateUrl: './ai-insights.component.html',
  styleUrl: './ai-insights.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AiInsightsComponent {
  readonly data = input.required<InsightsData>();
}
