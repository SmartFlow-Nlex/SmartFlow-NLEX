import { CALCULATION_VERSION, type Savings } from './emissions';
import { HORNBILL_MISSION, missionById, restoreRun, type MissionDef, type MissionRun } from './mission';
import { ACHIEVEMENT_POINTS, ACHIEVEMENTS, COLLECTIBLES, DISCOVERIES, DISCOVERY_POINTS, GEAR, newAchievements, PATCH_POINTS, SIDE_QUESTS, sideQuestDone, type AchievementView, type SideQuest } from './progression';
import type { Plan } from './transport';

/**
 * Progress: one JSON object per account, written whole, with a rising revision. The
 * measures stay separate on purpose: individual animals, species, habitat, simulated
 * emissions and Guardian Points never convert into one another.
 *
 * Completing a mission is one atomic step, keyed by run id: retrying a save, or
 * replaying the mission, can never count an animal or a reward twice.
 */

/**
 * 2 added NLEX missions: environment objectives, and records without a transport plan.
 * 3 added patches, wildlife observations, side quests, workshop gear and achievements.
 * Older saves load as they are, with those lists empty.
 */
export const SAVE_VERSION = 3;
const RUNS_KEPT = 64;

export type TextScale = 1 | 1.2 | 1.4;
export type Graphics = 'smooth' | 'detailed';

export interface Settings {
  sound: boolean;
  music: boolean;
  reduceMotion: boolean;
  textScale: TextScale;
  graphics: Graphics;
  subtitles: boolean;
  lead: string;
  /** The arrow and the marker to the next objective. Off, the hint button still shows the way. */
  guide: boolean;
}

/** One simulated comparison inside a mission: the plaza, the depot, the transport. */
export interface SimPart {
  id: string;
  label: string;
  baselineKg: number;
  planKg: number;
}

export interface MissionRecord {
  completedAt: string;
  plays: number;
  /** Best transport plan so far, kept apart from story progress. Null for a mission with no dispatch. */
  bestPlan: Plan | null;
  /** The other choice the best result came from: a lane setting, or the depot's upgrades. */
  bestChoice: string | null;
  /** How the best total splits up. */
  bestParts: SimPart[];
  bestPlanKg: number;
  baselineKg: number;
  bestSavedKg: number;
  /** Comparisons are only meaningful within one calculation version. */
  calculationVersion: string;
}

export interface SaveData {
  version: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
  active: MissionRun | null;
  missions: Record<string, MissionRecord>;
  /** Unique story individuals whose assistance objectives were completed. */
  animalsAssisted: string[];
  /** Distinct species with completed objectives. */
  speciesAssisted: string[];
  /** Named habitat objectives completed. */
  habitatsRestored: string[];
  /** NLEX environmental objectives completed: kept apart from wildlife habitat. */
  environmentObjectives: string[];
  /** A fictional progression currency: never converts into kg or animals. */
  guardianPoints: number;
  upgrades: string[];
  clues: string[];
  nicknames: Record<string, string>;
  /** Self-reported actions. Labelled participation badges, never measured reductions. */
  badges: string[];
  coachSeen: string[];
  processedRuns: string[];
  /** Guardian patches found, by id. */
  collectibles: string[];
  /** Wildlife observed, by id. */
  discoveries: string[];
  /** Side quest progress, and the quests finished. */
  sideFlags: string[];
  sideQuests: string[];
  gear: string[];
  achievements: string[];
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = { sound: true, music: true, reduceMotion: false, textScale: 1, graphics: 'detailed', subtitles: true, lead: 'dayo', guide: true };

export function defaultSave(now: Date = new Date()): SaveData {
  const stamp = now.toISOString();
  return {
    version: SAVE_VERSION,
    revision: 0,
    createdAt: stamp,
    updatedAt: stamp,
    active: null,
    missions: {},
    animalsAssisted: [],
    speciesAssisted: [],
    habitatsRestored: [],
    environmentObjectives: [],
    guardianPoints: 0,
    upgrades: [],
    clues: [],
    nicknames: {},
    badges: [],
    coachSeen: [],
    processedRuns: [],
    collectibles: [],
    discoveries: [],
    sideFlags: [],
    sideQuests: [],
    gear: [],
    achievements: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

export type SaveIssue = 'empty' | 'not-json' | 'not-object' | 'newer-version';

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, fallback: number, min: number, max: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback);
const strings = (v: unknown, keep = 512): string[] => (Array.isArray(v) ? Array.from(new Set(v.filter((s): s is string => typeof s === 'string'))).slice(-keep) : []);
const oneOf = <T extends string | number>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);

export function loadSave(stored: unknown, now: Date = new Date()): { save: SaveData; issues: SaveIssue[] } {
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
  if ((typeof raw.version === 'number' ? raw.version : 0) > SAVE_VERSION) {
    return { save: defaultSave(now), issues: ['newer-version'] };
  }
  const fallback = defaultSave(now);
  const missions: Record<string, MissionRecord> = {};
  if (isObject(raw.missions)) {
    for (const [id, value] of Object.entries(raw.missions)) {
      const plan = isObject(value) && isObject(value.bestPlan) && typeof value.bestPlan.fleetId === 'string' && typeof value.bestPlan.routeId === 'string' && typeof value.bestPlan.departureId === 'string' ? { fleetId: value.bestPlan.fleetId, routeId: value.bestPlan.routeId, departureId: value.bestPlan.departureId } : null;
      const def = missionById(id);
      /* A mission with a dispatch must have its plan; the others have none. */
      if (def !== null && isObject(value) && (plan !== null || !needsPlan(def))) {
        const parts: SimPart[] = Array.isArray(value.bestParts)
          ? value.bestParts.filter(isObject).filter((p) => typeof p.id === 'string' && typeof p.label === 'string').map((p) => ({ id: p.id as string, label: p.label as string, baselineKg: num(p.baselineKg, 0, 0, 1e7), planKg: num(p.planKg, 0, 0, 1e7) }))
          : [];
        missions[id] = {
          completedAt: typeof value.completedAt === 'string' ? value.completedAt : fallback.createdAt,
          plays: Math.round(num(value.plays, 1, 1, 1e6)),
          bestPlan: plan,
          bestChoice: typeof value.bestChoice === 'string' ? value.bestChoice : null,
          bestParts: parts,
          bestPlanKg: num(value.bestPlanKg, 0, 0, 1e7),
          baselineKg: num(value.baselineKg, 0, 0, 1e7),
          bestSavedKg: num(value.bestSavedKg, 0, -1e7, 1e7),
          calculationVersion: typeof value.calculationVersion === 'string' ? value.calculationVersion : CALCULATION_VERSION,
        };
      }
    }
  }
  const s = isObject(raw.settings) ? raw.settings : {};
  const d = DEFAULT_SETTINGS;
  const nicknames: Record<string, string> = {};
  if (isObject(raw.nicknames)) {
    for (const [k, v] of Object.entries(raw.nicknames)) {
      if (typeof v === 'string') {
        nicknames[k] = v.slice(0, 24);
      }
    }
  }
  const activeRaw = raw.active;
  const activeDef: MissionDef | null = isObject(activeRaw) && typeof activeRaw.missionId === 'string' ? missionById(activeRaw.missionId) : null;
  return {
    save: {
      version: SAVE_VERSION,
      revision: Math.round(num(raw.revision, 0, 0, Number.MAX_SAFE_INTEGER)),
      createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : fallback.createdAt,
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : fallback.updatedAt,
      active: activeDef === null ? null : restoreRun(activeDef, activeRaw),
      missions,
      animalsAssisted: strings(raw.animalsAssisted),
      speciesAssisted: strings(raw.speciesAssisted).slice(0, 100),
      habitatsRestored: strings(raw.habitatsRestored),
      environmentObjectives: strings(raw.environmentObjectives),
      guardianPoints: Math.round(num(raw.guardianPoints, 0, 0, 1e7)),
      upgrades: strings(raw.upgrades),
      clues: strings(raw.clues),
      nicknames,
      badges: strings(raw.badges),
      coachSeen: strings(raw.coachSeen),
      processedRuns: strings(raw.processedRuns, RUNS_KEPT),
      collectibles: strings(raw.collectibles).filter((id) => COLLECTIBLES.some((c) => c.id === id)),
      discoveries: strings(raw.discoveries).filter((id) => DISCOVERIES.some((d) => d.id === id)),
      sideFlags: strings(raw.sideFlags),
      sideQuests: strings(raw.sideQuests).filter((id) => SIDE_QUESTS.some((q) => q.id === id)),
      gear: strings(raw.gear).filter((id) => GEAR.some((g) => g.id === id)),
      achievements: strings(raw.achievements).filter((id) => ACHIEVEMENTS.some((a) => a.id === id)),
      settings: {
        sound: typeof s.sound === 'boolean' ? s.sound : d.sound,
        music: typeof s.music === 'boolean' ? s.music : d.music,
        reduceMotion: typeof s.reduceMotion === 'boolean' ? s.reduceMotion : d.reduceMotion,
        textScale: oneOf<TextScale>(s.textScale as TextScale, [1, 1.2, 1.4], d.textScale),
        graphics: oneOf<Graphics>(s.graphics as Graphics, ['smooth', 'detailed'], d.graphics),
        subtitles: typeof s.subtitles === 'boolean' ? s.subtitles : d.subtitles,
        lead: oneOf(s.lead, ['dayo', 'baging', 'sukat', 'awit'], d.lead),
        guide: typeof s.guide === 'boolean' ? s.guide : d.guide,
      },
    },
    issues: [],
  };
}

export const serializeSave = (save: SaveData): string => JSON.stringify(save);

export const bumpRevision = (save: SaveData, now: Date = new Date()): SaveData => ({ ...save, revision: save.revision + 1, updatedAt: now.toISOString() });

/** What a finished mission adds, reported separately for the results screen. */
export interface CompletionReport {
  duplicate: boolean;
  firstCompletion: boolean;
  newAnimals: string[];
  newSpecies: string[];
  newHabitats: string[];
  newObjectives: string[];
  points: number;
  newBest: boolean;
}

/** Missions whose results depend on a transport plan. */
export const needsPlan = (def: MissionDef): boolean => def.transport !== null || def.id === 'nlex-eco';

export interface MissionOutcome {
  baselineKg: number;
  planKg: number;
  savings: Savings;
  /** A lane setting or the depot's upgrades, as text. */
  choice?: string | null;
  parts?: SimPart[];
}

export function completeMission(save: SaveData, def: MissionDef, run: MissionRun, result: MissionOutcome, now: Date = new Date()): { save: SaveData; report: CompletionReport } {
  if (save.processedRuns.includes(run.runId) || (needsPlan(def) && run.plan === null)) {
    return { save, report: { duplicate: true, firstCompletion: false, newAnimals: [], newSpecies: [], newHabitats: [], newObjectives: [], points: 0, newBest: false } };
  }
  const was = save.missions[def.id];
  const first = was === undefined;
  const animals = def.storyIndividuals.map((i) => i.id).filter((id) => !save.animalsAssisted.includes(id));
  const species = def.speciesIds.filter((id) => !save.speciesAssisted.includes(id));
  const habitats = def.habitatObjectives.map((h) => h.id).filter((id) => !save.habitatsRestored.includes(id));
  const objectives = def.environmentObjectives.map((o) => o.id).filter((id) => !save.environmentObjectives.includes(id));
  const clueCount = run.flags.filter((f) => f.startsWith('clue:')).filter((f) => !save.clues.includes(f.slice(5))).length;
  let points = clueCount * def.rewards.perClue;
  if (first) {
    points += def.rewards.guardianPoints;
    if (run.flags.includes('channelRestored')) {
      points += def.rewards.optionalChannel;
    }
    if (result.savings.savedKg > 0) {
      points += def.rewards.plannedWell;
    }
  }
  const sameVersion = was !== undefined && was.calculationVersion === CALCULATION_VERSION;
  const newBest = !sameVersion || result.planKg < (was as MissionRecord).bestPlanKg;
  const record: MissionRecord = {
    completedAt: was?.completedAt ?? now.toISOString(),
    plays: (was?.plays ?? 0) + 1,
    bestPlan: newBest ? run.plan : (was as MissionRecord).bestPlan,
    bestChoice: newBest ? result.choice ?? null : (was as MissionRecord).bestChoice,
    bestParts: newBest ? result.parts ?? [] : (was as MissionRecord).bestParts,
    bestPlanKg: newBest ? result.planKg : (was as MissionRecord).bestPlanKg,
    baselineKg: result.baselineKg,
    bestSavedKg: newBest ? result.savings.savedKg : (was as MissionRecord).bestSavedKg,
    calculationVersion: CALCULATION_VERSION,
  };
  return {
    save: {
      ...save,
      active: save.active !== null && save.active.runId === run.runId ? null : save.active,
      missions: { ...save.missions, [def.id]: record },
      animalsAssisted: [...save.animalsAssisted, ...animals],
      speciesAssisted: [...save.speciesAssisted, ...species].slice(0, 100),
      habitatsRestored: [...save.habitatsRestored, ...habitats],
      environmentObjectives: [...save.environmentObjectives, ...objectives],
      guardianPoints: save.guardianPoints + points,
      clues: Array.from(new Set([...save.clues, ...run.flags.filter((f) => f.startsWith('clue:')).map((f) => f.slice(5))])),
      processedRuns: [...save.processedRuns, run.runId].slice(-RUNS_KEPT),
    },
    report: { duplicate: false, firstCompletion: first, newAnimals: animals, newSpecies: species, newHabitats: habitats, newObjectives: objectives, points, newBest },
  };
}

export interface Upgrade {
  id: string;
  title: string;
  blurb: string;
  cost: number;
  /** An eco upgrade becomes available once this mission is done. */
  unlockedBy?: string;
}

/** Station improvements. Spending points never changes any animal, habitat or emissions record. */
export const UPGRADES: readonly Upgrade[] = [
  { id: 'scope', title: 'Observation scope', blurb: 'A telescope on the tower, for watching the ridge from the station.', cost: 40 },
  { id: 'bunting', title: 'Community bunting', blurb: 'Colourful bunting across the plaza. The station looks lived in.', cost: 30 },
  { id: 'garden', title: 'Native flower beds', blurb: 'More beds in the demonstration garden, grown from local seed.', cost: 50 },
  { id: 'solar', title: 'Command Center solar roof', blurb: 'Panels on the workshop roof, as at the depot. Decorative: the Command Center’s own power is not modelled.', cost: 60, unlockedBy: 'nlex-eco' },
  { id: 'charger', title: 'E-trike charging bay', blurb: 'A charging bay by the gate, like the barangay’s. Decorative.', cost: 40, unlockedBy: 'nlex-river' },
  { id: 'lanes', title: 'Lane signal display', blurb: 'A working model of the plaza’s lane signals on the Operations Board. Decorative.', cost: 30, unlockedBy: 'nlex-gridlock' },
];

export const upgradeUnlocked = (save: SaveData, u: Upgrade): boolean => u.unlockedBy === undefined || save.missions[u.unlockedBy] !== undefined;

export function buyUpgrade(save: SaveData, id: string): SaveData | null {
  const upgrade = UPGRADES.find((u) => u.id === id);
  if (upgrade === undefined || !upgradeUnlocked(save, upgrade) || save.upgrades.includes(id) || save.guardianPoints < upgrade.cost) {
    return null;
  }
  return { ...save, guardianPoints: save.guardianPoints - upgrade.cost, upgrades: [...save.upgrades, id] };
}

export const firstMission = (): MissionDef => HORNBILL_MISSION;

/* ---- Patches, wildlife, side quests, gear and achievements: each granted once ---- */

/** A patch found. Finding it again, on a replay, gives nothing. */
export function collect(save: SaveData, id: string): { save: SaveData; added: boolean } {
  if (save.collectibles.includes(id) || !COLLECTIBLES.some((c) => c.id === id)) {
    return { save, added: false };
  }
  return { save: { ...save, collectibles: [...save.collectibles, id], guardianPoints: save.guardianPoints + PATCH_POINTS }, added: true };
}

export function discover(save: SaveData, id: string): { save: SaveData; added: boolean } {
  if (save.discoveries.includes(id) || !DISCOVERIES.some((d) => d.id === id)) {
    return { save, added: false };
  }
  return { save: { ...save, discoveries: [...save.discoveries, id], guardianPoints: save.guardianPoints + DISCOVERY_POINTS }, added: true };
}

/** One step of a side quest. The quest's points come once, when its last step is done. */
export function sideStep(save: SaveData, flag: string): { save: SaveData; completed: SideQuest | null } {
  const flags = save.sideFlags.includes(flag) ? save.sideFlags : [...save.sideFlags, flag];
  const quest = SIDE_QUESTS.find((q) => q.needs.includes(flag) && !save.sideQuests.includes(q.id) && sideQuestDone(flags, q)) ?? null;
  return {
    save: { ...save, sideFlags: flags, sideQuests: quest === null ? save.sideQuests : [...save.sideQuests, quest.id], guardianPoints: save.guardianPoints + (quest?.points ?? 0) },
    completed: quest,
  };
}

export function buyGear(save: SaveData, id: string): SaveData | null {
  const gear = GEAR.find((g) => g.id === id);
  if (gear === undefined || save.gear.includes(id) || save.guardianPoints < gear.cost) {
    return null;
  }
  return { ...save, guardianPoints: save.guardianPoints - gear.cost, gear: [...save.gear, id] };
}

export const NLEX_MISSION_IDS = ['nlex-gridlock', 'nlex-river', 'nlex-eco', 'nlex-delivery'];

export const achievementView = (save: SaveData): AchievementView => ({
  missions: Object.keys(save.missions),
  missionsBelowBaseline: Object.entries(save.missions).filter(([, r]) => r.bestSavedKg > 0).map(([id]) => id),
  collectibles: save.collectibles,
  discoveries: save.discoveries,
  sideQuests: save.sideQuests,
  gear: save.gear,
  nlexMissionIds: NLEX_MISSION_IDS,
});

/** Grants every achievement the save now qualifies for, once each. */
export function awardAchievements(save: SaveData): { save: SaveData; ids: string[] } {
  const ids = newAchievements(achievementView(save), save.achievements);
  if (ids.length === 0) {
    return { save, ids };
  }
  return { save: { ...save, achievements: [...save.achievements, ...ids], guardianPoints: save.guardianPoints + ids.length * ACHIEVEMENT_POINTS }, ids };
}
