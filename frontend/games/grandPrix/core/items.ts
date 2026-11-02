import type { Rng } from './rng';

/**
 * Race items, Mario Kart style: drive through a gift box on the track, the
 * box rolls an item, tap ITEM to use it. Fiesta-flavoured and cartoonish -
 * nothing is a weapon: a hit car only spins out for a moment.
 *
 * Fairness rules (enforced in race.ts):
 * - Items exist in Cup races only (Time Trial stays a pure race), and can be
 *   switched off in Settings.
 * - The roll depends on your place: the leader mostly gets defensive items,
 *   the back of the pack gets the catch-up ones (like the games it copies).
 * - A spun-out car is protected for a moment afterwards, so hits never chain.
 * - On Rookie the rivals only ever roll friendly items (they never attack).
 */

export type ItemId = 'turbo' | 'oil' | 'coconut' | 'sipa' | 'bubble' | 'star' | 'redLight';
export const ITEMS: readonly ItemId[] = ['turbo', 'oil', 'coconut', 'sipa', 'bubble', 'star', 'redLight'];

export interface ItemDef {
  id: ItemId;
  name: string;
  /** One line for the HUD and the help. */
  text: string;
  /** Sabotage items need a target; the rest help the user. */
  attack: boolean;
}

export const ITEM_DEFS: Record<ItemId, ItemDef> = {
  turbo: { id: 'turbo', name: 'Turbo Kick', text: 'A burst of speed right now.', attack: false },
  oil: { id: 'oil', name: 'Oil Slick', text: 'Dropped behind you: the next car over it spins out.', attack: true },
  coconut: { id: 'coconut', name: 'Coconut Roll', text: 'Rolls straight ahead and spins out the first car in its line.', attack: true },
  sipa: { id: 'sipa', name: 'Sipa Ball', text: 'Bounces after the car just ahead of you.', attack: true },
  bubble: { id: 'bubble', name: 'Bubble Shield', text: 'Blocks the next hit for 8 seconds.', attack: false },
  star: { id: 'star', name: 'Fiesta Star', text: 'Faster and unstoppable for 4 s; cars you bump spin out.', attack: false },
  redLight: { id: 'redLight', name: 'Red Light', text: 'Every car ahead of you slows down for 2.5 s.', attack: true },
};

/** Seconds the box "rolls" (the HUD shows a roulette) before the item can be used. */
export const ITEM_ROLL_S = 0.9;
/** A box comes back this long after it was taken. */
export const BOX_RESPAWN_S = 2.5;
export const SPIN_S = 1.1;
/** Protection after a spin-out, so hits never chain. */
export const AFTER_SPIN_S = 2.6;
export const TURBO_ITEM_S = 1.6;
export const BUBBLE_S = 8;
export const STAR_S = 4;
export const RED_LIGHT_S = 2.5;
export const SLICK_LIFE_S = 25;
export const COCONUT_SPEED = 38;
export const SIPA_SPEED = 44;
export const SHOT_LIFE_S = 4;

/**
 * Rolls an item for a car in `place` of `cars` (1 = leading). `friendlyOnly`
 * for Rookie rivals. Deterministic for the race's RNG.
 */
export function rollItem(rng: Rng, place: number, cars: number, friendlyOnly: boolean): ItemId {
  const f = cars <= 1 ? 0.5 : (place - 1) / (cars - 1);
  const weights: Record<ItemId, number> = {
    turbo: 2 + 3 * f,
    oil: 3 - 2 * f,
    coconut: 2.5 - f,
    sipa: 0.4 + 2 * f,
    bubble: 2 - f,
    star: 2.5 * f * f,
    redLight: place === 1 ? 0 : 1.5 * f * f,
  };
  const pool = ITEMS.filter((id) => !friendlyOnly || !ITEM_DEFS[id].attack);
  const total = pool.reduce((sum, id) => sum + weights[id], 0);
  let r = rng.next() * total;
  for (const id of pool) {
    r -= weights[id];
    if (r <= 0) {
      return id;
    }
  }
  return pool[pool.length - 1];
}
