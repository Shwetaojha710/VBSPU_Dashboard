import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { environment } from '../../../../environments/environment';

interface SupervisionRow {
  shift: string;
  meetingName: string;
  time: string;
  male: number;
  female: number;
  total: number;
  absentMale: number;
  absentFemale: number;
  absentTotal: number;
  ufm: { male: number; female: number; total: number; action: string };
  staffCases: { count: number; action: string };
  remarks: string;
}

interface SupervisionReport {
  date: string;
  session: string | null;
  university: string;
  titleHi: string;
  rows: SupervisionRow[];
  totals: {
    male: number;
    female: number;
    total: number;
    absentMale: number;
    absentFemale: number;
    absentTotal: number;
  };
}

/** Date-wise exam supervision प्रपत्र: dropdown → table → PDF download. */
@Component({
  selector: 'app-exam-supervision',
  imports: [RouterLink, FormsModule],
  templateUrl: './exam-supervision.component.html',
  styleUrl: './exam-supervision.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExamSupervisionComponent implements OnInit {
  private readonly http = inject(HttpClient);

  protected readonly dates = signal<string[]>([]);
  protected readonly selectedDate = signal('');
  protected readonly report = signal<SupervisionReport | null>(null);
  protected readonly loadingDates = signal(true);
  protected readonly loadingReport = signal(false);
  protected readonly error = signal('');

  protected readonly busy = computed(() => this.loadingDates() || this.loadingReport());

  ngOnInit(): void {
    this.http.get<{ dates: string[] }>(`${environment.apiUrl}/dashboard/exam-supervision/dates`).subscribe({
      next: (res) => {
        const list = [...(res.dates ?? [])].sort();
        this.dates.set(list);
        this.loadingDates.set(false);
        if (!list.length) {
          return;
        }
        // Prefer today's exam date (local calendar day); else nearest upcoming, else last.
        const today = localIsoDate();
        const upcoming = list.find((d) => d >= today);
        const initial = list.includes(today) ? today : upcoming ?? list[list.length - 1];
        this.selectedDate.set(initial);
        this.loadReport(initial);
      },
      error: () => {
        this.loadingDates.set(false);
        this.error.set('Could not load exam dates.');
      }
    });
  }

  protected onDateChange(value: string): void {
    this.selectedDate.set(value);
    if (value) {
      this.loadReport(value);
    } else {
      this.report.set(null);
    }
  }

  protected downloadPdf(): void {
    const report = this.report();
    if (!report) {
      this.error.set('Load a report first, then download PDF.');
      return;
    }
    this.error.set('');
    const html = buildPrintHtml(report);

    // Hidden iframe avoids popup-blocker / noopener issues with window.open.
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(iframe);

    const win = iframe.contentWindow;
    const doc = win?.document;
    if (!win || !doc) {
      iframe.remove();
      this.error.set('Could not open print view for PDF.');
      return;
    }

    doc.open();
    doc.write(html);
    doc.close();

    const cleanup = () => {
      setTimeout(() => iframe.remove(), 500);
    };
    win.addEventListener('afterprint', cleanup, { once: true });

    // Let the document paint, then open the system print dialog (Save as PDF).
    setTimeout(() => {
      try {
        win.focus();
        win.print();
      } catch {
        this.error.set('Print dialog failed. Try again or allow printing in the browser.');
      } finally {
        // Fallback cleanup if afterprint never fires (some browsers).
        setTimeout(cleanup, 2000);
      }
    }, 300);
  }

  private loadReport(date: string): void {
    this.loadingReport.set(true);
    this.error.set('');
    this.http
      .get<SupervisionReport>(`${environment.apiUrl}/dashboard/exam-supervision`, { params: { date } })
      .subscribe({
        next: (res) => {
          this.report.set(res);
          this.loadingReport.set(false);
        },
        error: () => {
          this.report.set(null);
          this.loadingReport.set(false);
          this.error.set('Could not load supervision data for this date.');
        }
      });
  }
}

/** Local calendar date as YYYY-MM-DD (matches exam-supervision API dates). */
function localIsoDate(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDisplayDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d}-${months[m - 1]}-${y}`;
}

function buildPrintHtml(report: SupervisionReport): string {
  const rowHtml = report.rows
    .map(
      (r, i) => `
    <tr>
      ${i === 0 ? `<td rowspan="${report.rows.length + 1}" class="date">${esc(formatDisplayDate(report.date))}</td>` : ''}
      <td class="shift"><strong>${esc(r.shift)}</strong><br/>${esc(r.time)}</td>
      <td>${r.male}</td><td>${r.female}</td><td>${r.total}</td>
      <td>${r.absentMale}</td><td>${r.absentFemale}</td><td>${r.absentTotal}</td>
      <td>${r.ufm.male}</td><td>${r.ufm.female}</td><td>${r.ufm.total}</td><td>${esc(r.ufm.action)}</td>
      <td>${r.staffCases.count}</td><td>${esc(r.staffCases.action)}</td>
      <td>${esc(r.remarks)}</td>
    </tr>`
    )
    .join('');

  const t = report.totals;
  return `<!doctype html>
<html lang="hi">
<head>
  <meta charset="utf-8" />
  <title>Exam Supervision – ${esc(report.date)}</title>
  <style>
    body { font-family: "Noto Sans Devanagari", "Mangal", Arial, sans-serif; margin: 24px; color: #111; }
    h1, h2, p { text-align: center; margin: 4px 0; }
    h1 { font-size: 18px; }
    h2 { font-size: 15px; font-weight: 600; }
    .meta { margin: 12px 0 16px; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { border: 1px solid #222; padding: 4px 5px; text-align: center; vertical-align: middle; }
    th { background: #f3f3f3; }
    .date, .shift { text-align: left; }
    .sign { margin-top: 36px; text-align: right; font-size: 13px; }
    @media print { body { margin: 8mm; } }
  </style>
</head>
<body>
  <h1>वीर बहादुर सिंह पूर्वांचल विश्वविद्यालय, जौनपुर</h1>
  <h2>${esc(report.university)}</h2>
  <p class="meta">स्नातक व परास्नातक प्रथम, तृतीय एवं पंचम सेमेस्टर / वार्षिक परीक्षा सत्र :- ${esc(report.session ?? '')}</p>
  <p><strong>${esc(report.titleHi)}</strong></p>
  <table>
    <thead>
      <tr>
        <th rowspan="2">परीक्षा की तिथि</th>
        <th rowspan="2">पाली का विवरण</th>
        <th colspan="3">परीक्षाार्थियों की संख्या</th>
        <th colspan="3">अनुपस्थित परीक्षाार्थियों की संख्या</th>
        <th colspan="4">अनुचित साधन के प्रयोग में आरोपित अभ्यर्थी तथा उनके विरुद्ध कार्यवाही</th>
        <th colspan="2">कॉलेज प्रबंधन / शिक्षक आदि</th>
        <th rowspan="2">अभ्युक्ति</th>
      </tr>
      <tr>
        <th>छात्र</th><th>छात्राएं</th><th>कुल</th>
        <th>छात्र</th><th>छात्राएं</th><th>कुल</th>
        <th>छात्र</th><th>छात्राएं</th><th>कुल</th><th>कार्यवाही</th>
        <th>संख्या</th><th>कार्यवाही</th>
      </tr>
    </thead>
    <tbody>
      ${rowHtml}
      <tr>
        <td><strong>योग</strong></td>
        <td><strong>${t.male}</strong></td>
        <td><strong>${t.female}</strong></td>
        <td><strong>${t.total}</strong></td>
        <td><strong>${t.absentMale}</strong></td>
        <td><strong>${t.absentFemale}</strong></td>
        <td><strong>${t.absentTotal}</strong></td>
        <td>0</td><td>0</td><td>0</td><td></td>
        <td>0</td><td></td>
        <td></td>
      </tr>
    </tbody>
  </table>
  <p class="sign">Controller of Examinations</p>
  <script>window.onload = function () { /* print triggered by opener */ };</script>
</body>
</html>`;
}
