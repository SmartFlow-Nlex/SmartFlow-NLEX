import type { Request } from "express";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { isLocalRequest } from "./client-ip.js";

/* Per-client request limits for /api (audit P8-01 / H9, 21 Nov 2026).
 *
 * One limit of 200 per 15 minutes used to cover everything, counted before the route cache. A cache hit costs the
 * database nothing, yet one idle Live Map tab (about 170 requests per 15 minutes, nearly all cache hits) used most of
 * it, and the mobile app's backend was turned away with 429s. The limits are now split by what a request costs:
 *
 *   every request, cache hits included   3000 / 15 min   flood ceiling only (about 3 a second, sustained)
 *   reads that reach a handler            600 / 15 min   mounted AFTER routeCache, so a cached answer never counts
 *   writes (any non-GET)                  200 / 15 min   the old limit, now for writes alone
 *   /api/auth writes                       30 / 15 min   trusted-device pass and check, password emails
 *   /api/upload writes                     60 / 15 min   publish, undo and their ?mode=check dry runs
 *
 * A request is counted by every tier it belongs to; the strictest one that applies runs last, so its RateLimit
 * headers are the ones the caller sees. Keys are the client address from client-ip.ts (req.ip, with IPv6 grouped
 * by /56 as express-rate-limit recommends). The server's own warmer and a browser on this PC are never limited.
 * Sign-in itself and the authenticator code go to Supabase, which applies its own limits. */

const WINDOW_MS = 15 * 60_000;

const isRead = (req: Request) => req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS";
const under = (req: Request, prefix: string) => req.originalUrl.toLowerCase().startsWith(prefix);

function limiter(limit: number, skip: (req: Request) => boolean, message: string) {
  return rateLimit({
    windowMs: WINDOW_MS,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? "unknown"),
    skip: (req) => isLocalRequest(req) || skip(req),
    message: { success: false, code: "rate_limited", message },
  });
}

const GENERAL = "Too many requests from this IP, please try again after 15 minutes";

/** Every /api request, counted before the cache: a ceiling against floods, far above any dashboard or server client. */
const everyRequestLimiter = limiter(3000, () => false, GENERAL);
const writeLimiter = limiter(200, (req) => isRead(req), GENERAL);
const authWriteLimiter = limiter(30, (req) => isRead(req) || !under(req, "/api/auth"),
  "Too many sign-in requests from this address. Please wait a few minutes and try again.");
const uploadWriteLimiter = limiter(60, (req) => isRead(req) || !under(req, "/api/upload"),
  "Too many upload requests from this address. Please wait a few minutes and try again.");

/** Mounted on /api before routeCache, in this order (strictest last). */
export const limitsBeforeCache = [everyRequestLimiter, writeLimiter, authWriteLimiter, uploadWriteLimiter];

/** Mounted on /api after routeCache: only reads the cache could not answer reach it. /api/health is left to the
    flood ceiling, so a monitor or Render's health check is never refused for other traffic on its address. */
export const readLimiterAfterCache = limiter(600, (req) => !isRead(req) || under(req, "/api/health"), GENERAL);
