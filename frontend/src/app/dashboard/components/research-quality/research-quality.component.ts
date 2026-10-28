import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ResearchQualityData } from '../../dashboard.models';
import { ProgressRingComponent } from '../progress-ring/progress-ring.component';

@Component({
  selector: 'app-research-quality',
  imports: [RouterLink, ProgressRingComponent],
  templateUrl: './research-quality.component.html',
  styleUrl: './research-quality.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ResearchQualityComponent {
  readonly data = input.required<ResearchQualityData>();
}
