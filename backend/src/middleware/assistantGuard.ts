import { createHash } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * Who may use Navie, and how often.
 *
 * Before this, anyone who found the backend's address (it is in the public
 * repository and in the app) could call the assistant and spend our model
 * credit. Now each request must carry the caller's own Supabase sign-in, checked
 * with Supabase itself, and must have passed the app's six-digit code (aal2).
 * Each signed-in user, and each address, gets a small number of requests a
 * minute.
 *
 * The check runs only when the server knows the Supabase project
 * (SUPABASE_URL and SUPABASE_ANON_KEY). Without them - a laptop running the
 * backend for development - it is off and says so once in the log.
 * ASSISTANT_REQUIRE_SIGN_IN=false turns it off on purpose; ASSISTANT_REQUIRE_AAL2=false
 * accepts a password-only sign-in.
 */

const SIGN_IN_TIMEOUT_MS = 8000;
const SESSION_CACHE_MS = 5 * 60 * 1000;
const SESSION_CACHE_MAX = 1000;

interface Session {
  userId: string;
  at: number;
}

const sessions = new Map<string, Session>();
let warnedOff = false;

function settings() {
  const url = process.env.SUPABASE_URL ?? '';
  const anonKey = process.env.SUPABASE_ANON_KEY ?? '';
  return {
    url,
    anonKey,
    enabled: url.length > 0 && anonKey.length > 0 && (process.env.ASSISTANT_REQUIRE_SIGN_IN ?? 'true').toLowerCase() !== 'false',
    requireAal2: (process.env.ASSISTANT_REQUIRE_AAL2 ?? 'true').toLowerCase() !== 'false',
  };
}

/** The `aal` claim of a JWT already accepted by Supabase. */
function aalOf(token: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as { aal?: unknown };
    return typeof payload.aal === 'string' ? payload.aal : null;
  } catch {
    return null;
  }
}

/** Asks Supabase whose token this is. Null for no one (expired, forged, signed out). */
async function verify(token: string, url: string, anonKey: string): Promise<string | null> {
  const key = createHash('sha256').update(token).digest('hex');
  const hit = sessions.get(key);
  if (hit !== undefined && Date.now() - hit.at < SESSION_CACHE_MS) {
    return hit.userId;
  }
  const response = await fetch(`${url}/auth/v1/user`, {
    method: 'GET',
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(SIGN_IN_TIMEOUT_MS),
  });
  if (!response.ok) {
    return null;
  }
  const user = (await response.json()) as { id?: unknown };
  if (typeof user.id !== 'string') {
    return null;
  }
  sessions.set(key, { userId: user.id, at: Date.now() });
  while (sessions.size > SESSION_CACHE_MAX) {
    sessions.delete(sessions.keys().next().value as string);
  }
  return user.id;
}

/** The caller's verified user id, for the rate limit; set by requireSignIn. */
export interface GuardedRequest extends Request {
  assistantUser?: string;
}

export async function requireSignIn(req: Request, res: Response, next: NextFunction): Promise<void> {
  const { url, anonKey, enabled, requireAal2 } = settings();
  if (!enabled) {
    if (!warnedOff) {
      warnedOff = true;
      console.warn('[assistant] sign-in check is OFF (SUPABASE_URL / SUPABASE_ANON_KEY not set, or ASSISTANT_REQUIRE_SIGN_IN=false)');
    }
    next();
    return;
  }
  const header = req.header('authorization') ?? '';
  const token = /^Bearer (\S+)$/.exec(header)?.[1];
  if (token === undefined) {
    res.status(401).json({ success: false, error: 'Sign in required', message: 'Please sign in to use Navie.' });
    return;
  }
  let userId: string | null;
  try {
    userId = await verify(token, url, anonKey);
  } catch {
    // Fail closed: if we cannot tell who this is, Navie is not available to them.
    res.status(503).json({ success: false, error: 'Sign-in check unavailable', message: 'Navie could not check your sign-in. Please try again.' });
    return;
  }
  if (userId === null) {
    res.status(401).json({ success: false, error: 'Sign in required', message: 'Your sign-in has expired. Please sign in again.' });
    return;
  }
  if (requireAal2 && aalOf(token) !== 'aal2') {
    res.status(401).json({ success: false, error: 'Code required', message: 'Please finish signing in with your six-digit code.' });
    return;
  }
  (req as GuardedRequest).assistantUser = userId;
  next();
}

/* ------------------------------------------------------------- rate limit */

const hits = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const HITS_MAX_KEYS = 5000;

function limitFor(name: string, fallback: number): number {
  const value = Number(process.env[`ASSISTANT_LIMIT_${name.toUpperCase()}_PER_MIN`]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

/** At most `perMinute` requests a minute for each signed-in user (or address, when the check is off). */
export function rateLimit(name: string, perMinute: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const limit = limitFor(name, perMinute);
    const who = (req as GuardedRequest).assistantUser ?? `ip:${req.ip ?? 'unknown'}`;
    const key = `${name}|${who}`;
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
    if (recent.length >= limit) {
      const retry = Math.max(1, Math.ceil((WINDOW_MS - (now - recent[0])) / 1000));
      res.setHeader('Retry-After', String(retry));
      res.status(429).json({ success: false, error: 'Too many requests', message: `Too many questions at once. Try again in ${retry} seconds.` });
      return;
    }
    recent.push(now);
    hits.delete(key);
    hits.set(key, recent);
    while (hits.size > HITS_MAX_KEYS) {
      hits.delete(hits.keys().next().value as string);
    }
    next();
  };
}

/** For tests. */
export function resetGuard(): void {
  sessions.clear();
  hits.clear();
  warnedOff = false;
}
