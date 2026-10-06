import { API_TIMEOUT_MS, TRAFFIC_SOURCE_URL } from '../config/api';
import { exitsInTravelOrder } from '../constants/nlexSegments';

/**
 * The team dashboard's congestion forecast - the same model output its
 * "Forecasted Traffic" map draws - read straight from the dashboard.
 *
 * Straight from the phone rather than through our backend: the dashboard only
 * wakes for callers outside Render (see wakeTrafficSource), and these
 * endpoints need no reshaping.
 */

const FORECAST_PATH = '/api/map-comparison/forecast';
const PEAKS_PATH = '/api/map-comparison/forecast/peaks';

/** How long one answer is reused. The pipeline rewrites the table every few hours. */
const CACHE_MS = 10 * 60 * 1000;

export type ForecastState = 'clear' | 'slow' | 'congested';

/** One stretch of road, as the model expects it at one hour. */
export interface StretchForecast {
  /** App exit id of the interchange the stretch starts at, going north. */
  exitId: string;
  /** "Balintawak to NLEX Harbor Link". */
  stretch: string;
  state: ForecastState;
}

export interface ForecastModel {
  name: string | null;
  /** 0-1. */
  accuracy: number | null;
  trainedAt: Date | null;
}

/** When the forecast starts, how far it reaches, and which model wrote it. */
export interface ForecastTimeline {
  /**
   * The hour the forecast counts from. "1 hour ahead" means one hour after
   * THIS, not after now: the pipeline last ran hours ago, and treating its
   * hours as counted from now - as the dashboard's own map does - puts every
   * prediction at the wrong time of day.
   */
  base: Date;
  /** The furthest hour ahead the table holds. */
  maxHorizon: number;
  /** Each day's most congested hour. */
  peaks: { at: Date; hoursAhead: number; congested: number }[];
  model: ForecastModel | null;
}

const STATES: Record<string, ForecastState> = { Low: 'clear', Med: 'slow', High: 'congested' };

/** GET a path on the team's dashboard. Shared with insightsApi. */
export async function getDashboardJson(path: string): Promise<unknown> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const response = await fetch(`${TRAFFIC_SOURCE_URL}${path}`, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Dashboard request failed (${response.status})`);
    }
    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Lowercase letters and digits only, so "CDV / Ph. Arena" and "CDV/PH Arena" agree. */
function squash(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const appExits = exitsInTravelOrder('northbound');

/**
 * The app exit a dashboard segment name refers to.
 *
 * The dashboard adds the town to some names - "Paso de Blas Valenzuela",
 * "Tabang Guiguinto", "Sta. Rita Guiguinto" - so after an exact match fails,
 * the longest app name the segment name starts with wins ("Bocaue Barrier"
 * must not land on "Bocaue Interchange").
 */
export function exitIdForSegment(segment: string): string | null {
  const key = squash(segment);
  const exact = appExits.find((exit) => squash(exit.name) === key);
  if (exact !== undefined) {
    return exact.id;
  }
  let best: { id: string; length: number } | null = null;
  for (const exit of appExits) {
    const name = squash(exit.name);
    if (name.length > 0 && key.startsWith(name) && (best === null || name.length > best.length)) {
      best = { id: exit.id, length: name.length };
    }
  }
  return best?.id ?? null;
}

let timelineCache: { at: number; value: ForecastTimeline } | null = null;
const stretchCache = new Map<number, { at: number; value: StretchForecast[] }>();

export async function fetchForecastTimeline(): Promise<ForecastTimeline> {
  if (timelineCache !== null && Date.now() - timelineCache.at < CACHE_MS) {
    return timelineCache.value;
  }

  const [peaksBody, firstHour] = await Promise.all([getDashboardJson(PEAKS_PATH), getDashboardJson(`${FORECAST_PATH}?hours=1`)]);

  const rawPeaks = (peaksBody as { success?: boolean; data?: unknown }).data;
  const peaks = Array.isArray(rawPeaks)
    ? rawPeaks
        .map((row: { at?: unknown; hoursAhead?: unknown; congested?: unknown }) => ({
          at: new Date(String(row.at)),
          hoursAhead: Number(row.hoursAhead),
          congested: Number(row.congested),
        }))
        .filter((row) => !Number.isNaN(row.at.getTime()) && Number.isFinite(row.hoursAhead))
    : [];
  const anchor = peaks[0];
  if (anchor === undefined) {
    // Without a timestamp there is no way to say what time any prediction is
    // for, and a forecast at an unknown hour is worse than none.
    throw new Error('The forecast has no timestamps yet.');
  }
  const base = new Date(anchor.at.getTime() - anchor.hoursAhead * 3_600_000);

  const rawModel = (firstHour as { model?: Record<string, unknown> }).model;
  const model: ForecastModel | null =
    rawModel === undefined
      ? null
      : {
          name: typeof rawModel.name === 'string' ? rawModel.name : null,
          accuracy: typeof rawModel.accuracy === 'number' ? rawModel.accuracy : null,
          trainedAt: typeof rawModel.trainedAt === 'string' ? new Date(rawModel.trainedAt) : null,
        };
  const reportedMax = typeof rawModel?.maxHorizon === 'number' ? rawModel.maxHorizon : null;
  const maxHorizon = reportedMax ?? Math.max(...peaks.map((row) => row.hoursAhead));

  const value: ForecastTimeline = { base, maxHorizon, peaks, model };
  timelineCache = { at: Date.now(), value };
  return value;
}

/** Every stretch's predicted state at `hoursAhead` hours after the timeline's base. */
export async function fetchStretchForecast(hoursAhead: number): Promise<StretchForecast[]> {
  const cached = stretchCache.get(hoursAhead);
  if (cached !== undefined && Date.now() - cached.at < CACHE_MS) {
    return cached.value;
  }

  const body = (await getDashboardJson(`${FORECAST_PATH}?hours=${hoursAhead}`)) as { features?: unknown };
  const features = Array.isArray(body.features) ? body.features : [];
  const value: StretchForecast[] = [];
  for (const feature of features as { properties?: Record<string, unknown> }[]) {
    const props = feature.properties ?? {};
    // The dashboard answers with a hard-coded sample when its database is
    // down; that sample has no congestion_state, so it is skipped here rather
    // than drawn as a prediction.
    const state = typeof props.congestion_state === 'string' ? STATES[props.congestion_state] : undefined;
    const exitId = typeof props.segment_id === 'string' ? exitIdForSegment(props.segment_id) : null;
    if (state === undefined || exitId === null) {
      continue;
    }
    value.push({
      exitId,
      stretch: typeof props.corridor_segment === 'string' ? props.corridor_segment : String(props.segment_id),
      state,
    });
  }
  if (value.length === 0 && features.length > 0) {
    throw new Error('The forecast came back without predictions.');
  }

  stretchCache.set(hoursAhead, { at: Date.now(), value });
  return value;
}
