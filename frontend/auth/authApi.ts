import { AuthError, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { getSupabase, isSupabaseConfigured } from './supabaseClient';

/**
 * Auth transport.
 *
 * Backed by Supabase Auth (email + password). Validation runs locally first so
 * the user gets an instant, specific message for an obviously bad input instead
 * of a round trip; everything past that is Supabase's answer.
 *
 * The account's display name lives in the auth user's `user_metadata` under
 * `full_name` - there is no profiles table.
 */

export interface Credentials {
  email: string;
  password: string;
}

export interface Registration {
  fullName: string;
  email: string;
  password: string;
}

export interface AuthResult {
  token: string;
  fullName: string;
  email: string;
}

/** A new password is 8 to 16 characters (Ysa's rule, 19 Oct). */
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 16;

/**
 * For iOS, which offers to make up a strong password for a new-password field.
 * Its usual suggestion is 20 characters: without these rules the field would
 * cut it to 16 while the Keychain saved all 20, and the saved password would
 * never sign in.
 */
export const PASSWORD_RULES = `minlength: ${MIN_PASSWORD_LENGTH}; maxlength: ${MAX_PASSWORD_LENGTH}; required: lower; required: upper; required: digit;`;

// Deliberately permissive: something@something.tld. Anything stricter starts
// rejecting addresses that are perfectly valid.
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return 'Enter your email address.';
  }
  if (!emailPattern.test(trimmed)) {
    return 'Enter a valid email address.';
  }
  return null;
}

/**
 * The password at sign-in: only that there is one. The 8-16 rule is for new
 * passwords - accounts made when 6 was the minimum must still be able to sign
 * in with the password they have.
 */
export function validatePassword(value: string): string | null {
  return value.length === 0 ? 'Enter your password.' : null;
}

/** A password being chosen, at sign-up or after a reset link. */
export function validateNewPassword(value: string): string | null {
  if (value.length === 0) {
    return 'Enter a password.';
  }
  if (value.length < MIN_PASSWORD_LENGTH || value.length > MAX_PASSWORD_LENGTH) {
    return `Password must be ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters.`;
  }
  if (value.trim() !== value) {
    return 'Password cannot start or end with a space.';
  }
  return null;
}

export function validatePasswordConfirmation(password: string, confirmation: string): string | null {
  if (confirmation.length === 0) {
    return 'Type your password again to confirm it.';
  }
  return confirmation === password ? null : 'The passwords do not match.';
}

export type PasswordStrengthLabel = 'Too short' | 'Weak' | 'Fair' | 'Good' | 'Strong';

export interface PasswordStrength {
  /** 0 (too short) to 4 (strong). */
  score: 0 | 1 | 2 | 3 | 4;
  label: PasswordStrengthLabel;
  checks: {
    length: boolean;
    mixedCase: boolean;
    number: boolean;
    symbol: boolean;
  };
}

/** Passwords people really pick, which no mix of characters rescues. */
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890', 'qwerty123',
  'qwertyuiop', 'iloveyou', 'abc12345', 'abcd1234', 'admin123', 'welcome1', 'letmein1',
  'smartflow', 'smartflow1', 'nlex1234', 'p@ssw0rd', 'passw0rd',
]);

/**
 * How guessable a new password is, for the meter under the field.
 *
 * Length within the 8-16 rule and the kinds of character used make the score;
 * a common password, or one character or a straight run repeated, is weak
 * whatever it is made of.
 */
export function passwordStrength(value: string): PasswordStrength {
  const checks = {
    length: value.length >= MIN_PASSWORD_LENGTH && value.length <= MAX_PASSWORD_LENGTH,
    mixedCase: /[a-z]/.test(value) && /[A-Z]/.test(value),
    number: /\d/.test(value),
    symbol: /[^A-Za-z0-9\s]/.test(value),
  };
  if (value.length < MIN_PASSWORD_LENGTH) {
    return { score: 0, label: 'Too short', checks };
  }
  const lower = value.toLowerCase();
  const oneCharacter = /^(.)\1+$/.test(value);
  const straightRun = '0123456789abcdefghijklmnopqrstuvwxyz'.includes(lower) || 'qwertyuiopasdfghjklzxcvbnm'.includes(lower);
  if (COMMON_PASSWORDS.has(lower) || oneCharacter || straightRun) {
    return { score: 1, label: 'Weak', checks };
  }
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9\s]/].filter((kind) => kind.test(value)).length;
  // One kind of character is weak, each further kind is a step up, and 12 or
  // more characters is worth one more.
  const raw = kinds + (value.length >= 12 ? 1 : 0) - 1;
  const score = Math.max(1, Math.min(4, raw)) as 1 | 2 | 3 | 4;
  const labels: Record<1 | 2 | 3 | 4, PasswordStrengthLabel> = { 1: 'Weak', 2: 'Fair', 3: 'Good', 4: 'Strong' };
  return { score, label: labels[score], checks };
}

export function validateFullName(value: string): string | null {
  if (value.trim().length === 0) {
    return 'Enter your full name.';
  }
  if (value.trim().length < 2) {
    return 'Enter your full name.';
  }
  return null;
}

/** "ysa.jabagat@gmail.com" -> "Ysa Jabagat", so the profile is not blank. */
export function displayNameFromEmail(email: string): string {
  const localPart = email.trim().split('@')[0] ?? '';
  const words = localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
  return words.length > 0 ? words.join(' ') : 'NLEX Traveler';
}

/**
 * The first real name in a full name, for greeting someone.
 *
 * Skips initials and short forms - "J. Ysabela Cruz" and "Ma. Ysabela Cruz"
 * give "Ysabela", not "J." or "Ma." - because taking the first word made Navie
 * greet people by a single letter. A name made only of initials is returned
 * whole rather than cut down to one of them.
 */
export function firstNameOf(fullName: string | undefined): string | null {
  const words = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return null;
  }
  const isInitial = (word: string): boolean => word.endsWith('.') || word.replace(/\W/g, '').length <= 1;
  return words.find((word) => !isInitial(word)) ?? words.join(' ');
}

/**
 * The email and password did not match an account - the one failure that
 * counts toward the sign-in limit. A dropped connection or an empty field is
 * not a wrong guess.
 */
export class WrongCredentialsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WrongCredentialsError';
  }
}

/** Supabase's own wording is aimed at developers; these are aimed at commuters. */
function friendlyAuthMessage(error: AuthError): string {
  const raw = error.message.toLowerCase();
  if (raw.includes('invalid login credentials')) {
    return 'That email and password do not match an account.';
  }
  if (error.code === 'same_password') {
    return 'Your new password must be different from your old one.';
  }
  if (error.code === 'weak_password') {
    return 'That password is too easy to guess. Mix upper and lower case letters, numbers and symbols.';
  }
  if (error.code === 'over_email_send_rate_limit' || raw.includes('email rate limit')) {
    return 'A reset email was sent a moment ago. Wait a minute before asking for another.';
  }
  if (error.code === 'email_address_not_authorized') {
    return 'Reset emails are not set up for this app yet. Ask the SmartFlow team.';
  }
  if (raw.includes('email not confirmed')) {
    return 'Confirm your email address first, then sign in.';
  }
  if (raw.includes('already registered') || raw.includes('already been registered')) {
    return 'An account with that email already exists. Sign in instead.';
  }
  if (raw.includes('rate limit') || raw.includes('too many')) {
    return 'Too many attempts. Wait a moment and try again.';
  }
  if (raw.includes('network') || raw.includes('fetch')) {
    return 'Could not reach the server. Check your connection and try again.';
  }
  return error.message;
}

function assertConfigured(): void {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and ' +
        'EXPO_PUBLIC_SUPABASE_ANON_KEY, then restart the dev server.',
    );
  }
}

/** Best display name available: what they signed up with, else from the email. */
export function nameForUser(user: User): string {
  const metadata = user.user_metadata as { full_name?: unknown } | null;
  const stored = typeof metadata?.full_name === 'string' ? metadata.full_name.trim() : '';
  if (stored.length > 0) {
    return stored;
  }
  return displayNameFromEmail(user.email ?? '');
}

export async function authenticate({ email, password }: Credentials): Promise<AuthResult> {
  assertConfigured();

  const emailError = validateEmail(email);
  if (emailError !== null) {
    throw new Error(emailError);
  }
  const passwordError = validatePassword(password);
  if (passwordError !== null) {
    throw new Error(passwordError);
  }

  const { data, error } = await getSupabase().auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error !== null) {
    if (error.code === 'invalid_credentials' || error.message.toLowerCase().includes('invalid login credentials')) {
      throw new WrongCredentialsError(friendlyAuthMessage(error));
    }
    throw new Error(friendlyAuthMessage(error));
  }
  if (data.session === null || data.user === null) {
    throw new Error('Signed in, but no session came back. Try again.');
  }

  return {
    token: data.session.access_token,
    fullName: nameForUser(data.user),
    email: data.user.email ?? email.trim(),
  };
}

export async function register({
  fullName,
  email,
  password,
}: Registration): Promise<AuthResult> {
  assertConfigured();

  const nameError = validateFullName(fullName);
  if (nameError !== null) {
    throw new Error(nameError);
  }
  const emailError = validateEmail(email);
  if (emailError !== null) {
    throw new Error(emailError);
  }
  const passwordError = validateNewPassword(password);
  if (passwordError !== null) {
    throw new Error(passwordError);
  }

  const trimmedName = fullName.trim();
  const { data, error } = await getSupabase().auth.signUp({
    email: email.trim(),
    password,
    options: { data: { full_name: trimmedName } },
  });

  if (error !== null) {
    throw new Error(friendlyAuthMessage(error));
  }

  // With "Confirm email" enabled Supabase returns a user but no session, so the
  // account cannot be used yet. Say so rather than pretending they are in.
  if (data.session === null) {
    throw new Error(
      'Account created. Check your email for a confirmation link, then sign in.',
    );
  }

  return {
    token: data.session.access_token,
    fullName: trimmedName,
    email: data.user?.email ?? email.trim(),
  };
}

/** The app's screen for choosing a new password, as the reset email links to it. */
export const RESET_PASSWORD_PATH = 'reset-password';

/**
 * Where the reset email's link sends the phone: this app's reset screen.
 *
 * Built by expo-linking for wherever the app is running - exp://<laptop>/--/
 * in Expo Go, smartflow:// in a build of its own - so the same code works in
 * both. Supabase only redirects to addresses on its allow list, so both kinds
 * have to be added there (Authentication -> URL Configuration).
 *
 * In Expo Go on a home network the laptop is an IP address, and Supabase
 * refuses those whatever the allow list says: "exp://192.168.2.196:8081/--/"
 * fell back to the Site URL, and Expo Go was sent to a server that did not
 * exist. So the IP goes in as a nip.io name - "192.168.2.196.nip.io" is public
 * DNS that answers with 192.168.2.196 - which Supabase accepts and which still
 * reaches the laptop.
 */
export function resetPasswordRedirect(): string {
  return Linking.createURL(RESET_PASSWORD_PATH).replace(
    /^exp:\/\/(\d{1,3}(?:\.\d{1,3}){3})(?=[:/])/,
    'exp://$1.nip.io',
  );
}

/**
 * Email a link for setting a new password.
 *
 * Supabase answers the same whether or not an account uses the address, so
 * that this cannot be used to find out who has one; the screen says so too.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  assertConfigured();
  const emailError = validateEmail(email);
  if (emailError !== null) {
    throw new Error(emailError);
  }
  const { error } = await getSupabase().auth.resetPasswordForEmail(email.trim(), {
    redirectTo: resetPasswordRedirect(),
  });
  if (error !== null) {
    throw new Error(friendlyAuthMessage(error));
  }
}

/** What the reset link carried: a session to set the password with, or why there is none. */
export type RecoveryLink =
  | { kind: 'session'; accessToken: string; refreshToken: string }
  | { kind: 'failed'; message: string }
  | { kind: 'none' };

/**
 * Read the reset link the app was opened with.
 *
 * Supabase sends the phone back with the session in the URL's #fragment
 * ("#access_token=...&refresh_token=...&type=recovery"), or with an error
 * there when the link was used already or has expired.
 */
export function readRecoveryLink(url: string | null): RecoveryLink {
  if (url === null || !url.includes(RESET_PASSWORD_PATH)) {
    return { kind: 'none' };
  }
  const params = new Map<string, string>();
  const query = url.split('?')[1]?.split('#')[0] ?? '';
  const fragment = url.split('#')[1] ?? '';
  for (const part of `${query}&${fragment}`.split('&')) {
    const [key, value] = part.split('=');
    if (key !== undefined && key.length > 0 && value !== undefined) {
      params.set(decodeURIComponent(key), decodeURIComponent(value.replace(/\+/g, ' ')));
    }
  }
  if (params.has('error') || params.has('error_code')) {
    const expired = params.get('error_code') === 'otp_expired';
    return {
      kind: 'failed',
      message: expired
        ? 'This reset link has expired or was already used. Ask for a new one.'
        : params.get('error_description') ?? 'This reset link does not work. Ask for a new one.',
    };
  }
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (accessToken === undefined || refreshToken === undefined) {
    return { kind: 'none' };
  }
  return { kind: 'session', accessToken, refreshToken };
}

/** Open the session a reset link carries, which may only set a new password. */
export async function openRecoverySession(accessToken: string, refreshToken: string): Promise<void> {
  assertConfigured();
  const { error } = await getSupabase().auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error !== null) {
    throw new Error('This reset link has expired or was already used. Ask for a new one.');
  }
}

/** Save the new password on the session the reset link opened. */
export async function saveNewPassword(password: string): Promise<void> {
  const passwordError = validateNewPassword(password);
  if (passwordError !== null) {
    throw new Error(passwordError);
  }
  const { error } = await getSupabase().auth.updateUser({ password });
  if (error !== null) {
    throw new Error(friendlyAuthMessage(error));
  }
}

/** Ends the Supabase session. Safe to call when already signed out. */
export async function signOutRemote(): Promise<void> {
  if (!isSupabaseConfigured) {
    return;
  }
  await getSupabase().auth.signOut();
}
