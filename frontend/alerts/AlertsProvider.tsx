import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useMobileConfig, type AdvisoryTone } from '../lib/mobileConfig';

/**
 * Alert state, lifted out of the Alerts screen.
 *
 * The tab bar has to show an unread badge, and a tab bar cannot reach into a
 * screen's local state - nor can it rely on that screen being mounted, since a
 * user who has never opened Alerts still needs to see the badge. So the state
 * lives above both.
 */

/**
 * `info` exists because an operator can publish an advisory at three levels
 * from the dashboard's Mobile Control Centre, and a three-level control that
 * renders as two is a control that lies about what it did.
 */
export type AlertTone = 'critical' | 'warning' | 'info';

/**
 * Maintenance notices are grouped separately because they behave differently
 * from traffic alerts: scheduled rather than urgent, and they arrive steadily.
 * Mixed into one list they bury the incidents a driver needs to see now.
 */
export type AlertCategory = 'maintenance' | 'traffic';

export interface AlertItem {
  id: string;
  title: string;
  message: string;
  timeAgo: string;
  priority: 'high priority' | 'medium priority';
  icon: keyof typeof Ionicons.glyphMap;
  tone: AlertTone;
  unread: boolean;
  category: AlertCategory;
  /**
   * Shown whatever category is being viewed. Only an operator-published
   * advisory sets this: it is a deliberate broadcast, so filing it under
   * `traffic` and letting a category filter hide it would mean an operator
   * posts a closure notice and nobody sees it.
   */
  pinned?: boolean;
}

const initialAlerts: AlertItem[] = [
  {
    id: 'high-traffic-bocaue',
    title: 'High Traffic Predicted',
    message:
      'Severe congestion expected at Bocaue Exit tomorrow 5-8 PM due to Philippine Arena concert.',
    timeAgo: '30m ago',
    priority: 'high priority',
    icon: 'trending-up-outline',
    tone: 'critical',
    unread: true,
    category: 'traffic',
  },
  {
    id: 'incident-cluster-marilao',
    title: 'Incident Cluster Detected',
    message:
      'Multiple accident reports near Marilao. ML system suggests avoiding this segment.',
    timeAgo: '45m ago',
    priority: 'high priority',
    icon: 'warning-outline',
    tone: 'critical',
    unread: true,
    category: 'traffic',
  },
  {
    id: 'maintenance-balintawak',
    title: 'Scheduled Maintenance Tonight',
    message:
      'Road resurfacing at Balintawak begins at 11 PM. Expect lane reductions and slower flow.',
    timeAgo: '1h ago',
    priority: 'medium priority',
    icon: 'construct-outline',
    tone: 'warning',
    unread: false,
    category: 'maintenance',
  },
  {
    id: 'maintenance-candaba',
    title: 'Candaba Viaduct Re-blocking',
    message:
      'Right lane closed northbound at the Candaba Viaduct until Friday 5 AM for deck repairs.',
    timeAgo: '3h ago',
    priority: 'medium priority',
    icon: 'construct-outline',
    tone: 'warning',
    unread: true,
    category: 'maintenance',
  },
  {
    id: 'maintenance-sta-rita-joints',
    title: 'Bridge Joint Repairs at Sta. Rita',
    message:
      'Right lane closed southbound near Sta. Rita Guiguinto this weekend for bridge joint replacement.',
    timeAgo: '5h ago',
    priority: 'medium priority',
    icon: 'construct-outline',
    tone: 'warning',
    unread: false,
    category: 'maintenance',
  },
  {
    id: 'maintenance-marilao-drainage',
    title: 'Drainage Works at Marilao',
    message:
      'Shoulder closed southbound near Marilao Exit for drainage clearing, 9 PM to 4 AM nightly.',
    timeAgo: '6h ago',
    priority: 'medium priority',
    icon: 'construct-outline',
    tone: 'warning',
    unread: false,
    category: 'maintenance',
  },
];

interface AlertsContextValue {
  alerts: AlertItem[];
  /** Every unread alert, both categories - what the tab badge counts. */
  unreadCount: number;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
}

const AlertsContext = createContext<AlertsContextValue | null>(null);

/** Compact, stable id for an advisory, so "already read" survives a re-render
 *  but a NEW advisory with different text arrives unread. */
function advisoryId(tone: AdvisoryTone, message: string): string {
  let h = 5381;
  const basis = `${tone}:${message}`;
  for (let i = 0; i < basis.length; i += 1) h = ((h << 5) + h + basis.charCodeAt(i)) | 0;
  return `advisory-${(h >>> 0).toString(36)}`;
}

const ADVISORY_ICON: Record<AdvisoryTone, keyof typeof Ionicons.glyphMap> = {
  critical: 'alert-circle',
  warning: 'warning-outline',
  info: 'information-circle-outline',
};

export const AlertsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [alerts, setAlerts] = useState<AlertItem[]>(initialAlerts);

  // An advisory published from the dashboard (/dashboard/mobile). It is derived
  // rather than pushed into `alerts`, so an operator retracting it removes it
  // here too instead of leaving a notice nobody can clear.
  const { config } = useMobileConfig();
  const [readAdvisories, setReadAdvisories] = useState<string[]>([]);

  const advisory = useMemo<AlertItem | null>(() => {
    const a = config.advisory;
    if (!a.active || a.message.trim().length === 0) return null;
    const id = advisoryId(a.tone, a.message);
    return {
      id,
      title: a.tone === 'critical' ? 'Critical advisory' : a.tone === 'warning' ? 'Traffic advisory' : 'Notice',
      message: a.message,
      timeAgo: 'Now',
      priority: a.tone === 'critical' ? 'high priority' : 'medium priority',
      icon: ADVISORY_ICON[a.tone],
      tone: a.tone,
      unread: !readAdvisories.includes(id),
      // Grouped with traffic rather than maintenance: an advisory is something
      // happening now, which is exactly what the traffic list is for. `pinned`
      // keeps it visible even when that category is switched off.
      category: 'traffic',
      pinned: true,
    };
  }, [config.advisory, readAdvisories]);

  // The advisory leads, because an operator posted it deliberately and it is
  // the newest thing in the list by definition.
  const allAlerts = useMemo(
    () => (advisory === null ? alerts : [advisory, ...alerts]),
    [advisory, alerts]
  );

  const markAsRead = useCallback((id: string): void => {
    if (id.startsWith('advisory-')) {
      setReadAdvisories((current) => (current.includes(id) ? current : [...current, id]));
      return;
    }
    setAlerts((current) =>
      current.map((item) => (item.id === id ? { ...item, unread: false } : item))
    );
  }, []);

  const markAllAsRead = useCallback((): void => {
    setAlerts((current) => current.map((item) => ({ ...item, unread: false })));
    setReadAdvisories((current) =>
      advisory === null || current.includes(advisory.id) ? current : [...current, advisory.id]
    );
  }, [advisory]);

  const unreadCount = useMemo(
    () => allAlerts.filter((item) => item.unread).length,
    [allAlerts]
  );

  const value = useMemo(
    () => ({ alerts: allAlerts, unreadCount, markAsRead, markAllAsRead }),
    [allAlerts, unreadCount, markAsRead, markAllAsRead]
  );

  return <AlertsContext.Provider value={value}>{children}</AlertsContext.Provider>;
};

export function useAlerts(): AlertsContextValue {
  const value = useContext(AlertsContext);
  if (value === null) {
    throw new Error('useAlerts must be used inside an AlertsProvider');
  }
  return value;
}
