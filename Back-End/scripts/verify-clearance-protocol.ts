/**
 * Verification for clearance-protocol.service.ts, following this repo's own
 * "ad-hoc npx tsx script" convention (no test framework is configured here —
 * see run-sql.ts) rather than introducing one. Covers:
 *   1. Kaplan-Meier, hand-computed, with a censored observation.
 *   2. The delay formula, including the q>=c guard and the q<=cr "no queue" case.
 *   3. The two-stage MILP on a known-optimum case (zero unit-effect, zero
 *      delay cost -> cheapest feasible choice must be the minimum units).
 *   4. EVPI>=0 / VSS>=0 as a general correctness invariant (always true for
 *      a correctly solved two-stage stochastic program), on a non-trivial
 *      scenario set.
 *   5. Scenario probabilities sum to exactly 1.
 *   6. A live DB cross-check: this service's count of non-censored, valid
 *      [0,1440]-minute durations for accidents/all-weather/full-range must
 *      equal the Descriptive tab's own accidentClearance valid_n for the
 *      same filters (incident.service.ts) -- the two differ in how they
 *      treat >1440 min (censor here, drop there), so this checks the part
 *      that should still agree: the same underlying rows.
 *
 * Usage: npx tsx scripts/verify-clearance-protocol.ts
 */
import { Pool } from "pg";
import { env } from "../src/config/env.js";
import {
  kaplanMeier,
  toObservations,
  queueDelayVehHours,
  solveClearanceProtocol,
  buildScenarios,
  effectiveDurationMin,
  type ScenarioDef,
  type Observation,
} from "../src/services/clearance-protocol.service.js";

let failures = 0;
function check(label: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  PASS  ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ""}`);
  }
}
function approx(a: number, b: number, tol = 1e-6) {
  return Math.abs(a - b) <= tol;
}

// ── 1. Kaplan-Meier, hand-computed ──────────────────────────────────────────
console.log("\n[1] Kaplan-Meier (hand-computed)");
{
  // Observations: 2(event), 3(event), 3(censored), 5(event), 8(censored).
  // By hand:
  //   t=2: atRisk=5, d=1 -> S=0.8
  //   t=3: atRisk=4, d=1 -> S=0.8*(3/4)=0.6
  //   t=5: atRisk=2, d=1 -> S=0.6*(1/2)=0.3
  const obs: Observation[] = [
    { duration: 2, censored: false },
    { duration: 3, censored: false },
    { duration: 3, censored: true },
    { duration: 5, censored: false },
    { duration: 8, censored: true },
  ];
  const curve = kaplanMeier(obs);
  const at = (t: number) => curve.find((p) => p.minute === t);
  check("S(2) = 0.8", approx(at(2)?.survival ?? NaN, 0.8), `got ${at(2)?.survival}`);
  check("S(3) = 0.6", approx(at(3)?.survival ?? NaN, 0.6), `got ${at(3)?.survival}`);
  check("S(5) = 0.3", approx(at(5)?.survival ?? NaN, 0.3), `got ${at(5)?.survival}`);
  check("atRisk(2) = 5", at(2)?.atRisk === 5, `got ${at(2)?.atRisk}`);
  check("atRisk(3) = 4", at(3)?.atRisk === 4, `got ${at(3)?.atRisk}`);
  check("atRisk(5) = 2", at(5)?.atRisk === 2, `got ${at(5)?.atRisk}`);
}

// ── 1b. toObservations censoring split ──────────────────────────────────────
console.log("\n[1b] toObservations: >1440 censored, negative/missing excluded");
{
  const raw = [100, 1500, -5, null, 1440, 1441];
  const obs = toObservations(raw);
  // 100 (event), 1500->censored@1440, -5 excluded, null excluded, 1440 (event, boundary), 1441->censored@1440
  check("5 kept (2 excluded)", obs.length === 4, `got ${obs.length}`);
  check("2 censored", obs.filter((o) => o.censored).length === 2, `got ${obs.filter((o) => o.censored).length}`);
  check("1440 itself is NOT censored (boundary is inclusive)", obs.some((o) => o.duration === 1440 && !o.censored));
}

// ── 2. Delay formula ─────────────────────────────────────────────────────────
console.log("\n[2] Queueing delay formula");
{
  // D=60min=1h, q=4200, c=6000, cr=3000:
  // delay = 1^2 * (4200-3000)(6000-3000) / (2*(6000-4200)) = (1200*3000)/(2*1800) = 1000
  const r1 = queueDelayVehHours(60, 4200, 6000, 3000);
  check("delay(60min, q=4200,c=6000,cr=3000) = 1000 veh-hr", approx(r1.delayVehHours, 1000), `got ${r1.delayVehHours}`);
  check("not capped", !r1.qCapped);

  const r2 = queueDelayVehHours(60, 7000, 6000, 3000);
  check("q>=c triggers the cap guard", r2.qCapped === true);
  check("capped delay is finite and positive", Number.isFinite(r2.delayVehHours) && r2.delayVehHours > 0, `got ${r2.delayVehHours}`);

  const r3 = queueDelayVehHours(60, 2000, 6000, 3000);
  check("q<=cr -> zero delay (reduced capacity still absorbs demand)", r3.delayVehHours === 0, `got ${r3.delayVehHours}`);
}

// ── 3. MILP known-optimum (zero unit-effect, zero delay cost) ──────────────
console.log("\n[3] Two-stage MILP: known optimum (beta=0, delayCost=0)");
{
  const scenarios: ScenarioDef[] = [
    { label: "fast", probability: 0.5, durationMin: 10 },
    { label: "typical", probability: 0.5, durationMin: 100 },
  ];
  // With beta=0, more units never reduce duration, and delay cost is zero --
  // extra units are pure waste, so the optimum MUST be the minimum (x=1, no escalation).
  const sol = solveClearanceProtocol(scenarios, /* tau */ 20, /* maxUnits */ 2, /* beta */ 0, /* unitCostPerHour */ 100, /* delayCostPerVehHour */ 0, { q: 1000, c: 2000, cr: 1000 });
  check("x* = 1 (cheapest feasible choice, no benefit from more units)", sol.unitsAtDispatch === 1, `got ${sol.unitsAtDispatch}`);
  check("no escalation anywhere", Object.values(sol.escalationByScenario).every((e) => e === 0), JSON.stringify(sol.escalationByScenario));
}

// ── 3b. effectiveDurationMin: staging can never beat full-headcount-from-start
console.log("\n[3b] Regression: staged (x then x+e) duration must never beat flat (x+e) from t=0");
{
  // D=66, tau=10, x=3, e=1, beta=0.25 -- the exact case that previously
  // produced a negative EVPI (an earlier version of effectiveDurationMin
  // compounded baseRate(x) with a separate (1+beta*e) factor, letting a
  // staged 3-then-4 plan clear FASTER than deploying 4 units from t=0).
  const staged = effectiveDurationMin(66, 10, 3, 1, 0.25);
  const flatFour = 66 / (1 + 0.25 * 3); // baseRate(4), the true "4 units from t=0" duration
  check("staged(3->4 at tau) >= flat(4 from t=0)", staged >= flatFour - 1e-9, `staged=${staged} flatFour=${flatFour}`);
  // Hand-computed: workDoneByTau=10*1.5=15; remaining=51; baseRate(3+1-1... )
  // -- baseRate(x+e)=baseRate(4)=1.75; eff=10+51/1.75=39.142857...
  check("staged value matches hand computation", approx(staged, 10 + 51 / 1.75), `got ${staged}`);
}

// ── 4. EVPI/VSS non-negativity invariant ────────────────────────────────────
console.log("\n[4] EVPI >= 0 and VSS >= 0 (must always hold for a correct solve)");
{
  const scenarios: ScenarioDef[] = [
    { label: "fast", probability: 0.5, durationMin: 10 },
    { label: "typical", probability: 0.3, durationMin: 60 },
    { label: "slow", probability: 0.15, durationMin: 150 },
    { label: "extreme", probability: 0.05, durationMin: 400 },
  ];
  const sol = solveClearanceProtocol(scenarios, 39, 4, 0.25, 1500, 300, { q: 4200, c: 6000, cr: 3000 });
  check("EVPI >= 0", sol.evpi >= -1e-6, `got ${sol.evpi}`);
  check("VSS >= 0", sol.vss >= -1e-6, `got ${sol.vss}`);
  check("RP is finite (solver reached optimal)", Number.isFinite(sol.rp), `got ${sol.rp}`);

  // The exact real scenario set (Injury accidents, blockage_cleared-based
  // P50=10) that produced EVPI=-1450 before the effectiveDurationMin fix --
  // escalation genuinely triggers here (unlike the case above), which is
  // exactly the regime the earlier bug needed to surface.
  const realScenarios: ScenarioDef[] = [
    { label: "fast", probability: 0.5037625418060199, durationMin: 5 },
    { label: "typical", probability: 0.2993311036789299, durationMin: 26 },
    { label: "slow", probability: 0.1475752508361204, durationMin: 66 },
    { label: "extreme", probability: 0.049331103678929816, durationMin: 136 },
  ];
  const sol2 = solveClearanceProtocol(realScenarios, 10, 4, 0.25, 1500, 300, { q: 4200, c: 6000, cr: 3000 });
  check("EVPI >= 0 (real triggering scenario set)", sol2.evpi >= -1e-6, `got ${sol2.evpi}`);
  check("VSS >= 0 (real triggering scenario set)", sol2.vss >= -1e-6, `got ${sol2.vss}`);
  // Informational, not asserted: whether escalation is chosen here is a
  // property of the cost parameters, not something the fix should force one
  // way or the other -- the bug was that it was artificially CHEAPER to
  // escalate than physically possible, not that escalating is always right.
  console.log(`  INFO  escalation under these params: ${JSON.stringify(sol2.escalationByScenario)}`);
}

// ── 5. Scenario probabilities sum to 1 ──────────────────────────────────────
console.log("\n[5] buildScenarios: probabilities sum to 1");
{
  // Synthetic, reasonably realistic-shaped durations.
  const events = [2, 3, 4, 5, 6, 8, 10, 12, 15, 18, 22, 28, 35, 45, 60, 90, 150, 300];
  const obs: Observation[] = events.map((d) => ({ duration: d, censored: false }));
  const curve = kaplanMeier(obs);
  const { scenarios } = buildScenarios(curve, events);
  const total = scenarios.reduce((s, x) => s + x.probability, 0);
  check("sum == 1", approx(total, 1, 1e-9), `got ${total}`);
  check("4 scenarios", scenarios.length === 4);
}

// ── 6. Live DB cross-check against Descriptive MTTC's row count ────────────
async function dbCheck() {
  console.log("\n[6] Live DB: valid-duration count matches Descriptive MTTC (accident, all-weather, full range)");
  if (!env.POSTGRES_URL) {
    console.log("  SKIP  no POSTGRES_URL configured");
    return;
  }
  const db = new Pool({ connectionString: env.POSTGRES_URL, ssl: env.PG_SSL_MODE === "disable" ? undefined : { rejectUnauthorized: false } });
  try {
    const client = await db.connect();
    try {
      // Descriptive's own accidentClearance query (incident.service.ts), full
      // range, no weather filter -- clearance-protocol.service.ts reverted to
      // site_cleared (see its "Clearance method" assumption: blockage_cleared
      // was tried and found to default to event_start_date in 21-32% of rows
      // across every severity), so this comparison is valid again.
      const descriptive = await client.query(
        `SELECT COUNT(*) FILTER (WHERE clearance_min IS NOT NULL AND clearance_min >= 0)::int AS valid_n
         FROM silver.nlex_accident_events_clean`,
      );
      const descriptiveValidN = descriptive.rows[0].valid_n;

      // This service's own raw-duration derivation, same rows, no filters.
      const raw = await client.query(
        `SELECT EXTRACT(EPOCH FROM (site_cleared - event_start_date)) / 60.0 AS raw_duration_min FROM silver.nlex_accident_events_clean`,
      );
      const rawMinutes = raw.rows.map((r: { raw_duration_min: string | null }) => (r.raw_duration_min == null ? null : Number(r.raw_duration_min)));
      const obs = toObservations(rawMinutes);
      const nonCensored = obs.filter((o) => !o.censored).length;

      check(
        "non-censored count == Descriptive valid_n",
        nonCensored === descriptiveValidN,
        `service=${nonCensored} descriptive=${descriptiveValidN}`,
      );
    } finally {
      client.release();
    }
  } finally {
    await db.end();
  }
}

dbCheck()
  .catch((err) => {
    failures++;
    console.log(`  FAIL  DB check threw: ${err.message}`);
  })
  .finally(() => {
    console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
    process.exit(failures === 0 ? 0 : 1);
  });
