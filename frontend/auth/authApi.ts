import { AuthError, User } from '@supabase/supabase-js';
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

export const MIN_PASSWORD_LENGTH = 6;

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

export function validatePassword(value: string): string | null {
  if (value.length === 0) {
    return 'Enter your password.';
  }
  if (value.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
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
 * give "Ysabela", not "J." or "Ma." - because taking the first word made Lex
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

/** Supabase's own wording is aimed at developers; these are aimed at commuters. */
function friendlyAuthMessage(error: AuthError): string {
  const raw = error.message.toLowerCase();
  if (raw.includes('invalid login credentials')) {
    return 'That email and password do not match an account.';
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
  const passwordError = validatePassword(password);
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

/** Ends the Supabase session. Safe to call when already signed out. */
export async function signOutRemote(): Promise<void> {
  if (!isSupabaseConfigured) {
    return;
  }
  await getSupabase().auth.signOut();
}
