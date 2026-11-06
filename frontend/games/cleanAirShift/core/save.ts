import type { DayDef } from './days';
import type { ShiftOutcome } from './shift';

/**
 * Carbon Rush's save (it keeps its first name's key, so nobody loses progress): one JSON object per account, written whole, with a
 * rising revision. Everything read back is checked field by field; a save that
 * is not JSON, or from a newer version, starts fresh (the host keeps a copy). An
 * unfinished shift is never saved: it simply restarts.
 */

export const SAVE_VERSION = 1;
const RUNS_KEPT = 48;

export type GameSpeed = 1 | 0.85 | 0.7;
export type TextScale = 1 | 1.2 | 1.4;

export interface Settings {
  sound: boolean;
  gameSpeed: GameSpeed;
  reduceMotion: boolean;
  textScale: TextScale;
}

export interface ShiftRecord {
  stars: number;
  bestSaved: number;
  bestUsed: number;
  plays: number;
}

export interface DailyRecord {
  /** The last date a daily was finished within budget. */
  lastDate: string | null;
  streak: number;
  bestStreak: number;
  /** Best result on `lastDate`. */
  stars: number;
  saved: number;
}

export interface SaveData {
  version: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
  shifts: Record<string, ShiftRecord>;
  daily: DailyRecord;
  /** kg saved over all finished shifts. */
  totalSaved: number;
  shiftsFinished: number;
  /** Tutorial tips already shown. */
  coachSeen: string[];
  processedRuns: string[];
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = { sound: true, gameSpeed: 1, reduceMotion: false, textScale: 1 };

export function defaultSave(now: Date = new Date()): SaveData {
  const stamp = now.toISOString();
  return {
    version: SAVE_VERSION,
    revision: 0,
    createdAt: stamp,
    updatedAt: stamp,
    shifts: {},
    daily: { lastDate: null, streak: 0, bestStreak: 0, stars: 0, saved: 0 },
    totalSaved: 0,
    shiftsFinished: 0,
    coachSeen: [],
    processedRuns: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

export type SaveIssue = 'empty' | 'not-json' | 'not-object' | 'newer-version';

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, fallback: number, min: number, max: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
const oneOf = <T extends string | number>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;
const strings = (v: unknown, keep: number): string[] =>
  Array.isArray(v) ? v.filter((item): item is string => typeof item === 'string').slice(-keep) : [];

function readSettings(raw: unknown): Settings {
  const r = isObject(raw) ? raw : {};
  const d = DEFAULT_SETTINGS;
  return {
    sound: typeof r.sound === 'boolean' ? r.sound : d.sound,
    gameSpeed: oneOf<GameSpeed>(r.gameSpeed as GameSpeed, [1, 0.85, 0.7], d.gameSpeed),
    reduceMotion: typeof r.reduceMotion === 'boolean' ? r.reduceMotion : d.reduceMotion,
    textScale: oneOf<TextScale>(r.textScale as TextScale, [1, 1.2, 1.4], d.textScale),
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
  if ((typeof raw.version === 'number' ? raw.version : 0) > SAVE_VERSION) {
    return { save: defaultSave(now), issues: ['newer-version'] };
  }
  const fallback = defaultSave(now);
  const shifts: Record<string, ShiftRecord> = {};
  if (isObject(raw.shifts)) {
    for (const [id, value] of Object.entries(raw.shifts)) {
      if (isObject(value) && Object.keys(shifts).length < 32) {
        shifts[id] = {
          stars: Math.round(num(value.stars, 0, 0, 3)),
          bestSaved: num(value.bestSaved, 0, 0, 1e6),
          bestUsed: num(value.bestUsed, 0, 0, 1e6),
          plays: Math.round(num(value.plays, 0, 0, 1e6)),
        };
      }
    }
  }
  const d = isObject(raw.daily) ? raw.daily : {};
  return {
    save: {
      version: SAVE_VERSION,
      revision: Math.round(num(raw.revision, 0, 0, Number.MAX_SAFE_INTEGER)),
      createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : fallback.createdAt,
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : fallback.updatedAt,
      shifts,
      daily: {
        lastDate: typeof d.lastDate === 'string' ? d.lastDate : null,
        streak: Math.round(num(d.streak, 0, 0, 1e5)),
        bestStreak: Math.round(num(d.bestStreak, 0, 0, 1e5)),
        stars: Math.round(num(d.stars, 0, 0, 3)),
        saved: num(d.saved, 0, 0, 1e6),
      },
      totalSaved: num(raw.totalSaved, 0, 0, 1e9),
      shiftsFinished: Math.round(num(raw.shiftsFinished, 0, 0, 1e7)),
      coachSeen: strings(raw.coachSeen, 16),
      processedRuns: strings(raw.processedRuns, RUNS_KEPT),
      settings: readSettings(raw.settings),
    },
    issues: [],
  };
}

export const serializeSave = (save: SaveData): string => JSON.stringify(save);

export const bumpRevision = (save: SaveData, now: Date = new Date()): SaveData => ({
  ...save,
  revision: save.revision + 1,
  updatedAt: now.toISOString(),
});

const DAY_MS = 86_400_000;
const MANILA_OFFSET_MS = 8 * 3_600_000;

/** Today in Manila, as Rush Hour's daily puzzle counts it. */
export const manilaDateKey = (at: number = Date.now()): string => new Date(at + MANILA_OFFSET_MS).toISOString().slice(0, 10);

const dayBefore = (dateKey: string): string => new Date(Date.parse(`${dateKey}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);

/** The streak to show today: a streak that missed a day has ended. */
export function currentStreak(daily: DailyRecord, today: string): number {
  return daily.lastDate === today || daily.lastDate === dayBefore(today) ? daily.streak : 0;
}

/**
 * Adds a finished shift to the save, once per run id: a repeated message changes
 * nothing. A shift that ran out of budget counts as played, with nothing saved.
 */
export function recordShift(save: SaveData, runId: string, def: DayDef, result: ShiftOutcome, today: string = manilaDateKey()): SaveData {
  if (save.processedRuns.includes(runId)) {
    return save;
  }
  const next: SaveData = {
    ...save,
    shifts: { ...save.shifts },
    daily: { ...save.daily },
    processedRuns: [...save.processedRuns, runId].slice(-RUNS_KEPT),
  };
  if (def.id.startsWith('daily-')) {
    if (result.finished) {
      const d = next.daily;
      if (d.lastDate === today) {
        d.stars = Math.max(d.stars, result.stars);
        d.saved = Math.max(d.saved, result.saved);
      } else {
        d.streak = d.lastDate === dayBefore(today) ? d.streak + 1 : 1;
        d.bestStreak = Math.max(d.bestStreak, d.streak);
        d.lastDate = today;
        d.stars = result.stars;
        d.saved = result.saved;
      }
    }
  } else {
    const was = next.shifts[def.id] ?? { stars: 0, bestSaved: 0, bestUsed: 0, plays: 0 };
    next.shifts[def.id] = {
      stars: Math.max(was.stars, result.stars),
      bestSaved: result.finished ? Math.max(was.bestSaved, result.saved) : was.bestSaved,
      bestUsed: result.finished ? (was.bestUsed > 0 ? Math.min(was.bestUsed, result.used) : result.used) : was.bestUsed,
      plays: was.plays + 1,
    };
  }
  if (result.finished) {
    next.totalSaved += result.saved;
    next.shiftsFinished += 1;
  }
  return next;
}

/** A shift opens once the one before it was finished within budget. */
export function isUnlocked(save: SaveData, order: readonly { id: string }[], index: number): boolean {
  return index === 0 || (save.shifts[order[index - 1].id]?.stars ?? 0) > 0;
}
