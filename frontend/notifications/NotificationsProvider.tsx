import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAlerts } from '../alerts';
import type { AlertItem } from '../alerts/AlertsProvider';
import { notificationsAvailable, notifyNow, requestPermission } from './notifier';

const ENABLED_KEY = 'notificationsEnabled';

export interface NotificationsContextValue {
  /** What the Settings switch shows. False until someone turns it on. */
  enabled: boolean;
  /** False on web and on builds where the module could not load. */
  available: boolean;
  /**
   * Turn delivery on or off. Turning it on asks for permission and resolves
   * false when that is refused, so the switch can fall back rather than sit
   * on showing a promise the OS has already denied.
   */
  setEnabled: (next: boolean) => Promise<boolean>;
  /** Permission was refused and the OS will not ask again. */
  blocked: boolean;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

/** Alerts worth interrupting someone for. */
function worthAnnouncing(alert: AlertItem): boolean {
  /*
   * Unread, and either something on the road right now or an operator's
   * deliberate broadcast.
   *
   * Scheduled maintenance is excluded on purpose: those arrive steadily and in
   * batches, and a phone that buzzes nine times about roadworks next month is
   * one whose notifications get switched off for good.
   */
  return alert.unread && (alert.reported === true || alert.pinned === true);
}

/**
 * Turns new alerts into device notifications.
 *
 * The app already gathers Waze reports, community incidents and operator
 * advisories in `AlertsProvider`; this watches that list and announces what
 * arrives while the app is running. Nothing is invented here - a notification
 * always corresponds to a row the Alerts tab is showing.
 *
 * Local, not push: see `notifier.ts` for why.
 */
export const NotificationsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { alerts } = useAlerts();
  const [enabled, setEnabledState] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const available = useMemo(() => notificationsAvailable(), []);

  /**
   * Alert ids already announced.
   *
   * Seeded on the FIRST list rather than left empty, so turning notifications
   * on does not immediately fire one per alert already on the tab. Only what
   * arrives afterwards is new.
   */
  const announced = useRef<Set<string> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stored = await AsyncStorage.getItem(ENABLED_KEY);
        if (!cancelled && stored === 'true') {
          setEnabledState(true);
        }
      } catch {
        // No stored preference is the same as off.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setEnabled = useCallback(
    async (next: boolean): Promise<boolean> => {
      if (!next) {
        setEnabledState(false);
        setBlocked(false);
        await AsyncStorage.setItem(ENABLED_KEY, 'false').catch(() => undefined);
        return false;
      }

      const permission = await requestPermission();
      if (permission !== 'granted') {
        setBlocked(permission === 'denied');
        setEnabledState(false);
        return false;
      }

      // A fresh baseline: what is already on the tab is not news.
      announced.current = new Set(alerts.map((alert) => alert.id));
      setBlocked(false);
      setEnabledState(true);
      await AsyncStorage.setItem(ENABLED_KEY, 'true').catch(() => undefined);
      return true;
    },
    [alerts],
  );

  useEffect(() => {
    if (!enabled || !available) {
      return;
    }

    // First list seen while enabled: remember it, announce none of it.
    if (announced.current === null) {
      announced.current = new Set(alerts.map((alert) => alert.id));
      return;
    }

    const seen = announced.current;
    const fresh = alerts.filter((alert) => worthAnnouncing(alert) && !seen.has(alert.id));

    for (const alert of fresh) {
      seen.add(alert.id);
    }
    // Every alert is marked seen, including ones not announced, so a batch of
    // roadworks cannot be re-evaluated and fire later.
    for (const alert of alerts) {
      seen.add(alert.id);
    }

    if (fresh.length === 0) {
      return;
    }

    /*
     * One notification for one arrival, a summary for several.
     *
     * A refresh that brings back four new Waze reports at once would otherwise
     * buzz four times in a second, which reads as a fault rather than as news.
     */
    if (fresh.length === 1) {
      const only = fresh[0]!;
      void notifyNow({
        title: only.title,
        body: only.message,
        data: { alertId: only.id },
      });
      return;
    }

    void notifyNow({
      title: `${fresh.length} new road alerts`,
      body: fresh
        .slice(0, 3)
        .map((alert) => alert.title)
        .join(' · '),
    });
  }, [alerts, enabled, available]);

  const value = useMemo<NotificationsContextValue>(
    () => ({ enabled, available, setEnabled, blocked }),
    [enabled, available, setEnabled, blocked],
  );

  return (
    <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
  );
};

export function useNotifications(): NotificationsContextValue {
  const context = useContext(NotificationsContext);
  if (context === null) {
    throw new Error('useNotifications must be used inside a NotificationsProvider');
  }
  return context;
}
