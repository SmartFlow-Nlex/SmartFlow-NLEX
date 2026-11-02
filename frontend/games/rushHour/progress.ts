import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { RUSH_HOUR_DAILY, RUSH_HOUR_LEVELS, type RushHourPuzzle } from './levels';

/**
 * Rush Hour progress, kept on this phone per signed-in account (as the
 * Assistant's chat history is): the fewest moves each level was solved in,
 * the daily puzzles done, the daily streak, and the hints spent.
 *
 * One copy in memory per account, shared by every screen that shows it - the
 * level list updates the moment a puzzle is won on the play screen.
 */

/**
 * Hints one puzzle allows. Spent ones stay spent - Reset or leaving does not
 * bring them back, or the limit would be one tap away - until it is solved.
 */
export const HINTS_PER_PUZZLE = 3;

export interface RushHourProgress {
  /** Puzzle id -> fewest moves it was solved in. */
  best: Record<string, number>;
  /** Manila date ("2026-10-23") -> moves today's puzzle was solved in. */
  daily: Record<string, number>;
  /** Days in a row with the daily puzzle solved, as of `lastDaily`. */
  streak: number;
  lastDaily: string | null;
  /** Puzzle id -> hints spent on it since it was last solved. */
  hints: Record<string, number>;
}

const EMPTY: RushHourProgress = { best: {}, daily: {}, streak: 0, lastDaily: null, hints: {} };

const keyFor = (account: string | null): string =>
  `smartflow.rushHour.${(account ?? '').trim().toLowerCase() || 'guest'}`;

const memory = new Map<string, RushHourProgress>();
const loading = new Map<string, Promise<RushHourProgress>>();
const listeners = new Map<string, Set<(progress: RushHourProgress) => void>>();

function read(raw: string | null): RushHourProgress {
  try {
    const parsed = JSON.parse(raw ?? 'null') as Partial<RushHourProgress> | null;
    if (parsed === null || typeof parsed !== 'object') {
      return EMPTY;
    }
    return {
      best: typeof parsed.best === 'object' && parsed.best !== null ? parsed.best : {},
      daily: typeof parsed.daily === 'object' && parsed.daily !== null ? parsed.daily : {},
      streak: typeof parsed.streak === 'number' ? parsed.streak : 0,
      lastDaily: typeof parsed.lastDaily === 'string' ? parsed.lastDaily : null,
      hints: typeof parsed.hints === 'object' && parsed.hints !== null ? parsed.hints : {},
    };
  } catch {
    return EMPTY;
  }
}

function load(key: string): Promise<RushHourProgress> {
  const known = memory.get(key);
  if (known !== undefined) {
    return Promise.resolve(known);
  }
  const running = loading.get(key);
  if (running !== undefined) {
    return running;
  }
  const request = AsyncStorage.getItem(key)
    .catch(() => null)
    .then((raw) => {
      // A win saved while this was loading is newer than what was on disk.
      const progress = memory.get(key) ?? read(raw);
      memory.set(key, progress);
      return progress;
    })
    .finally(() => loading.delete(key));
  loading.set(key, request);
  return request;
}

function save(key: string, progress: RushHourProgress): void {
  memory.set(key, progress);
  listeners.get(key)?.forEach((listener) => listener(progress));
  // A failed write costs this win's record on the next launch, nothing more.
  void AsyncStorage.setItem(key, JSON.stringify(progress)).catch(() => undefined);
}

const DAY_MS = 86_400_000;
/** Manila is UTC+8 all year, so its date is simple arithmetic. */
const MANILA_OFFSET_MS = 8 * 3_600_000;

/** Today's date in Manila, "2026-10-23". */
export function manilaDateKey(at = Date.now()): string {
  return new Date(at + MANILA_OFFSET_MS).toISOString().slice(0, 10);
}

function previousDay(dateKey: string): string {
  return new Date(Date.parse(`${dateKey}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);
}

/** Today's puzzle: the daily pool in turn, one a day, the same for everyone. */
export function dailyPuzzle(dateKey = manilaDateKey()): RushHourPuzzle {
  const day = Math.floor(Date.parse(`${dateKey}T00:00:00Z`) / DAY_MS);
  return RUSH_HOUR_DAILY[((day % RUSH_HOUR_DAILY.length) + RUSH_HOUR_DAILY.length) % RUSH_HOUR_DAILY.length];
}

/** A level opens once the one before it is solved. */
export function isUnlocked(progress: RushHourProgress, index: number): boolean {
  return index === 0 || progress.best[RUSH_HOUR_LEVELS[index - 1].id] !== undefined;
}

/** The streak as it stands today: kept if the last daily was today or yesterday, else gone. */
export function currentStreak(progress: RushHourProgress, today = manilaDateKey()): number {
  return progress.lastDaily === today || progress.lastDaily === previousDay(today) ? progress.streak : 0;
}

export function useRushHourProgress(account: string | null): {
  progress: RushHourProgress;
  loaded: boolean;
  /** Record a win; for today's puzzle pass `dailyKey`. */
  recordWin: (puzzleId: string, moves: number, dailyKey?: string) => void;
  /** Count one more hint spent on this puzzle. */
  spendHint: (puzzleId: string) => void;
} {
  const key = keyFor(account);
  const [progress, setProgress] = useState<RushHourProgress>(memory.get(key) ?? EMPTY);
  const [loaded, setLoaded] = useState<boolean>(memory.has(key));

  useEffect(() => {
    let cancelled = false;
    void load(key).then((value) => {
      if (!cancelled) {
        setProgress(value);
        setLoaded(true);
      }
    });
    const set = listeners.get(key) ?? new Set();
    set.add(setProgress);
    listeners.set(key, set);
    return () => {
      cancelled = true;
      set.delete(setProgress);
    };
  }, [key]);

  const recordWin = useCallback(
    (puzzleId: string, moves: number, dailyKey?: string): void => {
      void load(key).then((current) => {
        const previous = current.best[puzzleId];
        // Solved: playing it again starts with a full set of hints.
        const { [puzzleId]: _spent, ...hints } = current.hints;
        const next: RushHourProgress = {
          ...current,
          best: { ...current.best, [puzzleId]: previous === undefined ? moves : Math.min(previous, moves) },
          hints,
        };
        if (dailyKey !== undefined) {
          const before = current.daily[dailyKey];
          next.daily = { ...current.daily, [dailyKey]: before === undefined ? moves : Math.min(before, moves) };
          if (current.lastDaily !== dailyKey) {
            next.streak = current.lastDaily === previousDay(dailyKey) ? current.streak + 1 : 1;
            next.lastDaily = dailyKey;
          }
        }
        save(key, next);
      });
    },
    [key],
  );

  const spendHint = useCallback(
    (puzzleId: string): void => {
      void load(key).then((current) => {
        save(key, { ...current, hints: { ...current.hints, [puzzleId]: (current.hints[puzzleId] ?? 0) + 1 } });
      });
    },
    [key],
  );

  return { progress, loaded, recordWin, spendHint };
}

/** Rush Hour's own settings, kept on this phone (not per account: they are about the phone). */
export interface RushHourSettings {
  /** While a vehicle is held, light the cells it can slide into. */
  showLanes: boolean;
}

const SETTINGS_KEY = 'smartflow.rushHour.settings';
const DEFAULT_SETTINGS: RushHourSettings = { showLanes: true };
let settingsMemory: RushHourSettings | null = null;

export function useRushHourSettings(): { settings: RushHourSettings; update: (next: Partial<RushHourSettings>) => void } {
  const [settings, setSettings] = useState<RushHourSettings>(settingsMemory ?? DEFAULT_SETTINGS);
  useEffect(() => {
    if (settingsMemory !== null) {
      return;
    }
    let cancelled = false;
    void AsyncStorage.getItem(SETTINGS_KEY)
      .catch(() => null)
      .then((raw) => {
        let parsed: Partial<RushHourSettings> = {};
        try {
          parsed = (JSON.parse(raw ?? '{}') as Partial<RushHourSettings>) ?? {};
        } catch {
          parsed = {};
        }
        settingsMemory = { showLanes: typeof parsed.showLanes === 'boolean' ? parsed.showLanes : DEFAULT_SETTINGS.showLanes };
        if (!cancelled) {
          setSettings(settingsMemory);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const update = useCallback((next: Partial<RushHourSettings>) => {
    setSettings((current) => {
      const merged = { ...current, ...next };
      settingsMemory = merged;
      void AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(merged)).catch(() => undefined);
      return merged;
    });
  }, []);
  return { settings, update };
}
