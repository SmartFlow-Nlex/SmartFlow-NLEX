import { NlexDirectionId, distanceKm, exitsInTravelOrder } from '../constants/nlexSegments';
import type { ForecastState, StretchForecast } from './forecastApi';

/**
 * The SmartFlow model's forecast, summed along one trip.
 *
 * The model answers per stretch; a driver asks about a route. This reads off
 * the stretches the route crosses, on the carriageway it uses, and nothing
 * else - every figure here is the model's own or simple arithmetic on it.
 */

/** Free-flow speed the travel time is measured against (km/h), as in lib/trafficModel. */
const FREE_FLOW_KPH = 90;

/** A carriageway is counted when it carries at least this share of an exit's queue-hours. */
const SIDE_CUT = 0.4;

export interface RouteForecast {
  /** The worst queue predicted on this carriageway along the route. */
  state: ForecastState;
  /**
   * 0-100: the chance of the likeliest queue on the route. At 50 or more a
   * queue is predicted, so this and `state` cannot disagree. Null when the
   * dashboard sent no chances.
   */
  probability: number | null;
  /** "Marilao to CDV / Ph. Arena", in travel order - where that likeliest queue is. */
  likeliest: string | null;
  /** Stretches with a queue predicted on this carriageway, of those with a forecast. */
  queued: number;
  stretches: number;
  /** What the predicted queues usually cost. Null when a queue came without a delay. */
  delayMinutes: number | null;
  travelMinutes: number | null;
  distanceKm: number;
}

/**
 * Whether a queue predicted at this exit is expected on the given carriageway.
 *
 * The dashboard's own rule for which side of its forecast map to draw: the
 * likelier side always, the other only when it carries 40% or more. Scored on
 * live queues that was right far more often than counting both sides. With no
 * shares - an exit with no history yet - both sides count.
 */
export function queuesOnSide(stretch: StretchForecast, direction: NlexDirectionId): boolean {
  const { nbShare, sbShare } = stretch;
  if (nbShare === null || sbShare === null) {
    return true;
  }
  return direction === 'northbound'
    ? nbShare >= SIDE_CUT || nbShare >= sbShare
    : sbShare >= SIDE_CUT || sbShare > nbShare;
}

/** South to north, the order the dashboard's stretches run in. */
const northward = exitsInTravelOrder('northbound');

const severity: Record<ForecastState, number> = { clear: 0, slow: 1, congested: 2 };

/**
 * The forecast for a trip between two exits, or null when the model has
 * nothing for any stretch of it at this hour.
 */
export function forecastRoute(
  stretches: StretchForecast[],
  direction: NlexDirectionId,
  fromId: string,
  toId: string,
): RouteForecast | null {
  const fromIndex = northward.findIndex((exit) => exit.id === fromId);
  const toIndex = northward.findIndex((exit) => exit.id === toId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
    return null;
  }

  const byExit = new Map(stretches.map((stretch) => [stretch.exitId, stretch]));

  let state: ForecastState = 'clear';
  let covered = 0;
  let queued = 0;
  let delaySeconds: number | null = 0;
  let likeliest: { chance: number; name: string } | null = null;

  // A stretch is filed under the exit at its southern end, whichever way the
  // trip runs, so the route is the stretches between its two exits.
  for (let index = Math.min(fromIndex, toIndex); index < Math.max(fromIndex, toIndex); index += 1) {
    const south = northward[index];
    const north = northward[index + 1];
    const stretch = south === undefined ? undefined : byExit.get(south.id);
    if (south === undefined || north === undefined || stretch === undefined) {
      continue;
    }
    covered += 1;

    const onThisSide = queuesOnSide(stretch, direction);
    if (onThisSide && stretch.state !== 'clear') {
      queued += 1;
      if (severity[stretch.state] > severity[state]) {
        state = stretch.state;
      }
      delaySeconds =
        delaySeconds === null || stretch.delaySeconds === null
          ? null
          : delaySeconds + stretch.delaySeconds;
    }

    if (stretch.chance !== null) {
      // A queue here that is expected on the other carriageway still leaves a
      // small chance on this one: the model's chance, by how often this side
      // is the one that queues. That is always under 50%, so it never reads
      // as a prediction.
      const share = direction === 'northbound' ? stretch.nbShare : stretch.sbShare;
      const chance = onThisSide ? stretch.chance : stretch.chance * (share ?? 0);
      if (likeliest === null || chance > likeliest.chance) {
        likeliest = {
          chance,
          name:
            direction === 'northbound'
              ? `${south.name} to ${north.name}`
              : `${north.name} to ${south.name}`,
        };
      }
    }
  }

  if (covered === 0) {
    return null;
  }

  const distance = distanceKm(fromId, toId);
  const freeFlowMinutes = (distance / FREE_FLOW_KPH) * 60;

  return {
    state,
    probability: likeliest === null ? null : Math.round(likeliest.chance * 100),
    likeliest: likeliest?.name ?? null,
    queued,
    stretches: covered,
    delayMinutes: delaySeconds === null ? null : Math.round(delaySeconds / 60),
    travelMinutes:
      delaySeconds === null ? null : Math.max(1, Math.round(freeFlowMinutes + delaySeconds / 60)),
    distanceKm: distance,
  };
}
