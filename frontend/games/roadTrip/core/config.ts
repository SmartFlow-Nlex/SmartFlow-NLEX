import type { Difficulty, FoeKind } from './types';

/**
 * World units, independent of the screen: a lane is 1 unit wide, the road has
 * three lanes (x from -1.5 to 1.5, lane centres -1, 0, 1), and z is distance
 * ahead of the player's front bumper. The renderer projects these; nothing in
 * the simulation knows a pixel.
 */
export const LANES = [-1, 0, 1] as const;
export const ROAD_HALF = 1.5;

/** The hero's drawn half-width; the hitbox is a little smaller (forgiving). */
export const PLAYER_HALF_W = 0.32;
export const PLAYER_HIT_HALF_W = 0.26;
/** Hitbox along the road: from PLAYER_BACK to PLAYER_FRONT. */
export const PLAYER_FRONT = 0.7;
export const PLAYER_BACK = -0.8;
/** How far the car's centre may go: the whole car stays on the three lanes. */
export const X_LIMIT = ROAD_HALF - PLAYER_HALF_W;

/** Hazards and pick-ups are placed this far ahead - at the horizon, never near the car. */
export const SPAWN_Z = 62;
/** Past this (behind the camera) entities are recycled. */
export const DESPAWN_Z = -9;

/** Fixed simulation step. */
export const STEP = 1 / 60;
/** A longer frame than this is cut short: no big jump after an interruption. */
export const MAX_FRAME = 0.1;

export type HazardKind = 'cone' | 'barrier' | 'pothole' | 'car' | 'truck' | 'bus' | 'rollingCone' | 'sweepBarrier';
export type PickupKind = 'bolt' | 'wrench' | 'postcard' | 'part' | 'spark' | 'powerup';

/**
 * Barrikada's bots: fantasy targets (never traffic). They come down a lane
 * like hazards - touching one is a hit - but pulses and sidekicks can zap
 * them first; a zapped bot drops Bolts. The fairness check treats them as
 * hazards, so a path exists even if you never fire a shot.
 */
export interface FoeSpec {
  halfW: number;
  len: number;
  hp: number;
  /** Own forward speed as a share of the player's. */
  ownSpeed: number;
  /** Bolts dropped when zapped. */
  drop: number;
}

export const FOES: Record<FoeKind, FoeSpec> = {
  conebot: { halfW: 0.2, len: 0.5, hp: 1, ownSpeed: 0, drop: 1 },
  drumbot: { halfW: 0.3, len: 0.7, hp: 3, ownSpeed: 0.15, drop: 3 },
  signbot: { halfW: 0.36, len: 0.5, hp: 2, ownSpeed: 0, drop: 2 },
};

/** Horn pulses: how fast they fly and how far they reach. */
export const PULSE_SPEED = 42;
export const PULSE_RANGE = 46;

export interface HazardSpec {
  halfW: number;
  len: number;
  /** Own forward speed as a share of the player's: traffic drives, cones do not. */
  ownSpeed: number;
  /** Extra approach speed as a share of the player's (things thrown at you). */
  thrown: number;
}

export const HAZARDS: Record<HazardKind, HazardSpec> = {
  cone: { halfW: 0.16, len: 0.45, ownSpeed: 0, thrown: 0 },
  barrier: { halfW: 0.46, len: 0.45, ownSpeed: 0, thrown: 0 },
  pothole: { halfW: 0.22, len: 0.55, ownSpeed: 0, thrown: 0 },
  car: { halfW: 0.31, len: 1.6, ownSpeed: 0.45, thrown: 0 },
  truck: { halfW: 0.38, len: 3.0, ownSpeed: 0.35, thrown: 0 },
  bus: { halfW: 0.4, len: 3.4, ownSpeed: 0.4, thrown: 0 },
  // The finale machine's projectiles: rolled / slid toward you a little faster than the road.
  rollingCone: { halfW: 0.17, len: 0.45, ownSpeed: 0, thrown: 0.25 },
  sweepBarrier: { halfW: 0.46, len: 0.45, ownSpeed: 0, thrown: 0.15 },
};

export const PICKUP_RADIUS: Record<PickupKind, number> = {
  bolt: 0.26,
  wrench: 0.3,
  postcard: 0.32,
  part: 0.3,
  spark: 0.34,
  powerup: 0.36,
};

export interface DifficultyPreset {
  id: Difficulty;
  label: string;
  /** One line under the name. */
  tagline: string;
  /** Its difficulty card on the settings screen, in a few words. */
  summary: string;
  /** Forward speed, units/s. */
  speed: number;
  /** Top steering speed, units/s. */
  lateral: number;
  /** Dents before the run fails; null = the run never fails. */
  maxDents: number | null;
  /** Seconds of protection after a hit. */
  invulnerable: number;
  /** Reaction allowance the fairness check gives the player, seconds. */
  reaction: number;
  /** Extra warning before hazards arrive, seconds. */
  warning: number;
  /** Pattern frequency (1 = standard spacing). */
  density: number;
  /** Whether traffic changes lanes (always signalled first). */
  laneChanges: boolean;
  /** Finale machine toughness. */
  bossToughness: number;
  /** Kiko's engine in the convoy; null = he cannot stall out. */
  kikoEngine: number | null;
  /** Ability cooldown multiplier. */
  cooldown: number;
}

export const PRESETS: Record<Difficulty, DifficultyPreset> = {
  story: {
    id: 'story',
    label: 'Story',
    tagline: 'Enjoy the adventure. You cannot fail.',
    summary: 'Slowest road. You cannot fail.',
    speed: 12,
    lateral: 3.0,
    maxDents: null,
    invulnerable: 2.2,
    reaction: 1.0,
    warning: 0.8,
    density: 0.6,
    laneChanges: false,
    bossToughness: 0.7,
    kikoEngine: null,
    cooldown: 0.7,
  },
  relaxed: {
    id: 'relaxed',
    label: 'Relaxed',
    tagline: 'Gentle challenge with room for mistakes.',
    summary: 'Slower road. 5 dents to fail.',
    speed: 14,
    lateral: 3.1,
    maxDents: 5,
    invulnerable: 1.9,
    reaction: 0.8,
    warning: 0.5,
    density: 0.8,
    laneChanges: false,
    bossToughness: 0.85,
    kikoEngine: 5,
    cooldown: 0.85,
  },
  standard: {
    id: 'standard',
    label: 'Standard',
    tagline: 'The road as designed.',
    summary: 'Normal road. 3 dents to fail.',
    speed: 17,
    lateral: 3.3,
    maxDents: 3,
    invulnerable: 1.5,
    reaction: 0.6,
    warning: 0.25,
    density: 1,
    laneChanges: true,
    bossToughness: 1,
    kikoEngine: 3,
    cooldown: 1,
  },
  expert: {
    id: 'expert',
    label: 'Expert',
    tagline: 'Fast road, tight gaps.',
    summary: 'Fastest road. 2 dents to fail.',
    speed: 20,
    lateral: 3.5,
    maxDents: 2,
    invulnerable: 1.2,
    reaction: 0.45,
    warning: 0,
    density: 1.25,
    laneChanges: true,
    bossToughness: 1.2,
    kikoEngine: 2,
    cooldown: 1.15,
  },
};

/** Abilities, as the Team screen explains them. */
export const ABILITIES = {
  jepoy: {
    passive: {
      name: 'Pasada Pro',
      text: 'Bolts and pick-ups drift toward you from twice as far.',
      tradeOff: 'Easier Bolts, but no protection.',
    },
    active: {
      name: "Kuya's Shield",
      text: 'Jepoy honks beside you: 4 seconds where hazards bounce off. Recharges in 16 s.',
      tradeOff: 'Strong protection, long recharge - time it.',
    },
  },
  kiko: {
    passive: {
      name: 'Early Lookout',
      text: 'Kiko watches the road: hazard warnings appear 0.6 s earlier.',
      tradeOff: 'More time to react, no Bolt help.',
    },
    active: {
      name: 'Spare Parts',
      text: 'Kiko radios a fix: repairs one dent at once. 2 uses per run.',
      tradeOff: 'Undo mistakes, but only twice.',
    },
  },
} as const;

export const SHIELD_SECONDS = 4;
export const SHIELD_TUNED_SECONDS = 5.5;
export const SHIELD_COOLDOWN = 16;
export const SPARE_PARTS_USES = 2;
export const EARLY_LOOKOUT_SECONDS = 0.6;
export const MAGNET_RADIUS = 1.1;

/**
 * The convoy: Kiko drives this far BEHIND Navie (centre to front bumper) and
 * follows the path Navie actually drove, sampled by distance - he is where
 * Navie was a moment ago. He steers slower than Navie, so sharp swerves leave
 * him cutting the corner: lane changes have to be early and smooth.
 */
export const KIKO_GAP = 6.5;
export const KIKO_LATERAL = 2.3;
/** In the rescue lay-by he rolls up closer behind. */
export const KIKO_RESCUE_GAP = 6;
export const KIKO_HALF_W = 0.3;
export const KIKO_FRONT = 0.75;
export const KIKO_BACK = -0.75;
