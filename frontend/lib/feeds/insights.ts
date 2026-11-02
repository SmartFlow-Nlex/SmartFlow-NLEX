import { getExit } from '../../constants/nlexSegments';
import { exitIdForSegment } from './forecast';

/**
 * How the dashboard's two per-place model outputs are read - the Dashboard's
 * Event Forecasts and ML Hotspots lists:
 *
 * - Event forecasts: the Philippine Arena schedule with the event-surge
 *   model's per-exit forecast for each day (`upcomingEvents` on
 *   /api/traffic/forecast).
 * - ML hotspots: the Spatial LSTM's per-exit incident forecast, the ranking the
 *   dashboard's "Corridor Risk Models" panel draws (/api/incident/spatial).
 *
 * Only the reading lives here, with no network and no React Native, so the
 * backend shares it for Navie. Fetching and caching stay in lib/insightsApi.
 */

/**
 * An exit is listed as affected by an event when the model expects at least
 * this much more traffic there than on a normal day. The model forecasts a
 * surge at every exit it has history for - fourteen of them, down to +6% at
 * Balintawak - and listing all fourteen would mark every route as affected.
 */
const AFFECTED_UPLIFT = 1.2;

/** How far above the corridor's average exit a hotspot must be to get each tone. */
const CRITICAL_VS_AVERAGE = 1.5;
const WARNING_VS_AVERAGE = 1.15;

export interface EventExitSurge {
  /** App exit id; null for an exit the app's list does not have. */
  exitId: string | null;
  name: string;
  /** 1.66 means 66% more traffic than a normal day. */
  uplift: number;
  /** Vehicles forecast for the day. */
  surge: number;
  /** Vehicles on a normal day of the same weekday and month. */
  baseline: number;
}

export interface EventForecast {
  id: string;
  title: string;
  venue: string;
  /**
   * Local midnight of the event day. The schedule carries dates only - no
   * start times - so nothing here claims an hour.
   */
  date: Date;
  /** Venue capacity, not a ticket count. */
  capacity: number | null;
  /** A recurring date the pipeline inferred (New Year Countdown), not an announced one. */
  isDerived: boolean;
  /** Exits forecast at AFFECTED_UPLIFT or more, biggest surge first. */
  affected: EventExitSurge[];
  /** Every exit the model forecasts for the day. */
  exits: EventExitSurge[];
}

export type HotspotTone = 'critical' | 'warning' | 'caution';

export interface Hotspot {
  id: string;
  exitId: string | null;
  name: string;
  /** The model's daily forecasts for this exit, averaged over its horizon. */
  predictedPerDay: number;
  /** predictedPerDay over the average exit's; 2 means twice the average. */
  vsAverage: number;
  /** Accidents and breakdowns on record at this exit, whole history. */
  recordedIncidents: number | null;
  tone: HotspotTone;
}

export interface HotspotRanking {
  /** Exits at or above the corridor average, worst first. */
  hotspots: Hotspot[];
  trainedAt: Date | null;
  /** First and last day the forecast covers. */
  window: { from: Date; to: Date } | null;
}

/** "2026-11-07" as local midnight, or null. */
function parseDay(value: unknown): Date | null {
  if (typeof value !== 'string') {
    return null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (match === null) {
    return null;
  }
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function finite(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** The app's own name for a dashboard exit, so chips match the rest of the app. */
function resolveExit(dashboardName: string): { exitId: string | null; name: string } {
  const exitId = exitIdForSegment(dashboardName);
  return { exitId, name: (exitId !== null ? getExit(exitId)?.name : undefined) ?? dashboardName };
}

/** The event schedule, soonest first. */
export function parseEvents(body: unknown): EventForecast[] {
  const typed = body as { success?: boolean; data?: { upcomingEvents?: unknown } } | null;
  if (typed?.success !== true || !Array.isArray(typed.data?.upcomingEvents)) {
    throw new Error('The dashboard sent no event schedule.');
  }

  const value: EventForecast[] = [];
  for (const raw of typed.data.upcomingEvents as Record<string, unknown>[]) {
    const date = parseDay(raw.date);
    const title = typeof raw.title === 'string' ? raw.title.trim() : '';
    if (date === null || title.length === 0) {
      continue;
    }

    const exits: EventExitSurge[] = [];
    for (const row of Array.isArray(raw.exits) ? (raw.exits as Record<string, unknown>[]) : []) {
      const uplift = finite(row.uplift);
      const surge = finite(row.surge);
      const baseline = finite(row.baseline);
      if (typeof row.exit !== 'string' || uplift === null || surge === null || baseline === null) {
        continue;
      }
      exits.push({ ...resolveExit(row.exit), uplift, surge, baseline });
    }
    exits.sort((a, b) => b.uplift - a.uplift);

    value.push({
      id: `${raw.date}|${title}`,
      title,
      venue: typeof raw.venue === 'string' && raw.venue.length > 0 ? raw.venue : 'Philippine Arena',
      date,
      capacity: finite(raw.capacity),
      isDerived: raw.isDerived === true,
      affected: exits.filter((exit) => exit.uplift >= AFFECTED_UPLIFT),
      exits,
    });
  }
  value.sort((a, b) => a.date.getTime() - b.date.getTime());
  return value;
}

/** Exits at or above the corridor's average incident forecast, worst first. */
export function parseHotspots(body: unknown): HotspotRanking {
  const typed = body as { success?: boolean; data?: { segmentRisk?: unknown; trainedAt?: unknown } } | null;
  if (typed?.success !== true || !Array.isArray(typed.data?.segmentRisk)) {
    throw new Error('The dashboard sent no incident forecast.');
  }

  // One row per exit per forecast day: average each exit over the horizon.
  const byExit = new Map<
    string,
    { name: string; sum: number; days: number; recorded: number | null; hasData: boolean }
  >();
  let first: Date | null = null;
  let last: Date | null = null;
  for (const row of typed.data.segmentRisk as Record<string, unknown>[]) {
    const predicted = finite(row.predictedIncidents);
    if (typeof row.exitName !== 'string' || predicted === null) {
      continue;
    }
    const key = String(row.exitId ?? row.exitName);
    const entry = byExit.get(key) ?? {
      name: row.exitName,
      sum: 0,
      days: 0,
      recorded: finite(row.historyEventCount),
      // An exit the model never saw an incident at forecasts 0.0, which means
      // "no data", not "safe" - the dashboard flags it the same way.
      hasData: row.hasData !== false,
    };
    entry.sum += predicted;
    entry.days += 1;
    byExit.set(key, entry);

    const day = parseDay(row.forecastDate);
    if (day !== null) {
      if (first === null || day < first) first = day;
      if (last === null || day > last) last = day;
    }
  }

  const exits = [...byExit.entries()]
    .filter(([, entry]) => entry.hasData && entry.days > 0)
    .map(([key, entry]) => ({ key, entry, perDay: entry.sum / entry.days }));
  if (exits.length === 0) {
    throw new Error('The incident forecast has no exits yet.');
  }
  const average = exits.reduce((total, exit) => total + exit.perDay, 0) / exits.length;

  const hotspots: Hotspot[] = exits
    .filter((exit) => exit.perDay >= average)
    .sort((a, b) => b.perDay - a.perDay)
    .map(({ key, entry, perDay }) => {
      const vsAverage = average > 0 ? perDay / average : 1;
      return {
        id: `hotspot-${key}`,
        ...resolveExit(entry.name),
        predictedPerDay: perDay,
        vsAverage,
        recordedIncidents: entry.recorded,
        tone:
          vsAverage >= CRITICAL_VS_AVERAGE
            ? 'critical'
            : vsAverage >= WARNING_VS_AVERAGE
              ? 'warning'
              : 'caution',
      };
    });

  const trainedAt = typeof typed.data.trainedAt === 'string' ? new Date(typed.data.trainedAt) : null;
  return {
    hotspots,
    trainedAt: trainedAt !== null && !Number.isNaN(trainedAt.getTime()) ? trainedAt : null,
    window: first !== null && last !== null ? { from: first, to: last } : null,
  };
}
