import { createFlow } from '../core/flow';
import { buyUpgrade, canBuy, commitRace, nextCupTrack, resetCup, standings } from '../core/progression';
import { defaultSave, loadSave, serializeSave } from '../core/save';
import type { RaceResult } from '../core/types';
import { assert, test } from './harness';

const ORDER_WIN = ['navie', '2', '7', '11', '18', '24'];
const cupRace = (runId: string, track: RaceResult['track'], order = ORDER_WIN): RaceResult => ({
  runId,
  mode: 'cup',
  track,
  difficulty: 'easy',
  place: order.indexOf('navie') + 1,
  order,
  totalTime: 120,
  bestLap: 38,
  boltsCollected: 10,
  ghost: null,
  abandoned: false,
});

test('reward: a race is paid once, even if committed again (retry, reload, double tap)', () => {
  const a = commitRace(defaultSave(), cupRace('r1', 'palayan'));
  const b = commitRace(a.save, cupRace('r1', 'palayan'));
  assert.ok(b.duplicate);
  assert.equal(b.save.bolts, a.save.bolts);
  assert.equal(b.save.cup.raced, 1);
  const reloaded = loadSave(serializeSave(a.save)).save;
  assert.ok(commitRace(reloaded, cupRace('r1', 'palayan')).duplicate);
});

test('reward: win pays place Bolts + pickups + first podium; podium bonus only once', () => {
  const a = commitRace(defaultSave(), cupRace('r1', 'palayan'));
  // 10 pickups + 50 for 1st + 40 first podium
  assert.equal(a.payout.total, 100);
  const reset = resetCup(a.save);
  const b = commitRace(reset, cupRace('r2', 'palayan'));
  assert.equal(b.payout.total, 60);
});

test('cup: three races in order, points add up, a trophy at the end', () => {
  let save = defaultSave();
  assert.equal(nextCupTrack(save), 'palayan');
  save = commitRace(save, cupRace('a', 'palayan')).save;
  assert.equal(nextCupTrack(save), 'parol');
  save = commitRace(save, cupRace('b', 'parol', ['2', 'navie', '7', '11', '18', '24'])).save;
  const last = commitRace(save, cupRace('c', 'sierra'));
  assert.ok(last.cupFinished);
  assert.equal(last.cupRank, 1);
  assert.equal(last.save.trophy, 1);
  assert.ok(last.payout.lines.some((l) => l.label === 'Gold trophy' && l.amount === 150));
  assert.equal(standings(last.save)[0][0], 'navie');
  assert.equal(standings(last.save)[0][1], 28);
});

test('time trial: records and the ghost are kept only when beaten', () => {
  const trial = (runId: string, total: number, lap: number): RaceResult => ({
    runId, mode: 'trial', track: 'parol', difficulty: 'easy', place: 1, order: ['navie'], totalTime: total, bestLap: lap, boltsCollected: 0, ghost: [0, 0, 5, 0.1], abandoned: false,
  });
  const a = commitRace(defaultSave(), trial('t1', 130, 42));
  assert.equal(a.save.tracks.parol?.bestTotal, 130);
  const b = commitRace(a.save, { ...trial('t2', 140, 40), ghost: [9, 9] });
  assert.equal(b.save.tracks.parol?.bestTotal, 130, 'slower total not kept');
  assert.equal(b.save.tracks.parol?.bestLap, 40, 'faster lap kept');
  assert.deepEqual(b.save.tracks.parol?.ghost, [0, 0, 5, 0.1], 'ghost of the best total kept');
});

test('abandoned races pay nothing and change no records', () => {
  const out = commitRace(defaultSave(), { ...cupRace('q', 'palayan'), abandoned: true });
  assert.equal(out.payout.total, 0);
  assert.equal(out.save.cup.raced, 0);
});

test('upgrades: bounded, priced, refused when short', () => {
  let save = { ...defaultSave(), bolts: 400 };
  assert.ok(buyUpgrade(save, 'tyres').bought);
  save = buyUpgrade(save, 'tyres').save;
  save = buyUpgrade(save, 'tyres').save;
  const check = canBuy(save, 'tyres');
  assert.ok(!check.ok && check.reason === 'maxed');
  assert.equal(save.bolts, 400 - 80 - 140);
  const poor = canBuy({ ...defaultSave(), bolts: 5 }, 'engine');
  assert.ok(!poor.ok && poor.reason === 'cost');
});

test('save: corrupt, newer and odd values are handled', () => {
  assert.deepEqual(loadSave('{oops').issues, ['not-json']);
  assert.deepEqual(loadSave(JSON.stringify({ version: 2 })).issues, ['newer-version']);
  const { save } = loadSave(JSON.stringify({ version: 1, bolts: -5, cup: { raced: 9 }, tracks: { palayan: { bestPlace: 0, ghost: [1, 'x'] } }, settings: { difficulty: 'insane' } }));
  assert.equal(save.bolts, 0);
  assert.equal(save.cup.raced, 3);
  assert.equal(save.tracks.palayan?.bestPlace, null);
  assert.equal(save.tracks.palayan?.ghost, null);
  assert.equal(save.settings.difficulty, 'easy');
});

test('flow: duplicate events ignored; resume goes through the countdown; one commit per race', () => {
  const flow = createFlow();
  flow.send('start');
  flow.send('go');
  assert.equal(flow.send('pause'), 'paused');
  assert.equal(flow.send('resume'), 'countdown');
  flow.send('go');
  assert.equal(flow.send('finish'), 'finished');
  assert.equal(flow.send('finish'), null);
  flow.send('showResults');
  let commits = 0;
  flow.commitOnce(() => (commits += 1));
  flow.commitOnce(() => (commits += 1));
  assert.equal(commits, 1);
  flow.send('again');
  assert.ok(flow.commitOnce(() => (commits += 1)));
});
