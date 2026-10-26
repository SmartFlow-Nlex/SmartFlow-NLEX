/* TC-UT-09  Incidents / MTTC excludes out-of-range durations
 * TC-UT-10  Incidents / Avg Response Time is breakdowns only
 *
 * Both rules are SQL, not TypeScript:
 *  - accident clearance_min is set in the silver build
 *    (scripts/medallion/10-bronze-accident-breakdown.sql: NULL unless the
 *    duration is BETWEEN 0 AND 1440) and averaged in
 *    src/services/incident.service.ts getIncidentAnalyticsFromDb();
 *  - breakdown MTTC and time-to-first-responder come from the per_event CTE
 *    and final SELECT of that service's breakdown query.
 * The exact SQL fragments are cut from those files and evaluated against
 * literal VALUES on the read-only Postgres session. No table is read or written. */
import { dbUnavailable, q, closeAll } from "../integration/readonly-db.js";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readSource, between } from "../support/source-extract.js";

const service = readSource("Back-End/src/services/incident.service.ts");
const silver = readSource("Back-End/scripts/medallion/10-bronze-accident-breakdown.sql");

const silverClearance = between(silver, "CASE WHEN EXTRACT(EPOCH FROM (site_cleared - event_start_date))", " AS clearance_min");
const accidentAvg = between(service, "ROUND(AVG(clearance_min) FILTER", " AS avg_min");
const breakdownQuery = between(service, "scoped AS (", "params", "MTTC + time-to-first-responder");
const breakdownTail = between(breakdownQuery, "per_event AS (", ") x`") + ") x";

const T0 = "2024-01-01 08:00:00";
const DURATIONS = [30, 45, -5, 1500, 60];

after(async () => { await closeAll(); });

/** scoped(event_number, event_encoded_date, deployments) as literal rows. */
function scopedValues(rows: { departAfterMin: number; responses: { dispatchAfterMin: number; responseMin: number }[] }[]) {
  const iso = (min: number) => `(timestamp '${T0}' + make_interval(secs => ${min * 60}))::text`;
  const values = rows.map((r, i) => {
    const deps = r.responses.length
      ? r.responses.map((d) => `jsonb_build_object('dispatch_time', ${iso(d.dispatchAfterMin)}, 'departure_time', ${iso(r.departAfterMin)}, 'response_time_min', '${d.responseMin}')`)
      : [`jsonb_build_object('departure_time', ${iso(r.departAfterMin)})`];
    return `(${i + 1}, timestamp '${T0}', jsonb_build_array(${deps.join(", ")}))`;
  });
  return `scoped(event_number, event_encoded_date, deployments) AS (VALUES ${values.join(", ")})`;
}

test("TC-UT-09: accident MTTC keeps 30, 45, 60 and excludes -5 and 1500 -> 45.0 min", { timeout: 180_000 }, async (t) => {
  const why = await dbUnavailable();
  if (why) return t.skip(why);
  const [r] = await q(
    `WITH bronze(event_start_date, site_cleared) AS (
       SELECT timestamp '${T0}', timestamp '${T0}' + make_interval(secs => m * 60)
       FROM unnest($1::int[]) AS m),
     silver AS (SELECT ${silverClearance} AS clearance_min FROM bronze)
     SELECT ${accidentAvg} AS avg_min,
            array_agg(round(clearance_min)::int ORDER BY clearance_min) FILTER (WHERE clearance_min IS NOT NULL) AS used
     FROM silver`,
    [DURATIONS],
  );
  console.log(`  accident side: used=${JSON.stringify(r.used)} MTTC=${r.avg_min}`);
  assert.deepEqual(r.used, [30, 45, 60]);
  assert.equal(r.avg_min, 45.0);
});

test("TC-UT-09: breakdown MTTC applies the same 0..1440 window -> 45.0 min", { timeout: 180_000 }, async (t) => {
  const why = await dbUnavailable();
  if (why) return t.skip(why);
  const scoped = scopedValues(DURATIONS.map((d) => ({ departAfterMin: d, responses: [] })));
  const [r] = await q(`WITH ${scoped}, ${breakdownTail}`);
  console.log(`  breakdown side: valid=${r.mttc_valid_n} of ${r.total} MTTC=${r.avg_mttc_min}`);
  assert.equal(r.mttc_valid_n, 3);
  assert.equal(r.avg_mttc_min, 45.0);
});

test("TC-UT-10: the response-time query reads breakdowns only; the accident query has no response field", () => {
  assert.match(breakdownQuery, /FROM silver\.nlex_breakdown_events_clean b/);
  assert.doesNotMatch(breakdownQuery, /nlex_accident_events_clean/);
  const accidentQuery = between(service, "MTTC, accident side", "MTTC + time-to-first-responder");
  assert.doesNotMatch(accidentQuery, /response/i);
  assert.match(service, /avgTimeToFirstResponder: \{\s*min: bd\.avg_response_min,/);
});

test("TC-UT-10: breakdowns responding in 10 and 14 min -> Avg Response Time 12.0 min (the accident's 20 min never enters)", { timeout: 180_000 }, async (t) => {
  const why = await dbUnavailable();
  if (why) return t.skip(why);
  // The accident (response 20 min) lives in silver.nlex_accident_events_clean,
  // which this query does not read (previous test); only breakdowns are scoped.
  const scoped = scopedValues([
    { departAfterMin: 60, responses: [{ dispatchAfterMin: 1, responseMin: 10 }] },
    { departAfterMin: 60, responses: [{ dispatchAfterMin: 2, responseMin: 14 }] },
  ]);
  const [r] = await q(`WITH ${scoped}, ${breakdownTail}`);
  console.log(`  avg_response_min=${r.avg_response_min} n=${r.response_valid_n}`);
  assert.equal(r.response_valid_n, 2);
  assert.equal(r.avg_response_min, 12.0);
});
