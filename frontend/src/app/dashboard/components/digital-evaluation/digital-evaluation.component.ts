import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { EvaluationMetric } from '../../dashboard.models';

@Component({
  selector: 'app-digital-evaluation',
  templateUrl: './digital-evaluation.component.html',
  styleUrl: './digital-evaluation.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DigitalEvaluationComponent {
  readonly title = input.required<string>();
  readonly metrics = input.required<EvaluationMetric[]>();
}
