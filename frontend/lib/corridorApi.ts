import { API_TIMEOUT_MS, CORRIDOR_API_BASE_URL, TRAFFIC_SOURCE_URL } from '../config/api';

export { CORRIDOR_API_BASE_URL };

const CORRIDOR_STATUS_PATH = '/api/dashboard/corridor-status/full';

/** The server has already classified congestion - never re-derive this from `level`. */
export type CorridorStatusValue = 'clear' | 'slow' | 'congested';

/**
 * One queue, as a range of vertices on the corridor centreline.
 *
 * The app ships the same centreline the backend derives on, so a pair of
 * indices places the queue exactly where it was measured without sending its
 * geometry. Overlapping Waze reports are already merged upstream, so these do
 * not double back over each other.
 */
export interface CorridorJam {
  startIndex: number;
  endIndex: number;
  level: number | null;
  speedKmh: number | null;
  /** Waze's estimate of the time this queue adds, in seconds. */
  delaySeconds: number | null;
  lengthMetres: number;
}

export interface CorridorDirectionStatus {
  status: CorridorStatusValue;
  level: number | null;
  speedKmh: number | null;
  jamCount: number;
  observedAt: string | null;
  access: string | null;
  /** False means no ramp exists for this direction at this exit - no traffic ever flows there. */
  hasRamp: boolean;
  /**
   * Where the queues are. Absent from a backend that predates this field, so
   * every reader must cope with it being undefined rather than empty - the two
   * mean very different things: undefined is "not told", [] is "none".
   */
  jams?: CorridorJam[];
  queueMetres?: number;
  delaySeconds?: number | null;
}

export interface CorridorExit {
  exit_id: number;
  exit_name: string;
  display_name: string;
  /** Kilometres from Balintawak (km 0) - exit_id ascending already matches this order. */
  km: number;
  latitude: number;
  longitude: number;
  node_type: string;
  directions: {
    NB: CorridorDirectionStatus;
    SB: CorridorDirectionStatus;
  };
}

export interface CorridorFeedMeta {
  newestAt: string | null;
  ageMinutes: number | null;
  stale: boolean;
}

export interface CorridorCounts {
  congested: number;
  slow: number;
  clear: number;
}

export interface CorridorStatusData {
  windowMinutes: number;
  generatedAt: string;
  feed: CorridorFeedMeta;
  counts: CorridorCounts;
  /** Ordered by exit_id ascending = Balintawak (km 0) -> Sta. Ines (km ~76.25). */
  exits: CorridorExit[];
  /**
   * Which centreline the jam indices point into. Compared against the app's
   * own copy before any jam is drawn, so a change to the geometry upstream
   * shows as missing detail rather than as queues in the wrong place.
   */
  geometry?: { centrelineVertices: number };
}

interface CorridorStatusApiResponse {
  success: boolean;
  data: CorridorStatusData;
}

/** Why a corridor request failed, so the UI can say something useful. */
export type CorridorErrorKind =
  /** Nothing answered at the address - backend down, wrong IP, or firewalled. */
  | 'unreachable'
  /** The server answered, but not with what we expected. */
  | 'badResponse';

export class CorridorApiError extends Error {
  readonly kind: CorridorErrorKind;
  /** The address that was tried, so the message can name it. */
  readonly url: string;

  constructor(kind: CorridorErrorKind, message: string, url: string) {
    super(message);
    this.name = 'CorridorApiError';
    this.kind = kind;
    this.url = url;
  }
}

let waking: Promise<void> | null = null;

/**
 * Wakes the team's dashboard, and resolves once it answers (or gives up).
 *
 * Our backend cannot do this: while the dashboard sleeps, Render refuses its
 * requests with 429 instead of waking it, so every load after an idle spell
 * failed until someone happened to open the dashboard. The phone is outside
 * Render, so its request wakes it in the 20-25s a cold start takes. The answer
 * is thrown away - only the wake matters. Callers at the same moment share one
 * ping.
 */
export function wakeTrafficSource(): Promise<void> {
  if (waking === null) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    waking = fetch(`${TRAFFIC_SOURCE_URL}/api/map-comparison/exits`, { signal: controller.signal })
      .then(() => undefined, () => undefined)
      .finally(() => {
        clearTimeout(timeoutId);
        waking = null;
      });
  }
  return waking;
}

export async function fetchCorridorStatus(signal?: AbortSignal): Promise<CorridorStatusData> {
  const url = `${CORRIDOR_API_BASE_URL}${CORRIDOR_STATUS_PATH}`;

  // A dead host does not refuse the connection, it simply never answers - without
  // our own deadline the request sits there for the platform default (a minute or
  // more on iOS) and the card looks like it is hanging.
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), API_TIMEOUT_MS);

  // Honour the caller's signal (screen unmount, refresh) as well as our timeout.
  const onCallerAbort = (): void => timeoutController.abort();
  signal?.addEventListener('abort', onCallerAbort);

  let response: Response;
  try {
    response = await fetch(url, { signal: timeoutController.signal });
  } catch (caught) {
    // The caller cancelled deliberately: let the hook drop it, do not surface
    // an error the user would see for a screen they already left.
    if (signal?.aborted === true) {
      throw caught;
    }
    throw new CorridorApiError('unreachable', 'Could not reach the backend', url);
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', onCallerAbort);
  }

  if (!response.ok) {
    throw new CorridorApiError(
      'badResponse',
      `The backend answered with HTTP ${response.status}`,
      url,
    );
  }

  let payload: CorridorStatusApiResponse;
  try {
    payload = (await response.json()) as CorridorStatusApiResponse;
  } catch {
    throw new CorridorApiError('badResponse', 'The backend sent a response we could not read', url);
  }

  if (!payload.success || payload.data === undefined) {
    throw new CorridorApiError('badResponse', 'The backend reported the request did not succeed', url);
  }

  return payload.data;
}
