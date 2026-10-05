import { app } from "./app.js";
import { env } from "./config/env.js";
import { verifyDbConnection } from "./config/db.js";
import { setSelfBase } from "./middleware/route-cache.js";

/* A rejected promise that escapes a handler must not take the API down.
 *
 * Every route is wrapped in asyncHandler now, but that is a discipline someone
 * has to keep: the dashboard routes were the exception, and one RDS connection
 * timeout inside them killed the process mid-session. Node's default for an
 * unhandled rejection is to throw and exit, which turns one failed request
 * into an outage. Log it and stay up -- that request has already failed on its
 * own. An uncaught synchronous exception is left alone to crash, because the
 * process state after one is not trustworthy. */
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection (server kept running):", reason);
});

app.listen(env.PORT, async () => {
  console.log(`smartflow-backend running on http://localhost:${env.PORT}`);
  await verifyDbConnection();
  startCacheWarmer();
});

/* Keep the slow endpoints warm so no user request lands on a cold cache.
 *
 * The RDS instance behind this API is small and its cold reads are erratic:
 * the live-map queries plan at 13 ms and 73 ms, yet a cold request measured
 * 10-16 s repeatedly, with no other session on the database. A TTL cache
 * turns that into 5 ms for everyone after the first caller -- but the first
 * caller still waits. Refreshing each key from here, just inside its TTL,
 * moves the slow read off the request path entirely. The cost is one query
 * per interval whether or not anyone is looking, which on these intervals is
 * a few dozen queries an hour.
 *
 * Self-requests to the real routes, deliberately: they exercise the same
 * handlers, cache keys and defaults the browser uses, so a key can never be
 * warmed under one name and requested under another.
 */
function startCacheWarmer(): void {
  // The route cache refreshes stale entries by calling back into this server.
  setSelfBase(`http://127.0.0.1:${env.PORT}`);
  if (process.env.CACHE_WARMER === "off") return;
  const base = `http://127.0.0.1:${env.PORT}/api`;
  // x-cache-bypass makes the warmer refill the entry rather than read it.
  const warm = (path: string) =>
    fetch(`${base}${path}`, { headers: { "x-cache-bypass": "1" } }).catch(() => undefined);

  /* Interval sits inside the TTL the route cache assigns (30 s live, 10 min
     otherwise). The list is every route that measured over ~1 s: the first
     three from the initial pass, the rest from timing all 33 GET routes.
     /incident/severity is here because it measured 120 s cold and 14 s warm;
     one refill every nine minutes is the price of nobody ever waiting on it. */
  const jobs: [string, number][] = [
    ["/map-comparison/real-time", 25_000],
    ["/dashboard/corridor-status/full", 25_000],
    ["/map-comparison/live-overview", 25_000],
    ["/traffic/forecast?months=all", 9 * 60_000],
    ["/incident/predictive", 9 * 60_000],
    ["/incident/severity", 9 * 60_000],
    ["/incident/weather-speed", 9 * 60_000],
    ["/incident/weather-correlation", 9 * 60_000],
    ["/incident/spatial", 9 * 60_000],
    ["/incident/event-breakdown", 9 * 60_000],
    ["/traffic/weather-evidence", 9 * 60_000],
    ["/emissions/forecast", 9 * 60_000],
    ["/dashboard/overview", 9 * 60_000],
    /* Added 7 Oct 2026, from timing every page signed in: the URLs the pages
       actually request. The Incidents page asks for event-breakdown WITH
       ?months=12, a different cache key from the one above. */
    ["/incident/event-breakdown?months=12", 9 * 60_000],
    ["/traffic/analytics?months=12", 9 * 60_000],
    ["/incident/analytics?months=12", 9 * 60_000],
    ["/emissions/analytics?months=12", 9 * 60_000],
    ["/map-comparison/exits", 9 * 60_000],
    ["/emissions/fleet-profile", 9 * 60_000],
    ["/audit-log/list?limit=500", 9 * 60_000],
    ["/audit-log/summary?days=30", 9 * 60_000],
  ];
  /* The sandbox's first load (7 Oct 2026): 20-30 s of reads, every visit,
     because they were never warmed. Each is seconds of full-table scans and
     plaza-flows alone runs five queries at once, so staggered like the jobs
     above they would overlap and fill the pool of ten. They are warmed one
     after another instead, once the staggered group is under way, and the
     round repeats on the same nine minutes. (The two plaza-flow directions
     share one build. Balintawak southbound is not here: it has no observed
     demand, answers 404, and only a 200 is ever cached.) */
  const sandboxJobs = [
    "/ai-sandbox/plaza-flows?direction=NB",
    "/ai-sandbox/plaza-flows?direction=SB",
    "/ai-sandbox/scenario",
    "/ai-sandbox/demand-profile?exit=Balintawak&direction=NB",
    "/traffic/analytics?months=12&direction=NB",
    "/traffic/analytics?months=12&direction=SB",
  ];
  /* Stagger them.
   *
   * Firing all thirteen at once put thirteen concurrent queries against a pool
   * of ten, on an instance where a cold connection can take several seconds.
   * The pool saturated at every boot: the slowest warm requests were measured
   * at 32 s, 37 s and 64 s, and anything a browser asked for meanwhile waited
   * behind them and timed out at 45 s. The dashboard looked broken for the
   * first minute of every restart.
   *
   * A second and a half apart costs twenty seconds to warm everything once,
   * which no one is waiting on, and keeps the pool free for real requests.
   * The repeat is offset by the same amount so the groups never re-align. */
  const STAGGER_MS = 1_500;
  jobs.forEach(([path, every], i) => {
    const start = setTimeout(() => {
      void warm(path);
      const t = setInterval(() => void warm(path), every);
      t.unref();
    }, i * STAGGER_MS);
    start.unref();
  });

  let sandboxBusy = false;
  const warmSandbox = async () => {
    if (sandboxBusy) return; // a slow round is never doubled up by the next one
    sandboxBusy = true;
    try { for (const path of sandboxJobs) await warm(path); } finally { sandboxBusy = false; }
  };
  const sandboxStart = setTimeout(() => {
    void warmSandbox();
    const t = setInterval(() => void warmSandbox(), 9 * 60_000);
    t.unref();
  }, jobs.length * STAGGER_MS);
  sandboxStart.unref();
}
