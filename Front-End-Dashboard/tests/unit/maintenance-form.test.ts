/* TC-UT-20  Maintenance / Schedule form validation
 * TC-UT-21  Maintenance / Conflict types
 *
 * Form rules live in two places and both are checked:
 *  - the API: Back-End/src/validators/maintenance.validator.ts
 *    MaintenanceScheduleSchema (exported);
 *  - the page: app/dashboard/maintenance/page.tsx, inline in the component —
 *    submitForm's checks, KmPostField's `step` (the +/- buttons) and the
 *    `conflicts` useMemo. Those are extracted from the page source.
 * The page compares conflicts on the measured-km scale, so the existing
 * schedule is stored as kmMeasured(post), exactly as the form saves it. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MaintenanceScheduleSchema } from "../../../Back-End/src/validators/maintenance.validator.ts";
import { KM_POST_END, KM_POST_START, fmtKm, kmMeasured } from "../../lib/km-post.ts";
import { readSource, declaration, between, evaluate } from "../../../Back-End/tests/support/source-extract.ts";

const src = readSource("Front-End-Dashboard/app/dashboard/maintenance/page.tsx");

const helpers = ["LANE_OPTIONS", "closureText", "parseClosure", "phToMs", "lanesClash", "NEARBY_KM", "CONFLICT_LABEL", "KM_POST_TEXT", "isKmPost", "formKmMeasured"];
const stepBody = between(src, "setLeft(false);", "};", "const step = (by: number) => {").replace("setLeft(false);", "");
const conflictsBody = between(src, "const out: { s: Schedule; kind: ConflictKind; detail: string }[] = [];", "}, [formOpen, form, schedules, editId]);", "const conflicts = useMemo(");
const titleCheck = between(src, "if (form.title.trim().length < 3)", ";", "const submitForm = async");
const windowCheck = between(src, "if (endsAt <= startsAt)", ";", "const submitForm = async");

const page = evaluate<any>(
  [
    `type Schedule = any; type ConflictKind = "critical" | "operational" | "nearby" | "opposing";`,
    ...helpers.map((n) => declaration(src, n)),
    `const step = (value: string, by: number, min: number, max: number) => { let out = value; const onChange = (v: string) => { out = v; }; const setRefused = (_: boolean) => {}; const done = isKmPost(value); ${stepBody} return out; };`,
    `const conflictsFor = (form: any, schedules: any[]) => { const formOpen = true; const editId = null; ${conflictsBody} };`,
    `const formError = (form: any, startsAt: Date, endsAt: Date) => { let msg: string | null = null; const setFormError = (m: string) => { msg = m; }; (() => { ${titleCheck}; ${windowCheck}; })(); return msg; };`,
  ],
  [...helpers, "step", "conflictsFor", "formError"],
  { KM_POST_END, KM_POST_START, fmtKm, kmMeasured },
);

const TOMORROW = new Date(Date.now() + 86_400_000 + 8 * 3_600_000).toISOString().slice(0, 10); // PHT date
const DAY_AFTER = new Date(Date.now() + 2 * 86_400_000 + 8 * 3_600_000).toISOString().slice(0, 10);
const iso = (date: string, time: string) => new Date(page.phToMs(date, time)).toISOString();

const apiBody = (over: Record<string, unknown> = {}) => ({
  title: "Resurfacing works", startKm: kmMeasured(20), endKm: kmMeasured(22), direction: "NB", laneClosure: "Lane 1",
  startsAt: iso(TOMORROW, "22:00"), endsAt: iso(DAY_AFTER, "04:00"), ...over,
});
const form = (over: Record<string, unknown> = {}) => ({
  title: "Resurfacing works", startKm: "20", endKm: "22", direction: "NB", lanes: ["Lane 1"], fullClosure: false, lanesLegacy: "",
  startDate: TOMORROW, startTime: "22:00", endDate: DAY_AFTER, endTime: "04:00", ...over,
});
const existing = (over: Record<string, unknown> = {}) => ({
  id: "existing", status: "scheduled", start_km: kmMeasured(20), end_km: kmMeasured(22), direction: "NB", lane_closure: "Lane 1",
  starts_at: iso(TOMORROW, "22:00"), ends_at: iso(DAY_AFTER, "04:00"), ...over,
});

// ---- TC-UT-20 -------------------------------------------------------------
test("TC-UT-20a: start 22:00, end 21:00 the same day is rejected (API and form)", () => {
  const api = MaintenanceScheduleSchema.safeParse(apiBody({ startsAt: iso(TOMORROW, "22:00"), endsAt: iso(TOMORROW, "21:00") }));
  const msg = page.formError(form(), new Date(page.phToMs(TOMORROW, "22:00")), new Date(page.phToMs(TOMORROW, "21:00")));
  console.log(`  api success=${api.success} issue=${api.success ? "" : api.error.issues[0].message}; form="${msg}"`);
  assert.equal(api.success, false);
  assert.equal(msg, "The window must end after it starts.");
});

test("TC-UT-20b: blank title is rejected (API and form)", () => {
  const api = MaintenanceScheduleSchema.safeParse(apiBody({ title: "   " }));
  const msg = page.formError(form({ title: "" }), new Date(page.phToMs(TOMORROW, "22:00")), new Date(page.phToMs(DAY_AFTER, "04:00")));
  console.log(`  api success=${api.success}; form="${msg}"`);
  assert.equal(api.success, false);
  assert.equal(msg, "Give the work a short title (at least 3 characters).");
});

test("TC-UT-20c: Start Km 20, press +1 -> 21", () => {
  const next = page.step("20", 1, KM_POST_START, KM_POST_END);
  console.log(`  step("20", +1) -> "${next}"`);
  assert.equal(next, "21");
});

test("TC-UT-20d: Km 20-22 NB vs existing Km 30-32 NB at the same time -> no conflict", () => {
  const found = page.conflictsFor(form(), [existing({ start_km: kmMeasured(30), end_km: kmMeasured(32) })]);
  console.log(`  conflicts=${JSON.stringify(found.map((c: any) => c.kind))}`);
  assert.deepEqual(found, []);
});

// ---- TC-UT-21 (existing: Km 20-22, NB, tomorrow 22:00 to 04:00) -----------
test("TC-UT-21a: Km 21-23 NB at the same time -> conflict on the same carriageway", () => {
  const found = page.conflictsFor(form({ startKm: "21", endKm: "23" }), [existing()]);
  console.log(`  conflicts=${JSON.stringify(found.map((c: any) => ({ kind: c.kind, label: page.CONFLICT_LABEL[c.kind], detail: c.detail })))}`);
  assert.equal(found.length, 1);
  assert.ok(["critical", "operational"].includes(found[0].kind), `kind=${found[0].kind}`);
});

test('TC-UT-21b: Km 20-22 SB at the same time -> "Opposing carriageway"', () => {
  const found = page.conflictsFor(form({ direction: "SB" }), [existing()]);
  console.log(`  conflicts=${JSON.stringify(found.map((c: any) => ({ kind: c.kind, label: page.CONFLICT_LABEL[c.kind] })))}`);
  assert.equal(found.length, 1);
  assert.equal(page.CONFLICT_LABEL[found[0].kind], "Opposing carriageway");
});
