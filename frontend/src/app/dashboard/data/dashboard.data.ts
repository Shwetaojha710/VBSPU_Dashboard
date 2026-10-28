import { DashboardData } from '../dashboard.models';
import dashboardJson from './dashboard.data.json';

/** Local mock data for the dashboard, bundled at build time. */
export const DASHBOARD_DATA = dashboardJson as DashboardData;
