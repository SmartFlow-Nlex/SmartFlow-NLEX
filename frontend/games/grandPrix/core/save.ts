import { DIFFICULTIES, TRACKS_IN_CUP, UPGRADES, type SaveData, type Settings, type TrackRecord } from './types';

/**
 * Navie Grand Prix's save: one JSON object per account, written whole, with
 * a rising revision. Everything read back is validated field by field; a
 * save that is not JSON, or from a newer version, starts fresh (the host keeps
 * a copy). An unfinished race is never saved - it simply restarts.
 */

export const SAVE_VERSION = 1;
export const PROCESSED_RUNS_KEPT = 64;
const GHOST_MAX = 6000;

export const DEFAULT_SETTINGS: Settings = {
  difficulty: 'easy',
  gameSpeed: 1,
  autoSteer: false,
  showLine: true,
  items: true,
  steering: 'drag',
  sensitivity: 1,
  boostSide: 'right',
  master: 0.8,
  music: 0.5,
  effects: 0.8,
  textScale: 1,
  reduceMotion: false,
};

export function defaultSave(now: Date = new Date()): SaveData {
  const stamp = now.toISOString();
  return {
    version: SAVE_VERSION,
    revision: 0,
    createdAt: stamp,
    updatedAt: stamp,
    bolts: 0,
    lifetimeBolts: 0,
    tracks: {},
    cup: { raced: 0, points: {} },
    trophy: null,
    upgrades: {},
    processedRuns: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

export type SaveIssue = 'empty' | 'not-json' | 'not-object' | 'newer-version' | 'fields-repaired';

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, fallback: number, min: number, max: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
const numOrNull = (v: unknown, min: number, max: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null;
const oneOf = <T extends string | number>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;

function readSettings(raw: unknown): Settings {
  const d = DEFAULT_SETTINGS;
  const r = isObject(raw) ? raw : {};
  return {
    difficulty: oneOf(r.difficulty, DIFFICULTIES, d.difficulty),
    gameSpeed: oneOf(r.gameSpeed, [0.7, 0.85, 1], d.gameSpeed),
    autoSteer: typeof r.autoSteer === 'boolean' ? r.autoSteer : d.autoSteer,
    showLine: typeof r.showLine === 'boolean' ? r.showLine : d.showLine,
    items: typeof r.items === 'boolean' ? r.items : d.items,
    steering: oneOf(r.steering, ['drag', 'lanes'] as const, d.steering),
    sensitivity: num(r.sensitivity, d.sensitivity, 0.5, 2),
    boostSide: oneOf(r.boostSide, ['left', 'right'] as const, d.boostSide),
    master: num(r.master, d.master, 0, 1),
    music: num(r.music, d.music, 0, 1),
    effects: num(r.effects, d.effects, 0, 1),
    textScale: oneOf(r.textScale, [1, 1.2, 1.4], d.textScale),
    reduceMotion: typeof r.reduceMotion === 'boolean' ? r.reduceMotion : d.reduceMotion,
  };
}

function readTrack(raw: unknown): TrackRecord | null {
  if (!isObject(raw)) {
    return null;
  }
  const ghost =
    Array.isArray(raw.ghost) && raw.ghost.length <= GHOST_MAX && raw.ghost.length % 2 === 0 && raw.ghost.every((v) => typeof v === 'number' && Number.isFinite(v))
      ? (raw.ghost as number[])
      : null;
  return {
    bestPlace: numOrNull(raw.bestPlace, 1, 6),
    bestLap: numOrNull(raw.bestLap, 1, 3600),
    bestTotal: numOrNull(raw.bestTotal, 1, 36000),
    ghost,
    podiumPaid: raw.podiumPaid === true,
  };
}

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
  const version = typeof raw.version === 'number' ? raw.version : 0;
  if (version > SAVE_VERSION) {
    return { save: defaultSave(now), issues: ['newer-version'] };
  }
  const fallback = defaultSave(now);
  const tracks: SaveData['tracks'] = {};
  if (isObject(raw.tracks)) {
    for (const id of TRACKS_IN_CUP) {
      const record = readTrack(raw.tracks[id]);
      if (record !== null) {
        tracks[id] = record;
      }
    }
  }
  const cupRaw = isObject(raw.cup) ? raw.cup : {};
  const points: Record<string, number> = {};
  if (isObject(cupRaw.points)) {
    for (const [key, value] of Object.entries(cupRaw.points)) {
      if (typeof value === 'number' && Number.isFinite(value) && Object.keys(points).length < 8) {
        points[key] = Math.max(0, Math.min(30, Math.round(value)));
      }
    }
  }
  const upgrades: SaveData['upgrades'] = {};
  if (isObject(raw.upgrades)) {
    for (const id of UPGRADES) {
      const level = Math.round(num(raw.upgrades[id], 0, 0, 2));
      if (level > 0) {
        upgrades[id] = level;
      }
    }
  }
  const save: SaveData = {
    version: SAVE_VERSION,
    revision: Math.round(num(raw.revision, 0, 0, Number.MAX_SAFE_INTEGER)),
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : fallback.createdAt,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : fallback.updatedAt,
    bolts: Math.round(num(raw.bolts, 0, 0, 10_000_000)),
    lifetimeBolts: Math.round(num(raw.lifetimeBolts, 0, 0, 10_000_000)),
    tracks,
    cup: { raced: Math.round(num(cupRaw.raced, 0, 0, 3)), points },
    trophy: numOrNull(raw.trophy, 1, 3),
    upgrades,
    processedRuns: Array.isArray(raw.processedRuns) ? raw.processedRuns.filter((v): v is string => typeof v === 'string').slice(-PROCESSED_RUNS_KEPT) : [],
    settings: readSettings(raw.settings),
  };
  return { save, issues: [] };
}

export function serializeSave(save: SaveData): string {
  return JSON.stringify(save);
}

export function bumpRevision(save: SaveData, now: Date = new Date()): SaveData {
  return { ...save, revision: save.revision + 1, updatedAt: now.toISOString() };
}
