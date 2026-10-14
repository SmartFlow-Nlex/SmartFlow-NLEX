/* The second sign-in step: a code from an authenticator app.
 *
 * Ported from the dashboard's `Front-End-Dashboard/lib/mfa.ts` so both products
 * enforce the same rule the same way. Supabase records how far a session has
 * got in its token's `aal` claim: "aal1" once the password is accepted, "aal2"
 * once a six-digit code (TOTP) has been accepted as well. Only "aal2" counts as
 * signed in.
 *
 * What is DIFFERENT here, and deliberately so:
 *
 *   - No QR code. The dashboard draws one because the operator is at a desk
 *     with their phone in hand. Here the authenticator is usually on the same
 *     phone, and a phone cannot photograph its own screen - so enrolment opens
 *     the authenticator directly through the `otpauth://` link, and falls back
 *     to a setup key typed by hand.
 *   - The JWT payload is decoded by hand rather than with `atob`, which is not
 *     guaranteed on every Hermes build this app ships to.
 *
 * NOTE: this app and the dashboard are on DIFFERENT Supabase projects
 * (jzkghkoaojdkusbjttgw here, qjbnilmopummgivymdiq there), so an authenticator
 * added on one is not the same factor as one added on the other. Each has to be
 * enrolled once.
 */
import type { Session } from '@supabase/supabase-js';
import { getSupabase } from './supabaseClient';

/** How the authenticator app labels the account. */
const ISSUER = 'SmartFlow NLEX';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Decode base64url without `atob`.
 *
 * React Native's JS engine does not reliably provide `atob` across the builds
 * this ships to, and a missing global here would fail the one check that
 * decides whether someone is signed in - which must never fail open.
 */
function decodeBase64Url(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  let bits = '';
  let out = '';
  for (const char of padded) {
    if (char === '=') {
      break;
    }
    const index = B64.indexOf(char);
    if (index < 0) {
      continue;
    }
    bits += index.toString(2).padStart(6, '0');
  }
  for (let at = 0; at + 8 <= bits.length; at += 8) {
    out += String.fromCharCode(parseInt(bits.slice(at, at + 8), 2));
  }
  return out;
}

/** One claim from an access token's payload, or undefined when it cannot be read. */
function claimOf(accessToken: string, name: string): unknown {
  try {
    const payload = accessToken.split('.')[1] ?? '';
    return (JSON.parse(decodeBase64Url(payload)) as Record<string, unknown>)[name];
  } catch {
    return undefined;
  }
}

/**
 * Whether a session has passed both steps.
 *
 * Anything other than an explicit "aal2" is a no, including a token with no
 * `aal` claim at all. Read from the token rather than asked of the client
 * library, because this is called from inside the auth listener where calling
 * back into the library can deadlock it.
 */
export function isFullySignedIn(session: Session | null): boolean {
  return session !== null && claimOf(session.access_token, 'aal') === 'aal2';
}

/** What the user must do after the password: enter a code, or first add the app. */
export type SecondStep =
  | { kind: 'verify'; factorId: string }
  | { kind: 'enroll'; factorId: string; uri: string; secret: string };

/**
 * Decide the second step for the session the password just opened.
 *
 * An account with an authenticator already added is asked for its code. One
 * without is enrolled now and cannot reach the app until the first code from
 * the new authenticator is accepted, so no account is left on a password alone.
 */
export async function beginSecondStep(): Promise<SecondStep> {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error !== null) {
    throw error;
  }

  const added = data.totp[0]; // `totp` lists verified factors only
  if (added !== undefined) {
    return { kind: 'verify', factorId: added.id };
  }

  // An enrolment that was started and abandoned leaves an unverified factor
  // behind. Clear those first so each attempt starts from one fresh secret.
  for (const factor of data.all) {
    if (factor.factor_type === 'totp' && factor.status === 'unverified') {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
  }

  const enrolled = await supabase.auth.mfa.enroll({ factorType: 'totp', issuer: ISSUER });
  if (enrolled.error !== null) {
    throw enrolled.error;
  }
  return {
    kind: 'enroll',
    factorId: enrolled.data.id,
    uri: enrolled.data.totp.uri,
    secret: enrolled.data.totp.secret,
  };
}

/**
 * Check a six-digit code.
 *
 * On success the session is raised to "aal2" and its new access token is
 * returned; for an enrolment this is also what confirms the authenticator and
 * keeps it.
 */
export async function submitCode(factorId: string, code: string): Promise<string> {
  const { data, error } = await getSupabase().auth.mfa.challengeAndVerify({
    factorId,
    code: code.trim(),
  });
  if (error !== null) {
    throw error;
  }
  return data.access_token;
}

/**
 * End a session that only ever passed the password step.
 *
 * Such a session is never resumed: the code step always follows a password
 * typed in the same run, so a half-finished sign-in left on a borrowed phone
 * cannot be picked up by the next person. "local" ends this device's session
 * only; the account stays signed in elsewhere.
 */
export async function dropPasswordOnlySession(): Promise<void> {
  try {
    await getSupabase().auth.signOut({ scope: 'local' });
  } catch {
    // Already gone, or offline. Either way there is nothing to end.
  }
}

/** True when the password-step session is gone, so the code step cannot finish. */
export function signInTimedOut(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === 'session_not_found' || code === 'session_expired';
}

/** Say what went wrong at the second step, and what to do about it. */
export function secondStepProblem(error: unknown): string {
  const e = (error ?? {}) as { code?: string; status?: number; message?: string };
  switch (e.code) {
    case 'mfa_verification_failed':
      return 'That code is not right. Enter the code your authenticator app is showing now.';
    case 'mfa_challenge_expired':
      return 'That took too long. Enter the code your authenticator app is showing now.';
    case 'over_request_rate_limit':
      return 'Too many attempts. Wait a minute, then try again.';
    case 'mfa_totp_enroll_not_enabled':
    case 'mfa_totp_verify_not_enabled':
      return 'Authenticator sign-in is switched off for this project. Ask an administrator to turn it on in Supabase.';
    case 'session_not_found':
    case 'session_expired':
      return 'Your sign-in timed out. Enter your password again.';
    default:
      break;
  }
  if (e.status === 429) {
    return 'Too many attempts. Wait a minute, then try again.';
  }
  return e.message ?? 'The code could not be checked. Try again.';
}

/** A setup key as someone will type it: groups of four. */
export function groupKey(secret: string): string {
  return secret.replace(/(.{4})(?=.)/g, '$1 ');
}
