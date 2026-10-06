import { getExit } from '../constants/nlexSegments';
import { exitIdForSegment, getDashboardJson } from './forecastApi';

/**
 * Roadworks an operator has scheduled on the team's dashboard
 * (/dashboard/maintenance), for the Alerts tab's Maintenance list.
 *
 * Read straight from the dashboard, like forecastApi: it only wakes for
 * callers outside Render, and its list endpoint is public and documented as
 * one the mobile app consumes.
 */

const LIST_PATH = '/api/maintenance/list';
const EXITS_PATH = '/api/map-comparison/exits';

export type MaintenanceStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
export type LaneClosure = 'None' | 'Shoulder only' | '1 lane' | '2 lanes' | 'Full closure';

export interface MaintenanceNotice {
  id: string;
  title: string;
  description: string | null;
  /** NLEX km posts, low to high whichever way the work runs. */
  fromKm: number;
  toKm: number;
  /** "Marilao to Bocaue Interchange", or "near Marilao"; null if the exit list is unavailable. */
  place: string | null;
  direction: 'NB' | 'SB' | 'Both';
  laneClosure: LaneClosure;
  startsAt: Date;
  endsAt: Date;
  status: MaintenanceStatus;
  /** Changes whenever an operator edits the notice or moves its status. */
  updatedAt: number;
}

interface ExitPost {
  name: string;
  km: number;
}

const LANE_CLOSURES: LaneClosure[] = ['None', 'Shoulder only', '1 lane', '2 lanes', 'Full closure'];

/** The exit list barely changes, so it is read once per launch. */
let exitPosts: ExitPost[] | null = null;

async function loadExitPosts(): Promise<ExitPost[] | null> {
  if (exitPosts !== null) {
    return exitPosts;
  }
  try {
    const body = (await getDashboardJson(EXITS_PATH)) as { data?: unknown };
    const rows = Array.isArray(body?.data) ? (body.data as Record<string, unknown>[]) : [];
    const posts: ExitPost[] = [];
    for (const row of rows) {
      const km = Number(row.km);
      if (typeof row.exit_name !== 'string' || !Number.isFinite(km)) {
        continue;
      }
      // The app's own spelling ("CDV / Ph. Arena", not "Cdv/Ph Arena").
      const exitId = exitIdForSegment(row.exit_name);
      posts.push({ name: (exitId !== null ? getExit(exitId)?.name : undefined) ?? row.exit_name, km });
    }
    if (posts.length > 0) {
      exitPosts = posts;
    }
    return exitPosts;
  } catch {
    // Not fatal: a notice still shows its km range without the exit names.
    return null;
  }
}

function nearestExit(posts: ExitPost[], km: number): string {
  let best = posts[0];
  for (const post of posts) {
    if (Math.abs(post.km - km) < Math.abs(best.km - km)) {
      best = post;
    }
  }
  return best.name;
}

/** "Marilao to Bocaue Interchange" in the order traffic meets them, or "near Marilao". */
function describePlace(posts: ExitPost[], startKm: number, endKm: number): string {
  const from = nearestExit(posts, startKm);
  const to = nearestExit(posts, endKm);
  return from === to ? `near ${from}` : `${from} to ${to}`;
}

/**
 * Notices a driver can still act on: scheduled or under way, and not yet
 * over. A finished or cancelled job is gone rather than greyed out, and so is
 * one whose window has passed even if nobody marked it complete - the
 * dashboard holds an "in progress" job that ended in August.
 */
export async function fetchMaintenanceNotices(now = new Date()): Promise<MaintenanceNotice[]> {
  const [body, posts] = await Promise.all([getDashboardJson(LIST_PATH), loadExitPosts()]);
  const list = body as { success?: boolean; data?: unknown };
  if (list?.success !== true || !Array.isArray(list.data)) {
    throw new Error('The dashboard sent no maintenance list.');
  }

  const notices: MaintenanceNotice[] = [];
  for (const row of list.data as Record<string, unknown>[]) {
    const startsAt = new Date(String(row.starts_at));
    const endsAt = new Date(String(row.ends_at));
    const startKm = Number(row.start_km);
    const endKm = Number(row.end_km);
    const status = row.status as MaintenanceStatus;
    if (
      typeof row.id !== 'string' ||
      typeof row.title !== 'string' ||
      Number.isNaN(startsAt.getTime()) ||
      Number.isNaN(endsAt.getTime()) ||
      !Number.isFinite(startKm) ||
      !Number.isFinite(endKm)
    ) {
      continue;
    }
    if ((status !== 'scheduled' && status !== 'in_progress') || endsAt <= now) {
      continue;
    }

    const direction = row.direction === 'NB' || row.direction === 'SB' ? row.direction : 'Both';
    const updatedAt = new Date(String(row.updated_at ?? row.created_at)).getTime();
    notices.push({
      id: row.id,
      title: row.title.trim(),
      description:
        typeof row.description === 'string' && row.description.trim().length > 0
          ? row.description.trim()
          : null,
      fromKm: Math.min(startKm, endKm),
      toKm: Math.max(startKm, endKm),
      // Named in the order traffic reaches the works: southbound runs down the km posts.
      place:
        posts === null
          ? null
          : direction === 'SB'
            ? describePlace(posts, Math.max(startKm, endKm), Math.min(startKm, endKm))
            : describePlace(posts, Math.min(startKm, endKm), Math.max(startKm, endKm)),
      direction,
      laneClosure: LANE_CLOSURES.includes(row.lane_closure as LaneClosure)
        ? (row.lane_closure as LaneClosure)
        : 'None',
      startsAt,
      endsAt,
      status,
      updatedAt: Number.isNaN(updatedAt) ? 0 : updatedAt,
    });
  }

  // Under way first, then soonest to start.
  notices.sort((a, b) => {
    const live = Number(b.startsAt <= now) - Number(a.startsAt <= now);
    return live !== 0 ? live : a.startsAt.getTime() - b.startsAt.getTime();
  });
  return notices;
}
