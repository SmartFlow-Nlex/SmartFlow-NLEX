import type { Request, Response, NextFunction } from "express";
import { bypassScope } from "../utils/ttl-cache.js";

/* Route-level cache for GET JSON responses.
 *
 * Eight more endpoints measured slow after the first three were cached by
 * hand -- /incident/severity at 120 s cold and 14 s warm, weather-speed at
 * 19 s, emissions/forecast at 8 s, weather-evidence at 4.5 s -- and every one
 * of them reads tables that change only when a script re-runs. Wrapping
 * each controller individually does not scale and misses the next route
 * someone adds, so this sits once on /api and applies to any successful GET.
 *
 * Behaviour:
 *   - TTL by path prefix: live feeds 30 s, everything else 10 min.
 *   - Single-flight: concurrent misses for one URL share one handler run.
 *   - Stale-while-revalidate: an expired entry is served immediately and a
 *     background self-request refreshes it, so after the first fill no user
 *     waits on a slow query. Live feeds only up to LIVE_MAX_STALE_MS old.
 *   - Writes invalidate: any non-GET under a prefix clears that prefix, so a
 *     PATCH to /maintenance/:id/status is followed by a fresh list. A
 *     published upload or undo refreshes everything.
 *   - Only 200 JSON bodies are stored; errors and 401s pass through untouched,
 *     and so does anything a route behind authenticateToken answers.
 *   - x-cache-bypass: 1 skips the cache and refills it (the refresher and the
 *     warmer use it).
 */
type Entry = { at: number; status: number; body: unknown };

const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<void>>();
const refreshing = new Set<string>();

/* Endpoints behind authenticateToken, which must never be cached.
 *
 * This middleware is mounted on /api AHEAD of the router, so it answers before
 * any route-level auth middleware runs. A protected GET that reached the store
 * was therefore served from it to whoever asked next, with no token required --
 * an authorization bypass through the cache rather than around the middleware.
 * The 10-minute default TTL applied to most of these.
 *
 * Only the protected members of each group are listed. /emissions/analytics is public by design and keeps its
 * caching. /audit-log/list and /summary are signed-in only now (data analyst); they are not listed, but
 * authenticateToken marks their answers and a marked answer is never stored (below), so no one is served
 * another reader's audit log (checked 24 Nov 2026, ZAP review).
 */
const PROTECTED_PREFIXES = [
  "/api/emissions/index",
  "/api/emissions/peak-penalty",
  "/api/emissions/resilience",
  "/api/audit-log/export",
  "/api/ai-sandbox/results",
  "/api/data-management",
  "/api/upload",
];

/** True when a URL must bypass the cache because authorization decides the answer. */
function isProtected(url: string): boolean {
  return PROTECTED_PREFIXES.some((p) => url.startsWith(p));
}

/* Never stored, never served from the store (audit P8-24, 21 Nov 2026): a health probe must see the database as it
   is now. A cached "db: up" was served STALE a minute after it was measured.
   /api/mobile-config too (26 Nov 2026): it is one row, and a save from another server (the dashboard on a laptop
   writes the same table) cannot clear this server's copy, so Render kept handing phones the old switches for up to
   the three-hour record lifetime. The app re-reads it every minute; each read must see the table as it is. */
const UNCACHED_PREFIXES = ["/api/health", "/api/mobile-config"];

const LIVE_PREFIXES = ["/api/map-comparison/real-time", "/api/map-comparison/live-overview", "/api/map-comparison/live-rain",
  "/api/traffic/realtime", "/api/dashboard/corridor-status"];
const SHORT_PREFIXES = ["/api/maintenance", "/api/audit-log"];

/* How old a live answer may be and still be served while it refreshes (audit P8-06, 21 Nov 2026).
   Stale-while-revalidate had no cap: the first reader after a quiet spell (the warmer stops two minutes after the
   last read) was handed an 11-minute-old /real-time snapshot whose own ageMinutes said 1.7, inside a 6-minute live
   window. Past this age the reader waits for a fresh answer instead. Two TTLs: a watched feed is refreshed every
   25 s, so it never gets here unless its refresh is slow or nobody was looking. live-rain gets more: its upstream
   (Open-Meteo, 15-minute data) is fetched at most every 5 minutes anyway. */
const LIVE_MAX_STALE_MS = 60_000;
const LIVE_RAIN_MAX_STALE_MS = 10 * 60_000;

/** Infinity (serve stale at any age) except for the live feeds. */
function maxStaleFor(url: string): number {
  if (url.startsWith("/api/map-comparison/live-rain")) return LIVE_RAIN_MAX_STALE_MS;
  if (LIVE_PREFIXES.some((p) => url.startsWith(p))) return LIVE_MAX_STALE_MS;
  return Infinity;
}
/* Rewritten by the congestion pipeline every hour, and each response carries
   the base_ts it was computed from. Ten minutes of that is a forecast map
   captioned with the wrong base hour; the read behind it is one horizon of
   nineteen rows, so a short TTL costs little. */
/* /api/emissions/prescriptive too (17 Nov 2026): its Class 3 window and tolling cards follow the same hourly
   congestion forecast, and a three-hour copy kept them on a forecast up to three runs old. The service keeps its
   own ten-minute copy, so a refresh here reruns its heavy queries at most every ten minutes, and only while read. */
const FORECAST_PREFIXES = ["/api/map-comparison/forecast", "/api/emissions/prescriptive"];

/* Historical reads (2026-10-15): three hours, not ten minutes. The record they read changes only when an upload
   is published (which clears this cache, below) or a model is retrained (weekly), so a ten-minute lifetime made
   the warmer re-run every heavy query six times an hour for answers that had not changed. On the micro RDS
   instance that drained its CPU and disk burst credits to zero and throttled the whole database. */
const RECORD_TTL_MS = 3 * 60 * 60_000;
/** At most this many cached answers (and read timestamps); the dashboard itself uses a few hundred URLs. */
const MAX_ENTRIES = 1500;

export function ttlFor(url: string): number {
  if (LIVE_PREFIXES.some((p) => url.startsWith(p))) return 30_000;
  if (SHORT_PREFIXES.some((p) => url.startsWith(p))) return 15_000;
  if (FORECAST_PREFIXES.some((p) => url.startsWith(p))) return 60_000;
  return RECORD_TTL_MS;
}

/** When each URL was last asked for by a reader (not by the warmer), so live feeds are only kept warm while watched. */
const lastRead = new Map<string, number>();
export function lastReadAt(url: string): number {
  return lastRead.get(url) ?? 0;
}

/* New data published: every cached answer may be out of date. Each one is refetched in the background, a second
   and a half apart so the database is not hit with all of them at once, and served stale until its turn. */
function refreshEverything(): void {
  // A read that started before the publish and ends after it must not write the old record back over a refresh.
  publishGeneration += 1;
  [...store.keys()].forEach((url, i) => {
    const t = setTimeout(() => refreshInBackground(url), i * 1_500);
    t.unref?.();
  });
}

/* An empty answer is never worth serving stale.
 *
 * The congestion pipeline rewrites its table hourly and can extend how far
 * ahead it reaches. Before one such run /forecast?hours=24 genuinely had no
 * rows, so this cache stored an empty FeatureCollection whose model block
 * reported maxHorizon 12 - correct at the time. After the run the warehouse
 * held 168 horizons, but the next reader was still handed that empty body,
 * and the horizon picker reads maxHorizon from it: the "Next 24 h" and "Next
 * 7 days" buttons stayed disabled, so nobody could ask a second time and
 * collect the fresh copy the background refresh had just fetched.
 *
 * Reproducing an empty result is cheap and can only improve on it, so a stale
 * entry with no payload is treated as a miss rather than as an answer. */
function isEmptyPayload(body: unknown): boolean {
  if (body == null || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  if (Array.isArray(b.features)) return b.features.length === 0;
  if (Array.isArray(b.data)) return b.data.length === 0;
  return false;
}

function prefixOf(url: string): string {
  // "/api/incident/predictive?x=1" -> "/api/incident". Lower case: Express routes /api/Upload/file to the same
  // handler as /api/upload/file, so a write's group must not depend on how the caller spelled it.
  const m = /^(\/api\/[^/?]+)/.exec(url);
  return (m ? m[1] : url).toLowerCase();
}

/* A write also bumps its group's generation (17 Oct 2026, testers' MS-8: "cancel seems to delete it").
   Clearing the entries was not enough on its own: a read that STARTED before the write -- a background
   refresh, or another page's poll -- finished after it and put the old answer back, so the maintenance
   page was served a list where the cancelled job was still "scheduled": gone from Scheduled, missing
   from Cancelled, and Restore acting on stale data. An answer is now stored only if its group's
   generation is the one it started under, so nothing read before a write can outlive it. */
const generation = new Map<string, number>();
/* Bumped by every published upload or undo, which changes every group at once (refreshEverything). Both counters
   only grow, so their sum changes whenever either does. */
let publishGeneration = 0;
const generationOf = (url: string) => publishGeneration + (generation.get(prefixOf(url)) ?? 0);

export function invalidatePrefix(prefix: string): void {
  const group = prefix.toLowerCase();
  generation.set(group, (generation.get(group) ?? 0) + 1);
  for (const key of store.keys()) if (key.toLowerCase().startsWith(group)) store.delete(key);
}

let selfBase: string | null = null;
/** The warmer and the background refresher call back into this server. */
export function setSelfBase(base: string): void { selfBase = base; }

function refreshInBackground(url: string): void {
  if (!selfBase || refreshing.has(url)) return;
  refreshing.add(url);
  fetch(`${selfBase}${url}`, { headers: { "x-cache-bypass": "1" } })
    .catch(() => undefined)
    .finally(() => refreshing.delete(url));
}

export function routeCache(req: Request, res: Response, next: NextFunction): void {
  const url = req.originalUrl;

  /*
   * What may be stored, and who may be served from the store.
   *
   * The path list is the first guard: those routes never touch the store.
   *
   * The second guard used to skip the cache for any request carrying an
   * Authorization header. That stopped being cheap when the dashboard began
   * attaching the user's token to every backend request (lib/backend-auth.ts):
   * from then on no signed-in reader was ever served from here, and each page
   * waited out its slow reads in full -- the sandbox 20-30 s, the audit log
   * 3-4 s -- while the warmer refilled entries nobody read.
   *
   * Since 7 Oct 2026 that guard sits on the STORE side instead.
   * authenticateToken marks every response it lets through
   * (res.locals.authRequired) and a marked response is never stored, so the
   * store holds only answers given without asking who was calling -- the same
   * for everybody -- and anyone may be served from it. A protected endpoint
   * added later and forgotten in the list above is still never stored.
   */

  /* A CORS preflight or a HEAD changes nothing. An anonymous OPTIONS used to clear a whole group's cache, so a
     stranger could force the slow queries to rerun at will (security audit #7, 9 Nov 2026). */
  if (req.method === "OPTIONS" || req.method === "HEAD") return next();

  /* Writes are handled BEFORE the protected-route return below (audit P8-04, 21 Nov 2026). /api/upload is a
     protected prefix, so with the return first, a published upload or undo never reached the refresh hook and every
     module kept serving the old record for up to the three-hour lifetime. A write only registers what happens when
     it finishes; it never reads or fills the store, so protected answers stay out of it. */
  if (req.method !== "GET") {
    // A write under a prefix makes every cached read under it suspect. Not the
    // page-view beacon: every page opened posts to /audit-log/activity, so the
    // audit log's entries were cleared on each navigation and never served.
    // Audited actions clear them instead (writeAudit, services/audit.ts).
    if (!url.toLowerCase().startsWith("/api/audit-log/activity")) {
      // Only a write that signed in (authenticateToken marks it) can change shared data; an anonymous POST that
      // happened to succeed does not get to empty the cache.
      res.on("finish", () => { if (res.statusCode < 400 && res.locals.authRequired) invalidatePrefix(prefixOf(url)); });
    }
    /* A published upload or an undo changes the record every module reads. A ?mode=check dry run does not: decided
       exactly as the upload controller decides it. Successful (2xx) and signed in, like any write allowed to
       change shared data. */
    if (prefixOf(url) === "/api/upload" && String(req.query.mode ?? "") !== "check") {
      res.on("finish", () => {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.locals.authRequired) refreshEverything();
      });
    }
    return next();
  }

  if (isProtected(url) || UNCACHED_PREFIXES.some((p) => url.startsWith(p))) {
    return next();
  }

  // Only the server's own warmer and refresher send this, from this machine. From anyone else it would let a
  // stranger force every heavy query to rerun on the shared database at will (2 Nov 2026), so it is ignored.
  const fromHere = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress ?? "");
  const bypass = req.headers["x-cache-bypass"] === "1" && fromHere;
  if (!bypass) {
    if (lastRead.size >= MAX_ENTRIES && !lastRead.has(url)) lastRead.delete(lastRead.keys().next().value as string);
    lastRead.set(url, Date.now());
  }
  const ttl = ttlFor(url);
  const hit = store.get(url);
  const fresh = hit != null && Date.now() - hit.at < ttl;
  /* A live entry past its cap is not served (LIVE_MAX_STALE_MS). The caller waits for a fresh answer, and that run
     reaches past the controllers' own cache too: it was filled by the same refresh and is just as old. */
  const maxStale = maxStaleFor(url);
  const tooOld = (e: Entry | undefined): boolean => e != null && Date.now() - e.at > maxStale;

  if (!bypass && hit && fresh) {
    res.setHeader("X-Cache", "HIT");
    res.status(hit.status).json(hit.body);
    return;
  }
  if (!bypass && hit && !fresh && !tooOld(hit) && !isEmptyPayload(hit.body)) {
    // Serve what we have now; bring the next reader a fresh copy.
    res.setHeader("X-Cache", "STALE");
    res.status(hit.status).json(hit.body);
    refreshInBackground(url);
    return;
  }
  // An expired entry holding nothing falls through to the miss path below, so
  // this caller waits for a real answer instead of being told there is none.

  // Miss (or bypass). Coalesce concurrent misses for this URL: later callers
  // wait for the first run, then answer from the store. A caller that finds
  // nothing there -- the run failed, answered with something other than JSON,
  // or was a protected route, which is never stored -- runs the handler itself
  // and gets its own answer (this used to be a 503 for everyone waiting).
  const running = inflight.get(url);
  if (running && !bypass) {
    running.then(() => {
      const e = store.get(url);
      // Still the over-age live entry: that run failed, so this caller tries for itself rather than take it.
      if (e && !tooOld(e)) { res.setHeader("X-Cache", "HIT"); res.status(e.status).json(e.body); }
      else runHandler(res, next, url, false, tooOld(e));
    });
    return;
  }

  let settle!: () => void;
  const p = new Promise<void>((r) => { settle = r; });
  inflight.set(url, p);
  const done = () => { if (inflight.get(url) === p) inflight.delete(url); settle(); };
  res.on("finish", done);
  res.on("close", done);
  runHandler(res, next, url, bypass, bypass || tooOld(hit));
}

/** Run the route's own handler, keeping its answer when it is the same for everybody. `skipInner` makes the
    controllers' own TTL cache reproduce its entries too (a bypass, or a live entry past its cap). */
function runHandler(res: Response, next: NextFunction, url: string, bypass: boolean, skipInner = bypass): void {
  const originalJson = res.json.bind(res);
  const startedUnder = generationOf(url);
  res.json = ((body: unknown) => {
    // authRequired: authenticateToken let this through, so the answer depends on who asked.
    // startedUnder: a write to this group since the handler began makes this answer stale.
    // noStore: the route answered, but with something incomplete it does not want kept (17 Oct 2026).
    if (res.statusCode === 200 && !res.locals.authRequired && !res.locals.noStore && generationOf(url) === startedUnder) {
      // Bounded: every new query string used to add a 3-hour entry with no limit (security audit #7). The oldest
      // entry goes first; Map keeps insertion order.
      if (store.size >= MAX_ENTRIES && !store.has(url)) store.delete(store.keys().next().value as string);
      store.set(url, { at: Date.now(), status: 200, body });
    }
    res.setHeader("X-Cache", bypass ? "REFRESH" : "MISS");
    return originalJson(body);
  }) as typeof res.json;
  // A bypass reaches past this layer to the controllers' own TTL cache; see
  // bypassScope in utils/ttl-cache.
  if (skipInner) bypassScope.run({ bypass: true }, () => next());
  else next();
}
