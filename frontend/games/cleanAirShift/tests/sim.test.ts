import { carKmFor, CAR_G_PER_KM, FLEET_MIX, IDLE_KG_PER_MIN } from '../core/factors';
import {
  applyPerk,
  BREAKDOWN_AUTO_S,
  buildSchedule,
  canRedirect,
  clearBlock,
  createSim,
  ENGINES_S,
  enginesOff,
  findVehicle,
  LENGTH,
  laneWait,
  redirectLane,
  redirectVehicle,
  repairBooth,
  READER_AUTO_S,
  runUnmanaged,
  staffInUse,
  step,
  STEP_S,
  TAG_AUTO_S,
  toggleLane,
  WARNING_S,
  type LaneType,
  type PlazaRules,
  type Sim,
  type Vehicle,
  type WaveEvent,
} from '../core/sim';
import { assert, test } from './harness';

/** A controllable plaza: no random traffic unless a rate is given. */
const plaza = (over: Partial<PlazaRules> & { rate?: [number, number, number]; events?: WaveEvent[]; duration?: number; reloadShare?: number; habit?: number[] } = {}): PlazaRules => {
  const lanes = over.lanes ?? 3;
  return {
    lanes,
    laneTypes: over.laneTypes,
    staff: over.staff ?? lanes,
    startOpen: over.startOpen ?? Array.from({ length: lanes }, (_, i) => i),
    redirect: over.redirect ?? true,
    engines: over.engines ?? 1,
    waves: over.waves ?? [
      {
        id: 'test',
        label: 'Test',
        note: '',
        duration: over.duration ?? 30,
        rate: over.rate ?? [0, 0, 0],
        habit: over.habit ?? Array.from({ length: lanes }, () => 1),
        mix: FLEET_MIX,
        reloadShare: over.reloadShare ?? 0,
        events: over.events ?? [],
      },
    ],
  };
};

const sim3 = (rules: PlazaRules): Sim => createSim(rules, { seed: 5, listen: true });

const run = (sim: Sim, seconds: number): void => {
  for (let i = 0; i < Math.round(seconds / STEP_S) && !sim.done; i += 1) {
    step(sim, STEP_S);
  }
};

const until = (sim: Sim, ready: () => boolean, limit = 40): void => {
  for (let i = 0; i < Math.round(limit / STEP_S) && !ready() && !sim.done; i += 1) {
    step(sim, STEP_S);
  }
};

/** Puts specific vehicles into the schedule. */
function withVehicles(sim: Sim, list: { cls: 0 | 1 | 2; habit: number; t?: number; needsReload?: boolean; knows?: boolean }[]): void {
  sim.schedule = list.map((v, i) => ({
    id: i + 1,
    t: v.t ?? i * 0.6,
    cls: v.cls,
    habit: v.habit,
    needsReload: v.needsReload === true,
    smartRoll: 1,
    knowsRoll: v.knows === true ? 0 : 1,
    tieRoll: 0,
    shape: 0,
    paint: 0,
  }));
  sim.nextArrival = 0;
}

const allVehicles = (sim: Sim): Vehicle[] => sim.lanes.flatMap((lane) => lane.queue);

/* ---- The numbers ---- */

test('idling rates match the dashboard', () => {
  // Back-End/src/services/emissions-source.ts and docs/emissions-optimiser-spec.md: 0.0444, 0.1357, 0.1697 kg/min.
  assert.equal(IDLE_KG_PER_MIN[0].toFixed(4), '0.0444');
  assert.equal(IDLE_KG_PER_MIN[1].toFixed(4), '0.1357');
  assert.equal(IDLE_KG_PER_MIN[2].toFixed(4), '0.1697');
  assert.equal(CAR_G_PER_KM, 196.1);
  assert.equal(carKmFor(196.1 / 1000).toFixed(3), '1.000');
});

test('the same shift and seed give the same kg, so the comparison is fair', () => {
  const rules = plaza({ rate: [1.2, 1.2, 1.2], events: [{ t: 10, kind: 'tag' }, { t: 20, kind: 'breakdown' }] });
  const a = runUnmanaged(rules, { seed: 42 });
  const b = runUnmanaged(rules, { seed: 42 });
  const c = runUnmanaged(rules, { seed: 43 });
  assert.equal(a.total, b.total);
  assert.ok(a.total !== c.total, 'a different seed should differ');
  assert.equal(JSON.stringify(buildSchedule(rules, 42)), JSON.stringify(buildSchedule(rules, 42)));
});

test('CO2 never goes down, even as lines clear', () => {
  const sim = sim3(plaza({ rate: [2.2, 2.2, 0.5], duration: 20, events: [{ t: 6, kind: 'reader' }, { t: 10, kind: 'breakdown' }] }));
  let last = 0;
  while (!sim.done && sim.t < 120) {
    step(sim, STEP_S);
    assert.ok(sim.co2 >= last, 'it went down');
    last = sim.co2;
  }
  assert.ok(sim.done);
  assert.ok(last > 0);
});

test('a waiting vehicle burns its class rate per minute of play', () => {
  const sim = sim3(plaza({ startOpen: [0] }));
  withVehicles(sim, [{ cls: 2, habit: 0, t: 0 }, { cls: 2, habit: 0, t: 0.1 }]);
  until(sim, () => sim.lanes[0].queue[1]?.speed === 0 && sim.lanes[0].queue[0].state === 'booth');
  run(sim, 0.05);
  assert.equal(sim.rate.toFixed(3), (IDLE_KG_PER_MIN[2] * 2).toFixed(3));
});

test('a truck burns about four times a car over the same wait', () => {
  const measure = (cls: 0 | 2): number => {
    const sim = sim3(plaza({ startOpen: [0] }));
    withVehicles(sim, [{ cls: 2, habit: 0, t: 0 }, { cls, habit: 0, t: 0.1 }]);
    until(sim, () => (findVehicle(sim, 2)?.waited ?? 0) > 1);
    const v = findVehicle(sim, 2) as Vehicle;
    return v.co2 / v.waited;
  };
  const ratio = measure(2) / measure(0);
  assert.atLeast(ratio, 3.7);
  assert.atMost(ratio, 3.95);
});

/* ---- Every vehicle stays real ---- */

test('every vehicle arrives once, keeps a valid lane, and leaves', () => {
  const rules = plaza({ lanes: 4, laneTypes: ['rfid', 'rfid', 'rfid', 'reload'], rate: [1.6, 2, 1.6], reloadShare: 0.15, duration: 40, events: [{ t: 5, kind: 'tag' }, { t: 12, kind: 'breakdown' }, { t: 20, kind: 'reader' }, { t: 25, kind: 'surge', count: 8, lane: 1, warning: 'x' }, { t: 30, kind: 'closure' }] });
  const sim = createSim(rules, { seed: 9 });
  const ids = sim.schedule.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate ids in the schedule');
  const seen = new Set<number>();
  let lastCount = 0;
  while (!sim.done && sim.t < 400) {
    step(sim, STEP_S);
    const here = allVehicles(sim);
    const hereIds = here.map((v) => v.id);
    assert.equal(new Set(hereIds).size, hereIds.length, 'a vehicle is in two lanes');
    for (const v of here) {
      seen.add(v.id);
      assert.ok(Number.isInteger(v.lane) && v.lane >= 0 && v.lane < 4, 'invalid lane');
      assert.ok(sim.lanes[v.lane].queue.includes(v), 'the vehicle is not in its own lane');
    }
    assert.ok(sim.arrived >= lastCount, 'arrivals went down');
    lastCount = sim.arrived;
  }
  assert.ok(sim.done, 'the shift should end');
  assert.equal(sim.arrived, sim.schedule.length, 'every scheduled vehicle arrived once');
  assert.equal(seen.size, sim.arrived);
  assert.equal(sim.paid + sim.towed, sim.arrived, 'every vehicle left');
});

test('vehicles never pass through each other or teleport, however much they are swiped', () => {
  const rules = plaza({ lanes: 5, rate: [2.2, 2.6, 2.2], duration: 30 });
  const sim = createSim(rules, { seed: 11 });
  const last = new Map<number, { x: number; s: number }>();
  let swipes = 0;
  for (let i = 0; i < 60 * 50 && !sim.done; i += 1) {
    /* Throw traffic about far more than any person could. */
    if (i % 20 === 0) {
      const from = i % 5;
      if (redirectLane(sim, from, 0, (from + 2 + (i % 3)) % 5).moved > 0) {
        swipes += 1;
      }
    }
    step(sim, STEP_S);
    const here = allVehicles(sim);
    for (const v of here) {
      const before = last.get(v.id);
      if (before !== undefined) {
        assert.atMost(Math.abs(v.x - before.x), 2.5 * STEP_S + 1e-6, `vehicle ${v.id} jumped across`);
        assert.ok(v.s <= before.s + 1e-6, `vehicle ${v.id} went backwards`);
        assert.atMost(before.s - v.s, 5.1 * STEP_S + 1e-6, `vehicle ${v.id} jumped forward`);
      }
      last.set(v.id, { x: v.x, s: v.s });
    }
    for (let a = 0; a < here.length; a += 1) {
      for (let b = a + 1; b < here.length; b += 1) {
        const p = here[a];
        const q = here[b];
        if (Math.abs(p.x - q.x) < 0.5) {
          const overlap = Math.min(p.s + LENGTH[p.cls], q.s + LENGTH[q.cls]) - Math.max(p.s, q.s);
          assert.atMost(overlap, 0.1, `vehicles ${p.id} and ${q.id} overlap by ${overlap.toFixed(2)} at t=${sim.t.toFixed(1)}`);
        }
      }
    }
  }
  assert.atLeast(swipes, 30, 'the test should really have swiped');
});

/* ---- Redirecting ---- */

test('a swipe takes the vehicle under the finger and those behind it, not those ahead', () => {
  const sim = sim3(plaza());
  withVehicles(sim, [{ cls: 0, habit: 0, t: 0 }, { cls: 0, habit: 0, t: 0.6 }, { cls: 0, habit: 0, t: 1.2 }]);
  run(sim, 1.4);
  const [first, second, third] = sim.lanes[0].queue;
  assert.ok(canRedirect(first) && canRedirect(second) && canRedirect(third));
  const result = redirectLane(sim, 0, second.s, 1);
  assert.equal(result.moved, 2);
  assert.equal(first.target, null);
  assert.equal(second.target, 1);
  assert.equal(third.target, 1);
  run(sim, 1);
  assert.equal(second.lane, 1);
  assert.equal(third.lane, 1);
  assert.equal(first.lane, 0);
  assert.equal(sim.moves, 2);
});

test('vehicles slide across over time, one lane at a time', () => {
  const sim = sim3(plaza({ lanes: 4 }));
  withVehicles(sim, [{ cls: 0, habit: 0, t: 0 }]);
  run(sim, 0.1);
  const v = allVehicles(sim)[0];
  assert.equal(redirectVehicle(sim, v.id, 3).reason, 'ok');
  run(sim, 0.1);
  assert.ok(v.x > 0 && v.x < 1, `after a moment it should be part way, at ${v.x}`);
  run(sim, 2);
  assert.equal(v.lane, 3);
  assert.equal(v.x, 3);
  assert.equal(v.target, null);
});

test('a vehicle already in line cannot change lanes', () => {
  const sim = sim3(plaza());
  withVehicles(sim, [{ cls: 0, habit: 0, t: 0 }, { cls: 0, habit: 0, t: 0.2 }]);
  until(sim, () => sim.lanes[0].queue[1]?.state === 'queue');
  const queued = sim.lanes[0].queue[1];
  assert.equal(queued.state, 'queue');
  const result = redirectVehicle(sim, queued.id, 1);
  assert.equal(result.moved, 0);
  run(sim, 1);
  assert.equal(queued.lane, 0);
  assert.equal(queued.x, 0);
});

test('redirects are refused where they cannot work', () => {
  const sim = sim3(plaza({ startOpen: [0, 1] }));
  withVehicles(sim, [{ cls: 0, habit: 0, t: 0 }]);
  run(sim, 0.1);
  const id = allVehicles(sim)[0].id;
  assert.equal(redirectVehicle(sim, id, 2).reason, 'closed');
  assert.equal(redirectVehicle(sim, 99, 1).reason, 'none');
  assert.equal(redirectVehicle(sim, id, 0).reason, 'same');
  assert.equal(allVehicles(sim)[0].target, null);

  const off = sim3(plaza({ redirect: false }));
  withVehicles(off, [{ cls: 0, habit: 0, t: 0 }]);
  run(off, 0.1);
  assert.equal(redirectVehicle(off, allVehicles(off)[0].id, 1).reason, 'off');
});

test('a vehicle waits for a gap before merging, and gives up if it joins a line first', () => {
  const sim = sim3(plaza({ lanes: 2 }));
  /* A car side by side with another, each in its own lane. */
  withVehicles(sim, [{ cls: 0, habit: 0, t: 0 }, { cls: 0, habit: 1, t: 0 }]);
  run(sim, 0.1);
  const [a, b] = [sim.lanes[0].queue[0], sim.lanes[1].queue[0]];
  assert.ok(Math.abs(a.s - b.s) < 0.2, 'side by side');
  redirectVehicle(sim, a.id, 1);
  run(sim, 0.1);
  assert.equal(a.lane, 0, 'no room yet');
  until(sim, () => a.lane === 1 || a.target === null);
  if (a.lane === 1) {
    const overlap = Math.min(a.s + 1, b.s + 1) - Math.max(a.s, b.s);
    assert.atMost(overlap, 0, 'it found a real gap');
  }
});

test('nobody joins a line that has backed up off the road, so no line snowballs unseen', () => {
  /* Everyone wants lane 0, which is slow, while the other lanes stand empty. */
  const sim = sim3(plaza({ lanes: 3, rate: [1.6, 1.6, 1.6], duration: 40, habit: [1, 0.0001, 0.0001] }));
  let most = 0;
  let others = 0;
  until(sim, () => {
    most = Math.max(most, sim.lanes[0].queue.length);
    others = Math.max(others, sim.lanes[1].queue.length, sim.lanes[2].queue.length);
    return sim.done;
  }, 200);
  assert.atMost(most, 11, 'no runaway line');
  assert.atLeast(others, 1, 'the overflow went to the other lanes');
  assert.equal(sim.arrived, sim.schedule.length, 'nobody vanished');
});

test('a successful redirect reports the waiting it saves', () => {
  const sim = sim3(plaza());
  withVehicles(sim, [
    { cls: 2, habit: 0, t: 0 },
    { cls: 2, habit: 0, t: 0.1 },
    { cls: 2, habit: 0, t: 0.2 },
    { cls: 0, habit: 0, t: 5 },
  ]);
  until(sim, () => sim.arrived === 4);
  const last = sim.lanes[0].queue[3];
  assert.ok(canRedirect(last));
  const result = redirectVehicle(sim, last.id, 1);
  assert.equal(result.reason, 'ok');
  assert.atLeast(result.savedMinutes, 5);
  assert.equal(sim.reliefs, 1);
});

/* ---- Lane types ---- */

const RELOAD_LANES: LaneType[] = ['rfid', 'rfid', 'reload'];

test('a no-load vehicle can only be sent to a reload lane', () => {
  const sim = sim3(plaza({ laneTypes: RELOAD_LANES }));
  withVehicles(sim, [{ cls: 0, habit: 0, t: 0, needsReload: true }]);
  run(sim, 0.1);
  const v = allVehicles(sim)[0];
  assert.equal(v.lane, 0, 'this driver did not know');
  assert.equal(redirectVehicle(sim, v.id, 1).reason, 'compat');
  assert.equal(redirectVehicle(sim, v.id, 2).reason, 'ok');
  run(sim, 1.5);
  assert.equal(v.lane, 2);
});

test('a no-load vehicle at the wrong booth blocks it until helped', () => {
  const sim = sim3(plaza({ laneTypes: RELOAD_LANES }));
  withVehicles(sim, [{ cls: 0, habit: 0, t: 0, needsReload: true }]);
  until(sim, () => sim.lanes[0].queue[0]?.state === 'booth');
  const v = sim.lanes[0].queue[0];
  assert.equal(v.block, 'tag');
  assert.equal(sim.emergencies, 1);
  assert.ok(clearBlock(sim, v.id));
  assert.equal(sim.handled, 1);
  assert.equal(v.block, null);
});

test('a no-load vehicle that knows goes to the reload lane by itself and pays there', () => {
  const sim = sim3(plaza({ laneTypes: RELOAD_LANES }));
  withVehicles(sim, [{ cls: 0, habit: 0, t: 0, needsReload: true, knows: true }]);
  run(sim, 0.1);
  const v = allVehicles(sim)[0];
  assert.equal(v.lane, 2);
  until(sim, () => sim.paid === 1);
  assert.equal(sim.paid, 1);
  assert.equal(sim.emergencies, 0);
});

test('a reload lane serves tagged vehicles too, but more slowly', () => {
  const time = (lane: number): number => {
    const sim = sim3(plaza({ laneTypes: RELOAD_LANES }));
    withVehicles(sim, [{ cls: 0, habit: lane, t: 0 }]);
    until(sim, () => sim.paid === 1);
    return sim.t;
  };
  assert.ok(time(2) > time(0) + 0.5);
});

/* ---- Booths ---- */

test('a booth never closes on a vehicle it is serving', () => {
  const sim = sim3(plaza({ startOpen: [0, 1] }));
  withVehicles(sim, [{ cls: 0, habit: 0, t: 0 }, { cls: 0, habit: 0, t: 0.3 }]);
  until(sim, () => sim.lanes[0].queue[0]?.state === 'booth');
  assert.equal(toggleLane(sim, 0), 'closing');
  assert.equal(sim.lanes[0].status, 'closing');
  assert.equal(staffInUse(sim), 2, 'its crew is not free yet');
  until(sim, () => sim.lanes[0].status === 'closed');
  assert.equal(sim.lanes[0].queue.length, 0, 'it finished its line first');
  assert.equal(staffInUse(sim), 1, 'now the crew is free');
});

test('tapping a closing booth keeps it open', () => {
  const sim = sim3(plaza({ startOpen: [0, 1] }));
  withVehicles(sim, [{ cls: 0, habit: 0, t: 0 }, { cls: 0, habit: 0, t: 0.3 }]);
  until(sim, () => sim.lanes[0].queue[0]?.state === 'booth');
  toggleLane(sim, 0);
  assert.equal(toggleLane(sim, 0), 'cancelled');
  assert.equal(sim.lanes[0].status, 'open');
});

test('an empty booth closes at once, and vehicles approaching a closing booth steer away', () => {
  const sim = sim3(plaza({ startOpen: [0, 1] }));
  assert.equal(toggleLane(sim, 1), 'closed');
  assert.equal(toggleLane(sim, 1), 'opened');
  run(sim, 1.2);
  withVehicles(sim, [{ cls: 0, habit: 0, t: sim.t }, { cls: 0, habit: 0, t: sim.t + 2.4 }]);
  until(sim, () => sim.lanes[0].queue[0]?.state === 'booth' && sim.arrived === 2);
  const approaching = sim.lanes[0].queue[1];
  assert.ok(canRedirect(approaching), 'still approaching');
  assert.equal(toggleLane(sim, 0), 'closing');
  assert.equal(approaching.target, 1);
  until(sim, () => approaching.lane === 1 || !canRedirect(approaching));
  assert.equal(approaching.lane, 1);
});

test('booths obey the crew limit, take a moment to open, and one always stays open', () => {
  const sim = sim3(plaza({ startOpen: [0, 1], staff: 2 }));
  assert.equal(toggleLane(sim, 2), 'no-staff');
  assert.equal(toggleLane(sim, 1), 'closed');
  assert.equal(toggleLane(sim, 0), 'last-lane');
  assert.equal(toggleLane(sim, 2), 'opened');
  assert.equal(sim.lanes[2].status, 'opening');
  run(sim, 1.2);
  assert.equal(sim.lanes[2].status, 'open');
});

test('the only reload lane cannot be closed, or no-load drivers would have nowhere to go', () => {
  const sim = sim3(plaza({ laneTypes: RELOAD_LANES }));
  assert.equal(toggleLane(sim, 2), 'only-reload');
  assert.equal(toggleLane(sim, 1), 'closed');
});

/* ---- Emergencies ---- */

test('a failed tag holds the lane until helped, or for its time', () => {
  const build = (): Sim => {
    const sim = sim3(plaza({ startOpen: [0], events: [{ t: 2.6, kind: 'tag' }] }));
    withVehicles(sim, [{ cls: 0, habit: 0, t: 0 }]);
    return sim;
  };
  const stuck = (sim: Sim): boolean => sim.lanes[0].queue[0]?.block === 'tag';
  const helped = build();
  until(helped, () => stuck(helped));
  const front = helped.lanes[0].queue[0];
  assert.ok(clearBlock(helped, front.id));
  assert.equal(front.block, null);
  until(helped, () => helped.paid === 1, 4);
  assert.equal(helped.paid, 1);

  const left = build();
  until(left, () => stuck(left));
  run(left, TAG_AUTO_S - 1);
  assert.equal(left.paid, 0, 'still stuck before the time is up');
  run(left, 4);
  assert.equal(left.paid, 1);
});

test('a breakdown waits for the tow, and the tow is much faster than leaving it', () => {
  const build = (): Sim => {
    const sim = sim3(plaza({ startOpen: [0], events: [{ t: 2.6, kind: 'breakdown' }] }));
    withVehicles(sim, [{ cls: 0, habit: 0, t: 0 }]);
    return sim;
  };
  const stuck = (sim: Sim): boolean => sim.lanes[0].queue[0]?.block === 'breakdown';
  const towed = build();
  until(towed, () => stuck(towed));
  const v = towed.lanes[0].queue[0];
  assert.ok(clearBlock(towed, v.id));
  assert.ok(!clearBlock(towed, v.id), 'a second tap does not send a second tow');
  run(towed, 4);
  assert.equal(towed.lanes[0].queue.length, 0);
  assert.equal(towed.towed, 1);

  const left = build();
  until(left, () => stuck(left));
  run(left, BREAKDOWN_AUTO_S - 2);
  assert.equal(left.lanes[0].queue.length, 1);
  run(left, 3);
  assert.equal(left.lanes[0].queue.length, 0);
});

test('a broken-down engine burns nothing, but the line behind it does', () => {
  const sim = sim3(plaza({ startOpen: [0], events: [{ t: 2.6, kind: 'breakdown' }] }));
  withVehicles(sim, [{ cls: 0, habit: 0, t: 0 }, { cls: 0, habit: 0, t: 0.3 }]);
  until(sim, () => sim.lanes[0].queue[0]?.block === 'breakdown');
  run(sim, 1.5);
  const [stalled, behind] = sim.lanes[0].queue;
  const before = stalled.co2;
  const beforeBehind = behind.co2;
  run(sim, 2);
  assert.equal(stalled.co2, before);
  assert.ok(behind.co2 > beforeBehind);
});

test('a failed reader stops its booth until repaired, and repair is a short wait', () => {
  const build = (): Sim => {
    const sim = sim3(plaza({ events: [{ t: 1, kind: 'reader' }] }));
    withVehicles(sim, [{ cls: 0, habit: 1, t: 0 }]);
    return sim;
  };
  const sim = build();
  until(sim, () => sim.lanes.some((l) => l.fault === 'reader'));
  const lane = sim.lanes.find((l) => l.fault === 'reader') as Sim['lanes'][number];
  assert.equal(sim.emergencies, 1);
  assert.equal(toggleLane(sim, lane.index), 'blocked', 'a broken booth cannot be closed');
  assert.ok(repairBooth(sim, lane.index));
  assert.ok(!repairBooth(sim, lane.index), 'one repair is enough');
  assert.equal(sim.handled, 1);
  assert.atMost(lane.faultLeft, 3.01);
  run(sim, 3.2);
  assert.equal(lane.fault, null);

  const left = build();
  until(left, () => left.lanes.some((l) => l.fault === 'reader'));
  const unattended = left.lanes.find((l) => l.fault === 'reader') as Sim['lanes'][number];
  run(left, READER_AUTO_S - 2);
  assert.equal(unattended.fault, 'reader', 'not repaired, it stays down');
  run(left, 3);
  assert.equal(unattended.fault, null);
});

test('a closing booth is announced first, frees its crew, and hands back only if there is one', () => {
  const sim = sim3(plaza({ startOpen: [0, 1], staff: 2, events: [{ t: 8, kind: 'closure', duration: 5 }] }));
  run(sim, 8 - WARNING_S + 0.1);
  assert.ok(sim.notes.some((n) => n.kind === 'closureSoon'), 'announced ahead of time');
  const lane = sim.lanes.find((l) => l.closureIn > 0) as Sim['lanes'][number];
  assert.equal(lane.fault, null);
  run(sim, WARNING_S);
  assert.equal(lane.fault, 'closure');
  assert.equal(staffInUse(sim), 1, 'its crew is free');
  assert.equal(toggleLane(sim, 2), 'opened');
  run(sim, 5.5);
  assert.equal(lane.fault, null);
  assert.ok(staffInUse(sim) <= sim.staff, 'never more crews than there are');
  assert.equal(lane.status === 'closed' || lane.status === 'closing', true);
});

test('trouble is fair: never on the last working booth or the only reload lane', () => {
  const sim = sim3(plaza({ laneTypes: RELOAD_LANES, startOpen: [0, 2], events: [{ t: 5, kind: 'reader' }, { t: 6, kind: 'reader' }, { t: 10, kind: 'closure' }] }));
  until(sim, () => sim.t > 20);
  assert.equal(sim.lanes[2].fault, null);
  assert.ok(sim.lanes[0].fault === null, 'its only working RFID booth is left alone');
  assert.equal(sim.emergencies, 0);
});

test('surges and convoys add their vehicles, and are announced first', () => {
  const rules = plaza({ events: [{ t: 12, kind: 'convoy', count: 6, cls: 2, lane: 1, warning: 'Trucks!' }, { t: 22, kind: 'surge', count: 5, lane: 2, warning: 'Cars!' }] });
  assert.equal(buildSchedule(rules, 3).filter((a) => a.cls === 2 && a.t < 20).length, 6);
  assert.equal(buildSchedule(rules, 3).length, 11);
  const sim = createSim(rules, { seed: 3, listen: true });
  run(sim, 12 - WARNING_S + 0.1);
  assert.ok(sim.notes.some((n) => n.kind === 'warning' && n.text === 'Trucks!'), 'warned ahead of time');
  assert.equal(sim.arrived, 0, 'not here yet');
  run(sim, WARNING_S + 3.5);
  assert.equal(sim.arrived, 6);
});

test('doubling a blockage more than doubles the CO2 of the queue, as the dashboard model says', () => {
  const measure = (seconds: number): number => {
    const blocked = plaza({ startOpen: [0], rate: [0.45, 0.45, 0.45], duration: 60, events: [{ t: 3, kind: 'breakdown' }] });
    const clear = plaza({ startOpen: [0], rate: [0.45, 0.45, 0.45], duration: 60 });
    const a = createSim(blocked, { seed: 8 });
    const b = createSim(clear, { seed: 8 });
    b.schedule = a.schedule.map((x) => ({ ...x }));
    let done = false;
    for (let i = 0; i < 60 * 400 && !a.done; i += 1) {
      step(a, STEP_S);
      for (const v of a.lanes[0].queue) {
        if (v.block === 'breakdown' && v.blockedFor >= seconds && !done) {
          v.blockLeft = 0;
          done = true;
        }
      }
    }
    for (let i = 0; i < 60 * 400 && !b.done; i += 1) {
      step(b, STEP_S);
    }
    return a.co2 - b.co2;
  };
  const short = measure(5);
  const long = measure(10);
  assert.ok(short > 0, 'a blockage should cost something');
  assert.atLeast(long / short, 2.3, 'superlinear:');
});

test('Engines Off stops everyone but the front of each line, for its time', () => {
  const sim = sim3(plaza({ startOpen: [0], engines: 1 }));
  withVehicles(sim, [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ cls: (i === 0 ? 0 : 2) as 0 | 2, habit: 0, t: i * 0.2 })));
  until(sim, () => sim.lanes[0].queue[0]?.state === 'booth' && sim.lanes[0].queue[2]?.speed === 0);
  assert.ok(enginesOff(sim));
  assert.ok(!enginesOff(sim), 'only as many as the plaza gives');
  run(sim, 0.05);
  assert.equal(sim.rate.toFixed(4), IDLE_KG_PER_MIN[sim.lanes[0].queue[0].cls].toFixed(4));
  run(sim, ENGINES_S);
  assert.equal(sim.enginesTimer, 0);
  assert.ok(sim.rate > 0.1, 'engines back on');
});

/* ---- What the player is told ---- */

test('the wait on a booth chip is what a vehicle joining that line really waits', () => {
  for (const [name, mix] of [
    ['cars', [0, 0, 0, 0, 0, 0, 0, 0]],
    ['trucks', [2, 2, 2, 2]],
    ['mixed', [0, 1, 0, 2, 0, 0, 1]],
  ] as [string, (0 | 1 | 2)[]][]) {
    const sim = sim3(plaza({ startOpen: [0] }));
    withVehicles(sim, mix.map((cls, i) => ({ cls, habit: 0, t: i * 0.2 })));
    until(sim, () => sim.lanes[0].queue[0]?.state === 'booth' && sim.arrived === mix.length);
    run(sim, 2);
    const promised = laneWait(sim, sim.lanes[0]);
    const started = sim.t;
    until(sim, () => sim.paid === mix.length, 200);
    const actual = sim.t - started;
    assert.atLeast(promised / actual, 0.85, `${name} promised ${promised.toFixed(1)} actual ${actual.toFixed(1)}`);
    assert.atMost(promised / actual, 1.15, `${name} promised ${promised.toFixed(1)} actual ${actual.toFixed(1)}`);
  }
});

test('waves follow each other, and each is announced', () => {
  const wave = (id: string, duration: number): PlazaRules['waves'][number] => ({ id, label: id, note: '', duration, rate: [0, 0, 0], habit: [1, 1, 1], mix: FLEET_MIX, events: [] });
  const sim = sim3(plaza({ waves: [wave('a', 3), wave('b', 3), wave('c', 3)] }));
  assert.equal(sim.duration, 9);
  run(sim, 3.1);
  assert.equal(sim.waveIndex, 1);
  run(sim, 3);
  assert.equal(sim.waveIndex, 2);
  assert.deepEqual(sim.notes.filter((n) => n.kind === 'wave').map((n) => n.what), ['b', 'c']);
});

test('changes picked during a shift start working at once', () => {
  const rules = plaza({ rate: [1.3, 1.3, 1.3], startOpen: [0] });
  const finish = (perk: string | null): Sim => {
    const sim = createSim(rules, { seed: 21 });
    if (perk !== null) {
      applyPerk(sim, perk as never);
    }
    run(sim, 500);
    return sim;
  };
  const plain = finish(null);
  assert.ok(finish('kiosks').co2 < plain.co2, 'kiosks');
  assert.deepEqual(finish('kiosks').arrivedByClass, plain.arrivedByClass, 'a change never alters the traffic');
  const sim = createSim(rules, { seed: 1 });
  applyPerk(sim, 'extraStaff');
  applyPerk(sim, 'extraStaff');
  assert.equal(sim.staff, 4, 'a change counts once');
  applyPerk(sim, 'engineCampaign');
  assert.equal(sim.enginesLeft, 2);
});
