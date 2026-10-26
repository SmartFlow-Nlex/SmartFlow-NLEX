/* TC-UT-12  Incidents / Patrol alert hours above the day's mean
 * components/dashboard/PatrolAlertWindowPanel.tsx: buildProfile(hourly)
 * (module-private) finds runs of hours strictly above the day's mean; the
 * component's inline `primary` expression picks the longest run. Both are
 * extracted. buildProfile always treats a day as 24 hours (mean = sum / 24,
 * loop h = 0..23). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readSource, declaration, between, evaluate } from "../../../Back-End/tests/support/source-extract.ts";

const src = readSource("Front-End-Dashboard/components/dashboard/PatrolAlertWindowPanel.tsx");
const primaryExpr = between(src, "const primary =", "return { label:", "const profile = buildProfile(hourly);")
  .replace("const primary =", "")
  .trim()
  .replace(/;$/, "");

const { buildProfile, primaryOf, windowSpanHours } = evaluate<any>(
  [
    declaration(src, "buildProfile"),
    declaration(src, "windowSpanHours"),
    `const primaryOf = (profile: any, days: number) => (${primaryExpr});`,
  ],
  ["buildProfile", "primaryOf", "windowSpanHours"],
);

const describe = (hourly: number[]) => {
  const profile = buildProfile(hourly);
  const primary = primaryOf(profile, 1);
  const elevated = hourly.map((v, h) => (v > profile.mean ? h + 1 : null)).filter((h) => h != null);
  return { mean: profile.mean, windows: profile.windows, elevatedHours1Based: elevated, longest: windowSpanHours(primary) };
};

test("TC-UT-12: 8 hourly risks 1,1,2,6,7,3,1,3 -> mean 3.0, hours 4-5 elevated, longest window 2 h", () => {
  const r = describe([1, 1, 2, 6, 7, 3, 1, 3]);
  console.log(`  ${JSON.stringify(r)}`);
  assert.equal(r.mean, 3.0, "buildProfile divides by 24, not by the number of hours given");
  assert.deepEqual(r.elevatedHours1Based, [4, 5]);
  assert.equal(r.longest, 2);
});

test("TC-UT-12 (supplementary): the same pattern over a full 24-hour day", () => {
  const day = [1, 1, 2, 6, 7, 3, 1, 3];
  const r = describe([...day, ...day, ...day]);
  console.log(`  ${JSON.stringify({ mean: r.mean, windows: r.windows, longest: r.longest })}`);
  assert.equal(r.mean, 3.0);
  assert.deepEqual(r.windows, [[3, 5], [11, 13], [19, 21]]); // only the 6 and 7 hours; 3 == mean is not elevated
  assert.equal(r.longest, 2);
});
