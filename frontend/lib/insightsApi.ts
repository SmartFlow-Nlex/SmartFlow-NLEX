import { isSameDay } from './datetime';
import { getDashboardJson } from './forecastApi';
import {
  type EventForecast,
  type HotspotRanking,
  parseEvents,
  parseHotspots,
} from './feeds/insights';

/**
 * The dashboard's two per-place model outputs, behind the Dashboard's
 * Event Forecasts and ML Hotspots lists.
 *
 * - Event forecasts: the Philippine Arena schedule with the event-surge
 *   model's per-exit forecast for each day - the same rows the dashboard's
 *   Prescriptive tab plans from (`upcomingEvents` on /api/traffic/forecast).
 * - ML hotspots: the Spatial LSTM's per-exit incident forecast, the ranking the
 *   dashboard's "Corridor Risk Models" panel draws (/api/incident/spatial).
 *
 * Read straight from the dashboard, like forecastApi, and for the same reason:
 * it only wakes for callers outside Render. How each answer is read lives in
 * feeds/insights, which the backend shares for Navie.
 */

export type {
  EventExitSurge,
  EventForecast,
  Hotspot,
  HotspotRanking,
  HotspotTone,
} from './feeds/insights';

const EVENTS_PATH = '/api/traffic/forecast';
const SPATIAL_PATH = '/api/incident/spatial';

/** Both tables change only when a training run or the event scraper writes. */
const CACHE_MS = 10 * 60 * 1000;

/**
 * Converts the model's daily uplift into the traffic model's event load.
 *
 * 0.36 puts the biggest surge on the corridor (+66% at CDV / Ph. Arena) at
 * MAX_EVENT_LOAD, the load the old hand-written "severe" Arena concert carried,
 * so a real event moves the segment forecast as far as the sample one did.
 */
const LOAD_PER_UPLIFT = 0.36;
const MAX_EVENT_LOAD = 0.24;

let eventsCache: { at: number; value: EventForecast[] } | null = null;
let hotspotCache: { at: number; value: HotspotRanking } | null = null;

export async function fetchEventForecasts(force = false): Promise<EventForecast[]> {
  if (!force && eventsCache !== null && Date.now() - eventsCache.at < CACHE_MS) {
    return eventsCache.value;
  }
  const value = parseEvents(await getDashboardJson(EVENTS_PATH));
  eventsCache = { at: Date.now(), value };
  return value;
}

export async function fetchHotspots(force = false): Promise<HotspotRanking> {
  if (!force && hotspotCache !== null && Date.now() - hotspotCache.at < CACHE_MS) {
    return hotspotCache.value;
  }
  const value = parseHotspots(await getDashboardJson(SPATIAL_PATH));
  hotspotCache = { at: Date.now(), value };
  return value;
}

/**
 * Extra demand the scheduled events put on a trip at `at`.
 *
 * The surge model forecasts whole-day totals, so an event day's uplift is
 * spread evenly across that day rather than shaped around a start time the
 * schedule does not have. The biggest surge at any exit on the trip wins.
 */
export function eventLoadForSegment(
  segmentExitIds: string[],
  at: Date,
  events: EventForecast[],
): { load: number; source: EventForecast | null } {
  let load = 0;
  let source: EventForecast | null = null;

  for (const event of events) {
    if (!isSameDay(event.date, at)) {
      continue;
    }
    for (const exit of event.exits) {
      if (exit.exitId === null || !segmentExitIds.includes(exit.exitId)) {
        continue;
      }
      const contribution = Math.min(MAX_EVENT_LOAD, (exit.uplift - 1) * LOAD_PER_UPLIFT);
      if (contribution > load) {
        load = contribution;
        source = event;
      }
    }
  }

  return { load, source };
}
