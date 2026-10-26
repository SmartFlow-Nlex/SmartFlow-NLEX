/* Read-only database access for the integration tests.
 *
 * Import this module FIRST in every integration test file, before anything
 * from src/. It forces every Postgres session opened in this process — the
 * test's own client and the app's pool in src/config/db.ts alike — to start
 * with default_transaction_read_only = on, so an INSERT/UPDATE/DELETE/DDL is
 * refused by the server itself ("cannot execute ... in a read-only
 * transaction"). node-pg reads PGOPTIONS whenever the connection string has
 * no `options` parameter; assertReadOnly() checks both conditions and the
 * resulting session setting, and the tests refuse to run if any fails. */
process.env.PGOPTIONS = "-c default_transaction_read_only=on";

import pg from "pg";
import { env } from "../../src/config/env.js";

export const hasDb = Boolean(env.POSTGRES_URL);

let client: pg.Client | null = null;

async function getClient(): Promise<pg.Client> {
  if (client) return client;
  if (!env.POSTGRES_URL) throw new Error("POSTGRES_URL is not configured");
  if (new URL(env.POSTGRES_URL).searchParams.has("options")) {
    throw new Error("POSTGRES_URL carries its own `options`; PGOPTIONS would be ignored, refusing to run");
  }
  const c = new pg.Client({
    connectionString: env.POSTGRES_URL,
    ssl: env.PG_SSL_MODE === "disable" ? undefined : { rejectUnauthorized: false },
    connectionTimeoutMillis: 45_000,
    statement_timeout: 120_000,
  });
  await c.connect();
  client = c;
  return c;
}

/** Throws unless the session is read-only. Call once in a before() hook. */
export async function assertReadOnly(): Promise<void> {
  const c = await getClient();
  const { rows } = await c.query(
    "SELECT current_setting('default_transaction_read_only') AS d, current_setting('transaction_read_only') AS t"
  );
  if (rows[0].d !== "on" || rows[0].t !== "on") {
    throw new Error(`session is not read-only (default=${rows[0].d}, current=${rows[0].t})`);
  }
}

let readiness: Promise<string | null> | null = null;

/** null when a read-only session is open; otherwise why the database cannot be used. Tried once per process. */
export function dbUnavailable(): Promise<string | null> {
  if (!readiness) {
    readiness = (async () => {
      if (!hasDb) return "no database configured (POSTGRES_URL)";
      const t0 = Date.now();
      try {
        await assertReadOnly();
        return null;
      } catch (e: any) {
        if (/not read-only|carries its own/.test(String(e?.message))) throw e; // never run against a writable session
        return `database unreachable: ${e?.code ?? ""} ${e?.message ?? e} after ${Math.round((Date.now() - t0) / 1000)} s`.trim();
      }
    })();
  }
  return readiness;
}

/** SELECT through the read-only session. */
export async function q<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  if (!/^\s*(select|with)\b/i.test(sql)) throw new Error("only SELECT/WITH statements are allowed here");
  const c = await getClient();
  const { rows } = await c.query(sql, params);
  return rows as T[];
}

/** Close the test client and the app pool so node:test can exit. */
export async function closeAll(): Promise<void> {
  if (client) await client.end().catch(() => {});
  client = null;
  readiness = null;
  const { db } = await import("../../src/config/db.js");
  if (db) await db.end().catch(() => {});
}
