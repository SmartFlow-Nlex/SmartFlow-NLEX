import { RadioDirector } from '../core/dialogue';
import { assert, test } from './harness';

test('radio: essential lines show even when the road is busy; chatter is dropped', () => {
  const radio = new RadioDirector();
  radio.trigger('firstBolt'); // chatter
  radio.update(0.2, 1); // busy
  assert.equal(radio.current, null, 'chatter dropped while busy');
  radio.trigger('kikoStrain'); // essential
  radio.update(0.1, 1);
  assert.equal(radio.current?.id, 'kikoStrain');
});

test('radio: once lines never repeat in a run; cooldowns are respected', () => {
  const radio = new RadioDirector();
  radio.trigger('firstHit');
  radio.update(0.1, 0);
  assert.equal(radio.current?.id, 'firstHit');
  for (let i = 0; i < 100; i += 1) {
    radio.update(0.1, 0);
  }
  radio.trigger('firstHit');
  radio.update(0.1, 0);
  assert.equal(radio.current, null, 'once');
  radio.trigger('wrench');
  radio.update(0.1, 0);
  assert.equal(radio.current?.id, 'wrench');
  for (let i = 0; i < 40; i += 1) {
    radio.update(0.1, 0);
  }
  radio.trigger('wrench'); // 4 s later, cooldown 8 s
  radio.update(0.1, 0);
  assert.equal(radio.current, null, 'cooldown');
});

test('radio: story lines wait for a calm moment, then lapse after 6 s', () => {
  const radio = new RadioDirector();
  radio.trigger('m1-start');
  radio.update(1, 1);
  assert.equal(radio.current, null, 'waiting');
  radio.update(1, 0);
  assert.equal(radio.current?.id, 'm1-start', 'shown once calm');
  const late = new RadioDirector();
  late.trigger('m1-start');
  for (let i = 0; i < 70; i += 1) {
    late.update(0.1, 1);
  }
  late.update(0.1, 0);
  assert.equal(late.current, null, 'lapsed');
});

test('radio: every shown line is logged for review', () => {
  const radio = new RadioDirector();
  radio.trigger('m2-start');
  radio.update(0.1, 0);
  assert.equal(radio.log.length, 1);
  assert.equal(radio.log[0].speaker, 'kiko');
});
