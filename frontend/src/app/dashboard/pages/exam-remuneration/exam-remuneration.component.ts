import { DecimalPipe } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { environment } from '../../../../environments/environment';

interface RemunerationRow {
  evlCode: string | null;
  examinerName: string | null;
  examinerCollege: string | null;
  natureOfAppointment: string | null;
  subject: string | null;
  bankAccNo: string | null;
  ifsc: string | null;
  totalCopiesUg: number;
  totalCopiesPg: number;
  returnCopies: number;
  remunerationUg: number;
  remunerationPg: number;
  da: number;
  ta: number;
  paperSetter: number;
  grandTotal: number;
  verified: boolean;
  canEdit: boolean;
}

type AllowanceField = 'da' | 'ta' | 'paperSetter';

interface BillLot {
  lotNo: string | null;
  course: string | null;
  year: string | null;
  paperCode: string | null;
  paperName: string | null;
  level: string | null;
  totalCopies: number;
  returnCopies: number;
  netCopies: number;
  rate: number;
  amount: number;
  dateAllot: string | null;
  dateReceived: string | null;
}

interface BillLevelBlock {
  lotCount: number;
  rate: number;
  copies: number;
  returned: number;
  net: number;
  amount: number;
  lots: BillLot[];
}

interface BillDetails {
  billDate?: string;
  profile: {
    evaluatorCode: string | null;
    name: string | null;
    designation: string | null;
    address: string | null;
    college: string | null;
    subject: string | null;
    natureOfAppointment?: string | null;
    panNo: string | null;
    mobileNo: string | null;
    bankName: string | null;
    bankBranch: string | null;
    bankAccNo: string | null;
    ifsc: string | null;
  };
  lots: BillLot[];
  ug?: BillLevelBlock;
  pg?: BillLevelBlock;
  summary?: {
    remunerationUg: number;
    remunerationPg: number;
    da: number;
    ta: number;
    paperSetter: number;
    grandTotal: number;
  };
  totalAmount: number;
  verified?: boolean;
  canEdit?: boolean;
}

/** Examiner Remuneration Report — same SP data as vbspuresult Admin report (select-only). */
@Component({
  selector: 'app-exam-remuneration',
  imports: [RouterLink, FormsModule, DecimalPipe],
  templateUrl: './exam-remuneration.component.html',
  styleUrl: './exam-remuneration.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExamRemunerationComponent implements OnInit {
  private readonly http = inject(HttpClient);

  protected readonly subjects = signal<string[]>([]);
  protected readonly natures = signal<string[]>([]);
  protected readonly years = signal<string[]>([]);
  protected readonly rows = signal<RemunerationRow[]>([]);
  protected readonly searchQuery = signal('');
  protected readonly page = signal(1);
  protected readonly pageSize = signal(25);
  protected readonly loadingFilters = signal(true);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly bill = signal<BillDetails | null>(null);
  protected readonly billLoading = signal(false);
  protected readonly billError = signal('');
  protected readonly savingKey = signal('');

  protected filters = {
    year: String(new Date().getFullYear()),
    subject: '',
    nature: '',
    evlCode: ''
  };

  protected readonly filteredRows = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const list = this.rows();
    if (!q) return list;
    return list.filter((r) => rowMatchesQuery(r, q));
  });

  protected readonly totalPages = computed(() => {
    const total = this.filteredRows().length;
    const size = this.pageSize();
    return total ? Math.ceil(total / size) : 1;
  });

  protected readonly pagedRows = computed(() => {
    const size = this.pageSize();
    const start = (this.page() - 1) * size;
    return this.filteredRows().slice(start, start + size);
  });

  protected readonly pageStart = computed(() => {
    if (!this.filteredRows().length) return 0;
    return (this.page() - 1) * this.pageSize() + 1;
  });

  protected readonly pageEnd = computed(() => {
    if (!this.filteredRows().length) return 0;
    return Math.min(this.pageStart() + this.pageSize() - 1, this.filteredRows().length);
  });

  ngOnInit(): void {
    this.http
      .get<{ subjects: string[]; natures: string[]; years: string[]; defaultYear?: string }>(
        `${environment.apiUrl}/dashboard/exam-remuneration/filters`
      )
      .subscribe({
        next: (res) => {
          this.subjects.set(res.subjects ?? []);
          this.natures.set(res.natures ?? []);
          this.years.set(res.years ?? []);
          const current = String(res.defaultYear || new Date().getFullYear());
          if (!this.filters.year || !res.years?.includes(this.filters.year)) {
            this.filters.year = res.years?.includes(current) ? current : res.years?.[0] || current;
          }
          this.loadingFilters.set(false);
          this.search();
        },
        error: () => {
          this.loadingFilters.set(false);
          this.error.set('Could not load filter options.');
        }
      });
  }

  protected search(): void {
    this.loading.set(true);
    this.error.set('');
    this.page.set(1);
    let params = new HttpParams();
    if (this.filters.year.trim()) params = params.set('year', this.filters.year.trim());
    if (this.filters.subject.trim()) params = params.set('subject', this.filters.subject.trim());
    if (this.filters.nature.trim()) params = params.set('nature', this.filters.nature.trim());
    if (this.filters.evlCode.trim()) params = params.set('examinerCode', this.filters.evlCode.trim());

    this.http
      .get<{ rows: RemunerationRow[]; totalRecord: number }>(`${environment.apiUrl}/dashboard/exam-remuneration`, { params })
      .subscribe({
        next: (res) => {
          this.rows.set(res.rows ?? []);
          this.searchQuery.set('');
          this.loading.set(false);
        },
        error: () => {
          this.rows.set([]);
          this.loading.set(false);
          this.error.set('Could not load remuneration report.');
        }
      });
  }

  protected reset(): void {
    const current = String(new Date().getFullYear());
    const year = this.years().includes(current) ? current : this.years()[0] || current;
    this.filters = { year, subject: '', nature: '', evlCode: '' };
    this.searchQuery.set('');
    this.search();
  }

  protected onSearchChange(value: string): void {
    this.searchQuery.set(value);
    this.page.set(1);
  }

  protected firstPage(): void {
    this.page.set(1);
  }

  protected prevPage(): void {
    this.page.update((p) => Math.max(1, p - 1));
  }

  protected nextPage(): void {
    this.page.update((p) => Math.min(this.totalPages(), p + 1));
  }

  protected lastPage(): void {
    this.page.set(this.totalPages());
  }

  protected exportExcel(): void {
    const list = this.filteredRows();
    if (!list.length) {
      this.error.set('No rows to export.');
      return;
    }
    const headers = [
      'Evl Code',
      'Examiner Name',
      'Examiner College Name',
      'Nature of Appointment',
      'Subject',
      'Bank Acc. No',
      'IFSC',
      'Total Copies UG',
      'Total Copies PG',
      'Remuneration UG',
      'Remuneration PG',
      'DA',
      'TA',
      'Paper Setter',
      'Grand Total',
      'Verified'
    ];
    const lines = [
      headers.join(','),
      ...list.map((r) =>
        [
          csv(r.evlCode),
          csv(r.examinerName),
          csv(r.examinerCollege),
          csv(r.natureOfAppointment),
          csv(r.subject),
          csv(r.bankAccNo),
          csv(r.ifsc),
          r.totalCopiesUg,
          r.totalCopiesPg,
          r.remunerationUg,
          r.remunerationPg,
          r.da,
          r.ta,
          r.paperSetter,
          r.grandTotal,
          r.verified ? 'Yes' : 'No'
        ].join(',')
      )
    ];
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'examiner-remuneration-report.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  protected viewBill(row: RemunerationRow): void {
    const code = row.evlCode?.trim();
    if (!code) {
      this.billError.set('Missing evaluator code.');
      return;
    }
    this.bill.set(null);
    this.billError.set('');
    this.billLoading.set(true);
    this.http.get<BillDetails>(`${environment.apiUrl}/dashboard/exam-remuneration/${encodeURIComponent(code)}/bill`).subscribe({
      next: (res) => {
        this.bill.set(res);
        this.billLoading.set(false);
      },
      error: () => {
        this.billLoading.set(false);
        this.billError.set('Could not load bill details.');
      }
    });
  }

  protected closeBill(): void {
    this.bill.set(null);
    this.billError.set('');
    this.billLoading.set(false);
  }

  protected amountInWords(amount: number): string {
    return `Rupees ${numberToWords(Math.round(amount || 0))} Only`;
  }

  protected printBill(): void {
    const bill = this.bill();
    if (!bill) return;
    const html = buildBillPrintHtml(bill, this.amountInWords(bill.summary?.grandTotal ?? bill.totalAmount));
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(iframe);
    const win = iframe.contentWindow;
    const doc = win?.document;
    if (!win || !doc) {
      iframe.remove();
      return;
    }
    doc.open();
    doc.write(html);
    doc.close();
    const cleanup = () => setTimeout(() => iframe.remove(), 500);
    win.addEventListener('afterprint', cleanup, { once: true });
    setTimeout(() => {
      win.focus();
      win.print();
      setTimeout(cleanup, 2000);
    }, 300);
  }

  protected editAllowance(row: RemunerationRow, field: AllowanceField): void {
    if (!row.evlCode || !row.canEdit) {
      this.error.set(row.verified ? 'Verified — unverify to edit.' : 'Missing evaluator code.');
      return;
    }
    const labels: Record<AllowanceField, string> = {
      da: 'DA',
      ta: 'TA',
      paperSetter: 'Paper Setter'
    };
    const current = row[field];
    const raw = window.prompt(`Update ${labels[field]} for ${row.evlCode}`, String(current ?? 0));
    if (raw == null) return;
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount < 0) {
      this.error.set('Enter a valid non-negative amount.');
      return;
    }

    const key = `${row.evlCode}:${field}`;
    this.savingKey.set(key);
    this.error.set('');
    this.http
      .post<{ ok: boolean; message?: string }>(
        `${environment.apiUrl}/dashboard/exam-remuneration/${encodeURIComponent(row.evlCode)}/allowance`,
        { field, amount }
      )
      .subscribe({
        next: () => {
          this.rows.update((list) =>
            list.map((item) => {
              if (item.evlCode !== row.evlCode) return item;
              const next = { ...item, [field]: amount };
              next.grandTotal = next.remunerationUg + next.remunerationPg + next.da + next.ta + next.paperSetter;
              return next;
            })
          );
          this.savingKey.set('');
        },
        error: (err) => {
          this.savingKey.set('');
          this.error.set(err?.error?.message || 'Could not update allowance.');
        }
      });
  }

  protected toggleVerified(row: RemunerationRow): void {
    if (!row.evlCode) return;
    const nextVerified = !row.verified;
    const key = `${row.evlCode}:verify`;
    this.savingKey.set(key);
    this.error.set('');
    this.http
      .post<{ ok: boolean; verified: boolean }>(
        `${environment.apiUrl}/dashboard/exam-remuneration/${encodeURIComponent(row.evlCode)}/verify`,
        { verified: nextVerified }
      )
      .subscribe({
        next: (res) => {
          const verified = res.verified ?? nextVerified;
          this.rows.update((list) =>
            list.map((item) =>
              item.evlCode === row.evlCode ? { ...item, verified, canEdit: !verified } : item
            )
          );
          this.savingKey.set('');
        },
        error: (err) => {
          this.savingKey.set('');
          this.error.set(err?.error?.message || 'Could not update verification.');
        }
      });
  }

  protected isSaving(row: RemunerationRow, part: string): boolean {
    return this.savingKey() === `${row.evlCode}:${part}`;
  }
}

function rowMatchesQuery(row: RemunerationRow, q: string): boolean {
  const haystack = [
    row.evlCode,
    row.examinerName,
    row.examinerCollege,
    row.natureOfAppointment,
    row.subject,
    row.bankAccNo,
    row.ifsc,
    row.totalCopiesUg,
    row.totalCopiesPg,
    row.remunerationUg,
    row.remunerationPg,
    row.da,
    row.ta,
    row.paperSetter,
    row.grandTotal
  ]
    .map((v) => String(v ?? '').toLowerCase())
    .join(' ');
  return haystack.includes(q);
}

function csv(value: unknown): string {
  const s = value == null ? '' : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function money(value: number): string {
  return Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function numberToWords(n: number): string {
  if (n === 0) return 'Zero';
  const ones = [
    '',
    'One',
    'Two',
    'Three',
    'Four',
    'Five',
    'Six',
    'Seven',
    'Eight',
    'Nine',
    'Ten',
    'Eleven',
    'Twelve',
    'Thirteen',
    'Fourteen',
    'Fifteen',
    'Sixteen',
    'Seventeen',
    'Eighteen',
    'Nineteen'
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const chunk = (num: number): string => {
    if (num < 20) return ones[num];
    if (num < 100) return `${tens[Math.floor(num / 10)]}${num % 10 ? ' ' + ones[num % 10] : ''}`.trim();
    return `${ones[Math.floor(num / 100)]} Hundred${num % 100 ? ' ' + chunk(num % 100) : ''}`.trim();
  };
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const rest = n % 1000;
  const parts: string[] = [];
  if (crore) parts.push(`${chunk(crore)} Crore`);
  if (lakh) parts.push(`${chunk(lakh)} Lakh`);
  if (thousand) parts.push(`${chunk(thousand)} Thousand`);
  if (rest) parts.push(chunk(rest));
  return parts.join(' ');
}

function lotRowsHtml(lots: BillLot[]): string {
  if (!lots.length) {
    return `<tr><td colspan="12" style="text-align:center">No lots</td></tr>`;
  }
  return lots
    .map(
      (lot, i) => `<tr>
      <td>${i + 1}</td>
      <td>${esc(lot.lotNo)}</td>
      <td>${esc(lot.course)}</td>
      <td>${esc(lot.year)}</td>
      <td>${esc(lot.paperCode)} ${esc(lot.paperName)}</td>
      <td>${esc(lot.dateAllot)}</td>
      <td>${esc(lot.dateReceived)}</td>
      <td class="num">${lot.totalCopies}</td>
      <td class="num">${lot.returnCopies}</td>
      <td class="num">${lot.netCopies}</td>
      <td class="num">${lot.rate}</td>
      <td class="num">${money(lot.amount)}</td>
    </tr>`
    )
    .join('');
}

function buildBillPrintHtml(bill: BillDetails, amountWords: string): string {
  const p = bill.profile;
  const ug = bill.ug;
  const pg = bill.pg;
  const s = bill.summary;
  return `<!doctype html><html><head><meta charset="utf-8"/><title>Examiner Bill – ${esc(p.evaluatorCode)}</title>
  <style>
    body{font-family:Arial,sans-serif;color:#111;padding:18px;font-size:12px}
    h1{margin:0;text-align:center;font-size:18px}
    .badge{display:inline-block;margin:8px auto 14px;padding:4px 12px;border-radius:999px;background:#1f4b7a;color:#fff;font-size:11px;font-weight:700}
    .center{text-align:center}
    table{width:100%;border-collapse:collapse;margin-top:8px}
    th,td{border:1px solid #333;padding:5px 6px;vertical-align:top}
    th{background:#eef3f8}
    .meta td{width:25%}
    .num{text-align:right}
    .section{margin-top:14px;font-weight:700}
    .summary{width:360px;margin-left:auto}
    .grand td{background:#1f4b7a;color:#fff;font-weight:700}
    .signs{display:flex;justify-content:space-between;margin-top:42px}
    .signs div{width:30%;text-align:center;border-top:1px solid #333;padding-top:6px}
    @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style></head><body>
  <h1>Veer Bahadur Singh Purvanchal University, Jaunpur</h1>
  <div class="center"><span class="badge">ANNEXURE — EVALUATION REMUNERATION</span></div>
  <table class="meta">
    <tr><td><b>Evaluator Code</b><br/>${esc(p.evaluatorCode)}</td><td><b>Bill Date</b><br/>${esc(bill.billDate || '')}</td>
    <td><b>Examiner Name</b><br/>${esc(p.name || '')}</td><td><b>Subject</b><br/>${esc(p.subject || '')}</td></tr>
    <tr><td colspan="2"><b>College</b><br/>${esc(p.college || '')}</td><td><b>Nature of Appointment</b><br/>${esc(p.natureOfAppointment || '')}</td>
    <td><b>IFSC</b><br/>${esc(p.ifsc || '')}</td></tr>
    <tr><td colspan="2"><b>Bank / A/c No.</b><br/>${esc(p.bankName || '')} / ${esc(p.bankAccNo || '')}</td>
    <td colspan="2"><b>Mobile</b><br/>${esc(p.mobileNo || '')}</td></tr>
  </table>
  ${
    ug
      ? `<div class="section">COPIES EVALUATED — UG (${ug.lotCount} LOT(S), RS ${ug.rate} PER COPY)</div>
  <table><thead><tr>
    <th>S.No</th><th>Lot No</th><th>Course</th><th>Year</th><th>Paper</th><th>Allotted</th><th>Received</th>
    <th>Copies</th><th>Returned</th><th>Net</th><th>Rate</th><th>Amount (Rs)</th>
  </tr></thead><tbody>${lotRowsHtml(ug.lots)}</tbody>
  <tfoot><tr><td colspan="7"><b>UG Total</b></td><td class="num">${ug.copies}</td><td class="num">${ug.returned}</td>
  <td class="num">${ug.net}</td><td></td><td class="num">${money(ug.amount)}</td></tr></tfoot></table>`
      : ''
  }
  ${
    pg && pg.lotCount
      ? `<div class="section">COPIES EVALUATED — PG (${pg.lotCount} LOT(S), RS ${pg.rate} PER COPY)</div>
  <table><thead><tr>
    <th>S.No</th><th>Lot No</th><th>Course</th><th>Year</th><th>Paper</th><th>Allotted</th><th>Received</th>
    <th>Copies</th><th>Returned</th><th>Net</th><th>Rate</th><th>Amount (Rs)</th>
  </tr></thead><tbody>${lotRowsHtml(pg.lots)}</tbody>
  <tfoot><tr><td colspan="7"><b>PG Total</b></td><td class="num">${pg.copies}</td><td class="num">${pg.returned}</td>
  <td class="num">${pg.net}</td><td></td><td class="num">${money(pg.amount)}</td></tr></tfoot></table>`
      : ''
  }
  <table class="summary">
    <tr><td>Remuneration UG (${s?.remunerationUg != null ? '' : ''}${ug?.net ?? 0} copies)</td><td class="num">${money(s?.remunerationUg ?? 0)}</td></tr>
    <tr><td>Remuneration PG (${pg?.net ?? 0} copies)</td><td class="num">${money(s?.remunerationPg ?? 0)}</td></tr>
    <tr><td>Dearness Allowance (DA)</td><td class="num">${money(s?.da ?? 0)}</td></tr>
    <tr><td>Travelling Allowance (TA)</td><td class="num">${money(s?.ta ?? 0)}</td></tr>
    <tr><td>Paper Setter</td><td class="num">${money(s?.paperSetter ?? 0)}</td></tr>
    <tr class="grand"><td>Grand Total (Rs)</td><td class="num">${money(s?.grandTotal ?? bill.totalAmount)}</td></tr>
  </table>
  <p><b>Amount in words:</b> ${esc(amountWords)}</p>
  <div class="signs"><div>Examiner's Signature</div><div>Checked By</div><div>Controller of Examinations</div></div>
  </body></html>`;
}
