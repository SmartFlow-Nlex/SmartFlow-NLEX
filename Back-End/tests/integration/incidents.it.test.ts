/* TC-IT-04  Incidents / Total Incidents matches the database
 * TC-IT-05  Incidents / Weather filter matches the database
 * TC-IT-06  Incidents / Injuries and fatalities match the database
 * TC-IT-07  Incidents / Hotspots by Km Segment match the database
 * TC-IT-08  Incidents / Avg Response Time matches the database
 * TC-IT-09  Incidents / MTTC vs clearance protocol baseline
 * TC-IT-10  Incidents / Clearance protocol API
 *
 * Endpoints: GET /api/incident/analytics (services/incident.service.ts
 * getIncidentAnalyticsFromDb) and GET /api/incident/clearance-protocol
 * (services/clearance-protocol.service.ts getClearanceProtocolFromDb).
 * Tables: silver.nlex_accident_events_clean (event_start_date, corridor_km,
 * number_of_injured, number_of_fatality, clearance_min, site_cleared) and
 * silver.nlex_breakdown_events_clean (event_encoded_date, corridor_km,
 * deployments jsonb). "<weather column> = 'wet'" resolves to the hourly
 * rainfall rule the API uses: hourly_weather, local hour, AVG(rainfall) > 0.3.
 * "Range = 12 months" ends at the last day of incident data:
 * lo = max(hi + 1 day - 12 months, first day). Computed here in SQL. */
import { dbUnavailable, q, closeAll } from "./readonly-db.js";
import { start, stop, get } from "./http.js";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

const T = { timeout: 600_000 };
before(start);
after(async () => { await stop(); await closeAll(); });

let range: { lo: string; hi: string; min: string } | null = null;
async function twelveMonths() {
  if (range) return range;
  const [r] = await q(`
    WITH b AS (
      SELECT LEAST((SELECT min(event_start_date)::date FROM silver.nlex_accident_events_clean),
                   (SELECT min(event_encoded_date)::date FROM silver.nlex_breakdown_events_clean)) AS min,
             GREATEST((SELECT max(event_start_date)::date FROM silver.nlex_accident_events_clean),
                      (SELECT max(event_encoded_date)::date FROM silver.nlex_breakdown_events_clean)) AS hi)
    SELECT min::text, hi::text, GREATEST((hi + 1 - interval '12 months')::date, min)::text AS lo FROM b`);
  range = r;
  return r;
}

const analyticsCache = new Map<string, any>();
async function analytics(qs: string) {
  if (analyticsCache.has(qs)) return analyticsCache.get(qs);
  const r = await get(`/api/incident/analytics?months=12${qs}`);
  assert.equal(r.status, 200, `HTTP ${r.status}: ${JSON.stringify(r.body).slice(0, 300)}`);
  analyticsCache.set(qs, r.body.data);
  return r.body.data;
}

const WX = `wx AS (
  SELECT (timestamp_utc + interval '8 hours')::date AS d,
         EXTRACT(hour FROM timestamp_utc + interval '8 hours')::int AS h,
         AVG(rainfall) > 0.3 AS wet
  FROM hourly_weather GROUP BY 1, 2)`;

async function counts(weather: "all" | "wet") {
  const { lo, hi } = await twelveMonths();
  const join = (ts: string) => (weather === "wet" ? `JOIN wx ON wx.d = (${ts})::date AND wx.h = EXTRACT(hour FROM ${ts})::int AND wx.wet` : "");
  const [a] = await q(`WITH ${WX} SELECT COUNT(*)::int AS n FROM silver.nlex_accident_events_clean e ${join("e.event_start_date")}
                        WHERE e.event_start_date::date BETWEEN $1 AND $2`, [lo, hi]);
  const [b] = await q(`WITH ${WX} SELECT COUNT(*)::int AS n FROM silver.nlex_breakdown_events_clean e ${join("e.event_encoded_date")}
                        WHERE e.event_encoded_date::date BETWEEN $1 AND $2`, [lo, hi]);
  return { accidents: a.n, breakdowns: b.n };
}

test("TC-IT-04: Total Incidents (12 months, Weather All) = accident count + breakdown count", T, async (t) => {
  const why = await dbUnavailable();
  if (why) return t.skip(why);
  const { lo, hi } = await twelveMonths();
  const d = await analytics("");
  const c = await counts("all");
  console.log(`  range ${lo}..${hi} (api ${d.range.from}..${d.range.to}); page totalIncidents=${d.kpis.totalIncidents}; db accidents=${c.accidents} + breakdowns=${c.breakdowns} = ${c.accidents + c.breakdowns}`);
  assert.deepEqual(d.range, { from: lo, to: hi });
  assert.equal(d.kpis.totalIncidents, c.accidents + c.breakdowns);
});

test("TC-IT-05: Weather = Wet equals the wet-hour database count", T, async (t) => {
  const why = await dbUnavailable();
  if (why) return t.skip(why);
  const d = await analytics("&weather=wet");
  const c = await counts("wet");
  console.log(`  page totalIncidents(wet)=${d.kpis.totalIncidents}; db wet accidents=${c.accidents} + wet breakdowns=${c.breakdowns} = ${c.accidents + c.breakdowns}`);
  assert.equal(d.kpis.totalIncidents, c.accidents + c.breakdowns);
});

test("TC-IT-06: Injuries and fatalities equal SUM over the accident table", T, async (t) => {
  const why = await dbUnavailable();
  if (why) return t.skip(why);
  const { lo, hi } = await twelveMonths();
  const d = await analytics("");
  const [s] = await q(`SELECT COALESCE(SUM(number_of_injured), 0)::int AS inj, COALESCE(SUM(number_of_fatality), 0)::int AS fat
                         FROM silver.nlex_accident_events_clean WHERE event_start_date::date BETWEEN $1 AND $2`, [lo, hi]);
  console.log(`  page injuries=${d.kpis.injuries} fatalities=${d.kpis.fatalities}; db injuries=${s.inj} fatalities=${s.fat}`);
  assert.equal(d.kpis.injuries, s.inj);
  assert.equal(d.kpis.fatalities, s.fat);
});

test("TC-IT-07: Hotspots by Km Segment top 5 and Top Hotspot match FLOOR(km/5)*5 grouping", T, async (t) => {
  const why = await dbUnavailable();
  if (why) return t.skip(why);
  const { lo, hi } = await twelveMonths();
  const d = await analytics("");
  // The sheet's query with the real column: km = corridor_km + 12 (corridor_km is stored with Balintawak = 0).
  const rows = await q(`
    WITH ev AS (
      SELECT corridor_km FROM silver.nlex_accident_events_clean WHERE event_start_date::date BETWEEN $1 AND $2
      UNION ALL
      SELECT corridor_km FROM silver.nlex_breakdown_events_clean WHERE event_encoded_date::date BETWEEN $1 AND $2)
    SELECT (FLOOR((corridor_km + 12) / 5) * 5)::int AS seg, COUNT(*)::int AS n
    FROM ev WHERE corridor_km IS NOT NULL GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 5`, [lo, hi]);
  const page = d.hotspots.slice(0, 5).map((h: any) => `${h.km_bin}:${h.total}`);
  const db = rows.map((r) => `${r.seg}:${r.n}`);
  console.log(`  page top5 (km_bin:total)=[${page.join(", ")}] Top Hotspot=${d.hotspots[0]?.km_bin}`);
  console.log(`  db   top5 (seg:count)   =[${db.join(", ")}]`);
  console.log(`  note: the API bins on the official km post (lib/km-post.ts kmPostSql of corridor_km + 12), not on measured km`);
  assert.deepEqual(page, db);
});

test("TC-IT-08: Avg Response Time equals AVG(first-dispatch response minutes) over breakdowns, to 0.1 min", T, async (t) => {
  const why = await dbUnavailable();
  if (why) return t.skip(why);
  const { lo, hi } = await twelveMonths();
  const d = await analytics("");
  // <response minutes> = response_time_min of each breakdown's earliest dispatch (deployments jsonb), kept within 0..1440.
  const [s] = await q(`
    WITH first AS (
      SELECT b.event_number,
             (SELECT NULLIF(x->>'response_time_min', '')::numeric FROM jsonb_array_elements(b.deployments) x
               WHERE COALESCE(x->>'dispatch_time', '') <> '' ORDER BY (x->>'dispatch_time')::timestamp LIMIT 1) AS resp
      FROM silver.nlex_breakdown_events_clean b
      WHERE b.event_encoded_date::date BETWEEN $1 AND $2 AND b.deployments IS NOT NULL)
    SELECT ROUND(AVG(resp) FILTER (WHERE resp BETWEEN 0 AND 1440), 2)::float AS avg, COUNT(*) FILTER (WHERE resp BETWEEN 0 AND 1440)::int AS n
    FROM first`, [lo, hi]);
  const page = d.kpis.avgTimeToFirstResponder;
  console.log(`  page avg=${page.min} min (n=${page.n} of ${page.totalBreakdowns}); db avg=${s.avg} min (n=${s.n})`);
  assert.ok(page.min != null && Math.abs(page.min - s.avg) <= 0.1, `page ${page.min} vs db ${s.avg}`);
});

test("TC-IT-09: MTTC equals AVG(clearance) over 0..1440; protocol baseline differs for an explained reason", T, async (t) => {
  const why = await dbUnavailable();
  if (why) return t.skip(why);
  const { lo, hi } = await twelveMonths();
  const d = await analytics("");
  const [s] = await q(`SELECT ROUND(AVG(clearance_min)::numeric, 1)::float AS avg, COUNT(clearance_min)::int AS n
                         FROM silver.nlex_accident_events_clean
                        WHERE clearance_min BETWEEN 0 AND 1440 AND event_start_date::date BETWEEN $1 AND $2`, [lo, hi]);
  const cp = await get(`/api/incident/clearance-protocol`); // the card's defaults: accident, severity injury, 12 months
  const baseline = cp.body?.data?.kpi?.baselineMttr;
  const m = d.kpis.mttc;
  console.log(`  api mttc.overallMin=${m.overallMin} (accidentMin=${m.accidentMin}, breakdownMin=${m.breakdownMin}); db accident AVG=${s.avg} (n=${s.n})`);
  console.log(`  protocol card baseline=${baseline} (status ${cp.body?.data?.status}, sampleSize ${cp.body?.data?.sampleSize}, censored ${cp.body?.data?.censoredCount})`);
  console.log(`  note: no component of Incidents > Descriptive renders kpis.mttc; the headline overallMin blends accidents and breakdowns`);
  assert.equal(m.accidentMin, s.avg, "accident-side MTTC");
  assert.equal(m.overallMin, s.avg, "headline MTTC equals the accident query");
});

test("TC-IT-10: clearance-protocol (accident, injury) sample size equals the DB count; a narrow filter is insufficient_data with the DB count", T, async (t) => {
  const why = await dbUnavailable();
  if (why) return t.skip(why);
  // The protocol's own window: hi - 12 months (no + 1 day), same hi/min as above.
  const { hi, min } = await twelveMonths();
  const [{ lo }] = await q(`SELECT GREATEST(($1::date - interval '12 months')::date, $2::date)::text AS lo`, [hi, min]);
  const r = await get(`/api/incident/clearance-protocol?type=accident&severity=injury`);
  assert.equal(r.status, 200, `HTTP ${r.status}: ${JSON.stringify(r.body).slice(0, 300)}`);
  const injury = `number_of_injured > 0 AND number_of_fatality = 0`; // severity = 'injury' as the service defines it
  const [c] = await q(`
    SELECT COUNT(*)::int AS all_rows,
           COUNT(*) FILTER (WHERE site_cleared IS NOT NULL AND event_start_date IS NOT NULL AND site_cleared >= event_start_date)::int AS usable
    FROM silver.nlex_accident_events_clean WHERE ${injury} AND event_start_date::date BETWEEN $1 AND $2`, [lo, hi]);
  console.log(`  window ${lo}..${hi} (api ${JSON.stringify(r.body.data.scoringWindow)}); status=${r.body.data.status} sampleSize=${r.body.data.sampleSize}; db injury rows=${c.all_rows}, with a usable clearance duration=${c.usable}`);
  assert.equal(r.body.data.status, "ok");
  assert.equal(r.body.data.sampleSize, c.all_rows, "sample size equals the injury count");

  // Narrow: fatal accidents in the last 7 days of data.
  const [{ from }] = await q(`SELECT ($1::date - 6)::text AS from`, [hi]);
  const n = await get(`/api/incident/clearance-protocol?type=accident&severity=fatal&from=${from}&to=${hi}`);
  const [f] = await q(`
    SELECT COUNT(*) FILTER (WHERE site_cleared IS NOT NULL AND event_start_date IS NOT NULL AND site_cleared >= event_start_date)::int AS usable,
           COUNT(*)::int AS all_rows
    FROM silver.nlex_accident_events_clean WHERE number_of_fatality > 0 AND event_start_date::date BETWEEN $1 AND $2`, [from, hi]);
  console.log(`  narrow ${from}..${hi} fatal: status=${n.body?.data?.status} sampleSize=${n.body?.data?.sampleSize}; db rows=${f.all_rows}, usable=${f.usable}`);
  assert.equal(n.body.data.status, "insufficient_data");
  assert.equal(n.body.data.sampleSize, f.all_rows, "sample size equals the database count");
});
