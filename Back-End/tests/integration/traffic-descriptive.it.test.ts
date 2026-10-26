/* TC-IT-01  Traffic / Total Volume matches the database
 * TC-IT-02  Traffic / Vehicle class filter matches the database
 * TC-IT-03  Traffic / Busiest Plaza matches the database
 *
 * Endpoint: GET /api/traffic/analytics (controllers/traffic.controller.ts ->
 * services/traffic.service.ts getTrafficAnalyticsFromDb), which the Traffic >
 * Descriptive tab reads. "<gold toll volume table>" resolves to
 * public.nlex_traffic_volume, the materialized view of the gold/silver toll
 * volume that the endpoint reads (one row per date, plaza, direction,
 * vehicle_class with hourly columns h00..h23; Entries only). Its source is
 * logged from pg_get_viewdef, and gold.fact_traffic_hourly is reported as a
 * cross-check. Range: Custom 2024-01-01 to 2024-03-31, all classes. */
import { dbUnavailable, q, closeAll } from "./readonly-db.js";
import { start, stop, get } from "./http.js";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

const FROM = "2024-01-01";
const TO = "2024-03-31";
const DAY_TOTAL = Array.from({ length: 24 }, (_, h) => `h${String(h).padStart(2, "0")}`).join(" + ");
const T = { timeout: 300_000 };

before(start);
after(async () => { await stop(); await closeAll(); });

async function analytics(qs: string) {
  const r = await get(`/api/traffic/analytics?from=${FROM}&to=${TO}${qs}`);
  assert.equal(r.status, 200, `HTTP ${r.status}: ${JSON.stringify(r.body).slice(0, 300)}`);
  const d = r.body.data;
  assert.deepEqual(d.range, { from: FROM, to: TO }, "requested range was clamped by the data");
  return d;
}

test("TC-IT-01: Total Volume (Q1 2024, all classes) equals SUM(volume) in the database", T, async (t) => {
  const why = await dbUnavailable();
  if (why) return t.skip(why);
  const d = await analytics("");
  const [db] = await q(
    `SELECT SUM(${DAY_TOTAL})::bigint AS v FROM public.nlex_traffic_volume
      WHERE type = 'Entries' AND vehicle_class = 'Total' AND date BETWEEN $1 AND $2`, [FROM, TO]);
  const [src] = await q(`SELECT pg_get_viewdef('public.nlex_traffic_volume'::regclass) AS def`);
  const reads = [...new Set(String(src.def).match(/\b(gold|silver|public)\.[a-z_]+/g) ?? [])];
  const gold = await q(
    `SELECT CASE WHEN to_regclass('gold.fact_traffic_hourly') IS NULL THEN NULL
            ELSE (SELECT SUM(total)::bigint FROM gold.fact_traffic_hourly WHERE date BETWEEN $1 AND $2) END AS v`, [FROM, TO]).catch((e) => [{ v: `n/a (${e.message})` }]);
  console.log(`  page totalVolume=${d.kpis.totalVolume} db=${db.v} (view reads ${reads.join(", ")}; gold.fact_traffic_hourly SUM(total)=${gold[0].v})`);
  assert.equal(Number(d.kpis.totalVolume), Number(db.v));
});

test("TC-IT-02: Vehicle class filter (Class 1) equals the class-filtered SUM", T, async (t) => {
  const why = await dbUnavailable();
  if (why) return t.skip(why);
  const results: string[] = [];
  for (const cls of ["Class 1", "Class 2", "Class 3"]) {
    const d = await analytics(`&vehicleClass=${encodeURIComponent(cls)}`);
    const [db] = await q(
      `SELECT SUM(${DAY_TOTAL})::bigint AS v FROM public.nlex_traffic_volume
        WHERE type = 'Entries' AND vehicle_class = $3 AND date BETWEEN $1 AND $2`, [FROM, TO, cls]);
    results.push(`${cls}: page=${d.kpis.totalVolume} db=${db.v}`);
    assert.equal(Number(d.kpis.totalVolume), Number(db.v), cls);
  }
  console.log(`  ${results.join("; ")}`);
});

test("TC-IT-03: Busiest Plaza and the top 5 Volume by Plaza bars match the grouped query", T, async (t) => {
  const why = await dbUnavailable();
  if (why) return t.skip(why);
  const d = await analytics("");
  const rows = await q(
    `SELECT toll_plaza AS plaza, SUM(${DAY_TOTAL})::bigint AS v FROM public.nlex_traffic_volume
      WHERE type = 'Entries' AND vehicle_class = 'Total' AND date BETWEEN $1 AND $2
      GROUP BY 1 ORDER BY 2 DESC LIMIT 5`, [FROM, TO]);
  const page = d.byPlaza.slice(0, 5).map((r: any) => `${r.plaza}=${r.v}`);
  const db = rows.map((r) => `${r.plaza}=${r.v}`);
  console.log(`  page busiest=${d.byPlaza[0]?.plaza} top5=[${page.join(", ")}]`);
  console.log(`  db   top5=[${db.join(", ")}]`);
  const sctex = d.byPlaza.find((r: any) => r.plaza === "SCTEX");
  if (sctex) console.log(`  note: the page adds an SCTEX bar from gold.fact_traffic_hourly_origin (entry_canonical='SCTEX') = ${sctex.v}, rank ${d.byPlaza.indexOf(sctex) + 1}`);
  assert.equal(d.byPlaza[0]?.plaza, rows[0].plaza, "Busiest Plaza");
  assert.deepEqual(page, db, "top 5 bars");
});
