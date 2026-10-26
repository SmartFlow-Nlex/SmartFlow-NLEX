/* TC-UT-24  Scenario Sandbox / Confidence interval
 * app/dashboard/scenario-sandbox/simulation.ts: summarise(xs) -> { mean, sd,
 * ci95, n } with ci95 = tCrit(n - 1) * sd / sqrt(n) (the half-width), tCrit
 * read from the T95 table. All three are module-private; extracted. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readSource, declaration, evaluate } from "../../../Back-End/tests/support/source-extract.ts";

const src = readSource("Front-End-Dashboard/app/dashboard/scenario-sandbox/simulation.ts");
const { summarise, tCrit } = evaluate<any>(
  [`type RepStat = { mean: number; sd: number; ci95: number; n: number };`, declaration(src, "T95"), declaration(src, "tCrit"), declaration(src, "summarise")],
  ["summarise", "tCrit"],
);

test("TC-UT-24: 50, 52, 48, 50, 50 -> mean 50.0, SD 1.41, 95% CI 50 ± 1.76 (Student t, n = 5)", () => {
  const s = summarise([50, 52, 48, 50, 50]);
  const normalHalf = 1.96 * (s.sd / Math.sqrt(s.n));
  const method = Math.abs(s.ci95 - tCrit(s.n - 1) * (s.sd / Math.sqrt(s.n))) < 1e-12 && tCrit(s.n - 1) !== 1.96 ? `Student t (t=${tCrit(s.n - 1)}, df=${s.n - 1})` : "normal";
  console.log(`  mean=${s.mean} sd=${s.sd.toFixed(4)} ci95=±${s.ci95.toFixed(4)} method=${method} (normal approximation would be ±${normalHalf.toFixed(4)})`);
  assert.equal(s.n, 5);
  assert.equal(s.mean, 50.0);
  assert.equal(Number(s.sd.toFixed(2)), 1.41);
  assert.equal(Number(s.ci95.toFixed(2)), 1.76);
  assert.equal(tCrit(4), 2.776);
});
