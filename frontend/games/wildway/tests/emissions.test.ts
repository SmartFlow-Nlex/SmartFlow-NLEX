import { CALCULATION_VERSION, CHARGING_LOSS, FACTORS, journey, savings, VEHICLES } from '../core/emissions';
import { allPlans, comparePlan, evaluatePlan, HORNBILL_TRANSPORT } from '../core/transport';
import { assert, test } from './harness';

const near = (a: number, b: number, label = ''): void => assert.ok(Math.abs(a - b) < 1e-9, `${label} expected ${b}, got ${a}`);

test('emissions: fuel is distance x L/km x traffic + idle hours x L/h, x kg CO2/L', () => {
  const v = VEHICLES.van;
  const r = journey(v, { distanceKm: 40, stationaryMin: 30, movingFactor: 1.2 });
  near(r.idleFuelL, 0.5 * v.idleLPerH, 'idle');
  near(r.fuelL, 40 * v.lPerKm * 1.2 + 0.5 * v.idleLPerH, 'fuel');
  near(r.co2Kg, r.fuelL * FACTORS.diesel.value, 'co2');
});

test('emissions: a traffic factor that already includes idling does not count it twice', () => {
  const v = VEHICLES.sedan;
  const counted = journey(v, { distanceKm: 40, stationaryMin: 30, movingFactor: 1.2, factorIncludesIdling: true });
  const free = journey(v, { distanceKm: 40, stationaryMin: 0, movingFactor: 1.2 });
  near(counted.fuelL, free.fuelL, 'fuel');
  assert.equal(counted.idleFuelL, 0);
});

test('emissions: standing still costs fuel, so a jam is worse than a clear road', () => {
  const v = VEHICLES.sedan;
  const clear = journey(v, { distanceKm: 40, stationaryMin: 0, movingFactor: 1 });
  const jam = journey(v, { distanceKm: 40, stationaryMin: 40, movingFactor: 1.3 });
  assert.ok(jam.co2Kg > clear.co2Kg);
});

test('emissions: electricity is counted at the charger, with charging loss exactly once', () => {
  const v = VEHICLES.evan;
  const r = journey(v, { distanceKm: 50, stationaryMin: 12, movingFactor: 1.1 });
  const battery = 50 * v.kWhPerKm * 1.1 + (12 / 60) * v.auxKw;
  near(r.batteryKWh, battery, 'battery');
  near(r.chargerKWh, battery / (1 - CHARGING_LOSS), 'charger');
  near(r.co2Kg, (battery / (1 - CHARGING_LOSS)) * FACTORS.grid.value, 'co2');
  assert.ok(r.co2Kg > 0, 'an electric van is not a zero in this model');
  assert.equal(r.fuelL, 0);
});

test('emissions: unit conversions match the EPA figures per gallon', () => {
  near(FACTORS.gasoline.value * 3.78541, 8.887, 'gasoline');
  near(FACTORS.diesel.value * 3.78541, 10.18, 'diesel');
});

test('emissions: every factor carries its source details, and foreign ones say so', () => {
  for (const f of Object.values(FACTORS)) {
    assert.ok(f.units.length > 0 && f.geography.length > 0 && f.gasesIncluded.length > 0 && f.accountingBoundary.length > 0, f.id);
    assert.equal(f.version, CALCULATION_VERSION);
    assert.ok(typeof f.sourceUrl === 'string' && f.sourceUrl.startsWith('https://'), `${f.id} has a source`);
  }
  assert.equal(FACTORS.gasoline.status, 'illustrative', 'a US figure is not presented as Philippine');
  assert.equal(FACTORS.diesel.status, 'illustrative', 'a US figure is not presented as Philippine');
  assert.ok(FACTORS.gasoline.geography.includes('United States'));
  assert.ok(FACTORS.grid.geography.includes('Philippines'));
  assert.ok(Object.values(FACTORS).every((f) => f.gasesIncluded === 'CO2 only'), 'kg CO2, not CO2e');
});

test('savings: a worse plan is negative, never hidden or clamped', () => {
  const s = savings(40, 50);
  near(s.savedKg, -10);
  near(s.percent as number, -25);
});

test('savings: no percentage when the baseline is zero', () => {
  assert.equal(savings(0, 5).percent, null);
  assert.equal(savings(0, 0).percent, null);
});

test('savings: occupancy does not shrink a vehicle total', () => {
  const r = journey(VEHICLES.van, { distanceKm: 40, stationaryMin: 10, movingFactor: 1 });
  const again = journey(VEHICLES.van, { distanceKm: 40, stationaryMin: 10, movingFactor: 1 });
  near(r.co2Kg, again.co2Kg);
  /* Plans sum whole vehicles: nothing in a plan result is divided by the people on board. */
  const plan = evaluatePlan(HORNBILL_TRANSPORT, { fleetId: 'shared-van', routeId: 'greenway', departureId: 'early' });
  near(plan.co2Kg, plan.trips.reduce((sum, t) => sum + t.co2Kg, 0));
});

test('model: the same inputs always give the same answer', () => {
  for (const p of allPlans(HORNBILL_TRANSPORT)) {
    assert.deepEqual(evaluatePlan(HORNBILL_TRANSPORT, p), evaluatePlan(HORNBILL_TRANSPORT, p));
  }
});

test('comparison: the reasons come from the actual numbers', () => {
  const c = comparePlan(HORNBILL_TRANSPORT, { fleetId: 'shared-van', routeId: 'greenway', departureId: 'early' });
  assert.ok(c.reasons.some((r) => r.includes('1 vehicle instead of 2')));
  const worse = comparePlan(HORNBILL_TRANSPORT, { fleetId: 'solo', routeId: 'town', departureId: 'early' });
  assert.ok(worse.savings.savedKg < 0, 'this plan does worse than the usual way');
  assert.ok(worse.reasons.some((r) => r.includes('More vehicles')));
});
