import { currentStep, HORNBILL_MISSION as M, isFinished, newRun, restoreRun, setFlag, type MissionRun } from '../core/mission';
import { buyUpgrade, completeMission, defaultSave, loadSave, SAVE_VERSION, serializeSave, UPGRADES, type SaveData } from '../core/save';
import { comparePlan, HORNBILL_TRANSPORT, type Plan } from '../core/transport';
import { assert, test } from './harness';

const PLAN: Plan = { fleetId: 'shared-van', routeId: 'greenway', departureId: 'mid' };

const finishedRun = (id = 'run-1', plan: Plan = PLAN): MissionRun => {
  let run: MissionRun = { ...newRun(M.id, id), plan };
  for (const step of M.steps) {
    for (const flag of step.needs) {
      run = setFlag(M, run, flag);
    }
  }
  return run;
};

const complete = (save: SaveData, run: MissionRun) => {
  const c = comparePlan(HORNBILL_TRANSPORT, run.plan as Plan);
  return completeMission(save, M, run, { baselineKg: c.baseline.co2Kg, planKg: c.player.co2Kg, savings: c.savings });
};

test('mission: steps run in order, and a later flag cannot skip one', () => {
  let run = newRun(M.id, 'r');
  assert.equal(currentStep(M, run)?.id, 'call', 'it starts with the call to the Command Center');
  run = setFlag(M, run, 'callTaken');
  assert.equal(currentStep(M, run)?.id, 'walk');
  run = setFlag(M, run, 'rangerAsked');
  assert.equal(currentStep(M, run)?.id, 'walk', 'out of order: stays put');
  run = setFlag(M, run, 'reachedBank');
  assert.equal(currentStep(M, run)?.id, 'scan');
  run = setFlag(M, run, 'birdScanned');
  assert.equal(currentStep(M, run)?.id, 'plan', 'the earlier flag now counts');
});

test('mission: repeating a flag changes nothing', () => {
  const once = setFlag(M, newRun(M.id, 'r'), 'reachedBank');
  assert.deepEqual(setFlag(M, once, 'reachedBank'), once);
});

test('mission: every step can be finished, and finishes the mission', () => {
  const run = finishedRun();
  assert.ok(isFinished(M, run));
  assert.equal(currentStep(M, run), null);
});

test('mission: the specialist decides on care: the player has no step doing it', () => {
  const objectives = M.steps.map((s) => s.objective).join(' ');
  assert.ok(!/treat|heal|capture|catch/.test(objectives));
  assert.ok(M.steps.some((s) => s.id === 'assess'));
});

test('checkpoint: a saved run restores to the same place', () => {
  let run: MissionRun = { ...newRun(M.id, 'r'), plan: PLAN };
  for (const flag of ['callTaken', 'reachedBank', 'birdScanned', 'rangerAsked', 'planChosen', 'logCleared']) {
    run = setFlag(M, run, flag);
  }
  const restored = restoreRun(M, JSON.parse(JSON.stringify(run)));
  assert.deepEqual(restored, run);
});

test('checkpoint: a broken or foreign run is refused, not trusted', () => {
  assert.equal(restoreRun(M, null), null);
  assert.equal(restoreRun(M, { missionId: 'other', runId: 'x', flags: [] }), null);
  assert.equal(restoreRun(M, { missionId: M.id, runId: 'x', flags: 'no' }), null);
  assert.equal(restoreRun(M, { missionId: M.id, runId: 'x', flags: ['callTaken', 'reachedBank', 'birdScanned', 'rangerAsked', 'planChosen'], plan: null }), null, 'past planning with no plan');
});

test('save: round trip keeps everything', () => {
  const { save } = complete(defaultSave(), finishedRun());
  const back = loadSave(serializeSave(save));
  assert.equal(back.issues.length, 0);
  assert.deepEqual(back.save, save);
});

test('save: empty, corrupt and future saves do not throw, and report why', () => {
  assert.ok(loadSave(null).issues.length > 0);
  assert.ok(loadSave('{nope').issues.length > 0);
  assert.ok(loadSave(JSON.stringify({ version: SAVE_VERSION + 1 })).issues.length > 0);
  assert.equal(loadSave('{nope').save.guardianPoints, 0);
});

test('completion: animals, species, habitat and points are written together, once', () => {
  const { save, report } = complete(defaultSave(), finishedRun());
  assert.equal(report.duplicate, false);
  assert.equal(report.firstCompletion, true);
  assert.deepEqual(save.animalsAssisted, ['hornbill-male-1']);
  assert.deepEqual(save.speciesAssisted, ['sp-009']);
  assert.deepEqual(save.habitatsRestored, ['malaya-corridor']);
  assert.ok(save.guardianPoints > 0);
  assert.equal(save.active, null);
});

test('completion: sending the same run twice changes nothing', () => {
  const first = complete(defaultSave(), finishedRun());
  const second = complete(first.save, finishedRun());
  assert.equal(second.report.duplicate, true);
  assert.deepEqual(second.save, first.save);
});

test('completion: a replay does not inflate animals, species, habitat or points', () => {
  const first = complete(defaultSave(), finishedRun('a'));
  const replay = complete(first.save, finishedRun('b'));
  assert.equal(replay.report.duplicate, false);
  assert.equal(replay.report.firstCompletion, false);
  assert.deepEqual(replay.save.animalsAssisted, first.save.animalsAssisted);
  assert.deepEqual(replay.save.speciesAssisted, first.save.speciesAssisted);
  assert.deepEqual(replay.save.habitatsRestored, first.save.habitatsRestored);
  assert.equal(replay.save.guardianPoints, first.save.guardianPoints);
  assert.equal(replay.save.missions[M.id].plays, 2);
});

test('completion: a replay can only improve the best plan on record', () => {
  const first = complete(defaultSave(), finishedRun('a', { fleetId: 'shared-van', routeId: 'town', departureId: 'mid' }));
  const worse = complete(first.save, finishedRun('b', { fleetId: 'separate', routeId: 'greenway', departureId: 'mid' }));
  assert.equal(worse.save.missions[M.id].bestPlanKg, first.save.missions[M.id].bestPlanKg);
  const better = complete(worse.save, finishedRun('c', { fleetId: 'electric-van', routeId: 'town', departureId: 'mid' }));
  assert.ok(better.save.missions[M.id].bestPlanKg < first.save.missions[M.id].bestPlanKg);
});

test('completion: a plan worse than the usual way is recorded as worse, and earns no planning bonus', () => {
  const good = complete(defaultSave(), finishedRun('a'));
  const bad = complete(defaultSave(), finishedRun('b', { fleetId: 'solo', routeId: 'town', departureId: 'early' }));
  assert.ok(bad.save.missions[M.id].bestSavedKg < 0, 'negative savings stay negative');
  assert.equal(good.save.guardianPoints - bad.save.guardianPoints, M.rewards.plannedWell);
  assert.deepEqual(bad.save.animalsAssisted, good.save.animalsAssisted, 'the bird is not worth less for a poor route');
});

test('points: spending them changes no animal, habitat or emissions record', () => {
  const { save } = complete(defaultSave(), finishedRun());
  const bought = buyUpgrade(save, 'bunting') as SaveData;
  assert.equal(bought.guardianPoints, save.guardianPoints - (UPGRADES.find((u) => u.id === 'bunting')?.cost ?? 0));
  assert.deepEqual(bought.animalsAssisted, save.animalsAssisted);
  assert.deepEqual(bought.speciesAssisted, save.speciesAssisted);
  assert.deepEqual(bought.habitatsRestored, save.habitatsRestored);
  assert.deepEqual(bought.missions, save.missions);
  assert.equal(buyUpgrade(bought, 'bunting'), null, 'not twice');
  assert.equal(buyUpgrade(defaultSave(), 'bunting'), null, 'not without the points');
});
