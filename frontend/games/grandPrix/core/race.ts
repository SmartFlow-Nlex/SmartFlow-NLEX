import { BASE_CAR, CAR_HALF_W, CAR_LENGTH, GRASS_HALF, LAPS, PRESETS, TRACK_HALF, type DifficultyPreset } from './config';
import {
  AFTER_SPIN_S,
  BOX_RESPAWN_S,
  BUBBLE_S,
  COCONUT_SPEED,
  ITEM_ROLL_S,
  RED_LIGHT_S,
  SHOT_LIFE_S,
  SIPA_SPEED,
  SLICK_LIFE_S,
  SPIN_S,
  STAR_S,
  TURBO_ITEM_S,
  rollItem,
  type ItemId,
} from './items';
import { createRng, type Rng } from './rng';
import { BOX_ROWS, BOX_XS, TRACKS, curveAt, idealLine, lapLength, type TrackDef } from './tracks';
import type { Difficulty, RaceMode, RaceResult, TrackId, UpgradeId } from './types';

/**
 * The race simulation: fixed-step and deterministic for a seed and inputs.
 *
 * Driving model (the same controls as Navie's Road Trip: one target position
 * across the track, sought at the steering speed): the car accelerates by
 * itself; bends push it toward the outside, more the faster it goes, so the
 * player steers into them; the grass beyond the kerbs is slow; turbo cells
 * fill a three-part meter for the boost button; driving close behind a rival
 * (drafting) gives a small tow and slowly charges the meter.
 *
 * Rivals are plain numbered cars with their own habits - a quick one that runs
 * wide in bends, a blocker, a steady one - so they are told apart by how they
 * drive, not by names.
 */

export interface RaceOptions {
  track: TrackId;
  mode: RaceMode;
  difficulty: Difficulty;
  seed: number;
  upgrades: Partial<Record<UpgradeId, number>>;
  autoSteer: boolean;
  /** Time-trial ghost to race against: [distance, x] pairs every GHOST_DT. */
  ghost: number[] | null;
  laps?: number;
  /** Item boxes and items (Cup races only; Settings can switch them off). */
  items?: boolean;
}

export interface RaceInput {
  /** -1..1 held steering; ignored while targetX is set. */
  axis: number;
  targetX: number | null;
  /** True on the step the boost button was pressed. */
  boost: boolean;
  /** True on the step the item button was pressed. */
  item?: boolean;
}

export const NO_RACE_INPUT: RaceInput = { axis: 0, targetX: null, boost: false, item: false };

/** Ghost sample interval, seconds. */
export const GHOST_DT = 0.1;

export type Build = 'coupe' | 'hatch' | 'pickup' | 'van';

export interface RivalStyle {
  pace: number;
  /** 0-1: how much it slows in bends (high = wide and slow in corners). */
  corner: number;
  /** Preferred position on straights. */
  line: number;
  /** 0-1: blocks passes when allowed by the difficulty. */
  aggression: number;
  /** 0-1: chance per bend of running wide. */
  wobble: number;
}

export interface Car {
  id: string;
  /** Racing number (rivals), null for Navie. */
  number: number | null;
  colour: string;
  build: Build;
  style: RivalStyle | null;
  /** Total distance since the start line (negative on the grid). */
  distance: number;
  x: number;
  vx: number;
  targetX: number;
  speed: number;
  finished: boolean;
  finishTime: number | null;
  /** Seconds of contact cooldown (one bump per touch). */
  bumpT: number;
  /** Seconds left running wide (rival mistake). */
  wideT: number;
  /** Navie only: how far the bends have pushed the line the car is heading for. */
  slide: number;
  wideDir: number;
  /** The item held (null = none) and the seconds left on its roll (not usable yet). */
  item: ItemId | null;
  itemRoll: number;
  /** Rivals: seconds before they consider using their item. */
  itemHold: number;
  /** Item effects, seconds left. */
  spinT: number;
  spinDir: number;
  invulnT: number;
  shieldT: number;
  starT: number;
  slowT: number;
  /** Rivals' Turbo Kick (Navie's uses the boost). */
  turboT: number;
}

export const RIVALS: { number: number; colour: string; build: Build; style: RivalStyle; note: string }[] = [
  { number: 2, colour: '#E2453C', build: 'coupe', note: 'Quick, but runs wide in bends', style: { pace: 1.04, corner: 0.95, line: -0.4, aggression: 0.2, wobble: 0.18 } },
  { number: 7, colour: '#FFB020', build: 'hatch', note: 'Blocks when you try to pass', style: { pace: 0.99, corner: 0.5, line: 0.2, aggression: 0.9, wobble: 0.04 } },
  { number: 11, colour: '#2EAD5B', build: 'pickup', note: 'Steady, rarely makes mistakes', style: { pace: 0.97, corner: 0.35, line: 0.5, aggression: 0.3, wobble: 0 } },
  { number: 18, colour: '#7A5CE0', build: 'van', note: 'Slower, takes the wide line', style: { pace: 0.91, corner: 0.6, line: -0.7, aggression: 0.2, wobble: 0.08 } },
  { number: 24, colour: '#F1F3F6', build: 'coupe', note: 'Fast on straights, careful in bends', style: { pace: 1.0, corner: 0.7, line: 0.8, aggression: 0.4, wobble: 0.06 } },
];

export type RaceEvent =
  | { type: 'lap'; lap: number; time: number; best: boolean }
  | { type: 'finalLap' }
  | { type: 'bump'; side: number }
  | { type: 'wall' }
  | { type: 'grass' }
  | { type: 'pad' }
  | { type: 'turbo' }
  | { type: 'bolt' }
  | { type: 'boost' }
  | { type: 'boostEmpty' }
  | { type: 'place'; place: number; gained: boolean }
  | { type: 'finish'; place: number }
  | { type: 'itemGet'; who: string; item: ItemId }
  | { type: 'itemUse'; who: string; item: ItemId }
  | { type: 'spun'; who: string; by: string; cause: ItemId }
  | { type: 'blocked'; who: string }
  | { type: 'incoming'; by: string }
  | { type: 'redLight'; by: string; navieSlowed: boolean };

export interface ItemBox {
  at: number;
  x: number;
  /** Seconds until it is back (0 = there). */
  downT: number;
}

/** An oil slick on the track, at a distance into the lap. */
export interface Slick {
  id: number;
  at: number;
  x: number;
  owner: string;
  life: number;
}

/** A Coconut Roll or Sipa Ball on its way (absolute race distance). */
export interface Shot {
  id: number;
  kind: 'coconut' | 'sipa';
  owner: string;
  target: string | null;
  distance: number;
  x: number;
  speed: number;
  life: number;
}

export interface RaceState {
  track: TrackDef;
  length: number;
  laps: number;
  mode: RaceMode;
  preset: DifficultyPreset;
  time: number;
  cars: Car[];
  /** 0-1 in thirds. */
  boostMeter: number;
  boostT: number;
  draft: number;
  offroad: boolean;
  bolts: number;
  lapStart: number;
  lapTimes: number[];
  place: number;
  ghostCar: { distance: number; x: number } | null;
  /** Collected items, by "lap:index:sub". */
  collected: Set<string>;
  finished: boolean;
  /** Seconds since Navie crossed the line (cars keep rolling). */
  finishedT: number;
  /** Items on: boxes, slicks and shots. */
  items: boolean;
  boxes: ItemBox[];
  slicks: Slick[];
  shots: Shot[];
}

const WALL_X = GRASS_HALF - CAR_HALF_W;
const BOLT_SPACING = 3;

export class RaceSim {
  readonly state: RaceState;
  private readonly rng: Rng;
  private readonly car: typeof BASE_CAR;
  private readonly options: RaceOptions;
  private events: RaceEvent[] = [];
  private keyHeldLast = false;
  private ghostSamples: number[] = [];
  private ghostClock = 0;
  private lastPlace = 6;
  private lastLap = 0;
  private grassAnnounced = false;
  private nextId = 1;

  constructor(options: RaceOptions) {
    this.options = options;
    this.rng = createRng(options.seed);
    const track = TRACKS[options.track];
    const preset = PRESETS[options.difficulty];
    const up = options.upgrades;
    this.car = {
      ...BASE_CAR,
      top: BASE_CAR.top * (1 + 0.04 * (up.engine ?? 0)),
      drift: BASE_CAR.drift * preset.driftScale * (1 - 0.12 * (up.tyres ?? 0)),
      grassTop: BASE_CAR.grassTop * (1 + 0.1 * (up.tyres ?? 0)),
      boostSeconds: BASE_CAR.boostSeconds + 0.5 * (up.turbo ?? 0),
    };
    const cars: Car[] = [];
    const slot = (n: number): { distance: number; x: number } => {
      const row = Math.floor((n - 1) / 2);
      return { distance: -2 - row * 5 - (n % 2 === 0 ? 1.6 : 0), x: n % 2 === 1 ? -0.7 : 0.7 };
    };
    const playerSlot = options.mode === 'trial' ? 1 : preset.gridSlot;
    const start = slot(playerSlot);
    const fresh = { item: null, itemRoll: 0, itemHold: 0, spinT: 0, spinDir: 1, invulnT: 0, shieldT: 0, starT: 0, slowT: 0, turboT: 0 };
    cars.push({ id: 'navie', number: null, colour: '#3A8CF4', build: 'coupe', style: null, distance: start.distance, x: start.x, vx: 0, targetX: start.x, speed: 0, finished: false, finishTime: null, bumpT: 0, wideT: 0, wideDir: 0, slide: 0, ...fresh });
    if (options.mode === 'cup') {
      let n = 1;
      for (const rival of RIVALS) {
        if (n === playerSlot) {
          n += 1;
        }
        const s = slot(n);
        cars.push({ id: String(rival.number), number: rival.number, colour: rival.colour, build: rival.build, style: rival.style, distance: s.distance, x: s.x, vx: 0, targetX: s.x, speed: 0, finished: false, finishTime: null, bumpT: 0, wideT: 0, wideDir: 0, slide: 0, ...fresh });
        n += 1;
      }
    }
    this.state = {
      track,
      length: lapLength(track),
      laps: options.laps ?? LAPS,
      mode: options.mode,
      preset,
      time: 0,
      cars,
      boostMeter: options.mode === 'trial' ? 1 / 3 : 0,
      boostT: 0,
      draft: 0,
      offroad: false,
      bolts: 0,
      lapStart: 0,
      lapTimes: [],
      place: options.mode === 'cup' ? playerSlot : 1,
      ghostCar: options.ghost !== null && options.ghost.length >= 2 ? { distance: options.ghost[0], x: options.ghost[1] } : null,
      collected: new Set(),
      finished: false,
      finishedT: 0,
      items: options.items === true && options.mode === 'cup',
      boxes: options.items === true && options.mode === 'cup' ? BOX_ROWS[options.track].flatMap((at) => BOX_XS.map((x) => ({ at, x, downT: 0 }))) : [],
      slicks: [],
      shots: [],
    };
    this.lastPlace = this.state.place;
  }

  get player(): Car {
    return this.state.cars[0];
  }

  drainEvents(): RaceEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  private emit(e: RaceEvent): void {
    this.events.push(e);
  }

  /** Laps started by a car (1 on the grid). */
  lapOf(car: Car): number {
    return Math.max(1, Math.min(this.state.laps, Math.floor(Math.max(0, car.distance) / this.state.length) + 1));
  }

  step(dt: number, input: RaceInput): void {
    const s = this.state;
    s.time += dt;
    if (s.finished) {
      s.finishedT += dt;
    }
    for (const car of s.cars) {
      this.updateEffects(car, dt);
    }
    this.updatePlayer(dt, s.finished ? { axis: 0, targetX: idealLine(s.track, this.player.distance, s.length), boost: false } : input);
    for (let i = 1; i < s.cars.length; i += 1) {
      this.updateRival(s.cars[i], dt);
    }
    if (s.items) {
      this.updateItems(dt, s.finished ? false : input.item === true);
    }
    this.collide();
    this.updateGhost(dt);
    this.updatePlaces();
  }

  // -- Navie ----------------------------------------------------------------

  private updatePlayer(dt: number, given: RaceInput): void {
    const s = this.state;
    const p = this.player;
    const c = this.car;
    // Spun out: no steering or boost until the car straightens up.
    const input = p.spinT > 0 ? NO_RACE_INPUT : given;
    const curve = curveAt(s.track, p.distance, s.length);

    // Bends push outward, growing with the square of speed. The push builds up a
    // "slide" on where the car is heading, so holding still in a bend drifts wide
    // and the player steers into it; on straights the slide fades away again.
    // Auto-steer leans in for the player.
    const push = curve * c.drift * (p.speed / c.top) ** 2;
    const lean = this.options.autoSteer ? push * 0.88 : 0;
    p.slide -= (push - lean) * dt;
    if (Math.abs(curve) < 0.05) {
      p.slide -= Math.sign(p.slide) * Math.min(Math.abs(p.slide), 1.2 * dt);
    }
    p.slide = Math.max(-2.5, Math.min(2.5, p.slide));

    // Steering: the same seek-a-target model as Road Trip, aimed at target + slide.
    if (input.targetX !== null) {
      p.targetX = Math.max(-WALL_X, Math.min(WALL_X, input.targetX));
    } else if (input.axis !== 0) {
      p.targetX = p.x - p.slide + input.axis * 3;
    } else if (this.keyHeldLast) {
      p.targetX = p.x - p.slide;
    }
    this.keyHeldLast = input.targetX === null && input.axis !== 0;
    const aim = Math.max(-WALL_X, Math.min(WALL_X, p.targetX + p.slide));
    const desired = Math.max(-c.lateral, Math.min(c.lateral, (aim - p.x) * 10));
    p.vx += Math.max(-38 * dt, Math.min(38 * dt, desired - p.vx));
    p.x += p.vx * dt;
    if (Math.abs(p.x) > WALL_X) {
      p.x = Math.sign(p.x) * WALL_X;
      p.vx = 0;
      if (p.bumpT <= 0) {
        p.bumpT = 0.6;
        p.speed *= 0.82;
        this.emit({ type: 'wall' });
      }
    }
    p.bumpT = Math.max(0, p.bumpT - dt);

    // Speed.
    const wasOffroad = s.offroad;
    s.offroad = Math.abs(p.x) > TRACK_HALF + 0.05;
    if (s.offroad && !wasOffroad && !this.grassAnnounced) {
      this.grassAnnounced = true;
      this.emit({ type: 'grass' });
    }
    if (input.boost) {
      if (s.boostMeter >= 1 / 3 - 1e-6 && s.boostT <= 0) {
        s.boostMeter = Math.max(0, s.boostMeter - 1 / 3);
        s.boostT = c.boostSeconds;
        this.emit({ type: 'boost' });
      } else if (s.boostT <= 0) {
        this.emit({ type: 'boostEmpty' });
      }
    }
    s.boostT = Math.max(0, s.boostT - dt);
    this.updateDraft(dt);
    // Tyres scrub a little speed in tight bends, for everyone.
    let target = (s.offroad ? c.grassTop : c.top) * (1 - 0.1 * Math.abs(curve));
    if (s.boostT > 0) {
      target *= 1 + c.boostBonus;
    }
    if (s.draft > 0.5) {
      target *= 1.06;
    }
    target *= this.effectSpeed(p);
    const rate = target > p.speed ? c.accel : 14;
    p.speed += Math.max(-rate * dt, Math.min(rate * dt, target - p.speed));
    p.distance += p.speed * dt;

    this.collectItems();
    this.checkLaps();
  }

  private updateDraft(dt: number): void {
    const s = this.state;
    const p = this.player;
    let behind = false;
    for (let i = 1; i < s.cars.length; i += 1) {
      const r = s.cars[i];
      const gap = r.distance - p.distance;
      if (gap > 2 && gap < 9 && Math.abs(r.x - p.x) < 0.55) {
        behind = true;
        break;
      }
    }
    s.draft = Math.max(0, Math.min(1, s.draft + (behind ? 0.8 : -1.5) * dt));
    if (s.draft > 0.5) {
      s.boostMeter = Math.min(1, s.boostMeter + 0.06 * dt);
    }
  }

  private collectItems(): void {
    const s = this.state;
    const p = this.player;
    if (p.distance < 0) {
      return;
    }
    const lap = Math.floor(p.distance / s.length);
    if (lap >= s.laps) {
      return;
    }
    const d = p.distance - lap * s.length;
    s.track.items.forEach((item, i) => {
      const count = item.kind === 'bolts' ? 4 : 1;
      for (let k = 0; k < count; k += 1) {
        const at = item.at + k * BOLT_SPACING;
        const key = `${lap}:${i}:${k}`;
        if (s.collected.has(key) || Math.abs(d - at) > 0.9) {
          continue;
        }
        const reach = item.kind === 'pad' ? 0.65 : 0.5;
        if (Math.abs(p.x - item.x) > reach) {
          continue;
        }
        s.collected.add(key);
        if (item.kind === 'pad') {
          s.boostT = Math.max(s.boostT, 1.2);
          this.emit({ type: 'pad' });
        } else if (item.kind === 'turbo') {
          s.boostMeter = Math.min(1, s.boostMeter + 1 / 3);
          this.emit({ type: 'turbo' });
        } else {
          s.bolts += 1;
          this.emit({ type: 'bolt' });
        }
      }
    });
  }

  private checkLaps(): void {
    const s = this.state;
    const p = this.player;
    if (p.distance <= 0 || s.finished) {
      return;
    }
    const completed = Math.floor(p.distance / s.length);
    if (completed > this.lastLap) {
      this.lastLap = completed;
      const lapTime = s.time - s.lapStart;
      const best = s.lapTimes.length === 0 || lapTime < Math.min(...s.lapTimes);
      s.lapTimes.push(lapTime);
      s.lapStart = s.time;
      if (completed >= s.laps) {
        s.finished = true;
        p.finished = true;
        p.finishTime = s.time;
        this.updatePlaces();
        this.emit({ type: 'finish', place: s.place });
        return;
      }
      this.emit({ type: 'lap', lap: completed, time: lapTime, best });
      if (completed === s.laps - 1) {
        this.emit({ type: 'finalLap' });
      }
    }
  }

  // -- rivals ---------------------------------------------------------------------

  private updateRival(r: Car, dt: number): void {
    const s = this.state;
    const style = r.style!;
    const p = this.player;
    const curve = curveAt(s.track, r.distance, s.length);

    // Pace: their own, slower in bends, gently tied to Navie on easy settings.
    let target = BASE_CAR.top * s.preset.rivalPace * style.pace * (1 - Math.abs(curve) * (0.06 + style.corner * 0.1));
    const gap = r.distance - p.distance;
    const band = s.preset.rubberBand;
    if (gap > 20) {
      target *= 1 - band * 0.14 * Math.min(1, (gap - 20) / 40);
    } else if (gap < -20) {
      target *= 1 + band * 0.08 * Math.min(1, (-gap - 20) / 40);
    }
    if (r.finished) {
      target *= 0.6;
    }
    target *= this.effectSpeed(r);
    const rate = target > r.speed ? BASE_CAR.accel * 0.95 : 12;
    r.speed += Math.max(-rate * dt, Math.min(rate * dt, target - r.speed));

    // Line: the inside of bends, their own spot on straights.
    let aim = idealLine(s.track, r.distance, s.length) * 0.9 + style.line * (1 - Math.min(1, Math.abs(curve) * 2));
    // A mistake now and then: running wide through a bend.
    if (r.wideT > 0) {
      r.wideT -= dt;
      aim = r.wideDir * 1.5;
    } else if (Math.abs(curve) > 0.4 && this.rng.chance(style.wobble * dt * 0.6)) {
      r.wideT = 1.3;
      r.wideDir = -Math.sign(curve);
    }
    // Pass a slower car ahead on the side with more room.
    for (const other of s.cars) {
      if (other === r) {
        continue;
      }
      const ahead = other.distance - r.distance;
      if (ahead > 0 && ahead < 6 && Math.abs(other.x - r.x) < 0.7 && other.speed < r.speed) {
        aim = other.x > 0 ? other.x - 0.9 : other.x + 0.9;
        break;
      }
    }
    // Blockers drift toward Navie's line when Navie closes in from behind.
    if (s.preset.blocking && style.aggression > 0.6 && gap > 1.5 && gap < 9 && p.speed > r.speed && Math.abs(p.x - r.x) < 1.3) {
      aim = r.x + Math.sign(p.x - r.x) * 0.6;
    }
    if (r.spinT > 0) {
      aim = r.x;
    }
    r.targetX = Math.max(-TRACK_HALF + CAR_HALF_W, Math.min(TRACK_HALF - CAR_HALF_W, aim));
    const desired = Math.max(-2.4, Math.min(2.4, (r.targetX - r.x) * 4));
    r.vx += Math.max(-12 * dt, Math.min(12 * dt, desired - r.vx));
    r.x += r.vx * dt;
    r.x = Math.max(-WALL_X, Math.min(WALL_X, r.x));
    r.distance += r.speed * dt;
    r.bumpT = Math.max(0, r.bumpT - dt);
    if (!r.finished && r.distance >= s.laps * s.length) {
      r.finished = true;
      r.finishTime = s.time;
    }
    if (s.items && r.item !== null && r.itemRoll <= 0 && !r.finished && r.spinT <= 0) {
      this.rivalItem(r, curve, dt);
    }
  }

  /** Cars touching are pushed apart; the car behind loses a little speed, once per touch. */
  private collide(): void {
    const cars = this.state.cars;
    for (let i = 0; i < cars.length; i += 1) {
      for (let j = i + 1; j < cars.length; j += 1) {
        const a = cars[i];
        const b = cars[j];
        const dd = b.distance - a.distance;
        const dx = b.x - a.x;
        if (Math.abs(dd) >= CAR_LENGTH || Math.abs(dx) >= CAR_HALF_W * 2) {
          continue;
        }
        const overlap = CAR_HALF_W * 2 - Math.abs(dx);
        const side = dx === 0 ? (i % 2 === 0 ? 1 : -1) : Math.sign(dx);
        a.x -= side * overlap * 0.5;
        b.x += side * overlap * 0.5;
        a.vx -= side * 0.8;
        b.vx += side * 0.8;
        // The Fiesta Star bowls cars over; it never slows the star car itself.
        if (a.starT > 0 || b.starT > 0) {
          if (a.starT > 0 && b.starT <= 0) {
            this.hitCar(b, 'star', a.id);
          } else if (b.starT > 0 && a.starT <= 0) {
            this.hitCar(a, 'star', b.id);
          }
          continue;
        }
        const rear = dd > 0 ? a : b;
        if (rear.bumpT <= 0) {
          rear.bumpT = 0.5;
          rear.speed *= 0.86;
          if (a.id === 'navie' || b.id === 'navie') {
            this.emit({ type: 'bump', side: a.id === 'navie' ? side : -side });
          }
        }
      }
    }
  }

  // -- items ----------------------------------------------------------------------------

  /** Speed share from item effects: spun out, red light, star, a rival's Turbo Kick. */
  private effectSpeed(car: Car): number {
    let k = 1;
    if (car.spinT > 0) {
      k *= 0.3;
    }
    if (car.slowT > 0) {
      k *= 0.6;
    }
    if (car.starT > 0) {
      k *= 1.22;
    }
    if (car.turboT > 0) {
      k *= 1 + BASE_CAR.boostBonus;
    }
    return k;
  }

  private updateEffects(car: Car, dt: number): void {
    car.itemRoll = Math.max(0, car.itemRoll - dt);
    car.spinT = Math.max(0, car.spinT - dt);
    car.invulnT = Math.max(0, car.invulnT - dt);
    car.shieldT = Math.max(0, car.shieldT - dt);
    car.starT = Math.max(0, car.starT - dt);
    car.slowT = Math.max(0, car.slowT - dt);
    car.turboT = Math.max(0, car.turboT - dt);
  }

  private lapPos(distance: number): number {
    const L = this.state.length;
    return ((distance % L) + L) % L;
  }

  /** Boxes, slicks and shots for everyone; Navie's item button. */
  private updateItems(dt: number, useNavie: boolean): void {
    const s = this.state;
    const order = this.order();
    const placeOf = (car: Car): number => order.indexOf(car) + 1;
    // Boxes.
    for (const box of s.boxes) {
      box.downT = Math.max(0, box.downT - dt);
    }
    for (const car of s.cars) {
      if (car.finished || car.distance < 0) {
        continue;
      }
      const d = this.lapPos(car.distance);
      for (const box of s.boxes) {
        if (box.downT > 0 || Math.abs(d - box.at) > 0.9 || Math.abs(car.x - box.x) > 0.55) {
          continue;
        }
        box.downT = BOX_RESPAWN_S;
        if (car.item === null && car.itemRoll <= 0) {
          const rival = car.id !== 'navie';
          car.item = rollItem(this.rng, placeOf(car), s.cars.length, rival && s.preset.id === 'rookie');
          car.itemRoll = ITEM_ROLL_S;
          // Rivals think a moment before using it (longer on the gentler settings).
          car.itemHold = (0.6 + this.rng.next() * 2.4) * (1 + s.preset.rubberBand);
          this.emit({ type: 'itemGet', who: car.id, item: car.item });
        }
      }
    }
    const p = this.player;
    if (useNavie && p.item !== null && p.itemRoll <= 0 && p.spinT <= 0) {
      this.useItem(p, order);
    }
    // Oil slicks.
    for (const slick of s.slicks) {
      slick.life -= dt;
    }
    for (const slick of s.slicks) {
      for (const car of s.cars) {
        if (slick.life <= 0 || car.finished || car.distance < 0) {
          continue;
        }
        // The one who dropped it is safe from it for the first moment.
        if (car.id === slick.owner && SLICK_LIFE_S - slick.life < 1) {
          continue;
        }
        if (Math.abs(this.lapPos(car.distance) - slick.at) < 0.8 && Math.abs(car.x - slick.x) < 0.55) {
          this.hitCar(car, 'oil', slick.owner);
          slick.life = 0;
        }
      }
    }
    s.slicks = s.slicks.filter((slick) => slick.life > 0);
    // Coconuts and sipa balls.
    for (const shot of s.shots) {
      shot.life -= dt;
      if (shot.kind === 'sipa' && shot.target !== null) {
        const target = s.cars.find((c) => c.id === shot.target);
        if (target !== undefined && !target.finished) {
          // It homes in sideways, and always outruns its target.
          shot.speed = Math.max(SIPA_SPEED, target.speed + 12);
          shot.x += Math.max(-6 * dt, Math.min(6 * dt, target.x - shot.x));
        }
      }
      shot.distance += shot.speed * dt;
      if (Math.abs(shot.x) > WALL_X + 0.1) {
        shot.life = 0;
      }
      for (const car of s.cars) {
        if (shot.life <= 0 || car.finished || (car.id === shot.owner && SHOT_LIFE_S - shot.life < 1)) {
          continue;
        }
        if (Math.abs(car.distance - shot.distance) < 1.2 && Math.abs(car.x - shot.x) < 0.55) {
          this.hitCar(car, shot.kind, shot.owner);
          shot.life = 0;
        }
      }
    }
    s.shots = s.shots.filter((shot) => shot.life > 0);
  }

  private useItem(car: Car, order: Car[]): void {
    const s = this.state;
    const item = car.item;
    if (item === null) {
      return;
    }
    car.item = null;
    this.emit({ type: 'itemUse', who: car.id, item });
    switch (item) {
      case 'turbo':
        if (car.id === 'navie') {
          s.boostT = Math.max(s.boostT, TURBO_ITEM_S);
        } else {
          car.turboT = TURBO_ITEM_S;
        }
        break;
      case 'oil':
        s.slicks.push({ id: this.nextId++, at: this.lapPos(car.distance - 2.2), x: car.x, owner: car.id, life: SLICK_LIFE_S });
        break;
      case 'coconut':
        s.shots.push({ id: this.nextId++, kind: 'coconut', owner: car.id, target: null, distance: car.distance + 1.8, x: car.x, speed: COCONUT_SPEED, life: SHOT_LIFE_S });
        break;
      case 'sipa': {
        // The car just ahead in the race (none for the leader: then it rolls straight on).
        const index = order.indexOf(car);
        const ahead = index > 0 ? order[index - 1] : null;
        const target = ahead !== null && !ahead.finished ? ahead.id : null;
        s.shots.push({ id: this.nextId++, kind: 'sipa', owner: car.id, target, distance: car.distance + 1.8, x: car.x, speed: SIPA_SPEED, life: SHOT_LIFE_S });
        if (target === 'navie') {
          this.emit({ type: 'incoming', by: car.id });
        }
        break;
      }
      case 'bubble':
        car.shieldT = BUBBLE_S;
        break;
      case 'star':
        car.starT = STAR_S;
        car.spinT = 0;
        car.slowT = 0;
        break;
      case 'redLight': {
        const index = order.indexOf(car);
        let navieSlowed = false;
        for (const other of order.slice(0, Math.max(0, index))) {
          if (other.finished || other.starT > 0) {
            continue;
          }
          if (other.shieldT > 0) {
            other.shieldT = 0;
            this.emit({ type: 'blocked', who: other.id });
            continue;
          }
          other.slowT = RED_LIGHT_S;
          navieSlowed = navieSlowed || other.id === 'navie';
        }
        this.emit({ type: 'redLight', by: car.id, navieSlowed });
        break;
      }
    }
  }

  /** A slick, shot or star reaches a car: it spins out - unless protected. */
  private hitCar(car: Car, cause: ItemId, by: string): void {
    if (car.finished || car.starT > 0 || car.invulnT > 0) {
      return;
    }
    if (car.shieldT > 0) {
      car.shieldT = 0;
      car.invulnT = 0.5;
      this.emit({ type: 'blocked', who: car.id });
      return;
    }
    car.spinT = SPIN_S;
    car.spinDir = this.rng.chance(0.5) ? 1 : -1;
    // Spinning, then a moment of protection: hits never chain.
    car.invulnT = SPIN_S + AFTER_SPIN_S;
    car.speed *= 0.55;
    car.vx = 0;
    if (car.id === 'navie') {
      this.state.boostT = 0;
    }
    this.emit({ type: 'spun', who: car.id, by, cause });
  }

  /** When a rival uses what it holds: simple, readable habits. */
  private rivalItem(r: Car, curve: number, dt: number): void {
    r.itemHold -= dt;
    if (r.itemHold > 0) {
      return;
    }
    const s = this.state;
    const order = this.order();
    const near = (from: number, to: number, lateral: number): boolean =>
      s.cars.some((c) => c !== r && !c.finished && c.distance - r.distance > from && c.distance - r.distance < to && Math.abs(c.x - r.x) < lateral);
    const late = r.itemHold < -6;
    let use = false;
    switch (r.item) {
      case 'turbo':
        use = Math.abs(curve) < 0.25;
        break;
      case 'oil':
        use = near(-14, -3, 0.8) || late;
        break;
      case 'coconut':
        use = near(4, 30, 0.6) || late;
        break;
      default:
        use = true;
    }
    if (use) {
      this.useItem(r, order);
    }
  }

  // -- ghost and places ---------------------------------------------------------------

  private updateGhost(dt: number): void {
    const s = this.state;
    if (s.mode !== 'trial' || s.finished) {
      return;
    }
    this.ghostClock += dt;
    while (this.ghostClock >= GHOST_DT) {
      this.ghostClock -= GHOST_DT;
      this.ghostSamples.push(Math.round(this.player.distance * 10) / 10, Math.round(this.player.x * 100) / 100);
      // The saved ghost replays alongside.
      const ghost = this.options.ghost;
      const index = (this.ghostSamples.length / 2 - 1) * 2;
      if (ghost !== null && s.ghostCar !== null && index + 1 < ghost.length) {
        s.ghostCar = { distance: ghost[index], x: ghost[index + 1] };
      }
    }
  }

  private progressOf(car: Car): number {
    return car.finished && car.finishTime !== null ? 1e6 - car.finishTime : car.distance;
  }

  /** Cars in race order: finishers by time, then the rest by distance. */
  order(): Car[] {
    return [...this.state.cars].sort((a, b) => this.progressOf(b) - this.progressOf(a));
  }

  private updatePlaces(): void {
    const s = this.state;
    // The place freezes once Navie has crossed the line.
    if (s.mode !== 'cup' || (s.finished && s.finishedT > 0)) {
      return;
    }
    const place = this.order().findIndex((car) => car.id === 'navie') + 1;
    if (place !== this.lastPlace && s.time > 1) {
      this.emit({ type: 'place', place, gained: place < this.lastPlace });
    }
    this.lastPlace = place;
    s.place = place;
  }

  result(runId: string, abandoned = false): RaceResult {
    const s = this.state;
    return {
      runId,
      mode: s.mode,
      track: s.track.id,
      difficulty: s.preset.id,
      place: s.mode === 'cup' ? s.place : 1,
      order: this.order().map((car) => car.id),
      totalTime: this.player.finishTime ?? s.time,
      bestLap: s.lapTimes.length > 0 ? Math.min(...s.lapTimes) : s.time,
      boltsCollected: s.bolts,
      ghost: s.mode === 'trial' && !abandoned ? this.ghostSamples.slice() : null,
      abandoned,
    };
  }
}
