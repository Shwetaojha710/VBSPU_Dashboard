import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';

/** Pagination bar for tables: rows-per-page choice, Previous/Next and page numbers. */
@Component({
  selector: 'app-pager',
  templateUrl: './pager.component.html',
  styleUrl: './pager.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PagerComponent {
  /** Number of rows across all pages. */
  readonly total = input.required<number>();
  readonly pageSizes = input([10, 25, 50, 100]);
  /** Zero-based page index. */
  readonly page = model(0);
  readonly pageSize = model(25);

  protected readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));

  /** First, last and two either side of the current page, with gaps as null. */
  protected readonly buttons = computed(() => {
    const count = this.pageCount();
    const current = this.page();
    const pages = [...new Set([0, count - 1, ...[-2, -1, 0, 1, 2].map((d) => current + d)])]
      .filter((p) => p >= 0 && p < count)
      .sort((a, b) => a - b);
    return pages.flatMap((p, i) => (i > 0 && p - pages[i - 1] > 1 ? [null, p] : [p]));
  });

  protected goTo(page: number): void {
    this.page.set(Math.min(Math.max(page, 0), this.pageCount() - 1));
  }

  protected setPageSize(size: number): void {
    this.pageSize.set(size);
    this.page.set(0);
  }
}
