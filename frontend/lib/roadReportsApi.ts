import { getDashboardJson } from './forecastApi';
import { type RoadReport, parseRoadReports } from './feeds/roadReports';

/**
 * What drivers are reporting on NLEX through Waze right now - accidents,
 * hazards and police - as the dashboard's Live Map pins them.
 *
 * Read from the dashboard's live overview (/api/map-comparison/live-overview),
 * in 2 KB rather than the map's 15 KB of road geometry. Road closures and
 * construction are left out on purpose: those reach the app as maintenance
 * notices, from the operators who schedule them.
 *
 * Which reports count, and how they are named, lives in feeds/roadReports -
 * the dashboard's own "Current alerts" rules, shared with the backend so Navie
 * reports what the Alerts tab shows.
 */

export type { RoadReport, RoadReportType } from './feeds/roadReports';
export { describeRoadReport } from './feeds/roadReports';

const PATH = '/api/map-comparison/live-overview';

/** Newest first. */
export async function fetchRoadReports(): Promise<RoadReport[]> {
  return parseRoadReports(await getDashboardJson(PATH));
}
