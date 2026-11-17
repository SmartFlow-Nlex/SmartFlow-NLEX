import { db } from "../config/db.js";

/** How long the database check may take before the database is reported down. */
const DB_CHECK_MS = 2000;

/**
 * GET /api/health. The API answers, so the request succeeds (HTTP 200) whatever the database does: other
 * things poll this to see the API is up. What it says now (17 Nov 2026 audit; it answered "ok" without
 * looking at anything) is whether the warehouse answered a SELECT 1 within DB_CHECK_MS:
 *   db: "up" | "down" | "not_configured", with dbMs, the round trip, when it is up.
 */
export async function getHealth() {
  return {
    status: "ok",
    ...(await checkDb()),
    timestamp: new Date().toISOString(),
  };
}

async function checkDb(): Promise<{ db: "up" | "down" | "not_configured"; dbMs?: number; dbError?: string }> {
  if (!db) return { db: "not_configured" };
  const t0 = Date.now();
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      db.query("SELECT 1"),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`no answer within ${DB_CHECK_MS / 1000} s`)), DB_CHECK_MS);
      }),
    ]);
    return { db: "up", dbMs: Date.now() - t0 };
  } catch (e) {
    // Only the kind of failure, never the driver's message: it can carry the database host (security audit #9).
    const timedOut = e instanceof Error && e.message.startsWith("no answer");
    return { db: "down", dbError: timedOut ? `no answer within ${DB_CHECK_MS / 1000} s` : "the query failed" };
  } finally {
    clearTimeout(timer);
  }
}
