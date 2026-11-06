import { buyUpgrade, canBuy, commitRun, type CommitOutcome } from '../core/progression';
import { HERO_DEFS, SIDEKICK_DEFS } from '../core/roster';
import { UNLOCK_LEVELS } from '../core/unlockLevels';
import { defaultSave, loadSave, serializeSave } from '../core/save';
import { MISSIONS } from '../core/missions';
import { STARTER_LOADOUT, playMission } from './play';
import { UPGRADES, HEROES, JOURNEY, SIDEKICKS, emptyTally, type RunResult, type SaveData } from '../core/types';
import { assert, test } from './harness';
import { createBot } from '../core/bot';
import type { DrivingSim, SimInput } from '../core/sim';

/**
 * The whole road, as a player would drive it: every level in order, on the autopilot, each
 * run paid through the real commit and tried again after a failure, as a player would.
 * What this checks is that the hundred levels can be driven, and bring everyone.
 */
function driveTheRoad(): { save: SaveData; runs: number; retries: number } {
  let save: SaveData = defaultSave();
  let runs = 0;
  let retries = 0;
  for (const id of JOURNEY) {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const out = playMission(id, { difficulty: 'standard', seed: 100 + runs, loadout: { ...STARTER_LOADOUT, hero: save.loadout.hero }, skipTutorial: true, bot: { useAbility: true } });
      const outcome = out.sim.state.outcome === 'success' ? 'success' : 'failure';
      const committed: CommitOutcome = commitRun(save, out.sim.result(`run-${runs}`, outcome));
      save = committed.save;
      runs += 1;
      // Spend on the Workshop as a player might.
      for (const up of UPGRADES) {
        if (canBuy(save, up).ok) {
          save = buyUpgrade(save, up).save;
        }
      }
      if (outcome === 'success') {
        break;
      }
      retries += 1;
    }
  }
  return { save, runs, retries };
}

test('economy: the autopilot drives all hundred levels, and the road brings the whole roster', () => {
  const { save, runs, retries } = driveTheRoad();
  assert.ok(JOURNEY.every((id) => save.missions[id]?.completed === true), `every level cleared (${runs} runs, ${retries} retries)`);
  assert.atMost(retries, 10, 'hardly ever needs a second go');
  assert.deepEqual([...save.heroes].sort(), [...HEROES].sort(), 'every hero');
  assert.equal(Object.keys(save.sidekicks).length, SIDEKICKS.length, 'every sidekick');
  const t = save.tally;
  for (const key of ['cleanStretches', 'chains', 'goals', 'checkpoints', 'hazardsAvoided', 'coins', 'bots', 'basePulseHits', 'upgradesChosen'] as const) {
    assert.ok(t[key] > 0, `${key} moved (${t[key]})`);
  }
  assert.ok(save.lifetimeBolts > 3000, `real Bolts along the way (${save.lifetimeBolts})`);
  // Nothing earned is lost across a save round trip.
  const again = loadSave(serializeSave(save)).save;
  assert.equal(again.heroes.length, save.heroes.length);
  assert.equal(Object.keys(again.sidekicks).length, Object.keys(save.sidekicks).length);
});

test('economy: a failed run still counts what was done, an abandoned one counts nothing', () => {
  const tally = emptyTally();
  tally.coins = 10;
  const base: RunResult = { runId: 'x', missionId: 'tambubong', seed: 1, difficulty: 'standard', outcome: 'failure', hero: 'navie', sidekicks: ['pip', 'mila'], tally, boltsCollected: 10, foesDefeated: 0, goalsDone: 0, distance: 0, dents: 3, maxDents: 3, shieldBlocks: 0, repairsUsed: 0, kikoEngineLeft: null, kikoEngineMax: null, teamHonk: false, postcardFound: false, durationS: 30 };
  assert.equal(commitRun(defaultSave(), base).save.tally.coins, 10);
  assert.equal(commitRun(defaultSave(), { ...base, runId: 'y', outcome: 'abandoned' }).save.tally.coins, 0);
});

test('economy: new characters arrive steadily along the road, never in a burst', () => {
  const levels = Object.entries(UNLOCK_LEVELS).filter(([, level]) => level !== null).map(([, level]) => level as number);
  assert.equal(levels.length, HEROES.length + SIDEKICKS.length - 3, 'everyone but Navie, Pip and Mila joins at a level');
  assert.ok(levels.every((l) => l >= 1 && l <= JOURNEY.length), 'all on the road');
  const perLevel = new Map<number, number>();
  for (const l of levels) {
    perLevel.set(l, (perLevel.get(l) ?? 0) + 1);
  }
  assert.atMost(Math.max(...perLevel.values()), 2, 'never more than two at once');
  const sorted = [...new Set(levels)].sort((a, b) => a - b);
  assert.atMost(sorted[0], 3, 'someone new within the first few levels');
  for (let i = 1; i < sorted.length; i += 1) {
    assert.atMost(sorted[i] - sorted[i - 1], 5, `never a long wait: ${sorted[i - 1]} to ${sorted[i]}`);
  }
  // A new hero turns up regularly too, not all at the end.
  const heroLevels = HEROES.map((id) => HERO_DEFS[id].unlock.level).filter((l): l is number => l !== null).sort((a, b) => a - b);
  for (let i = 1; i < heroLevels.length; i += 1) {
    assert.atMost(heroLevels[i] - heroLevels[i - 1], 14, `heroes ${heroLevels[i - 1]} to ${heroLevels[i]}`);
  }
  assert.ok(SIDEKICKS.every((id) => SIDEKICK_DEFS[id].unlock.level === null || SIDEKICK_DEFS[id].unlock.level! <= JOURNEY.length));
});
