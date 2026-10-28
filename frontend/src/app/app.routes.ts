import { Routes } from '@angular/router';
import { DashboardComponent } from './dashboard/dashboard.component';
import { OverviewComponent } from './dashboard/pages/overview/overview.component';
import { SectionComponent } from './dashboard/pages/section/section.component';

export const routes: Routes = [
  {
    path: '',
    component: DashboardComponent,
    children: [
      { path: '', component: OverviewComponent, title: 'VBSPU VC Dashboard' },
      { path: ':section', component: SectionComponent, title: 'VBSPU VC Dashboard' }
    ]
  },
  { path: '**', redirectTo: '' }
];
