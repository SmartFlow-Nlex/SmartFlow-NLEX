import { playShift, SKILLS } from '../core/bot';
import { DAYS } from '../core/days';
import { carKmFor } from '../core/factors';
import { bumpRevision, currentStreak, defaultSave, isUnlocked, loadSave, manilaDateKey, recordShift, SAVE_VERSION, serializeSave } from '../core/save';
import { budgetGone, outcome, perkOffers, pickPerk, starsFor, startShift, startSim, type ShiftOutcome } from '../core/shift';
import { step, STEP_S } from '../core/sim';
import { assert, test } from './harness';

const finished = (over: Partial<ShiftOutcome> = {}): ShiftOutcome => ({
  finished: true,
  used: 40,
  unmanaged: 100,
  saved: 60,
  share: 0.6,
  stars: 2,
  byClass: [20, 10, 10],
  arrivedByClass: [50, 10, 5],
  carKm: carKmFor(60),
  smogLeft: null,
  moves: 10,
  reliefs: 2,
  longestQueue: 6,
  unmanagedLongestQueue: 20,
  emergencies: 2,
  handled: 2,
  ...over,
});

const smog = (): ShiftOutcome => finished({ finished: false, stars: 0, saved: 5, smogLeft: 30 });
const daily = { ...DAYS[0], id: 'daily-2026-11-04' };

test('save: a save from before the redesign keeps its progress', () => {
  /* What the first version of the game wrote: same key, same shape, older tips. */
  const old = JSON.stringify({
    version: 1,
    revision: 7,
    createdAt: '2026-11-04T01:00:00.000Z',
    updatedAt: '2026-11-04T02:00:00.000Z',
    shifts: { meycauayan: { stars: 3, bestSaved: 29.2, bestUsed: 13.7, plays: 2 }, marilao: { stars: 1, bestSaved: 80, bestUsed: 90, plays: 1 } },
    daily: { lastDate: '2026-11-04', streak: 2, bestStreak: 3, stars: 2, saved: 44 },
    totalSaved: 153,
    shiftsFinished: 4,
    coachSeen: ['budget', 'drag', 'open', 'tag'],
    processedRuns: ['run-a'],
    settings: { sound: false, gameSpeed: 0.85, reduceMotion: false, textScale: 1.2 },
  });
  const { save, issues } = loadSave(old);
  assert.equal(issues.length, 0);
  assert.equal(save.revision, 7);
  assert.equal(save.shifts.meycauayan.stars, 3);
  assert.equal(save.totalSaved, 153);
  assert.equal(save.daily.streak, 2);
  assert.equal(save.settings.sound, false);
  assert.ok(isUnlocked(save, DAYS, 2), 'Bocaue stays open');
  assert.ok(!isUnlocked(save, DAYS, 3));
});

test('save: a save survives being written and read', () => {
  const save = recordShift(defaultSave(), 'run-1', DAYS[0], finished());
  const { save: read, issues } = loadSave(serializeSave(bumpRevision(save)));
  assert.equal(issues.length, 0);
  assert.equal(read.revision, 1);
  assert.equal(read.shifts[DAYS[0].id].stars, 2);
  assert.equal(read.totalSaved, 60);
});

test('save: broken saves start fresh and say why', () => {
  assert.deepEqual(loadSave(null).issues, ['empty']);
  assert.deepEqual(loadSave('{oops').issues, ['not-json']);
  assert.deepEqual(loadSave('[1,2]').issues, ['not-object']);
  assert.deepEqual(loadSave(JSON.stringify({ version: SAVE_VERSION + 1 })).issues, ['newer-version']);
});

test('save: odd values are brought back into range', () => {
  const { save } = loadSave(
    JSON.stringify({
      version: 1,
      revision: 3,
      totalSaved: -50,
      shifts: { a: { stars: 9, bestSaved: 'x', plays: 2 }, b: 'nope' },
      daily: { streak: -2, lastDate: 7 },
      coachSeen: ['drag', 4],
      settings: { gameSpeed: 3, textScale: 2, sound: 'yes', reduceMotion: true },
    }),
  );
  assert.equal(save.totalSaved, 0);
  assert.equal(save.shifts.a.stars, 3);
  assert.equal(save.shifts.a.bestSaved, 0);
  assert.equal(save.shifts.b, undefined);
  assert.equal(save.daily.streak, 0);
  assert.equal(save.daily.lastDate, null);
  assert.deepEqual(save.coachSeen, ['drag']);
  assert.deepEqual(save.settings, { sound: true, gameSpeed: 1, reduceMotion: true, textScale: 1 });
});

test('save: a repeated message counts a shift only once', () => {
  const once = recordShift(defaultSave(), 'run-1', DAYS[0], finished());
  const twice = recordShift(once, 'run-1', DAYS[0], finished());
  assert.equal(twice.totalSaved, 60);
  assert.equal(twice.shifts[DAYS[0].id].plays, 1);
});

test('save: the best stays the best, and smog saves nothing', () => {
  let save = recordShift(defaultSave(), 'a', DAYS[0], finished({ stars: 3, saved: 80, used: 20 }));
  save = recordShift(save, 'b', DAYS[0], finished({ stars: 1, saved: 30, used: 70 }));
  const best = save.shifts[DAYS[0].id];
  assert.equal(best.stars, 3);
  assert.equal(best.bestSaved, 80);
  assert.equal(best.bestUsed, 20);
  assert.equal(best.plays, 2);
  assert.equal(save.totalSaved, 110);
  const after = recordShift(save, 'c', DAYS[0], smog());
  assert.equal(after.totalSaved, 110);
  assert.equal(after.shifts[DAYS[0].id].plays, 3);
  assert.equal(after.shifts[DAYS[0].id].bestSaved, 80);
});

test('save: shifts open in order, and only a finished shift opens the next', () => {
  let save = defaultSave();
  assert.ok(isUnlocked(save, DAYS, 0));
  assert.ok(!isUnlocked(save, DAYS, 1));
  save = recordShift(save, 'a', DAYS[0], smog());
  assert.ok(!isUnlocked(save, DAYS, 1), 'smog does not open the next');
  save = recordShift(save, 'b', DAYS[0], finished());
  assert.ok(isUnlocked(save, DAYS, 1));
  assert.ok(!isUnlocked(save, DAYS, 2));
});

test('save: a daily streak counts days in a row and breaks on a gap', () => {
  let save = recordShift(defaultSave(), 'a', daily, finished(), '2026-11-04');
  assert.equal(save.daily.streak, 1);
  save = recordShift(save, 'b', daily, finished({ stars: 3, saved: 90 }), '2026-11-04');
  assert.equal(save.daily.streak, 1, 'a replay the same day does not add');
  assert.equal(save.daily.stars, 3);
  save = recordShift(save, 'c', daily, finished(), '2026-11-05');
  assert.equal(save.daily.streak, 2);
  assert.equal(currentStreak(save.daily, '2026-11-06'), 2, 'still alive the next day');
  assert.equal(currentStreak(save.daily, '2026-11-07'), 0, 'a missed day ends it');
  save = recordShift(save, 'd', daily, finished(), '2026-11-08');
  assert.equal(save.daily.streak, 1);
  assert.equal(save.daily.bestStreak, 2);
  const failed = recordShift(save, 'e', daily, smog(), '2026-11-09');
  assert.equal(failed.daily.streak, 1, 'smog does not extend it');
  assert.equal(failed.daily.lastDate, '2026-11-08');
});

test('save: the daily date is Manila time, as Rush Hour counts it', () => {
  // 16:30 UTC is 00:30 the next day in Manila.
  assert.equal(manilaDateKey(Date.UTC(2026, 10, 4, 16, 30)), '2026-11-05');
  assert.equal(manilaDateKey(Date.UTC(2026, 10, 4, 15, 30)), '2026-11-04');
});

test('shift: stars follow the targets', () => {
  const def = { ...DAYS[0], need: [0.2, 0.4, 0.6] as const };
  assert.equal(starsFor(def, 0.1), 0);
  assert.equal(starsFor(def, 0.2), 1);
  assert.equal(starsFor(def, 0.5), 2);
  assert.equal(starsFor(def, 0.6), 3);
});

test('shift: finishing within budget always earns a star, and the results are real', () => {
  for (const def of DAYS) {
    const r = playShift(def, SKILLS.casual);
    if (r.finished) {
      assert.atLeast(r.stars, 1, def.id);
      assert.ok(r.used < r.unmanaged, def.id);
      assert.equal(r.saved.toFixed(4), (r.unmanaged - r.used).toFixed(4), `${def.id} avoided is the difference`);
      assert.equal((r.byClass[0] + r.byClass[1] + r.byClass[2]).toFixed(4), r.used.toFixed(4), `${def.id} classes add up`);
      assert.atLeast(r.longestQueue, 1, def.id);
      assert.atMost(r.handled, r.emergencies + 0, `${def.id} handled`);
    }
  }
});

test('shift: a smog ending compares like for like and earns nothing', () => {
  const run = startShift(DAYS[2]);
  const sim = startSim(run, false);
  for (let i = 0; i < 60 * 20; i += 1) {
    step(sim, STEP_S);
  }
  const r = outcome(run, sim, true);
  assert.ok(!r.finished);
  assert.equal(r.stars, 0);
  assert.ok(r.unmanaged < run.unmanaged.total, 'compared at the same moment, not with the whole shift');
  assert.equal(r.smogLeft, Math.ceil(sim.duration - 20));
});

test('shift: the budget ends the shift only when reached', () => {
  const run = startShift(DAYS[0]);
  const sim = startSim(run, false);
  assert.ok(!budgetGone(run, sim));
  sim.co2 = run.budget;
  assert.ok(budgetGone(run, sim));
});

test('shift: changes offered are never repeated, and stay the same for a shift', () => {
  const run = startShift(DAYS[2]);
  const sim = startSim(run, false);
  const first = perkOffers(run, sim, 0);
  assert.equal(first.length, 2);
  assert.equal(new Set(first).size, 2);
  assert.deepEqual(perkOffers(run, sim, 0), first);
  pickPerk(sim, first[0]);
  const second = perkOffers(run, sim, 2);
  assert.ok(!second.includes(first[0]), 'already taken');
});
