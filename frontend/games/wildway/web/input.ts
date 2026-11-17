/**
 * Touch, keyboard and controller, all feeding the same small state. Touch: the left of
 * the screen is a floating stick, the right drags the camera, and two fingers pinch to
 * zoom. The mouse wheel, + and -, and the controller's triggers zoom too. Anything held
 * is dropped when a touch is cancelled or the page loses focus.
 */

export interface Input {
  moveX: number;
  moveY: number;
  lookX: number;
  lookY: number;
  /** Camera zoom built up since the last frame, as a factor on its distance: above 1 pulls back. */
  zoom: number;
  actionHeld: boolean;
  abilityHeld: boolean;
}

export class InputController {
  readonly state: Input = { moveX: 0, moveY: 0, lookX: 0, lookY: 0, zoom: 1, actionHeld: false, abilityHeld: false };
  enabled = true;
  /** Called for one-shot keys and controller buttons. */
  onSwitch: ((index: number) => void) | null = null;
  onCycle: (() => void) | null = null;
  onPause: (() => void) | null = null;
  private stickId: number | null = null;
  private stickStart = { x: 0, y: 0 };
  private lookId: number | null = null;
  private lookLast = { x: 0, y: 0 };
  /** When the stick and the camera drag began, and how far each has moved: a second finger soon after, before either moved, is a pinch. */
  private stickAt = 0;
  private lookAt = 0;
  private stickMoved = 0;
  private lookMoved = 0;
  private lookStart = { x: 0, y: 0 };
  /** Two fingers pinching: where each is, and how far apart they were last time. */
  private pinch: { a: number; b: number; pos: Map<number, { x: number; y: number }>; last: number } | null = null;
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
    const wheel = (e: WheelEvent): void => {
      e.preventDefault();
      if (this.enabled) {
        /* Lines or pages are rare (old mice); count them as pixels. */
        const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
        this.state.zoom *= Math.exp(Math.max(-200, Math.min(200, px)) * 0.0015);
      }
    };
    surface.addEventListener('wheel', wheel, { passive: false });
    this.cleanups.push(() => surface.removeEventListener('wheel', wheel));
    const key = (e: KeyboardEvent, on: boolean): void => {
      if (on && !e.repeat) {
        if (/^[1-4]$/.test(e.key)) {
          this.onSwitch?.(Number(e.key) - 1);
        } else if (e.key === 'q' || e.key === 'Q') {
          this.onCycle?.();
        } else if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
          this.onPause?.();
        } else if (this.enabled && (e.key === '+' || e.key === '=')) {
          this.state.zoom *= 0.85;
        } else if (this.enabled && (e.key === '-' || e.key === '_')) {
          this.state.zoom *= 1.18;
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
    if (!this.enabled || this.pinch !== null) {
      return;
    }
    const left = e.clientX < window.innerWidth * 0.5;
    const now = performance.now();
    /* A second finger pinches with the first when the first is the camera finger and this one is on the right too,
       or when the first went down a moment ago and has not moved yet (a pinch that straddles the middle). */
    const fresh = (at: number, moved: number): boolean => now - at < 250 && moved < 14;
    const partner =
      this.lookId !== null && (!left || fresh(this.lookAt, this.lookMoved))
        ? { id: this.lookId, x: this.lookLast.x, y: this.lookLast.y }
        : this.stickId !== null && fresh(this.stickAt, this.stickMoved)
          ? { id: this.stickId, x: this.stickStart.x, y: this.stickStart.y }
          : null;
    if (partner !== null) {
      if (partner.id === this.stickId) {
        this.stickId = null;
        this.touchX = 0;
        this.touchY = 0;
        this.stickEl.classList.remove('on');
      } else {
        this.lookId = null;
      }
      const pos = new Map<number, { x: number; y: number }>([
        [partner.id, { x: partner.x, y: partner.y }],
        [e.pointerId, { x: e.clientX, y: e.clientY }],
      ]);
      this.pinch = { a: partner.id, b: e.pointerId, pos, last: Math.max(1, Math.hypot(e.clientX - partner.x, e.clientY - partner.y)) };
    } else if (left && this.stickId === null) {
      this.stickId = e.pointerId;
      this.stickStart = { x: e.clientX, y: e.clientY };
      this.stickAt = now;
      this.stickMoved = 0;
      this.stickEl.style.transform = `translate(${e.clientX - 60}px, ${e.clientY - 60}px)`;
      this.stickEl.classList.add('on');
      this.knobEl.style.transform = 'translate(0px, 0px)';
    } else if (!left && this.lookId === null) {
      this.lookId = e.pointerId;
      this.lookLast = { x: e.clientX, y: e.clientY };
      this.lookStart = { x: e.clientX, y: e.clientY };
      this.lookAt = now;
      this.lookMoved = 0;
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
    const pinch = this.pinch;
    if (pinch !== null && pinch.pos.has(e.pointerId)) {
      pinch.pos.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const a = pinch.pos.get(pinch.a);
      const b = pinch.pos.get(pinch.b);
      if (a !== undefined && b !== undefined) {
        const d = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
        /* Fingers apart brings the camera closer; together pulls it back. */
        this.state.zoom *= pinch.last / d;
        pinch.last = d;
      }
      return;
    }
    if (e.pointerId === this.stickId) {
      let dx = e.clientX - this.stickStart.x;
      let dy = e.clientY - this.stickStart.y;
      let l = Math.hypot(dx, dy);
      this.stickMoved = Math.max(this.stickMoved, l);
      const max = 50;
      if (l > max) {
        /* The base follows a thumb that runs past the rim, so turning back never needs a long swipe. */
        const over = l - max;
        this.stickStart.x += (dx / l) * over;
        this.stickStart.y += (dy / l) * over;
        this.stickEl.style.transform = `translate(${this.stickStart.x - 60}px, ${this.stickStart.y - 60}px)`;
        dx = e.clientX - this.stickStart.x;
        dy = e.clientY - this.stickStart.y;
        l = max;
      }
      /* A small dead zone for a resting thumb, then a quick ramp: full speed a little before the rim. */
      const push = l / max;
      const amount = Math.min(1, Math.max(0, (push - 0.1) / 0.75));
      const k = l > 0.001 ? amount / l : 0;
      this.touchX = dx * k;
      this.touchY = dy * k;
      this.knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
    } else if (e.pointerId === this.lookId) {
      this.lookMoved = Math.max(this.lookMoved, Math.hypot(e.clientX - this.lookStart.x, e.clientY - this.lookStart.y));
      this.state.lookX += e.clientX - this.lookLast.x;
      this.state.lookY += e.clientY - this.lookLast.y;
      this.lookLast = { x: e.clientX, y: e.clientY };
    }
  }

  private up(e: PointerEvent): void {
    if (this.pinch !== null && this.pinch.pos.has(e.pointerId)) {
      /* Lifting either finger ends the pinch; the other does nothing until it lifts too. */
      this.pinch = null;
      return;
    }
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
      /* Triggers: left zooms in, right pulls back. */
      const zoomIn = pad.buttons[6]?.value ?? 0;
      const zoomOut = pad.buttons[7]?.value ?? 0;
      if (zoomIn > 0.1 || zoomOut > 0.1) {
        this.state.zoom *= Math.exp((zoomOut - zoomIn) * 0.03);
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

  /** Takes the zoom built up since last time (1 when none). */
  takeZoom(): number {
    const z = this.state.zoom;
    this.state.zoom = 1;
    return z;
  }

  release(): void {
    this.stickId = null;
    this.lookId = null;
    this.pinch = null;
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
