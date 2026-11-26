import { DASHBOARD_DATA } from './dashboard.data';

export interface SearchEntry {
  label: string;
  path: string;
  context: string;
  /** Extra words that should match this entry (students, colleges, reports…). */
  keywords?: string[];
}

/** Everything the header search can find, each with the page it opens. */
export const SEARCH_INDEX: SearchEntry[] = [
  ...DASHBOARD_DATA.navigation.map((n) => ({
    label: n.label,
    path: n.path,
    context: 'Section',
    keywords: keywordsForNav(n.label, n.path)
  })),
  ...DASHBOARD_DATA.stats.map((s) => ({
    label: s.title,
    path: s.link ?? '',
    context: 'Key metric',
    keywords: [] as string[]
  })),
  ...DASHBOARD_DATA.screen2.quickAccess.items.map((q) => ({
    label: q.label,
    path: q.link,
    context: 'Quick access',
    keywords: [] as string[]
  })),
  ...DASHBOARD_DATA.screen2.aiInsights.items.map((i) => ({
    label: i.title,
    path: i.link ?? '',
    context: 'AI insight',
    keywords: [] as string[]
  })),
  ...DASHBOARD_DATA.header.actions.map((a) => ({
    label: a.label,
    path: a.path,
    context: 'Header',
    keywords: keywordsForAction(a.label, a.path)
  })),
  ...DASHBOARD_DATA.header.user.menu.map((m) => ({
    label: m.label,
    path: m.path,
    context: 'Account',
    keywords: [] as string[]
  })),
  {
    label: 'Exam Status',
    path: 'exam-status',
    context: 'Report',
    keywords: ['exam', 'status', 'evaluation', 'digital evaluation']
  }
];

export function matchSearchEntries(query: string, limit = 12): SearchEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const scored = SEARCH_INDEX.map((entry) => ({ entry, score: scoreEntry(entry, q) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.label.localeCompare(b.entry.label));

  const seen = new Set<string>();
  const out: SearchEntry[] = [];
  for (const { entry } of scored) {
    const key = `${entry.path}::${entry.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
    if (out.length >= limit) break;
  }
  return out;
}

function scoreEntry(entry: SearchEntry, q: string): number {
  const label = entry.label.toLowerCase();
  const path = entry.path.toLowerCase().replace(/-/g, ' ');
  const keywords = (entry.keywords ?? []).map((k) => k.toLowerCase());
  const haystack = [label, path, entry.context.toLowerCase(), ...keywords].join(' ');

  if (label === q) return 100;
  if (label.startsWith(q)) return 80;
  if (keywords.some((k) => k === q)) return 70;
  if (label.includes(q)) return 60;
  if (keywords.some((k) => k.startsWith(q) || k.includes(q))) return 50;
  if (path.includes(q)) return 40;
  if (haystack.includes(q)) return 30;

  // Multi-word: every token must appear somewhere.
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length > 1 && tokens.every((t) => haystack.includes(t))) return 25;

  return 0;
}

function keywordsForNav(label: string, path: string): string[] {
  const map: Record<string, string[]> = {
    '': ['home', 'dashboard', 'overview'],
    'student-academic': ['students', 'student', 'academic', 'enrollment'],
    'affiliation-colleges': ['colleges', 'college', 'affiliated', 'affiliation'],
    'exams-certification': ['exams', 'exam', 'certification', 'results'],
    'exam-supervision': ['supervision', 'enquiry', 'center', 'centre'],
    'exam-evaluators': ['evaluators', 'evaluator', 'faculty list'],
    'exam-schedule': ['schedule', 'timetable', 'paper', 'meeting'],
    'exam-attendance': ['attendance', 'centre wise', 'feed', 'not feed'],
    'exam-remuneration': ['remuneration', 'renumeration', 'examiner bill', 'da', 'ta', 'copies', 'payment'],
    'copy-scan-status': ['copy', 'barcode', 'flap', 'omr', 'award', 'scan', 'allotment', 'evaluation'],
    'attendance-verification-summary': [
      'attendance',
      'verification',
      'verified',
      'declined',
      'present',
      'absent'
    ],
    'ai-teaching-faculty': ['faculty', 'staff', 'teaching', 'ai'],
    'research-quality': ['research', 'quality', 'naac', 'iqac'],
    'finance-hr-campus': ['finance', 'fee', 'fees', 'hr', 'campus'],
    grievances: ['complaint', 'grievance'],
    'e-office': ['files', 'file', 'office', 'approvals'],
    reports: ['report', 'reports'],
    scholarships: ['scholarship'],
    'digilocker-nad': ['digilocker', 'nad', 'locker'],
    settings: ['setting', 'preferences']
  };
  return map[path] ?? label.toLowerCase().split(/[\s/&]+/).filter(Boolean);
}

function keywordsForAction(label: string, path: string): string[] {
  const map: Record<string, string[]> = {
    notifications: ['alerts', 'bell'],
    reports: ['report', 'files', 'file'],
    approvals: ['approve', 'pending', 'files']
  };
  return map[path] ?? [label.toLowerCase()];
}
