import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ExamStatusStore } from '../../data/exam-status.service';

const indian = new Intl.NumberFormat('en-IN');

/** Overview card: students appeared, and colleges online (fully settled) vs pending. */
@Component({
  selector: 'app-exam-status-card',
  templateUrl: './exam-status-card.component.html',
  styleUrl: './exam-status-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExamStatusCardComponent {
  private readonly store = inject(ExamStatusStore);

  protected readonly status = this.store.status;
  protected readonly error = this.store.error;

  protected readonly view = computed(() => {
    const s = this.status();
    if (!s) {
      return null;
    }
    const t = s.totals;
    const pct = (n: number) => (t.colleges ? Math.round((n / t.colleges) * 100) : 0);
    const maxReason = Math.max(1, ...s.reasons.map((r) => r.colleges));
    return {
      session: s.session,
      colleges: indian.format(t.colleges),
      online: indian.format(t.online),
      pending: indian.format(t.pending),
      onlinePct: pct(t.online),
      pendingPct: pct(t.pending),
      appeared: indian.format(t.appeared),
      registered: indian.format(t.registered),
      collegesAppeared: indian.format(t.collegesAppeared),
      reasons: s.reasons.map((r) => ({ ...r, value: indian.format(r.colleges), width: (r.colleges / maxReason) * 100 }))
    };
  });
}
