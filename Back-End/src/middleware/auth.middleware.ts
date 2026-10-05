import type { Request, Response, NextFunction } from "express";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";

/*
 * Session verification and role authorization.
 *
 * Three things changed here, each for a reason worth keeping written down.
 *
 * 1. The project URL and anon key were hardcoded as fallbacks. A deployment
 *    that set neither variable therefore started cleanly and verified operator
 *    tokens against the development project -- the failure a reader would least
 *    expect, because nothing looks broken. The client is now built from env
 *    only, and a protected route with no configuration refuses to serve rather
 *    than guessing (see requireConfigured below).
 *
 * 2. An expired token returned 403. HTTP reserves 401 for "your credential did
 *    not authenticate you, try again" and 403 for "it authenticated you and the
 *    answer is still no". Returning 403 for both made the two indistinguishable
 *    to a client, which is why the dashboard could not implement a silent
 *    refresh: it had no way to tell a stale token from a forbidden role, and
 *    retrying the second is pointless. 401 now means refresh and retry; 403
 *    means stop.
 *
 * 3. The role fell back to "data-analyst", the most privileged role, whenever
 *    user_metadata carried none. Least privilege now applies instead.
 */

/** Mirrors Front-End-Dashboard/lib/auth-access.ts. Keep the two in step. */
const FALLBACK_ROLE = "incident-operator";

let client: SupabaseClient | null = null;

/** Built once, and only when both variables are present. */
function getSupabase(): SupabaseClient | null {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null;
  if (!client) client = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
  return client;
}

export interface AuthenticatedRequest extends Request {
  user?: any;
  userRole?: string;
}

/* Tokens Supabase has already accepted, remembered for up to a minute.
 *
 * Every protected request used to wait on a round trip to Supabase (measured
 * 0.2-0.6 s) before its handler ran, even for the same token a moment apart.
 * A minute is short against a token's hour of life: a sign-out elsewhere, or a
 * role change, takes effect within it. An entry never outlives the token's own
 * expiry, and only acceptances are kept, so a rejected token is always asked
 * about again. (7 Oct 2026, latency pass.) */
const ACCEPTED_TTL_MS = 60_000;
const accepted = new Map<string, { until: number; user: any; role: string }>();

/** The token's own expiry in ms (the JWT's exp claim), or 0 when it cannot be read. */
function expiryOf(token: string): number {
  try {
    const exp = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")).exp;
    return typeof exp === "number" ? exp * 1000 : 0;
  } catch {
    return 0;
  }
}

/**
 * Verify the bearer token and attach the caller's identity and role.
 *
 * `code` is machine-readable so the dashboard can act on the reason rather than
 * parsing prose: "token_expired" and "token_invalid" are worth a refresh
 * attempt, the others are not.
 */
export async function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  // What a protected route answers depends on who asked, so the route cache
  // must never store it (routeCache reads this flag).
  res.locals.authRequired = true;
  const supabase = getSupabase();
  if (!supabase) {
    // Fail closed. An endpoint that cannot verify a token must not serve the
    // data it was protecting.
    return res.status(503).json({
      success: false,
      code: "auth_unconfigured",
      message: "Authentication is not configured on this server",
    });
  }

  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      code: "token_missing",
      message: "Access token is required",
    });
  }

  const known = accepted.get(token);
  if (known && Date.now() < known.until) {
    req.user = known.user;
    req.userRole = known.role;
    return next();
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      const expired = /expire/i.test(error?.message ?? "");
      return res.status(401).json({
        success: false,
        code: expired ? "token_expired" : "token_invalid",
        message: expired ? "Access token has expired" : "Access token is invalid",
      });
    }

    req.user = user;
    req.userRole = user.user_metadata?.role || FALLBACK_ROLE;
    const until = Math.min(Date.now() + ACCEPTED_TTL_MS, expiryOf(token));
    if (until > Date.now()) {
      if (accepted.size > 500) accepted.clear(); // bounded: a burst of new tokens simply starts over
      accepted.set(token, { until, user, role: req.userRole ?? FALLBACK_ROLE });
    }
    next();
  } catch (err) {
    return res.status(500).json({
      success: false,
      code: "auth_error",
      message: "Internal server authentication error",
    });
  }
}

/**
 * The user a bearer token belongs to, checked with Supabase, or null when the
 * token is missing, invalid, Supabase is not configured, or it does not answer
 * in time. For the audit log, which must name who did something without ever
 * slowing the action down: answers are cached for five minutes per token, and a
 * lookup gives up after four seconds. Same client and same least-privilege
 * fallback role as authenticateToken.
 */
const verified = new Map<string, { at: number; user: { email: string; role: string } | null }>();
export async function verifiedUser(token: string | undefined): Promise<{ email: string; role: string } | null> {
  const supabase = getSupabase();
  if (!token || !supabase) return null;
  const hit = verified.get(token);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.user;
  const lookup = supabase.auth.getUser(token).then(({ data, error }) =>
    error || !data.user ? null : { email: data.user.email ?? data.user.id, role: data.user.user_metadata?.role || FALLBACK_ROLE });
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 4_000));
  const user = await Promise.race([lookup.catch(() => null), timeout]);
  if (verified.size > 500) verified.clear();
  verified.set(token, { at: Date.now(), user });
  return user;
}

/**
 * Restrict a route to the listed roles.
 *
 * Always 403: the caller authenticated successfully and the token is current,
 * so there is nothing for them to retry.
 */
export function authorizeRoles(allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.userRole) {
      return res.status(403).json({
        success: false,
        code: "role_missing",
        message: "Access denied: user role not defined",
      });
    }

    if (!allowedRoles.includes(req.userRole)) {
      return res.status(403).json({
        success: false,
        code: "role_denied",
        message: "Access denied: unauthorized role",
      });
    }

    next();
  };
}
