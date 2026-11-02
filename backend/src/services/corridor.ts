import {
  centrelineVertexCount,
  corridorStatusFromFeed,
  type ExitStatus,
  type FeatureCollection,
  type JamOnCorridor,
  type NlexExit,
} from '../corridor/deriveStatus';

export type { JamOnCorridor };

/**
 * Live NLEX corridor data, read from the dashboard/intelligence system.
 *
 * This is the only source of traffic facts the assistant is allowed to use.
 * When it cannot be reached we say so explicitly rather than returning an
 * empty result - a chatbot that answers "no traffic" because a fetch failed
 * would be worse than one that admits it does not know.
 */

const CORRIDOR_API_BASE_URL =
  process.env.CORRIDOR_API_URL ?? 'http://localhost:4000';
/*
 * The dashboard's own live feed, plus the exit roster that keys it.
 *
 * Deliberately NOT /api/dashboard/corridor-status/full any more. That endpoint
 * aggregates in SQL, and the dashboard stopped rendering from it because the
 * two pipelines disagreed - the SQL side counted jams near the corridor that
 * the map had discarded for not lying on it. Reading it left this app showing
 * different numbers from the dashboard for the same moment.
 *
 * These two are what the dashboard itself reads. The per-exit status is then
 * derived here with the dashboard's own function, so both agree by
 * construction rather than by coincidence.
 */
const REALTIME_PATH = '/api/map-comparison/real-time';
const EXITS_PATH = '/api/map-comparison/exits';

/**
 * A dead host never refuses, it just stops answering - so there has to be a
 * bound. 8s was too tight: the dashboard is on a free tier that sleeps, and
 * waking it takes 20-25s, during which Render answers 502. Every first request
 * after an idle spell therefore failed, and the app showed "data unavailable"
 * on a system that was merely starting up.
 *
 * This bounds the whole wake, retries included, and sits under the app's own
 * 60s timeout so the app still gets an answer rather than a dropped request.
 */
const REQUEST_TIMEOUT_MS = 50000;

/**
 * What Render answers while a sleeping service starts. That is "wait", not
 * "broken", so keep trying until the deadline above. 429 is on the list
 * because a request from this service to the sleeping dashboard is turned
 * away with 429 at once, while a request from a laptop is simply held for the
 * 20-25s the wake takes. Anything else, including a 404 or a 500, is a real
 * failure and is reported.
 */
const COLD_START_CODES = new Set([429, 502, 503, 504]);
const RETRY_DELAY_MS = 3000;

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** The ingester writes every few minutes, so a short cache costs nothing. */
const CACHE_TTL_MS = 30000;

export type CorridorStatusValue = 'clear' | 'slow' | 'congested';

export interface CorridorDirectionStatus {
  status: CorridorStatusValue;
  level: number | null;
  speedKmh: number | null;
  jamCount: number;
  observedAt: string | null;
  /** "Entry & Exit", "Entry Only", "Exit Only", "No Access", or null at a barrier. */
  access: string | null;
  hasRamp: boolean;
  /** Where the queues actually are, so the map can colour only those. */
  jams: JamOnCorridor[];
  /** The longest single queue at this exit, in metres: the dashboard's figure. */
  queueMetres: number;
  /**
   * The worst single queue's delay, in seconds: the dashboard's figure. Null when
   * no jam carried one, which is not the same as no delay. Waze sends -1 for "not
   * measurable", so anything at or below zero is not a delay to show.
   */
  delaySeconds: number | null;
}

export interface CorridorExit {
  exit_id: number;
  exit_name: string;
  display_name: string;
  km: number;
  latitude: number;
  longitude: number;
  node_type: string;
  directions: { NB: CorridorDirectionStatus; SB: CorridorDirectionStatus };
}

export interface CorridorFeed {
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
  generatedAt: string;
  feed: CorridorFeed;
  counts: CorridorCounts;
  exits: CorridorExit[];
  /**
   * Which centreline the jam indices point into. The app ships its own copy of
   * that line and compares this before drawing, so a change to the geometry or
   * the exit list shows as "no jam detail" rather than as jams in the wrong
   * place.
   */
  geometry: { centrelineVertices: number };
}

/** Either live data, or a plain reason we could not get it. */
export type CorridorResult =
  | { available: true; data: CorridorStatusData }
  | { available: false; reason: string };

/** What /api/map-comparison/real-time returns: GeoJSON plus its own freshness. */
interface RealtimeFeed extends FeatureCollection {
  feed?: {
    newestAt?: string | null;
    ageMinutes?: number | null;
    stale?: boolean;
  };
}

/**
 * The exit roster, however the dashboard wrapped it.
 *
 * It has served both a bare array and a {success, data} envelope at different
 * times, so both are accepted rather than betting on one.
 */
function readExitList(payload: unknown): NlexExit[] {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { data?: unknown })?.data)
      ? ((payload as { data: unknown[] }).data)
      : [];

  return rows.filter((row): row is NlexExit => {
    const exit = row as Partial<NlexExit>;
    return (
      typeof exit.exit_name === 'string' &&
      typeof exit.latitude === 'number' &&
      typeof exit.longitude === 'number' &&
      typeof exit.km === 'number'
    );
  });
}

/**
 * How you can use this exit in this direction.
 *
 * Copied from the dashboard's accessLabel in lib/nlex-exits.ts, including the
 * null at a toll barrier - a barrier is not an exit you take, so "No Access"
 * would read as though something were wrong with it.
 */
/**
 * Does traffic flow through here in this direction?
 *
 * Not the same question as whether there is a ramp. A toll barrier has no
 * entry or exit ramps at all, but the mainline runs straight through it, so
 * both carriageways carry traffic. The Corridor screen draws a direction with
 * hasRamp=false as bare grey tarmac - "no road this way" - which is right for
 * a one-way interchange and wrong for a barrier: it left a grey gap in the
 * northbound carriageway at Bocaue Barrier, on a road that plainly continues.
 *
 * Matches what the SQL endpoint reported for the same exits.
 */
function trafficFlows(exit: NlexExit, direction: 'NB' | 'SB'): boolean {
  if (exit.node_type === 'toll-barrier') {
    return true;
  }
  return direction === 'NB'
    ? exit.nb_entry === true || exit.nb_exit === true
    : exit.sb_entry === true || exit.sb_exit === true;
}

function accessLabel(exit: NlexExit, direction: 'NB' | 'SB'): string | null {
  const entry = direction === 'NB' ? exit.nb_entry : exit.sb_entry;
  const leave = direction === 'NB' ? exit.nb_exit : exit.sb_exit;
  if (exit.node_type === 'toll-barrier') {
    return null;
  }
  if (entry === true && leave === true) {
    return 'Entry & Exit';
  }
  if (entry === true) {
    return 'Entry Only';
  }
  if (leave === true) {
    return 'Exit Only';
  }
  return 'No Access';
}

/** An exit-direction the feed said nothing about: no jams means clear. */
const clearStatus = (hasRamp: boolean, access: string | null): CorridorDirectionStatus => ({
  status: 'clear',
  level: null,
  speedKmh: null,
  jamCount: 0,
  observedAt: null,
  access,
  hasRamp,
  jams: [],
  queueMetres: 0,
  delaySeconds: null,
});

/**
 * Turn the dashboard's feed into the shape this app has always consumed.
 *
 * Keeping the shape identical is the point: the assistant's tools and the Map
 * screen both read it, and neither should have to care that the derivation
 * moved. Only the numbers change - to the dashboard's.
 */
/** The dashboard's own line for calling its feed stale. */
const FEED_STALE_AFTER_MINUTES = 30;

/**
 * How old the feed is right now, worked out from its newest report.
 *
 * The dashboard's own age figure is frozen into its cached answer. On 2 Nov 2026
 * its server kept serving a reading 17 minutes old and still labelled "1.1
 * minutes, not stale", because a failed background refresh leaves the old copy
 * in place. Only the timestamp can be trusted to stay true.
 */
function feedFreshness(feed: RealtimeFeed): CorridorStatusData['feed'] {
  const newestAt = feed.feed?.newestAt ?? null;
  const ageMinutes = newestAt === null ? NaN : (Date.now() - Date.parse(newestAt)) / 60000;
  if (!Number.isFinite(ageMinutes)) {
    return {
      newestAt,
      ageMinutes: feed.feed?.ageMinutes ?? null,
      // No freshness block means we cannot vouch for the data's age.
      stale: feed.feed?.stale ?? true,
    };
  }
  return {
    newestAt,
    ageMinutes: Math.round(Math.max(0, ageMinutes) * 10) / 10,
    stale: ageMinutes > FEED_STALE_AFTER_MINUTES,
  };
}

function buildCorridorStatus(feed: RealtimeFeed, exits: NlexExit[]): CorridorStatusData {
  const derived = corridorStatusFromFeed(feed, exits);

  const byExit = new Map<string, { NB?: ExitStatus; SB?: ExitStatus }>();
  for (const row of derived) {
    const entry = byExit.get(row.exit) ?? {};
    entry[row.direction] = row;
    byExit.set(row.exit, entry);
  }

  const toDirection = (
    row: ExitStatus | undefined,
    hasRamp: boolean,
    access: string | null,
  ): CorridorDirectionStatus =>
    row === undefined
      ? clearStatus(hasRamp, access)
      : {
          status: row.status,
          level: row.level,
          speedKmh: row.speedKmh,
          jamCount: row.jamCount,
          observedAt: row.observedAt,
          access,
          hasRamp,
          jams: row.jams,
          queueMetres: row.longestQueueMetres ?? 0,
          delaySeconds: row.delaySeconds,
        };

  const ordered = [...exits].sort((a, b) => a.km - b.km);
  const rows: CorridorExit[] = ordered.map((exit) => {
    const found = byExit.get(exit.exit_name) ?? {};
    return {
      exit_id: exit.exit_id,
      exit_name: exit.exit_name,
      // The dashboard's roster carries no separate display name.
      display_name: exit.exit_name,
      km: exit.km,
      // The Corridor screen prints these under each exit, so they are not
      // optional - leaving them out crashed it on exit.latitude.toFixed().
      latitude: exit.latitude,
      longitude: exit.longitude,
      node_type: exit.node_type ?? 'interchange',
      directions: {
        NB: toDirection(found.NB, trafficFlows(exit, 'NB'), accessLabel(exit, 'NB')),
        SB: toDirection(found.SB, trafficFlows(exit, 'SB'), accessLabel(exit, 'SB')),
      },
    };
  });

  const counts: CorridorCounts = { congested: 0, slow: 0, clear: 0 };
  for (const row of rows) {
    for (const key of ['NB', 'SB'] as const) {
      // A side with no access is not counted at all, as on the dashboard's tally.
      if (row.directions[key].access !== 'No Access') {
        counts[row.directions[key].status] += 1;
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    feed: feedFreshness(feed),
    counts,
    exits: rows,
    geometry: { centrelineVertices: centrelineVertexCount(exits) },
  };
}

let cached: { at: number; result: CorridorResult } | null = null;
/**
 * The fetch already under way, if any. While the dashboard wakes, the app's
 * poll and a chatbot question can arrive together; sharing one attempt keeps
 * them from each hammering a service that is still starting.
 */
let inFlight: Promise<CorridorResult> | null = null;

export async function getCorridorStatus(): Promise<CorridorResult> {
  if (cached !== null && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.result;
  }
  if (inFlight === null) {
    inFlight = fetchCorridorStatus().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

async function fetchCorridorStatus(): Promise<CorridorResult> {
  const deadline = Date.now() + REQUEST_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let result: CorridorResult;
  try {
    // Both in flight together: the roster is small and rarely changes, but it
    // keys the derivation, so there is nothing to show without it either.
    /** Retries only while the upstream is waking, and only until the deadline. */
    const get = async (path: string): Promise<Response> => {
      for (;;) {
        const response = await fetch(`${CORRIDOR_API_BASE_URL}${path}`, {
          signal: controller.signal,
        });
        if (!COLD_START_CODES.has(response.status) || Date.now() + RETRY_DELAY_MS >= deadline) {
          return response;
        }
        await wait(RETRY_DELAY_MS);
      }
    };

    const [feedResponse, exitsResponse] = await Promise.all([
      get(REALTIME_PATH),
      get(EXITS_PATH),
    ]);

    if (!feedResponse.ok) {
      result = {
        available: false,
        reason: `The traffic data service answered with HTTP ${feedResponse.status}.`,
      };
    } else if (!exitsResponse.ok) {
      result = {
        available: false,
        reason: `The exit list service answered with HTTP ${exitsResponse.status}.`,
      };
    } else {
      const feed = (await feedResponse.json()) as RealtimeFeed;
      const exits = readExitList(await exitsResponse.json());

      result =
        exits.length === 0
          ? {
              available: false,
              reason: 'The traffic data service returned no NLEX exits.',
            }
          : { available: true, data: buildCorridorStatus(feed, exits) };
    }
  } catch {
    result = {
      available: false,
      reason:
        'The live NLEX traffic service is unreachable right now, so no current road conditions are available.',
    };
  } finally {
    clearTimeout(timeout);
  }

  // Only a good answer is worth keeping. Caching a failure meant a Retry
  // tapped moments later got the same error back without even trying.
  if (result.available) {
    cached = { at: Date.now(), result };
  }
  return result;
}

/**
 * Resolve whatever the user called an exit to a real one.
 *
 * People say "Bocaue" for "Bocaue Barrier" and "Harbor Link" for "NLEX Harbor
 * Link", so an exact match alone would fail on most natural phrasing.
 */
/**
 * Fold the spellings people actually type onto one form.
 *
 * "Sta Ines" and "Sta. Ines" are the same place to a driver, and both get
 * typed. Punctuation and double spaces are dropped so the match does not hinge
 * on whether someone bothered with the full stop.
 */
function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/[.,''`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function findExit(exits: CorridorExit[], query: string): CorridorExit | null {
  const needle = normalise(query);
  if (needle.length === 0) {
    return null;
  }

  const names = (exit: CorridorExit): string[] => [
    normalise(exit.display_name),
    normalise(exit.exit_name),
  ];

  const exact = exits.find((exit) => names(exit).includes(needle));
  if (exact !== undefined) {
    return exact;
  }

  const partial = exits.find((exit) =>
    names(exit).some((name) => name.includes(needle) || needle.includes(name)),
  );
  return partial ?? null;
}

/** Human-readable age of the feed, for the model to pass on to the user. */
export function describeFeedAge(feed: CorridorFeed): string {
  if (feed.ageMinutes === null) {
    return 'unknown age';
  }
  if (feed.ageMinutes < 1) {
    return 'updated just now';
  }
  if (feed.ageMinutes === 1) {
    return 'updated 1 minute ago';
  }
  return `updated ${Math.round(feed.ageMinutes)} minutes ago`;
}
