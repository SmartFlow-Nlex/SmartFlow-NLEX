/* TC-UT-18  Traffic / TOPSIS ranking
 * components/dashboard/prescriptiveTraffic.shared.ts: topsisRank(events,
 * weights) — used by Event Intervention Ranking. It has four criteria
 * (extraVehicles = surge - baseline, uplift, evidence = nEvents, uncertainty
 * = upliftHi - upliftLo). The sheet's two benefit criteria are carried by the
 * first two with equal weights 0.5/0.5; evidence and uncertainty are zero and
 * weighted 0, so they add nothing to either distance. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { topsisRank, type EventRow } from "../../components/dashboard/prescriptiveTraffic.shared.ts";

const row = (exit: string, c1: number, c2: number): EventRow => ({
  exit, event: "test", baseline: 0, surge: c1, uplift: c2, upliftLo: c2, upliftHi: c2, nEvents: 0, material: true, anchorExit: exit,
});

test("TC-UT-18: X(9,7), Y(6,5), Z(3,9), equal weights -> closeness X 0.777, Y 0.390, Z 0.375; rank X, Y, Z", () => {
  const ranked = topsisRank([row("X", 9, 7), row("Y", 6, 5), row("Z", 3, 9)], [0.5, 0.5, 0, 0]);
  const closeness = Object.fromEntries(ranked.map((r) => [r.exit, Math.round(r.closeness * 1000) / 1000]));
  console.log(`  closeness=${JSON.stringify(closeness)} rank=${ranked.map((r) => r.exit).join(",")}`);
  assert.deepEqual(closeness, { X: 0.777, Y: 0.39, Z: 0.375 });
  assert.deepEqual(ranked.map((r) => r.exit), ["X", "Y", "Z"]);
  assert.deepEqual(ranked.map((r) => r.rank), [1, 2, 3]);
});
