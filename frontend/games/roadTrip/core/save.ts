import {
  ALL_MISSIONS,
  DIFFICULTIES,
  HEROES,
  SIDEKICKS,
  UPGRADES,
  type EndlessRecord,
  type HeroId,
  type Loadout,
  type MissionId,
  type MissionRecord,
  type SaveData,
  type Settings,
  type SidekickId,
  type SidekickProgress,
} from './types';
import { SIDEKICK_DEFS } from './roster';

/**
 * The save: one JSON object per account, written whole. What survives a
 * reload is everything here - completed missions, Bolts, team, upgrades,
 * settings. A mission interrupted halfway is not saved; it restarts.
 *
 * Anything read back is validated field by field: a missing or wrong-typed
 * field falls back to its default instead of breaking the game, and a save
 * that is not JSON at all is reported so the host can keep a copy of it.
 */

/** 2 = Tollbound Heroes (heroes, sidekicks, Gear Cores, Endless). 1 = Navie's Road Trip. */
export const SAVE_VERSION = 2;
/** How many recent run ids are kept for duplicate checks. */
export const PROCESSED_RUNS_KEPT = 64;

export const DEFAULT_SETTINGS: Settings = {
  difficulty: 'standard',
  gameSpeed: 1,
  warningBoost: 0,
  autoAbility: false,
  steering: 'drag',
  sensitivity: 1,
  abilitySide: 'right',
  master: 0.8,
  music: 0.5,
  effects: 0.8,
  voices: 0.7,
  textScale: 1,
  reduceMotion: false,
  hazardOutlines: false,
  textSpeed: 'typewriter',
};

/** Every new player starts with Navie and two sidekicks: one that attacks, one that supports. */
export const STARTER_LOADOUT: Loadout = { hero: 'navie', sidekicks: ['pip', 'mila'] };

export function defaultSave(now: Date = new Date()): SaveData {
  const stamp = now.toISOString();
  return {
    version: SAVE_VERSION,
    revision: 0,
    createdAt: stamp,
    updatedAt: stamp,
    bolts: 0,
    lifetimeBolts: 0,
    gearCores: 0,
    missions: {},
    scenesSeen: [],
    heroes: ['navie'],
    sidekicks: { pip: { xp: 0, evolved: false }, mila: { xp: 0, evolved: false } },
    loadout: { ...STARTER_LOADOUT, sidekicks: [...STARTER_LOADOUT.sidekicks] },
    upgrades: {},
    tutorialDone: false,
    processedRuns: [],
    garageEvents: [],
    endless: { bestDistance: 0, bestScore: 0, runs: 0, milestones: [] },
    settings: { ...DEFAULT_SETTINGS },
  };
}

export type SaveIssue = 'empty' | 'not-json' | 'not-object' | 'newer-version' | 'fields-repaired';

export interface LoadedSave {
  save: SaveData;
  /** Empty when the save was read cleanly. */
  issues: SaveIssue[];
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const num = (value: unknown, fallback: number, min: number, max: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

const int = (value: unknown, fallback: number, min: number, max: number): number =>
  Math.round(num(value, fallback, min, max));

const oneOf = <T extends string | number>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

const strings = (value: unknown, limit: number): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(-limit) : [];

function readSettings(raw: unknown, repaired: { value: boolean }): Settings {
  const d = DEFAULT_SETTINGS;
  if (!isObject(raw)) {
    repaired.value = true;
    return { ...d };
  }
  const settings: Settings = {
    difficulty: oneOf(raw.difficulty, DIFFICULTIES, d.difficulty),
    gameSpeed: oneOf(raw.gameSpeed, [0.7, 0.85, 1], d.gameSpeed),
    warningBoost: oneOf(raw.warningBoost, [0, 0.5, 1], d.warningBoost),
    autoAbility: typeof raw.autoAbility === 'boolean' ? raw.autoAbility : d.autoAbility,
    steering: oneOf(raw.steering, ['drag', 'lanes'] as const, d.steering),
    sensitivity: num(raw.sensitivity, d.sensitivity, 0.5, 2),
    abilitySide: oneOf(raw.abilitySide, ['left', 'right'] as const, d.abilitySide),
    master: num(raw.master, d.master, 0, 1),
    music: num(raw.music, d.music, 0, 1),
    effects: num(raw.effects, d.effects, 0, 1),
    voices: num(raw.voices, d.voices, 0, 1),
    textScale: oneOf(raw.textScale, [1, 1.2, 1.4], d.textScale),
    reduceMotion: typeof raw.reduceMotion === 'boolean' ? raw.reduceMotion : d.reduceMotion,
    hazardOutlines: typeof raw.hazardOutlines === 'boolean' ? raw.hazardOutlines : d.hazardOutlines,
    textSpeed: oneOf(raw.textSpeed, ['instant', 'typewriter'] as const, d.textSpeed),
  };
  if (Object.keys(d).some((key) => (raw as Record<string, unknown>)[key] !== (settings as unknown as Record<string, unknown>)[key])) {
    repaired.value = true;
  }
  return settings;
}

function readMission(raw: unknown): MissionRecord | null {
  if (!isObject(raw)) {
    return null;
  }
  const completed = raw.completed === true;
  return {
    completed,
    clears: int(raw.clears, completed ? 1 : 0, 0, 1_000_000),
    bestScore: int(raw.bestScore, 0, 0, 1_000_000),
    bestDents: completed && typeof raw.bestDents === 'number' ? int(raw.bestDents, 0, 0, 99) : null,
    foundPostcard: raw.foundPostcard === true,
  };
}

/**
 * Upgrades older saves, one version step at a time, before anything is read.
 *
 * 1 -> 2 (Navie's Road Trip -> Tollbound Heroes): the old team board (Jepoy
 * and Kiko as support/assist friends) becomes the hero roster - everyone
 * recruited becomes a playable hero; the sidekicks a player would have earned
 * by their completed missions are granted (Pip and Mila from the start,
 * Bantay after Mission 1, Kumpuni after Mission 2, Bumbo after Mission 3,
 * Silip for a Snapshot clear);
 * Gear Cores are granted for completed missions as if earned then; Bolts,
 * missions, upgrades, postcards, scenes and settings carry over unchanged.
 */
function migrate(raw: Record<string, unknown>): Record<string, unknown> {
  let out = raw;
  let version = declaredVersion(raw);
  if (version <= 1) {
    const team = isObject(out.team) ? out.team : {};
    const recruited = strings(team.recruited, 8).filter((id) => id === 'jepoy' || id === 'kiko');
    const missions = isObject(out.missions) ? out.missions : {};
    const done = (id: string): boolean => isObject(missions[id]) && (missions[id] as Record<string, unknown>).completed === true;
    const sidekicks: Record<string, SidekickProgress> = { pip: { xp: 0, evolved: false }, mila: { xp: 0, evolved: false } };
    if (done('m1-garage')) {
      sidekicks.bantay = { xp: 0, evolved: false };
    }
    if (done('m2-convoy')) {
      sidekicks.kumpuni = { xp: 0, evolved: false };
    }
    if (done('m3-finale')) {
      sidekicks.bumbo = { xp: 0, evolved: false };
    }
    if (done('snapshot')) {
      sidekicks.silip = { xp: 0, evolved: false };
    }
    const cores = (done('m1-garage') ? 1 : 0) + (done('m2-convoy') ? 2 : 0) + (done('m3-finale') ? 3 : 0) + (done('snapshot') ? 1 : 0);
    // The old Jepoy-arrives / Kiko-arrives garage moments stay seen.
    out = {
      ...out,
      heroes: ['navie', ...recruited],
      sidekicks,
      loadout: { hero: 'navie', sidekicks: ['pip', 'mila'] },
      gearCores: cores,
      endless: { bestDistance: 0, bestScore: 0, runs: 0, milestones: [] },
    };
    // A returning player hears once, in the garage, what is new (screens.ts: 'tollbound-intro').
    if (Object.keys(missions).length > 0) {
      out.garageEvents = [...strings(out.garageEvents, 63), 'tollbound-intro-due'];
    }
    delete (out as Record<string, unknown>).team;
    version = 2;
  }
  return { ...out, version };
}

/**
 * The save's version. A missing or non-numeric one means version 1 - unless the
 * save already has version-2 fields (then a lost version number must not send
 * it through the 1 -> 2 migration, which would reset heroes and evolutions).
 */
function declaredVersion(raw: Record<string, unknown>): number {
  if (typeof raw.version === 'number') {
    return raw.version;
  }
  if (typeof raw.version === 'string' && /^\d+$/.test(raw.version)) {
    return Number(raw.version);
  }
  return isObject(raw.sidekicks) || Array.isArray(raw.heroes) || typeof raw.gearCores === 'number' ? 2 : 1;
}

/** Reads whatever the host stored - a string, parsed JSON, or nothing. */
export function loadSave(stored: unknown, now: Date = new Date()): LoadedSave {
  if (stored === null || stored === undefined || stored === '') {
    return { save: defaultSave(now), issues: ['empty'] };
  }
  let raw: unknown = stored;
  if (typeof stored === 'string') {
    try {
      raw = JSON.parse(stored);
    } catch {
      return { save: defaultSave(now), issues: ['not-json'] };
    }
  }
  if (!isObject(raw)) {
    return { save: defaultSave(now), issues: ['not-object'] };
  }
  const version = declaredVersion(raw);
  if (version > SAVE_VERSION) {
    // Written by a newer app. Reading it with old rules would drop what it
    // added, so the game starts fresh and the host keeps the original.
    return { save: defaultSave(now), issues: ['newer-version'] };
  }

  const source = migrate(raw);
  const repaired = { value: version !== SAVE_VERSION };
  const fallback = defaultSave(now);

  const missions: SaveData['missions'] = {};
  if (isObject(source.missions)) {
    for (const id of ALL_MISSIONS) {
      const record = readMission(source.missions[id]);
      if (record !== null) {
        missions[id] = record;
      }
    }
  } else {
    repaired.value = true;
  }

  const heroes = [...new Set(['navie', ...strings(source.heroes, 8)])].filter((id): id is HeroId => (HEROES as readonly string[]).includes(id));
  const sidekicks: SaveData['sidekicks'] = {};
  if (isObject(source.sidekicks)) {
    for (const id of SIDEKICKS) {
      const entry = source.sidekicks[id];
      if (isObject(entry)) {
        sidekicks[id] = { xp: int(entry.xp, 0, 0, 1_000_000), evolved: entry.evolved === true };
      }
    }
  } else {
    repaired.value = true;
  }
  if (sidekicks.pip === undefined) {
    sidekicks.pip = { xp: 0, evolved: false };
  }
  if (sidekicks.mila === undefined) {
    sidekicks.mila = { xp: 0, evolved: false };
  }
  // Unlocks follow from progress: anyone a finished mission earned is on the roster, whatever the
  // save's history (idempotent - never removes, never adds XP).
  const cleared = (id: MissionId): boolean => missions[id]?.completed === true;
  const endlessBest = isObject(source.endless) ? int(source.endless.bestDistance, 0, 0, 10_000_000) : 0;
  const earnedHeroes: [HeroId, boolean][] = [['jepoy', cleared('m1-garage')], ['kiko', cleared('m2-convoy')]];
  for (const [id, earned] of earnedHeroes) {
    if (earned && !heroes.includes(id)) {
      heroes.push(id);
      repaired.value = true;
    }
  }
  const earnedSidekicks: [SidekickId, boolean][] = SIDEKICKS.map((id) => {
    const after = SIDEKICK_DEFS[id].unlock.after;
    return [id, after === 'endless-1000' ? cleared('snapshot') || endlessBest >= 1000 : after !== null && cleared(after)];
  });
  for (const [id, earned] of earnedSidekicks) {
    if (earned && sidekicks[id] === undefined) {
      sidekicks[id] = { xp: 0, evolved: false };
      repaired.value = true;
    }
  }
  const loadoutRaw = isObject(source.loadout) ? source.loadout : {};
  const hero: HeroId = heroes.includes(loadoutRaw.hero as HeroId) ? (loadoutRaw.hero as HeroId) : 'navie';
  const pick = (value: unknown): SidekickId | null =>
    typeof value === 'string' && sidekicks[value as SidekickId] !== undefined ? (value as SidekickId) : null;
  const slots = Array.isArray(loadoutRaw.sidekicks) ? loadoutRaw.sidekicks : [];
  let first = pick(slots[0]);
  let second = pick(slots[1]);
  if (first !== null && first === second) {
    // One sidekick cannot fill both slots.
    second = null;
    repaired.value = true;
  }
  if (first === null && second === null && !Array.isArray(loadoutRaw.sidekicks)) {
    first = 'pip';
    second = 'mila';
  }
  const endlessRaw = isObject(source.endless) ? source.endless : {};
  const endless: EndlessRecord = {
    bestDistance: int(endlessRaw.bestDistance, 0, 0, 10_000_000),
    bestScore: int(endlessRaw.bestScore, 0, 0, 100_000_000),
    runs: int(endlessRaw.runs, 0, 0, 1_000_000),
    milestones: Array.isArray(endlessRaw.milestones) ? [...new Set(endlessRaw.milestones.filter((m): m is number => typeof m === 'number'))] : [],
  };

  const upgrades: SaveData['upgrades'] = {};
  if (isObject(source.upgrades)) {
    for (const id of UPGRADES) {
      const level = int(source.upgrades[id], 0, 0, 2);
      if (level > 0) {
        upgrades[id] = level;
      }
    }
  }

  const save: SaveData = {
    version: SAVE_VERSION,
    revision: int(source.revision, 0, 0, Number.MAX_SAFE_INTEGER),
    createdAt: typeof source.createdAt === 'string' ? source.createdAt : fallback.createdAt,
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : fallback.updatedAt,
    bolts: int(source.bolts, 0, 0, 10_000_000),
    lifetimeBolts: int(source.lifetimeBolts, 0, 0, 10_000_000),
    gearCores: int(source.gearCores, 0, 0, 100_000),
    missions,
    scenesSeen: [...new Set(strings(source.scenesSeen, 64))],
    heroes,
    sidekicks,
    loadout: { hero, sidekicks: [first, second] },
    upgrades,
    tutorialDone: source.tutorialDone === true,
    processedRuns: strings(source.processedRuns, PROCESSED_RUNS_KEPT),
    garageEvents: [...new Set(strings(source.garageEvents, 64))],
    endless,
    settings: readSettings(source.settings, repaired),
  };
  return { save, issues: repaired.value ? ['fields-repaired'] : [] };
}

export function serializeSave(save: SaveData): string {
  return JSON.stringify(save);
}

/** A copy with the revision raised and the time stamped - call once per committed change. */
export function bumpRevision(save: SaveData, now: Date = new Date()): SaveData {
  return { ...save, revision: save.revision + 1, updatedAt: now.toISOString() };
}
