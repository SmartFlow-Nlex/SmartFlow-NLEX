/* TC-UT-02  Overview / Ranking of "Slow and congested now"
 * TC-UT-03  Overview / Empty state when corridor is clear
 *
 * components/overview/OverviewLive.tsx keeps this logic inline in the
 * component: the `hot` useMemo (filter non-clear, sort), SHOWN = 3, the
 * "See all {hot.length}" condition and the empty-state paragraph. The test
 * cuts those exact pieces out of the source and runs them. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readSource, declaration, argument, between, evaluate } from "../../../Back-End/tests/support/source-extract.ts";

const FILE = "Front-End-Dashboard/components/overview/OverviewLive.tsx";
const src = readSource(FILE);

// const hot = useMemo(() => statuses.filter(...).map(...).sort(<comparator>), ...)
const hotBlock = between(src, "const hot: Hot[] = useMemo(", "[statuses, byName]");
const filterArg = argument(hotBlock, ".filter(");
const sortArg = argument(hotBlock, ".sort(");
const seeAllCond = between(src, "hot.length > SHOWN", "&&").trim();
const emptyMarkup = between(src, '<p className="ov-hot-empty">', "</p>");
const windowDecl = declaration(src, "windowMin");

const { SHOWN, severity, isHot, cmp, showSeeAll, windowOf } = evaluate<any>(
  [
    declaration(src, "SHOWN"),
    declaration(src, "severity"),
    `const isHot = ${filterArg};`,
    `const cmp = ${sortArg};`,
    `const showSeeAll = (hot: unknown[]) => ${seeAllCond};`,
    `const windowOf = (live: { windowMinutes?: number | null }) => { ${windowDecl} return windowMin; };`,
  ],
  ["SHOWN", "severity", "isHot", "cmp", "showSeeAll", "windowOf"],
);

/** The useMemo pipeline: filter, wrap as { s, exit }, sort. */
function rank(statuses: any[]) {
  return statuses.filter(isHot).map((s) => ({ s, exit: undefined })).sort(cmp);
}

test("TC-UT-02: congested before slow, then slowest speed, then longest delay; preview of 3, See all 5", () => {
  const statuses = [
    { exit: "A", direction: "NB", status: "slow", speedKmh: 35, delaySeconds: 4 * 60 },
    { exit: "B", direction: "NB", status: "congested", speedKmh: 12, delaySeconds: 9 * 60 },
    { exit: "C", direction: "NB", status: "congested", speedKmh: 12, delaySeconds: 15 * 60 },
    { exit: "D", direction: "NB", status: "slow", speedKmh: 20, delaySeconds: 6 * 60 },
    { exit: "E", direction: "NB", status: "congested", speedKmh: 8, delaySeconds: 5 * 60 },
  ];
  const hot = rank(statuses);
  const order = hot.map((h) => h.s.exit);
  console.log(`  order=${order.join(",")} preview=${hot.slice(0, SHOWN).map((h) => h.s.exit).join(",")} seeAll=${showSeeAll(hot) ? `See all ${hot.length}` : "none"}`);
  assert.deepEqual(order, ["E", "C", "B", "D", "A"]);
  assert.equal(SHOWN, 3);
  assert.deepEqual(hot.slice(0, SHOWN).map((h) => h.s.exit), ["E", "C", "B"]);
  assert.equal(showSeeAll(hot), true);
  assert.equal(hot.length, 5);
  assert.equal(severity({ status: "clear" }), 0);
});

test("TC-UT-03: empty list -> empty preview, 60-minute message, no See all", () => {
  const hot = rank([]);
  const windowMin = windowOf({ windowMinutes: undefined }); // feed window not reported -> default
  const message = emptyMarkup
    .replace('<p className="ov-hot-empty">', "")
    .replace("{windowMin}", String(windowMin))
    .replace(/\s+/g, " ")
    .trim();
  console.log(`  preview=[] message="${message}" seeAll=${showSeeAll(hot)}`);
  assert.equal(hot.length, 0);
  assert.deepEqual(hot.slice(0, SHOWN), []);
  assert.equal(windowMin, 60);
  assert.equal(windowOf({ windowMinutes: 60 }), 60);
  assert.ok(message.startsWith("No slow or congested exit-direction in the last 60 minutes"), message);
  assert.equal(showSeeAll(hot), false);
  // The empty branch is chosen by `hot.length === 0`, after the failed/loading branches.
  assert.match(src, /\) : hot\.length === 0 \? \(\s*<p className="ov-hot-empty">/);
});
