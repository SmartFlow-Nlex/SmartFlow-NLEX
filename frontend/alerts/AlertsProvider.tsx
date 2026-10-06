import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useMobileConfig, type AdvisoryTone } from '../lib/mobileConfig';
import type { LaneClosure, MaintenanceNotice } from '../lib/maintenanceApi';
import { useMaintenanceNotices } from '../hooks/useMaintenanceNotices';
import { usePolledList } from '../hooks/usePolledList';
import { RoadReport, describeRoadReport, fetchRoadReports } from '../lib/roadReportsApi';
import {
  CommunityIncidentAlert,
  fetchCommunityIncidentAlerts,
  timeAgoFrom,
} from '../lib/communityApi';
import {
  describeDaysAhead,
  formatDayMonth,
  formatTime,
  formatWeekday,
  isSameDay,
} from '../lib/datetime';

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
  /**
   * Something drivers reported - a Waze accident, hazard or police report, or
   * a community incident report. These are what the in-app banner announces
   * when a new one arrives.
   */
  reported?: boolean;
  /** When it was reported, for newest-first ordering. */
  at?: number;
}

interface AlertsContextValue {
  alerts: AlertItem[];
  /** Every unread alert, both categories - what the tab badge counts. */
  unreadCount: number;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  /** Whether the maintenance list has loaded, so an empty one is not read as "no works". */
  maintenanceStatus: 'loading' | 'error' | 'ready';
  /** Same, for the reported alerts (Waze and community): "none" only means none once loaded. */
  reportsStatus: 'loading' | 'error' | 'ready';
  /** Re-reads everything that comes from outside the app. */
  refresh: () => void;
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

const DIRECTION_LABEL: Record<MaintenanceNotice['direction'], string> = {
  NB: 'Northbound',
  SB: 'Southbound',
  Both: 'Both directions',
};

const CLOSURE_LABEL: Record<LaneClosure, string> = {
  None: 'No lanes closed',
  'Shoulder only': 'Shoulder closed',
  '1 lane': '1 lane closed',
  '2 lanes': '2 lanes closed',
  'Full closure': 'Road fully closed',
};

/** How much a closure gets in a driver's way, on the alerts' own scale. */
const CLOSURE_TONE: Record<LaneClosure, AlertTone> = {
  None: 'info',
  'Shoulder only': 'info',
  '1 lane': 'warning',
  '2 lanes': 'warning',
  'Full closure': 'critical',
};

function formatKm(km: number): string {
  return Number.isInteger(km) ? String(km) : km.toFixed(1);
}

/** "Sat 7 Nov 10:00 PM – Sun 8 Nov 4:00 AM", or one day with two times. */
function formatWindow(start: Date, end: Date): string {
  const day = (date: Date): string => `${formatWeekday(date)} ${formatDayMonth(date)}`;
  return isSameDay(start, end)
    ? `${day(start)}, ${formatTime(start)} – ${formatTime(end)}`
    : `${day(start)} ${formatTime(start)} – ${day(end)} ${formatTime(end)}`;
}

/** "in 40 min", "in 5 h", "tomorrow", "in 3 days". */
function fromNow(target: Date, now: Date): string {
  const minutes = Math.max(1, Math.round((target.getTime() - now.getTime()) / 60000));
  if (minutes < 60) {
    return `in ${minutes} min`;
  }
  if (minutes < 24 * 60) {
    return `in ${Math.round(minutes / 60)} h`;
  }
  return describeDaysAhead(target, now).toLowerCase();
}

function maintenanceAlert(notice: MaintenanceNotice, now: Date, read: string[]): AlertItem {
  const id = `maintenance-${notice.id}-${notice.updatedAt}`;
  const km =
    notice.fromKm === notice.toKm
      ? `Km ${formatKm(notice.fromKm)}`
      : `Km ${formatKm(notice.fromKm)}–${formatKm(notice.toKm)}`;
  const where = notice.place === null ? km : `${notice.place} (${km})`;
  const underWay = notice.status === 'in_progress' || notice.startsAt <= now;
  const tone = CLOSURE_TONE[notice.laneClosure];

  return {
    id,
    title: notice.title,
    message: [
      `${DIRECTION_LABEL[notice.direction]}, ${where} · ${CLOSURE_LABEL[notice.laneClosure]}`,
      formatWindow(notice.startsAt, notice.endsAt),
      notice.description,
    ]
      .filter((line): line is string => line !== null)
      .join('\n'),
    timeAgo: underWay
      ? `Under way · ends ${fromNow(notice.endsAt, now)}`
      : `Starts ${fromNow(notice.startsAt, now)}`,
    priority: tone === 'critical' ? 'high priority' : 'medium priority',
    icon: 'construct-outline',
    tone,
    unread: !read.includes(id),
    category: 'maintenance',
  };
}

/** How bad a Waze report is, on the alerts' own scale. */
function roadReportTone(report: RoadReport): AlertTone {
  if (report.type === 'ACCIDENT') {
    return report.subtype === 'ACCIDENT_MINOR' ? 'warning' : 'critical';
  }
  return report.type === 'HAZARD' ? 'warning' : 'info';
}

const ROAD_REPORT_ICON: Record<RoadReport['type'], keyof typeof Ionicons.glyphMap> = {
  ACCIDENT: 'car-outline',
  HAZARD: 'warning-outline',
  POLICE: 'shield-outline',
};

const TRAVEL_LABEL = { northbound: 'Northbound', southbound: 'Southbound' } as const;

/** "1.5 km from Meycauayan", or "near Meycauayan" under 200 m. */
function distanceFromExit(report: RoadReport): string | null {
  if (report.nearestExit === null) {
    return null;
  }
  const m = report.metresFromExit;
  if (m === null || m < 200) {
    return `near ${report.nearestExit}`;
  }
  return m < 1000
    ? `${Math.round(m / 100) * 100} m from ${report.nearestExit}`
    : `${(m / 1000).toFixed(1)} km from ${report.nearestExit}`;
}

function roadReportAlert(report: RoadReport, read: string[]): AlertItem {
  const id = `waze-${report.id}`;
  const tone = roadReportTone(report);
  const where = [
    report.direction === null ? null : TRAVEL_LABEL[report.direction],
    distanceFromExit(report),
  ]
    .filter((part): part is string => part !== null)
    .join(', ');
  return {
    id,
    title: describeRoadReport(report),
    message: [
      where.length > 0 ? `${where.charAt(0).toUpperCase()}${where.slice(1)}.` : 'On NLEX.',
      report.unconfirmed
        ? 'Reported by Waze drivers · not confirmed yet.'
        : report.reliability === null
          ? 'Reported by Waze drivers.'
          : `Reported by Waze drivers · reliability ${report.reliability}/10.`,
    ].join(' '),
    timeAgo: timeAgoFrom(report.reportedAt.toISOString()),
    priority: tone === 'critical' ? 'high priority' : 'medium priority',
    icon: ROAD_REPORT_ICON[report.type],
    tone,
    unread: !read.includes(id),
    category: 'traffic',
    reported: true,
    at: report.reportedAt.getTime(),
  };
}

/** A driver's own word for it: an "incident" report is critical, a heavy-traffic one less so. */
const COMMUNITY_TONE: Record<CommunityIncidentAlert['status'], AlertTone> = {
  incident: 'critical',
  heavy: 'warning',
  moderate: 'info',
  smooth: 'info',
};

function communityAlert(report: CommunityIncidentAlert, read: string[]): AlertItem {
  const id = `community-${report.id}`;
  const tone = COMMUNITY_TONE[report.status] ?? 'warning';
  const where =
    report.direction === null ? report.location : `${report.location}, ${report.direction}`;
  return {
    id,
    title: `Incident reported: ${where}`,
    message: [report.message.trim(), `Reported by ${report.authorName} in Community.`]
      .filter((line) => line.length > 0)
      .join('\n'),
    timeAgo: timeAgoFrom(report.createdAt.toISOString()),
    priority: tone === 'critical' ? 'high priority' : 'medium priority',
    icon: 'people-outline',
    tone,
    unread: !read.includes(id),
    category: 'traffic',
    reported: true,
    at: report.createdAt.getTime(),
  };
}

/** Module-level, so the polling hooks see one stable function each. */
const loadRoadReports = (): Promise<RoadReport[]> => fetchRoadReports();
const loadCommunityIncidents = (): Promise<CommunityIncidentAlert[]> =>
  fetchCommunityIncidentAlerts();

export const AlertsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  /**
   * Which alerts have been opened. One list for every kind - each id carries
   * its kind as a prefix - and every alert is derived from its source rather
   * than stored, so one that leaves its source (a withdrawn advisory, a
   * cleared accident) leaves the screen too instead of lingering.
   */
  const [read, setRead] = useState<string[]>([]);

  // An advisory published from the dashboard (/dashboard/mobile). It is derived
  // rather than pushed into `alerts`, so an operator retracting it removes it
  // here too instead of leaving a notice nobody can clear.
  const { config } = useMobileConfig();

  // Every advisory an operator has published, in the order they arranged them.
  // Withdrawn ones are absent rather than dimmed: a notice nobody is meant to
  // act on any more should not be occupying the top of the screen.
  const advisories = useMemo<AlertItem[]>(
    () =>
      config.advisories
        .filter((a) => a.active && a.message.trim().length > 0)
        .map((a) => {
          // Keyed on what it says, not on its id, so editing the text of a live
          // advisory brings it back unread while a re-save of the same words
          // does not.
          const id = advisoryId(a.tone, a.message);
          return {
            id,
            title:
              a.tone === 'critical'
                ? 'Critical advisory'
                : a.tone === 'warning'
                  ? 'Traffic advisory'
                  : 'Notice',
            message: a.message,
            timeAgo: 'Now',
            priority: a.tone === 'critical' ? 'high priority' : 'medium priority',
            icon: ADVISORY_ICON[a.tone],
            tone: a.tone,
            unread: !read.includes(id),
            // Grouped with traffic rather than maintenance: an advisory is
            // something happening now, which is what the traffic list is for.
            // `pinned` keeps it visible even when that category is off.
            category: 'traffic',
            pinned: true,
          } satisfies AlertItem;
        })
        // Critical first: with several pinned at once the order they were
        // arranged in matters less than which one needs acting on.
        .sort((x, y) => Number(y.tone === 'critical') - Number(x.tone === 'critical')),
    [config.advisories, read]
  );

  // Roadworks scheduled on the dashboard (/dashboard/maintenance). Derived
  // like the advisories, so a job an operator cancels or completes leaves the
  // list on the next poll. The id carries the notice's last edit, so a changed
  // window or a job that has just started comes back unread.
  const maintenance = useMaintenanceNotices();
  const maintenanceAlerts = useMemo<AlertItem[]>(() => {
    const now = new Date();
    return maintenance.notices.map((notice) => maintenanceAlert(notice, now, read));
  }, [maintenance.notices, read]);

  // What drivers are reporting: Waze accidents, hazards and police from the
  // dashboard's live feed, and incident reports from the Community tab. Both
  // are re-read once a minute.
  const roadReports = usePolledList(loadRoadReports);
  const communityIncidents = usePolledList(loadCommunityIncidents);
  const reportedAlerts = useMemo<AlertItem[]>(
    () =>
      [
        ...roadReports.items.map((report) => roadReportAlert(report, read)),
        ...communityIncidents.items.map((report) => communityAlert(report, read)),
      ].sort((a, b) => (b.at ?? 0) - (a.at ?? 0)),
    [roadReports.items, communityIncidents.items, read]
  );

  // Advisories lead: an operator posted them deliberately and they are the
  // newest things in the list by definition. Reports follow, newest first.
  const allAlerts = useMemo(
    () => [...advisories, ...reportedAlerts, ...maintenanceAlerts],
    [advisories, reportedAlerts, maintenanceAlerts]
  );

  const markAsRead = useCallback((id: string): void => {
    setRead((current) => (current.includes(id) ? current : [...current, id]));
  }, []);

  const markAllAsRead = useCallback((): void => {
    setRead((current) => {
      const next = allAlerts.map((a) => a.id).filter((id) => !current.includes(id));
      return next.length === 0 ? current : [...current, ...next];
    });
  }, [allAlerts]);

  const unreadCount = useMemo(
    () => allAlerts.filter((item) => item.unread).length,
    [allAlerts]
  );

  // Loading until BOTH sources have answered once - the banner waits on this,
  // so reports already live at launch are not announced as new. After that,
  // only the Waze feed failing counts as an error: it is the one every driver
  // has, while the community list can be empty for want of a sign-in.
  const reportsStatus: 'loading' | 'error' | 'ready' =
    roadReports.status === 'loading' || communityIncidents.status === 'loading'
      ? 'loading'
      : roadReports.status;
  const { status: maintenanceStatus, refresh: refreshMaintenance } = maintenance;
  const { refresh: refreshRoadReports } = roadReports;
  const { refresh: refreshCommunity } = communityIncidents;
  const refresh = useCallback((): void => {
    refreshMaintenance();
    refreshRoadReports();
    refreshCommunity();
  }, [refreshMaintenance, refreshRoadReports, refreshCommunity]);

  const value = useMemo(
    () => ({
      alerts: allAlerts,
      unreadCount,
      markAsRead,
      markAllAsRead,
      maintenanceStatus,
      reportsStatus,
      refresh,
    }),
    [allAlerts, unreadCount, markAsRead, markAllAsRead, maintenanceStatus, reportsStatus, refresh]
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
