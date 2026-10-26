/* TC-UT-06  Traffic / Booth Staffing Plan capping
 * src/services/traffic-prescriptive.service.ts: the `partsAt` closure inside
 * getTrafficPrescriptive() computes, per plaza booth group and hour,
 * need = ceil(demand / throughput), staffed = min(need, booths),
 * unmet = demand - staffed * throughput. It closes over `throughput`, which is
 * injected here. Throughput bounds: the API schema in
 * src/controllers/traffic.controller.ts (PrescriptiveTrafficQuerySchema) and
 * the slider in Front-End-Dashboard/components/dashboard/PrescriptiveTrafficPanels.tsx. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { readSource, declaration, evaluate } from "../support/source-extract.js";

const service = readSource("Back-End/src/services/traffic-prescriptive.service.ts");
const controller = readSource("Back-End/src/controllers/traffic.controller.ts");
const panel = readSource("Front-End-Dashboard/components/dashboard/PrescriptiveTrafficPanels.tsx");

const partsAtFor = (throughput: number) =>
  evaluate<any>([declaration(service, "partsAt")], ["partsAt"], { throughput }).partsAt;

/** One plaza with one booth group holding `demand` veh/h at weekday hour 0. */
const plaza = (demand: number, booths: number) => ({ groups: [{ v: [[demand], [demand]], booths }] });

test("TC-UT-06a: 2,000 veh/h at 400 veh/h/booth, 6 booths -> 5 booths, no overflow", () => {
  const [part] = partsAtFor(400)(plaza(2000, 6), 0, 0, 1);
  console.log(`  ${JSON.stringify(part)}`);
  assert.equal(part.staffed, 5);
  assert.equal(part.unmet, 0);
});

test("TC-UT-06b: same demand, 4 booths -> capped at 4, 400 veh/h overflow", () => {
  const [part] = partsAtFor(400)(plaza(2000, 4), 0, 0, 1);
  console.log(`  ${JSON.stringify(part)}`);
  assert.equal(part.staffed, 4);
  assert.equal(part.need, 5);
  assert.equal(part.unmet, 400);
});

test("TC-UT-06c (UI): throughput slider cannot go below 150 veh/h", () => {
  const slider = /<input type="range" min=\{(\d+)\} max=\{(\d+)\}[^>]*value=\{rate\}/.exec(panel);
  assert.ok(slider, "throughput slider not found");
  console.log(`  slider min=${slider[1]} max=${slider[2]}`);
  assert.equal(Number(slider[1]), 150);
});

test("TC-UT-06c (API): throughput 100 veh/h is rejected or clamped to 150", () => {
  const { PrescriptiveTrafficQuerySchema } = evaluate<any>(
    [declaration(controller, "PrescriptiveTrafficQuerySchema")],
    ["PrescriptiveTrafficQuerySchema"],
    { z },
  );
  const r = PrescriptiveTrafficQuerySchema.safeParse({ throughput: "100" });
  const used = r.success ? Math.max(1, r.data.throughput) : null; // the service's own clamp is max(1, throughput)
  console.log(`  schema success=${r.success} throughput used by service=${used}`);
  assert.ok(!r.success || used === 150, `API accepted throughput=100 and the service plans with ${used} veh/h/booth`);
});
