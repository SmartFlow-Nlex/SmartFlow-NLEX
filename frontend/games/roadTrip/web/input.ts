import { X_LIMIT } from '../core/config';
import type { SimInput } from '../core/sim';
import type { SteeringMode } from '../core/types';

/**
 * Turns keys and touches into the simulation's one movement model (a target
 * position the car seeks at its steering speed).
 *
 * - Drag: a pad BELOW the car, so the finger never covers the car or what is
 *   coming. The car follows the finger 1:1 (at sensitivity 1, a lane of finger
 *   travel is a lane of car travel).
 *   A quick tap on the pad (no drag) steps one lane toward the side tapped,
 *   for players who find dragging hard.
 * - Lanes: two big buttons step one lane left or right - no continuous drag.
 * - Keys: Left/Right or A/D (held in drag mode, one lane per press in lane
 *   mode); Space, Shift or E for the teammate ability; Escape or P to pause.
 *
 * A cancelled touch, a lost pointer, a hidden page or a focus change clears
 * everything held, so the car never keeps steering on its own.
 */

export interface InputHost {
  /** Where the car is now (for lane steps and drag anchors). */
  playerX: () => number;
  /** Lane width in CSS px at the car, for 1:1 dragging. */
  laneWidthPx: () => number;
  /** The car on screen (CSS px), for tap-to-step. */
  carScreenX: () => number;
  onPause: () => void;
  /** Called on any touch or key, for the audio unlock. */
  onActivity: () => void;
}

export class InputController {
  private steering: SteeringMode = 'drag';
  private sensitivity = 1;
  private left = false;
  private right = false;
  private abilityQueued = false;
  private target: number | null = null;
  private drag: { id: number; startX: number; anchor: number; at: number; moved: number } | null = null;
  private readonly cleanups: (() => void)[] = [];
  private enabled = false;

  constructor(private readonly host: InputHost) {}

  configure(steering: SteeringMode, sensitivity: number): void {
    this.steering = steering;
    this.sensitivity = sensitivity;
    this.target = null;
  }

  /** Wires keys to the window and the touch controls inside `controls`. */
  attach(controls: { pad: HTMLElement; left: HTMLElement; right: HTMLElement; ability: HTMLElement | null }): void {
    this.detach();
    const on = <K extends keyof WindowEventMap>(target: Window | HTMLElement, type: K, fn: (e: WindowEventMap[K]) => void, options?: AddEventListenerOptions): void => {
      target.addEventListener(type, fn as EventListener, options);
      this.cleanups.push(() => target.removeEventListener(type, fn as EventListener, options));
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
        // Older WebViews: fine without capture.
      }
      this.drag = { id: e.pointerId, startX: e.clientX, anchor: this.target ?? this.host.playerX(), at: performance.now(), moved: 0 };
    });
    on(pad, 'pointermove', (e) => {
      if (this.drag === null || e.pointerId !== this.drag.id) {
        return;
      }
      this.drag.moved = Math.max(this.drag.moved, Math.abs(e.clientX - this.drag.startX));
      if (this.drag.moved < 8) {
        return;
      }
      const lanes = (e.clientX - this.drag.startX) / Math.max(20, this.host.laneWidthPx());
      this.target = clamp(this.drag.anchor + lanes * this.sensitivity);
    });
    const endDrag = (e: PointerEvent): void => {
      if (this.drag !== null && e.pointerId === this.drag.id) {
        this.drag = null;
      }
    };
    on(pad, 'pointerup', (e) => {
      const d = this.drag;
      if (d !== null && e.pointerId === d.id && d.moved < 8 && performance.now() - d.at < 300) {
        // A tap, not a drag: one lane toward the side tapped - of the car when the pad is under it,
        // of the pad itself when it is a side zone (landscape).
        const r = pad.getBoundingClientRect();
        const car = this.host.carScreenX();
        const ref = car >= r.left && car <= r.right ? car : (r.left + r.right) / 2;
        this.stepLane(e.clientX < ref ? -1 : 1);
      }
      endDrag(e);
    });
    on(pad, 'pointercancel', endDrag);
    on(pad, 'lostpointercapture', endDrag);

    // Touch acts on pointerdown (no click delay). A click with no pointerdown just before it is an
    // assistive activation (VoiceOver, Switch Access, keyboard) - it acts too, once.
    let lastDown = -1e9;
    const both = (el: HTMLElement, act: () => void): void => {
      on(el, 'pointerdown', (e) => {
        lastDown = performance.now();
        if (!this.enabled) {
          return;
        }
        this.host.onActivity();
        e.preventDefault();
        act();
      });
      on(el, 'click', () => {
        if (!this.enabled || performance.now() - lastDown < 600) {
          return;
        }
        this.host.onActivity();
        act();
      });
    };
    both(controls.left, () => this.stepLane(-1));
    both(controls.right, () => this.stepLane(1));
    if (controls.ability !== null) {
      both(controls.ability, () => {
        this.abilityQueued = true;
      });
    }
  }

  detach(): void {
    while (this.cleanups.length > 0) {
      this.cleanups.pop()!();
    }
    this.clear();
  }

  /** Only while a run is actually playing; everything held is dropped when it stops. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.clear();
    }
  }

  clear(): void {
    this.left = false;
    this.right = false;
    this.abilityQueued = false;
    this.drag = null;
  }

  /** Forget any steering target (a new run, or after a pause). */
  reset(): void {
    this.clear();
    this.target = null;
  }

  private stepLane(dir: -1 | 1): void {
    const from = this.target ?? this.host.playerX();
    const lane = Math.max(-1, Math.min(1, Math.round(from) + dir));
    this.target = lane;
  }

  private key(e: KeyboardEvent, down: boolean): void {
    const k = e.key;
    if (down) {
      this.host.onActivity();
    }
    if (k === 'Escape' || k === 'p' || k === 'P') {
      // Also during a countdown (the runner ignores it where pausing makes no sense).
      if (down) {
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
          this.stepLane(isLeft ? -1 : 1);
        }
      } else {
        if (isLeft) {
          this.left = down;
        } else {
          this.right = down;
        }
        // Held keys take over from a drag target.
        if (down) {
          this.target = null;
        }
      }
      return;
    }
    if ((k === ' ' || k === 'Shift' || k === 'e' || k === 'E' || k === 'ArrowUp') && down && !e.repeat) {
      e.preventDefault();
      this.abilityQueued = true;
    }
  }

  /** The input for one simulation step. The ability press is consumed once. */
  poll(): SimInput {
    const axis = (this.right ? 1 : 0) - (this.left ? 1 : 0);
    if (axis !== 0) {
      this.target = null;
    }
    const ability = this.abilityQueued;
    this.abilityQueued = false;
    return { axis, targetX: axis !== 0 ? null : this.target, ability };
  }
}

function clamp(x: number): number {
  return Math.max(-X_LIMIT, Math.min(X_LIMIT, x));
}
