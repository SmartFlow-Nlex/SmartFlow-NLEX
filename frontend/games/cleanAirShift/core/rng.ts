/** Seeded randomness (mulberry32), so a race with the same seed and inputs replays exactly. */

export interface Rng {
  next: () => number;
  chance: (p: number) => boolean;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, chance: (p) => next() < p };
}

export function newSeed(): number {
  return Math.floor(Math.random() * 2_147_483_647) + 1;
}

export function newRunId(seed: number, now: number = Date.now()): string {
  return `${now.toString(36)}-${seed.toString(36)}-${Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0')}`;
}
