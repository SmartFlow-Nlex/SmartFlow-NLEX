import { getExit } from '../../constants/nlexSegments';
import { exitIdForSegment } from './forecast';

/**
 * How the dashboard's maintenance list is read (/dashboard/maintenance on the
 * team's dashboard): roadworks an operator has scheduled.
 *
 * Only the reading lives here, with no network and no React Native, so the
 * backend shares it: Navie names the same notices the Alerts tab lists.
 * Fetching stays in lib/maintenanceApi.
 */

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

/** An exit and its NLEX km post, from /api/map-comparison/exits. */
export interface ExitPost {
  name: string;
  km: number;
}

const LANE_CLOSURES: LaneClosure[] = ['None', 'Shoulder only', '1 lane', '2 lanes', 'Full closure'];

/** The exits' km posts, in the app's own spelling ("CDV / Ph. Arena", not "Cdv/Ph Arena"). */
export function parseExitPosts(body: unknown): ExitPost[] {
  const data = (body as { data?: unknown } | null)?.data;
  const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  const posts: ExitPost[] = [];
  for (const row of rows) {
    const km = Number(row.km);
    if (typeof row.exit_name !== 'string' || !Number.isFinite(km)) {
      continue;
    }
    const exitId = exitIdForSegment(row.exit_name);
    posts.push({ name: (exitId !== null ? getExit(exitId)?.name : undefined) ?? row.exit_name, km });
  }
  return posts;
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
 *
 * `posts` names the places; without it a notice keeps only its km range.
 */
export function parseMaintenance(body: unknown, posts: ExitPost[] | null, now: Date): MaintenanceNotice[] {
  const list = body as { success?: boolean; data?: unknown } | null;
  if (list?.success !== true || !Array.isArray(list.data)) {
    throw new Error('The dashboard sent no maintenance list.');
  }
  const named = posts !== null && posts.length > 0 ? posts : null;

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
        named === null
          ? null
          : direction === 'SB'
            ? describePlace(named, Math.max(startKm, endKm), Math.min(startKm, endKm))
            : describePlace(named, Math.min(startKm, endKm), Math.max(startKm, endKm)),
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
