import { MISSIONS } from './mission';
import type { SaveData } from './save';

/**
 * The NLEX Operations Board: a stylised line of stops, south to north in their real
 * order. Stops are themes for made-up missions, never claims about real incidents.
 * Two stops have no mission yet, and say so.
 */

export interface NlexStop {
  id: string;
  name: string;
  /** What happens there in the game. */
  theme: string;
  missionId: string | null;
}

export const NLEX_STOPS: readonly NlexStop[] = [
  { id: 'balintawak', name: 'Balintawak', theme: 'Start of the line: Navie’s briefing on NLEX operations', missionId: null },
  { id: 'valenzuela', name: 'Valenzuela', theme: 'Community environmental missions', missionId: 'nlex-river' },
  { id: 'bocaue', name: 'Bocaue', theme: 'Toll plaza and traffic flow', missionId: 'nlex-gridlock' },
  { id: 'san-fernando', name: 'San Fernando', theme: 'Eco facility and support missions', missionId: 'nlex-eco' },
  { id: 'angeles', name: 'Angeles', theme: 'Transport and conservation logistics', missionId: null },
  { id: 'dau', name: 'Dau', theme: 'The final NLEX challenge', missionId: null },
];

/** What has to be done first. The Gridlock opens the line; the hornbill expedition is open from the start. */
const NEEDS: Record<string, string | null> = {
  'nlex-gridlock': null,
  'hornbill-homecoming': null,
  'nlex-river': 'nlex-gridlock',
  'nlex-eco': 'nlex-gridlock',
};

export const missionOpen = (save: SaveData, missionId: string): boolean => {
  const need = NEEDS[missionId];
  return need === null || need === undefined || save.missions[need] !== undefined;
};

export const nlexMissions = MISSIONS.filter((m) => m.kind === 'nlex');

export interface Progress {
  savedKg: number;
  missionsDone: number;
  nlexDone: number;
  nlexTotal: number;
  animals: number;
  species: number;
  habitats: number;
  environment: number;
  ecoUpgrades: number;
}

/** The Environmental Progress Dashboard: each measure on its own, from the save. */
export function progress(save: SaveData, ecoUpgradeIds: readonly string[]): Progress {
  const records = Object.values(save.missions);
  return {
    /* Each mission's best result counts once. A plan worse than the baseline counts against the total. */
    savedKg: records.reduce((a, r) => a + r.bestSavedKg, 0),
    missionsDone: records.length,
    nlexDone: nlexMissions.filter((m) => save.missions[m.id] !== undefined).length,
    nlexTotal: nlexMissions.length,
    animals: save.animalsAssisted.length,
    species: save.speciesAssisted.length,
    habitats: save.habitatsRestored.length,
    environment: save.environmentObjectives.length,
    ecoUpgrades: save.upgrades.filter((u) => ecoUpgradeIds.includes(u)).length,
  };
}
