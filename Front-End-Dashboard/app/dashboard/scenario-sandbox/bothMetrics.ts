import type { Metrics } from "./simulation";

/**
 * Corridor totals for Both mode, from the two directions' own readouts.
 *
 * Which metrics get a total, and how (agreed in the Phase D1 design):
 *
 *   sum        activeAgents, throughputPerMin, co2RatePerMin, stoppedCount, unmetVehPerHour, and their
 *              parts (throughPerMin / exitedPerMin, co2OnRoadPerMin / co2UpstreamPerMin,
 *              unmetMainlineVehPerHour / unmetFromRampsVehPerHour) — counts and rates of
 *              physically separate traffic add up.
 *   max        longestQueueM — a corridor is only as good as its worst queue; two 80 m queues
 *              are not one 160 m queue.
 *   weighted   avgSpeedKmh — TRAFFIC-weighted, Σq / Σk: the space-mean speed of every vehicle on
 *              both carriageways, so each direction counts by the vehicles on it (trafficCount),
 *              never a plain mean — (a + b) / 2 would let a near-empty carriageway pull the
 *              headline. Until 19 Nov 2026 it was weighted by throughput, which favoured the
 *              free-flowing side: 100 vehicles at 10 km/h (10 a minute out) and 50 at 100 km/h
 *              (50 a minute) read 85 km/h, where the mean over the 150 vehicles is 40 — and a
 *              carriageway jammed solid, with nothing coming out, had no weight at all (audit S11).
 *   none       densityPerKmLane — vehicles per km per lane on two separate carriageways has no
 *              meaningful sum or mean. Shown per direction only, and the UI says so.
 *
 * Pure, so verify.ts can pin every rule (including the zero-flow case) without a browser.
 */

export type CorridorMetrics = {
  activeAgents: number;
  throughputPerMin: number;
  co2RatePerMin: number;
  longestQueueM: number;
  stoppedCount: number;
  unmetVehPerHour: number;
  /** The parts of the sums above (see Metrics): through / exited trips, CO2 on the road / of the demand held
   *  upstream, unmet demand at the entrance / on the ramps and entry plazas. */
  throughPerMin: number;
  exitedPerMin: number;
  co2OnRoadPerMin: number;
  co2UpstreamPerMin: number;
  unmetMainlineVehPerHour: number;
  unmetFromRampsVehPerHour: number;
  /**
   * The corridor's average speed: traffic-weighted, Σq / Σk (see trafficWeightedSpeed). The name is kept
   * from when it was weighted by throughput, so the page reading it needs no change; the rule is not.
   * Null when there is no traffic on either carriageway: with nothing to weight there is no mean, and
   * falling back to a plain mean would be exactly the number this field exists to avoid.
   */
  flowWeightedAvgSpeedKmh: number | null;
};

/**
 * What a traffic-weighted mean needs from one direction: its speed and the vehicles it is the mean over
 * (Metrics.trafficCount). A reading without the count (a baseline captured before 19 Nov 2026) has its density
 * estimated from flow and speed, k = q / u, so Σq / Σk still holds — but a direction with nothing coming out then
 * has no weight, which is why the count is the one to pass.
 */
export type SpeedAndFlow = { readonly avgSpeedKmh: number; readonly throughputPerMin: number; readonly trafficCount?: number };

/** Σq / Σk over the two directions: Σ(speed × vehicles) / Σ(vehicles). Null when there is nothing to weight. */
export function trafficWeightedSpeed(a: SpeedAndFlow, b: SpeedAndFlow): number | null {
  const counted = typeof a.trafficCount === "number" && typeof b.trafficCount === "number";
  const weight = (d: SpeedAndFlow): number => {
    if (counted) return Math.max(0, d.trafficCount ?? 0);
    // k = q / u, in consistent units; a direction standing still with flow still out of it is all density.
    const q = Math.max(0, d.throughputPerMin);
    return q > 0 ? q / Math.max(0.1, d.avgSpeedKmh) : 0;
  };
  const wa = weight(a);
  const wb = weight(b);
  const total = wa + wb;
  if (!(total > 0)) return null;
  return (a.avgSpeedKmh * wa + b.avgSpeedKmh * wb) / total;
}

/** Kept for the name other modules import: it is now the traffic-weighted mean (trafficWeightedSpeed). */
export const flowWeightedSpeed = trafficWeightedSpeed;

export function combineMetrics(nb: Metrics, sb: Metrics): CorridorMetrics {
  return {
    activeAgents: nb.activeAgents + sb.activeAgents,
    throughputPerMin: nb.throughputPerMin + sb.throughputPerMin,
    co2RatePerMin: nb.co2RatePerMin + sb.co2RatePerMin,
    longestQueueM: Math.max(nb.longestQueueM, sb.longestQueueM),
    stoppedCount: nb.stoppedCount + sb.stoppedCount,
    unmetVehPerHour: nb.unmetVehPerHour + sb.unmetVehPerHour,
    throughPerMin: nb.throughPerMin + sb.throughPerMin,
    exitedPerMin: nb.exitedPerMin + sb.exitedPerMin,
    co2OnRoadPerMin: nb.co2OnRoadPerMin + sb.co2OnRoadPerMin,
    co2UpstreamPerMin: nb.co2UpstreamPerMin + sb.co2UpstreamPerMin,
    unmetMainlineVehPerHour: nb.unmetMainlineVehPerHour + sb.unmetMainlineVehPerHour,
    unmetFromRampsVehPerHour: nb.unmetFromRampsVehPerHour + sb.unmetFromRampsVehPerHour,
    flowWeightedAvgSpeedKmh: trafficWeightedSpeed(nb, sb),
  };
}

/** The four figures a baseline snapshot keeps (see Baseline in useDirectionSim), and the traffic count its speed
 *  is the mean over, which the corridor speed weights by (optional: see SpeedAndFlow). */
export type BaselineFigures = {
  readonly avgSpeedKmh: number;
  readonly throughputPerMin: number;
  readonly longestQueueM: number;
  readonly co2RatePerMin: number;
  readonly trafficCount?: number;
};

export type CorridorBaseline = {
  throughputPerMin: number;
  co2RatePerMin: number;
  longestQueueM: number;
  flowWeightedAvgSpeedKmh: number | null;
};

/** The corridor "before", built by the same rules as the corridor "now" so the two are comparable. */
export function combineBaselines(nb: BaselineFigures, sb: BaselineFigures): CorridorBaseline {
  return {
    throughputPerMin: nb.throughputPerMin + sb.throughputPerMin,
    co2RatePerMin: nb.co2RatePerMin + sb.co2RatePerMin,
    longestQueueM: Math.max(nb.longestQueueM, sb.longestQueueM),
    flowWeightedAvgSpeedKmh: trafficWeightedSpeed(nb, sb),
  };
}
