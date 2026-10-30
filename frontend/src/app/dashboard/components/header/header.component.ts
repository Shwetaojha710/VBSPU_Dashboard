import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  computed,
  inject,
  input,
  signal
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../auth/auth.service';
import { DashboardData, HeaderData } from '../../dashboard.models';
import { IconComponent } from '../icon/icon.component';

/** The header shows India time, whatever the viewer's device is set to. */
const TIME_ZONE = 'Asia/Kolkata';
const DATE_PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  year: 'numeric'
});
const TIME = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: true });

@Component({
  selector: 'app-header',
  imports: [IconComponent, RouterLink, RouterLinkActive],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HeaderComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  readonly university = input.required<DashboardData['university']>();
  readonly data = input.required<HeaderData>();

  protected readonly menuOpen = signal(false);
  protected readonly email = this.auth.email;

  /** Current date and time, refreshed at the start of every minute. */
  protected readonly now = signal(new Date());
  protected readonly date = computed(() => {
    const p = Object.fromEntries(DATE_PARTS.formatToParts(this.now()).map((x) => [x.type, x.value]));
    return `${p['weekday']}, ${p['day']} ${p['month']} ${p['year']}`;
  });
  protected readonly time = computed(() => TIME.format(this.now()));

  constructor() {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      this.now.set(new Date());
      timer = setTimeout(tick, 60000 - (Date.now() % 60000) + 50);
    };
    timer = setTimeout(tick, 60000 - (Date.now() % 60000) + 50);
    inject(DestroyRef).onDestroy(() => clearTimeout(timer));
  }

  /** Opens the search results page for the typed query. */
  protected search(event: Event, value: string): void {
    event.preventDefault();
    const q = value.trim();
    if (q) {
      this.router.navigate(['/search'], { queryParams: { q } });
    }
  }

  protected toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  protected logout(): void {
    this.closeMenu();
    this.auth.logout();
  }

  protected closeMenu(): void {
    this.menuOpen.set(false);
  }

  /** Close the VC Office menu on a click outside it. */
  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    const menu = this.host.nativeElement.querySelector('.user-menu');
    if (this.menuOpen() && menu && !menu.contains(event.target as Node)) {
      this.closeMenu();
    }
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.closeMenu();
  }
}
