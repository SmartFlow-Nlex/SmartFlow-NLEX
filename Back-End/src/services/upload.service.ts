import { db } from "../config/db.js";
import { LATER_OVERLAP } from "../etl/undo.js";

// [ETL] Save Upload Record with detailed processing stats
export async function saveUploadRecordInDb(
  filename: string,
  records: number,
  datasetType?: string,
  status?: string
) {
  if (!db) return null;
  try {
    const { rows } = await db.query(`
      INSERT INTO data_uploads (filename, processed_records, dataset_type, status) 
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [filename, records, datasetType ?? "unknown", status ?? "processed"]);
    return rows[0];
  } catch (error: any) {
    // If dataset_type column doesn't exist yet, fall back to original schema
    if (error.code === "42703") {
      try {
        const { rows } = await db.query(`
          INSERT INTO data_uploads (filename, processed_records, status) 
          VALUES ($1, $2, $3)
          RETURNING *
        `, [filename, records, status ?? "processed"]);
        return rows[0];
      } catch (fallbackErr) {
        console.error("Database query failed for file upload save (fallback):", fallbackErr);
        return null;
      }
    }
    console.error("Database query failed for file upload save:", error);
    return null;
  }
}

/**
 * The latest uploads, newest first, for the Data Management page's history,
 * each with whether it can be undone (etl/undo.ts):
 *   available  its undo journal is kept and nothing later is in the way
 *   blocked    a later load still in place changed the same tables (undo_blocked_by: that upload)
 *   undone     already undone
 *   expired    too old: its journal was dropped
 *   null       made before undo existed, or it wrote nothing
 */
export async function listUploadsInDb(limit: number) {
  if (!db) return null;
  try {
    const { rows: [u] } = await db.query(`SELECT to_regclass('etl_undo.batches') IS NOT NULL AS ok`);
    const { rows } = u?.ok
      ? await db.query(
          `SELECT u.id, u.filename, u.dataset_type, u.status, u.processed_records, u.uploaded_at,
                  CASE WHEN b.id IS NULL THEN NULL
                       WHEN b.status <> 'active' THEN b.status
                       WHEN blk.id IS NOT NULL THEN 'blocked'
                       ELSE 'available' END AS undo,
                  blk.upload_id AS undo_blocked_by
             FROM data_uploads u
             LEFT JOIN etl_undo.batches b ON b.upload_id = u.id
             LEFT JOIN LATERAL (${LATER_OVERLAP}) blk ON b.id IS NOT NULL
            ORDER BY u.id DESC LIMIT $1`,
          [limit],
        )
      : await db.query(
          `SELECT id, filename, dataset_type, status, processed_records, uploaded_at, NULL AS undo, NULL AS undo_blocked_by
             FROM data_uploads ORDER BY id DESC LIMIT $1`,
          [limit],
        );
    return rows;
  } catch (error) {
    console.error("Database query failed for upload history:", error);
    return null;
  }
}

/** One row of gold.ml_batch_runs: one invocation of weekly_retrain.py. */
type BatchRow = {
  id: number;
  started_at: string | Date;
  finished_at: string | Date | null;
  trigger: string;
  status: string;
  summary: string | null;
  groups: { key: string; status: string; [k: string]: unknown }[] | null;
  host: string | null;
  log_file?: string | null;
};

/** Run by the cloud workflow (GitHub Actions checks the repo out under /home/runner/), where a batch runs in parts. */
const inCloud = (r: BatchRow) => (r.log_file ?? "").startsWith("/home/runner/");

/** How far apart the parts of one run may start. The cloud parts start within minutes of each other. */
const PART_WINDOW_MS = 15 * 60_000;

const selectedKeys = (r: BatchRow) => new Set((r.groups ?? []).filter((g) => g?.status !== "not selected").map((g) => g.key));
const ms = (t: string | Date) => new Date(t).getTime();

/**
 * The parts of one run, merged (17 Nov 2026 audit). The cloud batch runs as separate jobs
 * (.github/workflows/weekly-retrain.yml, "part 1 of 4" ...), each writing its own row that selects some model
 * groups (--only) and marks the rest "not selected". Shown one row at a time, the newest part (#29) read as
 * 10 of 11 groups "not selected" while the volume and incident results sat in #27 and #28 as "no new data".
 * Rows are parts of one run when both ran in the cloud workflow, have the same trigger and host, start within
 * PART_WINDOW_MS of the run's newest part, and select different model groups. Runs started by hand on a PC are
 * separate invocations and are never merged, however close together. Each group then shows the result of the part that
 * ran it, and the run's status and summary are worked out again from those, by weekly_retrain.py's own rule.
 * Expects rows newest first; returns runs newest first, with `parts` (the row ids, oldest first).
 */
export function groupRetrainRuns(rows: BatchRow[]) {
  const runs: BatchRow[][] = [];
  for (const r of rows) {
    const cur = runs[runs.length - 1];
    const newest = cur?.[0];
    const mine = selectedKeys(r);
    const joins =
      newest &&
      inCloud(r) &&
      inCloud(newest) &&
      r.trigger === newest.trigger &&
      (r.host ?? "") === (newest.host ?? "") &&
      ms(newest.started_at) - ms(r.started_at) <= PART_WINDOW_MS &&
      cur.every((p) => ![...selectedKeys(p)].some((k) => mine.has(k)));
    if (joins) cur.push(r);
    else runs.push([r]);
  }
  return runs.map(mergeParts);
}

function mergeParts(partsNewestFirst: BatchRow[]) {
  const parts = [...partsNewestFirst].sort((a, b) => a.id - b.id);
  const last = parts[parts.length - 1];
  if (parts.length === 1) return { ...last, parts: [last.id] };

  // Each group from the part that ran it (the latest such part), else as the latest part lists it.
  const order: string[] = [];
  const byKey = new Map<string, NonNullable<BatchRow["groups"]>[number]>();
  for (const p of parts) {
    for (const g of p.groups ?? []) {
      if (!g?.key) continue;
      if (!order.includes(g.key)) order.push(g.key);
      const had = byKey.get(g.key);
      if (!had || g.status !== "not selected" || had.status === "not selected") byKey.set(g.key, g);
    }
  }
  const groups = order.map((k) => byKey.get(k)!);

  // weekly_retrain.py's rule for a batch's status, over the merged groups; a part still running or stopped says so.
  const statuses = groups.map((g) => g.status);
  const counts = new Map<string, number>();
  for (const st of statuses) counts.set(st, (counts.get(st) ?? 0) + 1);
  const status = parts.some((p) => p.status === "running")
    ? "running"
    : parts.some((p) => p.status === "failed") || counts.has("restore failed")
      ? "failed"
      : parts.some((p) => p.status === "interrupted")
        ? "interrupted"
        : statuses.every((st) => st === "unchanged" || st === "not selected")
          ? "no new data"
          : counts.has("kept previous") || counts.has("cannot run here")
            ? "needs attention"
            : "retrained";
  const stopped = parts.filter((p) => p.status === "interrupted").map((p) => `#${p.id}`);
  const summary =
    [...counts.entries()].map(([k, v]) => `${v} ${k}`).join(", ") +
    (stopped.length ? `; part ${stopped.join(", ")} stopped before it finished` : "");

  return {
    id: last.id,
    parts: parts.map((p) => p.id),
    started_at: parts.reduce((a, p) => (ms(p.started_at) < ms(a) ? p.started_at : a), parts[0].started_at),
    finished_at: parts.some((p) => !p.finished_at)
      ? null
      : parts.reduce((a, p) => (ms(p.finished_at!) > ms(a!) ? p.finished_at : a), parts[0].finished_at),
    trigger: last.trigger,
    status,
    summary,
    groups,
    host: last.host,
    log_file: last.log_file,
  };
}

/**
 * The weekly retrain batches, newest first (gold.ml_batch_runs, written by
 * smartflow_scripts/3_training_testing/weekly_retrain/weekly_retrain.py), with the parts of one run merged
 * (groupRetrainRuns). The table appears with the first batch, so before then this is an empty list.
 */
export async function listRetrainRunsInDb(limit: number) {
  if (!db) return null;
  try {
    const { rows: [t] } = await db.query(`SELECT to_regclass('gold.ml_batch_runs') IS NOT NULL AS ok`);
    if (!t?.ok) return [];
    // Enough rows for `limit` runs of up to four parts each.
    const { rows } = await db.query(
      `SELECT id, started_at, finished_at, trigger, status, summary, groups, host, log_file
         FROM gold.ml_batch_runs ORDER BY id DESC LIMIT $1`,
      [Math.min(200, limit * 5)],
    );
    return groupRetrainRuns(rows as BatchRow[]).slice(0, limit);
  } catch (error) {
    console.error("Database query failed for retrain runs:", error);
    return null;
  }
}
