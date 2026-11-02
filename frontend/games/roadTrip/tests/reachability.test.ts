import { PLAYER_BACK, PLAYER_FRONT, PLAYER_HIT_HALF_W, X_LIMIT } from '../core/config';
import { hasSafePath, type Mover, type Obstacle } from '../core/reachability';
import { assert, test } from './harness';

const mover = (x: number, extra: Partial<Mover> = {}): Mover => ({
  x,
  vx: 0,
  halfW: PLAYER_HIT_HALF_W,
  back: PLAYER_BACK,
  front: PLAYER_FRONT,
  xMin: -X_LIMIT,
  xMax: X_LIMIT,
  lateral: 2.8,
  reaction: 0.6,
  ...extra,
});

const barrier = (x: number, z: number, approach = 17): Obstacle => ({ x, halfW: 0.46, z, len: 0.45, approach });

test('reachability: an empty road is always safe', () => {
  assert.ok(hasSafePath([], mover(0)));
});

test('reachability: a full-width wall is never safe', () => {
  assert.ok(!hasSafePath([barrier(-1, 40), barrier(0, 40), barrier(1, 40)], mover(0)));
});

test('reachability: a gap far enough ahead is reachable', () => {
  // Gap on the right, 60 units ahead at 17 u/s: ~3.5 s, plenty for one lane change.
  assert.ok(hasSafePath([barrier(-1, 60), barrier(0, 60)], mover(-1)));
});

test('reachability: the same gap is NOT reachable when it is too close', () => {
  // 12 units ahead = 0.7 s; from the far left, two lanes away, after 0.6 s reaction.
  assert.ok(!hasSafePath([barrier(-1, 12), barrier(0, 12)], mover(-1)));
});

test('reachability: an empty lane that cannot be reached in time does not count', () => {
  // Row 1 forces the right lane; row 2 forces the left lane only 6 units later.
  const rows = [barrier(-1, 40), barrier(0, 40), barrier(0, 46), barrier(1, 46)];
  assert.ok(!hasSafePath(rows, mover(1)), 'two lanes in 0.35 s is impossible');
  const roomy = [barrier(-1, 40), barrier(0, 40), barrier(0, 70), barrier(1, 70)];
  assert.ok(hasSafePath(roomy, mover(1)), 'with ~1.8 s between rows it is fine');
});

test('reachability: something on the current line inside the reaction time is unfair', () => {
  const cone: Obstacle = { x: 0, halfW: 0.16, z: 8, len: 0.45, approach: 17 };
  // It reaches the bumper in ~0.43 s.
  assert.ok(!hasSafePath([cone], mover(0)), 'inside the 0.6 s reaction allowance');
  assert.ok(hasSafePath([cone], mover(0, { reaction: 0.1 })), 'with a 0.1 s reaction it is dodgeable');
});

test('reachability: a lane-changing car covers both lanes from its indicator on', () => {
  const car: Obstacle = {
    x: -1,
    halfW: 0.31,
    z: 30,
    len: 1.6,
    approach: 9,
    // Indicating from 2.5 s and crossing until 3.9 s: exactly while it passes the player (3.3-3.6 s).
    laneChange: { toX: 0, signalT: 2.5, startT: 3.0, duration: 0.9 },
  };
  // It covers the left and centre lanes together; a barrier closes the right lane at the same moment.
  const wall = barrier(1, 30.5, 9);
  assert.ok(!hasSafePath([car, wall], mover(0)));
  assert.ok(hasSafePath([car], mover(0)), 'without the wall the right lane is open');
});
