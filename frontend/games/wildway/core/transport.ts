import { journey, savings, VEHICLES, type JourneyResult, type Savings, type VehicleModel } from './emissions';

/**
 * A mission's transport problem: what must get where and by when, what is available,
 * and the plans the player can put together from fleets, routes and departure times.
 * The player's plan and the baseline serve exactly the same demand on the same day; a
 * plan that does not get everything there cannot be dispatched, however little it emits.
 */

export interface CargoItem {
  id: string;
  label: string;
  kg: number;
  /** Must ride in a closed, clean compartment. */
  enclosed: boolean;
  /** Latest arrival, minutes after midnight. */
  deadline: number;
  /** Cargo that must not share a vehicle with this. */
  notWith?: readonly string[];
}

export interface Demand {
  /** Passengers who must get there. */
  people: number;
  /** Who they are, for the board and its messages. */
  peopleLabel?: string;
  /** Latest arrival for people, minutes after midnight. */
  peopleDeadline: number;
  cargo: readonly CargoItem[];
}

export interface Trip {
  vehicleId: string;
  people: number;
  cargo: readonly string[];
}

export interface FleetOption {
  id: string;
  label: string;
  blurb: string;
  trips: readonly Trip[];
}

export interface RouteWindow {
  /** Minutes standing still, each way. */
  stationaryMin: number;
  movingFactor: number;
}

export interface RouteOption {
  id: string;
  label: string;
  blurb: string;
  /** Each way. */
  distanceKm: number;
  /** Minutes moving, each way. */
  movingMin: number;
  /** Conditions by departure id. */
  windows: Record<string, RouteWindow>;
  /** If set, nothing may use this route, and this says why. */
  closedBecause?: string;
  /** Heavier vehicles may not use it. */
  maxCargoKg?: number;
}

export interface DepartureOption {
  id: string;
  label: string;
  /** Minutes after midnight. */
  time: number;
}

export interface TransportProblem {
  id: string;
  demand: Demand;
  fleets: readonly FleetOption[];
  routes: readonly RouteOption[];
  departures: readonly DepartureOption[];
  /** Earliest each vehicle is free: essential services come first. */
  availableFrom: Readonly<Record<string, { time: number; because: string }>>;
  baseline: Plan;
  baselineLabel: string;
}

export interface Plan {
  fleetId: string;
  routeId: string;
  departureId: string;
}

export interface Violation {
  kind: 'unserved' | 'seats' | 'capacity' | 'enclosed' | 'compatibility' | 'deadline' | 'availability' | 'route' | 'battery' | 'overserved';
  text: string;
}

export interface TripResult {
  vehicle: VehicleModel;
  people: number;
  cargo: readonly string[];
  outbound: JourneyResult;
  back: JourneyResult;
  /** Both ways. */
  co2Kg: number;
  distanceKm: number;
  stationaryMin: number;
  arrival: number;
}

export interface PlanResult {
  plan: Plan;
  feasible: boolean;
  violations: Violation[];
  trips: TripResult[];
  co2Kg: number;
  vehicleKm: number;
  stationaryMin: number;
  idleFuelL: number;
  arrival: number;
}

const clockText = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

export { clockText };

const capital = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);

/** Works out a plan: every constraint, then the sums. Infeasible plans still report their sums, for comparison. */
export function evaluatePlan(problem: TransportProblem, plan: Plan): PlanResult {
  const fleet = problem.fleets.find((f) => f.id === plan.fleetId);
  const route = problem.routes.find((r) => r.id === plan.routeId);
  const departure = problem.departures.find((d) => d.id === plan.departureId);
  if (fleet === undefined || route === undefined || departure === undefined) {
    throw new Error(`Unknown plan: ${JSON.stringify(plan)}`);
  }
  const violations: Violation[] = [];
  const window = route.windows[departure.id];
  if (route.closedBecause !== undefined) {
    violations.push({ kind: 'route', text: route.closedBecause });
  }
  const trips: TripResult[] = fleet.trips.map((trip) => {
    const vehicle = VEHICLES[trip.vehicleId];
    const conditions = { distanceKm: route.distanceKm, stationaryMin: window.stationaryMin, movingFactor: window.movingFactor };
    const outbound = journey(vehicle, conditions);
    const back = journey(vehicle, conditions);
    const arrival = departure.time + route.movingMin + window.stationaryMin;
    if (trip.people > vehicle.seats) {
      violations.push({ kind: 'seats', text: `${vehicle.name} has ${vehicle.seats} passenger ${vehicle.seats === 1 ? 'seat' : 'seats'}, not ${trip.people}.` });
    }
    const items = trip.cargo.map((id) => problem.demand.cargo.find((c) => c.id === id)).filter((c): c is CargoItem => c !== undefined);
    const kg = items.reduce((a, c) => a + c.kg, 0);
    if (kg > vehicle.cargoKg) {
      violations.push({ kind: 'capacity', text: `${vehicle.name} carries ${vehicle.cargoKg} kg, and this load is ${kg} kg.` });
    }
    if (route.maxCargoKg !== undefined && vehicle.cargoKg > route.maxCargoKg) {
      violations.push({ kind: 'route', text: `${route.label} cannot take a vehicle as large as the ${vehicle.name}.` });
    }
    for (const item of items) {
      if (item.enclosed && !vehicle.enclosed) {
        violations.push({ kind: 'enclosed', text: `${item.label} must ride enclosed, and the ${vehicle.name} is open.` });
      }
      if (arrival > item.deadline) {
        violations.push({ kind: 'deadline', text: `${item.label} would arrive at ${clockText(arrival)}, after the ${clockText(item.deadline)} deadline.` });
      }
      /* Enough separate bins keep sorted loads apart in one vehicle. */
      const binned = (vehicle.compartments ?? 1) >= items.length;
      for (const other of binned ? [] : item.notWith ?? []) {
        if (trip.cargo.includes(other)) {
          const otherItem = problem.demand.cargo.find((c) => c.id === other);
          if (otherItem !== undefined && item.id < other) {
            violations.push({ kind: 'compatibility', text: `${item.label} cannot share a vehicle with ${otherItem.label}.` });
          }
        }
      }
    }
    if (trip.people > 0 && arrival > problem.demand.peopleDeadline) {
      violations.push({ kind: 'deadline', text: `${capital(problem.demand.peopleLabel ?? 'the field team')} would arrive at ${clockText(arrival)}, after the ${clockText(problem.demand.peopleDeadline)} deadline.` });
    }
    const free = problem.availableFrom[vehicle.id];
    if (free !== undefined && departure.time < free.time) {
      violations.push({ kind: 'availability', text: `${vehicle.name}: ${free.because} until ${clockText(free.time)}.` });
    }
    if (vehicle.energy === 'electric') {
      const need = outbound.batteryKWh + back.batteryKWh;
      if (need > vehicle.usableKWh) {
        violations.push({ kind: 'battery', text: `${vehicle.name} needs ${need.toFixed(1)} kWh for the round trip and has ${vehicle.usableKWh} kWh.` });
      }
    }
    return {
      vehicle,
      people: trip.people,
      cargo: trip.cargo,
      outbound,
      back,
      co2Kg: outbound.co2Kg + back.co2Kg,
      distanceKm: route.distanceKm * 2,
      stationaryMin: window.stationaryMin * 2,
      arrival,
    };
  });
  /* Everything demanded must be served, exactly: this is what keeps comparisons fair. */
  const peopleServed = fleet.trips.reduce((a, t) => a + t.people, 0);
  if (peopleServed < problem.demand.people) {
    violations.push({ kind: 'unserved', text: `Only ${peopleServed} of the ${problem.demand.people} people in ${problem.demand.peopleLabel ?? 'the field team'} would get there.` });
  } else if (peopleServed > problem.demand.people) {
    violations.push({ kind: 'overserved', text: `This counts more people than ${problem.demand.peopleLabel ?? 'the field team'} has.` });
  }
  for (const item of problem.demand.cargo) {
    const carried = fleet.trips.filter((t) => t.cargo.includes(item.id)).length;
    if (carried === 0) {
      violations.push({ kind: 'unserved', text: `${item.label} would be left behind.` });
    } else if (carried > 1) {
      violations.push({ kind: 'overserved', text: `${item.label} is listed on two vehicles.` });
    }
  }
  return {
    plan,
    feasible: violations.length === 0,
    violations,
    trips,
    co2Kg: trips.reduce((a, t) => a + t.co2Kg, 0),
    vehicleKm: trips.reduce((a, t) => a + t.distanceKm, 0),
    stationaryMin: trips.reduce((a, t) => a + t.stationaryMin, 0),
    idleFuelL: trips.reduce((a, t) => a + t.outbound.idleFuelL + t.back.idleFuelL, 0),
    arrival: trips.reduce((a, t) => Math.max(a, t.arrival), 0),
  };
}

export interface Comparison {
  baseline: PlanResult;
  player: PlanResult;
  savings: Savings;
  /** Why it did better or worse, in plain words, from the actual numbers. */
  reasons: string[];
}

export function comparePlan(problem: TransportProblem, plan: Plan): Comparison {
  const baseline = evaluatePlan(problem, problem.baseline);
  const player = evaluatePlan(problem, plan);
  const reasons: string[] = [];
  const baseCount = baseline.trips.length;
  const count = player.trips.length;
  if (count < baseCount) {
    reasons.push(`Shared loads: ${count} ${count === 1 ? 'vehicle' : 'vehicles'} instead of ${baseCount}.`);
  } else if (count > baseCount) {
    reasons.push(`More vehicles on the road: ${count} instead of ${baseCount}.`);
  }
  const kmDiff = player.vehicleKm - baseline.vehicleKm;
  if (Math.abs(kmDiff) >= 1) {
    reasons.push(`${Math.abs(kmDiff).toFixed(0)} ${kmDiff < 0 ? 'fewer' : 'more'} vehicle-km in all.`);
  }
  const idleDiff = player.stationaryMin - baseline.stationaryMin;
  if (Math.abs(idleDiff) >= 1) {
    reasons.push(`${Math.abs(idleDiff).toFixed(0)} ${idleDiff < 0 ? 'fewer' : 'more'} vehicle-minutes standing still in traffic.`);
  }
  const usesElectric = player.trips.some((t) => t.vehicle.energy === 'electric');
  if (usesElectric) {
    reasons.push('Part of the plan runs on electricity, counted at the charger with the Luzon-Visayas grid factor.');
  }
  return { baseline, player, savings: savings(baseline.co2Kg, player.co2Kg), reasons };
}

/* ---- The Hornbill Homecoming's transport problem ---- */

const MAIN_KIT = 'kit';
const SAPLINGS = 'saplings';

const twoWindows = (rush: RouteWindow, mid: RouteWindow, late: RouteWindow): Record<string, RouteWindow> => ({ early: rush, mid, late });

export const HORNBILL_TRANSPORT: TransportProblem = {
  id: 'hornbill-homecoming',
  demand: {
    people: 3,
    peopleDeadline: 10 * 60,
    cargo: [
      { id: MAIN_KIT, label: 'The assessment kit', kg: 40, enclosed: true, deadline: 10 * 60, notWith: ['fuel'] },
      { id: SAPLINGS, label: 'Native saplings and tools', kg: 300, enclosed: false, deadline: 11 * 60 + 30 },
    ],
  },
  fleets: [
    {
      id: 'separate',
      label: 'Separate runs',
      blurb: 'Station car for the team and kit, depot truck for the saplings. The usual way.',
      trips: [
        { vehicleId: 'sedan', people: 3, cargo: [MAIN_KIT] },
        { vehicleId: 'truck', people: 0, cargo: [SAPLINGS] },
      ],
    },
    {
      id: 'car-pickup',
      label: 'Car and pickup',
      blurb: 'Station car for the team and kit, pickup for the saplings.',
      trips: [
        { vehicleId: 'sedan', people: 3, cargo: [MAIN_KIT] },
        { vehicleId: 'pickup', people: 0, cargo: [SAPLINGS] },
      ],
    },
    {
      id: 'shared-van',
      label: 'One shared van',
      blurb: 'Everyone and everything in the field van.',
      trips: [{ vehicleId: 'van', people: 3, cargo: [MAIN_KIT, SAPLINGS] }],
    },
    {
      id: 'electric-van',
      label: 'One electric van',
      blurb: 'Everyone and everything in the electric van.',
      trips: [{ vehicleId: 'evan', people: 3, cargo: [MAIN_KIT, SAPLINGS] }],
    },
    {
      id: 'solo',
      label: 'Everyone drives',
      blurb: 'Van for the team, car for the kit, pickup for the saplings.',
      trips: [
        { vehicleId: 'van', people: 3, cargo: [] },
        { vehicleId: 'sedan', people: 0, cargo: [MAIN_KIT] },
        { vehicleId: 'pickup', people: 0, cargo: [SAPLINGS] },
      ],
    },
    {
      id: 'pickup-only',
      label: 'Just the pickup',
      blurb: 'One pickup, loaded up.',
      trips: [{ vehicleId: 'pickup', people: 3, cargo: [MAIN_KIT, SAPLINGS] }],
    },
  ],
  routes: [
    {
      id: 'greenway',
      label: 'NLEX and Ridge Road',
      blurb: 'Longer, but it keeps moving.',
      distanceKm: 34,
      movingMin: 38,
      windows: twoWindows({ stationaryMin: 14, movingFactor: 1.06 }, { stationaryMin: 3, movingFactor: 1 }, { stationaryMin: 2, movingFactor: 1 }),
    },
    {
      id: 'town',
      label: 'Through town',
      blurb: 'The shortest road, with a market and school crossings.',
      distanceKm: 22,
      movingMin: 40,
      /* At the morning school run the short road stops being the low-carbon one. */
      windows: twoWindows({ stationaryMin: 46, movingFactor: 1.42 }, { stationaryMin: 13, movingFactor: 1.15 }, { stationaryMin: 10, movingFactor: 1.12 }),
      maxCargoKg: 1000,
    },
    {
      id: 'logging',
      label: 'Old logging road',
      blurb: 'Direct, straight through the forest.',
      distanceKm: 16,
      movingMin: 44,
      windows: twoWindows({ stationaryMin: 0, movingFactor: 1.1 }, { stationaryMin: 0, movingFactor: 1.1 }, { stationaryMin: 0, movingFactor: 1.1 }),
      closedBecause: 'Rangers closed the old logging road: it runs through the area being kept quiet.',
    },
  ],
  departures: [
    { id: 'early', label: '7:00 AM', time: 7 * 60 },
    { id: 'mid', label: '8:30 AM', time: 8 * 60 + 30 },
    { id: 'late', label: '10:30 AM', time: 10 * 60 + 30 },
  ],
  availableFrom: {
    evan: { time: 8 * 60 + 15, because: 'on the morning clinic run' },
  },
  baseline: { fleetId: 'separate', routeId: 'greenway', departureId: 'early' },
  baselineLabel: 'The station’s usual way: separate runs, by NLEX, leaving at 7:00 AM',
};

/* ---- River Rescue: taking the sorted waste to the barangay recovery facility ---- */

const BIO = 'bio';
const RECYCLE = 'recycle';
const RESIDUAL = 'residual';
const keepApart = (id: string): string[] => [BIO, RECYCLE, RESIDUAL].filter((x) => x !== id);

export const RIVER_TRANSPORT: TransportProblem = {
  id: 'nlex-river',
  demand: {
    people: 1,
    peopleLabel: 'the collector',
    peopleDeadline: 14 * 60,
    cargo: [
      { id: BIO, label: 'Biodegradable waste', kg: 180, enclosed: false, deadline: 14 * 60, notWith: keepApart(BIO) },
      { id: RECYCLE, label: 'Recyclables', kg: 90, enclosed: false, deadline: 14 * 60, notWith: keepApart(RECYCLE) },
      { id: RESIDUAL, label: 'Residual waste', kg: 120, enclosed: false, deadline: 14 * 60, notWith: keepApart(RESIDUAL) },
    ],
  },
  fleets: [
    {
      id: 'three-runs',
      label: 'Three truck runs',
      blurb: 'The city truck makes a run for each kind of waste. The usual way.',
      trips: [
        { vehicleId: 'truck', people: 1, cargo: [BIO] },
        { vehicleId: 'truck', people: 0, cargo: [RECYCLE] },
        { vehicleId: 'truck', people: 0, cargo: [RESIDUAL] },
      ],
    },
    {
      id: 'three-bin-truck',
      label: 'One three-bin truck',
      blurb: 'A truck with three separate bins takes everything at once.',
      trips: [{ vehicleId: 'segtruck', people: 1, cargo: [BIO, RECYCLE, RESIDUAL] }],
    },
    {
      id: 'etrikes',
      label: 'Three e-trikes',
      blurb: 'One barangay e-trike for each kind.',
      trips: [
        { vehicleId: 'etrike', people: 1, cargo: [BIO] },
        { vehicleId: 'etrike', people: 0, cargo: [RECYCLE] },
        { vehicleId: 'etrike', people: 0, cargo: [RESIDUAL] },
      ],
    },
    {
      id: 'two-etrikes',
      label: 'Two e-trikes',
      blurb: 'Biodegradable in one, everything else in the other.',
      trips: [
        { vehicleId: 'etrike', people: 1, cargo: [BIO] },
        { vehicleId: 'etrike', people: 0, cargo: [RECYCLE, RESIDUAL] },
      ],
    },
    {
      id: 'pickup-mixed',
      label: 'One pickup, all in',
      blurb: 'Everything in the back of the pickup.',
      trips: [{ vehicleId: 'pickup', people: 1, cargo: [BIO, RECYCLE, RESIDUAL] }],
    },
  ],
  routes: [
    {
      id: 'main',
      label: 'Main road',
      blurb: 'Past the public market.',
      distanceKm: 6,
      movingMin: 14,
      windows: { early: { stationaryMin: 2, movingFactor: 1.05 }, mid: { stationaryMin: 18, movingFactor: 1.35 }, late: { stationaryMin: 6, movingFactor: 1.1 } },
    },
    {
      id: 'lane',
      label: 'Riverside lane',
      blurb: 'Along the creek. Too narrow for trucks.',
      distanceKm: 2.5,
      movingMin: 9,
      windows: { early: { stationaryMin: 0, movingFactor: 1 }, mid: { stationaryMin: 4, movingFactor: 1.2 }, late: { stationaryMin: 1, movingFactor: 1.05 } },
      maxCargoKg: 800,
    },
  ],
  departures: [
    { id: 'early', label: '6:00 AM', time: 6 * 60 },
    { id: 'mid', label: '9:00 AM', time: 9 * 60 },
    { id: 'late', label: '2:00 PM', time: 14 * 60 },
  ],
  availableFrom: {
    etrike: { time: 7 * 60 + 30, because: 'on the school service run' },
  },
  baseline: { fleetId: 'three-runs', routeId: 'main', departureId: 'early' },
  baselineLabel: 'The usual way: three truck runs on the main road at 6:00 AM',
};

/* ---- Eco Delivery Rush: the field supplies from the Balintawak yard to the ridge's partner station ---- */

const DELIVERY_DEADLINE = 12 * 60;

/** Everything the team gathered and packed at the yard. Packing it tight is what lets one van take it all. */
export const DELIVERY_TRANSPORT: TransportProblem = {
  id: 'nlex-delivery',
  demand: {
    people: 2,
    peopleLabel: 'the field technicians',
    peopleDeadline: DELIVERY_DEADLINE,
    cargo: [
      { id: 'seedlings', label: 'Seedling trays', kg: 80, enclosed: false, deadline: DELIVERY_DEADLINE },
      { id: 'fieldgear', label: 'Tents, rope, tools and water', kg: 75, enclosed: false, deadline: DELIVERY_DEADLINE },
      { id: 'kit', label: 'Specialist kit and camera traps', kg: 60, enclosed: true, deadline: DELIVERY_DEADLINE },
    ],
  },
  fleets: [
    {
      id: 'two-vans',
      label: 'Two vans, loaded loose',
      blurb: 'The usual way: whatever does not fit goes in a second van.',
      trips: [
        { vehicleId: 'van', people: 2, cargo: ['kit', 'fieldgear'] },
        { vehicleId: 'van', people: 0, cargo: ['seedlings'] },
      ],
    },
    { id: 'one-van', label: 'One van, packed tight', blurb: 'Everything the team packed, in one field van.', trips: [{ vehicleId: 'van', people: 2, cargo: ['kit', 'fieldgear', 'seedlings'] }] },
    { id: 'evan', label: 'Electric van, packed tight', blurb: 'Everything the team packed, in the electric van.', trips: [{ vehicleId: 'evan', people: 2, cargo: ['kit', 'fieldgear', 'seedlings'] }] },
    {
      id: 'van-pickup',
      label: 'Van and pickup',
      blurb: 'Van for the team and the kit, pickup for the open loads.',
      trips: [
        { vehicleId: 'van', people: 2, cargo: ['kit'] },
        { vehicleId: 'pickup', people: 0, cargo: ['seedlings', 'fieldgear'] },
      ],
    },
    { id: 'pickup-all', label: 'Just the pickup', blurb: 'Everything in the open back of the pickup.', trips: [{ vehicleId: 'pickup', people: 2, cargo: ['kit', 'fieldgear', 'seedlings'] }] },
  ],
  routes: [
    {
      id: 'nlex',
      label: 'NLEX, then the provincial road',
      blurb: 'Expressway most of the way.',
      distanceKm: 52,
      movingMin: 62,
      windows: { early: { stationaryMin: 6, movingFactor: 1.02 }, mid: { stationaryMin: 24, movingFactor: 1.2 }, late: { stationaryMin: 8, movingFactor: 1.05 } },
    },
    {
      id: 'old',
      label: 'Old national road',
      blurb: 'Shorter, through the town centres.',
      distanceKm: 46,
      movingMin: 100,
      windows: { early: { stationaryMin: 18, movingFactor: 1.15 }, mid: { stationaryMin: 34, movingFactor: 1.3 }, late: { stationaryMin: 26, movingFactor: 1.2 } },
    },
  ],
  departures: [
    { id: 'early', label: '6:00 AM', time: 6 * 60 },
    { id: 'mid', label: '8:00 AM', time: 8 * 60 },
    { id: 'late', label: '10:00 AM', time: 10 * 60 },
  ],
  availableFrom: { evan: { time: 7 * 60 + 30, because: 'on the morning clinic run' } },
  baseline: { fleetId: 'two-vans', routeId: 'nlex', departureId: 'early' },
  baselineLabel: 'The usual way: two vans, loaded loose, by NLEX at 6:00 AM',
};

/* ---- The Eco Expressway: getting the chosen upgrades and the installers to the depot ---- */

export interface DepotCargo {
  id: string;
  label: string;
  kg: number;
  enclosed: boolean;
}

/** Built from what the player chose to install, so every plan carries exactly that. */
export function depotTransport(cargo: readonly DepotCargo[]): TransportProblem {
  const lamps = cargo.filter((c) => c.enclosed).map((c) => c.id);
  const bulky = cargo.filter((c) => !c.enclosed).map((c) => c.id);
  const all = cargo.map((c) => c.id);
  const drop = (trips: Trip[]): Trip[] => trips.filter((tr) => tr.people > 0 || tr.cargo.length > 0);
  const fleets: FleetOption[] = [
    { id: 'separate', label: 'Separate runs', blurb: 'Field van for the crew and the lamps, depot truck for anything bulky. The usual way.', trips: drop([{ vehicleId: 'van', people: 2, cargo: lamps }, { vehicleId: 'truck', people: 0, cargo: bulky }]) },
    { id: 'van-pickup', label: 'Van and pickup', blurb: 'Field van for the crew and the lamps, pickup for anything bulky.', trips: drop([{ vehicleId: 'van', people: 2, cargo: lamps }, { vehicleId: 'pickup', people: 0, cargo: bulky }]) },
    { id: 'van-only', label: 'Just the field van', blurb: 'Everyone and everything in the van.', trips: [{ vehicleId: 'van', people: 2, cargo: all }] },
    { id: 'evan-only', label: 'Just the electric van', blurb: 'Everyone and everything in the electric van.', trips: [{ vehicleId: 'evan', people: 2, cargo: all }] },
    { id: 'evan-pickup', label: 'Electric van and pickup', blurb: 'Electric van for the crew and the lamps, pickup for anything bulky.', trips: drop([{ vehicleId: 'evan', people: 2, cargo: lamps }, { vehicleId: 'pickup', people: 0, cargo: bulky }]) },
  ];
  return {
    id: 'nlex-eco',
    demand: { people: 2, peopleLabel: 'the installers', peopleDeadline: 11 * 60, cargo: cargo.map((c) => ({ ...c, deadline: 11 * 60 })) },
    fleets,
    routes: [
      {
        id: 'nlex',
        label: 'NLEX to San Fernando',
        blurb: 'Mostly expressway.',
        distanceKm: 48,
        movingMin: 45,
        windows: { early: { stationaryMin: 9, movingFactor: 1.05 }, mid: { stationaryMin: 2, movingFactor: 1 }, late: { stationaryMin: 3, movingFactor: 1 } },
      },
      {
        id: 'provincial',
        label: 'Provincial road',
        blurb: 'Through four town centres.',
        distanceKm: 41,
        movingMin: 70,
        windows: { early: { stationaryMin: 26, movingFactor: 1.3 }, mid: { stationaryMin: 12, movingFactor: 1.15 }, late: { stationaryMin: 10, movingFactor: 1.12 } },
      },
    ],
    departures: [
      { id: 'early', label: '7:00 AM', time: 7 * 60 },
      { id: 'mid', label: '9:00 AM', time: 9 * 60 },
      { id: 'late', label: '1:00 PM', time: 13 * 60 },
    ],
    availableFrom: { evan: { time: 8 * 60 + 15, because: 'on the morning clinic run' } },
    baseline: { fleetId: 'separate', routeId: 'nlex', departureId: 'early' },
    baselineLabel: 'The usual way: separate runs by NLEX at 7:00 AM',
  };
}

/** Every plan the board can offer, for testing. */
export function allPlans(problem: TransportProblem): Plan[] {
  const out: Plan[] = [];
  for (const f of problem.fleets) {
    for (const r of problem.routes) {
      for (const d of problem.departures) {
        out.push({ fleetId: f.id, routeId: r.id, departureId: d.id });
      }
    }
  }
  return out;
}
