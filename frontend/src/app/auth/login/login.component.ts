import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DASHBOARD_DATA } from '../../dashboard/data/dashboard.data';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly university = DASHBOARD_DATA.university;
  protected readonly submitting = signal(false);
  protected readonly error = signal('');
  protected readonly showPassword = signal(false);

  protected submit(event: Event, email: string, password: string): void {
    event.preventDefault();
    if (this.submitting()) {
      return;
    }
    if (!email.trim() || !password) {
      this.error.set('Please enter your email and password.');
      return;
    }
    this.submitting.set(true);
    this.error.set('');
    this.auth.login(email.trim(), password).subscribe({
      next: () => this.router.navigateByUrl(this.returnUrl()),
      error: (err: unknown) => {
        this.submitting.set(false);
        this.error.set(messageFor(err));
      }
    });
  }

  /** Only same-site paths are followed after login. */
  private returnUrl(): string {
    const url = this.route.snapshot.queryParamMap.get('returnUrl') ?? '/';
    return url.startsWith('/') && !url.startsWith('//') ? url : '/';
  }
}

function messageFor(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 401) return 'Incorrect email or password.';
    if (err.status === 429) return 'Too many failed attempts. Please try again in 15 minutes.';
    if (err.status === 0 || err.status >= 500) return 'The server is not reachable. Please try again shortly.';
  }
  return 'Could not sign in. Please try again.';
}
