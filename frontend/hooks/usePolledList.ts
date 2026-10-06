import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

/**
 * Once a minute is how often everything the Alerts tab shows is re-read:
 * something an operator posts or a driver reports reaches a phone with the app
 * open within a minute, without a push service. Opening the Alerts tab
 * re-reads at once on top of this.
 */
export const POLL_INTERVAL_MS = 60 * 1000;

export interface PolledList<T> {
  items: T[];
  /** Before the first answer, after a failure with nothing to show, or settled. */
  status: 'loading' | 'error' | 'ready';
  refresh: () => void;
}

/**
 * Keeps a list fresh while the app is in the foreground, and re-reads it on
 * returning to the app, since that is when someone is about to look.
 *
 * A failed poll keeps the last list rather than emptying it: a closure does not
 * reopen, and an accident does not clear, because one request timed out.
 */
export function usePolledList<T>(
  fetcher: () => Promise<T[]>,
  intervalMs: number = POLL_INTERVAL_MS,
): PolledList<T> {
  const [items, setItems] = useState<T[]>([]);
  const [status, setStatus] = useState<PolledList<T>['status']>('loading');
  const inFlight = useRef(false);
  const hasData = useRef(false);

  const load = useCallback((): void => {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    fetcher()
      .then((next) => {
        hasData.current = true;
        setItems(next);
        setStatus('ready');
      })
      .catch(() => {
        if (!hasData.current) {
          setStatus('error');
        }
      })
      .finally(() => {
        inFlight.current = false;
      });
  }, [fetcher]);

  useEffect(() => {
    load();
    let timer: ReturnType<typeof setInterval> | null = setInterval(load, intervalMs);

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        load();
        if (timer === null) {
          timer = setInterval(load, intervalMs);
        }
      } else if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    });

    return () => {
      subscription.remove();
      if (timer !== null) {
        clearInterval(timer);
      }
    };
  }, [load, intervalMs]);

  const refresh = useCallback((): void => {
    if (!hasData.current) {
      setStatus('loading');
    }
    load();
  }, [load]);

  return { items, status, refresh };
}
