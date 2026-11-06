import { CIRCUITS, circuitSolved, circuitStart, DIALS, dialsRight, loadProblem, LOADS, loadSolved, parseCircuit, rotateMask, rotateTile, solveLoad, type Tile } from '../core/puzzles';
import { ACHIEVEMENTS, COLLECTIBLES, decorationsFor, DISCOVERIES, GEAR, QUIZ, SIDE_QUESTS } from '../core/progression';
import { allModeSets, BOCAUE_PLAZA, failureLane, plazaSolved, simulatePlaza, withTagDown } from '../core/plaza';
import { awardAchievements, buyGear, collect, completeMission, defaultSave, discover, loadSave, SAVE_VERSION, serializeSave, sideStep } from '../core/save';
import { savings } from '../core/emissions';
import { DELIVERY_ITEMS, DELIVERY_MISSION, ECO_MISSION, GRIDLOCK_MISSION, MISSIONS, newRun, RIVER_MISSION, restoreRun, setFlag } from '../core/mission';
import { missionOpen, NLEX_STOPS } from '../core/nlex';
import { allPlans, comparePlan, evaluatePlan } from '../core/transport';
import { ROSTER } from '../core/speciesFacts';
import { assert, test } from './harness';

/* ---- Puzzles ---- */

test('puzzles: every circuit is solved as designed, and starts scrambled', () => {
  for (const level of Object.values(CIRCUITS)) {
    assert.ok(circuitSolved(parseCircuit(level.solution)), `${level.id} solution`);
    assert.ok(!circuitSolved(circuitStart(level)), `${level.id} start must not already be solved`);
  }
});

test('puzzles: a circuit is always solvable from its start by turning pieces', () => {
  for (const level of Object.values(CIRCUITS)) {
    let grid: Tile[][] = circuitStart(level);
    const goal = parseCircuit(level.solution);
    /* Turn each piece until it matches the solution: at most three taps each. */
    grid.forEach((row, y) =>
      row.forEach((_, x) => {
        for (let k = 0; k < 4 && grid[y][x].mask !== goal[y][x].mask; k += 1) {
          grid = rotateTile(grid, x, y);
        }
      }),
    );
    assert.ok(circuitSolved(grid), level.id);
  }
});

test('puzzles: four turns bring a piece back where it started', () => {
  for (let m = 0; m < 16; m += 1) {
    assert.equal(rotateMask(m, 4), m);
    assert.equal(rotateMask(rotateMask(m, 1), 3), m);
  }
});

test('puzzles: the dials count how many are right, nothing more', () => {
  const d = DIALS.sensor;
  assert.equal(dialsRight(d, d.target), 3);
  assert.equal(dialsRight(d, [9, 9, 9]), 0);
  assert.ok(d.target.every((t) => t >= 0 && t < d.options));
});

test('puzzles: the van can be packed, the spare generator is never needed, and the rules bite', () => {
  const level = LOADS.delivery;
  const sol = solveLoad(level);
  assert.ok(sol !== null, 'a packing exists');
  assert.ok(loadSolved(level, sol ?? []));
  assert.ok(!(sol ?? []).some((p) => p.id === 'generator'));
  /* Water touching the camera traps is refused, with a reason. */
  const bad = loadProblem(level, [
    { id: 'traps', x: 0, y: 0, turns: 0 },
    { id: 'water', x: 1, y: 0, turns: 0 },
  ]);
  assert.ok(bad !== null && bad.includes('must not touch'));
  assert.ok(loadProblem(level, [{ id: 'seedlings', x: 3, y: 0, turns: 0 }])?.includes('stick out') === true);
  /* With everything needed packed, the generator cannot also go in. */
  assert.ok(loadProblem(level, [...(sol ?? []), { id: 'generator', x: 0, y: 0, turns: 0 }]) !== null);
});

/* ---- The Gridlock's surprise ---- */

test('plaza: the surprise always breaks one of the player’s own tag lanes, and a fix always exists', () => {
  const solved = allModeSets(BOCAUE_PLAZA).filter((m) => plazaSolved(simulatePlaza(BOCAUE_PLAZA, m)));
  assert.atLeast(solved.length, 2);
  for (const m of solved) {
    const lane = failureLane(BOCAUE_PLAZA, m);
    assert.equal(m[lane], 'tag', m.join(','));
    const broken = withTagDown(BOCAUE_PLAZA, lane);
    assert.ok(!plazaSolved(simulatePlaza(broken, m)), 'the old setting no longer works');
    const fixes = allModeSets(broken).filter((x) => plazaSolved(simulatePlaza(broken, x)));
    assert.atLeast(fixes.length, 1, m.join(','));
  }
});

test('plaza: a failed reader only adds a rule: the sums for the same setting do not change', () => {
  const m = ['tag', 'cash', 'cash', 'closed', 'cash', 'tag'] as const;
  const a = simulatePlaza(BOCAUE_PLAZA, m);
  const b = simulatePlaza(withTagDown(BOCAUE_PLAZA, 1), m);
  assert.equal(a.co2Kg, b.co2Kg);
});

/* ---- Eco Delivery Rush ---- */

test('delivery: the usual way works, a better plan exists, and the electric van has real limits', () => {
  const p = DELIVERY_MISSION.transport;
  assert.ok(p !== null);
  if (p === null) {
    return;
  }
  const base = evaluatePlan(p, p.baseline);
  assert.ok(base.feasible, base.violations.map((v) => v.text).join('; '));
  const results = allPlans(p).map((plan) => evaluatePlan(p, plan));
  const ok = results.filter((r) => r.feasible);
  const best = ok.reduce((a, r) => (r.co2Kg < a.co2Kg ? r : a), ok[0]);
  assert.ok(best.co2Kg < base.co2Kg * 0.7, `best ${best.co2Kg} vs ${base.co2Kg}`);
  /* The open pickup cannot carry the kit; the e-van is not free before 7:30. */
  assert.ok(results.filter((r) => r.plan.fleetId === 'pickup-all').every((r) => !r.feasible));
  assert.ok(results.filter((r) => r.plan.fleetId === 'evan' && r.plan.departureId === 'early').every((r) => r.violations.some((v) => v.kind === 'availability')));
  assert.ok(results.some((r) => !r.feasible && r.violations.some((v) => v.kind === 'deadline')), 'some plan is too late');
  const c = comparePlan(p, best.plan);
  assert.ok(c.savings.savedKg > 0);
});

test('delivery: six supplies, each found once, two of them by anyone and four by one hero each', () => {
  assert.equal(DELIVERY_ITEMS.length, 6);
  assert.equal(new Set(DELIVERY_ITEMS.map((i) => i.id)).size, 6);
  const heroes = DELIVERY_ITEMS.map((i) => i.hero).filter((h) => h !== null);
  assert.deepEqual([...heroes].sort(), ['awit', 'baging', 'dayo', 'sukat']);
  const gather = DELIVERY_MISSION.steps.find((s) => s.id === 'gather');
  assert.equal(gather?.needs.length, 6);
});

test('missions: every mission step can be finished, in order, from its flags', () => {
  for (const def of MISSIONS) {
    let run = newRun(def.id, `t-${def.id}`);
    for (const step of def.steps) {
      for (const n of step.needs) {
        run = setFlag(def, run, n);
      }
    }
    assert.equal(run.step, def.steps.length, def.id);
  }
});

test('missions: an old save mid-Gridlock resumes at the new repairs, not past them', () => {
  const raw = { missionId: GRIDLOCK_MISSION.id, runId: 'old', step: 3, flags: ['callTaken', 'plazaSurveyed', 'fixSignal', 'fixCable', 'removeJammer'], plan: null };
  const run = restoreRun(GRIDLOCK_MISSION, raw);
  assert.ok(run !== null);
  assert.equal(GRIDLOCK_MISSION.steps[run?.step ?? 0].id, 'repair');
});

test('missions: titles and the line', () => {
  assert.equal(RIVER_MISSION.title, 'Creek Rescue');
  assert.equal(ECO_MISSION.title, 'Solar Power Rescue');
  assert.equal(NLEX_STOPS.find((s) => s.id === 'balintawak')?.missionId, DELIVERY_MISSION.id);
  const fresh = defaultSave();
  assert.ok(!missionOpen(fresh, DELIVERY_MISSION.id));
  const after = { ...fresh, missions: { ...fresh.missions, [GRIDLOCK_MISSION.id]: { completedAt: 'x', plays: 1, bestPlan: null, bestChoice: null, bestParts: [], bestPlanKg: 1, baselineKg: 2, bestSavedKg: 1, calculationVersion: 'v' } } };
  assert.ok(missionOpen(after, DELIVERY_MISSION.id));
});

/* ---- Progression ---- */

test('progression: ids are unique, every patch and observation has a zone spot name', () => {
  for (const list of [COLLECTIBLES.map((c) => c.id), DISCOVERIES.map((d) => d.id), SIDE_QUESTS.map((q) => q.id), GEAR.map((g) => g.id), ACHIEVEMENTS.map((a) => a.id)]) {
    assert.equal(new Set(list).size, list.length);
  }
  assert.equal(COLLECTIBLES.length, 15);
  /* Every hero has patches only they can reach. */
  for (const h of ['dayo', 'baging', 'sukat', 'awit']) {
    assert.atLeast(COLLECTIBLES.filter((c) => c.hero === h).length, 2, h);
  }
});

test('progression: a patch, an observation and a side quest each pay once', () => {
  let s = defaultSave();
  const first = collect(s, COLLECTIBLES[0].id);
  assert.ok(first.added);
  s = first.save;
  const again = collect(s, COLLECTIBLES[0].id);
  assert.ok(!again.added);
  assert.equal(again.save.guardianPoints, s.guardianPoints);
  assert.ok(!collect(s, 'nope').added);
  s = discover(s, DISCOVERIES[0].id).save;
  assert.equal(discover(s, DISCOVERIES[0].id).added, false);
  const q = SIDE_QUESTS[0];
  let completed = 0;
  for (const n of [...q.needs, ...q.needs]) {
    const r = sideStep(s, n);
    s = r.save;
    completed += r.completed === null ? 0 : 1;
  }
  assert.equal(completed, 1);
  assert.ok(s.sideQuests.includes(q.id));
});

test('progression: achievements are granted once, from the save alone', () => {
  let s = defaultSave();
  assert.equal(awardAchievements(s).ids.length, 0);
  s = { ...s, missions: { [GRIDLOCK_MISSION.id]: { completedAt: 'x', plays: 1, bestPlan: null, bestChoice: null, bestParts: [], bestPlanKg: 1, baselineKg: 2, bestSavedKg: 1, calculationVersion: 'v' } } };
  const r = awardAchievements(s);
  assert.deepEqual(r.ids, ['a-first', 'a-plaza']);
  const again = awardAchievements(r.save);
  assert.equal(again.ids.length, 0);
  assert.equal(again.save.guardianPoints, r.save.guardianPoints);
});

test('progression: points buy gear, and never change any measured result', () => {
  let s = { ...defaultSave(), guardianPoints: 45 };
  const before = JSON.stringify({ a: s.animalsAssisted, h: s.habitatsRestored, e: s.environmentObjectives, m: s.missions });
  const bought = buyGear(s, 'boots');
  assert.ok(bought !== null);
  s = bought ?? s;
  assert.equal(s.guardianPoints, 5);
  assert.equal(buyGear(s, 'boots'), null, 'no second pair');
  assert.equal(buyGear(s, 'lens'), null, 'not enough points');
  assert.equal(JSON.stringify({ a: s.animalsAssisted, h: s.habitatsRestored, e: s.environmentObjectives, m: s.missions }), before);
});

test('progression: the Command Center remembers each finished mission', () => {
  assert.deepEqual(decorationsFor([]), []);
  assert.deepEqual(decorationsFor(['nlex-river', 'nlex-eco']), ['dec-creek', 'dec-solar']);
});

test('progression: every quiz question comes from a checked species record', () => {
  for (const q of QUIZ) {
    assert.ok(q.options.includes(q.answer));
    for (const id of q.options) {
      const s = ROSTER.find((r) => r.id === id);
      assert.ok(s !== undefined && s.nativeRange !== null, id);
    }
  }
});

/* ---- Save version 3 ---- */

test('save: a version 2 save loads into version 3 with the new lists empty', () => {
  const v2 = { ...JSON.parse(serializeSave(defaultSave())), version: 2 };
  delete v2.collectibles;
  delete v2.gear;
  delete v2.achievements;
  v2.settings = { ...v2.settings };
  delete v2.settings.guide;
  const { save, issues } = loadSave(JSON.stringify(v2));
  assert.equal(issues.length, 0);
  assert.equal(save.version, SAVE_VERSION);
  assert.equal(SAVE_VERSION, 3);
  assert.deepEqual(save.collectibles, []);
  assert.deepEqual(save.gear, []);
  assert.equal(save.settings.guide, true);
});

test('save: version 3 lists round-trip, and unknown ids are dropped', () => {
  let s = defaultSave();
  s = collect(s, COLLECTIBLES[2].id).save;
  s = discover(s, DISCOVERIES[1].id).save;
  s = { ...s, gear: ['kite', 'jetpack'], achievements: ['a-first', 'a-made-up'] };
  const back = loadSave(serializeSave(s)).save;
  assert.deepEqual(back.collectibles, [COLLECTIBLES[2].id]);
  assert.deepEqual(back.discoveries, [DISCOVERIES[1].id]);
  assert.deepEqual(back.gear, ['kite']);
  assert.deepEqual(back.achievements, ['a-first']);
});

test('save: the delivery completes once, with its plan', () => {
  const def = DELIVERY_MISSION;
  const p = def.transport;
  if (p === null) {
    throw new Error('no transport');
  }
  let run = newRun(def.id, 'd1');
  for (const step of def.steps) {
    for (const n of step.needs) {
      run = setFlag(def, run, n);
    }
  }
  run = { ...run, plan: { fleetId: 'one-van', routeId: 'nlex', departureId: 'late' } };
  const c = comparePlan(p, run.plan as NonNullable<typeof run.plan>);
  const out = { baselineKg: c.baseline.co2Kg, planKg: c.player.co2Kg, savings: savings(c.baseline.co2Kg, c.player.co2Kg) };
  const first = completeMission(defaultSave(), def, run, out);
  assert.ok(!first.report.duplicate);
  assert.ok(first.save.environmentObjectives.includes('delivery-packed'));
  const twice = completeMission(first.save, def, run, out);
  assert.ok(twice.report.duplicate);
});
