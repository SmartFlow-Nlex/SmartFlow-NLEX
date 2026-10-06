import { getExit } from '../constants/nlexSegments';
import { exitIdForSegment, getDashboardJson } from './forecastApi';
import reportCorridor from './nlexReportCorridor.json';

/**
 * What drivers are reporting on NLEX through Waze right now - accidents,
 * hazards and police - as the dashboard's Live Map pins them.
 *
 * Read from the dashboard's live overview (/api/map-comparison/live-overview):
 * the same Waze reports as the Live Map's feed, already narrowed to the
 * mainline and given their nearest exit, in 2 KB rather than the map's 15 KB
 * of road geometry. A report stays in it for as long as Waze keeps it alive,
 * up to the dashboard's 60-minute window, so a cleared accident leaves the
 * list on its own.
 *
 * Road closures and construction are left out on purpose: those reach the app
 * as maintenance notices, from the operators who schedule them.
 *
 * Every other rule is the dashboard's own "Current alerts" list
 * (WazeLiveModal.tsx), so the two cannot disagree about which reports exist:
 * a report more than 200 m off the mainline is dropped (Waze brands its slip
 * roads, so a street name alone lets through hazards 1.8 km away), and so is
 * one other drivers have disputed.
 */

const PATH = '/api/map-comparison/live-overview';

export type RoadReportType = 'ACCIDENT' | 'HAZARD' | 'POLICE';

const TYPES: RoadReportType[] = ['ACCIDENT', 'HAZARD', 'POLICE'];

export interface RoadReport {
  /** Waze's own id for the report, stable for as long as it is live. */
  id: string;
  type: RoadReportType;
  /** Waze's finer kind, e.g. HAZARD_ON_SHOULDER_CAR_STOPPED; null if none. */
  subtype: string | null;
  /** In the app's own spelling ("CDV / Ph. Arena"); null if Waze gave none. */
  nearestExit: string | null;
  metresFromExit: number | null;
  direction: 'northbound' | 'southbound' | null;
  reportedAt: Date;
  /** Waze's 0-10 score of how much drivers have backed the report up. */
  reliability: number | null;
  /**
   * Nobody has backed it up yet - the score Waze starts every report at. Shown,
   * as the dashboard shows it (faintly there), because a fresh accident is
   * exactly this until someone reacts.
   */
  unconfirmed: boolean;
}

/**
 * The line the dashboard tests reports against: its corridorGuard() centreline,
 * baked from Main-Dashboard (see the `source` inside the file). Not the app's
 * own map centreline, which was moved onto the carriageways and sits up to
 * 245 m from this one at interchanges - near enough to an exit to keep a report
 * the dashboard drops, or drop one it keeps.
 */
const CORRIDOR = (reportCorridor as unknown as { coordinates: [number, number][] }).coordinates;
const OFF_CORRIDOR_M = 200;
const M_PER_DEG_LAT = 110574;
const M_PER_DEG_LON = 111320 * Math.cos((15 * Math.PI) / 180);

/** Metres from a point to the corridor line - every segment, a few reports a minute. */
function metresOffCorridor(lon: number, lat: number): number {
  const qx = lon * M_PER_DEG_LON;
  const qy = lat * M_PER_DEG_LAT;
  let best = Infinity;
  for (let i = 1; i < CORRIDOR.length; i += 1) {
    const ax = CORRIDOR[i - 1][0] * M_PER_DEG_LON;
    const ay = CORRIDOR[i - 1][1] * M_PER_DEG_LAT;
    const vx = CORRIDOR[i][0] * M_PER_DEG_LON - ax;
    const vy = CORRIDOR[i][1] * M_PER_DEG_LAT - ay;
    const len2 = vx * vx + vy * vy;
    if (len2 === 0) {
      continue;
    }
    const t = Math.min(1, Math.max(0, ((qx - ax) * vx + (qy - ay) * vy) / len2));
    best = Math.min(best, Math.hypot(qx - ax - t * vx, qy - ay - t * vy));
  }
  return best;
}

/**
 * The dashboard's credibility rule (lib/waze-reports.ts): only explicit
 * disagreement removes a report. Reliability starts at 5 and drops below it
 * only when an editor files "not there"; confidence reaches -1 only after two
 * "not there"s. A missing score is unknown, not disputed.
 */
function isDisputed(reliability: number | null, confidence: number | null): boolean {
  return (confidence !== null && confidence <= -1) || (reliability !== null && reliability < 5);
}

/**
 * Waze names the carriageway in the street: "...North Luzon Expressway N" is
 * northbound, "...S" southbound. Anything else stays unknown rather than
 * being guessed from the heading.
 */
function directionOf(street: unknown): RoadReport['direction'] {
  if (typeof street !== 'string') {
    return null;
  }
  const end = street.trim().slice(-2);
  if (end === ' N') {
    return 'northbound';
  }
  if (end === ' S') {
    return 'southbound';
  }
  return null;
}

function finite(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return value !== null && value !== undefined && Number.isFinite(n) ? n : null;
}

/** Newest first. */
export async function fetchRoadReports(): Promise<RoadReport[]> {
  const body = (await getDashboardJson(PATH)) as { success?: boolean; data?: { alerts?: unknown } };
  const raw = body?.data?.alerts;
  if (body?.success === false || !Array.isArray(raw)) {
    throw new Error('The dashboard sent no live reports.');
  }

  const reports: RoadReport[] = [];
  for (const row of raw as Record<string, unknown>[]) {
    const type = typeof row.type === 'string' ? (row.type.toUpperCase() as RoadReportType) : null;
    const reportedAt = new Date(String(row.publishedAt));
    if (type === null || !TYPES.includes(type) || typeof row.uuid !== 'string' || Number.isNaN(reportedAt.getTime())) {
      continue;
    }
    const lon = finite(row.lon);
    const lat = finite(row.lat);
    // No position is kept, as the dashboard keeps it: it cannot be shown off-road.
    if (lon !== null && lat !== null && metresOffCorridor(lon, lat) > OFF_CORRIDOR_M) {
      continue;
    }
    const reliability = finite(row.reliability);
    const confidence = finite(row.confidence);
    if (isDisputed(reliability, confidence)) {
      continue;
    }
    const exitName = typeof row.nearestExit === 'string' ? row.nearestExit : null;
    const exitId = exitName !== null ? exitIdForSegment(exitName) : null;
    reports.push({
      id: row.uuid,
      type,
      subtype: typeof row.subtype === 'string' && row.subtype.length > 0 ? row.subtype : null,
      nearestExit: (exitId !== null ? getExit(exitId)?.name : undefined) ?? exitName,
      metresFromExit: finite(row.metresFromExit),
      direction: directionOf(row.street),
      reportedAt,
      reliability,
      unconfirmed: reliability !== null && reliability <= 5 && confidence !== null && confidence <= 0,
    });
  }
  return reports.sort((a, b) => b.reportedAt.getTime() - a.reportedAt.getTime());
}

/** "Major accident", "Stalled vehicle on the shoulder", "Police" - the report as a driver would say it. */
export function describeRoadReport(report: Pick<RoadReport, 'type' | 'subtype'>): string {
  const known: Record<string, string> = {
    ACCIDENT_MAJOR: 'Major accident',
    ACCIDENT_MINOR: 'Minor accident',
    HAZARD_ON_SHOULDER_CAR_STOPPED: 'Stalled vehicle on the shoulder',
    HAZARD_ON_ROAD_CAR_STOPPED: 'Stalled vehicle on the road',
    HAZARD_ON_ROAD_OBJECT: 'Object on the road',
    HAZARD_ON_ROAD_POT_HOLE: 'Pothole',
    HAZARD_ON_ROAD_ROAD_KILL: 'Dead animal on the road',
    HAZARD_ON_ROAD_LANE_CLOSED: 'Lane closed',
    HAZARD_ON_ROAD_CONSTRUCTION: 'Roadworks',
    HAZARD_ON_ROAD_OIL: 'Oil on the road',
    HAZARD_ON_ROAD_TRAFFIC_LIGHT_FAULT: 'Broken traffic light',
    HAZARD_ON_SHOULDER_ANIMALS: 'Animals on the shoulder',
    HAZARD_ON_SHOULDER_MISSING_SIGN: 'Missing sign',
    HAZARD_WEATHER: 'Bad weather',
    HAZARD_WEATHER_FLOOD: 'Flooding',
    HAZARD_WEATHER_FOG: 'Fog',
    HAZARD_WEATHER_HEAVY_RAIN: 'Heavy rain',
    POLICE_VISIBLE: 'Police on the road',
  };
  if (report.subtype !== null && known[report.subtype] !== undefined) {
    return known[report.subtype];
  }
  return report.type === 'ACCIDENT' ? 'Accident' : report.type === 'POLICE' ? 'Police' : 'Hazard';
}
