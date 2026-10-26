/* TC-IT-15  Maintenance / Create, edit, delete reach the database
 * TC-IT-16  Maintenance / Malformed schedule ID
 * TC-IT-17  Roles and Access / Server-side enforcement
 * TC-IT-18  Mobile App / Saved settings reach the API
 * TC-IT-19  Data Management / Dry run writes nothing
 * TC-IT-20  Data Management / Load and undo
 * TC-IT-21  Audit Log / Counts match the audit table
 * TC-IT-22  Settings / Changes are written to the audit log
 * TC-IT-23  Data Management / Retraining status matches the model registry
 *
 * Real names: "<maintenance table>" = public.nlex_maintenance_schedules;
 * "<audit table>" = public.audit_logs ("timestamp", module, user_id, action,
 * details; it has no created_at or category column — the page's Category is
 * MODULE_LABEL[module]); "<target table>" = the layout's bronze/silver/gold
 * table (etl/formats.ts); "<model registry table>" = gold.ml_batch_runs (the
 * runs the Data Management page lists) with gold.ml_batch_watermarks
 * (trained_at, run_id per model group). Cases whose steps write are skipped:
 * this suite never writes to the database. */
import { dbUnavailable, q, closeAll } from "./readonly-db.js";
import { start, stop, get, call } from "./http.js";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { app } from "../../src/app.js";
import { authorizeRoles } from "../../src/middleware/auth.middleware.js";
import { updateSchedule, updateScheduleStatus, deleteSchedule } from "../../src/controllers/maintenance.controller.js";
import { listRetrainRunsInDb } from "../../src/services/upload.service.js";

const T = { timeout: 300_000 };
before(start);
after(async () => { await stop(); await closeAll(); });

/** A minimal Express response double that records status and JSON. */
function fakeRes() {
  const res: any = { statusCode: 200, body: undefined, locals: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  return res;
}

test("TC-IT-15: create / edit / delete a QA TEST schedule and see it in the table", {
  skip: "Not run: every step writes (INSERT, UPDATE and DELETE on public.nlex_maintenance_schedules plus audit_logs inserts); the rules forbid writing to the database.",
}, () => {});

test("TC-IT-16: malformed schedule id 'abc' -> 404 'not found', not 500 (PUT, PATCH status, DELETE)", T, async () => {
  // Unauthenticated, the auth guard answers first (no data, no DB):
  const anon = await Promise.all([
    call("PUT", "/api/maintenance/abc", {}, { title: "x" }),
    call("PATCH", "/api/maintenance/abc/status", {}, { status: "cancelled" }),
    call("DELETE", "/api/maintenance/abc"),
  ]);
  console.log(`  without a session: ${anon.map((r) => `${r.status} ${r.body?.code ?? r.body?.message}`).join(" | ")}`);
  // As an authenticated operator, the controllers the routes call (they validate the id before any DB access):
  const results: string[] = [];
  for (const [name, handler, body] of [
    ["PUT /:id", updateSchedule, { title: "QA TEST" }],
    ["PATCH /:id/status", updateScheduleStatus, { status: "cancelled", reason: "x" }],
    ["DELETE /:id", deleteSchedule, undefined],
  ] as const) {
    const res = fakeRes();
    await handler({ params: { id: "abc" }, body, headers: {}, header: () => undefined } as any, res);
    results.push(`${name}: ${res.statusCode} ${res.body?.message}`);
    assert.equal(res.statusCode, 404, name);
    assert.match(String(res.body?.message), /not found/i, name);
  }
  console.log(`  as an operator: ${results.join(" | ")}`);
  for (const r of anon) assert.notEqual(r.status, 500);
});

test("TC-IT-16: well-formed id that does not exist (random UUID) -> 404", {
  skip: "Not run: a random UUID passes validation and reaches UPDATE/DELETE on public.nlex_maintenance_schedules, and DELETE also inserts an audit row; on the read-only session those statements are refused, so the result would not reflect the real behaviour.",
}, () => {});

test("TC-IT-17: Audit Log API — TCC operator gets 401/403 and no data; Data analyst gets 200", T, async (t) => {
  // Which audit-log routes sit behind authenticateToken + authorizeRoles(["data-analyst"]):
  const auditLayer = (app as any)._router.stack.find((l: any) => l.name === "router" && l.handle.stack?.some?.((s: any) => s.name === "router" && s.handle.stack?.some?.((r: any) => r.route?.path === "/export")));
  const apiRouter = auditLayer.handle.stack.find((s: any) => s.name === "router" && s.handle.stack?.some?.((r: any) => r.route?.path === "/export")).handle;
  let guarded = false;
  const routes = apiRouter.stack.map((s: any) => {
    if (!s.route && /authenticateToken/.test(s.name ?? "")) guarded = true;
    return s.route ? `${Object.keys(s.route.methods)[0].toUpperCase()} ${s.route.path}${guarded ? " (data-analyst)" : " (public)"}` : null;
  }).filter(Boolean);
  console.log(`  audit-log routes: ${routes.join(", ")}`);

  // Role check used by the guarded routes, with a TCC operator's and a Data analyst's session.
  const tcc = fakeRes();
  let analystPassed = false;
  authorizeRoles(["data-analyst"])({ userRole: "tcc-operator" } as any, tcc, () => {});
  authorizeRoles(["data-analyst"])({ userRole: "data-analyst" } as any, fakeRes(), () => { analystPassed = true; });
  console.log(`  authorizeRoles: tcc-operator -> ${tcc.statusCode} ${tcc.body?.code}; data-analyst -> ${analystPassed ? "allowed" : "denied"}`);
  assert.equal(tcc.statusCode, 403);
  assert.equal(analystPassed, true);

  const exportAnon = await get("/api/audit-log/export");
  console.log(`  GET /api/audit-log/export without a session -> ${exportAnon.status} ${exportAnon.body?.code ?? ""}`);
  assert.ok([401, 403, 503].includes(exportAnon.status));

  // The list the Audit Log page reads, with no session at all (so a TCC operator's session too):
  const why = await dbUnavailable();
  if (why) return t.skip(`role checks above ran; /list needs the database: ${why}`);
  const list = await get("/api/audit-log/list?limit=5");
  const summary = await get("/api/audit-log/summary?days=7");
  console.log(`  GET /api/audit-log/list without a session -> ${list.status}, ${Array.isArray(list.body?.data) ? list.body.data.length : "?"} rows; /summary -> ${summary.status}`);
  assert.ok([401, 403].includes(list.status), `GET /api/audit-log/list answered ${list.status} with data to a caller with no session`);
});

test("TC-IT-18: hide ML hotspots in Mobile App Control Centre, Save, read it back", {
  skip: "Not run: Save and Restore are PUT /api/mobile-config (an upsert of public.nlex_mobile_config plus an audit insert); the rules forbid writing. The read half is checked below.",
}, () => {});

test("TC-IT-18 (read half): GET /api/mobile-config returns the stored row's mlHotspots", T, async (t) => {
  const why = await dbUnavailable();
  if (why) return t.skip(why);
  const r = await get("/api/mobile-config");
  const [row] = await q(`SELECT config, updated_at, updated_by FROM public.nlex_mobile_config WHERE id = 1`);
  const api = r.body?.data?.config?.sections?.dashboard?.mlHotspots ?? r.body?.config?.sections?.dashboard?.mlHotspots;
  console.log(`  api status=${r.status} mlHotspots=${api} source=${r.body?.meta?.source ?? r.body?.data?.source}; db mlHotspots=${row?.config?.sections?.dashboard?.mlHotspots} updated ${row?.updated_at?.toISOString?.()} by ${row?.updated_by}`);
  assert.equal(r.status, 200);
  assert.equal(api, row?.config?.sections?.dashboard?.mlHotspots ?? true);
});

test("TC-IT-19: Check only (dry run) leaves the target table's row count unchanged", {
  skip: "Not run: POST /api/upload/file?mode=check needs a Data analyst session (aal2 Supabase token), and the dry run itself executes INSERT/CREATE inside a transaction it rolls back and writes an 'upload.checked' audit row — on a read-only connection it cannot run as designed.",
}, () => {});

test("TC-IT-20: Upload & load, then Undo", {
  skip: "Not run: loading and undoing write to the target tables, data_uploads, etl_undo.* and audit_logs; the rules forbid writing to the database.",
}, () => {});

test("TC-IT-21: Audit Log 'Actions' and the Today + Maintenance filter equal counts in public.audit_logs", T, async (t) => {
  const why = await dbUnavailable();
  if (why) return t.skip(why);
  // The Actions tile: GET /api/audit-log/summary?days=7 (the page offers 7/30/90 days; it has no Today period).
  const s = await get("/api/audit-log/summary?days=7");
  const [db7] = await q(`SELECT count(*) FILTER (WHERE action <> 'page.viewed')::int AS actions FROM public.audit_logs WHERE "timestamp" >= now() - make_interval(days => 7)`);
  // The log table's Today + Category filters run in the browser over GET /api/audit-log/list?limit=500.
  const list = await get("/api/audit-log/list?limit=500");
  const today = Date.parse(new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10) + "T00:00:00+08:00");
  const rows: any[] = list.body?.data ?? [];
  const pageToday = rows.filter((r) => Date.parse(r.timestamp) >= today);
  const pageMaint = pageToday.filter((r) => r.module === "maintenance");
  const [dbToday] = await q(`SELECT count(*)::int AS all_actions, count(*) FILTER (WHERE module = 'maintenance')::int AS maintenance
                               FROM public.audit_logs WHERE action <> 'page.viewed' AND ("timestamp" AT TIME ZONE 'Asia/Manila')::date = (now() AT TIME ZONE 'Asia/Manila')::date`);
  console.log(`  Actions (7 days): page=${s.body?.data?.totals?.actions} db=${db7.actions}`);
  console.log(`  Today: page rows=${pageToday.length} (of ${rows.length} loaded) db=${dbToday.all_actions}; Today + Maintenance: page=${pageMaint.length} db=${dbToday.maintenance}`);
  assert.equal(s.body?.data?.totals?.actions, db7.actions);
  assert.equal(pageToday.length, dbToday.all_actions);
  assert.equal(pageMaint.length, dbToday.maintenance);
});

test("TC-IT-22: changing the inactivity time writes an audit entry with user, setting and time", T, async (t) => {
  const why = await dbUnavailable();
  if (why) return t.skip(`Step 1 (changing the setting) not run: it writes to Supabase user_metadata and audit_logs. ${why}`);
  // Step 1 is not performed (it writes). The newest entry an earlier real change produced is inspected instead.
  const rows = await q(`SELECT "timestamp", user_id, action, module, details, outcome FROM public.audit_logs
                         WHERE action = 'settings.updated' AND details->'fields' ? 'idle_minutes' ORDER BY "timestamp" DESC LIMIT 1`);
  console.log(`  newest idle_minutes change: ${JSON.stringify(rows[0] ?? null)}`);
  if (rows.length === 0) return t.skip("Step 1 not run (it writes) and no earlier idle_minutes change exists to inspect");
  const e = rows[0];
  assert.ok(e.user_id && !["anonymous", "dashboard"].includes(e.user_id), "user recorded");
  assert.deepEqual(e.details.fields, ["idle_minutes"], "setting recorded");
  assert.ok(e.timestamp instanceof Date, "time recorded");
});

test("TC-IT-23: last retrain date and kept/retrained result match the model registry", T, async (t) => {
  const why = await dbUnavailable();
  if (why) return t.skip(why);
  // GET /api/upload/retraining needs a Data analyst session; its service is called directly.
  const runs = (await listRetrainRunsInDb(5)) ?? [];
  const db = await q(`SELECT id, started_at, finished_at, status, groups FROM gold.ml_batch_runs ORDER BY id DESC LIMIT 5`);
  assert.ok(runs.length > 0 && db.length > 0, "no retrain runs recorded");
  const last = runs[0];
  const marks = await q(`SELECT group_key, trained_at, run_id FROM gold.ml_batch_watermarks`);
  const markBy = Object.fromEntries(marks.map((m) => [m.group_key, m]));
  const groups: any[] = Array.isArray(last.groups) ? last.groups : [];
  console.log(`  page last run: id=${last.id} finished=${last.finished_at?.toISOString?.()} status=${last.status}; db: id=${db[0].id} finished=${db[0].finished_at?.toISOString?.()} status=${db[0].status}`);
  for (const g of groups) console.log(`    ${g.key}: ${g.status}; registry trained_at=${markBy[g.key]?.trained_at?.toISOString?.() ?? "-"} run_id=${markBy[g.key]?.run_id ?? "-"}`);
  assert.equal(last.id, db[0].id);
  assert.equal(String(last.finished_at), String(db[0].finished_at));
  assert.equal(last.status, db[0].status);
  for (const g of groups) {
    const m = markBy[g.key];
    if (g.status === "retrained") assert.equal(m?.run_id, last.id, `${g.key} retrained in run ${last.id} but the registry says run ${m?.run_id}`);
    if (g.status === "kept previous") assert.notEqual(m?.run_id, last.id, `${g.key} kept previous but the registry was stamped by run ${last.id}`);
  }
});
