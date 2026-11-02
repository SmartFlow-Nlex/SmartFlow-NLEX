/**
 * Seeded randomness. Every run of a mission takes a seed, shown in the pause
 * menu, so any run - and any unfair pattern found in one - can be replayed
 * exactly by the tests or by hand.
 */

export interface Rng {
  /** 0 <= n < 1. */
  next: () => number;
  /** Integer in [min, max]. */
  int: (min: number, max: number) => number;
  /** Number in [min, max). */
  range: (min: number, max: number) => number;
  /** True with probability p. */
  chance: (p: number) => boolean;
  pick: <T>(items: readonly T[]) => T;
  /** Weighted pick; weights must not all be zero. */
  weighted: <T>(items: readonly T[], weight: (item: T) => number) => T;
}

/** mulberry32: tiny, fast, and the same on every JavaScript engine. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng: Rng = {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    range: (min, max) => min + next() * (max - min),
    chance: (p) => next() < p,
    pick: (items) => items[Math.floor(next() * items.length)],
    weighted: (items, weight) => {
      let total = 0;
      for (const item of items) {
        total += Math.max(0, weight(item));
      }
      let roll = next() * total;
      for (const item of items) {
        roll -= Math.max(0, weight(item));
        if (roll < 0) {
          return item;
        }
      }
      return items[items.length - 1];
    },
  };
  return rng;
}

/** A fresh seed for a new run: not reproducible, but shown so it can be. */
export function newSeed(): number {
  return Math.floor(Math.random() * 2_147_483_647) + 1;
}

/** A run id nobody else will produce: what stops one run being paid twice. */
export function newRunId(seed: number, now: number = Date.now()): string {
  const random = Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
  return `${now.toString(36)}-${seed.toString(36)}-${random}`;
}
