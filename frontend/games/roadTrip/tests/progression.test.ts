import {
  buyUpgrade,
  canBuy,
  canEvolve,
  commitRun,
  computePayout,
  equipSidekick,
  evolveSidekick,
  heroFor,
  isUnlocked,
  recommendedMission,
  selectHero,
  workshopOpen,
} from '../core/progression';
import { EVOLVE_COST } from '../core/roster';
import { defaultSave } from '../core/save';
import type { RunResult, SaveData } from '../core/types';
import { assert, test } from './harness';

const run = (over: Partial<RunResult> = {}): RunResult => ({
  runId: 'run-1',
  missionId: 'm1-garage',
  seed: 7,
  difficulty: 'standard',
  outcome: 'success',
  hero: 'navie',
  sidekicks: ['pip', 'mila'],
  boltsCollected: 12,
  foesDefeated: 0,
  goalsDone: 0,
  distance: 0,
  dents: 1,
  maxDents: 3,
  shieldBlocks: 0,
  repairsUsed: 0,
  kikoEngineLeft: null,
  kikoEngineMax: null,
  teamHonk: false,
  postcardFound: false,
  durationS: 70,
  ...over,
});

test('reward: first completion pays the full reward, replays the smaller one', () => {
  const first = commitRun(defaultSave(), run());
  // 12 bolts + 60 first clear + 10 clean (1 dent)
  assert.equal(first.payout.total, 82);
  assert.ok(first.payout.firstClear);
  const replay = commitRun(first.save, run({ runId: 'run-2' }));
  // 12 + 20 replay + 10
  assert.equal(replay.payout.total, 42);
  assert.ok(!replay.payout.firstClear);
  assert.equal(replay.save.bolts, 124);
});

test('reward: committing the same run twice pays once (retry, reload, double request)', () => {
  const once = commitRun(defaultSave(), run());
  const twice = commitRun(once.save, run());
  assert.ok(twice.duplicate);
  assert.equal(twice.save.bolts, once.save.bolts);
  assert.equal(twice.save.revision, once.save.revision, 'nothing written for a duplicate');
  assert.equal(twice.save.missions['m1-garage']?.clears, 1);
});

test('reward: run ids survive a save round trip, so a reload cannot re-pay', () => {
  const once = commitRun(defaultSave(), run());
  const reloaded = JSON.parse(JSON.stringify(once.save)) as SaveData;
  assert.ok(commitRun(reloaded, run()).duplicate);
});

test('reward: a failed run pays half its Bolts and unlocks nothing', () => {
  const out = commitRun(defaultSave(), run({ outcome: 'failure', boltsCollected: 9 }));
  assert.equal(out.payout.total, 4);
  assert.ok(!isUnlocked(out.save, 'm2-convoy'));
  assert.deepEqual(out.save.heroes, ['navie']);
});

test('reward: an abandoned run pays nothing', () => {
  assert.equal(computePayout(defaultSave(), run({ outcome: 'abandoned' })).total, 0);
});

test('reward: a postcard pays only the first time it is found', () => {
  const first = commitRun(defaultSave(), run({ postcardFound: true }));
  assert.ok(first.payout.lines.some((l) => l.label === 'Postcard found' && l.amount === 15));
  const again = commitRun(first.save, run({ runId: 'r2', postcardFound: true }));
  assert.ok(again.payout.lines.some((l) => l.label === 'Postcard' && l.amount === 0));
});

test('reward: teamwork bonuses are explained and capped at 25', () => {
  const payout = computePayout(
    defaultSave(),
    run({ missionId: 'm2-convoy', shieldBlocks: 2, repairsUsed: 1, kikoEngineLeft: 3, kikoEngineMax: 3, teamHonk: true }),
  );
  const teamwork = payout.lines.filter((l) => ["Kuya's Shield", 'Spare Parts', 'Kept Kiko safe', 'Team Honk', 'Road goals'].includes(l.label));
  assert.equal(teamwork.reduce((s, l) => s + l.amount, 0), 25);
  assert.ok(teamwork.every((l) => l.note.length > 0));
});

test('progress: missions unlock in order and recruit friends into empty slots', () => {
  let save = defaultSave();
  assert.ok(isUnlocked(save, 'm1-garage'));
  assert.ok(!isUnlocked(save, 'm2-convoy'));
  assert.equal(recommendedMission(save), 'm1-garage');
  save = commitRun(save, run()).save;
  assert.deepEqual(save.heroes, ['navie', 'jepoy'], 'Jepoy becomes a playable hero');
  assert.ok(save.sidekicks.bantay !== undefined, 'Bantay joins');
  assert.ok(isUnlocked(save, 'm2-convoy'));
  assert.ok(isUnlocked(save, 'snapshot'));
  assert.ok(isUnlocked(save, 'endless'));
  assert.ok(save.tutorialDone);
  save = commitRun(save, run({ runId: 'r2', missionId: 'm2-convoy', kikoEngineLeft: 3, kikoEngineMax: 3 })).save;
  assert.ok(workshopOpen(save));
  assert.ok(save.heroes.includes('kiko') && save.sidekicks.kumpuni !== undefined);
  assert.equal(recommendedMission(save), 'm3-finale');
  save = commitRun(save, run({ runId: 'r3', missionId: 'm3-finale', teamHonk: true })).save;
  assert.ok(save.sidekicks.bumbo !== undefined);
  assert.equal(save.gearCores, 1 + 2 + 3, 'Gear Cores for the three first clears');
  assert.equal(recommendedMission(save), 'bocaue-interchange', 'the road carries on north');
});

test('loadout: only owned heroes and sidekicks; one sidekick never fills both slots; story blocks are respected', () => {
  let save = defaultSave();
  assert.equal(selectHero(save, 'jepoy'), save, 'Jepoy is not unlocked yet');
  assert.equal(equipSidekick(save, 0, 'bumbo'), save, 'Bumbo is not in the collection yet');
  save = equipSidekick(save, 1, 'pip');
  assert.deepEqual(save.loadout.sidekicks, ['mila', 'pip'], 'swapped, not duplicated');
  save = commitRun(save, run({ runId: 'a' })).save;
  save = commitRun(save, run({ runId: 'b', missionId: 'm2-convoy' })).save;
  save = selectHero(save, 'kiko');
  assert.equal(save.loadout.hero, 'kiko');
  assert.equal(heroFor(save, 'm2-convoy'), 'navie', 'Kiko cannot drive the convoy that escorts him');
  assert.equal(heroFor(save, 'm3-finale'), 'kiko');
});

test('evolution: earned XP and Gear Cores, predictable cost, once only; XP is paid once per run', () => {
  let save = { ...defaultSave(), bolts: 500, gearCores: 0 };
  assert.ok(!canEvolve(save, 'pip').ok);
  const runs = Math.ceil(EVOLVE_COST.xp / 40);
  for (let i = 0; i < runs; i += 1) {
    save = commitRun(save, run({ runId: `x${i}`, missionId: 'snapshot' })).save;
  }
  const again = commitRun(save, run({ runId: 'x0', missionId: 'snapshot' }));
  assert.ok(again.duplicate, 'XP for a run is never paid twice');
  assert.atLeast(save.sidekicks.pip!.xp, EVOLVE_COST.xp);
  assert.equal(save.sidekicks.bantay, undefined, 'unequipped sidekicks do not earn');
  save = { ...save, gearCores: EVOLVE_COST.cores };
  const check = canEvolve(save, 'pip');
  assert.ok(check.ok, check.missing ?? '');
  const out = evolveSidekick(save, 'pip');
  assert.ok(out.evolved);
  assert.ok(out.save.sidekicks.pip!.evolved);
  assert.equal(out.save.gearCores, 0);
  assert.equal(out.save.bolts, save.bolts - EVOLVE_COST.bolts);
  assert.ok(!evolveSidekick(out.save, 'pip').evolved, 'only once');
});

test('endless: pays distance (capped) and first-time milestone Cores; keeps a local best', () => {
  let save = commitRun(defaultSave(), run()).save;
  const first = commitRun(save, run({ runId: 'e1', missionId: 'endless', outcome: 'failure', distance: 2100, foesDefeated: 12, boltsCollected: 30 }));
  assert.equal(first.payout.cores, 2, 'milestones 1000 and 2000');
  assert.ok(first.payout.newBest);
  save = first.save;
  assert.ok(save.sidekicks.silip !== undefined, 'Silip joins at 1000 m');
  assert.equal(save.endless.bestDistance, 2100);
  const second = commitRun(save, run({ runId: 'e2', missionId: 'endless', outcome: 'failure', distance: 2500, boltsCollected: 0 }));
  assert.equal(second.payout.cores, 0, 'milestones pay once');
  assert.atMost(second.payout.total, 80, 'distance pay is capped');
  assert.equal(second.save.missions.endless, undefined, 'endless is not a journey mission record');
});

test('upgrades: bounded levels, clear costs, locked until the workshop opens', () => {
  let save = defaultSave();
  save = { ...save, bolts: 1000 };
  assert.equal(canBuy(save, 'bumper').ok, false, 'workshop not open');
  save = { ...save, heroes: ['navie', 'jepoy', 'kiko'] };
  const a = buyUpgrade(save, 'bumper');
  assert.ok(a.bought);
  assert.equal(a.save.bolts, 920);
  const b = buyUpgrade(a.save, 'bumper');
  assert.equal(b.save.bolts, 780);
  const c = buyUpgrade(b.save, 'bumper');
  assert.ok(!c.bought, 'max level 2');
  const check = canBuy(c.save, 'bumper');
  assert.ok(!check.ok && check.reason === 'maxed');
  const poor = canBuy({ ...save, bolts: 10 }, 'steering');
  assert.ok(!poor.ok && poor.reason === 'cost');
});
