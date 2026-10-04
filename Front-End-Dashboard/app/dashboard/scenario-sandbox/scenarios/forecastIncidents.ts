import calibrationJson from "./calibration.json";
import type { Direction, NewEventSpec } from "./adapter";
import type { BreakdownCause, CollisionLabel, ScenarioVariant, VehicleKind } from "./catalogue";

/**
 * The incident forecast, put on the stretch being simulated.
 *
 * The forecast (the Incident tab's model) gives whole incidents per hour for the WHOLE corridor, both
 * directions, every kind NLEX logs: about 134 a day. Until 2026-10-03 the sandbox placed that hour's count
 * (capped at one per lane) on the 600 m on screen, all at minute 0, at fixed positions — so every date
 * showed the same four crashes in the same diagonal. Here the forecast decides all three things, from
 * NLEX's own records (calibration.json, 2022-2026):
 *
 *   how many   the hour's count x the share of logged incidents that happen ON the carriageway (a lane or
 *              the shoulder; the rest are at plazas, ramps and elsewhere) x this stretch's share of the
 *              corridor's incidents (the forecast's own per-exit figures, each exit owning the road nearer
 *              to it than to its neighbours) x this carriageway's share (the records' NB/SB split). That is
 *              an expectation, usually well under one for a 600 m stretch; the number drawn is Poisson.
 *   which kind breakdown on the shoulder / in a lane, minor collision, multi-vehicle, self accident, in
 *              proportion to how often each is logged; a breakdown's vehicle and cause, and a collision's
 *              type, likewise.
 *   where/when the lane from that family's recorded lane split for this direction; the km weighted by the
 *              forecast along the stretch; the start uniform within the hour. The duration is the family's
 *              own sampled NLEX duration, as for any scenario event.
 *
 * The draw is seeded by the date, hour, carriageway and stretch: a different date gives a different
 * picture, the same date the same one. Pure, so verify.ts can pin it.
 */

type Entry = { n_events?: number; reference?: { lane_distribution?: Record<string, Record<string, number>> } };
const FAMILIES = (calibrationJson as unknown as { families: Record<string, Entry> }).families;
const ROWS = (calibrationJson as unknown as {
  provenance: {
    csv_row_totals: { accident: number; breakdown: number };
    population_row_counts: { accident_mainline_lane_events: number; breakdown_mainline_lane_events: number; breakdown_soft_shoulder_events: number };
  };
}).provenance;

/** Logged incidents that happen on the carriageway itself (a mainline lane or the shoulder), of all logged. */
export const ON_CARRIAGEWAY_SHARE = (() => {
  const p = ROWS.population_row_counts;
  const all = ROWS.csv_row_totals.accident + ROWS.csv_row_totals.breakdown;
  return (p.accident_mainline_lane_events + p.breakdown_mainline_lane_events + p.breakdown_soft_shoulder_events) / all;
})();

type LaneFamily = "breakdown_in_lane" | "minor_collision" | "multi_vehicle_collision" | "self_accident";
const LANE_FAMILIES: readonly LaneFamily[] = ["breakdown_in_lane", "minor_collision", "multi_vehicle_collision", "self_accident"];

/** Each carriageway's share of on-carriageway incidents, from the lane-logged families' NB/SB counts. */
export const DIRECTION_SHARE: Readonly<Record<Direction, number>> = (() => {
  let nb = 0;
  let sb = 0;
  for (const f of LANE_FAMILIES) {
    const d = FAMILIES[f]?.reference?.lane_distribution;
    nb += Object.values(d?.NB ?? {}).reduce((a, b) => a + b, 0);
    sb += Object.values(d?.SB ?? {}).reduce((a, b) => a + b, 0);
  }
  return nb + sb > 0 ? { NB: nb / (nb + sb), SB: sb / (nb + sb) } : { NB: 0.5, SB: 0.5 };
})();

export type ExitIncidents = { readonly km: number; readonly perDay: number };

/** Each exit's stretch of corridor (the road nearer to it than to its neighbours) and its incidents per km. */
function zones(byExit: readonly ExitIncidents[]): { from: number; to: number; perKm: number; perDay: number }[] {
  const xs = [...byExit].filter((e) => Number.isFinite(e.km) && e.perDay > 0).sort((a, b) => a.km - b.km);
  return xs.map((e, i) => {
    const from = i === 0 ? e.km : (xs[i - 1].km + e.km) / 2;
    const to = i === xs.length - 1 ? e.km : (e.km + xs[i + 1].km) / 2;
    const len = Math.max(0.05, to - from);
    return { from, to: from + len, perKm: e.perDay / len, perDay: e.perDay };
  });
}

/** Incidents expected on one carriageway of [fromKm, toKm] during an hour whose corridor-wide forecast is `hourly`. */
export function expectedOnStretch(o: { hourly: number; byExit: readonly ExitIncidents[]; fromKm: number; toKm: number; direction: Direction }): number {
  const zs = zones(o.byExit);
  const total = zs.reduce((a, z) => a + z.perDay, 0);
  if (!(o.hourly > 0) || total <= 0) return 0;
  const lo = Math.min(o.fromKm, o.toKm);
  const hi = Math.max(o.fromKm, o.toKm);
  const onStretch = zs.reduce((a, z) => a + z.perKm * Math.max(0, Math.min(hi, z.to) - Math.max(lo, z.from)), 0);
  return o.hourly * ON_CARRIAGEWAY_SHARE * (onStretch / total) * DIRECTION_SHARE[o.direction];
}

/** mulberry32 on a string hash: the same seed gives the same draw. */
function rngFor(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function poisson(mean: number, rng: () => number): number {
  if (!(mean > 0)) return 0;
  const limit = Math.exp(-mean);
  let k = 0;
  let p = rng();
  while (p > limit && k < 50) {
    k++;
    p *= rng();
  }
  return k;
}

function pick<T>(items: readonly (readonly [T, number])[], rng: () => number): T {
  const total = items.reduce((a, [, w]) => a + w, 0);
  let u = rng() * total;
  for (const [x, w] of items) {
    u -= w;
    if (u <= 0) return x;
  }
  return items[items.length - 1][0];
}

const n = (key: string): number => FAMILIES[key]?.n_events ?? 0;

/** A breakdown family's (vehicle, cause) pairs, weighted by how often each is logged. */
function breakdownPairs(family: "breakdown_in_lane" | "breakdown_shoulder"): [{ vehicle: VehicleKind; cause: BreakdownCause }, number][] {
  const out: [{ vehicle: VehicleKind; cause: BreakdownCause }, number][] = [];
  for (const key of Object.keys(FAMILIES)) {
    const m = new RegExp(`^${family}__cause_([a-z]+)__vehicle_([a-z]+)$`).exec(key);
    if (m && n(key) > 0) out.push([{ cause: m[1] as BreakdownCause, vehicle: m[2] as VehicleKind }, n(key)]);
  }
  return out;
}

/** One forecast incident's kind: its family in proportion to how often NLEX logs each on the carriageway,
 *  then a breakdown's vehicle and cause, or a collision's type, the same way. */
function variantOf(rng: () => number): ScenarioVariant {
  const family = pick(
    ([
      ["breakdown_shoulder", n("breakdown_shoulder")],
      ["breakdown_in_lane", n("breakdown_in_lane")],
      ["minor_collision", n("minor_collision")],
      ["multi_vehicle_collision", n("multi_vehicle_collision")],
      ["self_accident", n("self_accident")],
    ] as const).filter(([, w]) => w > 0),
    rng,
  );
  switch (family) {
    case "breakdown_shoulder":
    case "breakdown_in_lane": {
      const pairs = breakdownPairs(family);
      const vc = pairs.length ? pick(pairs, rng) : { vehicle: "car" as VehicleKind, cause: "engine" as BreakdownCause };
      return { family, vehicle: vc.vehicle, cause: vc.cause };
    }
    case "minor_collision":
      return { family, label: pick((["rear_end", "sideswipe", "hit_and_run"] as const).map((l) => [l, n(`minor_collision_${l}`)] as const), rng) as CollisionLabel };
    default:
      return { family };
  }
}

/** Operator lane (1 = against the median) for a family on this carriageway, from its recorded lane split. */
function laneFor(family: ScenarioVariant["family"], direction: Direction, laneCount: number, rng: () => number): number | null {
  if (family === "breakdown_shoulder") return null;
  const d = FAMILIES[family]?.reference?.lane_distribution?.[direction];
  const lanes: [number, number][] = [];
  for (const [k, v] of Object.entries(d ?? {})) {
    const m = /^Lane(\d)$/.exec(k);
    if (m && v > 0) lanes.push([Math.min(laneCount, Number(m[1])), v]);
  }
  return lanes.length ? pick(lanes, rng) : laneCount;
}

/**
 * The forecast incidents for one carriageway of a stretch, for one hour: `expected` (expectedOnStretch) drawn
 * as a Poisson count, each a scenario event placed and timed as described above. `startFromMin` is where the
 * hour begins on the scenario clock (minutes after warm-up).
 */
export function drawForecastEvents(o: {
  expected: number;
  seed: string;
  direction: Direction;
  fromKm: number;
  toKm: number;
  laneCount: number;
  startFromMin: number;
  byExit: readonly ExitIncidents[];
}): NewEventSpec[] {
  const rng = rngFor(o.seed);
  const count = poisson(o.expected, rng);
  const lo = Math.min(o.fromKm, o.toKm);
  const hi = Math.max(o.fromKm, o.toKm);
  // Along the stretch, weighted by the forecast: each exit's piece of it, by its incidents per km.
  const pieces = zones(o.byExit)
    .map((z) => ({ a: Math.max(lo, z.from), b: Math.min(hi, z.to), w: z.perKm }))
    .filter((p) => p.b > p.a)
    .map((p) => [p, p.w * (p.b - p.a)] as const);
  const margin = (hi - lo) * 0.05;
  const out: NewEventSpec[] = [];
  for (let i = 0; i < count; i++) {
    const variant = variantOf(rng);
    const piece = pieces.length ? pick(pieces, rng) : { a: lo, b: hi };
    const km = Math.min(hi - margin, Math.max(lo + margin, piece.a + rng() * (piece.b - piece.a)));
    out.push({
      variant,
      direction: o.direction,
      lane: laneFor(variant.family, o.direction, o.laneCount, rng),
      positionKm: Number(km.toFixed(3)),
      startMinutes: Number((o.startFromMin + rng() * 60).toFixed(2)),
      duration: { kind: "sampled", seed: 1 + Math.floor(rng() * 1_000_000) },
    });
  }
  return out;
}
