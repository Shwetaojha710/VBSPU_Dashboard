export type IconName =
  | 'home'
  | 'blocks'
  | 'graduation-cap'
  | 'box'
  | 'brain'
  | 'landmark'
  | 'network'
  | 'briefcase'
  | 'messages'
  | 'message-circle'
  | 'map-pin'
  | 'id-badge'
  | 'layers'
  | 'clipboard-check'
  | 'settings'
  | 'chevron-right'
  | 'chevron-down'
  | 'search'
  | 'bell'
  | 'clipboard-list'
  | 'circle-check'
  | 'student'
  | 'faculty'
  | 'approval'
  | 'message-question'
  | 'exam-sheet'
  | 'scholar'
  | 'rupee'
  | 'presentation'
  | 'code-window'
  | 'pulse'
  | 'file-text'
  | 'square-check'
  | 'clock'
  | 'folder'
  | 'users'
  | 'bar-chart'
  | 'calendar'
  | 'book-open'
  | 'grid-squares';

export interface NavItem {
  label: string;
  /** Route path of the section; empty for the overview. */
  path: string;
  icon: IconName;
  hasChildren?: boolean;
  /** Long label set at the smaller size used in the design. */
  dense?: boolean;
}

export interface HeaderAction {
  label: string;
  /** Route of the page the icon opens. */
  path: string;
  icon: IconName;
  count: number;
}

export interface UserMenuItem {
  label: string;
  path: string;
}

export interface HeaderData {
  date: string;
  time: string;
  searchPlaceholder: string;
  actions: HeaderAction[];
  user: { name: string; avatar: string; menu: UserMenuItem[] };
}

export type TrendDirection = 'up' | 'down';

export interface StatCard {
  /** Identifies cards whose value comes from the database (see DashboardSummary). */
  key?: keyof DashboardSummary['stats'];
  title: string;
  /** Section route opened when the card is clicked. */
  link?: string;
  value: string;
  icon: IconName;
  trend?: { direction: TrendDirection; value: string };
  /** Accent text shown instead of a trend (e.g. "S.4 Lakh"). */
  highlight?: string;
  caption?: string;
  /** Shows the small "v" marker before the caption. */
  captionMarker?: boolean;
  /** Ring progress used by the Fee Collection card. */
  progress?: { percent: number; lines: string[] };
}

export interface EvaluationMetric {
  value: string;
  label: string;
  percent?: string;
}

export interface FeeCollectionData {
  title: string;
  collected: { label: string; display: string; percent: number };
  target: { label: string; value: number; display: string };
  axis: { label: string; max: number; ticks: number[] };
}

export interface DistrictData {
  name: string;
  count: number;
}

export interface AffiliatedCollegesData {
  title: string;
  linkLabel: string;
  totalLabel: string;
  total: number;
  districts: DistrictData[];
}

export interface ChartSeries {
  name: string;
  /** Legend dot colour. */
  color: string;
  /** Bar gradient, top to bottom. */
  gradient: [string, string];
}

export interface ChartGroup {
  label: string;
  /** Bar heights in axis units, one per series. */
  values: number[];
  /** Labels printed above each bar, one per series. */
  labels: string[];
}

export interface BarChartData {
  title: string;
  /** Legend-only entries are listed in `legend`; `series` defines the drawn bars. */
  legend: { name: string; color: string }[];
  series: ChartSeries[];
  yTicks: { value: number; label: string }[];
  yMax: number;
  groups: ChartGroup[];
  /** Draw a trend line through the tops of the first series. */
  trendLine?: boolean;
}

export interface PanelHeading {
  title: string;
  /** Muted text after the title, e.g. "(This Year)". */
  period?: string;
  linkLabel?: string;
  /** Section route opened by the panel. */
  link?: string;
}

export interface ResearchQualityData extends PanelHeading {
  publications: { value: string; label: string; trend: string; note: string };
  scholars: { value: string; label: string; progress: string; progressLabel: string };
  seedProjects: { value: string; label: string; aishe: string; status: string };
  target: { percent: number; label: string };
}

export interface FacultyDevelopmentData extends PanelHeading {
  items: { icon: IconName; value: string; label: string }[];
  target: { percent: number; label: string };
}

export interface IntegrationsData extends PanelHeading {
  status: string;
  /** `logo` is an image path, or the keyword "samarth" / "teqip" for drawn marks. */
  items: { name: string; status: string; logo: string }[];
}

export interface MetricCard {
  value: string;
  label: string;
  icon?: IconName;
  trend?: string;
  note?: string;
}

export interface MetricCardsData extends PanelHeading {
  items: MetricCard[];
}

export interface InsightItem {
  title: string;
  text: string;
  highlight?: boolean;
  link?: string;
}

export interface InsightsData extends PanelHeading {
  badge: string;
  items: InsightItem[];
}

export interface FunnelData extends PanelHeading {
  stages: { label: string; value: string; percent: string; color: string }[];
}

export interface QuickAccessData extends PanelHeading {
  items: { label: string; icon: IconName; link: string }[];
}

export interface ActivityData extends PanelHeading {
  items: { title: string; detail: string; time: string }[];
}

export interface EventsData extends PanelHeading {
  items: { day: string; month: string; title: string; time: string; location: string; tone: 'orange' | 'blue' }[];
}

/** Response of GET /api/dashboard/summary (aggregates from the *_vbspu tables). */
export interface DashboardSummary {
  source: 'database';
  generatedAt: string;
  stats: {
    totalStudents: number;
    affiliatedColleges: number;
    collegeDistricts: number;
    facultyAndStaff: number;
    pendingApprovals: number;
  };
  collegesByDistrict: { name: string; colleges: number }[];
}

export interface DashboardData {
  university: { shortName: string; subtitle: string; logo: string };
  header: HeaderData;
  navigation: NavItem[];
  stats: StatCard[];
  digitalEvaluation: { title: string; metrics: EvaluationMetric[] };
  feeCollection: FeeCollectionData;
  affiliatedColleges: AffiliatedCollegesData;
  sparkline: number[];
  charts: {
    enrollment: BarChartData;
    examResults: BarChartData;
    grievances: BarChartData;
  };
  screen2: {
    researchQuality: ResearchQualityData;
    facultyDevelopment: FacultyDevelopmentData;
    integrations: IntegrationsData;
    communication: MetricCardsData;
    rti: MetricCardsData;
    aiInsights: InsightsData;
    funnel: FunnelData;
    quickAccess: QuickAccessData;
  };
  screen3: {
    activity: ActivityData;
    events: EventsData;
  };
}
