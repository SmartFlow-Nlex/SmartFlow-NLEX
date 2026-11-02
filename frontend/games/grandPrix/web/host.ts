/**
 * The page's link to its host. In the app: React Native's WebView
 * (`window.ReactNativeWebView.postMessage` out, `window.__grandPrixReceive`
 * in, `window.__GRAND_PRIX_BOOT__` set before load). In a desktop browser: a
 * stand-in that keeps the save in localStorage, for development and tests.
 */

export interface Boot {
  save: string | null;
  reduceMotion: boolean;
  storageOk: boolean;
  debug: boolean;
  insets: { top: number; bottom: number; left: number; right: number };
}

export type OutMessage =
  | { type: 'ready' }
  | { type: 'save'; save: string; revision: number }
  | { type: 'exit' }
  | { type: 'log'; level: 'info' | 'warn' | 'error'; message: string };

export type InMessage =
  | { type: 'pause' }
  | { type: 'resumeAllowed' }
  | { type: 'back' }
  | { type: 'saved'; revision: number }
  | { type: 'saveFailed'; revision: number };

declare global {
  interface Window {
    __GRAND_PRIX_BOOT__?: Partial<Boot>;
    __GRAND_PRIX_DEV__?: boolean;
    __grandPrixReceive?: (message: InMessage) => void;
  }
}

const DEV_KEY = 'navie-grand-prix-dev-save';

export interface Host {
  boot: Boot;
  send: (message: OutMessage) => void;
  onMessage: (listener: (message: InMessage) => void) => () => void;
}

export function connectHost(): Host {
  const listeners = new Set<(message: InMessage) => void>();
  const deliver = (message: InMessage): void => listeners.forEach((l) => l(message));
  window.__grandPrixReceive = deliver;
  const onMessage = (listener: (message: InMessage) => void): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const native = (window as unknown as { ReactNativeWebView?: { postMessage: (data: string) => void } }).ReactNativeWebView;
  if (native !== undefined) {
    const boot = window.__GRAND_PRIX_BOOT__ ?? {};
    return {
      boot: {
        save: typeof boot.save === 'string' ? boot.save : null,
        reduceMotion: boot.reduceMotion === true,
        storageOk: boot.storageOk !== false,
        debug: boot.debug === true,
        insets: boot.insets ?? { top: 0, bottom: 0, left: 0, right: 0 },
      },
      send: (message) => {
        try {
          native.postMessage(JSON.stringify(message));
        } catch {
          // The host is gone.
        }
      },
      onMessage,
    };
  }

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
    boot: {
      save: params.get('save') ?? stored,
      reduceMotion: params.get('reduce') === '1',
      storageOk,
      debug: window.__GRAND_PRIX_DEV__ === true || params.get('debug') === '1',
      insets: { top: 0, bottom: 0, left: 0, right: 0 },
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
      } else if (message.type === 'exit') {
        (window as unknown as { __exited?: boolean }).__exited = true;
      }
    },
    onMessage,
  };
}
