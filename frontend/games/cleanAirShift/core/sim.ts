import { IDLE_KG_PER_MIN, MINUTES_PER_SECOND, type VehicleClass } from './factors';
import type { PerkId } from './perks';
import { createRng } from './rng';

/**
 * One shift at one toll plaza, as pure deterministic rules: the same shift, seed
 * and actions always give the same kg. No drawing and no clock of its own, so the
 * page, the bots and the "no manager" comparison all run exactly this code.
 *
 * Distances are in car lengths. `s` is how far a vehicle's nose is from the booth
 * line: 0 at the booth, negative once it has paid and is driving away. `x` is where
 * it is across the road, in lanes, so a lane change takes real time and real room.
 *
 * A vehicle's life: it drives in on the APPROACH, where it can still change lanes;
 * it joins the QUEUE when it reaches the line (no more changing); at the BOOTH it
 * pays, or waits if something is wrong; then it is LEAVING.
 */

/* ---- Tuning ---- */

export const LENGTH: readonly number[] = [1, 1.35, 1.6];
export const GAP = 0.14;
/** Where vehicles enter: just below the bottom of the road the page shows. */
export const SPAWN_S = 11;
export const LEAVE_S = -6;
export const VISIBLE_S = 9.2;
/** Cars come in slowly enough to be caught; moving up a line is quicker. */
export const APPROACH_SPEED: readonly number[] = [2.7, 2.4, 2.2];
export const QUEUE_SPEED = 5;
const ACCEL = 8;
const BRAKE = 16;
/** Closer than this to the car ahead, or to the booth, and a vehicle has joined the line. */
const JOIN_ROOM = 0.8;
const COMMIT_S = 1.5;
/** Room wanted before and behind a vehicle changing lanes. */
const MERGE_ROOM = 0.22;
/** Lanes per second across the road. */
const LATERAL_SPEED = 2.5;
/** Below this speed a vehicle counts as idling: rolling up the queue is not. */
export const IDLING_SPEED = 1;
/** Seconds at a booth, by class. */
export const SERVICE_S: readonly number[] = [1.3, 1.9, 2.4];
/** Reload lanes take longer: somebody is sorting out a payment. */
export const RELOAD_SLOWDOWN = 1.7;
/** Roughly what one vehicle adds on top of its service: closing the gap to the booth. */
const MOVE_UP_S = 0.62;
export const STAFFING_S = 1;
/** How long trouble lasts if nobody steps in, which is what "no manager" gets. */
export const TAG_AUTO_S = 7;
export const BREAKDOWN_AUTO_S = 18;
export const READER_AUTO_S = 15;
export const TOW_S = 3.5;
export const REPAIR_S = 3;
export const CLOSURE_S = 9;
/** Seconds of warning before a booth closes or a surge arrives. */
export const WARNING_S = 4;
export const ENGINES_S = 8;
/** Share of drivers who notice a shorter line next to the one they were heading for. */
const SMART_SHARE = 0.3;
/** Nobody joins a line that already reaches back this far: they can see it from the road. */
const BACKED_UP_S = VISIBLE_S - 1.4;
/** Share of drivers with no load who head for a reload lane by themselves. */
const KNOWS_RELOAD_SHARE = 0.45;
const KIOSK_SPEED = 0.88;
/** A redirect this many minutes better than staying counts as saving a long queue. */
export const RELIEF_MINUTES = 3;

/* ---- Definitions ---- */

export type LaneType = 'rfid' | 'reload';
export type BlockKind = 'tag' | 'breakdown';
export type FaultKind = 'reader' | 'closure';
export type EventKind = BlockKind | FaultKind | 'surge' | 'convoy';

/** Something that happens during a wave. `t` counts from the start of its wave. */
export interface WaveEvent {
  t: number;
  kind: EventKind;
  /** Surge or convoy: how many, of what, aimed where. */
  count?: number;
  cls?: VehicleClass;
  lane?: number;
  /** What Navie says first. */
  warning?: string;
  /** Closure: seconds. */
  duration?: number;
}

export interface WaveDef {
  id: string;
  label: string;
  /** One short line for the announcement. */
  note: string;
  /** Seconds (one second is one minute at the plaza). */
  duration: number;
  /** Vehicles per second at the start, the middle and the end of the wave. */
  rate: readonly [number, number, number];
  /** How drivers lean across the lanes: one weight per lane. */
  habit: readonly number[];
  /** Buses and trucks lean this way instead, when set. */
  heavyHabit?: readonly number[];
  mix: readonly [number, number, number];
  /** Share of vehicles with no tag or no load, who can only pay at a reload lane. */
  reloadShare?: number;
  events: readonly WaveEvent[];
}

/** The rules a plaza plays by. */
export interface PlazaRules {
  lanes: number;
  /** Lane types, left to right. Every lane is RFID when left out. */
  laneTypes?: readonly LaneType[];
  staff: number;
  startOpen: readonly number[];
  /** Can the player redirect approaching vehicles here? */
  redirect: boolean;
  /** Uses of Engines Off in the shift. */
  engines: number;
  waves: readonly WaveDef[];
}

export interface Arrival {
  id: number;
  t: number;
  cls: VehicleClass;
  habit: number;
  needsReload: boolean;
  /** Rolled once, so every run of the same shift sees the same drivers. */
  smartRoll: number;
  knowsRoll: number;
  tieRoll: number;
  shape: number;
  paint: number;
}

/* ---- State ---- */

export type VehicleState = 'approach' | 'queue' | 'booth' | 'leaving' | 'towed';

export interface Vehicle {
  id: number;
  cls: VehicleClass;
  shape: number;
  paint: number;
  needsReload: boolean;
  /** The lane it belongs to. */
  lane: number;
  /** Where it is across the road, in lanes. */
  x: number;
  s: number;
  speed: number;
  state: VehicleState;
  /** The lane it is steering for, if any. */
  target: number | null;
  /** Slowing down to let a gap open up beside it. */
  waitingForGap: boolean;
  /** Seconds of booth work left. */
  service: number;
  block: BlockKind | null;
  blockLeft: number;
  /** Minutes this vehicle has held up its lane. */
  blockedFor: number;
  /** Minutes idled so far. */
  waited: number;
  co2: number;
}

export type LaneStatus = 'open' | 'opening' | 'closing' | 'closed';

export interface Lane {
  index: number;
  type: LaneType;
  status: LaneStatus;
  staffing: number;
  /** In line order: [0] is nearest the booth. */
  queue: Vehicle[];
  fault: FaultKind | null;
  faultLeft: number;
  repairing: boolean;
  /** Closure announced for this lane, seconds from now. */
  closureIn: number;
}

export interface Tow {
  vehicleId: number;
  lane: number;
  left: number;
}

export type NoteKind = 'wave' | 'block' | 'unblocked' | 'warning' | 'towCalled' | 'opened' | 'closed' | 'fault' | 'faultEnd' | 'closureSoon';

/** Things the page wants to hear about. One shape for all of them. */
export interface SimNote {
  kind: NoteKind;
  lane: number;
  vehicleId: number;
  /** The block or fault involved, or the wave's id. */
  what: string;
  text: string;
  /** Minutes lost, for an unblock. */
  value: number;
  /** Cleared by itself, not by the player. */
  auto: boolean;
}

interface Scheduled {
  at: number;
  warnAt: number;
  kind: EventKind;
  warning: string;
  duration: number;
  warned: boolean;
  lane: number;
}

export interface Sim {
  rules: PlazaRules;
  laneCount: number;
  staff: number;
  perks: PerkId[];
  t: number;
  /** Seconds of arrivals: the shift's countdown. */
  duration: number;
  waveStarts: number[];
  waveIndex: number;
  lanes: Lane[];
  leaving: Vehicle[];
  schedule: Arrival[];
  nextArrival: number;
  scheduled: Scheduled[];
  /** Blocks that are due and waiting for a vehicle at a booth. */
  pendingBlocks: BlockKind[];
  tow: Tow | null;
  towQueue: number[];
  enginesLeft: number;
  enginesTimer: number;
  /** kg emitted so far. It only ever rises. */
  co2: number;
  co2ByClass: [number, number, number];
  /** kg a minute right now. */
  rate: number;
  arrived: number;
  arrivedByClass: [number, number, number];
  paid: number;
  towed: number;
  /** Vehicles the player sent to another lane. */
  moves: number;
  /** Times a redirect saved a vehicle from a long wait. */
  reliefs: number;
  /** Most vehicles standing in one line, booth included. */
  longestQueue: number;
  /** Tag problems, breakdowns and reader faults so far. */
  emergencies: number;
  /** How many of those the player stepped in on. */
  handled: number;
  done: boolean;
  /** Filled for the page; the bots and the comparison leave it off. */
  listen: boolean;
  notes: SimNote[];
}

const serviceFor = (cls: VehicleClass, lane: Lane, perks: readonly PerkId[]): number =>
  SERVICE_S[cls] * (lane.type === 'reload' ? RELOAD_SLOWDOWN : 1) * (perks.includes('kiosks') ? KIOSK_SPEED : 1);

const note = (sim: Sim, kind: NoteKind, extra: Partial<SimNote> = {}): void => {
  if (sim.listen) {
    sim.notes.push({ kind, lane: -1, vehicleId: -1, what: '', text: '', value: 0, auto: false, ...extra });
  }
};

/* ---- Building a shift ---- */

function pickWeighted(weights: readonly number[], roll: number): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let left = roll * total;
  for (let i = 0; i < weights.length; i += 1) {
    left -= weights[i];
    if (left <= 0) {
      return i;
    }
  }
  return weights.length - 1;
}

export const totalDuration = (rules: PlazaRules): number => rules.waves.reduce((a, w) => a + w.duration, 0);

/** Vehicles per second `t` seconds into a wave: start, up to the middle, down to the end. */
export function rateAt(wave: WaveDef, t: number): number {
  const k = Math.max(0, Math.min(1, t / wave.duration));
  const [start, middle, end] = wave.rate;
  return k < 0.5 ? start + (middle - start) * (k / 0.5) : middle + (end - middle) * ((k - 0.5) / 0.5);
}

/** Every vehicle of a shift, decided up front from the seed, so the player and "no manager" face the same traffic. */
export function buildSchedule(rules: PlazaRules, seed: number): Arrival[] {
  const rng = createRng(seed);
  const out: Arrival[] = [];
  const add = (t: number, cls: VehicleClass, habit: number, needsReload: boolean): void => {
    out.push({
      id: 0,
      t,
      cls,
      habit,
      needsReload,
      smartRoll: rng.next(),
      knowsRoll: rng.next(),
      tieRoll: rng.next(),
      shape: Math.floor(rng.next() * 3),
      paint: Math.floor(rng.next() * 6),
    });
  };
  let offset = 0;
  for (const wave of rules.waves) {
    const STEP = 0.05;
    let last = -1;
    for (let t = 0; t < wave.duration; t += STEP) {
      if (t - last > 0.2 && rng.chance(rateAt(wave, t) * STEP)) {
        const cls = pickWeighted(wave.mix, rng.next()) as VehicleClass;
        const weights = cls > 0 && wave.heavyHabit !== undefined ? wave.heavyHabit : wave.habit;
        const lane = pickWeighted(weights, rng.next());
        add(offset + t, cls, lane, rng.chance(wave.reloadShare ?? 0));
        last = t;
      }
    }
    for (const e of wave.events) {
      if (e.kind === 'surge' || e.kind === 'convoy') {
        for (let i = 0; i < (e.count ?? 0); i += 1) {
          const cls: VehicleClass = e.kind === 'convoy' ? e.cls ?? 1 : (pickWeighted(wave.mix, rng.next()) as VehicleClass);
          const lane = e.lane ?? pickWeighted(wave.habit, rng.next());
          add(offset + e.t + i * (e.kind === 'convoy' ? 0.55 : 0.28), cls, lane, false);
        }
      }
    }
    offset += wave.duration;
  }
  out.sort((a, b) => a.t - b.t);
  out.forEach((a, i) => {
    a.id = i + 1;
  });
  return out;
}

function buildEvents(rules: PlazaRules): Scheduled[] {
  const out: Scheduled[] = [];
  let offset = 0;
  for (const wave of rules.waves) {
    for (const e of wave.events) {
      const at = offset + e.t;
      const warned = e.kind === 'surge' || e.kind === 'convoy' || e.kind === 'closure';
      out.push({
        at,
        warnAt: warned ? Math.max(0, at - WARNING_S) : at,
        kind: e.kind,
        warning: e.warning ?? '',
        duration: e.duration ?? CLOSURE_S,
        warned: !warned,
        lane: -1,
      });
    }
    offset += wave.duration;
  }
  return out.sort((a, b) => a.at - b.at);
}

export function createSim(rules: PlazaRules, options: { seed: number; perks?: readonly PerkId[]; listen?: boolean }): Sim {
  const perks = [...(options.perks ?? [])];
  const lanes: Lane[] = [];
  for (let i = 0; i < rules.lanes; i += 1) {
    lanes.push({
      index: i,
      type: rules.laneTypes?.[i] ?? 'rfid',
      status: rules.startOpen.includes(i) ? 'open' : 'closed',
      staffing: 0,
      queue: [],
      fault: null,
      faultLeft: 0,
      repairing: false,
      closureIn: 0,
    });
  }
  const waveStarts: number[] = [];
  let offset = 0;
  for (const wave of rules.waves) {
    waveStarts.push(offset);
    offset += wave.duration;
  }
  return {
    rules,
    laneCount: rules.lanes,
    staff: rules.staff + (perks.includes('extraStaff') ? 1 : 0),
    perks,
    t: 0,
    duration: offset,
    waveStarts,
    waveIndex: 0,
    lanes,
    leaving: [],
    schedule: buildSchedule(rules, options.seed),
    nextArrival: 0,
    scheduled: buildEvents(rules),
    pendingBlocks: [],
    tow: null,
    towQueue: [],
    enginesLeft: rules.engines + (perks.includes('engineCampaign') ? 1 : 0),
    enginesTimer: 0,
    co2: 0,
    co2ByClass: [0, 0, 0],
    rate: 0,
    arrived: 0,
    arrivedByClass: [0, 0, 0],
    paid: 0,
    towed: 0,
    moves: 0,
    reliefs: 0,
    longestQueue: 0,
    emergencies: 0,
    handled: 0,
    done: false,
    listen: options.listen === true,
    notes: [],
  };
}

/* ---- Reading it ---- */

export const isActive = (lane: Lane): boolean => lane.status === 'open' || lane.status === 'opening';

/** Lanes taking up staff: a booth shut for maintenance frees its crew. */
export const staffInUse = (sim: Sim): number => sim.lanes.filter((lane) => lane.status !== 'closed' && lane.fault !== 'closure').length;

/** Can this lane take this vehicle at all? */
export const accepts = (lane: Lane, v: { needsReload: boolean }): boolean => isActive(lane) && (!v.needsReload || lane.type === 'reload');

/** How a booth looks: green open, yellow busy, red closed, orange malfunctioning. */
export type BoothLook = 'open' | 'busy' | 'closed' | 'fault';

export function boothLook(lane: Lane): BoothLook {
  if (lane.fault !== null) {
    return 'fault';
  }
  if (lane.status === 'closed') {
    return 'closed';
  }
  return lane.status === 'open' && lane.queue[0]?.state !== 'booth' ? 'open' : 'busy';
}

const blockTimeLeft = (sim: Sim, v: Vehicle): number => {
  if (v.block === null) {
    return 0;
  }
  if (sim.tow !== null && sim.tow.vehicleId === v.id) {
    return sim.tow.left;
  }
  return v.blockLeft;
};

const timeAtBooth = (sim: Sim, v: Vehicle, lane: Lane): number =>
  (v.state === 'booth' ? v.service + blockTimeLeft(sim, v) : serviceFor(v.cls, lane, sim.perks)) + MOVE_UP_S;

/** Minutes someone joining the back of this line would wait until they have paid. */
export function laneWait(sim: Sim, lane: Lane): number {
  let wait = lane.status === 'opening' ? lane.staffing : 0;
  wait += lane.fault !== null ? lane.faultLeft : 0;
  for (const v of lane.queue) {
    wait += timeAtBooth(sim, v, lane);
  }
  for (const other of sim.lanes) {
    if (other.index !== lane.index) {
      for (const v of other.queue) {
        if (v.target === lane.index) {
          wait += serviceFor(v.cls, lane, sim.perks) + MOVE_UP_S;
        }
      }
    }
  }
  return wait * MINUTES_PER_SECOND;
}

/** Minutes until this vehicle reaches the booth, from where it stands. */
export function waitAhead(sim: Sim, v: Vehicle): number {
  const lane = sim.lanes[v.lane];
  let wait = lane.status === 'opening' ? lane.staffing : 0;
  wait += lane.fault !== null ? lane.faultLeft : 0;
  for (const other of lane.queue) {
    if (other.id === v.id) {
      break;
    }
    wait += timeAtBooth(sim, other, lane);
  }
  return wait * MINUTES_PER_SECOND;
}

export const findVehicle = (sim: Sim, id: number): Vehicle | null => {
  for (const lane of sim.lanes) {
    for (const v of lane.queue) {
      if (v.id === id) {
        return v;
      }
    }
  }
  return null;
};

/** A vehicle that can still change lanes: on the approach, before joining a line. */
export const canRedirect = (v: Vehicle): boolean => v.state === 'approach';

/** A no-load vehicle heading for a lane that cannot take it. */
export const inWrongLane = (sim: Sim, v: Vehicle): boolean => v.needsReload && sim.lanes[v.target ?? v.lane].type !== 'reload';

/** Vehicles standing in a line, booth included. */
export const standing = (lane: Lane): number => lane.queue.filter((v) => v.state === 'queue' || v.state === 'booth').length;

/** The engines of everyone further back than the front of a line are off. */
const engineIsOff = (sim: Sim, position: number): boolean => sim.enginesTimer > 0 && position >= 1;

export const isEngineOff = (sim: Sim, v: Vehicle): boolean => {
  if (sim.enginesTimer <= 0 || v.state === 'approach') {
    return false;
  }
  return sim.lanes[v.lane].queue.indexOf(v) >= 1;
};

/* ---- Actions: everything a player (or a bot) can do ---- */

export type ToggleResult = 'opened' | 'closing' | 'closed' | 'cancelled' | 'no-staff' | 'last-lane' | 'only-reload' | 'blocked';

function nearestAccepting(sim: Sim, v: Vehicle, except: number): Lane | null {
  let best: Lane | null = null;
  let bestScore = Infinity;
  for (const lane of sim.lanes) {
    if (lane.index !== except && accepts(lane, v)) {
      const score = Math.abs(lane.index - v.lane) * 2 + laneWait(sim, lane);
      if (score < bestScore) {
        best = lane;
        bestScore = score;
      }
    }
  }
  return best;
}

/**
 * Open a closed booth (takes a moment to staff), or close an open one. A booth never
 * closes on a vehicle it is serving: it stops taking traffic, works through its line
 * and then closes, and only then is its crew free. Vehicles still approaching steer
 * for the next open lane.
 */
export function toggleLane(sim: Sim, index: number): ToggleResult {
  const lane = sim.lanes[index];
  if (lane.status === 'closed') {
    if (lane.fault !== null) {
      return 'blocked';
    }
    if (staffInUse(sim) >= sim.staff) {
      return 'no-staff';
    }
    lane.status = 'opening';
    lane.staffing = STAFFING_S;
    return 'opened';
  }
  if (lane.status === 'closing') {
    lane.status = 'open';
    return 'cancelled';
  }
  if (lane.fault !== null || lane.queue.some((v) => v.block !== null)) {
    return 'blocked';
  }
  if (sim.lanes.filter(isActive).length <= 1) {
    return 'last-lane';
  }
  if (lane.type === 'reload' && sim.lanes.filter((l) => l.type === 'reload' && isActive(l)).length <= 1) {
    return 'only-reload';
  }
  if (lane.status === 'opening') {
    lane.status = 'closed';
    lane.staffing = 0;
    return 'closed';
  }
  lane.status = 'closing';
  for (const v of lane.queue) {
    if (v.state === 'approach') {
      v.target = nearestAccepting(sim, v, index)?.index ?? null;
    }
  }
  if (lane.queue.every((v) => v.state === 'approach')) {
    lane.status = 'closed';
    return 'closed';
  }
  return 'closing';
}

export type RedirectReason = 'ok' | 'off' | 'closed' | 'fault' | 'compat' | 'none' | 'same';

export interface RedirectResult {
  moved: number;
  reason: RedirectReason;
  /** Minutes of waiting this saves, as far as can be told now. */
  savedMinutes: number;
}

function redirectList(sim: Sim, list: Vehicle[], toLane: number): RedirectResult {
  const target = sim.lanes[toLane];
  if (!sim.rules.redirect) {
    return { moved: 0, reason: 'off', savedMinutes: 0 };
  }
  if (target === undefined || !isActive(target)) {
    return { moved: 0, reason: 'closed', savedMinutes: 0 };
  }
  if (target.fault !== null) {
    return { moved: 0, reason: 'fault', savedMinutes: 0 };
  }
  const movable = list.filter((v) => canRedirect(v) && (v.target ?? v.lane) !== toLane);
  if (movable.length === 0) {
    return { moved: 0, reason: list.length > 0 ? 'same' : 'none', savedMinutes: 0 };
  }
  const allowed = movable.filter((v) => accepts(target, v));
  if (allowed.length === 0) {
    return { moved: 0, reason: 'compat', savedMinutes: 0 };
  }
  let saved = 0;
  let wait = laneWait(sim, target);
  for (const v of allowed) {
    const gain = waitAhead(sim, v) - wait;
    saved += Math.max(0, gain);
    if (gain >= RELIEF_MINUTES) {
      sim.reliefs += 1;
    }
    wait += serviceFor(v.cls, target, sim.perks) + MOVE_UP_S;
    v.target = toLane;
  }
  sim.moves += allowed.length;
  return { moved: allowed.length, reason: 'ok', savedMinutes: saved };
}

/** Send one approaching vehicle to another lane. */
export function redirectVehicle(sim: Sim, id: number, toLane: number): RedirectResult {
  const v = findVehicle(sim, id);
  return redirectList(sim, v === null ? [] : [v], toLane);
}

/** A swipe across a lane: everything still approaching, from `fromS` back, goes to another lane. */
export function redirectLane(sim: Sim, fromLane: number, fromS: number, toLane: number): RedirectResult {
  const lane = sim.lanes[fromLane];
  if (lane === undefined || fromLane === toLane) {
    return { moved: 0, reason: 'same', savedMinutes: 0 };
  }
  return redirectList(sim, lane.queue.filter((v) => v.s >= fromS), toLane);
}

/** Help a stuck vehicle: a failed tag is sorted on the spot, a breakdown needs the tow. */
export function clearBlock(sim: Sim, id: number): boolean {
  const v = findVehicle(sim, id);
  if (v === null || v.block === null) {
    return false;
  }
  if (v.block === 'tag') {
    v.block = null;
    v.blockLeft = 0;
    sim.handled += 1;
    note(sim, 'unblocked', { what: 'tag', lane: v.lane, vehicleId: v.id, value: v.blockedFor });
    return true;
  }
  if ((sim.tow !== null && sim.tow.vehicleId === id) || sim.towQueue.includes(id)) {
    return false;
  }
  sim.handled += 1;
  note(sim, 'towCalled', { lane: v.lane, vehicleId: v.id });
  if (sim.tow === null) {
    sim.tow = { vehicleId: id, lane: v.lane, left: towTime(sim) };
  } else {
    sim.towQueue.push(id);
  }
  return true;
}

const towTime = (sim: Sim): number => TOW_S * (sim.perks.includes('towStandby') ? 0.5 : 1);

/** Start repairing a booth's reader: it works again after a short while. */
export function repairBooth(sim: Sim, index: number): boolean {
  const lane = sim.lanes[index];
  if (lane === undefined || lane.fault !== 'reader' || lane.repairing) {
    return false;
  }
  lane.repairing = true;
  lane.faultLeft = Math.min(lane.faultLeft, REPAIR_S * (sim.perks.includes('towStandby') ? 0.5 : 1));
  sim.handled += 1;
  return true;
}

/** Everyone behind the front of a line switches off for a while. */
export function enginesOff(sim: Sim): boolean {
  if (sim.enginesLeft <= 0 || sim.enginesTimer > 0) {
    return false;
  }
  sim.enginesLeft -= 1;
  sim.enginesTimer = ENGINES_S;
  return true;
}

/** A change picked during the shift starts working at once. */
export function applyPerk(sim: Sim, id: PerkId): void {
  if (sim.perks.includes(id)) {
    return;
  }
  sim.perks.push(id);
  if (id === 'extraStaff') {
    sim.staff += 1;
  } else if (id === 'engineCampaign') {
    sim.enginesLeft += 1;
  }
}

/* ---- One step ---- */

/** Is the back of this line, the part standing still, near the edge of the road the player can see? */
function isBackedUp(lane: Lane): boolean {
  for (let i = lane.queue.length - 1; i >= 0; i -= 1) {
    const v = lane.queue[i];
    if (v.state !== 'approach') {
      return v.s + LENGTH[v.cls] > BACKED_UP_S;
    }
  }
  return false;
}

function chooseLane(sim: Sim, a: Arrival): Lane {
  const marshals = sim.perks.includes('marshals');
  const signed = a.cls > 0 && sim.perks.includes('truckSigns');
  const heads = a.needsReload && (a.knowsRoll < KNOWS_RELOAD_SHARE || marshals || signed);
  let best: Lane | null = null;
  let bestScore = Infinity;
  for (const lane of sim.lanes) {
    if (!isActive(lane) || (heads && lane.type !== 'reload')) {
      continue;
    }
    const distance = Math.abs(lane.index - a.habit);
    const tie = lane.index < a.habit ? (a.tieRoll < 0.5 ? -0.1 : 0.1) : 0;
    const score = signed && !a.needsReload ? laneWait(sim, lane) + (lane.type === 'reload' ? 6 : 0) + distance * 0.01 : distance + tie;
    if (score < bestScore) {
      best = lane;
      bestScore = score;
    }
  }
  const chosen = best ?? (sim.lanes.find(isActive) as Lane);
  if (isBackedUp(chosen)) {
    /* A line off the end of the road: drivers go for the nearest one they can still join. */
    let other: Lane | null = null;
    for (const lane of sim.lanes) {
      if (accepts(lane, a) && lane.fault === null && !isBackedUp(lane) && (other === null || Math.abs(lane.index - a.habit) < Math.abs(other.index - a.habit))) {
        other = lane;
      }
    }
    if (other !== null) {
      return other;
    }
  }
  if (!signed && !heads && (a.smartRoll < SMART_SHARE || marshals)) {
    let shorter = chosen;
    let shorterWait = laneWait(sim, chosen) - 1;
    for (const lane of sim.lanes) {
      if (isActive(lane) && Math.abs(lane.index - chosen.index) === 1) {
        const wait = laneWait(sim, lane);
        if (wait < shorterWait) {
          shorter = lane;
          shorterWait = wait;
        }
      }
    }
    return shorter;
  }
  return chosen;
}

function insertByPosition(lane: Lane, v: Vehicle): void {
  let i = lane.queue.length;
  while (i > 0 && lane.queue[i - 1].s > v.s) {
    i -= 1;
  }
  lane.queue.splice(i, 0, v);
  v.lane = lane.index;
}

function spawn(sim: Sim, a: Arrival): void {
  const lane = chooseLane(sim, a);
  const tail = lane.queue[lane.queue.length - 1];
  const place = tail === undefined ? SPAWN_S : Math.max(SPAWN_S, tail.s + LENGTH[tail.cls] + GAP);
  const v: Vehicle = {
    id: a.id,
    cls: a.cls,
    shape: a.shape,
    paint: a.paint,
    needsReload: a.needsReload,
    lane: lane.index,
    x: lane.index,
    s: place,
    speed: APPROACH_SPEED[a.cls],
    state: 'approach',
    target: null,
    waitingForGap: false,
    service: 0,
    block: null,
    blockLeft: 0,
    blockedFor: 0,
    waited: 0,
    co2: 0,
  };
  lane.queue.push(v);
  sim.arrived += 1;
  sim.arrivedByClass[a.cls] += 1;
}

function advance(v: Vehicle, limit: number, dt: number, top: number): void {
  const room = v.s - limit;
  const wanted = Math.min(top, room * 3.2 + 0.9);
  const change = wanted - v.speed;
  v.speed = Math.max(0, v.speed + Math.max(-BRAKE * dt, Math.min(ACCEL * dt, change)));
  v.s -= v.speed * dt;
  if (v.s <= limit) {
    v.s = limit;
    v.speed = 0;
  }
}

/** Is there a clear gap in this lane for a vehicle, at its place along the road? */
function roomIn(sim: Sim, lane: Lane, v: Vehicle): boolean {
  const front = v.s - MERGE_ROOM;
  const back = v.s + LENGTH[v.cls] + MERGE_ROOM;
  const clear = (o: Vehicle): boolean => o.id === v.id || o.s + LENGTH[o.cls] < front || o.s > back;
  if (!lane.queue.every(clear)) {
    return false;
  }
  for (const other of sim.lanes) {
    if (other.index !== lane.index) {
      for (const o of other.queue) {
        if (Math.abs(o.x - lane.index) < 0.75 && !clear(o)) {
          return false;
        }
      }
    }
  }
  /* Never cut in front of vehicles already standing in a line. */
  for (const o of lane.queue) {
    if (o.state !== 'approach' && o.s > v.s) {
      return false;
    }
  }
  return true;
}

/** Steer across the road, one lane at a time, when there is room to. True if held up by traffic. */
function steer(sim: Sim, v: Vehicle, dt: number): boolean {
  const off = v.lane - v.x;
  if (off !== 0) {
    const stepX = LATERAL_SPEED * dt;
    v.x = Math.abs(off) <= stepX ? v.lane : v.x + Math.sign(off) * stepX;
  }
  if (v.target === null) {
    return false;
  }
  if (v.state !== 'approach') {
    v.target = null;
    return false;
  }
  const target = sim.lanes[v.target];
  if (!accepts(target, v)) {
    v.target = nearestAccepting(sim, v, v.target)?.index ?? null;
    return false;
  }
  if (v.lane === v.target) {
    if (v.x === v.lane) {
      v.target = null;
    }
    return false;
  }
  if (Math.abs(v.lane - v.x) > 0.3) {
    return false;
  }
  const next = sim.lanes[v.lane + Math.sign(v.target - v.lane)];
  if (roomIn(sim, next, v)) {
    const from = sim.lanes[v.lane];
    from.queue.splice(from.queue.indexOf(v), 1);
    insertByPosition(next, v);
    return false;
  }
  return true;
}

function bestForTrouble(sim: Sim, test: (lane: Lane) => boolean): Lane | null {
  let best: Lane | null = null;
  for (const lane of sim.lanes) {
    if (test(lane) && (best === null || lane.queue.length > best.queue.length)) {
      best = lane;
    }
  }
  return best;
}

function blockFront(sim: Sim, lane: Lane, kind: BlockKind): void {
  const front = lane.queue[0];
  front.block = kind;
  front.blockLeft = kind === 'tag' ? TAG_AUTO_S : BREAKDOWN_AUTO_S;
  sim.emergencies += 1;
  note(sim, 'block', { what: kind, lane: lane.index, vehicleId: front.id });
}

function placeBlock(sim: Sim, kind: BlockKind): boolean {
  const lane = bestForTrouble(sim, (l) => l.status === 'open' && l.fault === null && l.queue[0]?.state === 'booth' && l.queue[0].block === null);
  if (lane === null) {
    return false;
  }
  blockFront(sim, lane, kind);
  return true;
}

/** A lane trouble can hit fairly: open, in working order, and never the only way through. */
const canTakeFault = (sim: Sim, lane: Lane): boolean =>
  lane.status === 'open' &&
  lane.fault === null &&
  lane.type === 'rfid' &&
  sim.lanes.filter((l) => isActive(l) && l.fault === null && l.type === 'rfid').length >= 2;

function startFault(sim: Sim, lane: Lane, kind: FaultKind, seconds: number): void {
  lane.fault = kind;
  lane.faultLeft = seconds;
  lane.repairing = false;
  lane.closureIn = 0;
  if (kind === 'reader') {
    sim.emergencies += 1;
  }
  note(sim, 'fault', { what: kind, lane: lane.index, value: seconds });
}

function endBreakdown(sim: Sim, lane: Lane, v: Vehicle, auto: boolean): void {
  lane.queue.splice(lane.queue.indexOf(v), 1);
  note(sim, 'unblocked', { what: 'breakdown', lane: lane.index, vehicleId: v.id, auto, value: v.blockedFor });
  v.block = null;
  v.state = 'towed';
  sim.leaving.push(v);
  sim.towed += 1;
}

function runEvents(sim: Sim): void {
  for (const e of sim.scheduled) {
    if (!e.warned && sim.t >= e.warnAt) {
      e.warned = true;
      if (e.kind === 'closure') {
        const lane = bestForTrouble(sim, (l) => canTakeFault(sim, l) && l.closureIn <= 0);
        if (lane !== null) {
          e.lane = lane.index;
          lane.closureIn = e.at - sim.t;
          note(sim, 'closureSoon', { lane: lane.index, value: Math.ceil(e.at - sim.t) });
        }
      } else if (e.warning !== '') {
        note(sim, 'warning', { what: e.kind, text: e.warning });
      }
    }
  }
  while (sim.scheduled.length > 0 && sim.scheduled[0].at <= sim.t) {
    const e = sim.scheduled.shift() as Scheduled;
    if (e.kind === 'tag' || e.kind === 'breakdown') {
      sim.pendingBlocks.push(e.kind);
    } else if (e.kind === 'reader') {
      const lane = bestForTrouble(sim, (l) => canTakeFault(sim, l));
      if (lane !== null) {
        startFault(sim, lane, 'reader', READER_AUTO_S);
      }
    } else if (e.kind === 'closure' && e.lane >= 0) {
      const lane = sim.lanes[e.lane];
      lane.closureIn = 0;
      if (canTakeFault(sim, lane)) {
        startFault(sim, lane, 'closure', e.duration);
      }
    }
  }
}

/** One step of the shift. Read the result from `sim`. */
export function step(sim: Sim, dt: number): void {
  if (sim.done) {
    return;
  }
  sim.t += dt;
  while (sim.waveIndex + 1 < sim.waveStarts.length && sim.t >= sim.waveStarts[sim.waveIndex + 1]) {
    sim.waveIndex += 1;
    note(sim, 'wave', { what: sim.rules.waves[sim.waveIndex].id, value: sim.waveIndex });
  }
  while (sim.nextArrival < sim.schedule.length && sim.schedule[sim.nextArrival].t <= sim.t) {
    spawn(sim, sim.schedule[sim.nextArrival]);
    sim.nextArrival += 1;
  }
  runEvents(sim);
  if (sim.pendingBlocks.length > 0 && placeBlock(sim, sim.pendingBlocks[0])) {
    sim.pendingBlocks.shift();
  }
  if (sim.enginesTimer > 0) {
    sim.enginesTimer = Math.max(0, sim.enginesTimer - dt);
  }
  if (sim.tow !== null) {
    sim.tow.left -= dt;
    if (sim.tow.left <= 0) {
      const v = findVehicle(sim, sim.tow.vehicleId);
      if (v !== null) {
        endBreakdown(sim, sim.lanes[v.lane], v, false);
      }
      sim.tow = null;
      const next = sim.towQueue.shift();
      if (next !== undefined) {
        const queued = findVehicle(sim, next);
        if (queued !== null) {
          sim.tow = { vehicleId: next, lane: queued.lane, left: towTime(sim) };
        }
      }
    }
  }

  /* Steering first, once per vehicle: it can move a vehicle from one lane's list to another's. */
  const everyone: Vehicle[] = [];
  for (const lane of sim.lanes) {
    everyone.push(...lane.queue);
  }
  for (const v of everyone) {
    v.waitingForGap = steer(sim, v, dt);
  }
  /* Vehicles part way across the road hold up whoever is behind them in both lanes. */
  const crossing = everyone.filter((v) => v.x !== v.lane);

  let rate = 0;
  for (const lane of sim.lanes) {
    if (lane.status === 'opening') {
      lane.staffing -= dt;
      if (lane.staffing <= 0) {
        lane.status = 'open';
        lane.staffing = 0;
        note(sim, 'opened', { lane: lane.index });
      }
    }
    if (lane.closureIn > 0) {
      lane.closureIn = Math.max(0, lane.closureIn - dt);
    }
    if (lane.fault !== null) {
      lane.faultLeft -= dt;
      if (lane.faultLeft <= 0) {
        const what = lane.fault;
        lane.fault = null;
        lane.faultLeft = 0;
        note(sim, 'faultEnd', { what, lane: lane.index, auto: !lane.repairing });
        lane.repairing = false;
        if (what === 'closure' && staffInUse(sim) > sim.staff) {
          /* Its crew went to another booth meanwhile: this one finishes its line and stays shut. */
          lane.status = 'closing';
          for (const v of lane.queue) {
            if (v.state === 'approach') {
              v.target = nearestAccepting(sim, v, lane.index)?.index ?? null;
            }
          }
        }
      }
    }
    for (let k = 0; k < lane.queue.length; k += 1) {
      const v = lane.queue[k];
      const ahead = k === 0 ? null : lane.queue[k - 1];
      if (v.state === 'approach' || v.state === 'queue') {
        let limit = ahead === null ? 0 : ahead.s + LENGTH[ahead.cls] + GAP;
        for (const c of crossing) {
          if (c.id !== v.id && c.lane !== lane.index && Math.abs(c.x - lane.index) < 0.75 && c.s < v.s) {
            limit = Math.max(limit, c.s + LENGTH[c.cls] + GAP);
          }
        }
        const top = v.state === 'approach' ? APPROACH_SPEED[v.cls] * (v.waitingForGap ? 0.55 : 1) : QUEUE_SPEED;
        advance(v, limit, dt, top);
        if (v.state === 'approach' && (v.s <= COMMIT_S || (ahead !== null && v.s - limit < JOIN_ROOM && ahead.state !== 'approach'))) {
          v.state = 'queue';
          v.target = null;
        }
        if (k === 0 && v.state === 'queue' && v.s <= 0.001) {
          v.state = 'booth';
          v.service = serviceFor(v.cls, lane, sim.perks);
          if (v.needsReload && lane.type !== 'reload') {
            /* No tag or no load, at a lane that cannot take them. */
            blockFront(sim, lane, 'tag');
          }
        }
      } else if (v.state === 'booth') {
        if (v.block !== null) {
          v.blockedFor += dt * MINUTES_PER_SECOND;
          const towing = sim.tow !== null && sim.tow.vehicleId === v.id;
          if (!towing) {
            v.blockLeft -= dt;
            if (v.blockLeft <= 0) {
              if (v.block === 'tag') {
                v.block = null;
                note(sim, 'unblocked', { what: 'tag', lane: lane.index, vehicleId: v.id, auto: true, value: v.blockedFor });
              } else {
                sim.towQueue = sim.towQueue.filter((id) => id !== v.id);
                endBreakdown(sim, lane, v, true);
                k -= 1;
                continue;
              }
            }
          }
        } else if (lane.fault === null && lane.status !== 'opening') {
          v.service -= dt;
          if (v.service <= 0) {
            v.state = 'leaving';
            lane.queue.splice(k, 1);
            k -= 1;
            sim.leaving.push(v);
            sim.paid += 1;
            continue;
          }
        }
      }
      const stalled = v.block === 'breakdown';
      const idling = v.state === 'booth' || v.speed < IDLING_SPEED;
      if (idling) {
        v.waited += dt * MINUTES_PER_SECOND;
        if (!stalled && !engineIsOff(sim, k)) {
          const kg = IDLE_KG_PER_MIN[v.cls] * MINUTES_PER_SECOND;
          const emitted = kg * dt;
          v.co2 += emitted;
          sim.co2 += emitted;
          sim.co2ByClass[v.cls] += emitted;
          rate += kg;
        }
      }
    }
    sim.longestQueue = Math.max(sim.longestQueue, standing(lane));
    if (lane.status === 'closing' && lane.queue.every((v) => v.state === 'approach')) {
      lane.status = 'closed';
      note(sim, 'closed', { lane: lane.index });
    }
  }
  sim.rate = rate;

  for (let i = sim.leaving.length - 1; i >= 0; i -= 1) {
    const v = sim.leaving[i];
    if (v.state === 'towed') {
      v.s = LEAVE_S - 1;
    } else {
      v.speed = Math.min(QUEUE_SPEED, v.speed + ACCEL * dt);
      v.s -= v.speed * dt;
    }
    if (v.s < LEAVE_S) {
      sim.leaving.splice(i, 1);
    }
  }

  if (
    sim.t >= sim.duration &&
    sim.nextArrival >= sim.schedule.length &&
    sim.lanes.every((lane) => lane.queue.length === 0) &&
    sim.leaving.length === 0
  ) {
    sim.done = true;
  }
}

/** True once arrivals have stopped and only the lines are left to clear. */
export const isDraining = (sim: Sim): boolean => sim.t >= sim.duration && !sim.done;

export const STEP_S = 1 / 60;

/** Runs a shift to the end with nobody at the controls, recording the kg second by second. */
export function runUnmanaged(
  rules: PlazaRules,
  options: { seed: number },
): { total: number; byClass: [number, number, number]; trace: number[]; seconds: number; longestQueue: number } {
  const sim = createSim(rules, options);
  const trace: number[] = [0];
  let guard = 0;
  while (!sim.done && guard < 60 * 60 * 30) {
    step(sim, STEP_S);
    guard += 1;
    if (guard % 60 === 0) {
      trace.push(sim.co2);
    }
  }
  return { total: sim.co2, byClass: sim.co2ByClass, trace, seconds: sim.t, longestQueue: sim.longestQueue };
}
