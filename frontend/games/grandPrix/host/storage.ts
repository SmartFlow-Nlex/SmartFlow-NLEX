import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadSave } from '../core/save';

/**
 * Navie Grand Prix progress on this phone, one key per signed-in account (as
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
  `smartflow.grandPrix.${(account ?? '').trim().toLowerCase() || 'guest'}`;

const lastWritten = new Map<string, number>();

export async function readSave(account: string | null): Promise<{ raw: string | null; ok: boolean }> {
  const key = keyFor(account);
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw !== null) {
      const { save, issues } = loadSave(raw);
      if (issues.includes('not-json') || issues.includes('not-object') || issues.includes('newer-version')) {
        await AsyncStorage.setItem(`${key}.unreadable-${Date.now()}`, raw).catch(() => undefined);
      } else {
        lastWritten.set(key, save.revision);
      }
    }
    return { raw, ok: true };
  } catch {
    return { raw: null, ok: false };
  }
}

export async function writeSave(account: string | null, raw: string, revision: number): Promise<boolean> {
  const key = keyFor(account);
  const { save, issues } = loadSave(raw);
  if (issues.includes('not-json') || issues.includes('not-object') || issues.includes('newer-version') || save.revision !== revision) {
    return false;
  }
  const previous = lastWritten.get(key);
  if (previous !== undefined && revision <= previous) {
    // Older or repeated: the newer progress is already stored.
    return true;
  }
  try {
    await AsyncStorage.setItem(key, raw);
    lastWritten.set(key, revision);
    return true;
  } catch {
    return false;
  }
}
