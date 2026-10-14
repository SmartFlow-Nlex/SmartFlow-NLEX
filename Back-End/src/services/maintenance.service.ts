import { db } from "../config/db.js";

// ---------------------------------------------------------------------------
// Maintenance schedules — persisted in nlex_maintenance_schedules (AWS RDS).
// IMPORTANT: this data is also consumed by the mobile app; keep the row shape
// and status vocabulary stable (scheduled | in_progress | completed | cancelled).
// ---------------------------------------------------------------------------

export type MaintenanceStatus = "scheduled" | "in_progress" | "completed" | "cancelled";

export type MaintenanceCreate = {
  title: string;
  description?: string;
  startKm: number;
  endKm: number;
  direction: "NB" | "SB" | "Both";
  laneClosure: string;
  startsAt: string;
  endsAt: string;
};

// Allowed lifecycle transitions. Reverts are permitted so operator mistakes
// can be undone: completed → in_progress (reopen), cancelled → scheduled
// (restore), in_progress → scheduled (revert).
const TRANSITIONS: Record<MaintenanceStatus, MaintenanceStatus[]> = {
  scheduled: ["in_progress", "completed", "cancelled"],
  in_progress: ["completed", "cancelled", "scheduled"],
  completed: ["in_progress"],
  cancelled: ["scheduled"],
};

const ROW_COLUMNS = `id, title, description, start_km::float AS start_km, end_km::float AS end_km,
  direction, lane_closure, starts_at, ends_at, status, status_reason, created_at, updated_at`;

/*
 * Which lanes a closure takes, from its text: "None", "Shoulder only",
 * "Full closure", "Lane 1 + Lane 2" (counted from the median, in the direction
 * of travel), or the older "1 lane" / "2 lanes", which does not say which.
 */
function parseLanes(text: string) {
  if (text === "Full closure") return { full: true, unknown: false, lanes: [] as string[] };
  if (text === "None") return { full: false, unknown: false, lanes: [] as string[] };
  if (text === "Shoulder only") return { full: false, unknown: false, lanes: ["Shoulder"] };
  if (/^\d lanes?$/.test(text)) return { full: false, unknown: true, lanes: [] as string[] };
  return { full: false, unknown: false, lanes: text.split(" + ") };
}

// Two closures clash when they take a lane in common, either is a full closure,
// or one is an old row that does not say which lanes. Different lanes on the
// same stretch is an operational matter, not a reason to refuse the save.
export function closuresClash(a: string, b: string) {
  const pa = parseLanes(a);
  const pb = parseLanes(b);
  if (pa.full || pb.full || pa.unknown || pb.unknown) return true;
  return pa.lanes.some((l) => pb.lanes.includes(l));
}

export type MaintenanceConflict = {
  id: string;
  title: string;
  direction: string;
  start_km: number;
  end_km: number;
  starts_at: string;
  ends_at: string;
  status: string;
  lane_closure: string;
};

// Grace for clock skew between the operator's machine and this server.
const PAST_START_GRACE_MS = 60_000;

/*
 * Live work that shares a carriageway, a stretch of road and a stretch of time
 * with the candidate. This is the authoritative check: the dashboard's conflict
 * panel is a preview of it, and the mobile app gets no panel at all.
 * Touching at a single km post is not an overlap, unless one side is a point
 * job (start = end), where being on the other's range counts.
 */
async function findConflicts(
  q: { query: (sql: string, params: unknown[]) => Promise<{ rows: MaintenanceConflict[] }> },
  data: MaintenanceCreate,
  excludeId: string | null,
) {
  const lo = Math.min(data.startKm, data.endKm);
  const hi = Math.max(data.startKm, data.endKm);
  const { rows } = await q.query(
    `SELECT id, title, direction, start_km::float AS start_km, end_km::float AS end_km,
            starts_at, ends_at, status, lane_closure
       FROM nlex_maintenance_schedules
      WHERE status IN ('scheduled', 'in_progress')
        AND ($1::uuid IS NULL OR id <> $1::uuid)
        AND (direction = $2 OR direction = 'Both' OR $2 = 'Both')
        AND starts_at < $4::timestamptz AND ends_at > $3::timestamptz
        AND CASE
              WHEN $5::numeric = $6::numeric OR LEAST(start_km, end_km) = GREATEST(start_km, end_km)
                THEN LEAST(start_km, end_km) <= $6::numeric AND GREATEST(start_km, end_km) >= $5::numeric
              ELSE LEAST(start_km, end_km) < $6::numeric AND GREATEST(start_km, end_km) > $5::numeric
            END
      ORDER BY starts_at`,
    [excludeId, data.direction, data.startsAt, data.endsAt, lo, hi],
  );
  // Only critical conflicts (same lane, or a full closure) refuse the save.
  return rows.filter((r) => closuresClash(data.laneClosure, r.lane_closure));
}

/*
 * Runs `work` in a transaction holding one advisory lock, so two operators (or
 * the dashboard and the mobile app) submitting overlapping work at the same
 * moment are checked one after the other instead of both seeing "no conflict".
 */
async function withScheduleLock<T>(work: (client: import("pg").PoolClient) => Promise<T>): Promise<T> {
  const client = await db!.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('nlex_maintenance_schedules'))");
    const out = await work(client);
    await client.query("COMMIT");
    return out;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function createMaintenanceScheduleInDb(data: MaintenanceCreate, allowOverlap = false) {
  if (!db) return null;
  try {
    if (new Date(data.startsAt).getTime() < Date.now() - PAST_START_GRACE_MS) {
      return { error: "past_start" as const };
    }
    return await withScheduleLock(async (client) => {
      if (!allowOverlap) {
        const conflicts = await findConflicts(client, data, null);
        if (conflicts.length > 0) return { error: "conflict" as const, conflicts };
      }
      const { rows } = await client.query(
        `INSERT INTO nlex_maintenance_schedules
           (title, description, start_km, end_km, direction, lane_closure, starts_at, ends_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING ${ROW_COLUMNS}`,
        [data.title, data.description ?? null, data.startKm, data.endKm, data.direction, data.laneClosure, data.startsAt, data.endsAt]
      );
      return { row: rows[0] };
    });
  } catch (error) {
    console.error("Database query failed for create maintenance:", error);
    return null;
  }
}

export async function getMaintenanceSchedulesFromDb(status?: MaintenanceStatus | "all") {
  if (!db) return null;
  try {
    const { rows } = await db.query(
      `SELECT ${ROW_COLUMNS} FROM nlex_maintenance_schedules
       WHERE ($1::text IS NULL OR status = $1)
       ORDER BY CASE status WHEN 'in_progress' THEN 0 WHEN 'scheduled' THEN 1 WHEN 'completed' THEN 2 ELSE 3 END,
                starts_at DESC`,
      [status && status !== "all" ? status : null]
    );
    return rows;
  } catch (error) {
    console.error("Database query failed for list maintenance:", error);
    return null;
  }
}

export async function updateMaintenanceScheduleInDb(id: string, data: MaintenanceCreate, allowOverlap = false) {
  if (!db) return null;
  try {
    return await withScheduleLock(async (client) => {
      const cur = await client.query(`SELECT starts_at, status FROM nlex_maintenance_schedules WHERE id = $1`, [id]);
      if (cur.rows.length === 0) return { error: "not_found" as const };
      // Only a start that is being moved has to be in the future: an in-progress
      // job's start is already behind it and is allowed to stay there.
      const startMoved = new Date(cur.rows[0].starts_at).getTime() !== new Date(data.startsAt).getTime();
      if (startMoved && new Date(data.startsAt).getTime() < Date.now() - PAST_START_GRACE_MS) {
        return { error: "past_start" as const };
      }
      if (!allowOverlap) {
        const conflicts = await findConflicts(client, data, id);
        if (conflicts.length > 0) return { error: "conflict" as const, conflicts };
      }
      const { rows } = await client.query(
        `UPDATE nlex_maintenance_schedules
         SET title = $2, description = $3, start_km = $4, end_km = $5,
             direction = $6, lane_closure = $7, starts_at = $8, ends_at = $9, updated_at = now()
         WHERE id = $1
         RETURNING ${ROW_COLUMNS}`,
        [id, data.title, data.description ?? null, data.startKm, data.endKm, data.direction, data.laneClosure, data.startsAt, data.endsAt]
      );
      return { row: rows[0] };
    });
  } catch (error) {
    console.error("Database query failed for update maintenance:", error);
    return null;
  }
}

export async function updateMaintenanceStatusInDb(id: string, status: MaintenanceStatus, reason?: string) {
  if (!db) return null;
  try {
    // Also when the schedule entered its current status, for the audit log's time-in-status: its
    // last status change or its creation as the audit log recorded them, else when the row was made.
    const cur = await db.query(
      `SELECT s.status,
              COALESCE((SELECT max(a."timestamp") FROM audit_logs a
                         WHERE a.target_resource = 'maintenance:' || s.id::text
                           AND a.action IN ('maintenance.status_changed', 'maintenance.schedule_created')),
                       s.created_at) AS since
         FROM nlex_maintenance_schedules s WHERE s.id = $1`,
      [id]);
    if (cur.rows.length === 0) return { error: "not_found" as const };
    const from: MaintenanceStatus = cur.rows[0].status;
    const since: Date | null = cur.rows[0].since ? new Date(cur.rows[0].since) : null;
    if (!TRANSITIONS[from].includes(status)) {
      return { error: "invalid_transition" as const, from };
    }
    const { rows } = await db.query(
      `UPDATE nlex_maintenance_schedules
       SET status = $2, status_reason = $3, updated_at = now()
       WHERE id = $1
       RETURNING ${ROW_COLUMNS}`,
      [id, status, reason ?? null]
    );
    return { row: rows[0], from, since };
  } catch (error) {
    console.error("Database query failed for maintenance status update:", error);
    return null;
  }
}

/**
 * Delete one schedule.
 *
 * Returns null when the database is unreachable, otherwise `{ deleted }`:
 * the removed row's status and title, or undefined when the id matched no
 * row. The caller answers each case differently and audits what was removed.
 *
 * This previously discarded rowCount and returned true unconditionally, so a
 * DELETE against an id that did not exist answered 200 "Deleted" and wrote an
 * audit entry for a deletion that never happened — the audit log recording an
 * event the database never saw. The update path already distinguished
 * not-found; this one did not.
 */
export async function deleteMaintenanceScheduleInDb(id: string) {
  if (!db) return null;
  try {
    const { rows } = await db.query(`DELETE FROM nlex_maintenance_schedules WHERE id = $1 RETURNING status, title`, [id]);
    return { deleted: rows[0] as { status: string; title: string } | undefined };
  } catch (error) {
    console.error("Database query failed for delete maintenance:", error);
    return null;
  }
}
