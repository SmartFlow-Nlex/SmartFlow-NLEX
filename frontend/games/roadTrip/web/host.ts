import type { TrafficSnapshot } from '../core/scenario';

/**
 * The page's link to whatever hosts it.
 *
 * In the app: React Native's WebView. Messages go out through
 * `window.ReactNativeWebView.postMessage`; the host calls
 * `window.__roadTripReceive(message)` to talk back, and sets
 * `window.__ROAD_TRIP_BOOT__` before the page loads (the save, reduced-motion
 * preference, platform).
 *
 * In a desktop browser (development and the headless test harness): a stand-in
 * host keeps the save in localStorage and answers snapshot requests with "no
 * forecast" so the synthetic fallback is exercised.
 */

export interface Boot {
  /** The stored save as a string, or null. */
  save: string | null;
  reduceMotion: boolean;
  platform: 'ios' | 'android' | 'web';
  /** False when the host could not read storage: progress will not persist. */
  storageOk: boolean;
  /** Debug tools (dev harness only). */
  debug: boolean;
  /** Safe-area insets from the app (Android does not report them to CSS). */
  insets: { top: number; bottom: number; left: number; right: number };
}

export type OutMessage =
  | { type: 'ready' }
  | { type: 'save'; save: string; revision: number }
  | { type: 'exit' }
  | { type: 'requestSnapshot'; exitId: string; direction: 'northbound' | 'southbound' }
  | { type: 'log'; level: 'info' | 'warn' | 'error'; message: string };

export type InMessage =
  | { type: 'pause' }
  | { type: 'resumeAllowed' }
  | { type: 'back' }
  | { type: 'saved'; revision: number }
  | { type: 'saveFailed'; revision: number }
  | { type: 'snapshot'; snapshot: unknown; error?: string };

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (data: string) => void };
    __ROAD_TRIP_BOOT__?: Partial<Boot>;
    __ROAD_TRIP_DEV__?: boolean;
    __roadTripReceive?: (message: InMessage) => void;
  }
}

const DEV_KEY = 'navie-road-trip-dev-save';

export interface Host {
  boot: Boot;
  send: (message: OutMessage) => void;
  onMessage: (listener: (message: InMessage) => void) => () => void;
  readonly embedded: boolean;
}

export function connectHost(): Host {
  const listeners = new Set<(message: InMessage) => void>();
  const deliver = (message: InMessage): void => {
    listeners.forEach((listener) => listener(message));
  };
  window.__roadTripReceive = (message) => deliver(message);

  const native = window.ReactNativeWebView;
  if (native !== undefined) {
    const boot = window.__ROAD_TRIP_BOOT__ ?? {};
    return {
      embedded: true,
      boot: {
        save: typeof boot.save === 'string' ? boot.save : null,
        reduceMotion: boot.reduceMotion === true,
        platform: boot.platform === 'android' ? 'android' : 'ios',
        storageOk: boot.storageOk !== false,
        debug: boot.debug === true,
        insets: boot.insets ?? { top: 0, bottom: 0, left: 0, right: 0 },
      },
      send: (message) => {
        try {
          native.postMessage(JSON.stringify(message));
        } catch {
          // Nothing to do: the host is gone.
        }
      },
      onMessage: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
  }

  // Desktop stand-in.
  let stored: string | null = null;
  let storageOk = true;
  try {
    stored = window.localStorage.getItem(DEV_KEY);
  } catch {
    storageOk = false;
  }
  const params = new URLSearchParams(location.search);
  if (params.get('fresh') === '1') {
    stored = null;
  }
  if (params.get('storage') === 'fail') {
    storageOk = false;
  }
  return {
    embedded: false,
    boot: {
      save: params.get('save') ?? stored,
      reduceMotion: params.get('reduce') === '1' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
      platform: 'web',
      storageOk,
      debug: window.__ROAD_TRIP_DEV__ === true || params.get('debug') === '1',
      insets: { top: Number(params.get('insetTop') ?? 0), bottom: Number(params.get('insetBottom') ?? 0), left: 0, right: 0 },
    },
    send: (message) => {
      if (message.type === 'save') {
        let ok = storageOk;
        if (ok) {
          try {
            window.localStorage.setItem(DEV_KEY, message.save);
          } catch {
            ok = false;
          }
        }
        setTimeout(() => deliver(ok ? { type: 'saved', revision: message.revision } : { type: 'saveFailed', revision: message.revision }), 0);
      } else if (message.type === 'requestSnapshot') {
        const mode = params.get('snapshot');
        setTimeout(() => {
          if (mode === 'demo') {
            deliver({ type: 'snapshot', snapshot: demoSnapshot(message.exitId, message.direction) });
          } else {
            deliver({ type: 'snapshot', snapshot: null, error: 'Forecast not available in this browser preview' });
          }
        }, 300);
      } else if (message.type === 'exit') {
        (window as unknown as { __exited?: boolean }).__exited = true;
      }
    },
    onMessage: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function demoSnapshot(exitId: string, direction: 'northbound' | 'southbound'): TrafficSnapshot {
  return {
    version: 1,
    kind: 'forecast',
    source: 'Browser preview stand-in (not a real forecast)',
    fetchedAt: new Date().toISOString(),
    forecastFor: new Date().toISOString(),
    exitId,
    exitName: exitId,
    direction,
    queueChance: 0.72,
    typicalDelaySeconds: 300,
    directionShare: 0.9,
    units: { queueChance: 'probability', typicalDelay: 'seconds', directionShare: 'share' },
    modelName: 'preview',
  };
}
