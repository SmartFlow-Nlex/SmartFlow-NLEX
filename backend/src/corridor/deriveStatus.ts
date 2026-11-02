/**
 * PORTED FROM THE DASHBOARD - keep in step with it.
 *
 * Source: SmartFlow-Nlex/SmartFlow-NLEX, branch Dashboard,
 *         Front-End-Dashboard/lib/corridor-status.ts
 *
 * Why this exists rather than reading /api/dashboard/corridor-status/full:
 * that endpoint aggregates in SQL, and the dashboard stopped using it because
 * the two pipelines disagreed. Its own comment says the SQL panel "would call a
 * stretch congested on the strength of a jam the map had thrown away" - the SQL
 * side applied the NLEX street-name test but not the geometric one, so jams
 * near the corridor but not on it counted. The mobile app was still reading
 * that older pipeline, so it could show different numbers from the dashboard
 * for the same moment.
 *
 * This IS what the deployed dashboard renders from - confirmed by matching its
 * counts against both pipelines while they disagreed: the dashboard showed 4
 * congested / 36 clear, this derivation gave 4/36, and the SQL endpoint gave
 * 5/35. Earlier they had agreed only because no jam was being rejected at that
 * moment, which is a coincidence and not a check.
 *
 * The queue and delay figures follow it too (re-checked 2 Nov 2026 against the
 * deployed feed, exit by exit): the longest single report and the worst single
 * delay, never totals. The merged index ranges are extra, for drawing only.
 *
 * Known flaw, inherited deliberately: it requires every vertex of a jam to lie
 * within 200m of the centreline, and Balintawak's toll plaza is wider than
 * that, so a real level-4 jam there measured 353m off and was discarded. The
 * dashboard has the same blind spot. Matching it is the requirement, so this
 * stays until the dashboard team fix it upstream - at which point both
 * correct together.
 */

import {
  corridorGuard,
  type CorridorGuard,
  type LngLat,
} from './corridorShape';
import nlexGeometry from './nlexGeometry.json';

export type SegmentStatus = 'clear' | 'slow' | 'congested';

/**
 * One jam, placed on the corridor centreline.
 *
 * Carried as a pair of vertex indices rather than coordinates because the app
 * ships the very same centreline - both are `corridorGuard(...).centreline`
 * built from the same geometry and exit list - so indices are enough to draw
 * the jam exactly where it was measured, at a fraction of the payload. The
 * response reports the vertex count so the app can refuse to draw if the two
 * lines have drifted apart.
 */
export interface JamOnCorridor {
  /** Inclusive range into the centreline. */
  startIndex: number;
  endIndex: number;
  level: number | null;
  speedKmh: number | null;
  /** Waze's own estimate of the time this jam adds, in seconds. */
  delaySeconds: number | null;
  /** Waze's length for the longest report behind this queue; the centreline span if it gave none. */
  lengthMetres: number;
}

/** One exit the feed said something about, in one direction. */
export interface ExitStatus {
  exit: string;
  direction: 'NB' | 'SB';
  status: SegmentStatus;
  level: number | null;
  speedKmh: number | null;
  jamCount: number;
  observedAt: string | null;
  /**
   * The longest single queue at this exit, in metres. The longest and not the
   * total, as on the dashboard: Waze's reports overlap, so adding them up would
   * invent road that is not queued.
   */
  longestQueueMetres: number | null;
  /** The worst single queue's delay, in seconds. Not a sum, for the same reason. */
  delaySeconds: number | null;
  /** Every jam behind this reading, so the map can colour only the queue. */
  jams: JamOnCorridor[];
}

/** The exit rows the dashboard serves from nlex_exits. */
export interface NlexExit {
  exit_id: number;
  exit_name: string;
  latitude: number;
  longitude: number;
  km: number;
  nb_entry?: boolean;
  nb_exit?: boolean;
  sb_entry?: boolean;
  sb_exit?: boolean;
  node_type?: string;
}

interface GeoFeature {
  properties?: Record<string, unknown> | null;
  geometry?: { type?: string; coordinates?: unknown } | null;
}

export interface FeatureCollection {
  features?: GeoFeature[];
}

/**
 * Waze's own bands. Unchanged from both the SQL version and the dashboard's,
 * so the words on screen do not shift with the source.
 */
function classify(level: number | null, speedKmh: number | null): SegmentStatus {
  if (level === null && speedKmh === null) {
    return 'clear';
  }
  if (level === 0) {
    return 'clear';
  }
  if ((level !== null && level >= 3) || (speedKmh !== null && speedKmh < 10)) {
    return 'congested';
  }
  return 'slow';
}

const M_PER_DEG_LAT = 110574;
const M_PER_DEG_LON = 111320 * Math.cos((15 * Math.PI) / 180);

const orderedExits = (exits: NlexExit[]): NlexExit[] =>
  [...exits].sort((a, b) => a.km - b.km);

/**
 * Building the centreline resamples 2,559 OSM points over four passes, which is
 * far too slow to repeat per request. The geometry never changes, so it is
 * built once per process - but keyed on the exit list, since a changed exit set
 * would invalidate it.
 */
let cached: { key: string; guard: CorridorGuard } | null = null;

function guardFor(exits: NlexExit[]): CorridorGuard {
  const ordered = orderedExits(exits);
  const key = ordered.map((e) => `${e.exit_id}:${e.km}`).join(',');
  if (cached !== null && cached.key === key) {
    return cached.guard;
  }
  const guard = corridorGuard(
    (nlexGeometry as unknown as { coordinates: LngLat[] }).coordinates,
    ordered.map((e) => [e.longitude, e.latitude] as LngLat),
  );
  cached = { key, guard };
  return guard;
}

/**
 * Fold jams that cover the same road into one queue each.
 *
 * Waze reports a stretch as several overlapping jams - at Paso de Blas three
 * separate features snapped to the identical range of centreline. Left alone
 * the same queue would be drawn and listed three times over. Nobody sitting in
 * it is queueing three times.
 *
 * The range grows to cover them all, so the map colours the whole stretch.
 * Within a merged queue the worst level and slowest speed win, as they do
 * everywhere else here, and the length and delay are the largest of the
 * overlapping reports rather than their sum: they are describing the same
 * traffic, and this is the figure the dashboard quotes.
 */
function mergeJams(jams: JamOnCorridor[]): JamOnCorridor[] {
  if (jams.length <= 1) {
    return jams;
  }

  const sorted = [...jams].sort((a, b) => a.startIndex - b.startIndex);
  const out: JamOnCorridor[] = [];

  for (const jam of sorted) {
    const last = out[out.length - 1];
    // Touching counts as overlapping: two queues that meet end to end are one
    // queue, and drawing them separately would leave a hairline of clear road.
    if (last !== undefined && jam.startIndex <= last.endIndex) {
      last.endIndex = Math.max(last.endIndex, jam.endIndex);
      last.level =
        last.level === null ? jam.level : jam.level === null ? last.level : Math.max(last.level, jam.level);
      last.speedKmh =
        last.speedKmh === null
          ? jam.speedKmh
          : jam.speedKmh === null
            ? last.speedKmh
            : Math.min(last.speedKmh, jam.speedKmh);
      last.delaySeconds =
        last.delaySeconds === null
          ? jam.delaySeconds
          : jam.delaySeconds === null
            ? last.delaySeconds
            : Math.max(last.delaySeconds, jam.delaySeconds);
      last.lengthMetres = Math.max(last.lengthMetres, jam.lengthMetres);
    } else {
      out.push({ ...jam });
    }
  }

  return out;
}

/**
 * How many vertices the rebuilt centreline has.
 *
 * The app draws jams by slicing its own copy of this line, so it has to be
 * able to check the two are the same line before trusting an index into it.
 */
export function centrelineVertexCount(exits: NlexExit[]): number {
  return exits.length === 0 ? 0 : guardFor(exits).centreline.length;
}

/**
 * One row per exit and direction the feed says something about. Exits it is
 * silent on are absent, and the caller reads that as clear - matching how the
 * dashboard's panel treats them.
 */
export function corridorStatusFromFeed(
  fc: FeatureCollection | null | undefined,
  exits: NlexExit[],
): ExitStatus[] {
  if (fc?.features === undefined || fc.features.length === 0 || exits.length === 0) {
    return [];
  }

  const guard = guardFor(exits);
  const ordered = orderedExits(exits);
  const kept = guard.filter(fc as { features?: unknown[] }) as FeatureCollection;

  interface Acc {
    level: number | null;
    speed: number | null;
    count: number;
    observedAt: string | null;
    meters: number | null;
    delay: number | null;
    jams: JamOnCorridor[];
  }
  const byKey = new Map<string, Acc>();

  /** Length of a stretch of the centreline, in metres. */
  const spanMetres = (from: number, to: number): number => {
    let total = 0;
    for (let i = from + 1; i <= to && i < guard.centreline.length; i += 1) {
      const a = guard.centreline[i - 1];
      const b = guard.centreline[i];
      total += Math.hypot((a[0] - b[0]) * M_PER_DEG_LON, (a[1] - b[1]) * M_PER_DEG_LAT);
    }
    return total;
  };

  for (const feature of kept.features ?? []) {
    const props = feature.properties;
    if (props?.feature_type !== 'jam' || feature.geometry?.type !== 'LineString') {
      continue;
    }

    const coords = feature.geometry.coordinates as number[][];
    const snapped = guard.snap(
      coords,
      typeof props.street === 'string' ? props.street : undefined,
    );
    if (snapped === null) {
      continue;
    }

    /*
     * Attributed to the nearest exit, which is how the panel is keyed. A jam
     * spans a stretch, so its midpoint decides which exit owns it.
     */
    const mid = coords[Math.floor(coords.length / 2)];
    let nearest = ordered[0];
    let best = Infinity;
    for (const exit of ordered) {
      const distance = Math.hypot(
        (exit.longitude - mid[0]) * M_PER_DEG_LON,
        (exit.latitude - mid[1]) * M_PER_DEG_LAT,
      );
      if (distance < best) {
        best = distance;
        nearest = exit;
      }
    }

    const key = `${nearest.exit_name}|${snapped.direction}`;
    const level = Number.isFinite(Number(props.level)) ? Number(props.level) : null;
    const speed = Number.isFinite(Number(props.speed)) ? Number(props.speed) : null;
    const at = typeof props.observed_at === 'string' ? props.observed_at : null;
    const meters = Number.isFinite(Number(props.length_m)) ? Number(props.length_m) : null;
    const delay = Number.isFinite(Number(props.delay_seconds))
      ? Number(props.delay_seconds)
      : null;

    const jam: JamOnCorridor = {
      startIndex: snapped.startIndex,
      endIndex: snapped.endIndex,
      level,
      speedKmh: speed,
      delaySeconds: delay,
      lengthMetres:
        meters !== null && meters > 0
          ? meters
          : Math.round(spanMetres(snapped.startIndex, snapped.endIndex)),
    };

    const acc = byKey.get(key);
    if (acc === undefined) {
      byKey.set(key, { level, speed, count: 1, observedAt: at, meters, delay, jams: [jam] });
    } else {
      acc.jams.push(jam);
      // Worst level and slowest speed seen, matching the SQL this replaces.
      acc.level =
        acc.level === null ? level : level === null ? acc.level : Math.max(acc.level, level);
      acc.speed =
        acc.speed === null ? speed : speed === null ? acc.speed : Math.min(acc.speed, speed);
      acc.count += 1;
      // Worst of each, never a total - see the field comments on ExitStatus.
      acc.meters =
        acc.meters === null ? meters : meters === null ? acc.meters : Math.max(acc.meters, meters);
      acc.delay =
        acc.delay === null ? delay : delay === null ? acc.delay : Math.max(acc.delay, delay);
      if (at !== null && (acc.observedAt === null || at > acc.observedAt)) {
        acc.observedAt = at;
      }
    }
  }

  return [...byKey.entries()].map(([key, acc]) => {
    const [exit, direction] = key.split('|');
    return {
      exit,
      direction: direction as 'NB' | 'SB',
      status: classify(acc.level, acc.speed),
      level: acc.level,
      speedKmh: acc.speed,
      jamCount: acc.count,
      observedAt: acc.observedAt,
      longestQueueMetres: acc.meters,
      delaySeconds: acc.delay,
      jams: mergeJams(acc.jams),
    };
  });
}
