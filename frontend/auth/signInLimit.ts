import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * A limit on wrong passwords at sign-in, per email address.
 *
 * After MAX_SIGN_IN_ATTEMPTS wrong passwords in a row the address cannot be
 * tried from this phone for LOCKOUT_MS. Kept in AsyncStorage, so closing and
 * reopening the app does not hand out a fresh set of tries. A correct
 * password clears the count.
 *
 * This is the app's own limit, on this phone. Supabase separately limits how
 * fast sign-ins can be tried from anywhere; that is the one a script talking
 * to Supabase directly runs into.
 */

export const MAX_SIGN_IN_ATTEMPTS = 5;
export const LOCKOUT_MS = 5 * 60 * 1000;

const KEY = 'smartflow.auth.wrongPasswords';

interface Tally {
  count: number;
  /** Epoch ms until which this address is locked; 0 when it is not. */
  lockedUntil: number;
}

type Tallies = Record<string, Tally>;

/** Sign-in is not open to this address until `until`. */
export class SignInLockedError extends Error {
  readonly until: number;

  constructor(until: number) {
    super(lockedMessage(until));
    this.name = 'SignInLockedError';
    this.until = until;
  }
}

function lockedMessage(until: number): string {
  const minutes = Math.max(1, Math.ceil((until - Date.now()) / 60_000));
  return `Too many wrong passwords. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}, or reset your password.`;
}

function keyFor(email: string): string {
  return email.trim().toLowerCase();
}

async function readTallies(): Promise<Tallies> {
  try {
    const parsed = JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}') as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as Tallies) : {};
  } catch {
    return {};
  }
}

async function writeTallies(tallies: Tallies): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(tallies));
  } catch {
    // The limit still holds for this run; it just will not survive a restart.
  }
}

/** Epoch ms until which this address is locked, or null when it can be tried. */
export async function lockedUntil(email: string): Promise<number | null> {
  const tally = (await readTallies())[keyFor(email)];
  return tally !== undefined && tally.lockedUntil > Date.now() ? tally.lockedUntil : null;
}

/**
 * Count one wrong password. Returns how many tries are left, or the time the
 * lock lifts when that was the last one. A lock that has run out starts the
 * count again from zero.
 */
export async function recordWrongPassword(
  email: string,
): Promise<{ attemptsLeft: number; lockedUntil: number | null }> {
  const tallies = await readTallies();
  const key = keyFor(email);
  const before = tallies[key];
  const expired = before !== undefined && before.lockedUntil !== 0 && before.lockedUntil <= Date.now();
  const count = (before === undefined || expired ? 0 : before.count) + 1;
  const locked = count >= MAX_SIGN_IN_ATTEMPTS ? Date.now() + LOCKOUT_MS : 0;
  tallies[key] = { count, lockedUntil: locked };
  await writeTallies(tallies);
  return {
    attemptsLeft: Math.max(0, MAX_SIGN_IN_ATTEMPTS - count),
    lockedUntil: locked === 0 ? null : locked,
  };
}

/** The password was right: start this address's count again. */
export async function clearWrongPasswords(email: string): Promise<void> {
  const tallies = await readTallies();
  if (tallies[keyFor(email)] !== undefined) {
    delete tallies[keyFor(email)];
    await writeTallies(tallies);
  }
}
