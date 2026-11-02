import type { Difficulty } from './types';

/**
 * World units and tuning. Distances are along the track; x is across it, 0
 * at the centre line, the tarmac running from -TRACK_HALF to +TRACK_HALF.
 * Car widths use the same scale as Navie's Road Trip (a car is ~0.62 wide),
 * so the shared drawings keep their proportions.
 */

export const TRACK_HALF = 1.8;
/** Kerbs and grass beyond the tarmac, then the wall. */
export const GRASS_HALF = 2.5;
export const CAR_HALF_W = 0.3;
export const CAR_LENGTH = 1.6;
export const STEP = 1 / 60;
export const MAX_FRAME = 0.1;
export const LAPS = 3;
/** Ghost samples: one lateral position every this many units travelled. */
export const GHOST_STEP = 2;

export interface CarTuning {
  /** Top speed on tarmac, units/s. */
  top: number;
  accel: number;
  /** Top speed on the grass. */
  grassTop: number;
  /** Steering speed across the track, units/s. */
  lateral: number;
  /** How hard bends push the car outward at top speed, units/s. */
  drift: number;
  /** Turbo: speed bonus and how long one charge lasts. */
  boostBonus: number;
  boostSeconds: number;
}

export const BASE_CAR: CarTuning = {
  top: 28,
  accel: 8,
  grassTop: 13,
  lateral: 3.4,
  drift: 2.3,
  boostBonus: 0.3,
  boostSeconds: 2,
};

export interface DifficultyPreset {
  id: Difficulty;
  label: string;
  tagline: string;
  changes: string[];
  /** Rival pace as a share of Navie's base top speed. */
  rivalPace: number;
  /** How strongly rivals wait for / chase Navie (0 = honest race). */
  rubberBand: number;
  /** Bend push multiplier for Navie. */
  driftScale: number;
  /** Rivals try to block passes. */
  blocking: boolean;
  /** Navie's grid slot (1 = pole, 6 = last). */
  gridSlot: number;
}

export const PRESETS: Record<Difficulty, DifficultyPreset> = {
  rookie: {
    id: 'rookie',
    label: 'Rookie',
    tagline: 'Learn the tracks. Rivals take it easy.',
    changes: ['Rivals are slower and wait for you', 'Bends push you outward less', 'You start 4th, not last'],
    rivalPace: 0.86,
    rubberBand: 0.6,
    driftScale: 0.6,
    blocking: false,
    gridSlot: 4,
  },
  easy: {
    id: 'easy',
    label: 'Easy',
    tagline: 'A fair race with friendly rivals.',
    changes: ['Rivals a little slower than you', 'Gentle bends', 'Nobody blocks'],
    rivalPace: 0.94,
    rubberBand: 0.35,
    driftScale: 0.8,
    blocking: false,
    gridSlot: 6,
  },
  standard: {
    id: 'standard',
    label: 'Standard',
    tagline: 'The race as designed.',
    changes: ['Rivals match your pace in places', 'Some rivals block'],
    rivalPace: 1.0,
    rubberBand: 0.15,
    driftScale: 1,
    blocking: true,
    gridSlot: 6,
  },
  pro: {
    id: 'pro',
    label: 'Pro',
    tagline: 'Every tenth counts.',
    changes: ['Fast rivals, no waiting', 'Stronger push in bends', 'Blocking rivals'],
    rivalPace: 1.05,
    rubberBand: 0,
    driftScale: 1.15,
    blocking: true,
    gridSlot: 6,
  },
};

/** Cup points by place. */
export const POINTS = [10, 8, 6, 5, 4, 3];
/** Bolts by place in a cup race. */
export const PLACE_BOLTS = [50, 40, 30, 22, 16, 12];
export const PODIUM_BONUS = 40;
export const TRIAL_BOLTS = 15;
export const TROPHY_BONUS = [150, 100, 60];
