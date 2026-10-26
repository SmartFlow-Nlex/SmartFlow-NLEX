/* TC-UT-13  Incidents / MCLP patrol staging
 * components/dashboard/PrescriptiveDeploymentPanel.tsx: solveMclp(weights,
 * covers, k) — module-private, solved with YALPS. Extracted and run with the
 * real yalps `solve`. The function assumes one candidate site per demand zone
 * (covers.length === weights.length), so the sheet's three sites A, B, C get a
 * fourth placeholder site that covers nothing; it can never add coverage. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { solve } from "yalps";
import { readSource, declaration, evaluate } from "../../../Back-End/tests/support/source-extract.ts";

const src = readSource("Front-End-Dashboard/components/dashboard/PrescriptiveDeploymentPanel.tsx");
const { solveMclp } = evaluate<any>([declaration(src, "solveMclp")], ["solveMclp"], { solve });

const SITES = ["A", "B", "C", "(none)"];
const weights = [10, 20, 25, 5]; // d1..d4
// covers[j] = demand zones site j reaches: d1 by A; d2 by A, B; d3 by C; d4 by B.
const covers = [[0, 1], [1, 3], [2], []];
const total = weights.reduce((s, w) => s + w, 0);

for (const [id, k, sites, covered] of [["a", 1, ["A"], 30], ["b", 2, ["A", "C"], 55]] as const) {
  test(`TC-UT-13${id}: fleet size ${k} -> stage at ${sites.join(" and ")}, covering ${covered} of ${total}`, () => {
    const r = solveMclp(weights, covers, k);
    const chosen = r.chosen.map((j: number) => SITES[j]);
    console.log(`  k=${k} chosen=${chosen.join(",")} covered=${r.coveredWeight} of ${total}`);
    assert.equal(total, 60);
    assert.deepEqual(chosen.sort(), [...sites].sort());
    assert.equal(r.coveredWeight, covered);
  });
}
