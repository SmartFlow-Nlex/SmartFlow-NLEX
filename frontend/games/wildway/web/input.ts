/**
 * Touch, keyboard and controller, all feeding the same small state. Touch: the left of
 * the screen is a floating stick, the right drags the camera. Anything held is dropped
 * when a touch is cancelled or the page loses focus.
 */

export interface Input {
  moveX: number;
  moveY: number;
  lookX: number;
  lookY: number;
  actionHeld: boolean;
  abilityHeld: boolean;
}

export class InputController {
  readonly state: Input = { moveX: 0, moveY: 0, lookX: 0, lookY: 0, actionHeld: false, abilityHeld: false };
  enabled = true;
  /** Called for one-shot keys and controller buttons. */
  onSwitch: ((index: number) => void) | null = null;
  onCycle: (() => void) | null = null;
  onPause: (() => void) | null = null;
  private stickId: number | null = null;
  private stickStart = { x: 0, y: 0 };
  private lookId: number | null = null;
  private lookLast = { x: 0, y: 0 };
  private touchX = 0;
  private touchY = 0;
  private readonly keys = new Set<string>();
  private padButtons: boolean[] = [];
  private readonly cleanups: (() => void)[] = [];

  constructor(
    private readonly surface: HTMLElement,
    private readonly stickEl: HTMLElement,
    private readonly knobEl: HTMLElement,
  ) {
    const down = (e: PointerEvent): void => this.down(e);
    const move = (e: PointerEvent): void => this.move(e);
    const up = (e: PointerEvent): void => this.up(e);
    surface.addEventListener('pointerdown', down);
    surface.addEventListener('pointermove', move);
    surface.addEventListener('pointerup', up);
    surface.addEventListener('pointercancel', up);
    const key = (e: KeyboardEvent, on: boolean): void => {
      if (on && !e.repeat) {
        if (/^[1-4]$/.test(e.key)) {
          this.onSwitch?.(Number(e.key) - 1);
        } else if (e.key === 'q' || e.key === 'Q') {
          this.onCycle?.();
        } else if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
          this.onPause?.();
        }
      }
      if (on) {
        this.keys.add(e.key.toLowerCase());
      } else {
        this.keys.delete(e.key.toLowerCase());
      }
    };
    const kd = (e: KeyboardEvent): void => key(e, true);
    const ku = (e: KeyboardEvent): void => key(e, false);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    const blur = (): void => this.release();
    window.addEventListener('blur', blur);
    this.cleanups.push(
      () => window.removeEventListener('keydown', kd),
      () => window.removeEventListener('keyup', ku),
      () => window.removeEventListener('blur', blur),
    );
  }

  private down(e: PointerEvent): void {
    if (!this.enabled) {
      return;
    }
    const left = e.clientX < window.innerWidth * 0.5;
    if (left && this.stickId === null) {
      this.stickId = e.pointerId;
      this.stickStart = { x: e.clientX, y: e.clientY };
      this.stickEl.style.transform = `translate(${e.clientX - 60}px, ${e.clientY - 60}px)`;
      this.stickEl.classList.add('on');
      this.knobEl.style.transform = 'translate(0px, 0px)';
    } else if (!left && this.lookId === null) {
      this.lookId = e.pointerId;
      this.lookLast = { x: e.clientX, y: e.clientY };
    } else {
      return;
    }
    try {
      this.surface.setPointerCapture(e.pointerId);
    } catch {
      // The pointer has already gone.
    }
  }

  private move(e: PointerEvent): void {
    if (e.pointerId === this.stickId) {
      const dx = e.clientX - this.stickStart.x;
      const dy = e.clientY - this.stickStart.y;
      const l = Math.hypot(dx, dy);
      const max = 50;
      const k = l > max ? max / l : 1;
      this.touchX = (dx * k) / max;
      this.touchY = (dy * k) / max;
      this.knobEl.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    } else if (e.pointerId === this.lookId) {
      this.state.lookX += e.clientX - this.lookLast.x;
      this.state.lookY += e.clientY - this.lookLast.y;
      this.lookLast = { x: e.clientX, y: e.clientY };
    }
  }

  private up(e: PointerEvent): void {
    if (e.pointerId === this.stickId) {
      this.stickId = null;
      this.touchX = 0;
      this.touchY = 0;
      this.stickEl.classList.remove('on');
    } else if (e.pointerId === this.lookId) {
      this.lookId = null;
    }
  }

  /** Reads keys and the controller. Call once a frame. */
  poll(): void {
    let x = this.touchX;
    let y = this.touchY;
    const has = (...names: string[]): boolean => names.some((n) => this.keys.has(n));
    if (has('a', 'arrowleft')) {
      x -= 1;
    }
    if (has('d', 'arrowright')) {
      x += 1;
    }
    if (has('w', 'arrowup')) {
      y -= 1;
    }
    if (has('s', 'arrowdown')) {
      y += 1;
    }
    let keyAction = has('e', ' ', 'enter');
    let keyAbility = has('g', 'shift');
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (pad === null) {
        continue;
      }
      if (Math.abs(pad.axes[0]) > 0.2) {
        x += pad.axes[0];
      }
      if (Math.abs(pad.axes[1]) > 0.2) {
        y += pad.axes[1];
      }
      if (Math.abs(pad.axes[2] ?? 0) > 0.2) {
        this.state.lookX += (pad.axes[2] ?? 0) * 6;
      }
      if (Math.abs(pad.axes[3] ?? 0) > 0.2) {
        this.state.lookY += (pad.axes[3] ?? 0) * 4;
      }
      keyAction = keyAction || pad.buttons[0]?.pressed === true;
      keyAbility = keyAbility || pad.buttons[1]?.pressed === true;
      const pressed = pad.buttons.map((b) => b.pressed);
      if (pressed[5] === true && this.padButtons[5] !== true) {
        this.onCycle?.();
      }
      if (pressed[9] === true && this.padButtons[9] !== true) {
        this.onPause?.();
      }
      this.padButtons = pressed;
    }
    if (this.forced !== null) {
      x = this.forced.x;
      y = this.forced.y;
    }
    const l = Math.hypot(x, y);
    this.state.moveX = l > 1 ? x / l : x;
    this.state.moveY = l > 1 ? y / l : y;
    this.keyAction = keyAction;
    this.keyAbility = keyAbility;
  }

  keyAction = false;
  keyAbility = false;
  /** Development only: a stick position for the autoplay player. */
  private forced: { x: number; y: number } | null = null;

  forceMove(x: number, y: number): void {
    this.forced = { x, y };
  }

  /** Takes what the camera drag has built up since last time. */
  takeLook(): { x: number; y: number } {
    const out = { x: this.state.lookX, y: this.state.lookY };
    this.state.lookX = 0;
    this.state.lookY = 0;
    return out;
  }

  release(): void {
    this.stickId = null;
    this.lookId = null;
    this.touchX = 0;
    this.touchY = 0;
    this.keys.clear();
    this.state.actionHeld = false;
    this.state.abilityHeld = false;
    this.stickEl.classList.remove('on');
  }

  dispose(): void {
    this.cleanups.forEach((fn) => fn());
  }
}
