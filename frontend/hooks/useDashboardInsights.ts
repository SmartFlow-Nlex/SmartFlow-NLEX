import { useCallback, useEffect, useRef, useState } from 'react';
import {
  EventForecast,
  HotspotRanking,
  fetchEventForecasts,
  fetchHotspots,
} from '../lib/insightsApi';

export interface InsightState<T> {
  data: T | null;
  /** True until the first answer (or failure) lands; refreshes keep the old data showing. */
  isLoading: boolean;
  error: string | null;
}

export interface DashboardInsights {
  events: InsightState<EventForecast[]>;
  hotspots: InsightState<HotspotRanking>;
  /** Fetches both again, past the cache. */
  refresh: () => void;
}

const initial = { data: null, isLoading: true, error: null };

function messageOf(caught: unknown): string {
  // A sleeping dashboard does not refuse the connection, it just never answers
  // inside the deadline, which surfaces as an abort.
  if (caught instanceof Error && caught.name === 'AbortError') {
    return 'The SmartFlow dashboard took too long to answer.';
  }
  return 'Could not reach the SmartFlow dashboard.';
}

/**
 * The two lists are separate requests settling separately, so one slow
 * endpoint never holds the other back.
 */
export function useDashboardInsights(): DashboardInsights {
  const [events, setEvents] = useState<InsightState<EventForecast[]>>(initial);
  const [hotspots, setHotspots] = useState<InsightState<HotspotRanking>>(initial);
  const mounted = useRef(true);

  const load = useCallback((force: boolean): void => {
    setEvents((prev) => ({ ...prev, isLoading: prev.data === null, error: null }));
    setHotspots((prev) => ({ ...prev, isLoading: prev.data === null, error: null }));

    fetchEventForecasts(force)
      .then((data) => mounted.current && setEvents({ data, isLoading: false, error: null }))
      .catch(
        (caught: unknown) =>
          mounted.current &&
          setEvents((prev) => ({ ...prev, isLoading: false, error: messageOf(caught) })),
      );
    fetchHotspots(force)
      .then((data) => mounted.current && setHotspots({ data, isLoading: false, error: null }))
      .catch(
        (caught: unknown) =>
          mounted.current &&
          setHotspots((prev) => ({ ...prev, isLoading: false, error: messageOf(caught) })),
      );
  }, []);

  useEffect(() => {
    mounted.current = true;
    load(false);
    return () => {
      mounted.current = false;
    };
  }, [load]);

  const refresh = useCallback(() => load(true), [load]);

  return { events, hotspots, refresh };
}
