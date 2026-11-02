import { createRng } from './rng';

/**
 * Optional traffic-snapshot adapter for the Snapshot Challenge.
 *
 * The campaign never needs it: missions run entirely on their own patterns.
 * The challenge asks the React Native host for one forecast reading (an exit,
 * a direction, an hour), freezes it for the whole run, and turns it into game
 * settings through the documented rules below. When the forecast cannot be
 * read, a synthetic snapshot is used and labelled as such everywhere.
 *
 * What this is NOT: the queue chance is a model's probability that a queue
 * forms at that exit in that hour. It is not a vehicle count, it does not set
 * how many cars are on screen, and nothing here is a traffic simulation. The
 * game's score is never sent anywhere and plays no part in SmartFlow's
 * analytics or decisions.
 */

export const SNAPSHOT_VERSION = 1;

export type SnapshotKind = 'forecast' | 'synthetic';

export interface TrafficSnapshot {
  version: number;
  kind: SnapshotKind;
  /** Where the numbers came from, in words. */
  source: string;
  /** When the reading was taken (ISO). */
  fetchedAt: string;
  /** The hour the forecast is for (ISO), or null for synthetic data. */
  forecastFor: string | null;
  exitId: string;
  exitName: string;
  direction: 'northbound' | 'southbound';
  /** 0-1 chance of a queue in that hour, or null when the forecast has no figure. */
  queueChance: number | null;
  /** Typical delay of such a queue, seconds, or null. */
  typicalDelaySeconds: number | null;
  /** Share of this exit's queues on the chosen side, 0-1, or null. */
  directionShare: number | null;
  units: { queueChance: string; typicalDelay: string; directionShare: string };
  modelName: string | null;
}

export type TrafficTier = 'light' | 'moderate' | 'heavy';

export interface ScenarioConfig {
  tier: TrafficTier;
  /** Multiplies pattern frequency. */
  densityScale: number;
  /** Multiplies the weight of traffic patterns in the mix. */
  trafficWeight: number;
  /** Multiplies cruising speed. */
  speedScale: number;
  /** What the run uses, in words, for the briefing. */
  summary: string;
  /** Every rule applied, in words. */
  rules: string[];
  /** Plain statement of what kind of data this is. */
  provenance: string;
}

const UNITS = {
  queueChance: 'probability 0-1 that a queue forms in that hour',
  typicalDelay: 'seconds',
  directionShare: 'share 0-1 of the exit\'s queue-hours on this side',
};

/**
 * The game rule: a direction-weighted queue chance, in three tiers.
 *
 *   weighted = queueChance x (directionShare when known, else 1, with a floor of 0.5)
 *   below 0.35        light     - fewer patterns (x0.8), few traffic patterns (x0.6), full speed
 *   0.35 to 0.65      moderate  - standard patterns, standard traffic share
 *   above 0.65        heavy     - more patterns (x1.2), many traffic patterns (x1.8), 92% speed
 *   no figure         moderate, and the briefing says the figure was missing
 *
 * The thresholds are arcade tuning chosen for play, not calibrated against
 * real traffic.
 */
export function mapSnapshot(snapshot: TrafficSnapshot): ScenarioConfig {
  const rules = [
    'Queue chance (weighted by how much of this exit\'s queueing is on your side) picks a tier.',
    'Light: fewer obstacles and fewer slow vehicles. Moderate: standard. Heavy: more obstacles, many slow vehicles, slightly lower cruising speed.',
    'Tier thresholds are game tuning, not calibrated traffic science.',
  ];
  const provenance =
    snapshot.kind === 'forecast'
      ? `SmartFlow forecast reading for ${snapshot.exitName} ${snapshot.direction}, frozen for this run. A model prediction, not a recorded count.`
      : 'Synthetic practice data - not a SmartFlow forecast and not real traffic.';
  if (snapshot.queueChance === null) {
    return {
      tier: 'moderate',
      densityScale: 1,
      trafficWeight: 1,
      speedScale: 1,
      summary: 'No queue figure in this snapshot - using moderate traffic.',
      rules,
      provenance,
    };
  }
  const share = snapshot.directionShare === null ? 1 : Math.max(0.5, snapshot.directionShare);
  const weighted = Math.max(0, Math.min(1, snapshot.queueChance * share));
  const pct = Math.round(weighted * 100);
  if (weighted < 0.35) {
    return { tier: 'light', densityScale: 0.8, trafficWeight: 0.6, speedScale: 1, summary: `Weighted queue chance ${pct}% - light traffic.`, rules, provenance };
  }
  if (weighted <= 0.65) {
    return { tier: 'moderate', densityScale: 1, trafficWeight: 1, speedScale: 1, summary: `Weighted queue chance ${pct}% - moderate traffic.`, rules, provenance };
  }
  return { tier: 'heavy', densityScale: 1.2, trafficWeight: 1.8, speedScale: 0.92, summary: `Weighted queue chance ${pct}% - heavy traffic.`, rules, provenance };
}

/** A labelled stand-in when the forecast is unavailable: the same shape, marked synthetic. */
export function syntheticSnapshot(seed: number, now: Date = new Date()): TrafficSnapshot {
  const rng = createRng(seed);
  return {
    version: SNAPSHOT_VERSION,
    kind: 'synthetic',
    source: 'Synthetic practice data generated in the game (forecast unavailable)',
    fetchedAt: now.toISOString(),
    forecastFor: null,
    exitId: 'bocaue-barrier',
    exitName: 'Bocaue Barrier',
    direction: 'northbound',
    queueChance: Math.round(rng.range(0.2, 0.85) * 100) / 100,
    typicalDelaySeconds: null,
    directionShare: null,
    units: UNITS,
    modelName: null,
  };
}

const isNumberOrNull = (value: unknown): value is number | null =>
  value === null || (typeof value === 'number' && Number.isFinite(value));

/** Validates a snapshot from the host; null when it cannot be trusted. */
export function validateSnapshot(raw: unknown): TrafficSnapshot | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const s = raw as Record<string, unknown>;
  if (s.version !== SNAPSHOT_VERSION || (s.kind !== 'forecast' && s.kind !== 'synthetic')) {
    return null;
  }
  if (typeof s.source !== 'string' || typeof s.fetchedAt !== 'string' || typeof s.exitId !== 'string' || typeof s.exitName !== 'string') {
    return null;
  }
  if (s.direction !== 'northbound' && s.direction !== 'southbound') {
    return null;
  }
  if (!isNumberOrNull(s.queueChance) || !isNumberOrNull(s.typicalDelaySeconds) || !isNumberOrNull(s.directionShare)) {
    return null;
  }
  if (typeof s.queueChance === 'number' && (s.queueChance < 0 || s.queueChance > 1)) {
    return null;
  }
  return {
    version: SNAPSHOT_VERSION,
    kind: s.kind,
    source: s.source,
    fetchedAt: s.fetchedAt,
    forecastFor: typeof s.forecastFor === 'string' ? s.forecastFor : null,
    exitId: s.exitId,
    exitName: s.exitName,
    direction: s.direction,
    queueChance: s.queueChance,
    typicalDelaySeconds: s.typicalDelaySeconds,
    directionShare: s.directionShare,
    units: UNITS,
    modelName: typeof s.modelName === 'string' ? s.modelName : null,
  };
}

/** Builds a forecast snapshot from the app's forecast reading (used by the host). */
export function forecastSnapshot(input: {
  exitId: string;
  exitName: string;
  direction: 'northbound' | 'southbound';
  forecastFor: Date;
  queueChance: number | null;
  typicalDelaySeconds: number | null;
  nbShare: number | null;
  sbShare: number | null;
  modelName: string | null;
  fetchedAt?: Date;
}): TrafficSnapshot {
  return {
    version: SNAPSHOT_VERSION,
    kind: 'forecast',
    source: 'SmartFlow congestion forecast (team dashboard API, as shown on the Corridor tab)',
    fetchedAt: (input.fetchedAt ?? new Date()).toISOString(),
    forecastFor: input.forecastFor.toISOString(),
    exitId: input.exitId,
    exitName: input.exitName,
    direction: input.direction,
    queueChance: input.queueChance,
    typicalDelaySeconds: input.typicalDelaySeconds,
    directionShare: input.direction === 'northbound' ? input.nbShare : input.sbShare,
    units: UNITS,
    modelName: input.modelName,
  };
}
