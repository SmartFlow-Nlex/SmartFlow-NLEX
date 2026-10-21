import { db } from "../config/db.js";

// Descriptive analytics over the new breakdown_data event table
// (silver.nlex_breakdown_events_clean) — a live SQL aggregation, not a
// trained-model snapshot like incident-severity.service.ts, so there's no
// "pipeline hasn't written yet" state to handle: the table either has data
// (it does, once the ETL has ingested at least one file) or the query
// returns empty arrays, which the frontend renders as an honest "no data"
// state.
//
// Was accident_data + breakdown_data until the accident-vs-breakdown monthly
// trend was removed as a duplicate of /analytics's Incident Trend chart
// (verified identical month-by-month counts once both endpoints respected
// the same Range and read the same client tables) — accident_data isn't
// read anywhere in this file anymore.
//
// breakdown_data's `deployments` column (JSONB, one entry per AAP/Patrol
// Vehicle/RAMFA/etc. dispatch) only exists on rows with deployment_count > 0
// (31% of breakdowns, verified) — response/service-time stats below are
// averaged over however many deployment records actually exist, not over
// every breakdown event.

export type BreakdownCauseCount = { mainCause: string; subCause: string; count: number };

export type DeploymentTimeStat = {
  group: string;
  n: number;
  avgResponseMin: number | null;
  medianResponseMin: number | null;
  avgServiceMin: number | null;
  /* How many of the n dispatches carry a usable response / on-scene time, and how many responses
     were logged as exactly 0 min (17 Oct 2026, testers IN-9): Investigator's median is 0 min over
     5 dispatches, which drew a zero-length bar that read as a blank row. */
  responseN: number;
  serviceN: number;
  zeroResponseN: number;
};

export type EventBreakdownData = {
  /** The window the figures cover, after clamping to the breakdown log. */
  range: { from: string; to: string };
  breakdownCauses: BreakdownCauseCount[];
  responseTimeByService: DeploymentTimeStat[];
  responseTimeByCause: DeploymentTimeStat[];
};

export type EventBreakdownFilters = {
  months: "3" | "12" | "all";
  from?: string;
  to?: string;
};

// percentile_cont always returns double precision (even over a numeric-cast
// input), and Postgres's two-argument ROUND only exists for numeric — hence
// the extra ::numeric cast on the median that AVG doesn't need. NULLIF(...,
// '') guards a small number of deployment records where parseDeployments
// (transformer.ts) matched the field but captured an empty value rather than
// the field being absent — an empty string fails a bare ::numeric cast.
//
// The BETWEEN 0 AND 1440 cap (NULLing, not dropping the record — n/other
// stats are unaffected) guards 6 of 51,082 records (verified) with values up
// to 10.5 million "minutes" — data-entry corruption, not real durations; the
// same 24h sanity cap 06-silver-remaining.sql already applies to
// clearance_minutes elsewhere in this warehouse.
const RESPONSE_MIN = "(CASE WHEN NULLIF(d->>'response_time_min', '')::numeric BETWEEN 0 AND 1440 THEN NULLIF(d->>'response_time_min', '')::numeric END)";
const SERVICE_MIN = "(CASE WHEN NULLIF(d->>'service_time_min', '')::numeric BETWEEN 0 AND 1440 THEN NULLIF(d->>'service_time_min', '')::numeric END)";
const DEPLOYMENT_STATS_SELECT = `
  COUNT(*)::int AS n,
  ROUND(AVG(${RESPONSE_MIN}), 1) AS avg_response_min,
  ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY ${RESPONSE_MIN}))::numeric, 1) AS median_response_min,
  ROUND(AVG(${SERVICE_MIN}), 1) AS avg_service_min,
  COUNT(${RESPONSE_MIN})::int AS response_n,
  COUNT(${SERVICE_MIN})::int AS service_n,
  COUNT(*) FILTER (WHERE ${RESPONSE_MIN} = 0)::int AS zero_response_n
`;

export async function getEventBreakdownFromDb(filters: EventBreakdownFilters): Promise<EventBreakdownData | null> {
  if (!db) return null;
  try {
    // Breakdown-only now: the accident-vs-breakdown monthly trend (the one
    // query here that read silver.nlex_accident_events_clean) was removed as
    // a duplicate of /analytics's Incident Trend chart — verified identical
    // counts for every month once both respected the same Range and read the
    // same client tables. Every remaining query here is breakdown-only, so
    // the window is bounded by that table alone rather than blended with a
    // table nothing else in this file reads.
    const bounds = await db.query(
      `SELECT min(event_encoded_date)::text AS lo, max(event_encoded_date)::text AS hi
       FROM silver.nlex_breakdown_events_clean`
    );
    const minDate: string = bounds.rows[0].lo;
    const maxDate: string = bounds.rows[0].hi;

    let lo: string;
    let hi: string;
    if (filters.from && filters.to) {
      const [f, t] = filters.from <= filters.to ? [filters.from, filters.to] : [filters.to, filters.from];
      lo = f < minDate ? minDate : f;
      hi = t > maxDate ? maxDate : t;
    } else if (filters.months === "all") {
      lo = minDate;
      hi = maxDate;
    } else {
      // Every month range ENDS at the last day of data, on every module (the user, 2026-10-15): "3 mo" is the
      // last 3 months, "12 mo" the last 12, "All" the whole record. 12 months back from the last day, counting
      // both ends, is 365 days, hence the + 1 day.
      hi = maxDate;
      lo =
        (
              await db.query(`SELECT GREATEST(($1::date + interval '1 day' - ($2 || ' months')::interval)::date, $3::date)::text AS lo`, [
                hi,
                filters.months,
                minDate,
              ])
            ).rows[0].lo;
    }

    type StatRow = {
      n: number;
      avg_response_min: number | null;
      median_response_min: number | null;
      avg_service_min: number | null;
      response_n: number;
      service_n: number;
      zero_response_n: number;
    };
    /* Whole days at both ends (17 Oct 2026): event_encoded_date is a timestamp, so BETWEEN against a
       bare custom end date ("2026-06-30") dropped every breakdown logged after midnight on that day. */
    const IN_WINDOW = `event_encoded_date >= $1::date AND event_encoded_date < $2::date + 1`;
    const [causeRes, byServiceRes, byCauseRes] = await Promise.all([
      db.query<{ main_cause: string; sub_cause: string; n: number }>(
        `SELECT main_cause, sub_cause, COUNT(*)::int AS n
         FROM silver.nlex_breakdown_events_clean
         WHERE ${IN_WINDOW}
         GROUP BY 1, 2 ORDER BY n DESC`,
        [lo, hi]
      ),
      db.query<StatRow & { service: string }>(
        `SELECT d->>'service' AS service, ${DEPLOYMENT_STATS_SELECT}
         FROM silver.nlex_breakdown_events_clean, jsonb_array_elements(deployments) d
         WHERE d->>'service' IS NOT NULL AND ${IN_WINDOW}
         GROUP BY 1 ORDER BY n DESC`,
        [lo, hi]
      ),
      db.query<StatRow & { main_cause: string }>(
        `SELECT main_cause, ${DEPLOYMENT_STATS_SELECT}
         FROM silver.nlex_breakdown_events_clean, jsonb_array_elements(deployments) d
         WHERE deployments IS NOT NULL AND ${IN_WINDOW}
         GROUP BY 1 ORDER BY n DESC`,
        [lo, hi]
      ),
    ]);

    const toStat = (r: StatRow): Omit<DeploymentTimeStat, "group"> => ({
      n: r.n,
      avgResponseMin: r.avg_response_min == null ? null : Number(r.avg_response_min),
      medianResponseMin: r.median_response_min == null ? null : Number(r.median_response_min),
      avgServiceMin: r.avg_service_min == null ? null : Number(r.avg_service_min),
      responseN: r.response_n ?? 0,
      serviceN: r.service_n ?? 0,
      zeroResponseN: r.zero_response_n ?? 0,
    });

    return {
      // The bounds come off a timestamp column, so they are cut to the day.
      range: { from: String(lo).slice(0, 10), to: String(hi).slice(0, 10) },
      breakdownCauses: causeRes.rows.map((r) => ({ mainCause: r.main_cause, subCause: r.sub_cause, count: r.n })),
      responseTimeByService: byServiceRes.rows.map((r) => ({ group: r.service, ...toStat(r) })),
      responseTimeByCause: byCauseRes.rows.map((r) => ({ group: r.main_cause, ...toStat(r) })),
    };
  } catch (error) {
    console.error("Failed to fetch event breakdown analytics:", error);
    return null;
  }
}
