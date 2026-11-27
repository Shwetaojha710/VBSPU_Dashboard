import { DecimalPipe } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { environment } from '../../../../environments/environment';

interface PipelineStages {
  barcodeCoded: number;
  allotted: number;
  receivedAfterEval: number;
  flap: { scannedImported: number; available: boolean };
  omr: { scannedImported: number };
  award: { scannedImported: number };
}

interface StatusResponse {
  year: string;
  level: string;
  stages: PipelineStages;
}

interface StageChip {
  step: number;
  label: string;
  value: number;
  tone: 'base' | 'ok' | 'mid' | 'scan' | 'warn';
}

const indian = new Intl.NumberFormat('en-IN');

/** Overview card: copy barcode → allot → scan pipeline summary. */
@Component({
  selector: 'app-copy-scan-status-card',
  imports: [DecimalPipe],
  templateUrl: './copy-scan-status-card.component.html',
  styleUrl: './copy-scan-status-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CopyScanStatusCardComponent implements OnInit {
  private readonly http = inject(HttpClient);

  protected readonly year = signal(String(new Date().getFullYear()));
  protected readonly stages = signal<PipelineStages | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal(false);

  protected readonly chips = computed((): StageChip[] => {
    const s = this.stages();
    if (!s) return [];
    return [
      { step: 1, label: 'Barcode', value: s.barcodeCoded, tone: 'base' },
      { step: 2, label: 'Allotted', value: s.allotted, tone: 'ok' },
      { step: 3, label: 'Received', value: s.receivedAfterEval, tone: 'mid' },
      { step: 4, label: 'Flap', value: s.flap.available ? s.flap.scannedImported : 0, tone: 'scan' },
      { step: 5, label: 'OMR', value: s.omr.scannedImported, tone: 'scan' },
      { step: 6, label: 'Award', value: s.award.scannedImported, tone: 'warn' }
    ];
  });

  protected readonly headline = computed(() => {
    const s = this.stages();
    if (!s) return null;
    return {
      coded: indian.format(s.barcodeCoded),
      allotted: indian.format(s.allotted),
      omr: indian.format(s.omr.scannedImported),
      award: indian.format(s.award.scannedImported)
    };
  });

  ngOnInit(): void {
    this.http
      .get<{ years: string[]; defaultYear: string }>(`${environment.apiUrl}/dashboard/copy-scan-status/filters`)
      .subscribe({
        next: (res) => {
          const y = res.defaultYear || res.years?.[0] || this.year();
          this.year.set(y);
          this.loadStatus(y);
        },
        error: () => {
          this.loadStatus(this.year());
        }
      });
  }

  private loadStatus(year: string): void {
    const params = new HttpParams().set('year', year).set('level', 'all');
    this.http.get<StatusResponse>(`${environment.apiUrl}/dashboard/copy-scan-status`, { params }).subscribe({
      next: (res) => {
        this.stages.set(res.stages);
        if (res.year) this.year.set(res.year);
        this.loading.set(false);
        this.error.set(false);
      },
      error: () => {
        this.stages.set(null);
        this.loading.set(false);
        this.error.set(true);
      }
    });
  }
}
