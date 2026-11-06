import { calibratedDaily, playShift, SKILLS } from '../core/bot';
import { DAYS, dailyDay, type DayDef } from '../core/days';
import { computeUnmanaged, startShift, unmanagedAt } from '../core/shift';
import { PERKS } from '../core/perks';
import { createSim, totalDuration } from '../core/sim';
import { assert, test } from './harness';

/**
 * Holds every shift to what bots playing at a human pace can do. When traffic or
 * targets change, `node scripts/test-clean-air-shift.js --table` shows the numbers.
 */

const DATES = Array.from({ length: 21 }, (_, i) => new Date(Date.UTC(2026, 10, 1 + i * 3)).toISOString().slice(0, 10));

const share = (def: DayDef, name: keyof typeof SKILLS): number => {
  const r = playShift(def, SKILLS[name]);
  return 1 - r.used / r.unmanaged;
};

test('balance: the six plazas are all still here, in order, ending at Dau', () => {
  assert.deepEqual(DAYS.map((d) => d.plaza), ['Meycauayan', 'Marilao', 'Bocaue Barrier', 'Balintawak', 'San Fernando', 'Dau']);
  assert.ok(DAYS[5].finale === true);
});

test('balance: star targets rise on every shift', () => {
  for (const def of DAYS) {
    assert.ok(def.need[0] > 0 && def.need[0] < def.need[1] && def.need[1] < def.need[2] && def.need[2] < 1, def.id);
  }
});

test('balance: a shift is about 90 seconds, in several waves', () => {
  for (const def of [...DAYS, dailyDay('2026-11-04')]) {
    const seconds = totalDuration(def);
    assert.atLeast(seconds, 60, def.id);
    assert.atMost(seconds, 105, def.id);
    assert.atLeast(def.waves.length, 4, def.id);
    for (const wave of def.waves) {
      assert.equal(wave.habit.length, def.lanes, `${def.id} ${wave.id} habit`);
      assert.atMost(wave.duration, 30, `${def.id} ${wave.id} is a short wave`);
    }
  }
});

test('balance: mechanics arrive one plaza at a time', () => {
  const [one, two, three, four, five, six] = DAYS;
  const kinds = (def: DayDef): string[] => def.waves.flatMap((w) => w.events.map((e) => e.kind));
  assert.ok(!one.redirect, 'no redirecting at the first plaza');
  assert.equal(one.engines, 0);
  assert.equal(one.laneTypes, undefined, 'no lane types at the first plaza');
  assert.deepEqual(kinds(one), ['closure']);
  assert.ok(two.redirect && two.laneTypes !== undefined, 'redirecting and lane types arrive together');
  assert.equal(two.engines, 0);
  assert.ok(!kinds(two).includes('reader') && !kinds(two).includes('breakdown'));
  assert.ok(three.engines > 0 && kinds(three).includes('surge') && kinds(three).includes('convoy'));
  assert.ok(!kinds(three).includes('reader'));
  assert.ok(kinds(four).includes('reader') && kinds(four).includes('breakdown'));
  assert.ok(five.staff < four.staff && five.staff / five.lanes <= 0.6, 'short of staff');
  assert.ok(kinds(six).filter((k) => k === 'surge').length >= 2 && kinds(six).includes('convoy') && kinds(six).includes('reader') && kinds(six).includes('closure'));
  assert.ok(six.waves.length > 4);
});

test('balance: doing nothing ends in smog on every shift', () => {
  for (const def of DAYS) {
    const result = playShift(def, null);
    assert.ok(!result.finished, `${def.id} should end in smog`);
    assert.equal(result.stars, 0, def.id);
  }
});

test('balance: a slow beginner still finishes every shift', () => {
  for (const def of DAYS) {
    const r = playShift(def, SKILLS.novice);
    assert.ok(r.finished, `${def.id} novice ran out of budget, used ${r.used.toFixed(0)} of ${r.unmanaged.toFixed(0)}`);
    assert.equal(r.stars, 1, `${def.id} a beginner gets one star`);
  }
});

test('balance: a casual player earns two stars, not three', () => {
  for (const def of DAYS) {
    const r = playShift(def, SKILLS.casual);
    assert.ok(r.finished, def.id);
    assert.equal(r.stars, 2, def.id);
  }
});

test('balance: good play reaches three stars on every shift', () => {
  for (const def of DAYS) {
    assert.equal(playShift(def, SKILLS.good).stars, 3, def.id);
  }
});

test('balance: more skill burns less', () => {
  for (const def of DAYS) {
    const novice = share(def, 'novice');
    const casual = share(def, 'casual');
    const good = share(def, 'good');
    const expert = share(def, 'expert');
    const text = `${def.id}: ${novice.toFixed(2)} ${casual.toFixed(2)} ${good.toFixed(2)} ${expert.toFixed(2)}`;
    assert.ok(novice < good && casual < good && expert > good - 0.05, text);
  }
});

test('balance: playing is busy, not watching', () => {
  for (const def of DAYS) {
    if (def.redirect) {
      const r = playShift(def, SKILLS.good);
      assert.atLeast(r.moves / totalDuration(def), 0.3, `${def.id}: a good player redirects ${r.moves} vehicles`);
    }
  }
});

test('balance: the player and no manager face exactly the same vehicles, whatever is picked', () => {
  for (const def of DAYS) {
    const nobody = playShift(def, null);
    void nobody;
    const base = startShift(def);
    const a = createSim(def, { seed: def.seed });
    const b = createSim(def, { seed: def.seed, perks: PERKS.map((p) => p.id) });
    assert.equal(JSON.stringify(a.schedule), JSON.stringify(b.schedule), def.id);
    assert.ok(base.unmanaged.total > 0, def.id);
    const played = playShift(def, SKILLS.good);
    assert.equal(played.arrivedByClass[0] + played.arrivedByClass[1] + played.arrivedByClass[2], a.schedule.length, `${def.id} every vehicle came`);
  }
});

test('balance: every plaza has an emergency or a booth problem to solve', () => {
  for (const def of DAYS) {
    assert.atLeast(def.waves.flatMap((w) => w.events).length, 1, def.id);
  }
});

test('balance: no change picked along the way ruins a shift', () => {
  for (const def of DAYS) {
    if (def.perksAfter.length > 0) {
      for (const index of [0, 1]) {
        const r = playShift(def, SKILLS.good, (offers) => offers[Math.min(index, offers.length - 1)]);
        assert.atLeast(r.stars, 2, `${def.id} pick ${index}`);
      }
      const none = playShift(def, SKILLS.good, () => null);
      assert.atLeast(none.stars, 2, `${def.id} picking nothing`);
    }
  }
});

test('balance: a good player keeps lines on a phone screen, nobody at the controls does not', () => {
  for (const def of DAYS) {
    const good = playShift(def, SKILLS.good);
    assert.atMost(good.longestQueue, 15, `${def.id} good`);
    assert.ok(good.unmanagedLongestQueue > good.longestQueue, `${def.id} nobody should do worse`);
  }
});

test("balance: today's shift is fair on any date", () => {
  for (const date of DATES) {
    const def = calibratedDaily(date);
    const name = `${date} ${def.need.join('/')}`;
    assert.ok(def.need[0] > 0.05 && def.need[0] < def.need[1] && def.need[1] < def.need[2] && def.need[2] < 0.95, name);
    assert.ok(playShift(def, SKILLS.casual).finished, `${name} casual`);
    assert.equal(playShift(def, SKILLS.good).stars, 3, name);
    assert.ok(computeUnmanaged(def).total > 1, name);
    assert.ok(!playShift(def, null).finished, `${name} doing nothing should fail`);
  }
});

test("balance: today's shift is the same for everyone on a date, and changes the next day", () => {
  assert.equal(JSON.stringify(dailyDay('2026-11-04')), JSON.stringify(dailyDay('2026-11-04')));
  assert.equal(JSON.stringify(calibratedDaily('2026-11-04')), JSON.stringify(calibratedDaily('2026-11-04')));
  assert.ok(JSON.stringify(dailyDay('2026-11-04')) !== JSON.stringify(dailyDay('2026-11-05')));
});

test('the comparison with no manager only ever rises and ends at its total', () => {
  const run = startShift(DAYS[2]);
  let last = -1;
  for (let t = 0; t < 300; t += 2.5) {
    const value = unmanagedAt(run, t);
    assert.ok(value >= last, 'rising');
    last = value;
  }
  assert.equal(unmanagedAt(run, 9999).toFixed(4), run.unmanaged.total.toFixed(4));
});
