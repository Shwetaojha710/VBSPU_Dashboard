import { DecimalPipe } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { environment } from '../../../../environments/environment';

type StageKey = 'barcode' | 'allotted' | 'received' | 'flap' | 'omr' | 'award';

interface PipelineStages {
  barcodeCoded: number;
  allotted: number;
  receivedAfterEval: number;
  flap: {
    codeCorrection: number;
    scannedImported: number;
    available: boolean;
    note?: string | null;
  };
  omr: {
    receivedAfterEval: number;
    scannedImported: number;
  };
  award: {
    receivedAfterEval: number;
    scannedImported: number;
  };
}

interface StatusResponse {
  year: string;
  level: string;
  stages: PipelineStages;
}

interface StageView {
  key: StageKey;
  step: number;
  title: string;
  value: number;
  base: number;
  hint: string;
  tone: 'base' | 'ok' | 'mid' | 'warn' | 'scan';
  available: boolean;
  note?: string | null;
  secondary?: { label: string; value: number } | null;
}

interface DetailRow {
  sNo: number;
  lotNo?: string | null;
  lotBarcode?: string | null;
  course?: string | null;
  subject?: string | null;
  paperCode?: string | null;
  paperName?: string | null;
  centerCode?: string | null;
  copies?: number | null;
  lots?: number | null;
  evaluatorCode?: string | null;
  evaluatorName?: string | null;
  dateAllot?: string | null;
  dateRece?: string | null;
  scanned?: number | null;
  barcode?: string | null;
  rollNo?: string | null;
  answerKeyNo?: string | null;
  status?: string | null;
}

interface DetailResponse {
  stage: StageKey;
  available: boolean;
  message?: string;
  columns: string[];
  totalRows: number;
  totalCopies: number;
  totalScanned?: number;
  codeCorrection?: number;
  page: number;
  pageSize: number;
  rows: DetailRow[];
}

const COLUMN_LABELS: Record<string, string> = {
  lotNo: 'Lot No',
  lotBarcode: 'Lot barcode',
  course: 'Course',
  subject: 'Subject',
  paperCode: 'Paper code',
  paperName: 'Paper name',
  lots: 'Lots',
  copies: 'Copies',
  scanned: 'Scanned',
  evaluatorName: 'Teacher',
  evaluatorCode: 'Teacher code',
  dateAllot: 'Allot date',
  dateRece: 'Receive date',
  barcode: 'Barcode',
  rollNo: 'Roll No',
  answerKeyNo: 'Answer key',
  status: 'Status'
};

/** Copy barcode → allot → receive → flap / OMR / award scan pipeline (read-only). */
@Component({
  selector: 'app-copy-scan-status',
  imports: [RouterLink, FormsModule, DecimalPipe],
  templateUrl: './copy-scan-status.component.html',
  styleUrl: './copy-scan-status.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CopyScanStatusComponent implements OnInit {
  private readonly http = inject(HttpClient);

  protected readonly years = signal<string[]>([]);
  protected readonly year = signal(String(new Date().getFullYear()));
  protected readonly level = signal<'all' | 'ug' | 'pg'>('all');
  protected readonly stages = signal<PipelineStages | null>(null);
  protected readonly loadingFilters = signal(true);
  protected readonly loading = signal(false);
  protected readonly error = signal('');

  protected readonly selectedStage = signal<StageKey | null>(null);
  protected readonly detailRows = signal<DetailRow[]>([]);
  protected readonly detailColumns = signal<string[]>([]);
  protected readonly detailTotalRows = signal(0);
  protected readonly detailTotalCopies = signal(0);
  protected readonly detailMessage = signal('');
  protected readonly detailLoading = signal(false);
  protected readonly detailError = signal('');
  protected readonly detailPage = signal(1);
  /** 0 = All (capped server-side at 10,000). */
  protected readonly detailPageSize = signal(25);
  protected readonly detailPageSizeOptions: Array<number | 'all'> = [25, 50, 100, 'all'];
  protected readonly detailSearch = signal('');
  private static readonly ALL_PAGE_SIZE = 10000;

  protected readonly busy = computed(() => this.loading() || this.loadingFilters());

  protected readonly selectedStageView = computed(() => {
    const key = this.selectedStage();
    return this.stageViews().find((s) => s.key === key) ?? null;
  });

  protected readonly effectiveDetailPageSize = computed(() => {
    const size = this.detailPageSize();
    if (size === 0) {
      const total = this.detailTotalRows();
      return Math.min(Math.max(total || CopyScanStatusComponent.ALL_PAGE_SIZE, 1), CopyScanStatusComponent.ALL_PAGE_SIZE);
    }
    return size;
  });

  protected readonly detailTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.detailTotalRows() / this.effectiveDetailPageSize()))
  );

  protected readonly detailPageStart = computed(() => {
    if (!this.detailTotalRows()) return 0;
    return (Math.min(this.detailPage(), this.detailTotalPages()) - 1) * this.effectiveDetailPageSize() + 1;
  });

  protected readonly detailPageEnd = computed(() =>
    Math.min(this.detailPageStart() + this.effectiveDetailPageSize() - 1, this.detailTotalRows())
  );

  /** Sum of Copies / Scanned on the current page (when those columns exist). */
  protected readonly detailPageSum = computed(() => {
    const rows = this.detailRows();
    const cols = this.detailColumns();
    if (cols.includes('copies')) {
      return rows.reduce((n, r) => n + (Number(r.copies) || 0), 0);
    }
    if (cols.includes('scanned')) {
      return rows.reduce((n, r) => n + (Number(r.scanned) || 0), 0);
    }
    return null;
  });

  protected readonly detailPageSumLabel = computed(() => {
    const cols = this.detailColumns();
    if (cols.includes('copies')) return 'Page copies';
    if (cols.includes('scanned')) return 'Page scanned';
    return 'Page total';
  });

  protected readonly stageViews = computed((): StageView[] => {
    const s = this.stages();
    if (!s) return [];
    const coded = s.barcodeCoded;
    const allotted = s.allotted;
    const received = s.receivedAfterEval;
    const flapImported = s.flap.available ? s.flap.scannedImported : 0;
    const omr = s.omr.scannedImported;
    const award = s.award.scannedImported;

    return [
      {
        key: 'barcode',
        step: 1,
        title: 'Barcode coded',
        value: coded,
        base: coded,
        hint: 'Copies with lot barcode · click for lots',
        tone: 'base',
        available: true,
        secondary: null
      },
      {
        key: 'allotted',
        step: 2,
        title: 'Allotted for evaluation',
        value: allotted,
        base: coded,
        hint: `${this.pct(allotted, coded)} of coded · pending ${fmt(Math.max(coded - allotted, 0))} · click for course / teacher`,
        tone: 'ok',
        available: true,
        secondary: null
      },
      {
        key: 'received',
        step: 3,
        title: 'Received after evaluation',
        value: received,
        base: allotted || coded,
        hint: `${this.pct(received, allotted || coded)} of allotted · pending ${fmt(Math.max((allotted || coded) - received, 0))}`,
        tone: 'mid',
        available: true,
        secondary: null
      },
      {
        key: 'flap',
        step: 4,
        title: 'Flap scanned',
        value: flapImported,
        base: received,
        hint: s.flap.available
          ? `${this.pct(flapImported, received)} of received · pending ${fmt(Math.max(received - flapImported, 0))}`
          : s.flap.note || 'Not available for UG/PG split',
        tone: 'scan',
        available: s.flap.available,
        note: s.flap.note,
        secondary: s.flap.available
          ? { label: 'Flap code correction', value: s.flap.codeCorrection }
          : null
      },
      {
        key: 'omr',
        step: 5,
        title: 'OMR scanned',
        value: omr,
        base: received,
        hint: `${this.pct(omr, received)} of received · click for course-wise detail`,
        tone: 'scan',
        available: true,
        secondary: null
      },
      {
        key: 'award',
        step: 6,
        title: 'Award scanned',
        value: award,
        base: received,
        hint: `${this.pct(award, received)} of received · click for course-wise detail`,
        tone: 'warn',
        available: true,
        secondary: null
      }
    ];
  });

  protected readonly funnel = computed(() => {
    const s = this.stages();
    if (!s) return null;
    return {
      coded: s.barcodeCoded,
      allottedPct: this.pctNum(s.allotted, s.barcodeCoded),
      receivedPct: this.pctNum(s.receivedAfterEval, s.allotted),
      omrPct: this.pctNum(s.omr.scannedImported, s.receivedAfterEval),
      awardPct: this.pctNum(s.award.scannedImported, s.receivedAfterEval)
    };
  });

  ngOnInit(): void {
    this.http
      .get<{ years: string[]; defaultYear: string }>(`${environment.apiUrl}/dashboard/copy-scan-status/filters`)
      .subscribe({
        next: (res) => {
          this.years.set(res.years ?? []);
          this.year.set(res.defaultYear || res.years?.[0] || String(new Date().getFullYear()));
          this.loadingFilters.set(false);
          this.load();
        },
        error: () => {
          this.loadingFilters.set(false);
          this.error.set('Could not load filter options.');
        }
      });
  }

  protected onYearChange(value: string): void {
    this.year.set(value);
    this.closeDetails();
    this.load();
  }

  protected onLevelChange(value: 'all' | 'ug' | 'pg'): void {
    this.level.set(value);
    this.closeDetails();
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set('');
    const params = new HttpParams().set('year', this.year()).set('level', this.level());
    this.http.get<StatusResponse>(`${environment.apiUrl}/dashboard/copy-scan-status`, { params }).subscribe({
      next: (res) => {
        this.stages.set(res.stages ?? null);
        this.loading.set(false);
      },
      error: () => {
        this.stages.set(null);
        this.loading.set(false);
        this.error.set('Could not load copy scan status.');
      }
    });
  }

  protected openStage(stage: StageView): void {
    if (!stage.available) return;
    if (this.selectedStage() === stage.key) {
      this.closeDetails();
      return;
    }
    this.selectedStage.set(stage.key);
    this.detailPage.set(1);
    this.detailSearch.set('');
    this.loadDetails();
  }

  protected closeDetails(): void {
    this.selectedStage.set(null);
    this.detailRows.set([]);
    this.detailColumns.set([]);
    this.detailTotalRows.set(0);
    this.detailTotalCopies.set(0);
    this.detailMessage.set('');
    this.detailError.set('');
    this.detailSearch.set('');
  }

  protected onDetailSearch(value: string): void {
    this.detailSearch.set(value);
    this.detailPage.set(1);
    this.loadDetails();
  }

  protected onDetailPageSizeChange(value: number | string): void {
    if (value === 'all' || value === 'All') {
      this.detailPageSize.set(0);
    } else {
      this.detailPageSize.set(Number(value) || 25);
    }
    this.detailPage.set(1);
    this.loadDetails();
  }

  protected pageSizeLabel(size: number | 'all'): string {
    return size === 'all' ? 'All' : String(size);
  }

  protected pageSizeSelectValue(): number | 'all' {
    return this.detailPageSize() === 0 ? 'all' : this.detailPageSize();
  }

  protected firstDetailPage(): void {
    if (this.detailPage() <= 1) return;
    this.detailPage.set(1);
    this.loadDetails();
  }

  protected prevDetailPage(): void {
    if (this.detailPage() <= 1) return;
    this.detailPage.update((p) => Math.max(1, p - 1));
    this.loadDetails();
  }

  protected nextDetailPage(): void {
    if (this.detailPage() >= this.detailTotalPages()) return;
    this.detailPage.update((p) => Math.min(this.detailTotalPages(), p + 1));
    this.loadDetails();
  }

  protected lastDetailPage(): void {
    const last = this.detailTotalPages();
    if (this.detailPage() >= last) return;
    this.detailPage.set(last);
    this.loadDetails();
  }

  protected columnLabel(key: string): string {
    return COLUMN_LABELS[key] || key;
  }

  protected cellValue(row: DetailRow, key: string): string {
    const map: Record<string, string | number | null | undefined> = {
      lotNo: row.lotNo,
      lotBarcode: row.lotBarcode,
      course: row.course,
      subject: row.subject,
      paperCode: row.paperCode,
      paperName: row.paperName,
      copies: row.copies,
      lots: row.lots,
      scanned: row.scanned,
      evaluatorName: row.evaluatorName,
      evaluatorCode: row.evaluatorCode,
      dateAllot: row.dateAllot,
      dateRece: row.dateRece,
      barcode: row.barcode,
      rollNo: row.rollNo,
      answerKeyNo: row.answerKeyNo,
      status: row.status
    };
    const value = map[key];
    if (value == null || value === '') return '—';
    if (typeof value === 'number') return fmt(value);
    return value;
  }

  protected pct(part: number, whole: number): string {
    const n = this.pctNum(part, whole);
    return n == null ? '—' : `${n}%`;
  }

  protected barWidth(part: number, whole: number): string {
    if (!whole) return '0%';
    const pct = Math.max(0, Math.min(100, (part / whole) * 100));
    return `${Math.round(pct * 10) / 10}%`;
  }

  private loadDetails(): void {
    const stage = this.selectedStage();
    if (!stage) return;
    this.detailLoading.set(true);
    this.detailError.set('');
    const pageSizeParam =
      this.detailPageSize() === 0 ? 'all' : String(this.effectiveDetailPageSize());
    let params = new HttpParams()
      .set('year', this.year())
      .set('level', this.level())
      .set('stage', stage)
      .set('page', String(this.detailPage()))
      .set('pageSize', pageSizeParam);
    const q = this.detailSearch().trim();
    if (q) params = params.set('search', q);

    this.http
      .get<DetailResponse>(`${environment.apiUrl}/dashboard/copy-scan-status/details`, { params })
      .subscribe({
        next: (res) => {
          this.detailColumns.set(res.columns ?? []);
          this.detailRows.set(res.rows ?? []);
          this.detailTotalRows.set(res.totalRows ?? 0);
          this.detailTotalCopies.set(res.totalCopies ?? 0);
          this.detailMessage.set(res.available === false ? res.message || '' : '');
          this.detailLoading.set(false);
        },
        error: () => {
          this.detailRows.set([]);
          this.detailColumns.set([]);
          this.detailLoading.set(false);
          this.detailError.set('Could not load stage details.');
        }
      });
  }

  private pctNum(part: number, whole: number): number | null {
    if (!whole) return null;
    return Math.round((part / whole) * 1000) / 10;
  }
}

function fmt(n: number): string {
  return new Intl.NumberFormat('en-IN').format(n);
}
