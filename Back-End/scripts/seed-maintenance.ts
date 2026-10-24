/**
 * Fills nlex_maintenance_schedules with realistic test data: a few weeks of
 * completed and cancelled jobs behind today, work in progress now, and
 * scheduled work ahead — plus one overdue start and one pair of overlapping
 * jobs on different lanes, so the alert bar and conflict views have something
 * to show.
 *
 * Every row is tagged "[seed]" at the end of its description, so the script
 * only ever touches its own rows:
 *
 *   npm run seed-maintenance             (remove old seed rows, insert fresh ones)
 *   npm run seed-maintenance -- --remove (remove seed rows, insert nothing)
 *   npm run seed-maintenance -- --wipe   (delete EVERY row first, not just seed rows)
 *   npm run seed-maintenance -- --dry    (print what would be inserted)
 *
 * Dates are relative to the moment it runs, in Philippine Time, so re-running
 * keeps the data centred on "now". This writes to whatever database
 * Back-End/.env points at — and the mobile app reads the same table.
 */
import { Pool } from "pg";
import { env } from "../src/config/env.js";

const TAG = "[seed]";
const remove = process.argv.includes("--remove");
const dry = process.argv.includes("--dry");
const wipe = process.argv.includes("--wipe");

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const PH_OFFSET = 8 * HOUR;
const todayStart = Math.floor((Date.now() + PH_OFFSET) / DAY) * DAY - PH_OFFSET; // PHT midnight

type Status = "scheduled" | "in_progress" | "completed" | "cancelled";
type Job = {
  title: string;
  note: string;
  dir: "NB" | "SB";
  lo: number;
  hi: number;
  closure: string;
  day: number; // days from today (negative = past), PHT
  from: number; // start hour, PHT (ignored when rel is set)
  rel?: number; // start this many hours from the moment the script runs
  hours: number;
  status: Status;
  reason?: string;
};

const JOBS: Job[] = [
  // ── Past: completed ───────────────────────────────────────────────────────
  { title: "Asphalt overlay", note: "Resurfacing of the outer lanes before the rainy season.", dir: "NB", lo: 20, hi: 24.5, closure: "Lane 3", day: -21, from: 22, hours: 6, status: "completed" },
  { title: "Expansion joint repair", note: "Bridge deck joint replacement.", dir: "SB", lo: 31, hi: 31.6, closure: "Lane 2 + Lane 3", day: -19, from: 21, hours: 7, status: "completed" },
  { title: "Guardrail replacement", note: "Damaged W-beam section after a vehicle impact.", dir: "NB", lo: 45.2, hi: 46, closure: "Shoulder only", day: -18, from: 9, hours: 8, status: "completed" },
  { title: "Pavement marking", note: "Repainting of lane lines and chevrons.", dir: "SB", lo: 52, hi: 60, closure: "Lane 1", day: -16, from: 23, hours: 5, status: "completed" },
  { title: "Drainage cleaning", note: "Culvert desilting ahead of typhoon season.", dir: "NB", lo: 68, hi: 70, closure: "Shoulder only", day: -14, from: 8, hours: 9, status: "completed" },
  { title: "Signage replacement", note: "Overhead gantry signs, Km 33 exit.", dir: "SB", lo: 33, hi: 33.4, closure: "Lane 1 + Lane 2", day: -13, from: 22, hours: 6, status: "completed" },
  { title: "Lighting maintenance", note: "Replacement of failed lamp heads.", dir: "NB", lo: 14, hi: 19, closure: "None", day: -11, from: 19, hours: 8, status: "completed" },
  { title: "Pothole patching", note: "Cold-mix patching, outer lane.", dir: "SB", lo: 76, hi: 78, closure: "Lane 3", day: -10, from: 10, hours: 5, status: "completed" },
  { title: "Median barrier repair", note: "Concrete barrier segments realigned.", dir: "NB", lo: 38, hi: 39.2, closure: "Lane 1", day: -8, from: 21, hours: 8, status: "completed" },
  { title: "Bridge inspection", note: "Routine structural inspection, underside access.", dir: "SB", lo: 58.4, hi: 58.9, closure: "Shoulder only", day: -7, from: 9, hours: 6, status: "completed" },
  { title: "CCTV cabling", note: "Fibre run for new traffic cameras.", dir: "NB", lo: 26, hi: 30, closure: "Shoulder only", day: -5, from: 8, hours: 10, status: "completed" },
  { title: "Toll plaza canopy repair", note: "Canopy panel and gutter repair.", dir: "SB", lo: 83, hi: 83.3, closure: "Lane 3", day: -4, from: 22, hours: 7, status: "completed" },
  { title: "Slope protection", note: "Embankment grass and riprap repair.", dir: "NB", lo: 72, hi: 75, closure: "Shoulder only", day: -3, from: 8, hours: 8, status: "completed" },
  { title: "Rumble strip installation", note: "Shoulder rumble strips.", dir: "SB", lo: 41, hi: 44, closure: "Shoulder only", day: -2, from: 9, hours: 6, status: "completed" },

  // ── Past: cancelled ───────────────────────────────────────────────────────
  { title: "Road widening survey", note: "Topographic survey along the shoulder.", dir: "NB", lo: 55, hi: 58, closure: "Shoulder only", day: -12, from: 9, hours: 6, status: "cancelled", reason: "Postponed: survey crew reassigned to emergency repair." },
  { title: "Asphalt overlay", note: "Second pass, inner lane.", dir: "SB", lo: 62, hi: 66, closure: "Lane 1", day: -9, from: 22, hours: 6, status: "cancelled", reason: "Heavy rain forecast; rescheduled." },
  { title: "Fence repair", note: "Right-of-way fence section.", dir: "NB", lo: 80, hi: 81, closure: "None", day: -6, from: 8, hours: 5, status: "cancelled", reason: "Contractor unavailable." },

  // ── Now: in progress ──────────────────────────────────────────────────────
  { title: "Asphalt repair", note: "Rutting repair, two outer lanes.", dir: "NB", lo: 32, hi: 38, closure: "Lane 2 + Lane 3", day: 0, from: 0, rel: -3, hours: 8, status: "in_progress" },
  { title: "Barrier repair", note: "Median barrier damaged in last week's crash.", dir: "SB", lo: 51, hi: 55, closure: "Lane 1", day: 0, from: 0, rel: -2, hours: 7, status: "in_progress" },

  // ── Overdue: scheduled but the start has passed (shows in the alert bar) ──
  { title: "Lane marking touch-up", note: "Spot repainting after resurfacing.", dir: "NB", lo: 47, hi: 49, closure: "Lane 3", day: 0, from: 0, rel: -1, hours: 4, status: "scheduled" },

  // ── Upcoming ──────────────────────────────────────────────────────────────
  { title: "Barrier replacement", note: "Replace damaged guardrail, both approaches.", dir: "SB", lo: 44, hi: 49, closure: "Lane 1", day: 0, from: 0, rel: 1.5, hours: 4, status: "scheduled" },
  { title: "Lighting maintenance", note: "Lamp head replacement, Km 61-64.", dir: "NB", lo: 61, hi: 64, closure: "Shoulder only", day: 0, from: 0, rel: 6, hours: 5, status: "scheduled" },
  { title: "Pavement grooving", note: "Skid-resistance grooving.", dir: "NB", lo: 24, hi: 27, closure: "Lane 1", day: 1, from: 22, hours: 6, status: "scheduled" },
  // The next two share Km 70-73 northbound at the same time on different lanes:
  // an operational conflict, not a blocking one.
  { title: "Drainage structure repair", note: "Headwall and culvert repair.", dir: "NB", lo: 70, hi: 73, closure: "Lane 3", day: 2, from: 21, hours: 7, status: "scheduled" },
  { title: "Median planting", note: "Landscaping along the median.", dir: "NB", lo: 71, hi: 74, closure: "Lane 1", day: 2, from: 22, hours: 5, status: "scheduled" },
  { title: "Bridge bearing replacement", note: "Elastomeric bearings; traffic shifted to one lane.", dir: "SB", lo: 28, hi: 28.6, closure: "Lane 1 + Lane 2", day: 3, from: 22, hours: 8, status: "scheduled" },
  { title: "Toll plaza resurfacing", note: "Concrete slab replacement at the plaza approach.", dir: "NB", lo: 84, hi: 85, closure: "Full closure", day: 4, from: 1, hours: 4, status: "scheduled" },
  { title: "Signage cleaning", note: "Overhead sign wash.", dir: "SB", lo: 15, hi: 22, closure: "Shoulder only", day: 5, from: 9, hours: 8, status: "scheduled" },
  { title: "Asphalt overlay", note: "Inner lane resurfacing.", dir: "SB", lo: 36, hi: 40.5, closure: "Lane 1", day: 6, from: 22, hours: 6, status: "scheduled" },
  { title: "Expansion joint repair", note: "Joint sealant replacement.", dir: "NB", lo: 56.8, hi: 57.3, closure: "Lane 2 + Lane 3", day: 8, from: 21, hours: 7, status: "scheduled" },
  { title: "Guardrail end-treatment", note: "Crash-cushion installation.", dir: "SB", lo: 66, hi: 66.4, closure: "Shoulder only", day: 10, from: 8, hours: 6, status: "scheduled" },
  { title: "Pothole patching", note: "Post-typhoon repairs, to be confirmed.", dir: "NB", lo: 78, hi: 82, closure: "Lane 3", day: 12, from: 22, hours: 6, status: "scheduled" },
  { title: "Sign gantry inspection", note: "Annual structural check.", dir: "NB", lo: 33, hi: 33.4, closure: "Lane 1", day: 14, from: 23, hours: 4, status: "scheduled" },
  { title: "Resurfacing, full width", note: "Complete resurfacing of the carriageway, Km 15-20.", dir: "SB", lo: 15, hi: 20, closure: "Full closure", day: 17, from: 0, hours: 5, status: "scheduled" },
  { title: "Drainage cleaning", note: "Pre-wet-season culvert cleaning.", dir: "SB", lo: 74, hi: 77, closure: "Shoulder only", day: 20, from: 8, hours: 9, status: "scheduled" },
];

const row = (j: Job) => {
  const startsAt =
    j.rel !== undefined
      ? new Date(Math.round((Date.now() + j.rel * HOUR) / (30 * 60_000)) * 30 * 60_000)
      : new Date(todayStart + j.day * DAY + j.from * HOUR);
  const endsAt = new Date(startsAt.getTime() + j.hours * HOUR);
  return {
    title: j.title,
    description: `${j.note} ${TAG}`,
    startKm: j.lo,
    endKm: j.hi,
    direction: j.dir,
    laneClosure: j.closure,
    startsAt,
    endsAt,
    status: j.status,
    reason: j.reason ?? null,
    createdAt: new Date(startsAt.getTime() - 5 * DAY),
  };
};

async function main() {
  const rows = JOBS.map(row);
  if (dry) {
    for (const r of rows) {
      console.log(
        `${r.status.padEnd(11)} ${r.direction} Km ${r.startKm}-${r.endKm}  ${r.startsAt.toISOString()}  ${r.laneClosure.padEnd(16)} ${r.title}`,
      );
    }
    console.log(`\n${rows.length} rows (dry run; nothing written)`);
    return;
  }

  if (!env.POSTGRES_URL) {
    console.error("No database configured — set POSTGRES_URL or PG_* in Back-End/.env");
    process.exit(1);
  }
  const db = new Pool({
    connectionString: env.POSTGRES_URL,
    ssl: env.PG_SSL_MODE === "disable" ? undefined : { rejectUnauthorized: false },
    connectionTimeoutMillis: 15_000,
  });
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const del = wipe
      ? await client.query(`DELETE FROM nlex_maintenance_schedules`)
      : await client.query(`DELETE FROM nlex_maintenance_schedules WHERE description LIKE '%' || $1`, [TAG]);
    console.log(`Removed ${del.rowCount} ${wipe ? "existing" : "old seed"} rows`);
    if (!remove) {
      for (const r of rows) {
        await client.query(
          `INSERT INTO nlex_maintenance_schedules
             (title, description, start_km, end_km, direction, lane_closure, starts_at, ends_at,
              status, status_reason, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)`,
          [r.title, r.description, r.startKm, r.endKm, r.direction, r.laneClosure, r.startsAt, r.endsAt, r.status, r.reason, r.createdAt],
        );
      }
      console.log(`Inserted ${rows.length} rows`);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
    await db.end();
  }
}

main().catch((err) => {
  console.error("seed-maintenance failed:", err.message);
  process.exit(1);
});
