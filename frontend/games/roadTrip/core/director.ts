import {
  FOES,
  HAZARDS,
  KIKO_BACK,
  KIKO_FRONT,
  KIKO_HALF_W,
  KIKO_LATERAL,
  PLAYER_BACK,
  PLAYER_FRONT,
  PLAYER_HIT_HALF_W,
  X_LIMIT,
  type HazardKind,
} from './config';
import type { FoeKind } from './types';
import { hasSafePath, type Mover, type Obstacle } from './reachability';
import { PATTERNS_BY_ID, patternsWith, variantsOf, type Pattern, type PatternTag, type Variant } from './patterns';
import type { Rng } from './rng';

/**
 * Chooses what comes next on the road: a pattern from the section's pools,
 * varied, and placed only if it keeps a reachable path (for Navie, and in the
 * convoy for Kiko as well). When no variant of the choice is fair, other
 * patterns are tried, then a safe pattern (pick-ups or empty road).
 */

export const HAZARD_KINDS: readonly HazardKind[] = ['cone', 'barrier', 'pothole', 'car', 'truck', 'bus', 'rollingCone', 'sweepBarrier'];

export function isHazardKind(kind: string): kind is HazardKind {
  return (HAZARD_KINDS as readonly string[]).includes(kind);
}

export const FOE_KINDS: readonly FoeKind[] = ['conebot', 'drumbot', 'signbot'];

export function isFoeKind(kind: string): kind is FoeKind {
  return (FOE_KINDS as readonly string[]).includes(kind);
}

/** Size and motion of anything that can hit the car: a hazard or one of Barrikada's bots. */
export function specOf(kind: HazardKind | FoeKind): { halfW: number; len: number; ownSpeed: number; thrown: number } {
  if (isFoeKind(kind)) {
    const foe = FOES[kind];
    return { halfW: foe.halfW, len: foe.len, ownSpeed: foe.ownSpeed, thrown: 0 };
  }
  return HAZARDS[kind];
}

/** Where traffic starts indicating, and how its lane change is timed. */
export const LANE_CHANGE = { signalZ: 44, signalSeconds: 1.2, duration: 0.9 };

/** What the director needs to know about the world when it places something. */
export interface PlacementWorld {
  /** Seconds-to-arrival model: current forward speed, units/s. */
  speed: number;
  player: { x: number; vx: number };
  /** Kiko in the convoy, or null. */
  kiko: { x: number; vx: number; z: number } | null;
  /** Hazards already on (or beyond) the road, in reachability form. */
  obstacles: Obstacle[];
}

export interface DirectorParams {
  /** Reaction allowance in simulation seconds. */
  reaction: number;
  /** Real top steering speed, units/s - the check assumes 85% of it. */
  lateral: number;
  laneChanges: boolean;
  /** The hero's hitbox half-width (heroes differ); defaults to Navie's. */
  hitHalfW?: number;
}

export function obstacleFor(kind: HazardKind | FoeKind, x: number, z: number, speed: number, toX?: number): Obstacle {
  const spec = specOf(kind);
  const approach = speed * (1 - spec.ownSpeed + spec.thrown);
  const obstacle: Obstacle = { x, halfW: spec.halfW, z, len: spec.len, approach };
  if (toX !== undefined && toX !== x && approach > 0) {
    const signalT = Math.max(0, (z - LANE_CHANGE.signalZ) / approach);
    obstacle.laneChange = {
      toX,
      signalT,
      startT: signalT + LANE_CHANGE.signalSeconds,
      duration: LANE_CHANGE.duration,
    };
  }
  return obstacle;
}

/** A variant's hazards as obstacles, its first item `startZ` ahead. */
export function variantObstacles(variant: Variant, startZ: number, speed: number): Obstacle[] {
  const out: Obstacle[] = [];
  for (const item of variant.items) {
    if (isHazardKind(item.kind) || isFoeKind(item.kind)) {
      // Bots count as hazards: the road must be passable even if you never fire.
      out.push(obstacleFor(item.kind, item.x, startZ + item.dz, speed, item.toX));
    }
  }
  return out;
}

const CHECK_SHARE = 0.85;

function navieMover(world: PlacementWorld, params: DirectorParams): Mover {
  return {
    x: world.player.x,
    vx: world.player.vx,
    halfW: params.hitHalfW ?? PLAYER_HIT_HALF_W,
    back: PLAYER_BACK,
    front: PLAYER_FRONT,
    xMin: -X_LIMIT,
    xMax: X_LIMIT,
    lateral: params.lateral * CHECK_SHARE,
    reaction: params.reaction,
  };
}

/**
 * Kiko trails Navie by a gap and steers along the path Navie drove, so he
 * reaches each stretch of road `tau = gap / speed` seconds after Navie did,
 * at Navie's old position. What threatens him there is therefore a constraint
 * on Navie's path now: each hazard is copied as a "Kiko shadow" - where it
 * will be when Kiko gets to that piece of road, timed for Navie's hitbox:
 *
 * - static hazards: the shadow is the hazard itself (Kiko meets it where Navie did);
 * - traffic: it keeps driving while Kiko catches up, so its shadow sits further
 *   ahead, by `(speed - approach) * tau`;
 * - lane changes happen `tau` sooner relative to Navie's pass;
 * - Kiko's steering lags his target (about 0.1 s), so he reaches each of
 *   Navie's old positions a little further along the road: Navie must be
 *   clear that much EARLIER. The shadow is moved earlier by the longest lag
 *   and kept long enough to cover the shortest one, and widened by Kiko's
 *   extra half-width.
 *
 * Navie must avoid the real hazards and the shadows; the check also assumes no
 * more than Kiko's steering speed, so the path it finds is one he can follow.
 */
/** Kiko's steering lag behind his target, seconds: the range the shadows cover. */
export const KIKO_LAG_MIN = 0;
export const KIKO_LAG_MAX = 0.2;

export function kikoShadows(obstacles: readonly Obstacle[], kikoZ: number, speed: number): Obstacle[] {
  const tau = speed > 0 ? Math.max(0, -kikoZ) / speed : 0;
  return obstacles.map((o) => {
    const shift = -o.approach * (tau + KIKO_LAG_MAX) - (kikoZ + KIKO_FRONT) + PLAYER_FRONT;
    return {
      ...o,
      z: o.z + shift,
      len: o.len + (KIKO_FRONT - KIKO_BACK) - (PLAYER_FRONT - PLAYER_BACK) + o.approach * (KIKO_LAG_MAX - KIKO_LAG_MIN),
      halfW: o.halfW + (KIKO_HALF_W - PLAYER_HIT_HALF_W) + 0.04,
      laneChange: o.laneChange
        ? {
            ...o.laneChange,
            signalT: o.laneChange.signalT - tau - KIKO_LAG_MAX,
            startT: o.laneChange.startT - tau - KIKO_LAG_MAX,
          }
        : undefined,
    };
  });
}

/** Would placing these obstacles keep a fair path for everyone who needs one? */
export function placementIsFair(world: PlacementWorld, candidate: readonly Obstacle[], params: DirectorParams): boolean {
  if (candidate.length === 0) {
    return true;
  }
  const all = [...world.obstacles, ...candidate];
  const mover = navieMover(world, params);
  if (world.kiko === null) {
    return hasSafePath(all, mover);
  }
  // A path Kiko can follow: no faster sideways than he steers.
  const convoyMover: Mover = { ...mover, lateral: Math.min(mover.lateral, KIKO_LATERAL * CHECK_SHARE) };
  // Hazards Kiko has already passed no longer matter to him.
  const ahead = all.filter((o) => o.z + o.len > world.kiko!.z + KIKO_BACK);
  return hasSafePath([...all, ...kikoShadows(ahead, world.kiko.z, world.speed)], convoyMover);
}

export interface Choice {
  variant: Variant;
  /** True when the section's choice failed and a safe pattern was used instead. */
  fallback: boolean;
}

/**
 * Picks a pattern from `pools` and returns its first fair variant. Tries up
 * to `attempts` different patterns before falling back to a safe one.
 */
export function choosePattern(
  rng: Rng,
  pools: readonly { tag: PatternTag; weight: number }[],
  world: PlacementWorld,
  startZ: number,
  params: DirectorParams,
  attempts = 4,
): Choice {
  const tried = new Set<string>();
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const pool = rng.weighted(pools, (p) => p.weight);
    const options = patternsWith([pool.tag], params.laneChanges).filter((p) => !tried.has(p.id));
    if (options.length === 0) {
      continue;
    }
    const pattern: Pattern = rng.weighted(options, (p) => p.weight);
    tried.add(pattern.id);
    for (const variant of variantsOf(pattern, rng)) {
      if (placementIsFair(world, variantObstacles(variant, startZ, world.speed), params)) {
        return { variant, fallback: false };
      }
    }
  }
  return { variant: safeFallback(rng), fallback: true };
}

/** Pick-ups or nothing: always fair, because it adds no hazard. */
export function safeFallback(rng: Rng): Variant {
  const pattern = rng.chance(0.6) ? PATTERNS_BY_ID['bolt-trail'] : PATTERNS_BY_ID.empty;
  return variantsOf(pattern, rng)[0];
}

/** A specific pattern, fair variant or null. */
export function fairVariantOf(
  rng: Rng,
  patternId: string,
  world: PlacementWorld,
  startZ: number,
  params: DirectorParams,
): Variant | null {
  const pattern = PATTERNS_BY_ID[patternId];
  for (const variant of variantsOf(pattern, rng)) {
    if (placementIsFair(world, variantObstacles(variant, startZ, world.speed), params)) {
      return variant;
    }
  }
  return null;
}
