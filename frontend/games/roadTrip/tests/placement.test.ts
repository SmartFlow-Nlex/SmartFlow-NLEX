import { createBot } from '../core/bot';
import { ROAD_HALF, STEP } from '../core/config';
import { MISSIONS } from '../core/missions';
import { equipSidekick, selectHero } from '../core/progression';
import { defaultSave, loadSave, serializeSave } from '../core/save';
import { DrivingSim } from '../core/sim';
import { HEROES, JOURNEY, SIDEKICKS, type SaveData } from '../core/types';
import { assert, test } from './harness';
import { loadout, simOptions } from './play';

/** Everyone unlocked, for checking that each of them can be equipped. */
function fullSave(): SaveData {
  const save = defaultSave();
  return {
    ...save,
    heroes: [...HEROES],
    sidekicks: Object.fromEntries(SIDEKICKS.map((id) => [id, { xp: 0, evolved: false }])) as SaveData['sidekicks'],
  };
}

/** Moves a run along its route (the route is worked out from the distance driven). */
function jumpTo(sim: DrivingSim, route: number): void {
  sim.state.distance += route - sim.state.route;
}

/** The renderer places these by lane, so an entity past the road's edge really is drawn off the road. */
function driveAndWatch(missionId: (typeof JOURNEY)[number], seed: number, seconds: number, watch: (sim: DrivingSim) => void): void {
  const sim = new DrivingSim(simOptions(missionId, { seed, skipTutorial: true }));
  const drive = createBot({ useAbility: true });
  let t = 0;
  while (sim.state.outcome === null && t < seconds) {
    if (sim.state.choice !== null) {
      sim.choose(sim.state.choice.options[0] ?? null);
    }
    sim.step(STEP, drive(sim, STEP));
    sim.drainEvents();
    watch(sim);
    t += STEP;
  }
}

test('pickups stay on the road on every stop (coins near the edge are a flight, not a placement)', () => {
  for (const id of JOURNEY) {
    for (const seed of [11, 12]) {
      driveAndWatch(id, seed, 60, (sim) => {
        for (const p of sim.state.pickups) {
          assert.atMost(Math.abs(p.x), ROAD_HALF, `${id} seed ${seed}: pickup ${p.kind} at x ${p.x}`);
        }
      });
    }
  }
});

test('live hazards stay on the road on every stop, and only leave it once knocked aside', () => {
  for (const id of JOURNEY) {
    for (const seed of [21, 22]) {
      driveAndWatch(id, seed, 60, (sim) => {
        for (const h of sim.state.hazards) {
          if (h.spent || h.knocked >= 0 || h.practice) {
            continue;
          }
          assert.atMost(Math.abs(h.x), ROAD_HALF, `${id} seed ${seed}: ${h.kind} at x ${h.x}`);
        }
      });
    }
  }
});

test('a pickup never lands inside a live hazard that is about to arrive with it', () => {
  // Placement is seeded, so a bad layout would come back every time: check a spread of seeds.
  let overlaps = 0;
  let checked = 0;
  for (const id of JOURNEY) {
    driveAndWatch(id, 31, 45, (sim) => {
      for (const p of sim.state.pickups) {
        if (p.collected || p.z < 6 || p.z > 40) {
          continue;
        }
        checked += 1;
        for (const h of sim.state.hazards) {
          if (!h.spent && h.knocked < 0 && h.maxHp <= 0 && h.ownSpeed === 0 && h.thrown === 0 && Math.abs(h.x - p.x) < h.halfW * 0.6 && Math.abs(h.z - p.z) < h.len * 0.6) {
            overlaps += 1;
          }
        }
      }
    });
  }
  assert.atLeast(checked, 100, 'pickups seen');
  // A share of a percent can come from moving traffic crossing a parked Bolt; a placement fault would be far more.
  assert.atMost(overlaps / checked, 0.02, `overlaps ${overlaps} of ${checked}`);
});

test('every hero can be chosen, and survives a reload', () => {
  for (const id of HEROES) {
    const after = loadSave(serializeSave(selectHero(fullSave(), id))).save;
    assert.equal(after.loadout.hero, id);
  }
});

test('every sidekick can take either slot, and survives a reload', () => {
  for (const id of SIDEKICKS) {
    for (const slot of [0, 1] as const) {
      const after = loadSave(serializeSave(equipSidekick(fullSave(), slot, id))).save;
      assert.equal(after.loadout.sidekicks[slot], id, `${id} in slot ${slot}`);
      assert.equal(after.loadout.sidekicks[slot === 0 ? 1 : 0] === id, false, `${id} is not in both slots`);
    }
  }
});

test('a sidekick taken off stays owned and the slot stays empty after a reload', () => {
  const on = equipSidekick(fullSave(), 0, 'tarsi');
  const off = loadSave(serializeSave(equipSidekick(on, 0, null))).save;
  assert.equal(off.loadout.sidekicks[0], null);
  assert.equal(off.sidekicks.tarsi !== undefined, true);
});

test('equipping someone not yet earned does nothing', () => {
  const save = defaultSave();
  assert.equal(selectHero(save, 'tiko').loadout.hero, save.loadout.hero);
  assert.equal(equipSidekick(save, 0, 'ulap').loadout.sidekicks[0], save.loadout.sidekicks[0]);
});

test('Tarsi marks the postcard ahead, and nobody else does', () => {
  const missionId = JOURNEY.find((id) => MISSIONS[id].postcard !== null)!;
  const card = MISSIONS[missionId].postcard!;
  const seen = new DrivingSim(simOptions(missionId, { skipTutorial: true, loadout: loadout('navie', ['tarsi', null]) }));
  const blind = new DrivingSim(simOptions(missionId, { skipTutorial: true, loadout: loadout('navie', ['pip', null]) }));
  const range = seen.state.sidekicks[0].stats.range;
  for (const sim of [seen, blind]) {
    jumpTo(sim, card.at - range * 0.5);
    sim.step(STEP, { axis: 0, targetX: null, ability: false });
  }
  assert.equal(seen.state.postcardMark?.lane, card.lane);
  assert.atMost(seen.state.postcardMark?.dist ?? 99999, range);
  assert.equal(blind.state.postcardMark, null);
});

test('Nico sees the postcard only while Case Finder runs', () => {
  const missionId = JOURNEY.find((id) => MISSIONS[id].postcard !== null)!;
  const card = MISSIONS[missionId].postcard!;
  const sim = new DrivingSim(simOptions(missionId, { skipTutorial: true, loadout: loadout('nico', [null, null]) }));
  jumpTo(sim, card.at - 100);
  sim.step(STEP, { axis: 0, targetX: null, ability: false });
  assert.equal(sim.state.postcardMark, null, 'not before the signature');
  sim.state.caseFinder = 3;
  sim.step(STEP, { axis: 0, targetX: null, ability: false });
  assert.equal(sim.state.postcardMark?.lane, card.lane);
});
