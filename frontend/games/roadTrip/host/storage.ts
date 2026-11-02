import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadSave } from '../core/save';

/**
 * Tollbound Heroes (formerly Navie's Road Trip) progress on this phone, one key per signed-in account (as
 * Rush Hour and the chat history do). The page owns the save's contents; this
 * side only stores and checks what it is given:
 *
 * - a save is written only if it parses as a save, and only if its revision
 *   is newer than the last one written, so a late or duplicate message can
 *   never put older progress back;
 * - a stored save that cannot be read (corrupt, or from a newer app) is copied
 *   to a backup key before the game is allowed to replace it.
 */

const keyFor = (account: string | null): string =>
  `smartflow.roadTrip.${(account ?? '').trim().toLowerCase() || 'guest'}`;

const lastWritten = new Map<string, number>();

/** Copies an unreadable save aside - once: reopening the game must not pile up identical copies. */
async function backUpOnce(key: string, raw: string): Promise<void> {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(`${key}.unreadable-`));
    const existing = await AsyncStorage.multiGet(keys);
    if (existing.some(([, value]) => value === raw)) {
      return;
    }
    await AsyncStorage.setItem(`${key}.unreadable-${Date.now()}`, raw);
  } catch {
    // Best effort: the original stays in place until the game writes over it.
  }
}

export async function readSave(account: string | null): Promise<{ raw: string | null; ok: boolean }> {
  const key = keyFor(account);
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw !== null) {
      const { save, issues } = loadSave(raw);
      if (issues.includes('not-json') || issues.includes('not-object') || issues.includes('newer-version')) {
        await backUpOnce(key, raw);
      } else {
        lastWritten.set(key, save.revision);
      }
    }
    return { raw, ok: true };
  } catch {
    return { raw: null, ok: false };
  }
}

/**
 * 'saved' (written, or this exact revision already was), 'stale' (older than what is stored - the
 * page is behind and its progress was NOT kept) or 'failed'.
 */
export type WriteResult = 'saved' | 'stale' | 'failed';

export async function writeSave(account: string | null, raw: string, revision: number): Promise<WriteResult> {
  const key = keyFor(account);
  const { save, issues } = loadSave(raw);
  if (issues.includes('not-json') || issues.includes('not-object') || issues.includes('newer-version') || save.revision !== revision) {
    return 'failed';
  }
  const previous = lastWritten.get(key);
  if (previous !== undefined && revision <= previous) {
    // Repeated: already stored. Older: the newer progress stays, and the page is told.
    return revision === previous ? 'saved' : 'stale';
  }
  try {
    await AsyncStorage.setItem(key, raw);
    lastWritten.set(key, revision);
    return 'saved';
  } catch {
    return 'failed';
  }
}
