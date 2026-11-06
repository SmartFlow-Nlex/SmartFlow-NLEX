import * as fs from 'fs';
import * as path from 'path';
import { FOES, HAZARDS, STEP } from '../core/config';
import { FLY_HEIGHT, SidekickDodge, goesOver, roadThingHeight, type Dodger, type RoadThing } from '../core/sidekickDodge';
import { createBot } from '../core/bot';
import { DrivingSim } from '../core/sim';
import { JOURNEY, type SidekickId } from '../core/types';
import { assert, test } from './harness';
import { loadout, simOptions } from './play';

const thing = (kind: keyof typeof HAZARDS, x: number, z: number): RoadThing => ({ kind, x, z, halfW: HAZARDS[kind].halfW, len: HAZARDS[kind].len, ownSpeed: HAZARDS[kind].ownSpeed, thrown: HAZARDS[kind].thrown, spent: false, knocked: -1 });

const RUNNER: Dodger = { slot: 0, x: 0.68, z: -0.45, halfW: 0.16, flying: false };
const FLYER: Dodger = { ...RUNNER, flying: true };
const SPEED = 14;

/** Runs a thing past a sidekick and returns what was seen as it passed. */
function pass(kind: keyof typeof HAZARDS, x: number, k: Dodger): { maxHop: number; hopOver: number; xOver: number; endDx: number; endHop: number } {
  const dodge = new SidekickDodge();
  const h = thing(kind, x, 30);
  let maxHop = 0;
  let hopOver = Infinity;
  let xOver = k.x;
  while (h.z > k.z - h.len - 12) {
    dodge.update(STEP, SPEED, [h], [k]);
    const pose = dodge.pose(k.slot);
    maxHop = Math.max(maxHop, pose.hop);
    if (h.z < k.z + 0.2 && h.z + h.len > k.z - 0.2) {
      hopOver = Math.min(hopOver, pose.hop);
      xOver = k.x + pose.dx;
    }
    h.z -= SPEED * (1 - h.ownSpeed + h.thrown) * STEP;
  }
  const end = dodge.pose(k.slot);
  return { maxHop, hopOver, xOver, endDx: end.dx, endHop: end.hop };
}

test('sidekicks: a runner jumps a barrier, a cone and a pothole in its path, clearing each all the way over', () => {
  for (const kind of ['barrier', 'cone', 'pothole'] as const) {
    const r = pass(kind, RUNNER.x, RUNNER);
    assert.ok(r.hopOver >= roadThingHeight(kind), `${kind}: ${r.hopOver.toFixed(2)} over a thing ${roadThingHeight(kind)} tall`);
    assert.ok(r.endHop === 0 && Math.abs(r.endDx) < 0.001, `${kind}: lands and goes back to its place`);
  }
});

test('sidekicks: a runner goes round traffic and bots rather than through them', () => {
  for (const kind of ['car', 'truck', 'bus'] as const) {
    const h = HAZARDS[kind];
    const r = pass(kind, 1, RUNNER);
    assert.ok(Math.abs(r.xOver - 1) >= h.halfW + RUNNER.halfW, `${kind}: beside it at ${r.xOver.toFixed(2)}`);
    assert.equal(r.maxHop, 0, `${kind}: stays on the road`);
    assert.ok(Math.abs(r.endDx) < 0.001, `${kind}: goes back to its place`);
  }
});

test('sidekicks: a flyer rises over what it can and goes round trucks and buses', () => {
  const over = pass('car', FLYER.x, FLYER);
  assert.ok(over.hopOver + FLY_HEIGHT >= roadThingHeight('car'), 'over the car');
  assert.ok(!goesOver('truck', true) && !goesOver('bus', true));
  const round = pass('bus', 1, FLYER);
  assert.ok(Math.abs(round.xOver - 1) >= HAZARDS.bus.halfW + FLYER.halfW, 'beside the bus');
});

test('sidekicks: nothing moves for something in another part of the road, or already knocked aside', () => {
  assert.equal(pass('barrier', -1, RUNNER).maxHop, 0);
  const dodge = new SidekickDodge();
  dodge.update(STEP, SPEED, [{ ...thing('barrier', RUNNER.x, 0), knocked: 0.1 }, { ...thing('cone', RUNNER.x, 0), spent: true }], [RUNNER]);
  assert.equal(dodge.pose(0).hop, 0);
  assert.equal(dodge.pose(0).dx, 0);
});

test('sidekicks: steering while beside a long truck never carries one through it, or across it', () => {
  const dodge = new SidekickDodge();
  const truck = thing('truck', 0, -1);
  const k: Dodger = { ...RUNNER, x: 0.3 };
  for (let i = 0; i < 30; i += 1) {
    dodge.update(STEP, SPEED, [truck], [k]);
  }
  let x = k.x + dodge.pose(0).dx;
  const reach = truck.halfW + k.halfW;
  assert.ok(x >= reach, `beside it on its own side, at ${x.toFixed(2)}`);
  // The hero steers hard across, dragging its formation place to the truck's far side.
  for (let i = 0; i < 40; i += 1) {
    const moved = { ...k, x: k.x - i * 0.03 };
    dodge.update(STEP, SPEED, [truck], [moved]);
    const now = moved.x + dodge.pose(0).dx;
    assert.ok(now >= reach && Math.abs(now - x) < 0.1, `tick ${i}: at ${now.toFixed(2)}, from ${x.toFixed(2)}`);
    x = now;
  }
});

test('sidekicks: a thing zapped mid-jump leaves it to fall, not to snap to the road', () => {
  const dodge = new SidekickDodge();
  const h = thing('barrier', RUNNER.x, RUNNER.z);
  dodge.update(STEP, SPEED, [h], [RUNNER]);
  const top = dodge.pose(0).hop;
  assert.ok(top > 0.4, 'in the air');
  dodge.update(STEP, SPEED, [{ ...h, spent: true }], [RUNNER]);
  const next = dodge.pose(0).hop;
  assert.ok(next < top && next > top - 0.15, `from ${top.toFixed(2)} to ${next.toFixed(2)} in one tick`);
  for (let i = 0; i < 40; i += 1) {
    dodge.update(STEP, SPEED, [], [RUNNER]);
  }
  assert.equal(dodge.pose(0).hop, 0, 'and lands');
});

test('sidekicks: both are boxed in by traffic in every lane: they find the shoulder and stay near the road', () => {
  const dodge = new SidekickDodge();
  // Already level with them, so it is out of the way at once.
  const h = [thing('bus', -1, -1), thing('bus', 0, -1), thing('bus', 1, -1)];
  dodge.update(STEP, SPEED, h, [RUNNER]);
  const x = RUNNER.x + dodge.pose(0).dx;
  assert.ok(h.every((b) => Math.abs(x - b.x) >= b.halfW + RUNNER.halfW), `clear of all three, at ${x.toFixed(2)}`);
  assert.ok(Math.abs(x) <= 1.7, 'near the road');
});

test('sidekicks: on real missions none ever passes through anything, and they never jump about', () => {
  // A runner and a flyer on every story mission and every fourth road level: every kind of road.
  const pairs: [SidekickId, SidekickId][] = [['bumbo', 'pip'], ['mila', 'silip'], ['bantay', 'kalaw']];
  let met = 0;
  JOURNEY.forEach((missionId, i) => {
    if (i % 4 !== 0 && missionId.startsWith('lv-')) {
      return;
    }
    const [a, b] = pairs[i % pairs.length];
    const sim = new DrivingSim(simOptions(missionId, { skipTutorial: true, seed: 3 + i, loadout: loadout('navie', [a, b]) }));
    const drive = createBot({ useAbility: true });
    const dodge = new SidekickDodge();
    const first = sim.state.sidekicks.map((k) => k.x);
    const last: [{ x: number; hop: number }, { x: number; hop: number }] = [{ x: first[0] ?? 0, hop: 0 }, { x: first[1] ?? 0, hop: 0 }];
    const flying = new Set<SidekickId>(['pip', 'silip', 'kalaw']);
    for (let t = 0; t < 45 && sim.state.outcome === null; t += STEP) {
      if (sim.state.choice !== null) {
        sim.choose(sim.state.choice.options[0] ?? null);
      }
      sim.step(STEP, drive(sim, STEP));
      const s = sim.state;
      const dodgers: Dodger[] = s.sidekicks.map((k) => ({ slot: k.slot, x: k.x, z: k.z, halfW: 0.16, flying: flying.has(k.id) }));
      dodge.update(STEP, s.speed, s.hazards, dodgers);
      for (const k of dodgers) {
        const pose = dodge.pose(k.slot);
        const x = k.x + pose.dx;
        assert.ok(Math.abs(x) <= 1.7 + 0.001, `${missionId}: stays near the road (${x.toFixed(2)})`);
        const was = last[k.slot];
        assert.ok(Math.abs(pose.hop - was.hop) < 0.2, `${missionId}: hop moved ${(pose.hop - was.hop).toFixed(2)} in one tick`);
        // Its formation place moves with the hero too, so this allows for that: but never a jump across anything.
        assert.ok(Math.abs(x - was.x) < 0.25, `${missionId}: moved ${(x - was.x).toFixed(2)} sideways in one tick`);
        was.hop = pose.hop;
        was.x = x;
        for (const h of s.hazards) {
          if (h.spent || h.knocked >= 0 || !(h.z < k.z + 0.2 && h.z + h.len > k.z - 0.2) || Math.abs(x - h.x) >= h.halfW + k.halfW) {
            continue;
          }
          met += 1;
          const height = pose.hop + (k.flying ? FLY_HEIGHT : 0);
          assert.ok(height >= roadThingHeight(h.kind), `${missionId}: slot ${k.slot} went through a ${h.kind}: ${height.toFixed(2)} over ${roadThingHeight(h.kind)}`);
        }
      }
    }
  });
  assert.ok(met > 100, `it did have things to get over (${met} ticks above one)`);
});

test('sidekicks: dodging reads the road and changes nothing about the game', () => {
  const run = (withDodge: boolean): string => {
    const sim = new DrivingSim(simOptions('tambubong', { skipTutorial: true, seed: 9, loadout: loadout('navie', ['bumbo', 'mila']) }));
    const drive = createBot({ useAbility: true });
    const dodge = new SidekickDodge();
    for (let t = 0; t < 30 && sim.state.outcome === null; t += STEP) {
      if (sim.state.choice !== null) {
        sim.choose(sim.state.choice.options[0] ?? null);
      }
      sim.step(STEP, drive(sim, STEP));
      if (withDodge) {
        dodge.update(STEP, sim.state.speed, sim.state.hazards, sim.state.sidekicks.map((k) => ({ slot: k.slot, x: k.x, z: k.z, halfW: 0.16, flying: false })));
      }
    }
    const s = sim.state;
    return JSON.stringify([s.distance, s.player, s.hazards.map((h) => [h.kind, h.x, h.z]), s.sidekicks.map((k) => [k.x, k.z, k.cooldown])]);
  };
  assert.equal(run(true), run(false));
});

test('sidekicks: a pothole is a hole, drawn flat: hopped with a little skip, not a leap', () => {
  assert.ok(roadThingHeight('pothole') > 0 && roadThingHeight('pothole') < 0.15);
});

test('sidekicks: the heights they jump are the real heights of the art, so a redrawn trap cannot leave them clipping it', () => {
  const sprites = (JSON.parse(fs.readFileSync(path.join(process.cwd(), 'frontend', 'games', 'roadTrip', 'assets', 'art', 'manifest.json'), 'utf8')) as { sprites: Record<string, { ay: number; ppu: number; wide?: number }> }).sprites;
  const cars = [0, 1, 2, 3, 4, 5, 6].map((n) => `t.car${n}`);
  const art: [keyof typeof HAZARDS | keyof typeof FOES, string[]][] = [
    ['cone', ['z.cone']], ['rollingCone', ['z.cone']], ['barrier', ['z.barrier']], ['sweepBarrier', ['z.sweep']],
    ['car', cars], ['truck', ['t.truck']], ['bus', ['t.bus']], ['conebot', ['f.conebot']], ['drumbot', ['f.drumbot']], ['signbot', ['f.signbot']],
  ];
  for (const [kind, names] of art) {
    const halfW = kind in HAZARDS ? HAZARDS[kind as keyof typeof HAZARDS].halfW : FOES[kind as keyof typeof FOES].halfW;
    const tallest = Math.max(...names.map((n) => (sprites[n].ay / sprites[n].ppu) * ((2 * halfW) / (sprites[n].wide ?? 2))));
    assert.ok(roadThingHeight(kind) >= tallest - 0.02, `${kind}: treated as ${roadThingHeight(kind)}, drawn ${tallest.toFixed(2)} tall`);
    assert.ok(roadThingHeight(kind) <= tallest + 0.15, `${kind}: treated as ${roadThingHeight(kind)}, only ${tallest.toFixed(2)} tall`);
  }
});
