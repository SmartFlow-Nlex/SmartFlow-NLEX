import { allowedEvents, createFlow } from '../core/flow';
import { assert, test } from './harness';

test('flow: a run goes briefing -> countdown -> playing -> success -> results -> return', () => {
  const flow = createFlow();
  assert.equal(flow.send('start'), 'countdown');
  assert.equal(flow.send('countdownDone'), 'playing');
  assert.equal(flow.send('succeed'), 'success');
  assert.equal(flow.send('showResults'), 'results');
  assert.equal(flow.send('leave'), 'return');
});

test('flow: duplicate and out-of-order events are ignored', () => {
  const flow = createFlow();
  flow.send('start');
  flow.send('countdownDone');
  assert.equal(flow.send('succeed'), 'success');
  // A second "finished" from the simulation, or a failure arriving late.
  assert.equal(flow.send('succeed'), null);
  assert.equal(flow.send('fail'), null);
  assert.equal(flow.send('pause'), null, 'cannot pause a finished run');
  assert.equal(flow.state, 'success');
  flow.send('showResults');
  assert.equal(flow.send('showResults'), null, 'double tap on results');
});

test('flow: resuming from pause always goes through the countdown', () => {
  const flow = createFlow();
  flow.send('start');
  flow.send('countdownDone');
  assert.equal(flow.send('pause'), 'paused');
  assert.equal(flow.send('resume'), 'countdown');
  assert.equal(flow.send('pause'), 'paused', 'can pause during the countdown');
  assert.equal(flow.send('resume'), 'countdown');
  assert.equal(flow.send('countdownDone'), 'playing');
});

test('flow: commitOnce runs exactly once per run; retry starts a new run', () => {
  const flow = createFlow();
  let commits = 0;
  flow.send('start');
  flow.send('countdownDone');
  flow.send('fail');
  flow.send('showResults');
  assert.ok(flow.commitOnce(() => (commits += 1)));
  assert.ok(!flow.commitOnce(() => (commits += 1)));
  assert.equal(commits, 1);
  flow.send('replay');
  assert.equal(flow.state, 'briefing');
  assert.ok(!flow.committed, 'a replay is a fresh run');
  flow.send('start');
  flow.send('countdownDone');
  flow.send('succeed');
  flow.send('showResults');
  assert.ok(flow.commitOnce(() => (commits += 1)));
  assert.equal(commits, 2);
});

test('flow: every state lists its allowed events; return is final', () => {
  assert.deepEqual(allowedEvents('return'), []);
  assert.ok(allowedEvents('paused').includes('quit'));
  assert.ok(!allowedEvents('playing').includes('resume'));
});
