import { getDashboardJson } from './forecastApi';
import { type ExitPost, type MaintenanceNotice, parseExitPosts, parseMaintenance } from './feeds/maintenance';

/**
 * Roadworks an operator has scheduled on the team's dashboard
 * (/dashboard/maintenance), for the Alerts tab's Maintenance list.
 *
 * Read straight from the dashboard, like forecastApi: it only wakes for
 * callers outside Render, and its list endpoint is public and documented as
 * one the mobile app consumes. How the list is read lives in feeds/maintenance,
 * which the backend shares for Navie.
 */

export type { LaneClosure, MaintenanceNotice, MaintenanceStatus } from './feeds/maintenance';

const LIST_PATH = '/api/maintenance/list';
const EXITS_PATH = '/api/map-comparison/exits';

/** The exit list barely changes, so it is read once per launch. */
let exitPosts: ExitPost[] | null = null;

async function loadExitPosts(): Promise<ExitPost[] | null> {
  if (exitPosts !== null) {
    return exitPosts;
  }
  try {
    const posts = parseExitPosts(await getDashboardJson(EXITS_PATH));
    if (posts.length > 0) {
      exitPosts = posts;
    }
    return exitPosts;
  } catch {
    // Not fatal: a notice still shows its km range without the exit names.
    return null;
  }
}

/** Scheduled or under-way notices that are not over yet - see parseMaintenance. */
export async function fetchMaintenanceNotices(now = new Date()): Promise<MaintenanceNotice[]> {
  const [body, posts] = await Promise.all([getDashboardJson(LIST_PATH), loadExitPosts()]);
  return parseMaintenance(body, posts, now);
}
