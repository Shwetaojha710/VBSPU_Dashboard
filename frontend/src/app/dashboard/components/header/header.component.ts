import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../auth/auth.service';
import { matchSearchEntries, SearchEntry } from '../../data/search-index';
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
  private readonly queryInput = viewChild<ElementRef<HTMLInputElement>>('query');

  readonly university = input.required<DashboardData['university']>();
  readonly data = input.required<HeaderData>();
  readonly navOpen = input(false);
  readonly menuToggle = output<void>();

  protected readonly menuOpen = signal(false);
  protected readonly searchOpen = signal(false);
  protected readonly searchQuery = signal('');
  protected readonly highlight = signal(0);
  protected readonly email = this.auth.email;

  protected readonly suggestions = computed(() => matchSearchEntries(this.searchQuery(), 8));

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

  protected onSearchInput(value: string): void {
    this.searchQuery.set(value);
    this.highlight.set(0);
    this.searchOpen.set(value.trim().length > 0);
  }

  protected onSearchFocus(): void {
    if (this.searchQuery().trim()) {
      this.searchOpen.set(true);
    }
  }

  protected onSearchKeydown(event: KeyboardEvent): void {
    const list = this.suggestions();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!list.length) return;
      this.searchOpen.set(true);
      this.highlight.set(Math.min(this.highlight() + 1, list.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.highlight.set(Math.max(this.highlight() - 1, 0));
      return;
    }
    if (event.key === 'Escape') {
      this.closeSearch();
      this.queryInput()?.nativeElement.blur();
      return;
    }
  }

  /** Opens the best match, or the full search results page. */
  protected search(event: Event): void {
    event.preventDefault();
    const q = this.searchQuery().trim();
    if (!q) return;

    const list = this.suggestions();
    const idx = this.highlight();
    if (list.length && idx >= 0 && idx < list.length) {
      this.goTo(list[idx]);
      return;
    }
    if (list.length === 1) {
      this.goTo(list[0]);
      return;
    }
    this.closeSearch();
    this.router.navigate(['/search'], { queryParams: { q } });
  }

  protected selectSuggestion(entry: SearchEntry, event?: Event): void {
    event?.preventDefault();
    this.goTo(entry);
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

  /** Close menus on a click outside. */
  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    const target = event.target as Node;
    const menu = this.host.nativeElement.querySelector('.user-menu');
    if (this.menuOpen() && menu && !menu.contains(target)) {
      this.closeMenu();
    }
    const search = this.host.nativeElement.querySelector('.search');
    if (this.searchOpen() && search && !search.contains(target)) {
      this.searchOpen.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.closeMenu();
    this.closeSearch();
  }

  private goTo(entry: SearchEntry): void {
    this.searchQuery.set('');
    this.closeSearch();
    const path = entry.path ? `/${entry.path}` : '/';
    this.router.navigateByUrl(path);
  }

  private closeSearch(): void {
    this.searchOpen.set(false);
    this.highlight.set(0);
  }
}
