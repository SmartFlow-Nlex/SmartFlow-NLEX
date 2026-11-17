import { STEP } from '../core/config';
import type { RaceInput } from '../core/race';
import type { SteerFeel, SteeringMode } from '../core/types';

/**
 * Keys, touches and tilt -> the race's steering.
 *
 * Wheel (the default): a steering wheel in the bottom corner. Put a thumb on it and turn it: the
 * wheel follows the thumb's angle round its centre (clockwise steers right), from wherever the thumb
 * landed, so touching it never jumps. It turns at most `lock` degrees each way; how far it is turned
 * sets how fast the car crosses the road (a small dead zone, then a gentle curve). Let go and it
 * springs back to straight. The thumb is captured, so sliding off the wheel keeps steering; a thumb
 * right on the hub steers by sliding sideways, where an angle would be jumpy. Keys turn it too.
 * Buttons: hold ◀ or ▶ to steer, release to straighten. Tilt: lean the phone (calibrated in Settings).
 * Lanes: one tap moves one racing line (the classic mode). Keys: Left/Right or A/D steer in every mode
 * but Lanes, where they move a line. Space / Shift / Up boost, X / E / Down the item, Escape or P pause.
 *
 * Steering is smoothed once per simulation step (a fixed 1/60 s), so it feels the same at any frame
 * rate. Anything held is dropped on a cancelled touch, focus loss or a hidden page.
 */

const LINES = [-1.2, -0.4, 0.4, 1.2];

/**
 * Per feel: the wheel's turn each way (degrees) and the response curve and strongest turn; smoothing
 * (s) for the wheel, held buttons and tilt; how quickly a released wheel springs back (s); tilt for
 * full steering (degrees). Easy: the most wheel for a turn, never quite full lock, a gentle spring back.
 */
const FEEL: Record<SteerFeel, { lock: number; curve: number; max: number; tau: number; hold: number; tiltTau: number; back: number; tilt: number }> = {
  easy: { lock: 110, curve: 1.4, max: 0.9, tau: 0.045, hold: 0.15, tiltTau: 0.08, back: 0.13, tilt: 26 },
  normal: { lock: 100, curve: 1.2, max: 1, tau: 0.032, hold: 0.1, tiltTau: 0.055, back: 0.095, tilt: 20 },
  advanced: { lock: 90, curve: 1.05, max: 1, tau: 0.022, hold: 0.07, tiltTau: 0.035, back: 0.07, tilt: 15 },
};
/** Share of the lock that counts as straight. */
const DEAD = 0.05;
/** A thumb closer to the hub than this share of the radius steers by sliding sideways. */
const HUB = 0.28;

export interface InputHost {
  playerX: () => number;
  /** Navie's current slide in the bend (so lane taps aim where the car actually goes). */
  slide: () => number;
  laneWidthPx: () => number;
  onPause: () => void;
  onActivity: () => void;
  /** Tilt was chosen but the phone sends no tilt: the race falls back to the wheel. */
  onTiltUnavailable?: () => void;
}

export interface Controls {
  /** The wheel's touch area (a little bigger than the wheel) and the wheel picture itself (for its centre). */
  wheelZone: HTMLElement;
  wheel: HTMLElement;
  left: HTMLElement;
  right: HTMLElement;
  boost: HTMLElement;
  item?: HTMLElement;
}

type OrientationCtor = { requestPermission?: () => Promise<'granted' | 'denied'> };

export function tiltSupported(): boolean {
  return typeof window !== 'undefined' && typeof (window as unknown as { DeviceOrientationEvent?: unknown }).DeviceOrientationEvent !== 'undefined';
}

/** Asks for motion access where the browser wants it (iPhone); must run inside a tap. */
export async function requestTilt(): Promise<boolean> {
  if (!tiltSupported()) {
    return false;
  }
  const ctor = (window as unknown as { DeviceOrientationEvent: OrientationCtor }).DeviceOrientationEvent;
  if (typeof ctor.requestPermission === 'function') {
    try {
      return (await ctor.requestPermission()) === 'granted';
    } catch {
      return false;
    }
  }
  return true;
}

/** The phone's left-right tilt in degrees, whichever way up it is held. */
export function tiltOf(e: DeviceOrientationEvent): number | null {
  const angle = (typeof screen !== 'undefined' && screen.orientation ? screen.orientation.angle : (window as unknown as { orientation?: number }).orientation) ?? 0;
  if (angle === 90) {
    return e.beta;
  }
  if (angle === -90 || angle === 270) {
    return e.beta === null ? null : -e.beta;
  }
  return e.gamma;
}

/** Degrees from 12 o'clock, clockwise, of a point round a centre (screen y points down). */
function clockAngle(x: number, y: number, cx: number, cy: number): number {
  return (Math.atan2(x - cx, cy - y) * 180) / Math.PI;
}

/** The shortest signed turn from one angle to another, -180..180. */
function turnBetween(from: number, to: number): number {
  let d = to - from;
  while (d > 180) {
    d -= 360;
  }
  while (d < -180) {
    d += 360;
  }
  return d;
}

export class RaceInputController {
  private steering: SteeringMode = 'wheel';
  private sensitivity = 1;
  private feel = FEEL.easy;
  private assist = true;
  private tiltZero = 0;
  private left = false;
  private right = false;
  private btnLeft = false;
  private btnRight = false;
  private boostQueued = false;
  private itemQueued = false;
  private target: number | null = null;
  /** The thumb on the wheel: its pointer, the wheel's centre and radius, and where it was last. */
  private grip: { id: number; cx: number; cy: number; r: number; angle: number; x: number } | null = null;
  /** How far the wheel is turned, degrees (clockwise = right). */
  private wheelDeg = 0;
  private tilt: number | null = null;
  private tiltSince = 0;
  private steerNow = 0;
  private line = 1;
  private enabled = false;
  private readonly cleanups: (() => void)[] = [];

  constructor(private readonly host: InputHost) {}

  configure(steering: SteeringMode, sensitivity: number, feel: SteerFeel = 'easy', assist = true, tiltZero = 0): void {
    this.steering = steering;
    this.sensitivity = sensitivity;
    this.feel = FEEL[feel];
    this.assist = assist;
    this.tiltZero = tiltZero;
    this.target = null;
  }

  get mode(): SteeringMode {
    return this.steering;
  }

  /** The wheel's turn for full steering: the feel's, scaled by the old sensitivity setting. */
  private lock(): number {
    return this.feel.lock / Math.max(0.6, Math.min(1.6, this.sensitivity));
  }

  attach(controls: Controls): void {
    this.detach();
    const on = <K extends keyof WindowEventMap>(target: Window | HTMLElement, type: K, fn: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions): void => {
      target.addEventListener(type, fn as EventListener, opts);
      this.cleanups.push(() => target.removeEventListener(type, fn as EventListener, opts));
    };
    on(window, 'keydown', (e) => this.key(e, true));
    on(window, 'keyup', (e) => this.key(e, false));
    on(window, 'blur', () => this.clear());
    /* The wheel: one thumb at a time; the boost and item buttons take other thumbs at the same time. */
    const zone = controls.wheelZone;
    on(zone, 'pointerdown', (e) => {
      if (!this.enabled || this.steering !== 'wheel' || this.grip !== null) {
        return;
      }
      this.host.onActivity();
      e.preventDefault();
      try {
        zone.setPointerCapture(e.pointerId);
      } catch {
        // Fine without capture: moves still arrive while the thumb stays over the wheel.
      }
      const box = controls.wheel.getBoundingClientRect();
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height / 2;
      this.grip = { id: e.pointerId, cx, cy, r: Math.max(20, box.width / 2), angle: clockAngle(e.clientX, e.clientY, cx, cy), x: e.clientX };
    });
    on(zone, 'pointermove', (e) => {
      const g = this.grip;
      if (g === null || e.pointerId !== g.id) {
        return;
      }
      e.preventDefault();
      const angle = clockAngle(e.clientX, e.clientY, g.cx, g.cy);
      const near = Math.hypot(e.clientX - g.cx, e.clientY - g.cy) < g.r * HUB;
      /* On the hub an angle swings wildly for a tiny move: there, sliding sideways turns the wheel as if holding its top. */
      const turn = near ? ((e.clientX - g.x) / (g.r * 0.55)) * (180 / Math.PI) : turnBetween(g.angle, angle);
      g.angle = angle;
      g.x = e.clientX;
      const lock = this.lock();
      this.wheelDeg = Math.max(-lock, Math.min(lock, this.wheelDeg + turn));
    });
    const end = (e: PointerEvent): void => {
      if (this.grip !== null && e.pointerId === this.grip.id) {
        this.grip = null;
      }
    };
    on(zone, 'pointerup', end);
    on(zone, 'pointercancel', end);
    on(zone, 'lostpointercapture', end);
    on(zone, 'contextmenu', (e) => e.preventDefault());
    /* The side buttons: hold to steer (Buttons), or one tap per racing line (Lanes). */
    const hold = (el: HTMLElement, dir: -1 | 1): void => {
      let id: number | null = null;
      on(el, 'pointerdown', (e) => {
        if (!this.enabled) {
          return;
        }
        this.host.onActivity();
        e.preventDefault();
        if (this.steering === 'lanes') {
          this.stepLine(dir);
          return;
        }
        id = e.pointerId;
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          // Fine without capture.
        }
        this.setButton(dir, true);
      });
      const up = (e: PointerEvent): void => {
        if (id !== null && e.pointerId === id) {
          id = null;
          this.setButton(dir, false);
        }
      };
      on(el, 'pointerup', up);
      on(el, 'pointercancel', up);
      on(el, 'lostpointercapture', up);
      on(el, 'contextmenu', (e) => e.preventDefault());
    };
    hold(controls.left, -1);
    hold(controls.right, 1);
    on(controls.boost, 'pointerdown', (e) => {
      if (!this.enabled) {
        return;
      }
      this.host.onActivity();
      e.preventDefault();
      this.boostQueued = true;
    });
    const item = controls.item;
    if (item !== undefined) {
      // Touch acts on pointerdown; a click with no pointerdown just before it (screen readers, switches) acts too.
      let lastDown = -1e9;
      on(item, 'pointerdown', (e) => {
        lastDown = performance.now();
        if (!this.enabled) {
          return;
        }
        this.host.onActivity();
        e.preventDefault();
        this.itemQueued = true;
      });
      on(item, 'click', () => {
        if (this.enabled && performance.now() - lastDown > 600) {
          this.itemQueued = true;
        }
      });
    }
    /* Tilt: read all the time in tilt mode; a phone that never reports one falls back to the wheel. */
    if (this.steering === 'tilt' && tiltSupported()) {
      this.tilt = null;
      this.tiltSince = performance.now();
      on(window, 'deviceorientation', (e) => {
        const t = tiltOf(e);
        if (t !== null && Number.isFinite(t)) {
          this.tilt = t;
        }
      });
    }
  }

  private setButton(dir: -1 | 1, down: boolean): void {
    if (dir < 0) {
      this.btnLeft = down;
    } else {
      this.btnRight = down;
    }
  }

  detach(): void {
    while (this.cleanups.length > 0) {
      this.cleanups.pop()!();
    }
    this.clear();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) {
      this.clear();
    } else if (this.steering === 'tilt') {
      this.tiltSince = performance.now();
    }
  }

  clear(): void {
    this.left = false;
    this.right = false;
    this.btnLeft = false;
    this.btnRight = false;
    this.boostQueued = false;
    this.itemQueued = false;
    this.grip = null;
  }

  reset(): void {
    this.clear();
    this.target = null;
    this.steerNow = 0;
    this.wheelDeg = 0;
  }

  /** Outside the race (countdown, finish, pause) a wheel nobody holds eases back to straight, at frame rate. */
  settle(dt: number): void {
    if (this.grip === null && this.wheelDeg !== 0) {
      this.wheelDeg *= Math.exp(-dt / this.feel.back);
      if (Math.abs(this.wheelDeg) < 0.05) {
        this.wheelDeg = 0;
      }
    }
  }

  /** How far the wheel is turned, degrees, for drawing it. */
  get wheelAngle(): number {
    return this.wheelDeg;
  }

  /** A thumb is on the wheel. */
  get gripped(): boolean {
    return this.grip !== null;
  }

  /** The smoothed steering, -1..1 (for the tilt level and the tests). */
  get steerValue(): number {
    return this.steerNow;
  }

  private stepLine(dir: -1 | 1): void {
    if (this.target === null) {
      // Start from the line nearest where Navie is heading.
      const x = this.host.playerX() - this.host.slide();
      this.line = LINES.reduce((best, v, i) => (Math.abs(v - x) < Math.abs(LINES[best] - x) ? i : best), 0);
    }
    this.line = Math.max(0, Math.min(LINES.length - 1, this.line + dir));
    this.target = LINES[this.line];
  }

  private key(e: KeyboardEvent, down: boolean): void {
    if (down) {
      this.host.onActivity();
    }
    const k = e.key;
    if (k === 'Escape' || k === 'p' || k === 'P') {
      if (down && this.enabled) {
        e.preventDefault();
        this.host.onPause();
      }
      return;
    }
    if (!this.enabled) {
      return;
    }
    const isLeft = k === 'ArrowLeft' || k === 'a' || k === 'A';
    const isRight = k === 'ArrowRight' || k === 'd' || k === 'D';
    if (isLeft || isRight) {
      e.preventDefault();
      if (this.steering === 'lanes') {
        if (down && !e.repeat) {
          this.stepLine(isLeft ? -1 : 1);
        }
      } else if (isLeft) {
        this.left = down;
      } else {
        this.right = down;
      }
      return;
    }
    if ((k === ' ' || k === 'Shift' || k === 'ArrowUp' || k === 'w' || k === 'W') && down && !e.repeat) {
      e.preventDefault();
      this.boostQueued = true;
    }
    if ((k === 'x' || k === 'X' || k === 'e' || k === 'E' || k === 'ArrowDown' || k === 's' || k === 'S') && down && !e.repeat) {
      e.preventDefault();
      this.itemQueued = true;
    }
  }

  /** Dead zone, then a gentle curve up to the feel's strongest turn. */
  private shape(u: number): number {
    const a = Math.abs(u);
    if (a <= DEAD) {
      return 0;
    }
    const k = Math.min(1, (a - DEAD) / (1 - DEAD));
    return Math.sign(u) * k ** this.feel.curve * this.feel.max;
  }

  /** Called once per simulation step. */
  poll(): RaceInput {
    const boost = this.boostQueued;
    this.boostQueued = false;
    const item = this.itemQueued;
    this.itemQueued = false;
    if (this.steering === 'lanes') {
      const axis = (this.right ? 1 : 0) - (this.left ? 1 : 0);
      return { axis: 0, targetX: axis !== 0 ? null : this.target, steer: null, boost, item };
    }
    let raw = 0;
    let tau = this.feel.tau;
    const keys = (this.right || this.btnRight ? 1 : 0) - (this.left || this.btnLeft ? 1 : 0);
    if (this.steering === 'wheel') {
      const lock = this.lock();
      if (this.grip === null) {
        /* Let go: the wheel springs back to straight. Held keys turn it most of the way instead. */
        const want = keys * lock * 0.85;
        const ease = want === 0 ? this.feel.back : this.feel.hold;
        this.wheelDeg += (want - this.wheelDeg) * (1 - Math.exp(-STEP / ease));
        if (want === 0 && Math.abs(this.wheelDeg) < 0.05) {
          this.wheelDeg = 0;
        }
      }
      raw = this.shape(this.wheelDeg / lock);
    } else if (keys !== 0) {
      /* Held buttons and keys ease in rather than snap, and stop at the feel's strongest turn. */
      raw = keys * this.feel.max;
      tau = this.feel.hold;
    } else if (this.steering === 'tilt' && this.tilt !== null) {
      raw = this.shape((this.tilt - this.tiltZero) / this.feel.tilt);
      tau = this.feel.tiltTau;
    }
    if (this.steering === 'tilt' && this.enabled && this.tilt === null && performance.now() - this.tiltSince > 1500) {
      this.tiltSince = Infinity;
      this.host.onTiltUnavailable?.();
    }
    /* The assist softens sudden changes a little more; letting go returns to straight a touch quicker. */
    if (this.assist) {
      tau *= 1.25;
    }
    if (raw === 0) {
      tau *= 0.8;
    }
    this.steerNow += (raw - this.steerNow) * (1 - Math.exp(-STEP / tau));
    if (Math.abs(this.steerNow) < 0.002 && raw === 0) {
      this.steerNow = 0;
    }
    return { axis: 0, targetX: null, steer: this.steerNow, boost, item };
  }
}
