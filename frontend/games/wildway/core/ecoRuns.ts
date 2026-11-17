import { FACTORS, VEHICLES, type VehicleModel } from './emissions';
import { ASSUMPTIONS } from './facility';
import type { MissionDef, MissionRun } from './mission';
import { comparePlan, evaluatePlan, type Plan, type RouteOption, type TransportProblem } from './transport';

/**
 * The Eco Runs: the NLEX campaign's newer missions, each three short steps in a made-up
 * place, built on the same mission state machine as the first four. Every one of them ends
 * in a choice whose simulated CO2 is worked out here, from the game's documented factors:
 * the transport model for vehicles and routes, the depot's lamp figures for lighting, and
 * a published tyre-pressure effect for the fuel saver. No result is fixed in advance: a
 * worse choice shows a worse number. Wildlife and cleanup are never credited with CO2.
 *
 * Only `import type` from mission.ts, so mission.ts can list these missions without a cycle.
 */

/* ---- Small helpers ---- */

const DAY = 'day';
const NINE_AM = 9 * 60;
const day = (label = '9:00 AM'): TransportProblem['departures'] => [{ id: DAY, label, time: NINE_AM }];

const road = (id: string, label: string, blurb: string, km: number, movingMin: number, stationaryMin: number, movingFactor: number, extra: Partial<RouteOption> = {}): RouteOption => ({
  id,
  label,
  blurb,
  distanceKm: km,
  movingMin,
  windows: { [DAY]: { stationaryMin, movingFactor } },
  ...extra,
});

const REWARDS = { guardianPoints: 100, plannedWell: 25, optionalChannel: 0, perClue: 5 };

/* ---- The choice: what the board shows for each option ---- */

export interface EcoOptionView {
  id: string;
  label: string;
  sub: string;
  /** Simulated kg CO2 for this option, when it can work. */
  co2Kg: number | null;
  /** Why it cannot work, when it cannot. */
  refused: string | null;
  /** A little route drawing, points in a 100 by 100 box, the base first. */
  sketch?: readonly (readonly [number, number])[];
}

export interface EcoOutcome {
  baselineKg: number;
  planKg: number;
  /** Why, in plain words, from the actual numbers. */
  lines: string[];
}

export interface EcoHow {
  intro: string;
  sums: string[];
  rows: [string, string, string][];
  sources: string;
}

export interface EcoRun {
  missionId: string;
  /** The choice board's small heading and its title. */
  choiceKicker: string;
  choiceTitle: string;
  /** What the results call this comparison. */
  partLabel: string;
  /** One short cheer, shown only when the choice really did better than the usual way. */
  goodLine: string;
  options: () => EcoOptionView[];
  outcome: (choiceId: string) => EcoOutcome;
  /** Transport runs: the problem, and how a choice becomes a plan. */
  transport?: { problem: TransportProblem; plan: (choiceId: string) => Plan };
  /** Non-transport runs: the sums behind "How this was calculated". */
  how?: (choiceId: string) => EcoHow;
}

/** The option a run chose, from its flags. */
export const choiceOf = (run: MissionRun): string | null => run.flags.find((f) => f.startsWith('choice:'))?.slice(7) ?? null;

/** A run over a transport problem, varying only the fleet or only the route. */
function transportRun(o: {
  missionId: string;
  problem: TransportProblem;
  vary: 'fleet' | 'route';
  choiceKicker: string;
  choiceTitle: string;
  partLabel: string;
  goodLine: string;
  labels?: Record<string, string>;
  sketches?: Record<string, readonly (readonly [number, number])[]>;
}): EcoRun {
  const P = o.problem;
  const plan = (id: string): Plan => (o.vary === 'fleet' ? { ...P.baseline, fleetId: id } : { ...P.baseline, routeId: id });
  const ids = o.vary === 'fleet' ? P.fleets.map((f) => f.id) : P.routes.map((r) => r.id);
  return {
    missionId: o.missionId,
    choiceKicker: o.choiceKicker,
    choiceTitle: o.choiceTitle,
    partLabel: o.partLabel,
    goodLine: o.goodLine,
    transport: { problem: P, plan },
    options: () =>
      ids.map((id) => {
        const r = evaluatePlan(P, plan(id));
        const fleet = P.fleets.find((f) => f.id === id);
        const route = P.routes.find((x) => x.id === id);
        return {
          id,
          label: o.labels?.[id] ?? fleet?.label ?? route?.label ?? id,
          sub: fleet !== undefined ? fleet.blurb : route !== undefined ? route.blurb : '',
          co2Kg: r.feasible ? r.co2Kg : null,
          refused: r.feasible ? null : r.violations[0].text,
          sketch: o.sketches?.[id],
        };
      }),
    outcome: (id) => {
      const c = comparePlan(P, plan(id));
      return { baselineKg: c.baseline.co2Kg, planKg: c.player.co2Kg, lines: c.reasons };
    },
  };
}

/* ---- 2. Mindanao Avenue: Green Route Rescue ---- */

export const GREEN_ROUTE_TRANSPORT: TransportProblem = {
  id: 'green-route',
  demand: {
    people: 2,
    peopleLabel: 'the repair crew',
    peopleDeadline: 11 * 60,
    cargo: [
      { id: 'signs', label: 'Road signs and cones', kg: 90, enclosed: false, deadline: 11 * 60 },
      { id: 'toolkit', label: 'Repair toolkit', kg: 40, enclosed: true, deadline: 11 * 60 },
    ],
  },
  fleets: [{ id: 'van', label: 'Field van', blurb: 'The crew and the gear.', trips: [{ vehicleId: 'van', people: 2, cargo: ['signs', 'toolkit'] }] }],
  routes: [
    road('avenue', 'Straight down the avenue', 'Shortest, but jammed now.', 12, 26, 26, 1.25),
    road('expressway', 'NLEX and the service road', 'Longer, but keeps moving.', 16, 20, 5, 1.05),
    road('lanes', 'Through the back lanes', 'Narrow, winding streets.', 10, 30, 10, 1.2, { maxCargoKg: 300 }),
  ],
  departures: day(),
  availableFrom: {},
  baseline: { fleetId: 'van', routeId: 'avenue', departureId: DAY },
  baselineLabel: 'The usual way: straight down the avenue',
};

/* ---- 3. Karuhatan: Smart Delivery ---- */

export const SMART_DELIVERY_TRANSPORT: TransportProblem = {
  id: 'smart-delivery',
  demand: {
    people: 0,
    peopleDeadline: 12 * 60,
    cargo: [
      { id: 'tools', label: 'Tool orders', kg: 140, enclosed: false, deadline: 12 * 60 },
      { id: 'paint', label: 'Paint tins', kg: 110, enclosed: false, deadline: 12 * 60 },
      { id: 'forms', label: 'Printed forms', kg: 20, enclosed: true, deadline: 12 * 60 },
    ],
  },
  fleets: [
    { id: 'two-vans', label: 'Two vans, one per shop', blurb: 'The usual way: a van each.', trips: [{ vehicleId: 'van', people: 0, cargo: ['tools', 'forms'] }, { vehicleId: 'van', people: 0, cargo: ['paint'] }] },
    { id: 'one-van', label: 'One van, both shops', blurb: 'Everything in one van.', trips: [{ vehicleId: 'van', people: 0, cargo: ['tools', 'paint', 'forms'] }] },
    { id: 'evan', label: 'Electric van, both shops', blurb: 'Everything in the electric van.', trips: [{ vehicleId: 'evan', people: 0, cargo: ['tools', 'paint', 'forms'] }] },
    { id: 'pickup', label: 'Pickup, both shops', blurb: 'Everything in the open pickup.', trips: [{ vehicleId: 'pickup', people: 0, cargo: ['tools', 'paint', 'forms'] }] },
  ],
  routes: [road('town', 'Karuhatan to the two shops', 'Both shops are on one street.', 9, 22, 8, 1.15)],
  departures: day(),
  availableFrom: {},
  baseline: { fleetId: 'two-vans', routeId: 'town', departureId: DAY },
  baselineLabel: 'The usual way: two vans, one per shop',
};

/* ---- 5. Meycauayan: Eco Cargo Challenge ---- */

export const ECO_CARGO_TRANSPORT: TransportProblem = {
  id: 'eco-cargo',
  demand: {
    people: 0,
    peopleDeadline: 12 * 60,
    cargo: [
      { id: 'pipes', label: 'Drain pipes', kg: 260, enclosed: false, deadline: 12 * 60 },
      { id: 'cement', label: 'Cement bags', kg: 200, enclosed: false, deadline: 12 * 60 },
      { id: 'survey', label: 'Survey kit', kg: 25, enclosed: false, deadline: 12 * 60 },
    ],
  },
  fleets: [
    { id: 'truck', label: 'The big depot truck', blurb: 'The usual way: send the big one.', trips: [{ vehicleId: 'truck', people: 0, cargo: ['pipes', 'cement', 'survey'] }] },
    { id: 'pickup', label: 'One pickup', blurb: 'Open back, 700 kg.', trips: [{ vehicleId: 'pickup', people: 0, cargo: ['pipes', 'cement', 'survey'] }] },
    { id: 'van', label: 'One field van', blurb: 'Closed, 400 kg.', trips: [{ vehicleId: 'van', people: 0, cargo: ['pipes', 'cement', 'survey'] }] },
    { id: 'two-vans', label: 'Two field vans', blurb: 'Split the load.', trips: [{ vehicleId: 'van', people: 0, cargo: ['pipes'] }, { vehicleId: 'van', people: 0, cargo: ['cement', 'survey'] }] },
  ],
  routes: [road('site', 'Meycauayan to the work site', 'Expressway most of the way.', 18, 25, 6, 1.05)],
  departures: day(),
  availableFrom: {},
  baseline: { fleetId: 'truck', routeId: 'site', departureId: DAY },
  baselineLabel: 'The usual way: the big depot truck',
};

/* ---- 9. Tambubong: Green Maintenance ---- */

export const GREEN_MAINTENANCE_TRANSPORT: TransportProblem = {
  id: 'green-maintenance',
  demand: {
    people: 3,
    peopleLabel: 'the three technicians',
    peopleDeadline: 11 * 60,
    cargo: [
      { id: 'ladder', label: 'Ladder', kg: 30, enclosed: false, deadline: 11 * 60 },
      { id: 'lamps', label: 'Spare lamps', kg: 25, enclosed: true, deadline: 11 * 60 },
      { id: 'meter', label: 'Test meter', kg: 5, enclosed: true, deadline: 11 * 60 },
    ],
  },
  fleets: [
    {
      id: 'separate',
      label: 'A vehicle for each job',
      blurb: 'The usual way: three trips.',
      trips: [
        { vehicleId: 'sedan', people: 1, cargo: ['lamps'] },
        { vehicleId: 'sedan', people: 1, cargo: ['meter'] },
        { vehicleId: 'pickup', people: 1, cargo: ['ladder'] },
      ],
    },
    { id: 'one-van', label: 'One van, all three jobs', blurb: 'One coordinated trip.', trips: [{ vehicleId: 'van', people: 3, cargo: ['ladder', 'lamps', 'meter'] }] },
    { id: 'evan', label: 'Electric van, all three jobs', blurb: 'One trip, on battery.', trips: [{ vehicleId: 'evan', people: 3, cargo: ['ladder', 'lamps', 'meter'] }] },
    { id: 'truck', label: 'The big truck, all three jobs', blurb: 'One trip, one cab.', trips: [{ vehicleId: 'truck', people: 3, cargo: ['ladder', 'lamps', 'meter'] }] },
  ],
  routes: [road('stretch', 'To the three jobs on one stretch', 'All three are near km 28.', 11, 18, 4, 1.05)],
  departures: day(),
  availableFrom: {},
  baseline: { fleetId: 'separate', routeId: 'stretch', departureId: DAY },
  baselineLabel: 'The usual way: a vehicle for each job',
};

/* ---- 13. Pulilan: Rainy Day Rescue ---- */

export const RAINY_DAY_TRANSPORT: TransportProblem = {
  id: 'rainy-day',
  demand: {
    people: 3,
    peopleLabel: 'the drainage crew',
    peopleDeadline: 10 * 60 + 30,
    cargo: [
      { id: 'pump', label: 'Water pump', kg: 60, enclosed: false, deadline: 10 * 60 + 30 },
      { id: 'bags', label: 'Debris bags', kg: 180, enclosed: false, deadline: 10 * 60 + 30 },
    ],
  },
  fleets: [
    { id: 'van-truck', label: 'Van for the crew, truck for the gear', blurb: 'The usual way: two vehicles.', trips: [{ vehicleId: 'van', people: 3, cargo: ['pump'] }, { vehicleId: 'truck', people: 0, cargo: ['bags'] }] },
    { id: 'van', label: 'One van, crew and gear', blurb: 'Everything in one van.', trips: [{ vehicleId: 'van', people: 3, cargo: ['pump', 'bags'] }] },
    { id: 'pickup-car', label: 'Pickup and station car', blurb: 'Gear in the pickup, crew in the car.', trips: [{ vehicleId: 'pickup', people: 1, cargo: ['pump', 'bags'] }, { vehicleId: 'sedan', people: 2, cargo: [] }] },
    { id: 'truck', label: 'Just the truck', blurb: 'Everyone and everything.', trips: [{ vehicleId: 'truck', people: 3, cargo: ['pump', 'bags'] }] },
  ],
  routes: [road('drain', 'To the drain, in the rain', 'Slow, wet roads.', 14, 25, 12, 1.2)],
  departures: day('9:00 AM'),
  availableFrom: {},
  baseline: { fleetId: 'van-truck', routeId: 'drain', departureId: DAY },
  baselineLabel: 'The usual way: a van and a truck',
};

/* ---- 16. Mexico: Eco Patrol ---- */

/** Each patrol plan's distance is half its round trip: the model counts every journey there and back. */
export const ECO_PATROL_TRANSPORT: TransportProblem = {
  id: 'eco-patrol',
  demand: { people: 2, peopleLabel: 'the patrol team', peopleDeadline: 12 * 60, cargo: [] },
  fleets: [{ id: 'patrol', label: 'Patrol car', blurb: 'Two inspectors.', trips: [{ vehicleId: 'sedan', people: 2, cargo: [] }] }],
  routes: [
    road('each', 'Back to base after each point', '54 km in all.', 27, 45, 9, 1.08),
    road('reported', 'In the order reported', '38 km in all, criss-crossing.', 19, 32, 6, 1.06),
    road('loop', 'One loop, nearest first', '26 km in all, no doubling back.', 13, 22, 4, 1.05),
  ],
  departures: day(),
  availableFrom: {},
  baseline: { fleetId: 'patrol', routeId: 'each', departureId: DAY },
  baselineLabel: 'The usual way: back to base after each point',
};

/* ---- 10. Balagtas: Fuel Saver (tyres, and engine-off while loading) ---- */

/**
 * Underinflated tyres: "about 0.2% for every 1 psi drop in the average pressure of all
 * tires" in gas mileage, US Department of Energy, fueleconomy.gov. Applied here to the
 * diesel van as fuel use, an illustrative simplification. The other figures are game
 * assumptions about a made-up garage.
 */
export const FUEL_SAVER = {
  testKm: 60,
  movingFactor: 1.05,
  psiLow: 8,
  penaltyPerPsi: 0.002,
  penaltySource: 'https://www.fueleconomy.gov/feg/maintain.jsp',
  waits: { 'engine-on': 20, 'engine-off': 0, 'warm-up': 35 } as Record<string, number>,
};

const FUEL_OPTIONS: { id: string; label: string; sub: string }[] = [
  { id: 'engine-on', label: 'Engine on while loading', sub: 'Idles 20 min, as usual.' },
  { id: 'engine-off', label: 'Engine off while loading', sub: 'Start up when it is ready.' },
  { id: 'warm-up', label: 'Long warm-up, engine on', sub: '35 min idling in all.' },
];

export function fuelRun(tyresFixed: boolean, waitId: string): { fuelL: number; co2Kg: number; idleMin: number } {
  const van: VehicleModel = VEHICLES.van;
  const f = FUEL_SAVER;
  const tyre = 1 + (tyresFixed ? 0 : f.psiLow * f.penaltyPerPsi);
  const idleMin = f.waits[waitId] ?? f.waits['engine-on'];
  const fuelL = f.testKm * van.lPerKm * f.movingFactor * tyre + (idleMin / 60) * van.idleLPerH;
  return { fuelL, co2Kg: fuelL * FACTORS.diesel.value, idleMin };
}

const FUEL_SAVER_RUN: EcoRun = {
  missionId: 'fuel-saver',
  choiceKicker: 'Test dispatch',
  choiceTitle: 'How does the van wait?',
  partLabel: 'The test run',
  goodLine: 'Good tyres, no idling: less fuel!',
  options: () =>
    FUEL_OPTIONS.map((o) => ({ id: o.id, label: o.label, sub: o.sub, co2Kg: fuelRun(true, o.id).co2Kg, refused: null })),
  outcome: (id) => {
    const before = fuelRun(false, 'engine-on');
    const after = fuelRun(true, id);
    const lines = [`Tyres back to the right pressure: about ${(FUEL_SAVER.psiLow * FUEL_SAVER.penaltyPerPsi * 100).toFixed(1)}% less fuel on the road.`];
    lines.push(after.idleMin < before.idleMin ? `Idling: ${after.idleMin} min instead of ${before.idleMin}.` : after.idleMin > before.idleMin ? `Idling: ${after.idleMin} min, more than the usual ${before.idleMin}.` : `Idling: the usual ${before.idleMin} min.`);
    return { baselineKg: before.co2Kg, planKg: after.co2Kg, lines };
  },
  how: (id) => {
    const before = fuelRun(false, 'engine-on');
    const after = fuelRun(true, id);
    const f = FUEL_SAVER;
    return {
      intro: `One ${f.testKm} km test run by the made-up garage's field van, with the time it waits while it is loaded.`,
      sums: [
        `Fuel = ${f.testKm} km × ${VEHICLES.van.lPerKm.toFixed(3)} L/km × ${f.movingFactor} traffic × tyre effect + idling minutes × ${(VEHICLES.van.idleLPerH / 60).toFixed(3)} L/min.`,
        `Tyre effect: ${f.psiLow} psi low adds ${(f.psiLow * f.penaltyPerPsi * 100).toFixed(1)}% (0.2% per psi, US DOE). CO₂ = fuel × ${FACTORS.diesel.value.toFixed(2)} kg/L.`,
      ],
      rows: [
        ['Usual way', `${before.idleMin} min idling, tyres low`, `${before.fuelL.toFixed(2)} L, ${before.co2Kg.toFixed(1)} kg`],
        ['Your run', `${after.idleMin} min idling, tyres right`, `${after.fuelL.toFixed(2)} L, ${after.co2Kg.toFixed(1)} kg`],
      ],
      sources: `Tyre effect: US Department of Energy, ${f.penaltySource}, for gas mileage, used here as an illustration. Van fuel and idling: as on the transport board. Distance, waiting and pressures are game assumptions.`,
    };
  },
};

/* ---- 17. Angeles: Night Shift Guardians (lighting) ---- */

/** The made-up facility's yard lamps, the same type as the depot's (core/facility.ts). Safety lamps and sensor hours are game assumptions. */
export const NIGHT_LIGHTS = {
  lamps: ASSUMPTIONS.floods.count,
  watts: ASSUMPTIONS.floods.wattsOld,
  nightHours: ASSUMPTIONS.floods.nightHours,
  safetyLamps: 4,
  sensorHours: 2,
};

const LIGHT_OPTIONS: { id: string; label: string; sub: string }[] = [
  { id: 'smart', label: 'Safety lamps all night, the rest on sensors', sub: '4 lamps on, 8 when someone is there.' },
  { id: 'dusk', label: 'Every lamp, dusk to dawn', sub: '12 lamps, 12 hours.' },
  { id: 'stuck', label: 'Leave them on day and night', sub: 'How the broken controller left them.' },
  { id: 'off', label: 'Switch everything off', sub: 'No lamps at all.' },
];

export function nightLighting(id: string): { kWh: number; co2Kg: number } | null {
  const L = NIGHT_LIGHTS;
  const kw = L.watts / 1000;
  const kWh = id === 'stuck' ? L.lamps * kw * 24 : id === 'dusk' ? L.lamps * kw * L.nightHours : id === 'smart' ? L.safetyLamps * kw * L.nightHours + (L.lamps - L.safetyLamps) * kw * L.sensorHours : null;
  return kWh === null ? null : { kWh, co2Kg: kWh * FACTORS.grid.value };
}

const NIGHT_SHIFT_RUN: EcoRun = {
  missionId: 'night-shift',
  choiceKicker: 'Lighting controller',
  choiceTitle: 'Set tonight’s lighting',
  partLabel: 'The yard lamps, one day',
  goodLine: 'Safe and bright, with less power!',
  options: () =>
    LIGHT_OPTIONS.map((o) => {
      const r = nightLighting(o.id);
      return { id: o.id, label: o.label, sub: o.sub, co2Kg: r?.co2Kg ?? null, refused: r === null ? 'Safety lamps must stay on all night.' : null };
    }),
  outcome: (id) => {
    const before = nightLighting('stuck') as { kWh: number; co2Kg: number };
    const after = nightLighting(id) ?? before;
    const lines = [`Grid electricity: ${after.kWh.toFixed(1)} kWh instead of ${before.kWh.toFixed(1)}.`];
    if (id === 'smart') {
      lines.push(`${NIGHT_LIGHTS.safetyLamps} safety lamps stay on all night.`);
    }
    return { baselineKg: before.co2Kg, planKg: after.co2Kg, lines };
  },
  how: (id) => {
    const L = NIGHT_LIGHTS;
    const before = nightLighting('stuck') as { kWh: number; co2Kg: number };
    const after = nightLighting(id) ?? before;
    return {
      intro: 'One day of yard lighting at a made-up facility. Every wattage and hour is a game assumption.',
      sums: [`kWh = lamps × ${L.watts} W × hours on ÷ 1000. CO₂ = kWh × ${FACTORS.grid.value} kg/kWh (Philippine DOE, Luzon-Visayas grid).`],
      rows: [
        ['As found', `${L.lamps} lamps, 24 h`, `${before.kWh.toFixed(1)} kWh, ${before.co2Kg.toFixed(1)} kg`],
        ['Your setting', LIGHT_OPTIONS.find((o) => o.id === id)?.sub ?? '', `${after.kWh.toFixed(1)} kWh, ${after.co2Kg.toFixed(1)} kg`],
      ],
      sources: `Lamp type and night length: the depot assumptions in Solar Power Rescue (${L.lamps} lamps, ${L.watts} W, ${L.nightHours} h). ${L.safetyLamps} safety lamps and ${L.sensorHours} h on sensors are game assumptions. Grid factor: Philippine DOE.`,
    };
  },
};

/* ---- The registry of runs ---- */

const SKETCH_BASE: [number, number] = [12, 86];
const PATROL_A: [number, number] = [28, 30];
const PATROL_B: [number, number] = [70, 18];
const PATROL_C: [number, number] = [86, 64];

export const ECO_RUNS: Record<string, EcoRun> = {
  'green-route': transportRun({
    missionId: 'green-route',
    problem: GREEN_ROUTE_TRANSPORT,
    vary: 'route',
    choiceKicker: 'Route planner',
    choiceTitle: 'Choose the route',
    partLabel: 'The trip to the site',
    goodLine: 'Less waiting in traffic, less CO₂!',
    sketches: {
      avenue: [SKETCH_BASE, [50, 50], [88, 14]],
      expressway: [SKETCH_BASE, [14, 30], [40, 12], [88, 14]],
      lanes: [SKETCH_BASE, [30, 70], [40, 50], [60, 56], [70, 30], [88, 14]],
    },
  }),
  'smart-delivery': transportRun({
    missionId: 'smart-delivery',
    problem: SMART_DELIVERY_TRANSPORT,
    vary: 'fleet',
    choiceKicker: 'Delivery planner',
    choiceTitle: 'Combine the deliveries',
    partLabel: 'The delivery run',
    goodLine: 'One trip instead of two!',
  }),
  'eco-cargo': transportRun({
    missionId: 'eco-cargo',
    problem: ECO_CARGO_TRANSPORT,
    vary: 'fleet',
    choiceKicker: 'Cargo yard',
    choiceTitle: 'Pick the right vehicle',
    partLabel: 'The cargo run',
    goodLine: 'The right size, less fuel!',
  }),
  'green-maintenance': transportRun({
    missionId: 'green-maintenance',
    problem: GREEN_MAINTENANCE_TRANSPORT,
    vary: 'fleet',
    choiceKicker: 'Dispatch',
    choiceTitle: 'Plan one dispatch',
    partLabel: 'The maintenance trips',
    goodLine: 'One trip for three jobs!',
  }),
  'fuel-saver': FUEL_SAVER_RUN,
  'night-shift': NIGHT_SHIFT_RUN,
  'rainy-day': transportRun({
    missionId: 'rainy-day',
    problem: RAINY_DAY_TRANSPORT,
    vary: 'fleet',
    choiceKicker: 'Maintenance team',
    choiceTitle: 'Send the drainage crew',
    partLabel: 'The crew’s trip',
    goodLine: 'One vehicle instead of two!',
  }),
  'eco-patrol': transportRun({
    missionId: 'eco-patrol',
    problem: ECO_PATROL_TRANSPORT,
    vary: 'route',
    choiceKicker: 'Patrol planner',
    choiceTitle: 'Choose the patrol route',
    partLabel: 'The patrol',
    goodLine: 'No doubling back, less CO₂!',
    sketches: {
      each: [SKETCH_BASE, PATROL_A, SKETCH_BASE, PATROL_B, SKETCH_BASE, PATROL_C, SKETCH_BASE],
      reported: [SKETCH_BASE, PATROL_B, PATROL_A, PATROL_C, SKETCH_BASE],
      loop: [SKETCH_BASE, PATROL_A, PATROL_B, PATROL_C, SKETCH_BASE],
    },
  }),
};

/* ---- The missions ---- */

const nlex = (o: { id: string; title: string; locationId: string; summary: string; fiction: string; objective: { id: string; label: string }; tasks: readonly string[]; transport: TransportProblem | null; steps: MissionDef['steps'] }): MissionDef => ({
  id: o.id,
  title: o.title,
  chapter: 0,
  kind: 'nlex',
  locationId: o.locationId,
  summary: o.summary,
  fiction: o.fiction,
  environmentObjectives: [o.objective],
  speciesIds: [],
  regionId: o.locationId,
  storyIndividuals: [],
  requiredTasks: o.tasks,
  serviceConstraints: '',
  transport: o.transport,
  rescueObjectives: [],
  habitatObjectives: [],
  evidenceReferences: [],
  rewards: REWARDS,
  steps: o.steps,
});

const got = (n: number): string[] => Array.from({ length: n }, (_, i) => `got:${i}`);
const seen = (n: number): string[] => Array.from({ length: n }, (_, i) => `seen:${i}`);

export const GREEN_ROUTE_MISSION = nlex({
  id: 'green-route',
  title: 'Green Route Rescue',
  locationId: 'mindanao-avenue',
  summary: 'Get the repair crew to the site the smart way!',
  fiction: 'A made-up service yard and route. Distances and traffic are invented for the game.',
  objective: { id: 'route-repair-sent', label: 'Repair supplies delivered' },
  tasks: ['Pick up the supplies', 'Choose a route', 'Complete the delivery'],
  transport: GREEN_ROUTE_TRANSPORT,
  steps: [
    { id: 'pick', zone: 'yard', objective: 'obj.routePick', needs: got(3), target: 'items' },
    { id: 'route', zone: 'yard', objective: 'obj.routeChoose', needs: ['decided'], target: 'van' },
    { id: 'deliver', zone: 'yard', objective: 'obj.routeDeliver', needs: ['sent'], target: 'van' },
  ],
});

export const SMART_DELIVERY_MISSION = nlex({
  id: 'smart-delivery',
  title: 'Smart Delivery',
  locationId: 'karuhatan',
  summary: 'Two shops, one street: can one trip do it?',
  fiction: 'A made-up delivery hub and shops. Loads and distances are invented for the game.',
  objective: { id: 'shop-orders-sent', label: 'Shop orders delivered' },
  tasks: ['Collect the parcels', 'Combine the deliveries', 'Dispatch the vehicle'],
  transport: SMART_DELIVERY_TRANSPORT,
  steps: [
    { id: 'collect', zone: 'yard', objective: 'obj.smartCollect', needs: got(4), target: 'items' },
    { id: 'combine', zone: 'yard', objective: 'obj.smartCombine', needs: ['decided'], target: 'van' },
    { id: 'dispatch', zone: 'yard', objective: 'obj.smartDispatch', needs: ['sent'], target: 'van' },
  ],
});

export const ECO_CARGO_MISSION = nlex({
  id: 'eco-cargo',
  title: 'Eco Cargo Challenge',
  locationId: 'meycauayan',
  summary: 'Pick the right vehicle for a heavy load!',
  fiction: 'A made-up cargo yard. Loads and distances are invented for the game.',
  objective: { id: 'cargo-sent', label: 'Work-site cargo sent' },
  tasks: ['Find the supplies', 'Load the right vehicle', 'Send the cargo'],
  transport: ECO_CARGO_TRANSPORT,
  steps: [
    { id: 'find', zone: 'yard', objective: 'obj.cargoFind', needs: seen(1), target: 'pile' },
    { id: 'load', zone: 'yard', objective: 'obj.cargoLoad', needs: ['decided', 'loaded'], target: 'van' },
    { id: 'send', zone: 'yard', objective: 'obj.cargoSend', needs: ['sent'], target: 'van' },
  ],
});

export const GREEN_MAINTENANCE_MISSION = nlex({
  id: 'green-maintenance',
  title: 'Green Maintenance',
  locationId: 'tambubong',
  summary: 'Three repair jobs: send one trip, not three!',
  fiction: 'A made-up maintenance yard. Jobs and distances are invented for the game.',
  objective: { id: 'maintenance-done', label: 'Roadside repairs done' },
  tasks: ['Inspect the equipment', 'Collect the repair tools', 'Send one dispatch'],
  transport: GREEN_MAINTENANCE_TRANSPORT,
  steps: [
    { id: 'inspect', zone: 'depot', objective: 'obj.maintInspect', needs: seen(2), target: 'points' },
    { id: 'tools', zone: 'depot', objective: 'obj.maintTools', needs: got(3), target: 'items' },
    { id: 'dispatch', zone: 'depot', objective: 'obj.maintDispatch', needs: ['decided', 'sent'], target: 'van' },
  ],
});

export const FUEL_SAVER_MISSION = nlex({
  id: 'fuel-saver',
  title: 'Fuel Saver Challenge',
  locationId: 'balagtas',
  summary: 'Tune up the service van to save fuel!',
  fiction: 'A made-up garage and van. The distance and waiting times are game assumptions.',
  objective: { id: 'van-tuned', label: 'Service van tuned up' },
  tasks: ['Inspect the service van', 'Fix the tyre pressure', 'Run a test dispatch'],
  transport: null,
  steps: [
    { id: 'inspect', zone: 'depot', objective: 'obj.fuelInspect', needs: seen(1), target: 'van' },
    { id: 'fix', zone: 'depot', objective: 'obj.fuelFix', needs: ['fixed'], target: 'van' },
    { id: 'test', zone: 'depot', objective: 'obj.fuelTest', needs: ['decided', 'sent'], target: 'van' },
  ],
});

export const NIGHT_SHIFT_MISSION = nlex({
  id: 'night-shift',
  title: 'Night Shift Guardians',
  locationId: 'angeles',
  summary: 'The yard lamps are burning power all day!',
  fiction: 'A made-up night facility. Every wattage and hour is a game assumption.',
  objective: { id: 'lights-repaired', label: 'Lighting controller repaired' },
  tasks: ['Find the control room', 'Repair the lighting controller', 'Switch on smart lighting'],
  transport: null,
  steps: [
    { id: 'find', zone: 'depot', objective: 'obj.nightFind', needs: seen(1), target: 'office' },
    { id: 'repair', zone: 'depot', objective: 'obj.nightRepair', needs: ['fixed'], target: 'office' },
    { id: 'lights', zone: 'depot', objective: 'obj.nightLights', needs: ['decided'], target: 'office' },
  ],
});

export const RAINY_DAY_MISSION = nlex({
  id: 'rainy-day',
  title: 'Rainy Day Rescue',
  locationId: 'pulilan',
  summary: 'A blocked drain is flooding the road in the rain!',
  fiction: 'A made-up roadside drain. Only the crew’s trip is counted for CO₂.',
  objective: { id: 'drain-cleared', label: 'Roadside drain cleared' },
  tasks: ['Find the blocked drain', 'Remove the debris', 'Help the maintenance team'],
  transport: RAINY_DAY_TRANSPORT,
  steps: [
    { id: 'find', zone: 'river', objective: 'obj.rainFind', needs: seen(1), target: 'drain' },
    { id: 'clear', zone: 'river', objective: 'obj.rainClear', needs: got(3), target: 'items' },
    { id: 'help', zone: 'river', objective: 'obj.rainHelp', needs: ['decided', 'sent'], target: 'van' },
  ],
});

export const ECO_PATROL_MISSION = nlex({
  id: 'eco-patrol',
  title: 'Eco Patrol',
  locationId: 'mexico',
  summary: 'Plan a patrol that never doubles back!',
  fiction: 'A made-up patrol base. Distances are invented for the game.',
  objective: { id: 'patrol-done', label: 'Roadside inspection done' },
  tasks: ['Find the inspection points', 'Choose the patrol route', 'Complete the inspection'],
  transport: ECO_PATROL_TRANSPORT,
  steps: [
    { id: 'points', zone: 'river', objective: 'obj.patrolPoints', needs: seen(3), target: 'points' },
    { id: 'route', zone: 'river', objective: 'obj.patrolRoute', needs: ['decided'], target: 'van' },
    { id: 'patrol', zone: 'river', objective: 'obj.patrolGo', needs: ['sent'], target: 'van' },
  ],
});

export const ECO_RUN_MISSIONS: readonly MissionDef[] = [
  GREEN_ROUTE_MISSION,
  SMART_DELIVERY_MISSION,
  ECO_CARGO_MISSION,
  GREEN_MAINTENANCE_MISSION,
  FUEL_SAVER_MISSION,
  RAINY_DAY_MISSION,
  ECO_PATROL_MISSION,
  NIGHT_SHIFT_MISSION,
];

/** Each eco run's simulated comparison, from the run's choice. Null until something was chosen. */
export function ecoOutcome(run: MissionRun): (EcoOutcome & { run: EcoRun; choiceId: string }) | null {
  const r = ECO_RUNS[run.missionId];
  const id = choiceOf(run);
  if (r === undefined || id === null) {
    return null;
  }
  return { ...r.outcome(id), run: r, choiceId: id };
}
