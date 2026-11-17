import { MISSIONS } from './mission';
import { NLEX_EXITS, PLANNED_MISSIONS } from './route';
import type { SaveData } from './save';

/**
 * The NLEX campaign: the 18 mainline stops (core/route.ts), which missions are open, and the
 * progress summary. Stops are themes for made-up missions, never claims about real incidents.
 */

export interface NlexStop {
  id: string;
  name: string;
  /** What happens there in the game. */
  theme: string;
  /** The first playable mission at the stop, if there is one. */
  missionId: string | null;
}

/** Every stop, south to north, with its first playable mission. */
export const NLEX_STOPS: readonly NlexStop[] = NLEX_EXITS.map((e) => ({
  id: e.id,
  name: e.name,
  theme: e.theme,
  missionId: e.missions.find((id) => MISSIONS.some((m) => m.id === id)) ?? null,
}));

/** What has to be done first. The Gridlock opens the line; the hornbill expedition is open from the start. */
const NEEDS: Record<string, string | null> = {
  'nlex-gridlock': null,
  'hornbill-homecoming': null,
};

export const missionOpen = (save: SaveData, missionId: string): boolean => {
  const need = missionId in NEEDS ? NEEDS[missionId] : 'nlex-gridlock';
  return need === null || save.missions[need] !== undefined;
};

/** Done, playable now, waiting on the Gridlock, or not built yet. */
export type MissionState = 'done' | 'open' | 'locked' | 'dev';

export function missionState(save: SaveData, missionId: string): MissionState {
  if (!MISSIONS.some((m) => m.id === missionId)) {
    return 'dev';
  }
  if (save.missions[missionId] !== undefined) {
    return 'done';
  }
  return missionOpen(save, missionId) ? 'open' : 'locked';
}

/** A stop is cleared once any of its missions is done. */
export const stopCleared = (save: SaveData, stopId: string): boolean => (NLEX_EXITS.find((e) => e.id === stopId)?.missions ?? []).some((id) => save.missions[id] !== undefined);

export const nlexMissions = MISSIONS.filter((m) => m.kind === 'nlex');

/** Optional finds at a mission: bonus pickups are saved as clues named bonus-<mission>-<n>. */
export const bonusFound = (save: SaveData, missionId: string): number => save.clues.filter((c) => c.startsWith(`bonus-${missionId}-`)).length;

export interface Progress {
  savedKg: number;
  missionsDone: number;
  nlexDone: number;
  nlexTotal: number;
  stopsCleared: number;
  stopsTotal: number;
  /** Missions on the map, built or not, and how many of them can be played. */
  campaignMissions: number;
  playable: number;
  animals: number;
  species: number;
  habitats: number;
  environment: number;
  ecoUpgrades: number;
  achievements: number;
}

/** The progress summary: each measure on its own, from the save. */
export function progress(save: SaveData, ecoUpgradeIds: readonly string[]): Progress {
  const records = Object.values(save.missions);
  const onMap = NLEX_EXITS.flatMap((e) => e.missions);
  return {
    /* Each mission's best result counts once. A plan worse than the baseline counts against the total. */
    savedKg: records.reduce((a, r) => a + r.bestSavedKg, 0),
    missionsDone: records.length,
    nlexDone: nlexMissions.filter((m) => save.missions[m.id] !== undefined).length,
    nlexTotal: nlexMissions.length,
    stopsCleared: NLEX_EXITS.filter((e) => stopCleared(save, e.id)).length,
    stopsTotal: NLEX_EXITS.length,
    campaignMissions: onMap.length,
    playable: onMap.filter((id) => !PLANNED_MISSIONS.some((p) => p.id === id)).length,
    animals: save.animalsAssisted.length,
    species: save.speciesAssisted.length,
    habitats: save.habitatsRestored.length,
    environment: save.environmentObjectives.length,
    ecoUpgrades: save.upgrades.filter((u) => ecoUpgradeIds.includes(u)).length,
    achievements: save.achievements.length,
  };
}
