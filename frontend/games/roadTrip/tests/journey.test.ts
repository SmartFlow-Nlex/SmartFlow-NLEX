import { readFileSync } from 'fs';
import { join } from 'path';
import { STEP } from '../core/config';
import { BANTER, RADIO, RadioDirector, SCENES } from '../core/dialogue';
import { JOURNEY_EXITS, MISSIONS } from '../core/missions';
import { LEVEL_PLAN, levelOf, levelPlan, levelsPerStretch } from '../core/levels';
import { HERO_DEFS } from '../core/roster';
import { barrierOpen, commitRun, equipSidekick, heroFor, isUnlocked, journeyComplete, recommendedMission, selectHero } from '../core/progression';
import { SIDEKICK_DEFS, heroBlockedFor } from '../core/roster';
import { defaultSave, loadSave, serializeSave } from '../core/save';
import { DrivingSim, type HazardEntity, type SimEvent } from '../core/sim';
import { JOURNEY, SIDEKICKS, emptyTally, type HeroId, type MissionId, type RunResult, type SaveData, type SidekickId } from '../core/types';
import { assert, test } from './harness';
import { loadout, playMission, simOptions } from './play';

const run = (missionId: MissionId, runId: string): RunResult => ({
  runId,
  missionId,
  seed: 7,
  difficulty: 'standard',
  outcome: 'success',
  hero: 'navie',
  sidekicks: ['pip', 'mila'],
  tally: emptyTally(),
  boltsCollected: 12,
  foesDefeated: 0,
  goalsDone: 0,
  distance: 0,
  dents: 0,
  maxDents: 3,
  shieldBlocks: 0,
  repairsUsed: 0,
  kikoEngineLeft: MISSIONS[missionId].kind === 'convoy' ? 3 : null,
  kikoEngineMax: MISSIONS[missionId].kind === 'convoy' ? 3 : null,
  teamHonk: MISSIONS[missionId].kind === 'finale',
  postcardFound: false,
  durationS: 70,
});

/** A save that has finished the road up to (not including) the given mission. */
function playedUpTo(stop: MissionId | null): SaveData {
  let save = defaultSave();
  for (const id of JOURNEY) {
    if (id === stop) {
      break;
    }
    save = commitRun(save, run(id, `run-${id}`)).save;
  }
  return save;
}

test('journey: every canonical NLEX exit is on the map, south to north, in the real order', () => {
  const source = readFileSync(join(process.cwd(), 'frontend/constants/nlexSegments.ts'), 'utf8');
  const list = source.slice(source.indexOf('nlexExitPoints'));
  const canonical = [...list.matchAll(/\{ id: '([^']+)', name: '([^']+)', city: '[^']+', km: (\d+)/g)].map((m) => [m[1], m[2], Number(m[3])]);
  assert.equal(canonical.length, 20, 'the canonical list was read');
  assert.deepEqual(JOURNEY_EXITS.map((e) => [e.id, e.name, e.km]), canonical.reverse(), 'names, order and real distances');
});

test('journey: a hundred levels, at least two between every pair of exits, more where the road is longer', () => {
  assert.equal(JOURNEY.length, 100);
  assert.equal(new Set(JOURNEY).size, 100, 'no level twice');
  const counts = levelsPerStretch();
  assert.equal(counts.length, JOURNEY_EXITS.length - 1, 'one count per stretch between exits');
  assert.ok(counts.every((n) => n >= 2), `every stretch has at least two: ${counts.join(' ')}`);
  const km = JOURNEY_EXITS.slice(1).map((e, i) => e.km - JOURNEY_EXITS[i].km);
  for (let i = 0; i < counts.length; i += 1) {
    for (let j = 0; j < counts.length; j += 1) {
      if (km[i] > km[j] + 2) {
        assert.ok(counts[i] >= counts[j], `a longer stretch never has fewer levels (${JOURNEY_EXITS[i + 1].name} ${km[i]} km)`);
      }
    }
  }
});

test('journey: every exit is reached by its own level, and every level is between two real exits', () => {
  for (const exit of JOURNEY_EXITS) {
    if (exit.id === 'balintawak') {
      assert.equal(exit.level, null, 'the road starts at the garage');
      continue;
    }
    const id = JOURNEY[exit.level! - 1];
    assert.equal(MISSIONS[id].to, exit.name, `Level ${exit.level} reaches ${exit.name}`);
    assert.ok(levelPlan(id)!.reachesExit);
    // Its exit sign is on the road.
    assert.ok(MISSIONS[id].kind === 'finale' || MISSIONS[id].gantries.some((g) => g.title === exit.name && g.sub === 'Exit'), `${exit.name} is signed on Level ${exit.level}`);
  }
  const names = new Set(JOURNEY_EXITS.map((e) => e.name));
  for (const p of LEVEL_PLAN) {
    assert.ok(names.has(p.from) && names.has(p.to), `Level ${p.level}: ${p.from} to ${p.to}`);
    assert.ok(p.kmLeft >= 0 && (p.kmLeft === 0) === p.reachesExit, `Level ${p.level}: ${p.kmLeft} km left`);
  }
});

test('journey: the story missions keep their places: the tutorial first, every other one reaching its exit', () => {
  assert.equal(JOURNEY[0], 'm1-garage');
  const story = ['m2-convoy', 'm3-finale', 'bocaue-interchange', 'tambubong', 'tabang', 'balagtas', 'sta-rita', 'pulilan', 'san-simon', 'san-fernando', 'mexico', 'angeles', 'dau', 'sctex', 'sta-ines'] as MissionId[];
  let last = 1;
  for (const id of story) {
    const level = levelOf(id);
    assert.ok(level > last, `${id} comes after the one before`);
    assert.ok(levelPlan(id)!.reachesExit, `${id} reaches its exit`);
    last = level;
  }
  assert.equal(levelOf('sta-ines'), 100, 'the last boss is the last level');
  // Kuya Jepoy is met at Meycauayan, where his scene is set.
  const meycauayan = JOURNEY_EXITS.find((e) => e.id === 'meycauayan')!.level!;
  assert.equal(MISSIONS[JOURNEY[meycauayan - 1]].scenes.after, 'meet-jepoy');
  assert.equal(HERO_DEFS.jepoy.unlock.level, meycauayan);
});

test('journey: missions run in a line, numbered in order, each needing the one before', () => {
  JOURNEY.forEach((id, i) => {
    assert.equal(MISSIONS[id].number, i + 1, id);
    assert.equal(MISSIONS[id].requires, i === 0 ? null : JOURNEY[i - 1], id);
  });
});

test('journey: the same road leads somewhere new at every stop until Sta. Ines', () => {
  let save = defaultSave();
  JOURNEY.forEach((id, i) => {
    assert.equal(recommendedMission(save), id);
    assert.ok(isUnlocked(save, id));
    if (i + 1 < JOURNEY.length) {
      assert.ok(!isUnlocked(save, JOURNEY[i + 1]), `${JOURNEY[i + 1]} waits for ${id}`);
    }
    save = commitRun(save, run(id, `run-${id}`)).save;
  });
  assert.equal(recommendedMission(save), null);
  assert.ok(journeyComplete(save));
});

test('endless: Story difficulty allows five dents, as its briefing says', () => {
  const sim = new DrivingSim(simOptions('endless', { difficulty: 'story', loadout: loadout('navie', [null, null]) }));
  assert.equal(sim.state.player.maxDents, 5);
  assert.ok(MISSIONS.endless.fail.includes('5'));
});

test('sidekicks: the ones the story meets each join at their own stop, and no earlier', () => {
  assert.equal(SIDEKICKS.length, 33);
  const joinAt: Partial<Record<SidekickId, MissionId>> = { walis: 'tambubong', barya: 'balagtas', sibat: 'pulilan', tala: 'san-fernando', ilaw: 'angeles', maso: 'dau' };
  for (const [id, stop] of Object.entries(joinAt) as [SidekickId, MissionId][]) {
    assert.equal(SIDEKICK_DEFS[id].unlock.level, levelOf(stop), id);
    const before = playedUpTo(stop);
    assert.equal(before.sidekicks[id], undefined, `${id} is not here before ${stop}`);
    const outcome = commitRun(before, run(stop, 'join'));
    assert.ok(outcome.save.sidekicks[id] !== undefined, `${id} joined at ${stop}`);
    assert.ok(outcome.payout.unlocks.includes(`Sidekick joined: ${SIDEKICK_DEFS[id].name}`), `${stop} announces ${id}: ${outcome.payout.unlocks.join(', ')}`);
  }
  const all = playedUpTo(null);
  assert.equal(Object.keys(all.sidekicks).length, SIDEKICKS.length, 'the whole road brings every sidekick');
  assert.equal(all.heroes.length, Object.keys(HERO_DEFS).length, 'and every hero');
});

test('sidekicks: the new ones can be equipped, and each has its own name, role and evolved form', () => {
  const save = playedUpTo(null);
  for (const id of ['walis', 'barya', 'sibat', 'tala', 'ilaw', 'maso'] as SidekickId[]) {
    assert.equal(equipSidekick(save, 0, id).loadout.sidekicks[0], id);
    const def = SIDEKICK_DEFS[id];
    assert.ok(def.name.length > 0 && def.evolvedName !== def.name, `${id} evolves into something`);
  }
  assert.equal(new Set(SIDEKICKS.map((id) => SIDEKICK_DEFS[id].role)).size, SIDEKICKS.length, 'no two do the same job');
});

test('saves: an old save that stopped at the Barrier keeps everything and carries on north', () => {
  const old = playedUpTo('bocaue-interchange');
  const loaded = loadSave(JSON.parse(serializeSave(old)));
  assert.ok(barrierOpen(loaded.save));
  assert.deepEqual(loaded.save.missions, old.missions);
  assert.equal(loaded.save.bolts, old.bolts);
  assert.equal(recommendedMission(loaded.save), 'bocaue-interchange');
  assert.ok(isUnlocked(loaded.save, 'bocaue-interchange'));
});

test('saves: a sidekick missing from a damaged save returns once its stop is finished', () => {
  const save = playedUpTo('mexico');
  const raw = JSON.parse(serializeSave(save)) as { sidekicks: Record<string, unknown> };
  delete raw.sidekicks.walis;
  delete raw.sidekicks.tala;
  const loaded = loadSave(raw).save;
  assert.ok(loaded.sidekicks.walis !== undefined && loaded.sidekicks.tala !== undefined);
  assert.equal(loaded.sidekicks.maso, undefined, 'and one from further on does not');
});

test('story: nothing the player reads says "chapter" any more', () => {
  const text = JSON.stringify([MISSIONS, SCENES, BANTER, RADIO, SIDEKICK_DEFS]);
  assert.ok(!/chapter/i.test(text), text.match(/.{40}chapter.{40}/i)?.[0] ?? '');
});

test('story: every scene and postcard a mission names exists, and every new stop has its own opening line', () => {
  const postcards = new Set<string>();
  for (const id of JOURNEY) {
    const def = MISSIONS[id];
    for (const scene of [def.scenes.before, def.scenes.after]) {
      assert.ok(scene === null || SCENES[scene] !== undefined, `${id}: scene ${scene}`);
    }
    if (def.postcard !== null) {
      assert.ok(!postcards.has(def.postcard.id), `${def.postcard.id} is used twice`);
      postcards.add(def.postcard.id);
    }
    const plan = levelPlan(id)!;
    if (def.kind === 'journey' && plan.story !== null && id !== 'm1-garage') {
      assert.ok(RADIO[`start-${id}`] !== undefined, `${id} starts with something to say`);
    }
    if (plan.story === null) {
      assert.ok(RADIO[`start-mix-${plan.mix}`] !== undefined, `Level ${plan.level} starts with something to say`);
    }
  }
});

test('story: each boss speaks for itself on the radio', () => {
  for (const [machine, boss] of [['barrikada', 'm3-finale'], ['prinsipe', 'san-fernando'], ['reyna', 'sta-ines']] as const) {
    assert.equal(MISSIONS[boss].machine, machine);
    const radio = new RadioDirector();
    radio.machine = machine;
    radio.trigger('boss-p2');
    radio.update(0.1, 0);
    assert.equal(radio.current?.speaker, machine, boss);
  }
});

test('heroes: Kiko is only kept out of the convoys that escort him', () => {
  for (const id of JOURNEY) {
    const blocked = heroBlockedFor('kiko', id) !== null;
    assert.equal(blocked, MISSIONS[id].kind === 'convoy', id);
  }
  const save = selectHero(playedUpTo('m3-finale'), 'kiko' as HeroId);
  assert.equal(heroFor(save, 'sta-rita'), 'navie');
  assert.equal(heroFor(save, 'pulilan'), 'kiko');
});

const quiet = (sidekicks: [SidekickId | null, SidekickId | null], evolved: Partial<Record<SidekickId, boolean>> = {}): DrivingSim => {
  const sim = new DrivingSim(simOptions('m1-garage', { skipTutorial: true, loadout: loadout('navie', sidekicks, evolved) }));
  (sim as unknown as { nextAt: number }).nextAt = Number.POSITIVE_INFINITY;
  return sim;
};

const drive = (sim: DrivingSim, seconds: number, targetX = 0): SimEvent[] => {
  const events: SimEvent[] = [];
  for (let i = 0; i < seconds * 60; i += 1) {
    sim.step(STEP, { axis: 0, targetX, ability: false });
    events.push(...sim.drainEvents());
  }
  return events;
};

const place = (sim: DrivingSim, id: number, kind: HazardEntity['kind'], x: number, z: number, hp = 0): void => {
  sim.state.hazards.push({ id, kind, x, z, halfW: 0.3, len: 0.5, ownSpeed: 0, thrown: 0, spent: false, clearedHero: false, clearedKiko: false, hp, maxHp: hp, hurtT: 99, stun: 0, slowT: 0, marked: 0, counted: false, practice: false, knocked: -1, knockDir: 0, laneChange: null });
};

const acted = (events: SimEvent[], action: string): boolean => events.some((e) => e.type === 'sidekick' && e.action === action);

test('sidekicks: Walis sweeps a cone out of the lane, and only roadworks', () => {
  const sim = quiet(['walis', null]);
  sim.state.sidekicks[0].cooldown = 0;
  place(sim, 9000, 'cone', 0, 9);
  const events = drive(sim, 1.2);
  assert.ok(acted(events, 'sweep'));
  assert.equal(sim.state.player.dents, 0, 'never reached the car');

  const traffic = quiet(['walis', null]);
  place(traffic, 9001, 'car', 0, 9);
  traffic.state.sidekicks[0].cooldown = 0;
  assert.ok(!acted(drive(traffic, 0.2), 'sweep'), 'traffic is left alone');
});

test('sidekicks: Barya turns some Bolts into two', () => {
  const collect = (sidekicks: [SidekickId | null, SidekickId | null]): number => {
    const sim = quiet(sidekicks);
    for (let i = 0; i < 60; i += 1) {
      sim.state.pickups.push({ id: 9100 + i, kind: 'bolt', power: null, x: 0, z: 4 + i * 1.5, collected: false, collectedT: -1, hidden: false, revealed: false, passed: false } as never);
    }
    drive(sim, 8);
    return sim.state.boltsCollected;
  };
  const plain = collect([null, null]);
  assert.atLeast(plain, 40, 'the road reached the car');
  assert.atLeast(collect(['barya', null]), plain * 1.1);
});

test('sidekicks: Sibat strikes everything in a lane at once', () => {
  const sim = quiet(['sibat', null]);
  place(sim, 9200, 'conebot', -1, 22, 1);
  place(sim, 9201, 'conebot', -1, 30, 1);
  place(sim, 9202, 'conebot', 1, 25, 1);
  const events = drive(sim, 0.8, 0);
  assert.ok(acted(events, 'pierce'));
  assert.equal(sim.state.foesDefeated, 2, 'both in the busy lane, not the third');
});

test('sidekicks: Tala recharges the hero signature faster', () => {
  const after = (sidekicks: [SidekickId | null, SidekickId | null]): number => {
    const sim = quiet(sidekicks);
    sim.state.player.cooldown = 20;
    drive(sim, 4);
    return sim.state.player.cooldown;
  };
  assert.ok(after(['tala', null]) < after([null, null]));
});

test('sidekicks: Ilaw holds the road back before a hit, then has to rest', () => {
  const sim = quiet(['ilaw', null]);
  sim.state.sidekicks[0].cooldown = 0;
  place(sim, 9300, 'cone', 0, 6);
  const events = drive(sim, 0.2);
  assert.ok(acted(events, 'slow'));
  assert.ok(sim.state.slowmo > 0);

  const clear = quiet(['ilaw', null]);
  clear.state.sidekicks[0].cooldown = 0;
  place(clear, 9301, 'cone', 1, 6);
  assert.ok(!acted(drive(clear, 0.2, -1), 'slow'), 'nothing in the way, nothing to do');
});

test('sidekicks: Maso swings at the toughest bot in reach', () => {
  const sim = quiet(['maso', null]);
  place(sim, 9400, 'conebot', 0, 12, 1);
  place(sim, 9401, 'drumbot', 1, 16, 3);
  const events = drive(sim, 0.7, 0);
  assert.ok(acted(events, 'slam'));
  const drum = sim.state.hazards.find((h) => h.id === 9401);
  assert.ok(drum === undefined || drum.spent || drum.hp <= 0, 'one swing was enough for the drum');
});

test('sidekicks: every new sidekick finishes a mission, and a boss, on the autopilot', () => {
  for (const id of ['walis', 'barya', 'sibat', 'tala', 'ilaw', 'maso'] as SidekickId[]) {
    for (const mission of ['pulilan', 'san-fernando', 'angeles'] as MissionId[]) {
      const played = playMission(mission, { seed: 5, loadout: loadout('navie', [id, 'mila'], { [id]: true }) });
      assert.equal(played.outcome, 'success', `${id} on ${mission}`);
    }
  }
});

test('bosses: the fights at San Fernando and Sta. Ines can be won with starter equipment', () => {
  for (const boss of ['san-fernando', 'sta-ines'] as MissionId[]) {
    for (const seed of [1, 2, 3, 4]) {
      assert.equal(playMission(boss, { seed }).outcome, 'success', `${boss} seed ${seed}`);
    }
  }
});
