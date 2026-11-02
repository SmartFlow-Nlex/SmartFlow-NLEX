import { FOES, HAZARDS, KIKO_GAP, KIKO_RESCUE_GAP, PLAYER_BACK, PRESETS, SPAWN_Z, STEP, type HazardKind } from '../core/config';
import { KIKO_LAG_MAX, kikoShadows, obstacleFor, placementIsFair } from '../core/director';
import { DrivingSim, NO_INPUT, type HazardEntity, type SimEvent } from '../core/sim';
import { JOURNEY, type Difficulty, type FoeKind, type HeroId, type MissionId, type SidekickId } from '../core/types';
import { MISSIONS } from '../core/missions';
import { assert, test } from './harness';
import { autoChoose, loadout, playMission, simOptions } from './play';
import { createBot } from '../core/bot';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const STOPS: readonly MissionId[] = JOURNEY;

function sweep(difficulty: Difficulty, seeds: number[]): { wins: number; total: number; fails: string[] } {
  let wins = 0;
  const fails: string[] = [];
  for (const missionId of STOPS) {
    for (const seed of seeds) {
      const played = playMission(missionId, { difficulty, seed });
      if (played.outcome === 'success') {
        wins += 1;
      } else {
        fails.push(`${missionId} seed ${seed}: ${played.outcome} (dents ${played.sim.state.player.dents}, kiko ${played.sim.state.kiko?.engine ?? '-'}, t ${played.seconds.toFixed(0)}s)`);
      }
    }
  }
  return { wins, total: STOPS.length * seeds.length, fails };
}

test('playthrough: Story, Relaxed and Standard are completable with starter equipment (seeded autopilot)', () => {
  for (const difficulty of ['story', 'relaxed', 'standard'] as Difficulty[]) {
    const { wins, total, fails } = sweep(difficulty, SEEDS);
    assert.equal(wins, total, `${difficulty}: ${fails.join('; ')}`);
  }
});

test('playthrough: Expert is completable on most seeds', () => {
  const { wins, total, fails } = sweep('expert', SEEDS);
  assert.atLeast(wins / total, 0.75, `expert: ${fails.join('; ')}`);
});

test('playthrough: the same seed and inputs give the same run', () => {
  const a = playMission('m2-convoy', { seed: 11 });
  const b = playMission('m2-convoy', { seed: 11 });
  assert.equal(a.seconds, b.seconds);
  assert.equal(a.sim.state.boltsCollected, b.sim.state.boltsCollected);
  assert.equal(a.sim.state.player.dents, b.sim.state.player.dents);
  assert.equal(a.events.length, b.events.length);
});

test('story: a run never fails, even driving straight ahead without steering', () => {
  for (const missionId of STOPS) {
    const played = playMission(missionId, { difficulty: 'story', seed: 3, bot: { blind: true }, skipTutorial: true });
    // The finale needs sparks for the Team Honk, which a blind driver may never collect: no failure is the point.
    assert.ok(played.outcome !== 'failure', `${missionId} failed in Story`);
    if (MISSIONS[missionId].kind !== 'finale') {
      assert.equal(played.outcome, 'success', missionId);
    }
  }
});

test('collisions: one hazard is one dent, never one dent per frame', () => {
  const sim = new DrivingSim(simOptions('m1-garage', { difficulty: 'relaxed', skipTutorial: true, seed: 5 }));
  // Drive straight into a long truck placed in our lane.
  sim.state.hazards.push({
    id: 999,
    kind: 'truck',
    x: 0,
    z: 6,
    halfW: HAZARDS.truck.halfW,
    len: HAZARDS.truck.len,
    ownSpeed: 0,
    thrown: 0,
    spent: false, clearedHero: false, clearedKiko: false, hp: 0, maxHp: 0, hurtT: 99, stun: 0,
    practice: false,
    knocked: -1,
    knockDir: 0,
    laneChange: null,
  });
  for (let i = 0; i < 120; i += 1) {
    sim.step(STEP, { axis: 0, targetX: 0, ability: false });
  }
  const hits = sim.drainEvents().filter((e) => e.type === 'hit');
  assert.equal(hits.length, 1);
  assert.equal(sim.state.player.dents, 1);
});

test('collisions: post-hit protection stops a second hazard right after the first', () => {
  const sim = new DrivingSim(simOptions('m1-garage', { difficulty: 'standard', skipTutorial: true, seed: 5 }));
  for (const z of [5, 8]) {
    sim.state.hazards.push({ id: 900 + z, kind: 'cone', x: 0, z, halfW: HAZARDS.cone.halfW, len: HAZARDS.cone.len, ownSpeed: 0, thrown: 0, spent: false, clearedHero: false, clearedKiko: false, hp: 0, maxHp: 0, hurtT: 99, stun: 0, practice: false, knocked: -1, knockDir: 0, laneChange: null });
  }
  for (let i = 0; i < 60; i += 1) {
    sim.step(STEP, { axis: 0, targetX: 0, ability: false });
  }
  assert.equal(sim.state.player.dents, 1, 'the second cone 0.2 s later is inside the protection');
});

test('spawning: hazards never appear near the player during patterns (seeded runs)', () => {
  for (const missionId of ['m1-garage', 'm2-convoy', 'snapshot'] as MissionId[]) {
    for (const seed of [1, 2, 3]) {
      const sim = new DrivingSim(simOptions(missionId, { seed, skipTutorial: true }));
      const seen = new Set<number>();
      let nearest = Infinity;
      let t = 0;
      while (sim.state.outcome === null && t < 200) {
        sim.step(STEP, NO_INPUT);
        for (const h of sim.state.hazards) {
          if (!seen.has(h.id)) {
            seen.add(h.id);
            nearest = Math.min(nearest, h.z);
          }
        }
        t += STEP;
      }
      assert.atLeast(nearest, SPAWN_Z - 1, `${missionId}/${seed}`);
    }
  }
});

test('fairness: every pattern on the road was fair when placed (re-checked independently)', () => {
  // Re-run the placement check against the state just before each new hazard batch appears.
  let checked = 0;
  for (const missionId of ['m1-garage', 'm2-convoy'] as MissionId[]) {
    for (const seed of [1, 2, 3, 4]) {
      const sim = new DrivingSim(simOptions(missionId, { seed, skipTutorial: true }));
      let known = new Set<number>();
      let t = 0;
      while (sim.state.outcome === null && t < 200) {
        const before = sim.state.hazards.filter((h) => !h.spent).map((h) => ({ ...h }));
        const px = sim.state.player.x;
        const pvx = sim.state.player.vx;
        const kiko = sim.state.kiko ? { x: sim.state.kiko.x, vx: sim.state.kiko.vx, z: sim.state.kiko.z } : null;
        sim.step(STEP, NO_INPUT);
        const fresh = sim.state.hazards.filter((h) => !known.has(h.id));
        known = new Set(sim.state.hazards.map((h) => h.id));
        if (fresh.length > 0 && sim.state.rescue === null) {
          const speed = sim.state.speed;
          const world = {
            speed,
            player: { x: px, vx: pvx },
            kiko,
            obstacles: before.filter((h) => !h.practice).map((h) => obstacleFor(h.kind as HazardKind, h.x, h.z, speed, h.laneChange?.done === false && h.laneChange.signalAt === null ? h.laneChange.toX : undefined)),
          };
          const candidate = fresh.map((h) => obstacleFor(h.kind, h.x, h.z, speed, h.laneChange?.toX));
          const params = { reaction: PRESETS.standard.reaction, lateral: PRESETS.standard.lateral, laneChanges: true };
          assert.ok(placementIsFair(world, candidate, params), `${missionId}/${seed} at ${t.toFixed(2)}s`);
          checked += 1;
        }
        t += STEP;
      }
    }
  }
  assert.atLeast(checked, 40, 'enough placements were checked');
});

test('fairness: fallbacks to the safe pattern are rare', () => {
  let fallbacks = 0;
  let placements = 0;
  for (const missionId of ['m1-garage', 'm2-convoy', 'snapshot'] as MissionId[]) {
    for (const seed of SEEDS) {
      const played = playMission(missionId, { seed, skipTutorial: true });
      fallbacks += played.sim.state.fallbacks;
      placements += played.sim.state.hazards.length + played.events.filter((e) => e.type === 'pickup').length;
    }
  }
  assert.atMost(fallbacks, 12, `fallbacks ${fallbacks}`);
});

function hazard(id: number, kind: HazardKind, x: number, z: number): HazardEntity {
  const spec = HAZARDS[kind];
  return { id, kind, x, z, halfW: spec.halfW, len: spec.len, ownSpeed: spec.ownSpeed, thrown: spec.thrown, spent: false, clearedHero: false, clearedKiko: false, hp: 0, maxHp: 0, hurtT: 99, stun: 0, practice: false, knocked: -1, knockDir: 0, laneChange: null };
}

/** A convoy run with nothing placed by the director (so the test controls the road). */
function emptyConvoy(difficulty: Difficulty = 'standard', active: 'jepoy' | null = null): DrivingSim {
  const sim = new DrivingSim(simOptions('m2-convoy', { seed: 2, difficulty, loadout: loadout(active ?? 'navie', ['pip', 'mila']) }));
  (sim as unknown as { nextAt: number }).nextAt = Number.POSITIVE_INFINITY;
  return sim;
}

test('convoy: Kiko drives behind Navie, on the path Navie drove', () => {
  const sim = emptyConvoy();
  for (let i = 0; i < 120; i += 1) {
    sim.step(STEP, { axis: 0, targetX: -1, ability: false });
  }
  const kiko = sim.state.kiko!;
  assert.ok(Math.abs(kiko.z + KIKO_GAP) < 0.01, 'he keeps his gap behind');
  assert.ok(Math.abs(kiko.x - -1) < 0.05, 'and ends up on Navie\'s line');
  // He follows by distance: a moment after Navie starts across, he has not.
  const sim2 = emptyConvoy();
  for (let i = 0; i < 12; i += 1) {
    sim2.step(STEP, { axis: 0, targetX: 1, ability: false });
  }
  assert.ok(sim2.state.player.x > 0.3, 'Navie is moving across');
  assert.ok(Math.abs(sim2.state.kiko!.x) < 0.02, 'Kiko has not reached that stretch of road yet');
});

test('convoy: Kiko reproduces Navie\'s recorded trajectory, offset by the gap', () => {
  const sim = emptyConvoy();
  const path: { d: number; x: number }[] = [];
  let worst = 0;
  for (let i = 0; i < 60 * 12; i += 1) {
    // A gentle weave, well within his steering speed.
    const target = Math.sin(sim.state.time * 0.9) * 1.0;
    sim.step(STEP, { axis: 0, targetX: target, ability: false });
    path.push({ d: sim.state.distance, x: sim.state.player.x });
    const k = sim.state.kiko!;
    const at = sim.state.distance + k.z;
    if (at > 5) {
      const j = path.findIndex((p) => p.d >= at);
      worst = Math.max(worst, Math.abs(path[j].x - k.x));
    }
  }
  assert.atMost(worst, 0.12, `largest gap from Navie's path: ${worst.toFixed(3)}`);
});

test('convoy: a swerve sharper than Kiko can steer is flagged (strain) and called out once', () => {
  const sim = emptyConvoy();
  for (let i = 0; i < 60; i += 1) {
    sim.step(STEP, { axis: 0, targetX: 0, ability: false });
  }
  let maxStrain = 0;
  for (let i = 0; i < 120; i += 1) {
    sim.step(STEP, { axis: 0, targetX: Math.floor(i / 20) % 2 === 0 ? 1.18 : -1.18, ability: false });
    maxStrain = Math.max(maxStrain, sim.state.kiko!.strain);
  }
  assert.ok(maxStrain > 0.5, 'he falls off the line on hard swerves');
  assert.equal(sim.drainEvents().filter((e) => e.type === 'kikoStrain').length, 1);
});

test('convoy: Kiko shadows - static hazards stay put, traffic is met further ahead, lane changes sooner', () => {
  const speed = 17;
  const cone = obstacleFor('cone', 0, 40, speed);
  const [cs] = kikoShadows([cone], -KIKO_GAP, speed);
  assert.ok(Math.abs(cs.z - (cone.z - cone.approach * KIKO_LAG_MAX)) < 0.1, 'Kiko meets a cone where Navie did, a steering lag later: Navie must clear it that much earlier');
  const car = obstacleFor('car', 0, 40, speed, 1);
  const [ks] = kikoShadows([car], -KIKO_GAP, speed);
  const tau = KIKO_GAP / speed;
  assert.ok(Math.abs(ks.z - car.z - ((speed - car.approach) * tau - car.approach * KIKO_LAG_MAX)) < 0.2, 'traffic keeps driving while he catches up');
  assert.ok(ks.laneChange!.startT < car.laneChange!.startT - tau + 0.01, 'its lane change comes sooner for him');
});

test('convoy collisions: Kiko is hit a moment after Navie passes; one hit per hazard; protection is per car', () => {
  const sim = emptyConvoy('standard');
  for (let i = 0; i < 60; i += 1) {
    sim.step(STEP, { axis: 0, targetX: 0, ability: false });
  }
  // Navie is protected (just hit): the cone passes Navie, then reaches Kiko on the same line.
  sim.state.player.invulnerable = 5;
  sim.state.hazards.push(hazard(7001, 'cone', 0, 3));
  const navieHits: number[] = [];
  const kikoHits: number[] = [];
  for (let i = 0; i < 120; i += 1) {
    sim.step(STEP, { axis: 0, targetX: 0, ability: false });
    for (const e of sim.drainEvents()) {
      if (e.type === 'hit') {
        (e.who === 'hero' ? navieHits : kikoHits).push(sim.state.time);
      }
    }
  }
  assert.equal(navieHits.length, 0, 'Navie was protected');
  assert.equal(kikoHits.length, 1, 'Kiko was not, and is hit exactly once');
  assert.equal(sim.state.kiko!.engine, (PRESETS.standard.kikoEngine ?? 0) - 1);
  // A hazard that hits Navie is spent and cannot also hit Kiko.
  const sim2 = emptyConvoy('standard');
  sim2.state.hazards.push(hazard(7002, 'cone', 0, 3));
  for (let i = 0; i < 120; i += 1) {
    sim2.step(STEP, { axis: 0, targetX: 0, ability: false });
  }
  const hits2 = sim2.drainEvents().filter((e) => e.type === 'hit');
  assert.equal(hits2.length, 1);
  assert.equal(sim2.state.player.dents, 1);
  assert.equal(sim2.state.kiko!.engine, PRESETS.standard.kikoEngine);
});

test("convoy collisions: Kuya's Shield covers Kiko too", () => {
  const sim = emptyConvoy('standard', 'jepoy');
  for (let i = 0; i < 30; i += 1) {
    sim.step(STEP, { axis: 0, targetX: 0, ability: false });
  }
  sim.state.player.invulnerable = 5;
  sim.state.hazards.push(hazard(7003, 'barrier', 0, 2));
  sim.step(STEP, { axis: 0, targetX: 0, ability: true });
  for (let i = 0; i < 90; i += 1) {
    sim.step(STEP, { axis: 0, targetX: 0, ability: false });
  }
  assert.equal(sim.state.kiko!.engine, PRESETS.standard.kikoEngine, 'no engine lost');
  assert.equal(sim.state.shieldBlocks, 1);
});

test('convoy failure: the run fails when Kiko\'s engine runs out - except in Story', () => {
  for (const difficulty of ['standard', 'story'] as Difficulty[]) {
    const sim = emptyConvoy(difficulty);
    let z = 4;
    let id = 7100;
    for (let i = 0; i < 60 * 14 && sim.state.outcome === null; i += 1) {
      if (i % 120 === 0) {
        // Something only Kiko meets: Navie keeps protected.
        sim.state.player.invulnerable = 5;
        sim.state.hazards.push(hazard(id++, 'cone', 0, z));
      }
      sim.step(STEP, { axis: 0, targetX: 0, ability: false });
    }
    if (difficulty === 'story') {
      assert.ok(sim.state.outcome !== 'failure', 'Story never fails');
      assert.atLeast(sim.state.kiko!.engine, 1);
    } else {
      assert.equal(sim.state.outcome, 'failure');
      assert.equal(sim.state.ending!.reason, 'kiko');
    }
  }
});
test('convoy fairness: at the closest distance the check accepts, its assumed escape clears BOTH cars', () => {
  // Audit repro (24 Oct): a lone cone in Navie's lane, placed as close as the check allows; the
  // player does exactly what the check assumes (keeps going for the reaction time, then steers
  // across at the assumed speed). Neither car may be hit.
  for (const difficulty of ['relaxed', 'standard', 'expert'] as Difficulty[]) {
    for (const dir of [-1, 1]) {
      const sim = emptyConvoy(difficulty);
      for (let i = 0; i < 150; i += 1) {
        sim.step(STEP, { axis: 0, targetX: 0, ability: false });
      }
      const preset = PRESETS[difficulty];
      const params = { reaction: preset.reaction, lateral: preset.lateral, laneChanges: preset.laneChanges };
      const world = () => ({
        speed: sim.state.speed,
        player: { x: sim.state.player.x, vx: sim.state.player.vx },
        kiko: { x: sim.state.kiko!.x, vx: sim.state.kiko!.vx, z: sim.state.kiko!.z },
        obstacles: [],
      });
      let zMin = 0;
      for (let z = 6; z < 70; z += 0.25) {
        if (placementIsFair(world(), [obstacleFor('cone', 0, z, sim.state.speed)], params)) {
          zMin = z;
          break;
        }
      }
      assert.ok(zMin > 0, 'some distance is fair');
      sim.state.hazards.push(hazard(8000, 'cone', 0, zMin));
      const rate = Math.min(preset.lateral * 0.85, 2.3 * 0.85);
      let t = 0;
      let target = 0;
      for (let i = 0; i < 240; i += 1) {
        if (t >= preset.reaction) {
          target = Math.max(-1, Math.min(1, target + dir * rate * STEP));
        }
        sim.step(STEP, { axis: 0, targetX: target, ability: false });
        t += STEP;
      }
      const hits = sim.drainEvents().filter((e) => e.type === 'hit');
      assert.equal(hits.length, 0, `${difficulty} dir ${dir}: cone at ${zMin} hit ${hits.map((e) => (e as { who: string }).who).join(',')}`);
    }
  }
});

test('convoy: after the lay-by Kiko does not chase where Navie was while stopping', () => {
  // Audit repro: Navie stops in the left lane, then lines up in front of Kiko on the right.
  const sim = new DrivingSim(simOptions('m2-convoy', { seed: 4, difficulty: 'relaxed' }));
  const bot = createBot();
  while (sim.state.rescue === null && sim.state.outcome === null) {
    autoChoose(sim);
    sim.step(STEP, bot(sim, STEP));
  }
  let maxOff = 0;
  let resumed = false;
  for (let i = 0; i < 60 * 30 && sim.state.outcome === null; i += 1) {
    const r = sim.state.rescue;
    const k = sim.state.kiko!;
    const target = r !== null && r.phase === 'slowing' ? -1 : r !== null && r.phase !== 'resume' ? k.x : 1;
    sim.step(STEP, { axis: 0, targetX: target, ability: false });
    if (sim.state.rescue?.phase === 'resume') {
      resumed = true;
    }
    if (resumed) {
      maxOff = Math.max(maxOff, Math.abs(sim.state.kiko!.x - sim.state.player.x));
    }
    if (resumed && sim.state.rescue === null) {
      break;
    }
  }
  assert.ok(resumed, 'the jump-start happened');
  assert.atMost(maxOff, 0.25, `Kiko strayed ${maxOff.toFixed(2)} lanes from the line after the lay-by`);
});

test('convoy: on the last stretch Kiko picks a side and keeps it while Navie wobbles, never cutting across', () => {
  // Audit repros: Navie hovering near x = 0.2, or right on a lane line (+-0.5), made his target flip.
  for (const [seed, centre] of [[4, 0.2], [9, 0.5], [4, -0.5], [9, 0]] as [number, number][]) {
    const sim = new DrivingSim(simOptions('m2-convoy', { seed, difficulty: 'story' }));
    const bot = createBot();
    while (sim.state.mission.sections[sim.state.sectionIndex]?.kind !== 'arrive' && sim.state.outcome === null) {
      autoChoose(sim);
    sim.step(STEP, bot(sim, STEP));
    }
    let flips = 0;
    let last = sim.state.kiko!.targetX;
    let alongside = false;
    let overlap = 0;
    for (let i = 0; i < 60 * 12 && sim.state.outcome === null; i += 1) {
      sim.step(STEP, { axis: 0, targetX: centre + Math.sin(sim.state.time * 3) * 0.12, ability: false });
      const k = sim.state.kiko!;
      if (Math.abs(k.targetX - last) > 0.5) {
        flips += 1;
      }
      last = k.targetX;
      // Side by side and less than a car's width apart = drawn on top of each other.
      if (k.z > -2.6 && Math.abs(k.x - sim.state.player.x) < 0.6) {
        overlap += STEP;
      }
      if (sim.drainEvents().some((e) => e.type === 'kikoAlongside')) {
        alongside = true;
      }
    }
    assert.atMost(flips, 1, `seed ${seed} around ${centre}: target flipped ${flips} times`);
    assert.ok(alongside, `seed ${seed} around ${centre}: he came alongside`);
    assert.atMost(overlap, 0.05, `seed ${seed} around ${centre}: overlapped Navie for ${overlap.toFixed(2)} s`);
  }
});

test('convoy: the lay-by is protected - traffic coming up behind the parked cars cannot hit them', () => {
  // Audit repro: traffic the convoy had passed drove back up and rear-ended parked Kiko.
  const sim = new DrivingSim(simOptions('m2-convoy', { seed: 4, difficulty: 'standard' }));
  const bot = createBot();
  while ((sim.state.rescue === null || sim.state.rescue.phase !== 'align') && sim.state.outcome === null) {
    autoChoose(sim);
    sim.step(STEP, bot(sim, STEP));
  }
  sim.state.kiko!.engine = 1;
  const k = sim.state.kiko!;
  sim.state.hazards.push({ ...hazard(9100, 'car', 1, k.z - 4), ownSpeed: HAZARDS.car.ownSpeed });
  while (sim.state.rescue !== null && sim.state.outcome === null) {
    autoChoose(sim);
    sim.step(STEP, bot(sim, STEP));
  }
  const hits = sim.drainEvents().filter((e) => e.type === 'hit');
  assert.equal(hits.length, 0, 'nothing hits the convoy in the lay-by');
  assert.ok(sim.state.outcome === null, 'the run goes on');
});

test('convoy: the rescue lay-by needs steady alignment, never mashing, and restores Kiko', () => {
  const played = playMission('m2-convoy', { seed: 4, difficulty: 'relaxed' });
  const phases = played.events.filter((e) => e.type === 'rescue').map((e) => (e as { phase: string }).phase);
  assert.deepEqual(phases, ['slowing', 'align', 'push', 'resume']);
  assert.equal(played.outcome, 'success');
});

test('convoy: in the lay-by Kiko parks close behind; on the last stretch he pulls up alongside', () => {
  const sim = new DrivingSim(simOptions('m2-convoy', { seed: 4, difficulty: 'relaxed' }));
  const bot = createBot();
  let parkedGap = 0;
  let alongside = false;
  while (sim.state.outcome === null && sim.state.time < 400) {
    autoChoose(sim);
    sim.step(STEP, bot(sim, STEP));
    if (sim.state.rescue?.phase === 'push') {
      parkedGap = -sim.state.kiko!.z;
    }
    for (const e of sim.drainEvents()) {
      if (e.type === 'kikoAlongside') {
        alongside = true;
        assert.ok(Math.abs(sim.state.kiko!.x - sim.state.player.x) > 0.6, 'one lane over, not on top of Navie');
      }
    }
  }
  assert.ok(Math.abs(parkedGap - KIKO_RESCUE_GAP) < 0.3, `parked ${parkedGap.toFixed(2)} behind`);
  assert.ok(alongside, 'arrived side by side');
  assert.equal(sim.state.outcome, 'success');
});

test('finale: three phases in order, Team Honk ends it, combat only touches the machine', () => {
  const played = playMission('m3-finale', { seed: 6 });
  assert.equal(played.outcome, 'success');
  const stages = played.events.filter((e) => e.type === 'bossStage').map((e) => `${(e as { phase: number }).phase}:${(e as { stage: string }).stage}`);
  assert.deepEqual(stages.slice(0, 6), ['1:intro', '1:fight', '2:break', '2:fight', '3:break', '3:fight']);
  assert.ok(stages.includes('3:honk') && stages.includes('3:down'));
  assert.ok(played.sim.state.teamHonk);
  assert.ok(played.events.some((e) => e.type === 'gearHit'));
});

/** A quiet Mission 1 road (nothing placed), so a test controls what comes. */
function quietRoad(hero: HeroId = 'navie', sidekicks: [SidekickId | null, SidekickId | null] = [null, null], difficulty: Difficulty = 'standard', evolved: Partial<Record<SidekickId, boolean>> = {}): DrivingSim {
  const sim = new DrivingSim(simOptions('m1-garage', { skipTutorial: true, difficulty, loadout: loadout(hero, sidekicks, evolved) }));
  (sim as unknown as { nextAt: number }).nextAt = Number.POSITIVE_INFINITY;
  return sim;
}

function bot(id: number, kind: FoeKind, x: number, z: number): HazardEntity {
  const spec = FOES[kind];
  return { id, kind, x, z, halfW: spec.halfW, len: spec.len, ownSpeed: spec.ownSpeed, thrown: 0, spent: false, clearedHero: false, clearedKiko: false, hp: spec.hp, maxHp: spec.hp, hurtT: 99, stun: 0, practice: false, knocked: -1, knockDir: 0, laneChange: null };
}

const drive = (sim: DrivingSim, seconds: number, targetX: number | null = 0, ability = false): SimEvent[] => {
  const events: SimEvent[] = [];
  for (let i = 0; i < seconds * 60; i += 1) {
    sim.step(STEP, { axis: 0, targetX, ability: ability && i === 0 });
    events.push(...sim.drainEvents());
  }
  return events;
};

test("heroes: Kuya's Shield blocks a hit; Route Sense slows the road; Gear Scan doubles damage", () => {
  const jepoy = quietRoad('jepoy');
  jepoy.step(STEP, { axis: 0, targetX: 0, ability: true });
  jepoy.state.hazards.push(hazard(5000, 'barrier', 0, 3));
  drive(jepoy, 0.7);
  assert.equal(jepoy.state.player.dents, 0);
  assert.equal(jepoy.state.shieldBlocks, 1);

  // Route Sense: the same second of driving covers less road.
  const plain = quietRoad('navie');
  const sensed = quietRoad('navie');
  drive(plain, 1);
  drive(sensed, 1, 0, true);
  assert.ok(sensed.state.distance < plain.state.distance * 0.75, `${sensed.state.distance.toFixed(1)} vs ${plain.state.distance.toFixed(1)}`);
  assert.ok(sensed.state.routeHint !== null, 'the arrow shows a lane');

  // Gear Scan: a drum-bot (3 hp) falls to Kiko's pulses faster with the scan on.
  const timeToZap = (scan: boolean): number => {
    const sim = quietRoad('kiko');
    sim.state.hazards.push(bot(6000, 'drumbot', 0, 40));
    let t = 0;
    for (let i = 0; i < 300 && sim.state.foesDefeated === 0; i += 1) {
      sim.step(STEP, { axis: 0, targetX: 0, ability: scan && i === 0 });
      t += STEP;
    }
    return t;
  };
  assert.ok(timeToZap(true) < timeToZap(false));
});

test('heroes: each hero handles differently but every one finishes Mission 1 with starter sidekicks', () => {
  const lateral = (hero: HeroId): number => {
    const sim = quietRoad(hero);
    drive(sim, 0.25, 1.18);
    return sim.state.player.x;
  };
  assert.ok(lateral('kiko') > lateral('navie') && lateral('navie') > lateral('jepoy'), 'Kiko nimble, Jepoy heavy');
  for (const hero of ['navie', 'jepoy', 'kiko'] as HeroId[]) {
    for (const seed of [1, 2, 3]) {
      const played = playMission('m1-garage', { seed, skipTutorial: true, loadout: loadout(hero, ['pip', 'mila']) });
      assert.equal(played.outcome, 'success', `${hero} seed ${seed}`);
    }
  }
});

test('pulses: the horn zaps bots (Bolts drop) and never touches traffic', () => {
  const sim = quietRoad('navie');
  sim.state.hazards.push(bot(7000, 'conebot', 0, 30));
  sim.state.hazards.push({ ...hazard(7001, 'car', 1, 30) });
  const events = drive(sim, 2.2, 0);
  assert.ok(events.some((e) => e.type === 'foeDown'), 'the bot was zapped');
  assert.equal(sim.state.foesDefeated, 1);
  const car = sim.state.hazards.find((h) => h.id === 7001);
  assert.ok(car === undefined || (!car.spent && car.hp === 0), 'the car is untouched');
  assert.ok(sim.state.pickups.some((p) => p.kind === 'bolt'), 'the bot dropped a Bolt');
});

test('sidekicks: Pip darts, Bumbo chains, Mila pulls, Kumpuni repairs (capped), Bantay guards once, Silip jams', () => {
  // Pip: hits a bot in another lane by itself.
  const pip = quietRoad('navie', ['pip', null]);
  pip.state.hazards.push(bot(8000, 'conebot', -1, 25));
  const pipEvents = drive(pip, 2, 1);
  assert.ok(pipEvents.some((e) => e.type === 'foeDown' && e.by === 'pip'), 'Pip zapped the bot in the other lane');

  // Bumbo: one zap reaches two bots in different lanes.
  const bumbo = quietRoad('navie', ['bumbo', null]);
  bumbo.state.hazards.push(bot(8100, 'conebot', -1, 20), bot(8101, 'conebot', 1, 22));
  const bumboEvents = drive(bumbo, 0.9, 0);
  assert.ok(bumboEvents.some((e) => e.type === 'sidekick' && e.action === 'chain'));
  assert.equal(bumbo.state.foesDefeated, 2);

  // Mila: a Bolt one lane over is pulled in.
  const mila = quietRoad('navie', ['mila', null]);
  mila.state.pickups.push({ id: 8200, kind: 'bolt', power: null, x: 0.9, z: 6, collected: false, collectedT: -1 });
  drive(mila, 0.8, 0);
  assert.equal(mila.state.boltsCollected, 1);
  const none = quietRoad('navie', [null, null]);
  none.state.pickups.push({ id: 8201, kind: 'bolt', power: null, x: 0.9, z: 6, collected: false, collectedT: -1 });
  drive(none, 0.8, 0);
  assert.equal(none.state.boltsCollected, 0, 'without Mila it stays put');

  // Kumpuni: fixes one dent, then is out of uses for the run.
  const kumpuni = quietRoad('navie', ['kumpuni', null]);
  kumpuni.state.player.dents = 2;
  drive(kumpuni, 3, 0);
  assert.equal(kumpuni.state.player.dents, 1, 'one repair');
  drive(kumpuni, 40, 0);
  assert.equal(kumpuni.state.player.dents, 1, 'one use per run (unevolved)');

  // Bantay: blocks the first hit, the second dents (its charge is gone).
  const bantay = quietRoad('navie', ['bantay', null]);
  bantay.state.hazards.push(hazard(8300, 'barrier', 0, 4), hazard(8301, 'barrier', 0, 25));
  drive(bantay, 2.5, 0);
  assert.equal(bantay.state.shieldBlocks, 1);
  assert.equal(bantay.state.player.dents, 1);

  // Silip: jams a lane-changing bot so it holds still.
  const silip = quietRoad('navie', ['silip', null]);
  const signbot = bot(8400, 'signbot', -1, 30);
  signbot.laneChange = { fromX: -1, toX: 0, signalAt: null, moveAt: null, done: false };
  silip.state.hazards.push(signbot);
  const silipEvents = drive(silip, 1, 1);
  assert.ok(silipEvents.some((e) => e.type === 'sidekick' && e.action === 'jam'));
});

test('caps: protection never stacks past 6 s; non-wrench repairs stop at 3 per run', () => {
  const sim = quietRoad('jepoy', ['kumpuni', 'bantay'], 'standard', { kumpuni: true });
  sim.step(STEP, { axis: 0, targetX: 0, ability: true });
  (sim as unknown as { grantPower: (k: string) => void }).grantPower('bubble');
  (sim as unknown as { grantPower: (k: string) => void }).grantPower('bubble');
  assert.atMost(sim.state.player.shield, 6);
  const fixer = quietRoad('navie', ['kumpuni', null], 'standard', { kumpuni: true });
  fixer.state.repairsUsed = 2;
  fixer.state.player.dents = 3;
  drive(fixer, 80, 0);
  assert.equal(fixer.state.repairsUsed, 3, 'stopped at the cap');
});

test('power-ups: capsules rotate predictably, show at once, and expire', () => {
  const sim = quietRoad('navie');
  sim.state.pickups.push({ id: 9000, kind: 'powerup', power: 'spread', x: 0, z: 3, collected: false, collectedT: -1 });
  const events = drive(sim, 0.5, 0);
  assert.ok(events.some((e) => e.type === 'power' && e.kind === 'spread'));
  assert.ok(sim.state.powers.spread !== undefined);
  // Three pulses side by side while Spread Horn lasts.
  const lanes = new Set(sim.state.pulses.filter((p) => p.from === 'hero').map((p) => Math.round(p.x)));
  assert.ok(lanes.size >= 2, 'pulses fan out');
  drive(sim, 9, 0);
  assert.ok(sim.state.powers.spread === undefined, 'expired');
});

test('checkpoints: the game freezes on three different choices, then resumes on an empty road', () => {
  const sim = new DrivingSim(simOptions('m1-garage', { skipTutorial: true, seed: 4 }));
  const bot2 = createBot();
  while (sim.state.choice === null && sim.state.outcome === null && sim.state.time < 200) {
    sim.step(STEP, bot2(sim, STEP));
  }
  const choice = sim.state.choice!;
  assert.ok(choice !== null, 'a checkpoint opened');
  assert.equal(new Set(choice.options).size, 3);
  const frozenAt = sim.state.time;
  sim.step(STEP, bot2(sim, STEP));
  assert.equal(sim.state.time, frozenAt, 'frozen while choosing');
  const ahead = sim.state.hazards.filter((h) => !h.spent && h.z > 0);
  assert.equal(ahead.length, 0, 'nothing on the road ahead of a checkpoint');
  sim.choose(choice.options[0]);
  assert.deepEqual(sim.state.runUpgrades, [choice.options[0]]);
  sim.step(STEP, bot2(sim, STEP));
  assert.ok(sim.state.time > frozenAt, 'running again');
});

test('goals: a short goal counts progress and pays when done', () => {
  const sim = quietRoad('navie');
  assert.ok(sim.state.goal !== null && sim.state.goal.kind === 'bolts');
  for (let i = 0; i < 15; i += 1) {
    sim.state.pickups.push({ id: 9100 + i, kind: 'bolt', power: null, x: 0, z: 3 + i * 1.2, collected: false, collectedT: -1 });
  }
  const events = drive(sim, 3, 0);
  assert.ok(events.some((e) => e.type === 'goalDone'));
  assert.equal(sim.state.goalsDone, 1);
});

test('endless: the road keeps going in cycles and can be banked at a checkpoint', () => {
  const played = playMission('endless', { seed: 3, difficulty: 'relaxed', bank: true, maxSeconds: 200 });
  assert.equal(played.outcome, 'success');
  assert.ok(played.sim.state.route >= 690, `banked at ${played.sim.state.route.toFixed(0)} m`);
  const long = playMission('endless', { seed: 3, difficulty: 'relaxed', maxSeconds: 160 });
  assert.ok(long.sim.state.mission.sections.length > 2, 'cycles were added');
  assert.ok(long.sim.state.route > 1400, `drove ${long.sim.state.route.toFixed(0)} m`);
});

test('tutorial: steps run in order and practice cones never dent', () => {
  const played = playMission('m1-garage', { seed: 9, difficulty: 'standard' });
  const steps = played.events.filter((e) => e.type === 'tutorialStep').map((e) => (e as { step: string }).step);
  assert.deepEqual(steps, ['steer', 'bolts', 'cones', 'pulse', 'wrench', 'go']);
  const tutorialEnd = played.events.findIndex((e) => e.type === 'section' && (e as { index: number }).index === 1);
  const hitsInTutorial = played.events.slice(0, tutorialEnd).filter((e) => e.type === 'hit');
  assert.equal(hitsInTutorial.length, 0);
});

test('fairness: checkpoints and a charged Team Honk leave nothing on the road that can still hit', () => {
  const live = (sim: DrivingSim): number => sim.state.hazards.filter((h) => !h.spent && h.z + h.len > PLAYER_BACK).length;
  for (const missionId of ['m1-garage', 'snapshot', 'm3-finale'] as MissionId[]) {
    for (const seed of [1, 2, 3, 4]) {
      const sim = new DrivingSim(simOptions(missionId, { seed, skipTutorial: true, loadout: loadout('navie', [null, null]) }));
      const bot = createBot({ useAbility: false });
      let honkChecked = false;
      for (let i = 0; i < 400 / STEP && sim.state.outcome === null; i += 1) {
        if (sim.state.choice !== null) {
          assert.equal(live(sim), 0, `${missionId} seed ${seed}: checkpoint opened with hazards on the road`);
          autoChoose(sim);
        }
        if (!honkChecked && sim.state.boss?.stage === 'honkReady') {
          honkChecked = true;
          assert.equal(live(sim), 0, `${missionId} seed ${seed}: throws left on the road at Team Honk`);
        }
        sim.step(STEP, bot(sim, STEP));
      }
      if (missionId === 'm3-finale') {
        assert.equal(sim.state.outcome, 'success', `finale seed ${seed} ends in a win once Team Honk is charged`);
      }
    }
  }
});
