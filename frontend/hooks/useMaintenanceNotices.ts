import { MaintenanceNotice, fetchMaintenanceNotices } from '../lib/maintenanceApi';
import { usePolledList } from './usePolledList';

export interface MaintenanceNoticesState {
  notices: MaintenanceNotice[];
  /** Before the first answer, after a failure with nothing to show, or settled. */
  status: 'loading' | 'error' | 'ready';
  refresh: () => void;
}

/** Called with no arguments, so `now` is always the moment of the poll. */
const fetchNotices = (): Promise<MaintenanceNotice[]> => fetchMaintenanceNotices();

/** Roadworks scheduled on the dashboard, re-read once a minute (usePolledList). */
export function useMaintenanceNotices(): MaintenanceNoticesState {
  const { items, status, refresh } = usePolledList(fetchNotices);
  return { notices: items, status, refresh };
}
