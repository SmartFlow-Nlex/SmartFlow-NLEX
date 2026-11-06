import { MISSIONS } from './missions';
import { ARAYAT_STOPS } from './moods';
import { HERO_DEFS, SIDEKICK_DEFS, type UnlockRule } from './roster';
import { HEROES, JOURNEY, SIDEKICKS, TALLY_KEYS, type CounterId, type HeroId, type SaveData, type SidekickId, type Tally } from './types';

/**
 * Who has been earned. Everyone joins at a level (core/unlockLevels.ts): clear it and they
 * are on the team. Every rule reads a number the save already holds, so
 * working them out twice changes nothing: reopening a screen, replaying an event
 * or loading a save can never award the same character again, and nothing is
 * ever taken away. Progress to the next unlock is shown from the same numbers.
 */

/** The furthest level cleared, 0 before the first. Levels are played in order, so this is how far along the road you are. */
export function levelsCleared(save: SaveData): number {
  let furthest = 0;
  JOURNEY.forEach((id, i) => {
    if (save.missions[id]?.completed === true) {
      furthest = i + 1;
    }
  });
  return furthest;
}

export function counterValue(save: SaveData, counter: CounterId): number {
  switch (counter) {
    case 'levels':
      return levelsCleared(save);
    case 'postcards':
      return JOURNEY.filter((id) => save.missions[id]?.foundPostcard === true && MISSIONS[id].postcard !== null).length;
    case 'arayatPostcards':
      return ARAYAT_STOPS.filter((id) => save.missions[id]?.foundPostcard === true).length;
    case 'workshop':
      return Object.values(save.upgrades).reduce<number>((sum, level) => sum + (level ?? 0), 0);
    case 'km':
      return Math.floor(save.tally.metres / 1000);
    case 'endlessBest':
      return save.endless.bestDistance;
    case 'barkadas':
      return Object.values(save.friendship).filter((runs) => (runs ?? 0) >= FRIENDSHIP_LEVELS[1].runs).length;
    default:
      return save.tally[counter];
  }
}

export interface UnlockProgress {
  value: number;
  target: number;
  text: string;
  done: boolean;
}

export function ruleProgress(save: SaveData, rule: UnlockRule): UnlockProgress {
  const value = counterValue(save, rule.counter);
  return { value: Math.min(value, rule.target), target: rule.target, text: rule.text, done: value >= rule.target };
}

/** Who is closest to joining: the results screen's "what next". Bigger share first; nobody already earned. */
export function nextUnlocks(save: SaveData, count: number): { kind: 'hero' | 'sidekick'; id: HeroId | SidekickId; name: string; progress: UnlockProgress }[] {
  const list: { kind: 'hero' | 'sidekick'; id: HeroId | SidekickId; name: string; progress: UnlockProgress }[] = [];
  for (const id of HEROES) {
    const rule = heroRule(id);
    if (rule !== null && !save.heroes.includes(id)) {
      list.push({ kind: 'hero', id, name: HERO_DEFS[id].name, progress: ruleProgress(save, rule) });
    }
  }
  for (const id of SIDEKICKS) {
    const rule = sidekickRule(id);
    if (rule !== null && save.sidekicks[id] === undefined) {
      list.push({ kind: 'sidekick', id, name: SIDEKICK_DEFS[id].name, progress: ruleProgress(save, rule) });
    }
  }
  return list.sort((a, b) => b.progress.value / b.progress.target - a.progress.value / a.progress.target).slice(0, count);
}

/** What joining at a level asks for. */
export function levelRule(level: number | null): UnlockRule | null {
  return level === null ? null : { counter: 'levels', target: level, text: `Clear Level ${level}` };
}

export function heroRule(id: HeroId): UnlockRule | null {
  return levelRule(HERO_DEFS[id].unlock.level);
}

export function sidekickRule(id: SidekickId): UnlockRule | null {
  return levelRule(SIDEKICK_DEFS[id].unlock.level);
}

/** Adds whoever has been earned to the save; a reveal is queued for each. Idempotent. */
export function applyUnlocks(save: SaveData): { save: SaveData; heroes: HeroId[]; sidekicks: SidekickId[] } {
  const heroes = HEROES.filter((id) => {
    const rule = heroRule(id);
    return rule !== null && !save.heroes.includes(id) && counterValue(save, rule.counter) >= rule.target;
  });
  const sidekicks = SIDEKICKS.filter((id) => {
    const rule = sidekickRule(id);
    return rule !== null && save.sidekicks[id] === undefined && counterValue(save, rule.counter) >= rule.target;
  });
  if (heroes.length === 0 && sidekicks.length === 0) {
    return { save, heroes, sidekicks };
  }
  const nextSidekicks = { ...save.sidekicks };
  for (const id of sidekicks) {
    nextSidekicks[id] = { xp: 0, evolved: false };
  }
  return {
    save: {
      ...save,
      heroes: [...save.heroes, ...heroes],
      sidekicks: nextSidekicks,
      reveals: [...save.reveals, ...heroes.map((id) => `hero:${id}`), ...sidekicks.map((id) => `sidekick:${id}`)],
    },
    heroes,
    sidekicks,
  };
}

/** Adds a run's numbers to the running totals. */
export function addTally(total: Tally, run: Tally | undefined): Tally {
  if (run === undefined) {
    return total;
  }
  const out = { ...total };
  for (const key of TALLY_KEYS) {
    out[key] += run[key] ?? 0;
  }
  return out;
}

/** Friendship: runs driven together. Purely cosmetic: a level name, and the charms below. */
export const FRIENDSHIP_LEVELS: readonly { runs: number; name: string }[] = [
  { runs: 3, name: 'Road friends' },
  { runs: 10, name: 'Barkada' },
  { runs: 25, name: 'Family' },
];

export function friendshipLevel(runs: number): { level: number; name: string; next: number | null } {
  let level = 0;
  let name = 'New face';
  for (const step of FRIENDSHIP_LEVELS) {
    if (runs >= step.runs) {
      level += 1;
      name = step.name;
    }
  }
  return { level, name, next: FRIENDSHIP_LEVELS[level]?.runs ?? null };
}

export interface CharmDef {
  id: 'parol' | 'sampaguita' | 'token';
  name: string;
  how: string;
}

/** Travel charms that hang in the garage. They change nothing on the road. */
export const CHARMS: readonly CharmDef[] = [
  { id: 'token', name: 'Brass road token', how: 'Finish 10 road goals' },
  { id: 'sampaguita', name: 'Sampaguita garland', how: 'Become Road friends with anyone' },
  { id: 'parol', name: 'Little parol', how: 'Find 8 postcards' },
];

export function earnedCharms(save: SaveData): CharmDef['id'][] {
  const out: CharmDef['id'][] = [];
  if (save.tally.goals >= 10) {
    out.push('token');
  }
  if (Object.values(save.friendship).some((runs) => (runs ?? 0) >= FRIENDSHIP_LEVELS[0].runs)) {
    out.push('sampaguita');
  }
  if (counterValue(save, 'postcards') >= 8) {
    out.push('parol');
  }
  return out;
}
