import { useCallback, useEffect, useMemo, useState } from 'react';
import { NlexDirectionId, isValidPair } from '../constants/nlexSegments';
import {
  fetchForecastTimeline,
  fetchStretchForecast,
  forgetForecast,
  type ForecastTimeline,
  type StretchForecast,
} from '../lib/forecastApi';
import { forecastRoute, type RouteForecast } from '../lib/routeForecast';

const HOUR_MS = 3_600_000;

/** How often an open screen asks again - as long as the API layer keeps an answer. */
const REFRESH_MS = 10 * 60 * 1000;

export type RouteForecastStatus =
  /** No route chosen yet. */
  | 'idle'
  | 'loading'
  | 'ready'
  /** The dashboard could not be reached. */
  | 'failed'
  /** It answered, but holds nothing for this route at that hour. */
  | 'none';

export interface RouteForecastResult {
  status: RouteForecastStatus;
  /** The route at the chosen time. Set only when status is 'ready'. */
  forecast: RouteForecast | null;
  /** The same route at the hour nearest now, to compare against. */
  baseline: RouteForecast | null;
  /** The start of the hour the forecast covers - the model works in whole hours, the picker does not. */
  forecastHour: Date | null;
  /** Asks again, past the cache. */
  refresh: () => void;
}

/**
 * The model's hour a clock time falls in, counted from the forecast's base.
 * Each prediction covers the hour starting on its timestamp, so 9:40 PM
 * belongs to 9:00 PM's. Null past the end of the table; a time before its
 * first hour gets the first.
 */
function hourFor(timeline: ForecastTimeline, at: Date): number | null {
  const hours = Math.floor((at.getTime() - timeline.base.getTime()) / HOUR_MS);
  return hours > timeline.maxHorizon ? null : Math.max(1, hours);
}

/**
 * The SmartFlow model's forecast for one trip - the same predictions the Map
 * tab's forecast draws, read for a route and a carriageway.
 *
 * Nothing is requested until a route is chosen.
 */
export function useRouteForecast(
  direction: NlexDirectionId,
  fromId: string | null,
  toId: string | null,
  now: Date,
  at: Date,
): RouteForecastResult {
  const [timeline, setTimeline] = useState<ForecastTimeline | null>(null);
  /** Hours as loaded, with the base they count from - never read against another run's. */
  const [loaded, setLoaded] = useState<{ base: number; hours: Map<number, StretchForecast[]> } | null>(null);
  const [failed, setFailed] = useState<boolean>(false);
  const [attempt, setAttempt] = useState<number>(0);

  const enabled = fromId !== null && toId !== null && isValidPair(direction, fromId, toId);
  // The pipeline rewrites the forecast through the day, and this screen stays
  // mounted for the whole session, so it has to keep asking.
  const slot = Math.floor(now.getTime() / REFRESH_MS);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    let cancelled = false;
    fetchForecastTimeline()
      .then((value) => {
        if (!cancelled) setTimeline(value);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, attempt, slot]);

  const hourNow = timeline === null ? null : hourFor(timeline, now);
  const hourAt = timeline === null ? null : hourFor(timeline, at);

  useEffect(() => {
    if (!enabled || timeline === null || hourAt === null) {
      return undefined;
    }
    let cancelled = false;
    // An earlier hour's failure must not stand in for this one's answer.
    setFailed(false);
    const base = timeline.base.getTime();
    const wanted = hourNow === null || hourNow === hourAt ? [hourAt] : [hourAt, hourNow];
    Promise.all(wanted.map((hours) => fetchStretchForecast(hours)))
      .then((lists) => {
        if (cancelled) return;
        setFailed(false);
        setLoaded((previous) => {
          const hours = new Map<number, StretchForecast[]>(
            previous !== null && previous.base === base ? previous.hours : undefined,
          );
          wanted.forEach((hour, index) => hours.set(hour, lists[index] ?? []));
          return { base, hours };
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, timeline, hourNow, hourAt, attempt]);

  const refresh = useCallback((): void => {
    forgetForecast();
    setFailed(false);
    setAttempt((n) => n + 1);
  }, []);

  const base = timeline === null ? null : timeline.base.getTime();
  const hours = loaded !== null && loaded.base === base ? loaded.hours : null;
  const stretchesAt = hours === null || hourAt === null ? undefined : hours.get(hourAt);
  const stretchesNow = hours === null || hourNow === null ? undefined : hours.get(hourNow);

  const forecast = useMemo(
    () =>
      !enabled || fromId === null || toId === null || stretchesAt === undefined
        ? null
        : forecastRoute(stretchesAt, direction, fromId, toId),
    [enabled, stretchesAt, direction, fromId, toId],
  );
  const baseline = useMemo(
    () =>
      !enabled || fromId === null || toId === null || stretchesNow === undefined
        ? null
        : forecastRoute(stretchesNow, direction, fromId, toId),
    [enabled, stretchesNow, direction, fromId, toId],
  );
  const forecastHour = useMemo(
    () => (base === null || hourAt === null ? null : new Date(base + hourAt * HOUR_MS)),
    [base, hourAt],
  );

  let status: RouteForecastStatus;
  if (!enabled) {
    status = 'idle';
  } else if (timeline !== null && hourAt === null) {
    status = 'none';
  } else if (stretchesAt !== undefined) {
    status = forecast === null ? 'none' : 'ready';
  } else {
    status = failed ? 'failed' : 'loading';
  }

  return { status, forecast, baseline, forecastHour, refresh };
}
