import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './auth/auth.guard';
import { LoginComponent } from './auth/login/login.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { ExamStatusComponent } from './dashboard/pages/exam-status/exam-status.component';
import { OverviewComponent } from './dashboard/pages/overview/overview.component';
import { SectionComponent } from './dashboard/pages/section/section.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent, canActivate: [guestGuard], title: 'Sign in – VBSPU Dashboard' },
  {
    path: '',
    component: DashboardComponent,
    canActivate: [authGuard],
    children: [
      { path: '', component: OverviewComponent, title: 'VBSPU VC Dashboard' },
      { path: 'exam-status', component: ExamStatusComponent, title: 'Exam Status – VBSPU Dashboard' },
      { path: ':section', component: SectionComponent, title: 'VBSPU VC Dashboard' }
    ]
  },
  { path: '**', redirectTo: '' }
];
