import type { FoeKind } from './types';
import type { HazardKind } from './config';

/**
 * How sidekicks get past what is on the road. Sidekicks never collide: this is only how they
 * move, so the ability and the hit logic are untouched. It reads the road and never writes to it.
 *
 * A runner jumps what is low enough and sidesteps the rest; a flyer rises over what it can and
 * sidesteps the rest. All distances are in lanes, measured at the sidekick's own place on the road.
 */

/** How high a flyer already cruises, in lanes. */
export const FLY_HEIGHT = 0.36;

/** How tall each thing on the road is drawn, in lanes (measured from the baked sprites). */
const HEIGHTS: Record<HazardKind | FoeKind, number> = {
  cone: 0.56,
  rollingCone: 0.59,
  barrier: 0.43,
  sweepBarrier: 0.43,
  pothole: 0.08,
  car: 0.65,
  truck: 1.14,
  bus: 1.17,
  conebot: 0.78,
  drumbot: 0.96,
  signbot: 0.88,
};

/** The tallest thing a runner jumps, and a flyer rises over. Anything taller is sidestepped. */
const JUMP_LIMIT = 0.6;
const RISE_LIMIT = 1.0;
/** How far a sidekick may go to get round something: onto the shoulder, not off the road. */
const ROAD_LIMIT = 1.7;
/** How far a sidekick reaches along the road, either side of its middle. */
const DEPTH = 0.2;
/** Room left over a jumped thing, and beside a passed one. */
const OVER = 0.04;
const BESIDE = 0.03;
/** Starts to lift this far outside something's path, so that drifting toward it is a smooth rise and not a pop. */
const NEAR = 0.22;
/** Seconds in the air for a jump, and seconds of warning for a sidestep. */
const AIR = 0.46;
const WARNING = 0.42;
/** How quickly a sidestep eases toward where it is going. */
const EASE = 10;
/** The fastest it comes down, in lanes a second: a thing zapped mid-jump leaves it to fall, not to snap to the road. */
const FALL = 5.5;
/** The fastest it goes sideways, in lanes a second. */
const DART = 6;

/** What this needs of a hazard. The sim's HazardEntity is one. */
export interface RoadThing {
  kind: HazardKind | FoeKind;
  x: number;
  z: number;
  halfW: number;
  len: number;
  ownSpeed: number;
  thrown: number;
  spent: boolean;
  knocked: number;
  /** A car about to change lanes, or changing: where it is going. */
  laneChange?: { toX: number; done: boolean } | null;
}

/** What this needs of a sidekick, plus how wide it is drawn. */
export interface Dodger {
  slot: 0 | 1;
  x: number;
  z: number;
  halfW: number;
  flying: boolean;
}

export interface DodgePose {
  /** Sideways from its place in the formation. */
  dx: number;
  /** Up, on top of however it already moves. */
  hop: number;
  /** How fast it is going sideways, for a little lean. */
  vx: number;
}

export function roadThingHeight(kind: HazardKind | FoeKind): number {
  return HEIGHTS[kind];
}

/** Whether this one goes over a thing of this height. If not, it goes round. */
export function goesOver(kind: HazardKind | FoeKind, flying: boolean): boolean {
  const height = HEIGHTS[kind];
  return height <= (flying ? RISE_LIMIT : JUMP_LIMIT);
}

const isOnRoad = (h: RoadThing): boolean => !h.spent && h.knocked < 0;

const smooth = (from: number, to: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - from) / (to - from)));
  return t * t * (3 - 2 * t);
};

/** Things closer together than a sidekick is wide leave no gap: they count as one stretch. */
function merged(stretches: readonly (readonly [number, number])[]): (readonly [number, number])[] {
  const out: [number, number][] = [];
  for (const [lo, hi] of [...stretches].sort((a, b) => a[0] - b[0])) {
    const last = out[out.length - 1];
    if (last !== undefined && lo <= last[1]) {
      last[1] = Math.max(last[1], hi);
    } else {
      out.push([lo, hi]);
    }
  }
  return out;
}

/** The nearest place to `x` outside every blocked stretch of road. */
function nearestFree(x: number, blocked: readonly (readonly [number, number])[]): number {
  const isFree = (at: number): boolean => Math.abs(at) <= ROAD_LIMIT && blocked.every(([lo, hi]) => at <= lo || at >= hi);
  if (isFree(x)) {
    return x;
  }
  let best = x;
  let bestGap = Infinity;
  for (const [lo, hi] of blocked) {
    for (const at of [lo, hi]) {
      const gap = Math.abs(at - x);
      if (gap < bestGap && isFree(at)) {
        best = at;
        bestGap = gap;
      }
    }
  }
  return best;
}

export class SidekickDodge {
  private readonly poses: [DodgePose, DodgePose] = [{ dx: 0, hop: 0, vx: 0 }, { dx: 0, hop: 0, vx: 0 }];

  pose(slot: 0 | 1): DodgePose {
    return this.poses[slot];
  }

  /** Call once a frame. `speed` is the road's speed. */
  update(dt: number, speed: number, things: readonly RoadThing[], dodgers: readonly Dodger[]): void {
    for (const k of dodgers) {
      const pose = this.poses[k.slot];
      const onRoad = things.filter(isOnRoad);
      const approach = (h: RoadThing): number => Math.max(1, speed * (1 - h.ownSpeed + h.thrown));

      // Going round: every stretch of road that something tall will be on when it reaches this sidekick.
      const coming: (readonly [number, number])[] = [];
      const beside: (readonly [number, number])[] = [];
      for (const h of onRoad) {
        if (goesOver(h.kind, k.flying)) {
          continue;
        }
        const reach = h.halfW + k.halfW + BESIDE;
        const ahead = h.z - k.z;
        const inside = ahead < DEPTH && ahead > -(h.len + DEPTH);
        if (inside || (ahead >= DEPTH && ahead < Math.max(1.2, approach(h) * WARNING)) || (ahead <= -(h.len + DEPTH) && ahead > -(h.len + DEPTH + 0.2))) {
          // A car changing lanes blocks where it is going too, so a sidekick moves out of the way in good time.
          const going = h.laneChange !== null && h.laneChange !== undefined && !h.laneChange.done ? h.laneChange.toX : h.x;
          coming.push([Math.min(h.x, going) - reach, Math.max(h.x, going) + reach]);
          if (inside) {
            beside.push([h.x - reach, h.x + reach]);
          }
        }
      }
      // Something low beside it that it is not already up over: it keeps to its side of that too, rather than being dragged in and having to pop up.
      for (const h of onRoad) {
        const ahead = h.z - k.z;
        if (goesOver(h.kind, k.flying) && ahead < DEPTH && ahead > -(h.len + DEPTH) && pose.hop < (HEIGHTS[h.kind] + OVER - (k.flying ? FLY_HEIGHT : 0)) * 0.9) {
          const reach = h.halfW + k.halfW + BESIDE;
          coming.push([h.x - reach, h.x + reach]);
        }
      }
      const blocked = merged(coming);
      const passing = merged(beside);
      const before = pose.dx;
      const was = k.x + before;
      let want = nearestFree(k.x, blocked);
      // Never across the front of something coming, nor through something alongside: it stays on the side it is on until it is past,
      // however the hero steers. Already in the way (only a thing moving sideways can do that): out by the nearer side.
      for (const [lo, hi] of blocked) {
        if (was <= lo) {
          want = Math.min(want, lo);
        } else if (was >= hi) {
          want = Math.max(want, hi);
        } else {
          want = was - lo < hi - was ? lo : hi;
        }
      }
      const eased = (want - was) * (1 - Math.exp(-EASE * dt));
      let at = was + Math.max(-DART * dt, Math.min(DART * dt, eased));
      // Whatever that reached, it is never left inside something that has arrived. Only a thing moving sideways into it can ask for this.
      for (const [lo, hi] of passing) {
        if (at > lo && at < hi) {
          at = at < (lo + hi) / 2 ? lo : hi;
        }
      }
      pose.dx = at - k.x;
      pose.vx = dt > 0 ? (pose.dx - before) / dt : 0;

      // Going over: a smooth arc, by distance, so it clears the thing at any speed.
      const x = k.x + pose.dx;
      let hop = 0;
      for (const h of onRoad) {
        if (!goesOver(h.kind, k.flying)) {
          continue;
        }
        const edge = h.halfW + k.halfW;
        const off = Math.abs(x - h.x);
        if (off >= edge + NEAR) {
          continue;
        }
        // From clear of its path to fully in it.
        const near = 1 - smooth(edge, edge + NEAR, off);
        const need = HEIGHTS[h.kind] + OVER - (k.flying ? FLY_HEIGHT : 0);
        if (need <= 0) {
          continue;
        }
        const span = h.len + DEPTH * 2;
        const flight = Math.max(span * 1.6, approach(h) * AIR);
        const u = 0.5 - (h.z + h.len / 2 - k.z) / flight;
        if (u <= 0 || u >= 1) {
          continue;
        }
        // High enough at both ends of the stretch where it is over the thing, not only at the top of the arc.
        const peak = need / (1 - (span / flight) ** 2);
        hop = Math.max(hop, 4 * u * (1 - u) * peak * near);
      }
      pose.hop = Math.max(hop, pose.hop - FALL * dt);
    }
  }
}
