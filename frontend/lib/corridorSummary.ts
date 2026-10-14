import type { CorridorExit, CorridorStatusData, CorridorStatusValue } from './corridorApi';

/**
 * The live corridor feed, boiled down to the Dashboard's headline card.
 *
 * Every figure is read off the feed the Corridor tab shows - the same shared
 * snapshot, after the same per-stretch reading - so the headline here and the
 * detail there cannot disagree. Nothing is estimated.
 */

export type CarriagewayKey = 'NB' | 'SB';

export interface HeaviestSpot {
  /** The feed's exit id - what the interchange screen is opened with. */
  exitId: number;
  name: string;
  direction: CarriagewayKey;
  status: CorridorStatusValue;
  speedKmh: number | null;
  delaySeconds: number;
  queueMetres: number;
}

export interface CorridorSummary {
  /** The worst reading anywhere on the corridor right now. */
  state: CorridorStatusValue;
  /**
   * How many readings are in that state, one per exit and direction - the
   * count the Corridor tab's headline gives.
   */
  count: number;
  /**
   * Minutes of queueing on a run of the whole corridor, averaged over the two
   * directions. Null when the feed carries no queue detail to add up.
   */
  averageDelayMinutes: number | null;
  /** Where the most time is being lost; null when nothing is slow. */
  heaviest: HeaviestSpot | null;
  /** When Waze last reported, and whether that is too long ago to trust. */
  newestAt: Date | null;
  stale: boolean;
}

const KEYS: CarriagewayKey[] = ['NB', 'SB'];
const SEVERITY: Record<CorridorStatusValue, number> = { clear: 0, slow: 1, congested: 2 };

/**
 * Seconds of delay on one carriageway of one stretch, or null if not told.
 *
 * Added up queue by queue rather than read from the stretch's own total: Waze
 * marks a delay it could not measure as -1, and one of those in a total takes
 * a second off instead of adding nothing.
 */
function delayOn(exit: CorridorExit, key: CarriagewayKey): number | null {
  const side = exit.directions[key];
  if (side.jams !== undefined) {
    return side.jams.reduce(
      (total, jam) => total + (jam.delaySeconds !== null && jam.delaySeconds > 0 ? jam.delaySeconds : 0),
      0,
    );
  }
  if (side.delaySeconds === undefined || side.delaySeconds === null) {
    return null;
  }
  return Math.max(0, side.delaySeconds);
}

/**
 * Positive when `a` is the heavier of two spots: the worse state first, then
 * wherever costs the most time, then the longer queue, then the slower traffic.
 */
function heavierBy(a: HeaviestSpot, b: HeaviestSpot): number {
  return (
    SEVERITY[a.status] - SEVERITY[b.status] ||
    a.delaySeconds - b.delaySeconds ||
    a.queueMetres - b.queueMetres ||
    (b.speedKmh ?? Infinity) - (a.speedKmh ?? Infinity)
  );
}

export function summariseCorridor(data: CorridorStatusData): CorridorSummary {
  const { counts } = data;
  const state: CorridorStatusValue =
    counts.congested > 0 ? 'congested' : counts.slow > 0 ? 'slow' : 'clear';

  const totals: Record<CarriagewayKey, number> = { NB: 0, SB: 0 };
  let delayKnown = false;
  let heaviest: HeaviestSpot | null = null;

  for (const exit of data.exits) {
    for (const key of KEYS) {
      const side = exit.directions[key];
      if (!side.hasRamp) {
        continue;
      }
      const delay = delayOn(exit, key);
      if (delay !== null) {
        delayKnown = true;
        totals[key] += delay;
      }
      if (side.status === 'clear') {
        continue;
      }
      const spot: HeaviestSpot = {
        exitId: exit.exit_id,
        name: exit.display_name,
        direction: key,
        status: side.status,
        speedKmh: side.speedKmh,
        delaySeconds: delay ?? 0,
        queueMetres: side.queueMetres ?? 0,
      };
      if (heaviest === null || heavierBy(spot, heaviest) > 0) {
        heaviest = spot;
      }
    }
  }

  const newestAt = data.feed.newestAt === null ? null : new Date(data.feed.newestAt);

  return {
    state,
    count: counts[state],
    averageDelayMinutes: delayKnown ? Math.round((totals.NB + totals.SB) / 2 / 60) : null,
    heaviest,
    newestAt: newestAt !== null && !Number.isNaN(newestAt.getTime()) ? newestAt : null,
    stale: data.feed.stale,
  };
}
