import { CHARGING_LOSS, FACTORS, journey, VEHICLES } from '../core/emissions';
import { ASSUMPTIONS, crewHours, CREW_HOURS, DEPOT_BEFORE, facilityDay, UPGRADE_OPTIONS, type Upgrade } from '../core/facility';
import { chosenUpgrades, CREEK_LITTER, DELIVERY_MISSION, depotRepairs, ECO_MISSION, GRIDLOCK_MISSION, HORNBILL_MISSION, missionById, missionTransport, MISSIONS, newRun, RIVER_MISSION, setFlag, type MissionDef, type MissionRun } from '../core/mission';
import { missionOpen, NLEX_STOPS, progress } from '../core/nlex';
import { allModeSets, BOCAUE_PLAZA, checkModes, plazaSolved, simulatePlaza, type LaneMode } from '../core/plaza';
import { completeMission, defaultSave, loadSave, serializeSave, type SaveData } from '../core/save';
import { savings } from '../core/emissions';
import { allPlans, depotTransport, evaluatePlan, RIVER_TRANSPORT, type Plan } from '../core/transport';
import { assert, test } from './harness';

const P = BOCAUE_PLAZA;
const GOOD: LaneMode[] = ['tag', 'cash', 'cash', 'closed', 'tag', 'cash'];

/* ---- The toll plaza ---- */

test('plaza: the jammed plaza breaks no rule, and still leaves hundreds waiting', () => {
  const r = simulatePlaza(P, P.jammed);
  assert.equal(r.problems.length, 0, 'the jam is a fault, not an unsafe setting');
  assert.ok(r.leftWaiting > 100, String(r.leftWaiting));
  assert.ok(!plazaSolved(r));
});

test('plaza: the lane under repair must stay closed, whatever it would save', () => {
  const open = [...GOOD];
  open[3] = 'tag';
  const r = simulatePlaza(P, open);
  assert.ok(r.problems.some((p) => p.includes('coned off')));
  assert.ok(!plazaSolved(r), 'an unsafe setting can never be switched on');
});

test('plaza: staff limit and truck lanes are rules, not suggestions', () => {
  assert.ok(checkModes(P, ['cash', 'cash', 'cash', 'closed', 'cash', 'tag']).some((p) => p.includes('toll collectors')));
  assert.ok(checkModes(P, ['tag', 'cash', 'cash', 'closed', 'cash', 'tag']).some((p) => p.includes('wide lane')));
});

test('plaza: there is more than one answer, and most settings are not one', () => {
  const solved = allModeSets(P).map((m) => simulatePlaza(P, m)).filter(plazaSolved);
  assert.atLeast(solved.length, 2);
  assert.atMost(solved.length, 20);
});

test('plaza: same inputs, same answer', () => {
  assert.deepEqual(simulatePlaza(P, GOOD), simulatePlaza(P, GOOD));
});

test('plaza: CO2 is stopped hours x idle fuel x the fuel factor, with the transport board figures', () => {
  const r = simulatePlaza(P, GOOD);
  const fuel = r.carHours * VEHICLES.sedan.idleLPerH + r.truckHours * VEHICLES.truck.idleLPerH;
  assert.ok(Math.abs(r.fuelL - fuel) < 1e-9);
  const co2 = r.carHours * VEHICLES.sedan.idleLPerH * FACTORS.gasoline.value + r.truckHours * VEHICLES.truck.idleLPerH * FACTORS.diesel.value;
  assert.ok(Math.abs(r.co2Kg - co2) < 1e-9);
  assert.ok(plazaSolved(r));
  assert.ok(r.co2Kg < simulatePlaza(P, P.jammed).co2Kg);
});

test('plaza: both settings serve the same traffic', () => {
  assert.equal(simulatePlaza(P, GOOD).arrivals, simulatePlaza(P, P.jammed).arrivals);
});

/* ---- The depot ---- */

test('depot: each repair and upgrade lowers the day, and nothing goes below zero', () => {
  const before = facilityDay(DEPOT_BEFORE).co2Kg;
  const repaired = facilityDay({ repairs: ['sensor', 'leak', 'idling'], upgrades: [] }).co2Kg;
  assert.ok(repaired < before);
  for (const u of UPGRADE_OPTIONS) {
    const with1 = facilityDay({ repairs: ['sensor', 'leak', 'idling'], upgrades: [u.id] });
    assert.ok(with1.co2Kg < repaired, u.id);
    assert.ok(with1.gridKWh >= 0);
  }
});

test('depot: solar never offsets more than the depot uses by day', () => {
  const r = facilityDay({ repairs: ['sensor', 'leak', 'idling'], upgrades: ['solar', 'ledFloods', 'ledTubes'] });
  assert.ok(r.solarKWh <= ASSUMPTIONS.solar.kWp * ASSUMPTIONS.solar.kWhPerKWpDay + 1e-9);
  assert.ok(r.gridKWh > 0);
});

test('depot: grid electricity uses the same factor as the electric vans', () => {
  const r = facilityDay(DEPOT_BEFORE);
  assert.ok(Math.abs(r.co2Kg - (r.gridKWh * FACTORS.grid.value + r.idleL * FACTORS.diesel.value)) < 1e-9);
});

test('depot: the crew day forces a real choice', () => {
  const all = UPGRADE_OPTIONS.map((o) => o.id);
  assert.ok(crewHours(all) > CREW_HOURS, 'not everything fits');
  const combos: Upgrade[][] = [];
  for (let mask = 1; mask < 1 << all.length; mask += 1) {
    combos.push(all.filter((_, i) => mask & (1 << i)));
  }
  const fitting = combos.filter((c) => crewHours(c) <= CREW_HOURS).map((c) => facilityDay({ repairs: ['sensor', 'leak', 'idling'], upgrades: c }).co2Kg);
  const best = Math.min(...fitting);
  const close = fitting.filter((k) => k < best + 3).length;
  assert.atLeast(close, 2, 'more than one good answer');
});

/* ---- Electricity measured at the charger ---- */

test('e-trike: a figure measured at the charger gets no extra charging loss', () => {
  const r = journey(VEHICLES.etrike, { distanceKm: 10, stationaryMin: 0, movingFactor: 1 });
  assert.ok(Math.abs(r.chargerKWh - 10 * VEHICLES.etrike.kWhPerKm) < 1e-9);
  const van = journey(VEHICLES.evan, { distanceKm: 10, stationaryMin: 0, movingFactor: 1 });
  assert.ok(Math.abs(van.chargerKWh - (10 * VEHICLES.evan.kWhPerKm) / (1 - CHARGING_LOSS)) < 1e-9, 'the van figure is at the wheels, so it does');
});

/* ---- River Rescue's dispatch ---- */

const R = RIVER_TRANSPORT;
const rv = (fleetId: string, routeId: string, departureId: string): ReturnType<typeof evaluatePlan> => evaluatePlan(R, { fleetId, routeId, departureId });

test('river: the usual way is legal', () => {
  assert.ok(rv('three-runs', 'main', 'early').feasible);
});

test('river: sorted waste never mixes, unless the vehicle has the bins for it', () => {
  assert.ok(rv('pickup-mixed', 'main', 'mid').violations.some((v) => v.kind === 'compatibility'));
  assert.ok(rv('two-etrikes', 'lane', 'mid').violations.some((v) => v.kind === 'compatibility'));
  assert.ok(!rv('three-bin-truck', 'main', 'early').violations.some((v) => v.kind === 'compatibility'));
});

test('river: trucks do not fit the riverside lane, the e-trikes are on the school run early, and the rain is a deadline', () => {
  assert.ok(rv('three-bin-truck', 'lane', 'early').violations.some((v) => v.kind === 'route'));
  assert.ok(rv('etrikes', 'lane', 'early').violations.some((v) => v.kind === 'availability'));
  assert.ok(rv('three-runs', 'main', 'late').violations.some((v) => v.kind === 'deadline'));
});

test('river: every feasible plan moves all three kinds of waste and the collector', () => {
  for (const p of allPlans(R)) {
    const r = evaluatePlan(R, p);
    if (r.feasible) {
      assert.deepEqual(r.trips.flatMap((t) => [...t.cargo]).sort(), ['bio', 'recycle', 'residual']);
      assert.equal(r.trips.reduce((a, t) => a + t.people, 0), 1);
    }
  }
});

test('river: the best plans beat the usual way, and some legal plans do worse', () => {
  const base = rv('three-runs', 'main', 'early').co2Kg;
  assert.ok(rv('etrikes', 'lane', 'mid').co2Kg < base);
  assert.ok(rv('three-bin-truck', 'main', 'early').co2Kg < base);
  const legal = allPlans(R).map((p) => evaluatePlan(R, p)).filter((r) => r.feasible);
  assert.ok(legal.some((r) => r.co2Kg > base * 0.99), 'not every legal plan is an improvement');
});

/* ---- The depot's dispatch ---- */

test('depot dispatch: a run from before the simplification is still scored on its own dispatch', () => {
  const run: MissionRun = { ...newRun(ECO_MISSION.id, 'r'), flags: ['up:noIdle', 'up:solar'], plan: { fleetId: 'separate', routeId: 'nlex', departureId: 'early' } };
  assert.deepEqual(chosenUpgrades(run), ['solar', 'noIdle']);
  const problem = missionTransport(ECO_MISSION, run);
  assert.ok(problem !== null);
  const ids = (problem?.demand.cargo ?? []).map((c) => c.id);
  assert.deepEqual(ids, ['panels'], 'the engine-off rule needs nothing delivered');
  for (const p of allPlans(problem as NonNullable<typeof problem>)) {
    const r = evaluatePlan(problem as NonNullable<typeof problem>, p);
    if (r.feasible) {
      assert.deepEqual(r.trips.flatMap((t) => [...t.cargo]), ['panels']);
    }
  }
  assert.ok(evaluatePlan(problem as NonNullable<typeof problem>, (problem as NonNullable<typeof problem>).baseline).feasible, 'the usual way is legal');
});

test('depot: the simplified mission credits the solar roof and nothing it did not do', () => {
  let run: MissionRun = newRun(ECO_MISSION.id, 'r');
  for (const step of ECO_MISSION.steps) {
    for (const f of step.needs) {
      run = setFlag(ECO_MISSION, run, f);
    }
  }
  assert.deepEqual(chosenUpgrades(run), ['solar']);
  assert.deepEqual(depotRepairs(run), [], 'no repairs were made, so none are counted');
  assert.equal(missionTransport(ECO_MISSION, run), null, 'and there is no dispatch to score');
});

test('depot dispatch: with no cargo, no empty truck is sent', () => {
  const problem = depotTransport([]);
  const sep = problem.fleets.find((f) => f.id === 'separate');
  assert.equal(sep?.trips.length, 1);
});

/* ---- Missions, the line and the save ---- */

const finish = (def: MissionDef, id: string, plan: Plan | null, extra: string[] = []): MissionRun => {
  let run: MissionRun = { ...newRun(def.id, id), plan };
  for (const f of extra) {
    run = setFlag(def, run, f);
  }
  for (const step of def.steps) {
    for (const f of step.needs) {
      run = setFlag(def, run, f);
    }
  }
  return run;
};

test('missions: every one can be finished, and each has its own id', () => {
  assert.equal(new Set(MISSIONS.map((m) => m.id)).size, MISSIONS.length);
  for (const m of MISSIONS) {
    assert.ok(missionById(m.id) === m);
    const run = finish(m, 'r', null);
    assert.equal(run.step, m.steps.length, m.id);
    assert.ok(m.fiction.length > 20, `${m.id} says what is made up`);
  }
  assert.equal(RIVER_MISSION.steps.find((s) => s.id === 'collect')?.needs.length, CREEK_LITTER.length);
});

test('missions: NLEX missions involve no species and claim no animal', () => {
  for (const m of MISSIONS.filter((x) => x.kind === 'nlex')) {
    assert.equal(m.speciesIds.length, 0, m.id);
    assert.equal(m.storyIndividuals.length, 0, m.id);
    assert.equal(m.habitatObjectives.length, 0, m.id);
  }
});

test('the line: stops run south to north, two have no mission yet, and the order of opening holds', () => {
  assert.deepEqual(NLEX_STOPS.map((s) => s.id), ['balintawak', 'valenzuela', 'bocaue', 'san-fernando', 'angeles', 'dau']);
  assert.equal(NLEX_STOPS.filter((s) => s.missionId === null && s.id !== 'balintawak').length, 2);
  const fresh = defaultSave();
  assert.ok(missionOpen(fresh, GRIDLOCK_MISSION.id) && missionOpen(fresh, HORNBILL_MISSION.id));
  assert.ok(!missionOpen(fresh, RIVER_MISSION.id) && !missionOpen(fresh, ECO_MISSION.id));
});

test('save: a version 1 save loads, with nothing lost', () => {
  const v1 = { version: 1, revision: 9, createdAt: 'a', updatedAt: 'b', active: null, missions: { 'hornbill-homecoming': { completedAt: 'c', plays: 2, bestPlan: { fleetId: 'shared-van', routeId: 'greenway', departureId: 'mid' }, bestPlanKg: 17.49, baselineKg: 54.71, bestSavedKg: 37.22, calculationVersion: 'wildway-transport-1' } }, animalsAssisted: ['hornbill-male-1'], speciesAssisted: ['sp-009'], habitatsRestored: ['malaya-corridor'], guardianPoints: 125, upgrades: ['bunting'], clues: [], nicknames: { 'hornbill-male-1': 'Kalaw' }, badges: ['share'], coachSeen: [], processedRuns: ['x'], settings: {} };
  const { save, issues } = loadSave(JSON.stringify(v1));
  assert.equal(issues.length, 0);
  assert.equal(save.missions['hornbill-homecoming'].plays, 2);
  assert.equal(save.missions['hornbill-homecoming'].bestPlan?.fleetId, 'shared-van');
  assert.deepEqual(save.environmentObjectives, []);
  assert.equal(save.guardianPoints, 125);
  assert.equal(save.nicknames['hornbill-male-1'], 'Kalaw');
});

test('save: a mission left half-way under the old, longer steps starts afresh, and finished ones stay finished', () => {
  const active = { missionId: 'hornbill-homecoming', runId: 'old', step: 4, flags: ['reachedBank', 'birdScanned', 'rangerAsked', 'planChosen'], plan: { fleetId: 'shared-van', routeId: 'greenway', departureId: 'mid' } };
  const missions = { 'nlex-gridlock': { completedAt: 'c', plays: 1, bestPlan: null, bestChoice: 'cash,cash,cash,closed,tag,tag', bestParts: [], bestPlanKg: 14, baselineKg: 864, bestSavedKg: 850, calculationVersion: 'wildway-transport-1' } };
  const { save } = loadSave(JSON.stringify({ version: 3, active, missions }));
  assert.equal(save.active, null, 'not resumed in a muddle');
  assert.equal(save.missions['nlex-gridlock'].bestSavedKg, 850, 'the finished mission keeps its record');
  /* A run started now resumes exactly. */
  let run = setFlag(HORNBILL_MISSION, newRun(HORNBILL_MISSION.id, 'new'), 'birdScanned');
  run = setFlag(HORNBILL_MISSION, run, 'logCleared');
  const back = loadSave(JSON.stringify({ version: 3, active: run }));
  assert.deepEqual(back.save.active, run);
});

const outcome = (base: number, plan: number) => ({ baselineKg: base, planKg: plan, savings: savings(base, plan), choice: GOOD.join(','), parts: [{ id: 'plaza', label: 'Toll plaza', baselineKg: base, planKg: plan }] });

test('completion: an NLEX mission with no dispatch completes, records its objective, and claims no animal', () => {
  const { save, report } = completeMission(defaultSave(), GRIDLOCK_MISSION, finish(GRIDLOCK_MISSION, 'g1', null), outcome(800, 14));
  assert.equal(report.duplicate, false);
  assert.deepEqual(save.environmentObjectives, ['plaza-flow']);
  assert.deepEqual(save.animalsAssisted, []);
  assert.deepEqual(save.habitatsRestored, []);
  assert.equal(save.missions[GRIDLOCK_MISSION.id].bestChoice, GOOD.join(','));
  const back = loadSave(serializeSave(save));
  assert.deepEqual(back.save, save, 'and it survives a save and load');
});

test('completion: replaying NLEX missions inflates nothing, and the dashboard counts each best once', () => {
  let save: SaveData = completeMission(defaultSave(), GRIDLOCK_MISSION, finish(GRIDLOCK_MISSION, 'g1', null), outcome(800, 14)).save;
  save = completeMission(save, GRIDLOCK_MISSION, finish(GRIDLOCK_MISSION, 'g2', null), outcome(800, 16)).save;
  save = completeMission(save, GRIDLOCK_MISSION, finish(GRIDLOCK_MISSION, 'g2', null), outcome(800, 1)).save;
  assert.deepEqual(save.environmentObjectives, ['plaza-flow']);
  assert.equal(save.missions[GRIDLOCK_MISSION.id].plays, 2, 'the repeated run was not counted');
  const p = progress(save, []);
  assert.ok(Math.abs(p.savedKg - 786) < 1e-9, String(p.savedKg));
  assert.equal(p.nlexDone, 1);
  assert.equal(p.animals, 0);
});

test('completion: the delivery still needs its plan; the creek has none to need', () => {
  const r = completeMission(defaultSave(), DELIVERY_MISSION, finish(DELIVERY_MISSION, 'd1', null), outcome(20, 5));
  assert.equal(r.report.duplicate, true);
  const creek = completeMission(defaultSave(), RIVER_MISSION, finish(RIVER_MISSION, 'r1', null), { baselineKg: 0, planKg: 0, savings: savings(0, 0), choice: null, parts: [] });
  assert.equal(creek.report.duplicate, false);
  assert.deepEqual(creek.save.environmentObjectives, ['creek-clean']);
});

test('completion: a replay with nothing measured never wipes out a measured best', () => {
  const old = { ...defaultSave(), missions: { [RIVER_MISSION.id]: { completedAt: 'c', plays: 1, bestPlan: { fleetId: 'three-bin-truck', routeId: 'main', departureId: 'early' }, bestChoice: null, bestParts: [], bestPlanKg: 1.6, baselineKg: 20.3, bestSavedKg: 18.7, calculationVersion: 'wildway-transport-1' } } };
  const replay = completeMission(old, RIVER_MISSION, finish(RIVER_MISSION, 'r2', null), { baselineKg: 0, planKg: 0, savings: savings(0, 0), choice: null, parts: [] });
  assert.equal(replay.save.missions[RIVER_MISSION.id].bestSavedKg, 18.7);
  assert.equal(replay.save.missions[RIVER_MISSION.id].plays, 2);
  assert.equal(replay.report.newBest, false);
});
