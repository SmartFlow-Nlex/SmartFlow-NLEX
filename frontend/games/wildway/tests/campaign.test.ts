import { choiceOf, ECO_RUN_MISSIONS, ECO_RUNS, ecoOutcome, fuelRun, FUEL_SAVER, nightLighting } from '../core/ecoRuns';
import { MISSIONS, newRun, RIVER_MISSION, setFlag, type MissionDef, type MissionRun } from '../core/mission';
import { bonusFound, missionState, progress, stopCleared } from '../core/nlex';
import { DIALS, LOADS, solveLoad } from '../core/puzzles';
import { NLEX_EXITS, PLANNED_MISSIONS } from '../core/route';
import { completeMission, defaultSave, type SaveData } from '../core/save';
import { savings } from '../core/emissions';
import { assert, test } from './harness';

/* ---- The 18 stops ---- */

test('campaign: the 18 mainline stops, Balintawak to Dau, in the order of the exits guide', () => {
  assert.deepEqual(
    NLEX_EXITS.map((e) => e.name),
    ['Balintawak', 'Mindanao Avenue', 'Karuhatan', 'Valenzuela', 'Meycauayan', 'Marilao', 'Ciudad de Victoria', 'Bocaue', 'Tambubong', 'Balagtas', 'Tabang', 'Sta. Rita', 'Pulilan', 'San Simon', 'San Fernando', 'Mexico', 'Angeles', 'Dau'],
  );
  assert.equal(new Set(NLEX_EXITS.map((e) => e.id)).size, 18);
  for (const e of NLEX_EXITS) {
    assert.ok(!/sctex|harbor|connector|sta\. ines|santa ines/i.test(e.name), `${e.name} is not an NLEX mainline exit`);
  }
});

test('campaign: every mission on the map is built or honestly planned, and every NLEX mission is on the map at its own stop', () => {
  const onMap = NLEX_EXITS.flatMap((e) => e.missions.map((id) => ({ id, stop: e.id })));
  assert.equal(new Set(onMap.map((m) => m.id)).size, onMap.length, 'no mission is on the map twice');
  for (const { id, stop } of onMap) {
    const built = MISSIONS.find((m) => m.id === id);
    const planned = PLANNED_MISSIONS.find((m) => m.id === id);
    assert.ok((built !== undefined) !== (planned !== undefined), `${id} is either built or planned`);
    assert.equal(built?.locationId ?? planned?.locationId, stop, `${id} belongs to ${stop}`);
  }
  for (const m of MISSIONS.filter((x) => x.kind === 'nlex')) {
    assert.ok(onMap.some((x) => x.id === m.id), `${m.id} is on the map`);
  }
  /* The ones kept from before stay where they were. */
  for (const [id, stop] of [['nlex-gridlock', 'bocaue'], ['nlex-river', 'valenzuela'], ['nlex-eco', 'san-fernando'], ['nlex-delivery', 'balintawak']]) {
    assert.ok(NLEX_EXITS.find((e) => e.id === stop)?.missions.includes(id), `${id} stays at ${stop}`);
  }
  for (const p of PLANNED_MISSIONS) {
    assert.equal(p.tasks.length, 3, p.id);
  }
});

test('campaign: states are honest: planned missions are In development, the rest open after the Gridlock', () => {
  const fresh = defaultSave();
  assert.equal(missionState(fresh, 'nlex-gridlock'), 'open');
  assert.equal(missionState(fresh, 'green-route'), 'locked');
  assert.equal(missionState(fresh, 'wasteworks-finale'), 'dev');
  const after = done(fresh, 'nlex-gridlock');
  for (const m of ECO_RUN_MISSIONS) {
    assert.equal(missionState(after, m.id), 'open', m.id);
  }
  assert.equal(missionState(after, 'nlex-gridlock'), 'done');
  assert.equal(missionState(after, 'rfid-rescue'), 'dev');
  assert.ok(stopCleared(after, 'bocaue') && !stopCleared(after, 'dau'));
  const p = progress(after, []);
  assert.equal(p.stopsTotal, 18);
  assert.equal(p.stopsCleared, 1);
  assert.equal(p.playable, p.campaignMissions - PLANNED_MISSIONS.length);
});

/* ---- The Eco Runs ---- */

test('eco runs: each has a choice board, and its result follows the choice, not a fixed number', () => {
  for (const def of ECO_RUN_MISSIONS) {
    const run = ECO_RUNS[def.id];
    assert.ok(run !== undefined, def.id);
    const options = run.options();
    assert.ok(options.length >= 2, `${def.id}: a real choice`);
    const ok = options.filter((o) => o.co2Kg !== null);
    assert.ok(ok.length >= 2, `${def.id}: at least two choices can work`);
    for (const o of options) {
      assert.ok((o.co2Kg === null) === (o.refused !== null), `${def.id}/${o.id}: either a number or a reason`);
    }
    const results = ok.map((o) => run.outcome(o.id));
    for (const r of results) {
      assert.ok(r.baselineKg > 0, `${def.id}: a positive baseline`);
    }
    const saved = results.map((r) => r.baselineKg - r.planKg);
    assert.ok(Math.max(...saved) > 0.05, `${def.id}: a choice can do better than the usual way`);
    assert.ok(Math.min(...saved) <= 0.05, `${def.id}: not every choice is a saving`);
    /* The board shows the same number the result uses. */
    for (const o of ok) {
      assert.ok(Math.abs((o.co2Kg as number) - run.outcome(o.id).planKg) < 1e-9, `${def.id}/${o.id}: board and result agree`);
    }
  }
});

test('eco runs: the run that ends on its choice can be scored only once something was chosen', () => {
  for (const def of ECO_RUN_MISSIONS) {
    let run: MissionRun = newRun(def.id, 'r1');
    assert.equal(ecoOutcome(run), null, `${def.id}: nothing chosen, nothing to score`);
    const pick = ECO_RUNS[def.id].options().find((o) => o.co2Kg !== null)?.id as string;
    run = setFlag(def, run, `choice:${pick}`);
    assert.equal(choiceOf(run), pick);
    assert.ok(ecoOutcome(run) !== null, def.id);
  }
});

test('eco runs: a transport choice that breaks a rule is refused with its reason', () => {
  const route = ECO_RUNS['green-route'].options().find((o) => o.id === 'lanes');
  assert.ok(route?.refused?.includes('cannot take a vehicle as large'), route?.refused ?? 'none');
  const pickup = ECO_RUNS['smart-delivery'].options().find((o) => o.id === 'pickup');
  assert.ok(pickup?.refused?.includes('enclosed'), pickup?.refused ?? 'none');
  const van = ECO_RUNS['eco-cargo'].options().find((o) => o.id === 'van');
  assert.ok(van?.refused?.includes('kg'), van?.refused ?? 'none');
  const truck = ECO_RUNS['green-maintenance'].options().find((o) => o.id === 'truck');
  assert.ok(truck?.refused?.includes('seat'), truck?.refused ?? 'none');
});

test('eco runs: the shortest road is not automatically the greenest', () => {
  const opts = ECO_RUNS['green-route'].options();
  const avenue = opts.find((o) => o.id === 'avenue');
  const nlex = opts.find((o) => o.id === 'expressway');
  assert.ok((nlex?.co2Kg as number) < (avenue?.co2Kg as number), 'the longer, moving road wins over the short jammed one');
});

test('fuel saver: 0.2% per psi, as published; idling longer than usual comes out worse', () => {
  assert.equal(FUEL_SAVER.penaltyPerPsi, 0.002);
  /* On the road alone (no idling), 8 psi low burns exactly 1.6% more. */
  const low = fuelRun(false, 'engine-off');
  const fixed = fuelRun(true, 'engine-off');
  assert.ok(Math.abs(low.fuelL / fixed.fuelL - (1 + FUEL_SAVER.psiLow * 0.002)) < 1e-9, 'the tyre effect is applied as published');
  const off = ECO_RUNS['fuel-saver'].outcome('engine-off');
  const warm = ECO_RUNS['fuel-saver'].outcome('warm-up');
  assert.ok(off.baselineKg - off.planKg > 0.05);
  assert.ok(warm.planKg > warm.baselineKg, 'a long warm-up undoes the tyres and more');
});

test('night shift: safety lamps can never be switched off, and smarter settings use less', () => {
  assert.equal(nightLighting('off'), null);
  const refused = ECO_RUNS['night-shift'].options().find((o) => o.id === 'off');
  assert.ok(refused?.refused !== null);
  const kwh = (id: string): number => (nightLighting(id) as { kWh: number }).kWh;
  assert.ok(kwh('smart') < kwh('dusk') && kwh('dusk') < kwh('stuck'));
  const stuck = ECO_RUNS['night-shift'].outcome('stuck');
  assert.ok(Math.abs(stuck.baselineKg - stuck.planKg) < 1e-9, 'leaving them as found saves nothing');
});

test('eco runs: cleanup and wildlife are never credited with CO2; only trips and energy are', () => {
  assert.equal(RIVER_MISSION.transport, null);
  assert.equal(ECO_RUNS[RIVER_MISSION.id], undefined);
  const rain = ECO_RUNS['rainy-day'];
  assert.ok(rain.transport !== undefined, 'the rainy day counts only the crew’s trip');
  for (const def of ECO_RUN_MISSIONS) {
    assert.equal(def.speciesIds.length, 0, def.id);
    assert.equal(def.habitatObjectives.length, 0, def.id);
    assert.ok(/made-up/i.test(def.fiction), def.id);
  }
});

test('eco runs: a replay never counts twice, and a worse replay keeps the best', () => {
  const def = ECO_RUN_MISSIONS.find((m) => m.id === 'smart-delivery') as MissionDef;
  const r = ECO_RUNS[def.id];
  const play = (save: SaveData, runId: string, pick: string): SaveData => {
    let run: MissionRun = newRun(def.id, runId);
    run = { ...run, plan: r.transport?.plan(pick) ?? null };
    for (const f of [...def.steps.flatMap((s) => s.needs), `choice:${pick}`]) {
      run = setFlag(def, run, f);
    }
    const out = r.outcome(pick);
    return completeMission(save, def, run, { baselineKg: out.baselineKg, planKg: out.planKg, savings: savings(out.baselineKg, out.planKg), choice: pick }).save;
  };
  let save = done(defaultSave(), 'nlex-gridlock');
  save = play(save, 'a', 'one-van');
  const best = save.missions[def.id].bestSavedKg;
  assert.ok(best > 0);
  const total = progress(save, []).savedKg;
  save = play(save, 'b', 'two-vans');
  assert.equal(save.missions[def.id].bestSavedKg, best, 'the worse replay does not replace the best');
  assert.equal(progress(save, []).savedKg, total, 'and the total is unchanged');
  const again = completeMission(save, def, { ...newRun(def.id, 'b'), step: 3, plan: r.transport?.plan('one-van') ?? null }, { baselineKg: 1, planKg: 0, savings: savings(1, 0) });
  assert.ok(again.report.duplicate, 'the same run is counted once');
});

test('eco runs: bonus finds are optional, saved once, and counted per mission', () => {
  const def = ECO_RUN_MISSIONS[0];
  let run: MissionRun = newRun(def.id, 'bonus');
  run = setFlag(def, run, `clue:bonus-${def.id}-1`);
  assert.equal(run.step, 0, 'a bonus find moves no step');
  for (const f of def.steps.flatMap((s) => s.needs)) {
    run = setFlag(def, run, f);
  }
  run = { ...run, plan: ECO_RUNS[def.id].transport?.plan(ECO_RUNS[def.id].options()[1].id) ?? null };
  const out = ecoOutcome(setFlag(def, run, `choice:${ECO_RUNS[def.id].options()[1].id}`));
  const { save } = completeMission(done(defaultSave(), 'nlex-gridlock'), def, run, { baselineKg: out?.baselineKg ?? 0, planKg: out?.planKg ?? 0, savings: savings(out?.baselineKg ?? 0, out?.planKg ?? 0) });
  assert.equal(bonusFound(save, def.id), 1);
  assert.equal(bonusFound(save, 'eco-patrol'), 0);
});

test('puzzles: the cargo load can be packed, and the tyre dials name every setting', () => {
  assert.ok(solveLoad(LOADS.cargo) !== null);
  assert.equal(DIALS.tyres.faces?.length, DIALS.tyres.options);
  assert.ok(DIALS.tyres.target.every((t) => t > 0), 'every tyre starts low');
});

/** A save in which this mission is finished. */
function done(save: SaveData, id: string): SaveData {
  return { ...save, missions: { ...save.missions, [id]: { completedAt: 'x', plays: 1, bestPlan: null, bestChoice: null, bestParts: [], bestPlanKg: 1, baselineKg: 2, bestSavedKg: 1, calculationVersion: 'v' } } };
}
