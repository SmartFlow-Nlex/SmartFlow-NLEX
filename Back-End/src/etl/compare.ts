/**
 * "Is this the right file?" — how an upload compares with what the warehouse
 * already holds for the same keys, measured inside the load's transaction
 * before anything is replaced, so a check shows it too.
 */
import type { PoolClient } from "pg";

export type UploadComparison =
  | {
      kind: "toll";
      /** Plaza-days in the file, and how many of them are already loaded. */
      plazaDays: number;
      replaced: number;
      /** Over the plaza-hours already loaded: their total now, and in the file. */
      loadedTotal: number;
      fileTotal: number;
      threshold: number;
      /** Plaza-days whose total moves by more than `threshold`, the largest first. */
      flagged: number;
      examples: { date: string; plaza: string; loaded: number; file: number }[];
    }
  | {
      kind: "records";
      /** Records the file holds that are already loaded, and how many of them it would change. */
      matched: number;
      changed: number;
    };

/** A replaced plaza-day whose total moves more than this is flagged. */
export const DIFF_THRESHOLD = 0.25;
/** Below this many vehicles a plaza-day's percentage swings are noise, not a wrong file. */
const MIN_VOLUME = 200;

const q = (id: string) => `"${id.replace(/"/g, '""')}"`;

/** Compares the staged toll file (temp table th_fact) with gold.fact_traffic_hourly, plaza by day. */
export async function compareToll(c: PoolClient): Promise<UploadComparison> {
  const r = await c.query(`
    SELECT k.date::text AS date, k.exit_canonical AS plaza,
           COUNT(f.date)::int AS matched,
           COALESCE(SUM(k.total) FILTER (WHERE f.date IS NOT NULL), 0)::float8 AS file,
           COALESCE(SUM(f.total), 0)::float8 AS loaded
      FROM th_fact k
      LEFT JOIN gold.fact_traffic_hourly f
        ON f.date = k.date AND f.hour = k.hour AND f.exit_canonical = k.exit_canonical AND f.status = k.status
       AND f.direction IS NOT DISTINCT FROM k.direction AND f.role IS NOT DISTINCT FROM k.role
       AND f.toll_system IS NOT DISTINCT FROM k.toll_system
     GROUP BY 1, 2`);
  const rows = r.rows as { date: string; plaza: string; matched: number; file: number; loaded: number }[];
  const replaced = rows.filter((x) => x.matched > 0);
  const move = (x: { file: number; loaded: number }) => Math.abs(x.file - x.loaded) / x.loaded;
  const flagged = replaced
    .filter((x) => x.loaded >= MIN_VOLUME && move(x) > DIFF_THRESHOLD)
    .sort((a, b) => move(b) - move(a));
  return {
    kind: "toll",
    plazaDays: rows.length,
    replaced: replaced.length,
    loadedTotal: Math.round(replaced.reduce((s, x) => s + x.loaded, 0)),
    fileTotal: Math.round(replaced.reduce((s, x) => s + x.file, 0)),
    threshold: DIFF_THRESHOLD,
    flagged: flagged.length,
    examples: flagged.slice(0, 5).map((x) => ({ date: x.date, plaza: x.plaza, loaded: Math.round(x.loaded), file: Math.round(x.file) })),
  };
}

/**
 * For an upsert by `key` (the event logs): how many staged records (temp table
 * etl_upload) are already loaded, and how many of those differ in any column.
 * Compared as text, so a column type without an equality operator cannot stop
 * the load; and in a savepoint, so a comparison that fails is just left out.
 */
export async function compareRecords(c: PoolClient, table: string, key: string, columns: string[]): Promise<UploadComparison | null> {
  const cols = columns.filter((col) => col !== key);
  if (cols.length === 0) return null;
  await c.query("SAVEPOINT compare");
  try {
    const r = await c.query(`
      SELECT COUNT(*)::int AS matched,
             COUNT(*) FILTER (WHERE (${cols.map((col) => `t.${q(col)}::text`).join(", ")})
                       IS DISTINCT FROM (${cols.map((col) => `u.${q(col)}::text`).join(", ")}))::int AS changed
        FROM ${table} t
        JOIN (SELECT DISTINCT ON (${q(key)}) * FROM etl_upload ORDER BY ${q(key)}, __n DESC) u ON t.${q(key)} = u.${q(key)}`);
    await c.query("RELEASE SAVEPOINT compare");
    return { kind: "records", matched: r.rows[0].matched, changed: r.rows[0].changed };
  } catch {
    await c.query("ROLLBACK TO SAVEPOINT compare");
    return null;
  }
}

/**
 * The staged toll file (temp table th_fact) against the same period a year earlier in gold.fact_traffic_hourly
 * (6 Nov 2026). The comparison above measures the file against what is loaded for the SAME days, which for a new
 * period is often a synthetic or earlier version of it; a year earlier is the real yardstick for "is this plausible":
 * trips per day by month, each plaza's trips per day, and the class mix. Read-only, in a savepoint, so a failure only
 * leaves the profile out.
 */
export type TollProfile = {
  months: { month: string; days: number; perDay: number; priorDays: number; priorPerDay: number | null; ratio: number | null }[];
  plazas: { plaza: string; perDay: number; priorPerDay: number | null; ratio: number | null; flagged: boolean }[];
  /** Class 1 / 2 / 3 shares of trips, %, in the file and the year before. */
  classShare: { file: [number, number, number]; prior: [number, number, number] | null };
  /** A plaza is flagged when it moves more than `threshold` from a year earlier and carries at least `minVolume` a day. */
  threshold: number;
  minVolume: number;
  flagged: number;
};

export const PROFILE_THRESHOLD = 0.2;
const PROFILE_MIN_VOLUME = 300;

export async function profileToll(c: PoolClient): Promise<TollProfile | null> {
  await c.query("SAVEPOINT profile");
  try {
    const months = await c.query(`
      WITH f AS (SELECT to_char(date, 'YYYY-MM') AS m, COUNT(DISTINCT date)::int AS days, SUM(total)::float8 AS trips
                   FROM th_fact GROUP BY 1),
           lim AS (SELECT date_trunc('month', MIN(date)) - interval '1 year' AS a,
                          date_trunc('month', MAX(date)) + interval '1 month' - interval '1 year' AS b FROM th_fact),
           p AS (SELECT to_char(t.date + interval '1 year', 'YYYY-MM') AS m, COUNT(DISTINCT t.date)::int AS days,
                        SUM(t.total)::float8 AS trips
                   FROM gold.fact_traffic_hourly t, lim WHERE t.date >= lim.a AND t.date < lim.b GROUP BY 1)
      SELECT f.m AS month, f.days, f.trips / f.days AS per_day, COALESCE(p.days, 0) AS prior_days,
             CASE WHEN p.days > 0 THEN p.trips / p.days END AS prior_per_day
        FROM f LEFT JOIN p USING (m) ORDER BY f.m`);
    const plazas = await c.query(`
      WITH rng AS (SELECT MIN(date) AS a, MAX(date) AS b, COUNT(DISTINCT date)::float8 AS n FROM th_fact),
           f AS (SELECT exit_canonical AS plaza, SUM(total)::float8 AS trips FROM th_fact GROUP BY 1),
           pr AS (SELECT t.exit_canonical AS plaza, SUM(t.total)::float8 AS trips
                    FROM gold.fact_traffic_hourly t, rng
                   WHERE t.date BETWEEN (rng.a - interval '1 year')::date AND (rng.b - interval '1 year')::date GROUP BY 1),
           pn AS (SELECT COUNT(DISTINCT t.date)::float8 AS n FROM gold.fact_traffic_hourly t, rng
                   WHERE t.date BETWEEN (rng.a - interval '1 year')::date AND (rng.b - interval '1 year')::date)
      SELECT COALESCE(f.plaza, pr.plaza) AS plaza, COALESCE(f.trips, 0) / rng.n AS per_day,
             CASE WHEN pn.n > 0 THEN COALESCE(pr.trips, 0) / pn.n END AS prior_per_day
        FROM f FULL JOIN pr USING (plaza) CROSS JOIN rng CROSS JOIN pn`);
    const cls = await c.query(`
      WITH rng AS (SELECT MIN(date) AS a, MAX(date) AS b FROM th_fact)
      SELECT 'file' AS k, SUM(class_1)::float8 AS c1, SUM(class_2)::float8 AS c2, SUM(class_3)::float8 AS c3 FROM th_fact
      UNION ALL
      SELECT 'prior', SUM(t.class_1)::float8, SUM(t.class_2)::float8, SUM(t.class_3)::float8
        FROM gold.fact_traffic_hourly t, rng
       WHERE t.date BETWEEN (rng.a - interval '1 year')::date AND (rng.b - interval '1 year')::date`);
    await c.query("RELEASE SAVEPOINT profile");

    const ratio = (a: number, b: number | null) => (b && b > 0 ? a / b : null);
    const share = (r: { c1: number; c2: number; c3: number } | undefined): [number, number, number] | null => {
      if (!r) return null;
      const t = (r.c1 ?? 0) + (r.c2 ?? 0) + (r.c3 ?? 0);
      return t > 0 ? [r.c1 / t * 100, r.c2 / t * 100, r.c3 / t * 100] : null;
    };
    const pl = (plazas.rows as { plaza: string; per_day: number; prior_per_day: number | null }[]).map((r) => {
      const rt = ratio(r.per_day, r.prior_per_day);
      const big = Math.max(r.per_day, r.prior_per_day ?? 0) >= PROFILE_MIN_VOLUME;
      return {
        plaza: r.plaza,
        perDay: Math.round(r.per_day),
        priorPerDay: r.prior_per_day == null ? null : Math.round(r.prior_per_day),
        ratio: rt,
        flagged: big && r.prior_per_day != null && (rt === null || Math.abs(rt - 1) > PROFILE_THRESHOLD),
      };
    }).sort((a, b) => b.perDay - a.perDay);
    const byK = new Map((cls.rows as { k: string; c1: number; c2: number; c3: number }[]).map((r) => [r.k, r]));
    return {
      months: (months.rows as { month: string; days: number; per_day: number; prior_days: number; prior_per_day: number | null }[]).map((r) => ({
        month: r.month, days: r.days, perDay: Math.round(r.per_day), priorDays: r.prior_days,
        priorPerDay: r.prior_per_day == null ? null : Math.round(r.prior_per_day), ratio: ratio(r.per_day, r.prior_per_day),
      })),
      plazas: pl,
      classShare: { file: share(byK.get("file")) ?? [0, 0, 0], prior: share(byK.get("prior")) },
      threshold: PROFILE_THRESHOLD,
      minVolume: PROFILE_MIN_VOLUME,
      flagged: pl.filter((p) => p.flagged).length,
    };
  } catch {
    await c.query("ROLLBACK TO SAVEPOINT profile");
    return null;
  }
}
