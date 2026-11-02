import { API_TIMEOUT_MS, TRAFFIC_SOURCE_URL } from '../config/api';
import {
  type ForecastTimeline,
  type StretchForecast,
  parseStretches,
  parseTimeline,
} from './feeds/forecast';

/**
 * The team dashboard's congestion forecast - the same model output its
 * "Forecasted Traffic" map draws - read straight from the dashboard.
 *
 * Straight from the phone rather than through our backend: the dashboard only
 * wakes for callers outside Render (see wakeTrafficSource), and these
 * endpoints need no reshaping.
 *
 * How an answer is read lives in feeds/forecast, which the backend shares, so
 * Navie's forecast answers and this app's screens cannot disagree.
 */

export type { ForecastModel, ForecastState, ForecastTimeline, StretchForecast } from './feeds/forecast';
export { exitIdForSegment } from './feeds/forecast';

const FORECAST_PATH = '/api/map-comparison/forecast';
const PEAKS_PATH = '/api/map-comparison/forecast/peaks';

/** How long one answer is reused. The pipeline rewrites the table every few hours. */
const CACHE_MS = 10 * 60 * 1000;

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

let timelineCache: { at: number; value: ForecastTimeline } | null = null;
const stretchCache = new Map<number, { at: number; value: StretchForecast[] }>();

/** Drops what is cached, so the next read asks the dashboard again. */
export function forgetForecast(): void {
  timelineCache = null;
  stretchCache.clear();
}

export async function fetchForecastTimeline(): Promise<ForecastTimeline> {
  if (timelineCache !== null && Date.now() - timelineCache.at < CACHE_MS) {
    return timelineCache.value;
  }

  const [peaksBody, firstHour] = await Promise.all([getDashboardJson(PEAKS_PATH), getDashboardJson(`${FORECAST_PATH}?hours=1`)]);
  const value = parseTimeline(peaksBody, firstHour);

  // Hours ahead count from the base, so once the pipeline has run again the
  // hours already held belong to the old count.
  if (timelineCache !== null && timelineCache.value.base.getTime() !== value.base.getTime()) {
    stretchCache.clear();
  }

  timelineCache = { at: Date.now(), value };
  return value;
}

/** Every stretch's predicted state at `hoursAhead` hours after the timeline's base. */
export async function fetchStretchForecast(hoursAhead: number): Promise<StretchForecast[]> {
  const cached = stretchCache.get(hoursAhead);
  if (cached !== undefined && Date.now() - cached.at < CACHE_MS) {
    return cached.value;
  }

  const value = parseStretches(await getDashboardJson(`${FORECAST_PATH}?hours=${hoursAhead}`));

  // An hour with no rows is not kept: the table is sometimes rewritten with
  // fewer hours than it had, and gets them back on the pipeline's next run.
  if (value.length > 0) {
    stretchCache.set(hoursAhead, { at: Date.now(), value });
  }
  return value;
}
