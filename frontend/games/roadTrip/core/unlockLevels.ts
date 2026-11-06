import { JOURNEY_EXITS, levelOf, spreadLevels } from './levels';
import type { HeroId, SidekickId } from './types';

/**
 * The level that brings each hero and sidekick: clear it, and they join. Starters (Navie,
 * Pip and Mila) have none. Those the story meets join where the story meets them; everyone
 * else is spread along the road, a little closer together early on, in this order, so a new
 * hero turns up about every third unlock.
 */

const exitLevel = (id: string): number => JOURNEY_EXITS.find((e) => e.id === id)!.level!;

/** Met in the story: they join at the level that has their scene. */
const STORY_JOINS: Partial<Record<HeroId | SidekickId, number>> = {
  jepoy: exitLevel('meycauayan'),
  kiko: levelOf('m2-convoy'),
  kumpuni: levelOf('m2-convoy'),
  bumbo: levelOf('m3-finale'),
  walis: levelOf('tambubong'),
  barya: levelOf('balagtas'),
  sibat: levelOf('pulilan'),
  tala: levelOf('san-fernando'),
  ilaw: levelOf('angeles'),
  maso: levelOf('dau'),
};

/** Everyone else, in the order they join along the road. */
const ALONG_THE_ROAD: readonly (HeroId | SidekickId)[] = [
  'bantay', 'tarsi', 'berto', 'bibing', 'kawayan', 'sinta', 'parolito', 'gearo', 'ligaya',
  'kalaw', 'silaw', 'hiraya', 'ulap', 'kape', 'amihan', 'sago', 'sampy', 'nico',
  'kono', 'silip', 'kidlat', 'bitu', 'duwi', 'alon', 'saranggola', 'kislap', 'tiko',
  'piko', 'dahon', 'ningning', 'radyo', 'simoy', 'hamog', 'sikat', 'ginto', 'tali',
];

function build(): Record<HeroId | SidekickId, number | null> {
  const out = { navie: null, pip: null, mila: null } as Record<HeroId | SidekickId, number | null>;
  Object.assign(out, STORY_JOINS);
  const levels = spreadLevels(ALONG_THE_ROAD.length, new Set(Object.values(STORY_JOINS)), 2, 99);
  ALONG_THE_ROAD.forEach((id, i) => {
    out[id] = levels[i];
  });
  return out;
}

/** Clear this level and they join; null: on the team from the start. */
export const UNLOCK_LEVELS: Readonly<Record<HeroId | SidekickId, number | null>> = build();
