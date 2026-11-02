import type { HazardKind, PickupKind } from './config';
import type { FoeKind, PowerUpKind } from './types';
import type { Rng } from './rng';

/**
 * The designed obstacle patterns. The road is made of these - a small library
 * of readable shapes, varied by mirroring, lane shifts and small spacing
 * changes - never of hazards scattered at random. Every placement is checked
 * for a reachable path first (reachability.ts); a pattern that fails in all
 * its variants is replaced by a safe one.
 *
 * Positions: `lane` is -1 / 0 / 1 (left / centre / right) or `x` for an
 * exact lateral position; `dz` is distance from the pattern's start, further
 * away as it grows.
 */

export type PatternTag =
  | 'easy'
  | 'medium'
  | 'hard'
  | 'traffic'
  | 'pickup'
  | 'repair'
  | 'convoy'
  | 'convoyLearn'
  | 'bots'
  | 'mixed'
  | 'powerup'
  | 'convoyPart'
  | 'boss1'
  | 'boss2'
  | 'boss3'
  | 'safe';

export type SignKind = 'closure' | 'gap';

export interface PatternItem {
  kind: HazardKind | PickupKind | FoeKind | 'sign';
  /** Power-up capsules: which one (otherwise the run's rotation decides). */
  power?: PowerUpKind;
  lane?: number;
  x?: number;
  dz: number;
  /** Traffic and sign-bots: changes to this lane, signalled first. */
  toLane?: number;
  /** Signs only: which lane stays open. */
  openLane?: number;
  sign?: SignKind;
}

export interface Pattern {
  id: string;
  tags: PatternTag[];
  items: PatternItem[];
  /** Relative pick frequency inside its pool. */
  weight: number;
  mirror: boolean;
  shift: boolean;
  /** Spacing may be stretched by up to this share (never shrunk). */
  stretch: number;
  /** Needs lane-changing traffic to be allowed (Standard and Expert). */
  laneChanges?: boolean;
}

const bolts = (lane: number, from: number, count: number, step = 2.4): PatternItem[] =>
  Array.from({ length: count }, (_, i) => ({ kind: 'bolt' as const, lane, dz: from + i * step }));

export const PATTERNS: Pattern[] = [
  // -- easy --------------------------------------------------------------
  { id: 'cone-single', tags: ['easy'], weight: 2, mirror: true, shift: true, stretch: 0, items: [{ kind: 'cone', lane: 0, dz: 0 }, ...bolts(1, 0, 3)] },
  {
    id: 'cone-pair',
    tags: ['easy', 'medium'],
    weight: 3,
    mirror: true,
    shift: false,
    stretch: 0,
    items: [{ kind: 'cone', lane: -1, dz: 0 }, { kind: 'cone', lane: 0, dz: 0 }, ...bolts(1, -1, 3)],
  },
  {
    id: 'cone-line',
    tags: ['easy'],
    weight: 2,
    mirror: true,
    shift: true,
    stretch: 0.2,
    items: [
      { kind: 'cone', lane: -1, dz: 0 },
      { kind: 'cone', lane: -1, dz: 3.5 },
      { kind: 'cone', lane: -1, dz: 7 },
      ...bolts(0, 0, 4, 2.3),
    ],
  },
  {
    id: 'chicane',
    tags: ['easy', 'medium'],
    weight: 2,
    mirror: true,
    shift: false,
    stretch: 0.3,
    items: [
      { kind: 'barrier', lane: -1, dz: 0 },
      { kind: 'barrier', lane: 1, dz: 13 },
      ...bolts(0, 2, 4, 2.6),
    ],
  },
  {
    id: 'roadworks',
    tags: ['easy', 'medium'],
    weight: 2,
    mirror: true,
    shift: false,
    stretch: 0.2,
    items: [
      { kind: 'cone', x: -0.5, dz: 0 },
      { kind: 'cone', x: -0.5, dz: 3 },
      { kind: 'cone', x: -0.5, dz: 6 },
      { kind: 'cone', x: -0.5, dz: 9 },
      { kind: 'barrier', lane: -1, dz: 12 },
      ...bolts(0, 1, 4, 3),
    ],
  },
  { id: 'traffic-single', tags: ['easy', 'traffic'], weight: 2, mirror: true, shift: true, stretch: 0, items: [{ kind: 'car', lane: -1, dz: 0 }] },

  // -- medium ------------------------------------------------------------
  {
    id: 'barrier-gate',
    tags: ['medium'],
    weight: 3,
    mirror: true,
    shift: false,
    stretch: 0,
    items: [{ kind: 'barrier', lane: -1, dz: 0 }, { kind: 'barrier', lane: 0, dz: 0 }, ...bolts(1, 3, 3)],
  },
  {
    id: 'slalom-wide',
    tags: ['medium'],
    weight: 2,
    mirror: true,
    shift: false,
    stretch: 0.25,
    items: [
      { kind: 'cone', lane: -1, dz: 0 },
      { kind: 'cone', lane: 0, dz: 0 },
      { kind: 'cone', lane: 0, dz: 17 },
      { kind: 'cone', lane: 1, dz: 17 },
      ...bolts(1, -2, 2),
      ...bolts(-1, 15, 2),
    ],
  },
  {
    id: 'pothole-scatter',
    tags: ['medium'],
    weight: 2,
    mirror: true,
    shift: false,
    stretch: 0.2,
    items: [
      { kind: 'pothole', x: -0.95, dz: 0 },
      { kind: 'pothole', x: 0.15, dz: 7 },
      { kind: 'pothole', x: 1.0, dz: 14 },
    ],
  },
  {
    id: 'traffic-pair',
    tags: ['medium', 'traffic'],
    weight: 3,
    mirror: true,
    shift: false,
    stretch: 0.3,
    items: [{ kind: 'car', lane: -1, dz: 0 }, { kind: 'car', lane: 1, dz: 7 }, ...bolts(0, 10, 3)],
  },
  { id: 'truck-lane', tags: ['medium', 'traffic'], weight: 2, mirror: true, shift: true, stretch: 0, items: [{ kind: 'truck', lane: 0, dz: 0 }, ...bolts(-1, 0, 3, 2)] },
  {
    id: 'bus-and-cone',
    tags: ['medium', 'traffic'],
    weight: 2,
    mirror: true,
    shift: false,
    stretch: 0.2,
    items: [{ kind: 'bus', lane: 1, dz: 0 }, { kind: 'cone', lane: -1, dz: 9 }, ...bolts(0, 4, 3)],
  },

  // -- hard --------------------------------------------------------------
  {
    id: 'split-row',
    tags: ['hard'],
    weight: 2,
    mirror: false,
    shift: false,
    stretch: 0.2,
    items: [
      { kind: 'cone', lane: -1, dz: 0 },
      { kind: 'cone', lane: 1, dz: 0 },
      { kind: 'barrier', lane: 0, dz: 12 },
      ...bolts(0, -2, 2),
    ],
  },
  {
    id: 'merge-car',
    tags: ['hard', 'traffic'],
    weight: 2,
    mirror: true,
    shift: false,
    stretch: 0,
    laneChanges: true,
    items: [{ kind: 'car', lane: -1, dz: 0, toLane: 0 }, { kind: 'cone', lane: 1, dz: 6 }],
  },
  {
    id: 'traffic-wall',
    tags: ['hard', 'traffic'],
    weight: 2,
    mirror: true,
    shift: false,
    stretch: 0.2,
    items: [{ kind: 'car', lane: -1, dz: 0 }, { kind: 'truck', lane: 0, dz: 3 }, ...bolts(1, 2, 3)],
  },

  // -- pick-ups (always safe) ---------------------------------------------
  { id: 'bolt-trail', tags: ['pickup', 'safe'], weight: 3, mirror: true, shift: true, stretch: 0, items: bolts(0, 0, 5, 2.4) },
  {
    id: 'bolt-arc',
    tags: ['pickup', 'safe'],
    weight: 2,
    mirror: true,
    shift: false,
    stretch: 0,
    items: [
      { kind: 'bolt', x: -1, dz: 0 },
      { kind: 'bolt', x: -0.5, dz: 2.5 },
      { kind: 'bolt', x: 0, dz: 5 },
      { kind: 'bolt', x: 0.5, dz: 7.5 },
      { kind: 'bolt', x: 1, dz: 10 },
    ],
  },
  { id: 'empty', tags: ['safe'], weight: 1, mirror: false, shift: false, stretch: 0, items: [] },

  // -- Barrikada's bots: targets for the horn and the sidekicks ------------
  { id: 'bot-single', tags: ['bots'], weight: 2, mirror: true, shift: true, stretch: 0, items: [{ kind: 'conebot', lane: 0, dz: 0 }, ...bolts(1, 0, 3)] },
  {
    id: 'bot-pair',
    tags: ['bots'],
    weight: 3,
    mirror: true,
    shift: false,
    stretch: 0.2,
    items: [{ kind: 'conebot', lane: 0, dz: 0 }, { kind: 'conebot', lane: 1, dz: 9 }, ...bolts(-1, 0, 4)],
  },
  {
    id: 'bot-line',
    tags: ['bots'],
    weight: 2,
    mirror: true,
    shift: true,
    stretch: 0.2,
    items: [{ kind: 'conebot', lane: 0, dz: 0 }, { kind: 'conebot', lane: 0, dz: 5 }, { kind: 'conebot', lane: 0, dz: 10 }, ...bolts(1, 0, 5)],
  },
  {
    id: 'drum-guard',
    tags: ['bots'],
    weight: 2,
    mirror: true,
    shift: true,
    stretch: 0,
    items: [{ kind: 'drumbot', lane: 0, dz: 0 }, ...bolts(0, 4, 3)],
  },
  {
    id: 'sign-sweep',
    tags: ['bots'],
    weight: 2,
    mirror: true,
    shift: false,
    stretch: 0,
    laneChanges: true,
    items: [{ kind: 'signbot', lane: -1, dz: 0, toLane: 0 }, ...bolts(1, -2, 3)],
  },
  {
    id: 'bot-v',
    tags: ['bots'],
    weight: 1,
    mirror: false,
    shift: false,
    stretch: 0.2,
    items: [{ kind: 'conebot', lane: -1, dz: 0 }, { kind: 'conebot', lane: 1, dz: 0 }, { kind: 'drumbot', lane: 0, dz: 12 }, ...bolts(0, -2, 2)],
  },

  // -- mixed: hazards and bots together -----------------------------------
  {
    id: 'mix-cone-bot',
    tags: ['mixed'],
    weight: 3,
    mirror: true,
    shift: false,
    stretch: 0.2,
    items: [{ kind: 'cone', lane: -1, dz: 0 }, { kind: 'conebot', lane: 0, dz: 7 }, ...bolts(1, 2, 3)],
  },
  {
    id: 'mix-barrier-drum',
    tags: ['mixed'],
    weight: 2,
    mirror: true,
    shift: false,
    stretch: 0.2,
    items: [{ kind: 'barrier', lane: 1, dz: 0 }, { kind: 'drumbot', lane: -1, dz: 9 }, ...bolts(0, 3, 3)],
  },
  {
    id: 'mix-traffic-bot',
    tags: ['mixed'],
    weight: 2,
    mirror: true,
    shift: false,
    stretch: 0.3,
    items: [{ kind: 'car', lane: 0, dz: 0 }, { kind: 'conebot', lane: 1, dz: 10 }, ...bolts(-1, 4, 3)],
  },

  // -- power-up capsule, on its own clear lane ------------------------------
  { id: 'powerup-gift', tags: ['powerup'], weight: 1, mirror: true, shift: true, stretch: 0, items: [{ kind: 'powerup', lane: 0, dz: 0 }, ...bolts(0, 3, 2)] },
  { id: 'wrench-gift', tags: ['repair'], weight: 1, mirror: true, shift: true, stretch: 0, items: [{ kind: 'wrench', lane: 0, dz: 0 }, ...bolts(0, 3, 2)] },

  // -- convoy, first stretch: one thing at a time, lots of room to move early --
  { id: 'learn-cone', tags: ['convoyLearn'], weight: 2, mirror: true, shift: true, stretch: 0, items: [{ kind: 'cone', lane: 0, dz: 0 }, ...bolts(1, -2, 3)] },
  { id: 'learn-barrier', tags: ['convoyLearn'], weight: 2, mirror: true, shift: true, stretch: 0, items: [{ kind: 'barrier', lane: -1, dz: 0 }, ...bolts(0, -1, 3)] },
  {
    id: 'learn-sign',
    tags: ['convoyLearn'],
    weight: 2,
    mirror: true,
    shift: false,
    stretch: 0,
    items: [
      { kind: 'sign', sign: 'closure', lane: 1, openLane: 1, dz: 0 },
      { kind: 'barrier', lane: -1, dz: 28 },
      { kind: 'barrier', lane: 0, dz: 28 },
      ...bolts(1, 24, 3),
    ],
  },

  // -- convoy: lane closures, signed early, that Kiko must also clear ------
  {
    id: 'closure-two',
    tags: ['convoy'],
    weight: 3,
    mirror: true,
    shift: false,
    stretch: 0,
    items: [
      { kind: 'sign', sign: 'closure', lane: 1, openLane: 1, dz: 0 },
      { kind: 'barrier', lane: -1, dz: 24 },
      { kind: 'barrier', lane: 0, dz: 24 },
      { kind: 'cone', lane: -1, dz: 27 },
      { kind: 'cone', lane: 0, dz: 27 },
      ...bolts(1, 22, 3),
    ],
  },
  {
    id: 'closure-centre-open',
    tags: ['convoy'],
    weight: 2,
    mirror: false,
    shift: false,
    stretch: 0,
    items: [
      { kind: 'sign', sign: 'closure', lane: 0, openLane: 0, dz: 0 },
      { kind: 'barrier', lane: -1, dz: 24 },
      { kind: 'barrier', lane: 1, dz: 24 },
      ...bolts(0, 21, 3),
    ],
  },
  {
    id: 'convoy-cone',
    tags: ['convoy'],
    weight: 2,
    mirror: true,
    shift: true,
    stretch: 0.2,
    items: [{ kind: 'sign', sign: 'closure', lane: 1, openLane: 1, dz: 0 }, { kind: 'cone', lane: 0, dz: 20 }, { kind: 'cone', lane: -1, dz: 20 }],
  },
  {
    id: 'convoy-truck',
    tags: ['convoy'],
    weight: 2,
    mirror: true,
    shift: true,
    stretch: 0,
    items: [{ kind: 'truck', lane: 0, dz: 0 }, ...bolts(1, 4, 3)],
  },
  {
    id: 'convoy-weave',
    tags: ['convoy'],
    weight: 2,
    mirror: true,
    shift: false,
    stretch: 0.2,
    items: [
      { kind: 'barrier', lane: -1, dz: 0 },
      { kind: 'barrier', lane: 1, dz: 17 },
      { kind: 'barrier', lane: -1, dz: 34 },
      ...bolts(0, 6, 3, 3),
      ...bolts(0, 23, 3, 3),
    ],
  },
  {
    id: 'convoy-potholes',
    tags: ['convoy'],
    weight: 1,
    mirror: true,
    shift: false,
    stretch: 0.2,
    items: [
      { kind: 'pothole', lane: -1, dz: 0 },
      { kind: 'pothole', lane: 1, dz: 0 },
      { kind: 'cone', lane: 0, dz: 16 },
      { kind: 'cone', lane: -1, dz: 16 },
      ...bolts(0, -3, 2),
      ...bolts(1, 13, 3),
    ],
  },
  { id: 'convoy-part', tags: ['convoyPart'], weight: 1, mirror: true, shift: true, stretch: 0, items: [{ kind: 'part', lane: 0, dz: 0 }, ...bolts(0, 3, 2)] },

  // -- finale: what the machine throws ------------------------------------
  {
    id: 'volley-gap',
    tags: ['boss1'],
    weight: 3,
    mirror: true,
    shift: false,
    stretch: 0,
    items: [{ kind: 'rollingCone', lane: -1, dz: 0 }, { kind: 'rollingCone', lane: 0, dz: 0 }],
  },
  {
    id: 'volley-sides',
    tags: ['boss1'],
    weight: 2,
    mirror: false,
    shift: false,
    stretch: 0,
    items: [{ kind: 'rollingCone', lane: -1, dz: 0 }, { kind: 'rollingCone', lane: 1, dz: 0 }],
  },
  {
    id: 'volley-stagger',
    tags: ['boss1'],
    weight: 2,
    mirror: true,
    shift: false,
    stretch: 0.2,
    items: [{ kind: 'rollingCone', lane: -1, dz: 0 }, { kind: 'rollingCone', lane: 1, dz: 10 }],
  },
  {
    id: 'sweep-gap',
    tags: ['boss2'],
    weight: 3,
    mirror: true,
    shift: false,
    stretch: 0,
    items: [
      { kind: 'sign', sign: 'gap', lane: 1, openLane: 1, dz: 0 },
      { kind: 'sweepBarrier', lane: -1, dz: 0 },
      { kind: 'sweepBarrier', lane: 0, dz: 0 },
    ],
  },
  {
    id: 'sweep-centre',
    tags: ['boss2'],
    weight: 2,
    mirror: false,
    shift: false,
    stretch: 0,
    items: [
      { kind: 'sign', sign: 'gap', lane: 0, openLane: 0, dz: 0 },
      { kind: 'sweepBarrier', lane: -1, dz: 0 },
      { kind: 'sweepBarrier', lane: 1, dz: 0 },
    ],
  },
  { id: 'overheat-roll', tags: ['boss3'], weight: 2, mirror: true, shift: true, stretch: 0.2, items: [{ kind: 'rollingCone', lane: -1, dz: 0 }] },
  {
    id: 'overheat-pair',
    tags: ['boss3'],
    weight: 1,
    mirror: true,
    shift: false,
    stretch: 0.2,
    items: [{ kind: 'rollingCone', lane: -1, dz: 0 }, { kind: 'rollingCone', lane: 1, dz: 12 }],
  },
];

export const PATTERNS_BY_ID: Record<string, Pattern> = Object.fromEntries(PATTERNS.map((p) => [p.id, p]));

/** One concrete placement of a pattern: lanes resolved to x, spacing chosen. */
export interface PlacedItem {
  kind: PatternItem['kind'];
  x: number;
  dz: number;
  power?: PowerUpKind;
  toX?: number;
  openX?: number;
  sign?: SignKind;
}

export interface Variant {
  patternId: string;
  mirrored: boolean;
  shift: number;
  stretch: number;
  items: PlacedItem[];
  /** Distance from first to last item. */
  length: number;
}

function laneOk(lane: number): boolean {
  return lane >= -1 && lane <= 1;
}

/** Builds one variant; null when the shift pushes an item off the road. */
export function placeVariant(pattern: Pattern, mirrored: boolean, shift: number, stretch: number): Variant | null {
  const flip = mirrored ? -1 : 1;
  const items: PlacedItem[] = [];
  for (const item of pattern.items) {
    let x: number;
    if (item.lane !== undefined) {
      const lane = item.lane * flip + shift;
      if (!laneOk(lane)) {
        return null;
      }
      x = lane;
    } else {
      x = (item.x ?? 0) * flip + shift;
      if (Math.abs(x) > 1.2) {
        return null;
      }
    }
    const placed: PlacedItem = { kind: item.kind, x, dz: item.dz * (1 + stretch) };
    if (item.power !== undefined) {
      placed.power = item.power;
    }
    if (item.toLane !== undefined) {
      const to = item.toLane * flip + shift;
      if (!laneOk(to)) {
        return null;
      }
      placed.toX = to;
    }
    if (item.openLane !== undefined) {
      const open = item.openLane * flip + shift;
      if (!laneOk(open)) {
        return null;
      }
      placed.openX = open;
      placed.sign = item.sign;
    }
    items.push(placed);
  }
  // Start every placement at dz 0, so nothing lands nearer than the spawn line.
  const first = items.length > 0 ? Math.min(0, ...items.map((i) => i.dz)) : 0;
  for (const item of items) {
    item.dz -= first;
  }
  const length = items.length > 0 ? Math.max(...items.map((i) => i.dz)) : 0;
  return { patternId: pattern.id, mirrored, shift, stretch, items, length };
}

/** Fisher-Yates with the run's generator: the same order on every engine (Array.sort with a random comparator is not). */
function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng.next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Every allowed variant of a pattern, in a seeded order, the preferred one first. */
export function variantsOf(pattern: Pattern, rng: Rng): Variant[] {
  const stretch = pattern.stretch > 0 ? rng.range(0, pattern.stretch) : 0;
  const mirrors = pattern.mirror ? (rng.chance(0.5) ? [false, true] : [true, false]) : [false];
  const shifts = pattern.shift ? shuffled([0, -1, 1], rng) : [0];
  const out: Variant[] = [];
  for (const shift of shifts) {
    for (const mirrored of mirrors) {
      const variant = placeVariant(pattern, mirrored, shift, stretch);
      if (variant !== null) {
        out.push(variant);
      }
    }
  }
  // A stretched copy last: more room can make a tight placement fair.
  if (pattern.stretch === 0 && pattern.tags.some((t) => t === 'medium' || t === 'hard')) {
    const roomy = placeVariant(pattern, mirrors[0], 0, 0.35);
    if (roomy !== null) {
      out.push(roomy);
    }
  }
  return out;
}

export function patternsWith(tags: readonly PatternTag[], laneChanges: boolean): Pattern[] {
  return PATTERNS.filter((p) => p.tags.some((t) => tags.includes(t)) && (laneChanges || !p.laneChanges));
}
