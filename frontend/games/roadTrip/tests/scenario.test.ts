import { forecastSnapshot, mapSnapshot, syntheticSnapshot, validateSnapshot, type TrafficSnapshot } from '../core/scenario';
import { assert, test } from './harness';

const snap = (queueChance: number | null, directionShare: number | null = null): TrafficSnapshot => ({
  ...forecastSnapshot({
    exitId: 'meycauayan',
    exitName: 'Meycauayan',
    direction: 'northbound',
    forecastFor: new Date('2026-10-24T08:00:00Z'),
    queueChance,
    typicalDelaySeconds: 240,
    nbShare: directionShare,
    sbShare: null,
    modelName: 'test-model',
    fetchedAt: new Date('2026-10-24T07:10:00Z'),
  }),
});

test('scenario: queue chance maps to documented tiers', () => {
  assert.equal(mapSnapshot(snap(0.1)).tier, 'light');
  assert.equal(mapSnapshot(snap(0.5)).tier, 'moderate');
  assert.equal(mapSnapshot(snap(0.9)).tier, 'heavy');
  // Direction weighting: a 90% chance with only 60% of the queueing on this side is moderate.
  assert.equal(mapSnapshot(snap(0.9, 0.6)).tier, 'moderate');
});

test('scenario: a missing figure is moderate and says so', () => {
  const config = mapSnapshot(snap(null));
  assert.equal(config.tier, 'moderate');
  assert.ok(config.summary.includes('No queue figure'));
});

test('scenario: the synthetic fallback is labelled synthetic everywhere and is reproducible', () => {
  const a = syntheticSnapshot(42, new Date('2026-10-24T00:00:00Z'));
  const b = syntheticSnapshot(42, new Date('2026-10-24T00:00:00Z'));
  assert.deepEqual(a, b);
  assert.equal(a.kind, 'synthetic');
  assert.equal(a.forecastFor, null);
  assert.ok(a.source.toLowerCase().includes('synthetic'));
  assert.ok(mapSnapshot(a).provenance.toLowerCase().includes('synthetic'));
});

test('scenario: forecast provenance says it is a prediction, not a count', () => {
  const p = mapSnapshot(snap(0.4)).provenance;
  assert.ok(p.includes('model prediction'));
  assert.ok(p.includes('not a recorded count'));
});

test('scenario: snapshots from the host are validated', () => {
  assert.ok(validateSnapshot(snap(0.4)) !== null);
  assert.equal(validateSnapshot(null), null);
  assert.equal(validateSnapshot({ ...snap(0.4), version: 99 }), null);
  assert.equal(validateSnapshot({ ...snap(0.4), queueChance: 3 }), null);
  assert.equal(validateSnapshot({ ...snap(0.4), direction: 'up' }), null);
  assert.equal(validateSnapshot({ ...snap(0.4), kind: 'live' }), null);
});
