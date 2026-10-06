import { useCallback, useSyncExternalStore } from 'react';
import { AppState, AppStateStatus, NativeEventSubscription } from 'react-native';
import {
  CorridorApiError,
  CorridorErrorKind,
  CorridorStatusData,
  fetchCorridorStatus,
  wakeTrafficSource,
} from '../lib/corridorApi';
import { readTrafficByStretch } from '../lib/corridorGeometry';

/** "Poll every 60s — the Waze ingester writes every few minutes." */
const POLL_INTERVAL_MS = 60000;

export interface CorridorStatusError {
  kind: CorridorErrorKind | 'unknown';
  message: string;
  /** Address that was tried, so the UI can show teammates where to look. */
  url: string | null;
}

export interface CorridorStatusState {
  data: CorridorStatusData | null;
  /** True only until the very first request settles - polling refreshes are silent. */
  isLoading: boolean;
  error: CorridorStatusError | null;
  refresh: () => void;
}

/*
 * One snapshot for the whole app, not one per screen.
 *
 * Each screen used to poll on its own, so opening an interchange fetched a
 * fresh reading while the list behind it still showed the one from up to a
 * minute earlier. A short queue near the slow/congested line could then read
 * "slow" in the list and "congested" on the map it opened - two answers to one
 * question, a tap apart. Sharing the snapshot means every screen shows the
 * same reading, and a newer one reaches all of them at once.
 */
interface Snapshot {
  data: CorridorStatusData | null;
  isLoading: boolean;
  error: CorridorStatusError | null;
  fetchedAt: number;
}

let snapshot: Snapshot = { data: null, isLoading: true, error: null, fetchedAt: 0 };
const listeners = new Set<() => void>();
let inFlight: Promise<void> | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let appStateSubscription: NativeEventSubscription | null = null;

const publish = (next: Snapshot): void => {
  snapshot = next;
  listeners.forEach((listener) => listener());
};

const toError = (caughtError: unknown): CorridorStatusError =>
  caughtError instanceof CorridorApiError
    ? { kind: caughtError.kind, message: caughtError.message, url: caughtError.url }
    : {
        kind: 'unknown',
        message:
          caughtError instanceof Error ? caughtError.message : 'Failed to load corridor status',
        url: null,
      };

/*
 * Every load also pings the team's dashboard, alongside it rather than first,
 * so our backend - which keeps retrying for up to 50s - finds it awake partway
 * through instead of giving up on a sleeping one. Doing it on every poll, not
 * just the first, keeps the dashboard from falling asleep again while a screen
 * sits open. If a load still fails, wait for the dashboard to answer and try
 * once more before showing an error: after an idle spell that is nearly always
 * the cause.
 */
const fetchWithWake = async () => {
  void wakeTrafficSource();
  try {
    return await fetchCorridorStatus();
  } catch {
    await wakeTrafficSource();
    return fetchCorridorStatus();
  }
};

/** Every caller at the same moment shares one request. */
const load = (): Promise<void> => {
  if (inFlight === null) {
    inFlight = fetchWithWake()
      // Graded by the traffic on each stretch, once, here - see readTrafficByStretch.
      .then((data) =>
        publish({
          data: readTrafficByStretch(data),
          isLoading: false,
          error: null,
          fetchedAt: Date.now(),
        }),
      )
      .catch((caughtError: unknown) =>
        publish({ ...snapshot, isLoading: false, error: toError(caughtError) }),
      )
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
};

/*
 * Polls while at least one screen is watching, and only then. A screen that
 * mounts onto a snapshot younger than the poll interval uses it as is rather
 * than fetching again - that re-fetch is what let the two screens disagree.
 */
const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  if (listeners.size === 1) {
    if (Date.now() - snapshot.fetchedAt >= POLL_INTERVAL_MS) {
      void load();
    }
    timer = setInterval(() => void load(), POLL_INTERVAL_MS);
    // Re-sync on returning to the foreground, so a phone left backgrounded
    // doesn't keep showing a stale snapshot until the next scheduled tick.
    appStateSubscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        void load();
      }
    });
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
      appStateSubscription?.remove();
      appStateSubscription = null;
    }
  };
};

const getSnapshot = (): Snapshot => snapshot;

/**
 * The live Waze-derived corridor feed. The first request drives `isLoading`;
 * every request after that (scheduled or via `refresh`) updates `data`/`error`
 * quietly in the background so the UI never flashes a spinner over data it
 * already has.
 */
export function useCorridorStatus(): CorridorStatusState {
  const current = useSyncExternalStore(subscribe, getSnapshot);
  const refresh = useCallback((): void => {
    void load();
  }, []);
  return { data: current.data, isLoading: current.isLoading, error: current.error, refresh };
}
