import { FACTORS, VEHICLES } from './emissions';

/**
 * The toll plaza in The Great NLEX Gridlock: a fictional plaza, one hour of made-up
 * traffic. Deterministic: arrivals are evenly spaced by type, each vehicle joins the open
 * lane it is allowed to use with the least work queued ahead of it, and every lane serves
 * first come, first served. The game steps through the hour one second at a time.
 *
 * What is counted: time each vehicle spends stopped at the plaza with its engine on,
 * waiting in line and at the booth. Driving through is the same in every plan, so it is
 * left out of the comparison. Fuel burned standing still uses the same idling figures as
 * the transport board, and the same CO2 factors.
 */

export type LaneMode = 'tag' | 'cash' | 'closed';
export type VehicleClass = 'tagCar' | 'cashCar' | 'tagTruck' | 'cashTruck';

export interface PlazaLane {
  id: number;
  /** Wide enough for trucks. */
  wide: boolean;
  /** Coned off for repairs: it must stay closed. */
  underRepair: boolean;
}

export interface PlazaProblem {
  lanes: readonly PlazaLane[];
  /** Vehicles per hour, by class. Game assumptions, not counts from any real plaza. */
  perHour: Readonly<Record<VehicleClass, number>>;
  /** Seconds at the booth, by class and lane type. */
  serviceSeconds: Readonly<Record<VehicleClass, number>>;
  /** Toll collectors on shift: at most this many cash lanes. */
  cashStaff: number;
  /** How the plaza stood when the Wasteworks had jammed it. */
  jammed: readonly LaneMode[];
  minutes: number;
  /** Lanes whose tag reader has failed: they can take cash, or close. */
  tagDown?: readonly number[];
}

export const CLASS_LABEL: Record<VehicleClass, string> = {
  tagCar: 'Cars with a toll tag',
  cashCar: 'Cars paying cash',
  tagTruck: 'Trucks with a toll tag',
  cashTruck: 'Trucks paying cash',
};

const isTruck = (c: VehicleClass): boolean => c === 'tagTruck' || c === 'cashTruck';
const pays = (c: VehicleClass): LaneMode => (c === 'tagCar' || c === 'tagTruck' ? 'tag' : 'cash');

export const BOCAUE_PLAZA: PlazaProblem = {
  lanes: [
    { id: 1, wide: true, underRepair: false },
    { id: 2, wide: false, underRepair: false },
    { id: 3, wide: false, underRepair: false },
    { id: 4, wide: false, underRepair: true },
    { id: 5, wide: false, underRepair: false },
    { id: 6, wide: true, underRepair: false },
  ],
  perHour: { tagCar: 900, cashCar: 240, tagTruck: 60, cashTruck: 60 },
  serviceSeconds: { tagCar: 6, cashCar: 24, tagTruck: 8, cashTruck: 32 },
  cashStaff: 3,
  jammed: ['cash', 'closed', 'closed', 'closed', 'closed', 'tag'],
  minutes: 60,
};

export interface LaneReport {
  id: number;
  mode: LaneMode;
  served: number;
  /** Average minutes stopped, waiting and at the booth. */
  averageMin: number;
  longestQueue: number;
  /** Still waiting when the hour ended. */
  leftWaiting: number;
}

export interface PlazaResult {
  modes: readonly LaneMode[];
  /** Rules this setting breaks. Empty means it may be switched on. */
  problems: string[];
  lanes: LaneReport[];
  /** Vehicle-hours stopped with the engine on, cars and trucks. */
  carHours: number;
  truckHours: number;
  fuelL: number;
  co2Kg: number;
  /** Vehicles still in line at the end of the hour: their waiting is counted only to the end of the hour. */
  leftWaiting: number;
  arrivals: number;
}

/** Which rules a lane setting breaks: safety first, then staff, then whether everyone can get through. */
export function checkModes(p: PlazaProblem, modes: readonly LaneMode[]): string[] {
  const out: string[] = [];
  p.lanes.forEach((lane, i) => {
    if (lane.underRepair && modes[i] !== 'closed') {
      out.push(`Lane ${lane.id} is coned off for repairs. It has to stay closed.`);
    }
  });
  for (const i of p.tagDown ?? []) {
    if (modes[i] === 'tag') {
      out.push(`Lane ${p.lanes[i].id}’s tag reader is down. It can take cash, or close.`);
    }
  }
  const cash = modes.filter((m) => m === 'cash').length;
  if (cash > p.cashStaff) {
    out.push(`There are ${p.cashStaff} toll collectors on shift, so at most ${p.cashStaff} cash lanes.`);
  }
  for (const c of Object.keys(p.perHour) as VehicleClass[]) {
    if (p.perHour[c] > 0 && !p.lanes.some((lane, i) => modes[i] === pays(c) && (!isTruck(c) || lane.wide))) {
      out.push(`${CLASS_LABEL[c]} have no lane they can use${isTruck(c) ? ': trucks need a wide lane' : ''}.`);
    }
  }
  return out;
}

/** One hour at the plaza, second by second. */
export function simulatePlaza(p: PlazaProblem, modes: readonly LaneMode[]): PlazaResult {
  const seconds = p.minutes * 60;
  type Car = { cls: VehicleClass; at: number };
  const arrivals: Car[] = [];
  const classes = Object.keys(p.perHour) as VehicleClass[];
  classes.forEach((cls, k) => {
    const n = Math.round((p.perHour[cls] * p.minutes) / 60);
    for (let i = 0; i < n; i += 1) {
      /* Evenly spaced, each class offset a little so they interleave. */
      arrivals.push({ cls, at: Math.floor(((i + (k + 1) / (classes.length + 1)) * seconds) / n) });
    }
  });
  arrivals.sort((a, b) => a.at - b.at || classes.indexOf(a.cls) - classes.indexOf(b.cls));

  const lanes = p.lanes.map((lane, i) => ({
    lane,
    mode: modes[i],
    queue: [] as Car[],
    /** Seconds left on the vehicle at the booth. */
    busy: 0,
    current: null as Car | null,
    work: 0,
    served: 0,
    stoppedSec: 0,
    longest: 0,
  }));
  let carSec = 0;
  let truckSec = 0;
  let next = 0;
  let stranded = 0;
  const stop = (cls: VehicleClass, s: number): void => {
    if (isTruck(cls)) {
      truckSec += s;
    } else {
      carSec += s;
    }
  };
  for (let t = 0; t < seconds; t += 1) {
    while (next < arrivals.length && arrivals[next].at <= t) {
      const car = arrivals[next];
      next += 1;
      const able = lanes.filter((l) => l.mode === pays(car.cls) && (!isTruck(car.cls) || l.lane.wide));
      if (able.length === 0) {
        /* Nowhere to go: counted as stopped until the end of the hour. */
        stranded += 1;
        stop(car.cls, seconds - t);
        continue;
      }
      let best = able[0];
      for (const l of able) {
        if (l.work < best.work) {
          best = l;
        }
      }
      best.queue.push(car);
      best.work += p.serviceSeconds[car.cls];
      best.longest = Math.max(best.longest, best.queue.length);
    }
    for (const l of lanes) {
      if (l.current === null && l.queue.length > 0) {
        l.current = l.queue.shift() as Car;
        l.busy = p.serviceSeconds[l.current.cls];
      }
      if (l.current !== null) {
        l.busy -= 1;
        l.work -= 1;
        if (l.busy <= 0) {
          stop(l.current.cls, t + 1 - l.current.at);
          l.stoppedSec += t + 1 - l.current.at;
          l.served += 1;
          l.current = null;
        }
      }
    }
  }
  /* Whoever is still in line at the end has waited until then, at least. */
  let left = stranded;
  const reports: LaneReport[] = lanes.map((l) => {
    const waiting = [...(l.current !== null ? [l.current] : []), ...l.queue];
    for (const car of waiting) {
      stop(car.cls, seconds - car.at);
      l.stoppedSec += seconds - car.at;
    }
    left += waiting.length;
    const count = l.served + waiting.length;
    return { id: l.lane.id, mode: l.mode, served: l.served, averageMin: count > 0 ? l.stoppedSec / count / 60 : 0, longestQueue: l.longest, leftWaiting: waiting.length };
  });
  const carHours = carSec / 3600;
  const truckHours = truckSec / 3600;
  const carFuel = carHours * VEHICLES.sedan.idleLPerH;
  const truckFuel = truckHours * VEHICLES.truck.idleLPerH;
  return {
    modes,
    problems: checkModes(p, modes),
    lanes: reports,
    carHours,
    truckHours,
    fuelL: carFuel + truckFuel,
    co2Kg: carFuel * FACTORS.gasoline.value + truckFuel * FACTORS.diesel.value,
    leftWaiting: left,
    arrivals: arrivals.length,
  };
}

/** Lines that stay short: no lane averages more than this, in minutes. */
export const FLOWING_MIN = 3;

/**
 * The setting the player can switch on: legal, and the lines stay short. Cars that pull up
 * in the last moments of the hour are always still in line, so a few left waiting is fine;
 * a queue that keeps growing is not.
 */
export function plazaSolved(r: PlazaResult): boolean {
  return r.problems.length === 0 && r.leftWaiting <= r.lanes.length && r.lanes.every((l) => l.averageMin <= FLOWING_MIN);
}

/**
 * The surprise once the plaza reopens: a tag reader fails on one of the player's own
 * tag lanes. A narrow lane if there is one, so the trucks' wide lanes stay as they were
 * when they can. Tests check a working setting is always still possible.
 */
export function failureLane(p: PlazaProblem, modes: readonly LaneMode[]): number {
  const tags = modes.map((m, i) => (m === 'tag' ? i : -1)).filter((i) => i >= 0);
  const narrow = tags.filter((i) => !p.lanes[i].wide);
  return (narrow.length > 0 ? narrow[narrow.length - 1] : tags[0]) ?? 0;
}

export const withTagDown = (p: PlazaProblem, lane: number): PlazaProblem => ({ ...p, tagDown: [...(p.tagDown ?? []), lane] });

/** Every possible setting, for tests. */
export function allModeSets(p: PlazaProblem): LaneMode[][] {
  const out: LaneMode[][] = [];
  const modes: LaneMode[] = ['tag', 'cash', 'closed'];
  const walk = (i: number, acc: LaneMode[]): void => {
    if (i === p.lanes.length) {
      out.push([...acc]);
      return;
    }
    for (const m of modes) {
      acc.push(m);
      walk(i + 1, acc);
      acc.pop();
    }
  };
  walk(0, []);
  return out;
}
