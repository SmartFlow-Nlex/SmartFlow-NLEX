import { CAR_HALF_W, GRASS_HALF } from '../core/config';
import type { RaceInput } from '../core/race';
import type { SteeringMode } from '../core/types';

/**
 * Keys and touches -> the race's one steering model (a target position).
 * Drag: a pad under the car, 1:1 with the car at sensitivity 1. Lanes: four
 * racing lines, one tap moves one line. Keys: Left/Right or A/D, Space /
 * Shift / Up for boost, X / E / Down for the item, Escape or P to pause. Anything held is dropped on a
 * cancelled touch, focus loss or a hidden page.
 */

const LINES = [-1.2, -0.4, 0.4, 1.2];
const LIMIT = GRASS_HALF - CAR_HALF_W;

export interface InputHost {
  playerX: () => number;
  /** Navie's current slide in the bend (so lane taps aim where the car actually goes). */
  slide: () => number;
  laneWidthPx: () => number;
  onPause: () => void;
  onActivity: () => void;
}

export class RaceInputController {
  private steering: SteeringMode = 'drag';
  private sensitivity = 1;
  private left = false;
  private right = false;
  private boostQueued = false;
  private itemQueued = false;
  private target: number | null = null;
  private drag: { id: number; startX: number; anchor: number } | null = null;
  private line = 1;
  private enabled = false;
  private readonly cleanups: (() => void)[] = [];

  constructor(private readonly host: InputHost) {}

  configure(steering: SteeringMode, sensitivity: number): void {
    this.steering = steering;
    this.sensitivity = sensitivity;
    this.target = null;
  }

  attach(controls: { pad: HTMLElement; left: HTMLElement; right: HTMLElement; boost: HTMLElement; item?: HTMLElement }): void {
    this.detach();
    const on = <K extends keyof WindowEventMap>(target: Window | HTMLElement, type: K, fn: (e: WindowEventMap[K]) => void): void => {
      target.addEventListener(type, fn as EventListener);
      this.cleanups.push(() => target.removeEventListener(type, fn as EventListener));
    };
    on(window, 'keydown', (e) => this.key(e, true));
    on(window, 'keyup', (e) => this.key(e, false));
    on(window, 'blur', () => this.clear());
    const pad = controls.pad;
    on(pad, 'pointerdown', (e) => {
      if (!this.enabled || this.steering !== 'drag') {
        return;
      }
      this.host.onActivity();
      e.preventDefault();
      try {
        pad.setPointerCapture(e.pointerId);
      } catch {
        // Fine without capture.
      }
      this.drag = { id: e.pointerId, startX: e.clientX, anchor: this.target ?? this.host.playerX() - this.host.slide() };
    });
    on(pad, 'pointermove', (e) => {
      if (this.drag === null || e.pointerId !== this.drag.id) {
        return;
      }
      const lanes = (e.clientX - this.drag.startX) / Math.max(20, this.host.laneWidthPx());
      this.target = Math.max(-LIMIT, Math.min(LIMIT, this.drag.anchor + lanes * this.sensitivity));
    });
    const end = (e: PointerEvent): void => {
      if (this.drag !== null && e.pointerId === this.drag.id) {
        this.drag = null;
      }
    };
    on(pad, 'pointerup', end);
    on(pad, 'pointercancel', end);
    on(pad, 'lostpointercapture', end);
    const step = (dir: -1 | 1) => (e: PointerEvent): void => {
      if (!this.enabled) {
        return;
      }
      this.host.onActivity();
      e.preventDefault();
      this.stepLine(dir);
    };
    on(controls.left, 'pointerdown', step(-1));
    on(controls.right, 'pointerdown', step(1));
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
    }
  }

  clear(): void {
    this.left = false;
    this.right = false;
    this.boostQueued = false;
    this.itemQueued = false;
    this.drag = null;
  }

  reset(): void {
    this.clear();
    this.target = null;
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
      } else {
        if (isLeft) {
          this.left = down;
        } else {
          this.right = down;
        }
        if (down) {
          this.target = null;
        }
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

  poll(): RaceInput {
    const axis = (this.right ? 1 : 0) - (this.left ? 1 : 0);
    if (axis !== 0) {
      this.target = null;
    }
    const boost = this.boostQueued;
    this.boostQueued = false;
    const item = this.itemQueued;
    this.itemQueued = false;
    return { axis, targetX: axis !== 0 ? null : this.target, boost, item };
  }
}
