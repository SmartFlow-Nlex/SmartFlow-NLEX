/* TC-UT-11  Incidents / Hotspot 80% cumulative cutoff
 * The "Hotspot monitoring alert" card the sheet names was removed from
 * PrescriptiveDeploymentPanel.tsx in Jertz-Commit-10 (b4d8b16). The same
 * 80%-cumulative rule survives inline in
 * components/dashboard/SecondaryIncidentRiskPanel.tsx (COVERAGE_TARGET = 0.8,
 * rows sorted by n, kept until the running total reaches 80%). That block is
 * extracted and run on the sheet's counts. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readSource, between, evaluate } from "../../../Back-End/tests/support/source-extract.ts";

const src = readSource("Front-End-Dashboard/components/dashboard/SecondaryIncidentRiskPanel.tsx");
const block = between(src, "const COVERAGE_TARGET = 0.8;", "// Within that top set");

const { flagged } = evaluate<any>(
  [`const flagged = (allRows: { key: string; n: number }[]) => { ${block} return [...topKeys]; };`],
  ["flagged"],
);

test("TC-UT-11: 40, 25, 15, 10, 6, 4 -> cumulative 40%, 65%, 80% -> first 3 segments flagged", () => {
  const counts = [40, 25, 15, 10, 6, 4];
  const rows = counts.map((n, i) => ({ key: `seg${i + 1}`, n }));
  const keys = flagged(rows);
  let c = 0;
  const shares = counts.map((n) => `${(c += n)}%`);
  console.log(`  cumulative=${shares.join(",")} flagged=${keys.join(",")}`);
  assert.deepEqual(keys, ["seg1", "seg2", "seg3"]);
});
