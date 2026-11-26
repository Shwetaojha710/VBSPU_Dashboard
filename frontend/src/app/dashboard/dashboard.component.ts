import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { HeaderComponent } from './components/header/header.component';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { DASHBOARD_DATA } from './data/dashboard.data';

/** Layout shell: header, sidebar and the routed section content. */
@Component({
  selector: 'app-dashboard',
  imports: [HeaderComponent, SidebarComponent, RouterOutlet],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardComponent {
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly data = DASHBOARD_DATA;
  protected readonly menuOpen = signal(false);

  constructor() {
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => this.menuOpen.set(false));
  }

  protected toggleNav(): void {
    this.menuOpen.update((open) => !open);
  }
}
