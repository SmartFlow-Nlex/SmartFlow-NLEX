/** Types shared by the race simulation, the page and the React Native host. */

export type TrackId = 'palayan' | 'parol' | 'sierra';
export const TRACKS_IN_CUP: readonly TrackId[] = ['palayan', 'parol', 'sierra'];

export type Difficulty = 'rookie' | 'easy' | 'standard' | 'pro';
export const DIFFICULTIES: readonly Difficulty[] = ['rookie', 'easy', 'standard', 'pro'];

export type RaceMode = 'cup' | 'trial';

export type UpgradeId = 'engine' | 'tyres' | 'turbo' | 'stripes';
export const UPGRADES: readonly UpgradeId[] = ['engine', 'tyres', 'turbo', 'stripes'];

export type SteeringMode = 'drag' | 'lanes';

export interface Settings {
  difficulty: Difficulty;
  /** Assist: everything runs slower (0.7, 0.85 or 1). */
  gameSpeed: number;
  /** Assist: the car leans into bends by itself. */
  autoSteer: boolean;
  /** Assist: the fast line is painted on the track. */
  showLine: boolean;
  /** Item boxes and items in Cup races (Mario Kart style). */
  items: boolean;
  steering: SteeringMode;
  sensitivity: number;
  boostSide: 'left' | 'right';
  master: number;
  music: number;
  effects: number;
  textScale: number;
  reduceMotion: boolean;
}

/** Best results on one track. */
export interface TrackRecord {
  /** Best finishing place in a cup race (1 = won), null if never raced. */
  bestPlace: number | null;
  /** Time-trial bests, seconds. */
  bestLap: number | null;
  bestTotal: number | null;
  /** Ghost of the best time trial: lateral position every GHOST_STEP units of the run. */
  ghost: number[] | null;
  /** First podium bonus already paid. */
  podiumPaid: boolean;
}

export interface CupState {
  /** Races finished in the current cup (0-3). */
  raced: number;
  /** Points per car number in the current cup ('navie' for the player). */
  points: Record<string, number>;
}

export interface SaveData {
  version: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
  bolts: number;
  lifetimeBolts: number;
  tracks: Partial<Record<TrackId, TrackRecord>>;
  cup: CupState;
  /** Best cup trophy ever: 1 gold, 2 silver, 3 bronze, null none. */
  trophy: number | null;
  upgrades: Partial<Record<UpgradeId, number>>;
  /** Ids of recently committed races: a race is paid only once. */
  processedRuns: string[];
  settings: Settings;
}

/** What a finished race reports. */
export interface RaceResult {
  runId: string;
  mode: RaceMode;
  track: TrackId;
  difficulty: Difficulty;
  /** 1-6 in a cup race; 1 in a time trial. */
  place: number;
  /** Final order by car id ('navie' or the rival's number). */
  order: string[];
  totalTime: number;
  bestLap: number;
  boltsCollected: number;
  /** Time trial only: the run's lateral path for the ghost. */
  ghost: number[] | null;
  /** True when the player quit before the finish. */
  abandoned: boolean;
}

export interface PayoutLine {
  label: string;
  amount: number;
  note: string;
}

export interface Payout {
  lines: PayoutLine[];
  total: number;
  /** New records and unlocks, in words. */
  notes: string[];
}
