/** Types shared by the simulation, the page and the React Native host. */
import { JOURNEY } from './levels';

/** The story missions: the road's beats, each now one of the hundred levels (core/levels.ts). */
export type StoryMissionId =
  | 'm1-garage'
  | 'm2-convoy'
  | 'm3-finale'
  | 'bocaue-interchange'
  | 'tambubong'
  | 'tabang'
  | 'balagtas'
  | 'sta-rita'
  | 'pulilan'
  | 'san-simon'
  | 'san-fernando'
  | 'mexico'
  | 'angeles'
  | 'dau'
  | 'sctex'
  | 'sta-ines';
/** A road level between the story missions: lv-2 to lv-99. */
export type LevelId = `lv-${number}`;
export type MissionId = StoryMissionId | LevelId | 'snapshot' | 'endless';
/** The whole story: one road, Balintawak to Sta. Ines, a hundred levels played in this order. */
export { JOURNEY } from './levels';
export const ALL_MISSIONS: readonly MissionId[] = [...JOURNEY, 'snapshot', 'endless'];

export type Difficulty = 'story' | 'relaxed' | 'standard' | 'expert';
export const DIFFICULTIES: readonly Difficulty[] = ['story', 'relaxed', 'standard', 'expert'];

/** The road machines the team un-jams: Haring (king), Prinsipe (prince) and Reyna (queen) Barrikada. */
export type MachineId = 'barrikada' | 'prinsipe' | 'reyna';
export type CharacterId = HeroId | MachineId | 'radio';
export type TeammateId = 'jepoy' | 'kiko';
export const TEAMMATES: readonly TeammateId[] = ['jepoy', 'kiko'];

export function isMachine(id: string): id is MachineId {
  return id === 'barrikada' || id === 'prinsipe' || id === 'reyna';
}

/** Tollbound Heroes: the playable heroes. */
export type HeroId = 'navie' | 'jepoy' | 'kiko' | 'berto' | 'ligaya' | 'hiraya' | 'sinta' | 'amihan' | 'kidlat' | 'nico' | 'alon' | 'tiko' | 'ningning' | 'simoy' | 'sikat' | 'tali';
export const HEROES: readonly HeroId[] = ['navie', 'jepoy', 'kiko', 'berto', 'ligaya', 'hiraya', 'sinta', 'amihan', 'kidlat', 'nico', 'alon', 'tiko', 'ningning', 'simoy', 'sikat', 'tali'];

/** The collectible sidekicks: small hovering vehicle-creatures that fly with the hero. */
export type SidekickId =
  | 'pip' | 'bumbo' | 'mila' | 'kumpuni' | 'bantay' | 'silip' | 'walis' | 'barya' | 'sibat' | 'tala' | 'ilaw' | 'maso'
  | 'parolito' | 'bibing' | 'kape' | 'sago' | 'sampy' | 'kawayan' | 'kalaw' | 'tarsi' | 'piko' | 'saranggola' | 'duwi' | 'silaw' | 'bitu' | 'gearo' | 'ulap'
  | 'kono' | 'kislap' | 'dahon' | 'radyo' | 'ginto' | 'hamog';
export const SIDEKICKS: readonly SidekickId[] = [
  'pip', 'bumbo', 'mila', 'kumpuni', 'bantay', 'silip', 'walis', 'barya', 'sibat', 'tala', 'ilaw', 'maso',
  'parolito', 'bibing', 'kape', 'sago', 'sampy', 'kawayan', 'kalaw', 'tarsi', 'piko', 'saranggola', 'duwi', 'silaw', 'bitu', 'gearo', 'ulap',
  'kono', 'kislap', 'dahon', 'radyo', 'ginto', 'hamog',
];

/** How a character helps a team. Tags explain play styles; a few pairings have a recipe (core/tuning.ts). */
export type TeamTag = 'Guide' | 'Guard' | 'Gatherer' | 'Rhythm' | 'Tech' | 'Nature' | 'Weather';

/**
 * What the road remembers across runs, for unlocks: only ever goes up. A run
 * adds its tally to these when it is paid (so never twice for one run).
 */
export interface Tally {
  cleanStretches: number;
  chains: number;
  goals: number;
  checkpoints: number;
  hazardsAvoided: number;
  coins: number;
  shieldBlocks: number;
  lowHealthCheckpoints: number;
  bots: number;
  basePulseHits: number;
  upgradesChosen: number;
  scoutGoals: number;
  courierGoals: number;
  weatherGoals: number;
  eveningGoals: number;
  duskGoals: number;
  collectionRuns: number;
  weatherCleanStretches: number;
  /** Road driven, in the game's metres. Counts from when this was added: older saves start at 0 rather than a guess. */
  metres: number;
}
export const TALLY_KEYS: readonly (keyof Tally)[] = [
  'cleanStretches', 'chains', 'goals', 'checkpoints', 'hazardsAvoided', 'coins', 'shieldBlocks', 'lowHealthCheckpoints', 'bots', 'basePulseHits', 'upgradesChosen', 'scoutGoals', 'courierGoals', 'weatherGoals', 'eveningGoals', 'duskGoals', 'collectionRuns', 'weatherCleanStretches', 'metres',
];
export function emptyTally(): Tally {
  return Object.fromEntries(TALLY_KEYS.map((k) => [k, 0])) as unknown as Tally;
}
/** What an unlock rule counts: a tally, or something the save already knows. */
export type CounterId = keyof Tally | 'postcards' | 'workshop' | 'arayatPostcards' | 'km' | 'endlessBest' | 'barkadas' | 'levels';

/** Barrikada's fantasy minions: the only things pulses and sidekick attacks can hit (never traffic). */
export type FoeKind = 'conebot' | 'drumbot' | 'signbot';

/** Temporary in-run power-ups. */
export type PowerUpKind = 'spread' | 'magnet' | 'bubble' | 'rally';

export type Expression =
  | 'idle'
  | 'speaking'
  | 'happy'
  | 'worried'
  | 'surprised'
  | 'determined'
  | 'hurt'
  | 'celebrate';
export const EXPRESSIONS: readonly Expression[] = [
  'idle',
  'speaking',
  'happy',
  'worried',
  'surprised',
  'determined',
  'hurt',
  'celebrate',
];

export type UpgradeId = 'bumper' | 'steering' | 'shieldTuning' | 'spareKit' | 'banderitas';
export const UPGRADES: readonly UpgradeId[] = ['bumper', 'steering', 'shieldTuning', 'spareKit', 'banderitas'];

export type SteeringMode = 'drag' | 'lanes';

export interface Settings {
  difficulty: Difficulty;
  /** Assist: the whole game runs slower, so every warning lasts longer in real time. */
  gameSpeed: number;
  /** Assist: extra seconds of warning before hazards arrive (0, 0.5 or 1). */
  warningBoost: number;
  /** Assist: the equipped active teammate ability fires by itself when it would help. */
  autoAbility: boolean;
  steering: SteeringMode;
  /** Drag steering: car movement per finger movement, 0.5-2. */
  sensitivity: number;
  /** Which bottom corner the ability button sits in. */
  abilitySide: 'left' | 'right';
  master: number;
  music: number;
  effects: number;
  voices: number;
  /** 1, 1.2 or 1.4. */
  textScale: number;
  reduceMotion: boolean;
  /** Thick dark outline + pattern on every hazard. */
  hazardOutlines: boolean;
  textSpeed: 'instant' | 'typewriter';
}

export interface MissionRecord {
  completed: boolean;
  clears: number;
  /** Highest results-screen total. */
  bestScore: number;
  /** Fewest dents in a completed run, null before the first completion. */
  bestDents: number | null;
  foundPostcard: boolean;
}

/** The team a run starts with: one hero, two different sidekicks (a slot may be empty). Fixed for the run. */
export interface Loadout {
  hero: HeroId;
  sidekicks: [SidekickId | null, SidekickId | null];
}

/** An earned sidekick: its XP and whether it has evolved. Present = unlocked. */
export interface SidekickProgress {
  xp: number;
  evolved: boolean;
}

/** Endless Expressway records - local to this phone, never a verified ranking. */
export interface EndlessRecord {
  bestDistance: number;
  bestScore: number;
  runs: number;
  /** Distance milestones already paid (each pays a Gear Core once). */
  milestones: number[];
}

export interface SaveData {
  version: number;
  /** Rises with every committed change; the host never writes an older revision over a newer one. */
  revision: number;
  createdAt: string;
  updatedAt: string;
  bolts: number;
  lifetimeBolts: number;
  /** Evolution material, earned predictably from missions (never bought, never random). */
  gearCores: number;
  missions: Partial<Record<MissionId, MissionRecord>>;
  /** Story scenes already shown (they can be replayed from the map). */
  scenesSeen: string[];
  /** Heroes unlocked (Navie always). */
  heroes: HeroId[];
  sidekicks: Partial<Record<SidekickId, SidekickProgress>>;
  loadout: Loadout;
  upgrades: Partial<Record<UpgradeId, number>>;
  tutorialDone: boolean;
  /** Ids of the most recent committed runs - what makes paying a run idempotent. */
  processedRuns: string[];
  /** Garage moments already played (a friend arriving, the workshop opening). */
  garageEvents: string[];
  endless: EndlessRecord;
  settings: Settings;
  /** Running totals for unlocks. */
  tally: Tally;
  /** Newly unlocked characters not yet shown ('hero:berto', 'sidekick:kape'); the garage reveals them once. */
  reveals: string[];
  /** Runs driven together, per character: friendship is cosmetic and never touches stats. */
  friendship: Partial<Record<HeroId | SidekickId, number>>;
}

export type RunOutcome = 'success' | 'failure' | 'abandoned';

/** What a finished run reports; the progression module turns it into Bolts, XP and Cores. */
export interface RunResult {
  runId: string;
  missionId: MissionId;
  seed: number;
  difficulty: Difficulty;
  outcome: RunOutcome;
  /** The loadout the run used (fixed when it started). */
  hero: HeroId;
  sidekicks: [SidekickId | null, SidekickId | null];
  boltsCollected: number;
  foesDefeated: number;
  dents: number;
  /** Null when the preset never fails (Story). */
  maxDents: number | null;
  shieldBlocks: number;
  repairsUsed: number;
  /** Convoy only: Kiko's engine left at the end. */
  kikoEngineLeft: number | null;
  kikoEngineMax: number | null;
  teamHonk: boolean;
  postcardFound: boolean;
  /** Short objectives completed during the run. */
  goalsDone: number;
  /** Endless only: distance reached (m). */
  distance: number;
  durationS: number;
  /** What this run adds to the unlock totals. */
  tally: Tally;
}

export interface PayoutLine {
  label: string;
  amount: number;
  /** Why this amount, in words, for the results screen. */
  note: string;
}

export interface Payout {
  lines: PayoutLine[];
  total: number;
  firstClear: boolean;
  /** Things this run opened, for the results screen ("Kuya Jepoy joined your team"). */
  unlocks: string[];
  /** Gear Cores earned. */
  cores: number;
  /** XP each equipped sidekick earned. */
  xp: { id: SidekickId; amount: number; readyToEvolve: boolean }[];
  /** Endless: a new local best. */
  newBest: boolean;
  /** Characters this run unlocked. */
  newlyUnlocked?: string[];
}
