import { createRaceBot } from '../core/bot';
import { LAPS, STEP, TRACK_HALF } from '../core/config';
import { NO_RACE_INPUT, RaceSim, type RaceEvent, type RaceInput, type RaceOptions } from '../core/race';
import { ITEMS, rollItem } from '../core/items';
import { MAP_SAMPLES, TRACKS, curveAt, lapLength, mapPoint, trackMap } from '../core/tracks';
import { DIFFICULTIES, TRACKS_IN_CUP, type Difficulty, type TrackId } from '../core/types';
import { assert, test } from './harness';

function options(over: Partial<RaceOptions> = {}): RaceOptions {
  return { track: 'palayan', mode: 'cup', difficulty: 'standard', seed: 1, upgrades: {}, autoSteer: false, ghost: null, ...over };
}

function race(over: Partial<RaceOptions> = {}, driver?: (sim: RaceSim) => RaceInput, maxSeconds = 400): { sim: RaceSim; events: RaceEvent[]; seconds: number } {
  const sim = new RaceSim(options(over));
  const drive = driver ?? createRaceBot();
  const events: RaceEvent[] = [];
  let t = 0;
  while (!sim.state.finished && t < maxSeconds) {
    sim.step(STEP, drive(sim));
    events.push(...sim.drainEvents());
    t += STEP;
  }
  return { sim, events, seconds: t };
}

test('race: the autopilot finishes every track on every difficulty, 3 laps each', () => {
  for (const track of TRACKS_IN_CUP) {
    for (const difficulty of DIFFICULTIES) {
      const { sim, events, seconds } = race({ track, difficulty, seed: 3 });
      assert.ok(sim.state.finished, `${track}/${difficulty} did not finish (${seconds.toFixed(0)} s)`);
      assert.equal(sim.state.lapTimes.length, LAPS, `${track}/${difficulty} laps`);
      assert.equal(events.filter((e) => e.type === 'finish').length, 1);
      assert.ok(sim.state.place >= 1 && sim.state.place <= 6);
    }
  }
});

test('race: lap and race times are sensible (about 30-60 s a lap)', () => {
  for (const track of TRACKS_IN_CUP) {
    const { sim } = race({ track, difficulty: 'standard', seed: 2 });
    for (const lap of sim.state.lapTimes) {
      assert.ok(lap > 25 && lap < 70, `${track} lap ${lap.toFixed(1)} s`);
    }
  }
});

test('race: places are winnable but not handed out - autopilot spread across difficulties', () => {
  const placesOf = (difficulty: Difficulty): number[] =>
    TRACKS_IN_CUP.flatMap((track: TrackId) => [1, 2, 3].map((seed) => race({ track, difficulty, seed }).sim.state.place));
  const rookie = placesOf('rookie');
  const pro = placesOf('pro');
  const avg = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;
  assert.ok(avg(rookie) <= 2.5, `rookie average place ${avg(rookie).toFixed(2)}`);
  assert.ok(avg(pro) >= avg(rookie), `pro ${avg(pro).toFixed(2)} should be harder than rookie ${avg(rookie).toFixed(2)}`);
});

test('race: the same seed and inputs give the same race', () => {
  const a = race({ track: 'parol', seed: 9 });
  const b = race({ track: 'parol', seed: 9 });
  assert.equal(a.seconds, b.seconds);
  assert.equal(a.sim.state.place, b.sim.state.place);
  assert.deepEqual(a.sim.result('x').order, b.sim.result('x').order);
});

test('physics: a bend pushes an unsteered car toward the outside and onto the slow grass', () => {
  const sim = new RaceSim(options({ mode: 'trial', track: 'sierra' }));
  const length = lapLength(TRACKS.sierra);
  // Drive straight (no steering) through the first hard bend.
  let maxOut = 0;
  let grassSpeed = Infinity;
  for (let t = 0; t < 12; t += STEP) {
    sim.step(STEP, { axis: 0, targetX: null, boost: false });
    const curve = curveAt(TRACKS.sierra, sim.player.distance, length);
    if (Math.abs(curve) > 0.5) {
      maxOut = Math.max(maxOut, Math.abs(sim.player.x));
    }
    if (sim.state.offroad) {
      grassSpeed = Math.min(grassSpeed, sim.player.speed);
    }
  }
  assert.ok(maxOut > TRACK_HALF, `pushed out to ${maxOut.toFixed(2)}`);
  assert.ok(grassSpeed < 20, `slow on grass: ${grassSpeed.toFixed(1)}`);
});

test('physics: auto-steer keeps an unsteered car on the tarmac through bends', () => {
  const sim = new RaceSim(options({ mode: 'trial', track: 'palayan', autoSteer: true }));
  let offroad = 0;
  for (let t = 0; t < 40; t += STEP) {
    sim.step(STEP, NO_RACE_INPUT);
    if (sim.state.offroad) {
      offroad += STEP;
    }
  }
  assert.ok(offroad < 2, `seconds on grass with auto-steer: ${offroad.toFixed(1)}`);
});

test('boost: needs a charge; turbo cells add one third; pads boost for free', () => {
  const sim = new RaceSim(options({ mode: 'cup' }));
  sim.step(STEP, { axis: 0, targetX: null, boost: true });
  const events = sim.drainEvents();
  assert.ok(events.some((e) => e.type === 'boostEmpty'), 'empty meter refused');
  assert.equal(sim.state.boostT, 0);
  const { events: all, sim: done } = race({ mode: 'trial', track: 'palayan' });
  assert.ok(all.some((e) => e.type === 'turbo'), 'collected a turbo cell');
  assert.ok(all.some((e) => e.type === 'pad'), 'drove over a pad');
  assert.ok(all.some((e) => e.type === 'boost'), 'used a boost');
  assert.ok(done.state.bolts > 0, 'collected Bolts');
});

test('contact: one bump per touch, never every frame', () => {
  const sim = new RaceSim(options({ mode: 'cup', difficulty: 'pro', seed: 4 }));
  // Put a rival right beside Navie and drive into it.
  const rival = sim.state.cars[1];
  rival.distance = sim.player.distance + 0.5;
  rival.x = sim.player.x + 0.3;
  let bumps = 0;
  for (let t = 0; t < 0.4; t += STEP) {
    sim.step(STEP, { axis: 0, targetX: rival.x, boost: false });
    bumps += sim.drainEvents().filter((e) => e.type === 'bump').length;
  }
  assert.ok(bumps >= 1 && bumps <= 2, `bumps ${bumps}`);
});

test('time trial: a ghost is recorded, and replays on the next run', () => {
  const first = race({ mode: 'trial', track: 'palayan', seed: 5 });
  const ghost = first.sim.result('g').ghost;
  assert.ok(ghost !== null && ghost.length > 400, `ghost samples ${ghost?.length}`);
  const second = new RaceSim(options({ mode: 'trial', track: 'palayan', ghost }));
  for (let t = 0; t < 10; t += STEP) {
    second.step(STEP, NO_RACE_INPUT);
  }
  assert.ok(second.state.ghostCar !== null && second.state.ghostCar.distance > 100, 'ghost moved');
});

// -- items and the mini map --------------------------------------------------------------------

test('items: off by default and in time trials - no boxes, nothing rolled', () => {
  assert.equal(new RaceSim(options()).state.boxes.length, 0);
  assert.equal(new RaceSim(options({ mode: 'trial', items: true })).state.boxes.length, 0);
  const { events } = race({ items: false, seed: 5 });
  assert.equal(events.filter((e) => e.type === 'itemGet').length, 0);
});

test('items: every car can pick boxes up, every race still finishes, results stay deterministic', () => {
  for (const track of TRACKS_IN_CUP) {
    for (const difficulty of DIFFICULTIES) {
      const { sim, events } = race({ track, difficulty, seed: 4, items: true });
      assert.ok(sim.state.finished, `${track}/${difficulty} finished with items`);
      assert.ok(events.some((e) => e.type === 'itemGet' && e.who === 'navie'), `${track}/${difficulty}: Navie got an item`);
      assert.ok(events.some((e) => e.type === 'itemUse' && e.who !== 'navie'), `${track}/${difficulty}: rivals used items`);
    }
  }
  const a = race({ track: 'sierra', seed: 11, items: true });
  const b = race({ track: 'sierra', seed: 11, items: true });
  assert.equal(a.seconds, b.seconds);
  assert.deepEqual(a.sim.order().map((c) => c.id), b.sim.order().map((c) => c.id));
});

test('items: on Rookie the rivals never attack Navie', () => {
  for (const track of TRACKS_IN_CUP) {
    for (const seed of [1, 2, 3]) {
      const { events } = race({ track, difficulty: 'rookie', seed, items: true });
      assert.equal(events.filter((e) => e.type === 'spun' && e.who === 'navie' && e.by !== 'navie').length, 0, `${track} seed ${seed}`);
      for (const e of events) {
        if (e.type === 'itemGet' && e.who !== 'navie') {
          assert.ok(['turbo', 'bubble', 'star'].includes(e.item), `rookie rival rolled ${e.item}`);
        }
      }
    }
  }
});

test('items: a hit spins a car out once, then protects it; a bubble blocks one hit; a star is unstoppable', () => {
  const sim = new RaceSim(options({ items: true }));
  const p = sim.player;
  for (let i = 0; i < 60 * 4; i += 1) {
    sim.step(STEP, NO_RACE_INPUT);
  }
  // A coconut rolled from just behind Navie.
  const fire = (): void => {
    sim.state.shots.push({ id: 900 + sim.state.shots.length, kind: 'coconut', owner: '7', target: null, distance: p.distance - 1, x: p.x, speed: p.speed + 10, life: 3 });
    for (let i = 0; i < 30; i += 1) {
      sim.step(STEP, NO_RACE_INPUT);
    }
  };
  fire();
  let spins = sim.drainEvents().filter((e) => e.type === 'spun' && e.who === 'navie').length;
  assert.equal(spins, 1, 'first coconut spins Navie out');
  fire();
  spins = sim.drainEvents().filter((e) => e.type === 'spun' && e.who === 'navie').length;
  assert.equal(spins, 0, 'protected right after a spin: hits never chain');
  for (let i = 0; i < 60 * 4; i += 1) {
    sim.step(STEP, NO_RACE_INPUT);
  }
  p.shieldT = 8;
  fire();
  const after = sim.drainEvents();
  assert.ok(after.some((e) => e.type === 'blocked' && e.who === 'navie'), 'the bubble blocks it');
  assert.equal(after.filter((e) => e.type === 'spun' && e.who === 'navie').length, 0);
  assert.equal(p.shieldT, 0, 'the bubble is used up');
  p.starT = 3;
  fire();
  assert.equal(sim.drainEvents().filter((e) => e.type === 'spun' && e.who === 'navie').length, 0, 'the star shrugs it off');
});

test('items: the roll favours catch-up items at the back and never gives the leader a Red Light', () => {
  const count = (place: number): Record<string, number> => {
    const tally: Record<string, number> = {};
    const rng = { n: 7, next(): number { this.n = (this.n * 16807) % 2147483647; return this.n / 2147483647; }, chance(pr: number): boolean { return this.next() < pr; } };
    for (let i = 0; i < 3000; i += 1) {
      const id = rollItemForTest(rng, place);
      tally[id] = (tally[id] ?? 0) + 1;
    }
    return tally;
  };
  const leader = count(1);
  const last = count(6);
  assert.equal(leader.redLight ?? 0, 0);
  assert.ok((last.star ?? 0) > (leader.star ?? 0) && (last.turbo ?? 0) > (leader.turbo ?? 0));
  assert.ok((leader.oil ?? 0) > (last.oil ?? 0));
  assert.ok(ITEMS.every((id) => (last[id] ?? 0) > 0), 'the back of the pack can get anything');
});

function rollItemForTest(rng: { next: () => number; chance: (p: number) => boolean }, place: number): string {
  return rollItem(rng, place, 6, false);
}

test('mini map: every track is one closed loop that never crosses itself, and positions follow the race', () => {
  const cross = (a: number[], b: number[], c: number[], d: number[]): boolean => {
    const o = (p: number[], q: number[], r: number[]): number => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
    return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
  };
  for (const id of TRACKS_IN_CUP) {
    const map = trackMap(TRACKS[id]);
    const pts = map.points;
    assert.equal(pts.length, MAP_SAMPLES);
    assert.ok(pts.every(([x, y]) => x >= -1e-9 && x <= 1 + 1e-9 && y >= -1e-9 && y <= 1 + 1e-9), `${id} fits the square`);
    for (let i = 0; i < pts.length; i += 1) {
      for (let j = i + 2; j < pts.length; j += 1) {
        if (i === 0 && j === pts.length - 1) {
          continue;
        }
        assert.ok(!cross(pts[i], pts[(i + 1) % pts.length], pts[j], pts[(j + 1) % pts.length]), `${id} crosses itself at ${i}/${j}`);
      }
    }
    const L = lapLength(TRACKS[id]);
    const start = mapPoint(map, 0, L);
    const lapLater = mapPoint(map, L, L);
    assert.ok(Math.hypot(start[0] - lapLater[0], start[1] - lapLater[1]) < 1e-9, `${id}: a lap later is the same spot`);
    const quarter = mapPoint(map, L / 4, L);
    assert.ok(Math.hypot(start[0] - quarter[0], start[1] - quarter[1]) > 0.1, `${id}: a quarter lap moves the dot`);
  }
});

/* ---- Analog steering (touch, tilt, held buttons, keys), added 17 Nov 2026 ---- */

/** A player-like driver on analog steering: leans toward the fast line in proportion, with a little lag. */
function analogDriver(gain = 1.2, lag = 0.12): (sim: RaceSim) => RaceInput {
  let steer = 0;
  return (sim) => {
    const s = sim.state;
    const p = sim.player;
    const want = Math.max(-1, Math.min(1, (idealLineFor(s, p.distance + 8) - p.x) * gain - p.vx * 0.15));
    steer += (want - steer) * (1 - Math.exp(-STEP / lag));
    return { axis: 0, targetX: null, steer, boost: s.boostMeter >= 1 / 3 && s.boostT <= 0, item: p.item !== null && p.itemRoll <= 0 };
  };
}

function idealLineFor(s: RaceSim['state'], d: number): number {
  return Math.max(-1.3, Math.min(1.3, -curveAt(s.track, d, s.length) * 0.9));
}

test('steering: letting go on a straight keeps the car on its line', () => {
  const sim = new RaceSim(options({ mode: 'trial', track: 'palayan' }));
  for (let t = 0; t < 1; t += STEP) {
    sim.step(STEP, { axis: 0, targetX: null, steer: 0.6, boost: false });
  }
  for (let t = 0; t < 0.4; t += STEP) {
    sim.step(STEP, { axis: 0, targetX: null, steer: 0, boost: false });
  }
  const x = sim.player.x;
  for (let t = 0; t < 2; t += STEP) {
    sim.step(STEP, { axis: 0, targetX: null, steer: 0, boost: false });
  }
  assert.ok(Math.abs(sim.player.x - x) < 0.02, `drifted ${(sim.player.x - x).toFixed(3)} on the straight`);
});

test('steering: proportional - a small lean crosses slowly, a full lean fast, and it answers quickly', () => {
  const speed = (steer: number): { v: number; t90: number } => {
    const sim = new RaceSim(options({ mode: 'trial', track: 'palayan' }));
    let t90 = Infinity;
    for (let t = 0; t < 0.6; t += STEP) {
      sim.step(STEP, { axis: 0, targetX: null, steer, boost: false });
      if (t90 === Infinity && Math.abs(sim.player.vx) >= Math.abs(steer) * 3.4 * 0.9) {
        t90 = t;
      }
    }
    return { v: Math.abs(sim.player.vx), t90 };
  };
  const small = speed(0.25);
  const full = speed(1);
  assert.ok(Math.abs(small.v / full.v - 0.25) < 0.05, `small/full lateral speed ${(small.v / full.v).toFixed(2)}`);
  assert.ok(full.t90 < 0.12, `full lean reaches 90% in ${full.t90.toFixed(3)} s`);
});

test('steering: a long bend is held with a steady lean inward, no repeated swipes', () => {
  for (const track of TRACKS_IN_CUP) {
    const sim = new RaceSim(options({ mode: 'trial', track }));
    const drive = analogDriver();
    let offroad = 0;
    let swaps = 0;
    let last = 0;
    for (let t = 0; t < 45; t += STEP) {
      const input = drive(sim);
      const st = input.steer ?? 0;
      if (Math.abs(st) > 0.15 && Math.sign(st) !== Math.sign(last) && Math.abs(last) > 0.15) {
        swaps += 1;
      }
      if (Math.abs(st) > 0.15) {
        last = st;
      }
      sim.step(STEP, input);
      if (sim.state.offroad) {
        offroad += STEP;
      }
    }
    assert.ok(offroad < 1.5, `${track}: ${offroad.toFixed(1)} s on the grass with analog steering`);
    assert.ok(swaps < 40, `${track}: ${swaps} left-right swaps in 45 s`);
  }
});

test('steering: bends still push an unsteered car wide; the assist takes a little under half of it', () => {
  /* How far out the car is 30 m into Sierra's first hard bend (it starts at 100 m), and the furthest it goes. */
  const outward = (assist: boolean): { at: number; max: number } => {
    const sim = new RaceSim(options({ mode: 'trial', track: 'sierra', steerAssist: assist }));
    let at = 0;
    let max = 0;
    for (let t = 0; t < 12; t += STEP) {
      sim.step(STEP, { axis: 0, targetX: null, steer: 0, boost: false });
      if (at === 0 && sim.player.distance >= 130) {
        at = Math.abs(sim.player.x);
      }
      max = Math.max(max, Math.abs(sim.player.x));
    }
    return { at, max };
  };
  const plain = outward(false);
  const helped = outward(true);
  assert.ok(plain.max > TRACK_HALF, `unassisted pushed out to ${plain.max.toFixed(2)}`);
  assert.ok(helped.at < plain.at * 0.75, `30 m in: assisted ${helped.at.toFixed(2)} vs ${plain.at.toFixed(2)}`);
});

test('steering: an analog player can finish every track on every difficulty', () => {
  for (const track of TRACKS_IN_CUP) {
    for (const difficulty of DIFFICULTIES) {
      const { sim } = race({ track, difficulty, seed: 5 }, analogDriver());
      assert.ok(sim.state.finished, `${track}/${difficulty} analog driver did not finish`);
    }
  }
});
