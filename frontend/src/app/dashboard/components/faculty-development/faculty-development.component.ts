import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FacultyDevelopmentData } from '../../dashboard.models';
import { IconComponent } from '../icon/icon.component';
import { ProgressRingComponent } from '../progress-ring/progress-ring.component';

@Component({
  selector: 'app-faculty-development',
  imports: [RouterLink, IconComponent, ProgressRingComponent],
  templateUrl: './faculty-development.component.html',
  styleUrl: './faculty-development.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FacultyDevelopmentComponent {
  readonly data = input.required<FacultyDevelopmentData>();
}
