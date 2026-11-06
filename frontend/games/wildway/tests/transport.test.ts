import { allPlans, evaluatePlan, HORNBILL_TRANSPORT, type Plan } from '../core/transport';
import { assert, test } from './harness';

const P = HORNBILL_TRANSPORT;
const plan = (fleetId: string, routeId: string, departureId: string): Plan => ({ fleetId, routeId, departureId });
const kinds = (p: Plan): string[] => evaluatePlan(P, p).violations.map((v) => v.kind);

test('board: the usual way is itself a legal plan', () => {
  const r = evaluatePlan(P, P.baseline);
  assert.ok(r.feasible, JSON.stringify(r.violations));
});

test('board: every feasible plan carries the same people and all the cargo', () => {
  const allCargo = P.demand.cargo.map((c) => c.id).sort();
  let feasible = 0;
  for (const p of allPlans(P)) {
    const r = evaluatePlan(P, p);
    if (!r.feasible) {
      continue;
    }
    feasible += 1;
    const seats = r.trips.reduce((sum, t) => sum + t.people, 0);
    assert.equal(seats, P.demand.people, `people in ${JSON.stringify(p)}`);
    assert.deepEqual(r.trips.flatMap((t) => [...t.cargo]).sort(), allCargo, `cargo in ${JSON.stringify(p)}`);
  }
  assert.atLeast(feasible, 5, 'there are real choices');
});

test('board: not enough seats is refused', () => {
  assert.ok(kinds(plan('pickup-only', 'greenway', 'mid')).includes('seats'));
});

test('board: a late departure misses the deadline', () => {
  assert.ok(kinds(plan('shared-van', 'greenway', 'late')).includes('deadline'));
});

test('board: the closed road is refused whatever its numbers say', () => {
  const closed = evaluatePlan(P, plan('electric-van', 'logging', 'mid'));
  assert.ok(!closed.feasible);
  assert.ok(closed.violations.some((v) => v.text.includes('closed')));
  const best = Math.min(...allPlans(P).map((p) => evaluatePlan(P, p)).filter((r) => r.feasible).map((r) => r.co2Kg));
  assert.ok(closed.co2Kg < best, 'the lowest number on the board is the one you may not take');
});

test('board: essential services come first: the electric van is out on its clinic run early', () => {
  assert.ok(kinds(plan('electric-van', 'greenway', 'early')).includes('availability'));
  assert.ok(evaluatePlan(P, plan('electric-van', 'greenway', 'mid')).feasible);
});

test('board: a large truck cannot go through town', () => {
  assert.ok(evaluatePlan(P, plan('separate', 'town', 'mid')).violations.some((v) => v.text.includes('Through town')));
});

test('board: the shortest road is not automatically the best', () => {
  const town = evaluatePlan(P, plan('shared-van', 'town', 'early'));
  const greenway = evaluatePlan(P, plan('shared-van', 'greenway', 'early'));
  const shorter = P.routes.find((r) => r.id === 'town')?.distanceKm ?? 0;
  const longer = P.routes.find((r) => r.id === 'greenway')?.distanceKm ?? 0;
  assert.ok(shorter < longer, 'town is the shorter road');
  assert.ok(town.co2Kg > greenway.co2Kg, 'in the school run, the longer road burns less');
});

test('board: leaving at a different time matters more than going fast', () => {
  const early = evaluatePlan(P, plan('shared-van', 'town', 'early'));
  const mid = evaluatePlan(P, plan('shared-van', 'town', 'mid'));
  assert.ok(mid.co2Kg < early.co2Kg);
});

test('board: every refusal explains itself', () => {
  for (const p of allPlans(P)) {
    for (const v of evaluatePlan(P, p).violations) {
      assert.ok(v.text.length > 10, JSON.stringify(p));
    }
  }
});

test('board: there is no option to skip the journey', () => {
  assert.ok(P.demand.people > 0 && P.demand.cargo.length > 0);
  assert.ok(P.fleets.every((f) => f.trips.length > 0), 'every plan actually makes the trip');
});

test('board: the electric van has enough charge for each feasible route, and the check exists', () => {
  for (const r of P.routes.filter((x) => x.closedBecause === undefined)) {
    const result = evaluatePlan(P, plan('electric-van', r.id, 'mid'));
    assert.ok(result.feasible, `${r.id}: ${JSON.stringify(result.violations)}`);
    const trip = result.trips[0];
    assert.ok(trip.outbound.batteryKWh + trip.back.batteryKWh <= trip.vehicle.usableKWh);
  }
});
