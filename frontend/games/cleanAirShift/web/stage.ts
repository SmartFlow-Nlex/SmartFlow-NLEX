import { IDLE_KG_PER_MIN } from '../core/factors';
import { boothLook, canRedirect, IDLING_SPEED, inWrongLane, isEngineOff, laneWait, LENGTH, REPAIR_S, VISIBLE_S, type Lane, type LaneType, type Sim, type Vehicle } from '../core/sim';
import { leaf, paintBackground, paintCanopy, puff, type PlazaGeometry } from './plazaArt';

/**
 * Draws the plaza on a canvas, seen from above, with traffic driving up the screen
 * into the booths. It only reads the shift and adds what is purely for show: smoke,
 * smog, sparkles, gates and smoothing. The vehicle art is Rush Hour's.
 */

declare global {
  interface Window {
    __CLEAN_AIR_ART__?: Record<string, string>;
  }
}

export const artUrl = (name: string): string => window.__CLEAN_AIR_ART__?.[name] ?? '';

export type Pictures = Map<string, HTMLImageElement>;

export function loadPictures(): Promise<Pictures> {
  const pictures: Pictures = new Map();
  const names = Object.keys(window.__CLEAN_AIR_ART__ ?? {});
  return Promise.all(
    names.map(
      (name) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            pictures.set(name, img);
            resolve();
          };
          img.onerror = () => resolve();
          img.src = artUrl(name);
        }),
    ),
  ).then(() => pictures);
}

/* Older WebViews lack roundRect. */
if (typeof CanvasRenderingContext2D !== 'undefined' && CanvasRenderingContext2D.prototype.roundRect === undefined) {
  CanvasRenderingContext2D.prototype.roundRect = function roundRect(x: number, y: number, w: number, height: number, radii?: number | DOMPointInit | (number | DOMPointInit)[]) {
    const list = Array.isArray(radii) ? (radii as number[]) : [radii as number];
    const at = (i: number): number => Math.min(Number(list[i % list.length] ?? 0), w / 2, height / 2);
    this.moveTo(x + at(0), y);
    this.arcTo(x + w, y, x + w, y + height, at(1));
    this.arcTo(x + w, y + height, x, y + height, at(2));
    this.arcTo(x, y + height, x, y, at(3));
    this.arcTo(x, y, x + w, y, at(0));
    this.closePath();
  };
}

const CAR_SHAPES = ['sedan', 'hatch', 'suv'];

const spriteName = (v: Vehicle): string => {
  const paint = v.paint + 1;
  return v.cls === 0 ? `${CAR_SHAPES[v.shape]}-${paint}` : `${v.cls === 1 ? 'bus' : 'truck'}-${paint}`;
};

const WIDTH_BY_CLASS = [1, 0.92, 1.04];

export const LOOK_COLOR: Record<string, string> = { open: '#35d46f', busy: '#ffc32d', closed: '#e23b3b', fault: '#ff8a1f' };

/** A wait this long and a lane starts to look like trouble. */
export const CONGESTED_MINUTES = 11;

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
const ease = (rate: number, dt: number): number => 1 - Math.exp(-rate * dt);

const WRENCH = 'M20.5 6.2a5 5 0 0 1-6.6 5.300l-7 7a2.100 2.100 0 0 1-3-3l7-7a5 5 0 0 1 5.300-6.600l-3 3 .8 2.900 2.900.8z';

interface View {
  x: number;
  y: number;
  yaw: number;
  puff: number;
  seen: number;
}

interface Puff {
  x: number;
  y: number;
  r: number;
  grow: number;
  life: number;
  max: number;
  dx: number;
  dy: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  size: number;
}

/** A swipe in progress. */
export interface SwipeView {
  from: number;
  to: number;
  y: number;
  ok: boolean;
}

/** What the page wants shown on top of the shift this frame. */
export interface StageUi {
  /** How smoggy the air looks: 0 clear, 1 at its worst. */
  haze: number;
  selected: number | null;
  swipe: SwipeView | null;
  /** A vehicle the tutorial is pointing at, and where it should go. */
  ring: number | null;
  hintLane: number | null;
  /** A lane the tutorial is pointing at. */
  ringLane: number | null;
  /** Nothing moves while the game is paused. */
  still: boolean;
}

const emptyUi = (): StageUi => ({ haze: 0, selected: null, swipe: null, ring: null, hintLane: null, ringLane: null, still: false });

export class Stage {
  w = 0;
  h = 0;
  private dpr = 1;
  private readonly ctx: CanvasRenderingContext2D;
  private laneCount = 4;
  private plaza = '';
  roadLeft = 0;
  laneW = 0;
  private carW = 26;
  private unit = 52;
  boothY = 74;
  private canopyTop = 8;
  private canopyH = 36;
  private background: HTMLCanvasElement | null = null;
  private canopy: HTMLCanvasElement | null = null;
  private puffImage: HTMLCanvasElement | null = null;
  private smogImage: HTMLCanvasElement | null = null;
  private shadowImage: HTMLCanvasElement | null = null;
  private leafImage: HTMLCanvasElement | null = null;
  private badge: HTMLCanvasElement | null = null;
  private readonly baked = new Map<string, HTMLCanvasElement>();
  private readonly views = new Map<number, View>();
  private gates: number[] = [];
  private puffs: Puff[] = [];
  private sparks: Spark[] = [];
  private floaters: Floater[] = [];
  private time = 0;
  private frameId = 0;
  private towId = -1;
  private towTotal = 1;
  private naviePos: { x: number; y: number } | null = null;
  private navieLeaving = false;
  private readonly wrench = typeof Path2D !== 'undefined' ? new Path2D(WRENCH) : null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly pictures: Pictures,
    private readonly reduceMotion: boolean,
  ) {
    this.ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
  }

  /** Measures the space the canvas fills. Call on start and whenever the page's size changes. */
  layout(laneCount: number, plaza: string, types: readonly LaneType[] = []): void {
    const box = this.canvas.parentElement as HTMLElement;
    const w = Math.max(1, box.clientWidth);
    const h = Math.max(1, box.clientHeight);
    this.laneCount = laneCount;
    this.plaza = plaza;
    this.w = w;
    this.h = h;
    this.dpr = clamp(window.devicePixelRatio || 1, 1, 2.5);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    const margin = clamp(w * 0.055, 12, 44);
    this.roadLeft = margin;
    this.laneW = (w - margin * 2) / laneCount;
    this.canopyTop = 8;
    this.canopyH = 36;
    this.boothY = this.canopyTop + this.canopyH + 32;
    /* Every phone shows the same stretch of road, so the game is the same game on all of them. */
    this.carW = Math.min(this.laneW * 0.46, 30, (h - this.boothY) / VISIBLE_S / 2);
    this.unit = this.carW * 2;
    this.baked.clear();
    this.gates = Array.from({ length: laneCount }, (_, i) => this.gates[i] ?? 1);
    const geometry: PlazaGeometry = {
      w,
      h,
      dpr: this.dpr,
      roadLeft: this.roadLeft,
      laneW: this.laneW,
      laneCount,
      boothY: this.boothY,
      canopyTop: this.canopyTop,
      canopyH: this.canopyH,
      plaza,
      types: Array.from({ length: laneCount }, (_, i) => types[i] ?? 'rfid'),
    };
    this.background = paintBackground(geometry);
    this.canopy = paintCanopy(geometry);
    this.puffImage = puff('rgba(236, 236, 240, 0.95)', 'rgba(214, 214, 220, 0.6)', 'rgba(200, 200, 208, 0)');
    this.smogImage = puff('rgba(120, 110, 96, 0.95)', 'rgba(120, 110, 96, 0.55)', 'rgba(120, 110, 96, 0)');
    this.shadowImage = puff('rgba(10, 30, 60, 0.9)', 'rgba(10, 30, 60, 0.5)', 'rgba(10, 30, 60, 0)');
    this.leafImage = leaf();
    this.badge = this.makeBadge();
  }

  private makeBadge(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = 60;
    c.height = 60;
    const ctx = c.getContext('2d') as CanvasRenderingContext2D;
    ctx.fillStyle = '#10284c';
    ctx.beginPath();
    ctx.arc(30, 30, 29, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffc32d';
    ctx.beginPath();
    ctx.arc(30, 30, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#10284c';
    ctx.font = '900 36px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('₱', 30, 32);
    return c;
  }

  laneCenter(i: number): number {
    return this.roadLeft + this.laneW * (i + 0.5);
  }

  laneAt(x: number): number {
    return clamp(Math.floor((x - this.roadLeft) / this.laneW), 0, this.laneCount - 1);
  }

  private yOf(s: number): number {
    return this.boothY + s * this.unit;
  }

  /** The place along the road under a finger. */
  sAt(y: number): number {
    return (y - this.boothY) / this.unit;
  }

  /* ---- Asking what is where ---- */

  /** The approaching vehicle under a finger, with room for a thumb. */
  approachingAt(sim: Sim, x: number, y: number): Vehicle | null {
    let best: Vehicle | null = null;
    let bestDistance = Infinity;
    for (const lane of sim.lanes) {
      for (const v of lane.queue) {
        const view = this.views.get(v.id);
        if (view === undefined || !canRedirect(v)) {
          continue;
        }
        const len = LENGTH[v.cls] * this.unit;
        const cx = view.x;
        const cy = view.y + len / 2;
        if (Math.abs(x - cx) <= Math.max(this.laneW / 2, 22) && Math.abs(y - cy) <= Math.max(len / 2 + 6, 24)) {
          const distance = Math.hypot(x - cx, y - cy);
          if (distance < bestDistance) {
            best = v;
            bestDistance = distance;
          }
        }
      }
    }
    return best;
  }

  /** A vehicle waiting in a line under a finger. */
  queuedAt(sim: Sim, x: number, y: number): Vehicle | null {
    const lane = sim.lanes[this.laneAt(x)];
    for (const v of lane.queue) {
      const view = this.views.get(v.id);
      if (view !== undefined && !canRedirect(v) && y >= view.y - 4 && y <= view.y + LENGTH[v.cls] * this.unit + 4) {
        return v;
      }
    }
    return null;
  }

  /** The stuck vehicle under a finger. */
  stuckAt(sim: Sim, x: number, y: number): Vehicle | null {
    for (const lane of sim.lanes) {
      const v = lane.queue[0];
      if (v !== undefined && v.block !== null) {
        const view = this.views.get(v.id);
        if (view !== undefined && Math.hypot(x - view.x, y - (view.y + (LENGTH[v.cls] * this.unit) / 2)) <= 44) {
          return v;
        }
      }
    }
    return null;
  }

  private faultPoint(lane: Lane): { x: number; y: number } {
    return { x: this.laneCenter(lane.index), y: this.boothY + this.unit * 0.55 };
  }

  /** The broken reader under a finger. */
  faultAt(sim: Sim, x: number, y: number): Lane | null {
    for (const lane of sim.lanes) {
      if (lane.fault === 'reader') {
        const p = this.faultPoint(lane);
        if (Math.hypot(x - p.x, y - p.y) <= 44) {
          return lane;
        }
      }
    }
    return null;
  }

  /** The booth under a finger: the roof, the lamp and the stop line of a lane. */
  boothAt(sim: Sim, x: number, y: number): Lane | null {
    if (y > this.boothY + 10 || x < this.roadLeft - 8 || x > this.w - this.roadLeft + 8) {
      return null;
    }
    return sim.lanes[this.laneAt(x)];
  }

  centerOf(v: Vehicle): { x: number; y: number } {
    const view = this.views.get(v.id);
    return view === undefined ? { x: this.laneCenter(v.lane), y: this.yOf(v.s) } : { x: view.x, y: view.y + (LENGTH[v.cls] * this.unit) / 2 };
  }

  /* ---- Effects the page asks for ---- */

  sparkle(x: number, y: number, color = '#ffc32d'): void {
    if (this.reduceMotion) {
      return;
    }
    for (let i = 0; i < 12; i += 1) {
      const angle = (i / 12) * Math.PI * 2;
      const speed = 50 + (i % 3) * 30;
      this.sparks.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0.55, color });
    }
  }

  float(x: number, y: number, text: string, color = '#ffffff', size = 15): void {
    this.floaters.push({ x, y, text, color, life: 1.4, size });
  }

  /** The tow has finished: Navie's car drives off. */
  navieDone(): void {
    this.navieLeaving = true;
  }

  /* ---- Drawing ---- */

  draw(sim: Sim | null, dt: number, ui: StageUi = emptyUi()): void {
    const ctx = this.ctx;
    const dpr = this.dpr;
    this.time += dt;
    this.frameId += 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.background !== null) {
      ctx.drawImage(this.background, 0, 0);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (sim !== null) {
      this.drawLanes(sim, ui);
      this.syncViews(sim, dt, ui);
      this.drawVehicles(sim);
      this.drawGates(sim, dt);
    }
    if (this.canopy !== null) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(this.canopy, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    if (sim !== null) {
      this.drawLamps(sim);
    }
    this.drawPuffs(dt, ui.still);
    if (sim !== null) {
      this.drawLeaves(sim);
      this.drawTow(sim, dt, ui.still);
      this.drawFaults(sim);
      this.drawBlocks(sim);
      this.drawOverflow(sim);
    }
    this.drawAir(ui.haze, sim !== null && sim.enginesTimer > 0);
    this.drawSparks(dt, ui.still);
    this.drawFloaters(dt, ui.still);
    if (sim !== null) {
      this.drawRings(sim, ui);
      this.drawSwipe(ui);
    }
  }

  private fillLane(index: number, top: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(this.roadLeft + this.laneW * index + 1, top, this.laneW - 2, this.h - top);
  }

  private drawLanes(sim: Sim, ui: StageUi): void {
    const swipe = ui.swipe;
    for (const lane of sim.lanes) {
      const top = this.boothY - 8;
      if (lane.status === 'closed' || lane.fault === 'closure') {
        this.fillLane(lane.index, top, 'rgba(16, 24, 44, 0.42)');
        this.drawCones(this.laneCenter(lane.index), this.boothY + 12);
      } else if (lane.status === 'closing') {
        this.fillLane(lane.index, top, 'rgba(16, 24, 44, 0.2)');
      } else if (laneWait(sim, lane) >= CONGESTED_MINUTES) {
        const pulse = this.reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin(this.time * 5);
        this.fillLane(lane.index, top, `rgba(226, 59, 59, ${(0.08 + pulse * 0.13).toFixed(3)})`);
      }
      if (lane.closureIn > 0) {
        const pulse = this.reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin(this.time * 8);
        this.fillLane(lane.index, top, `rgba(255, 138, 31, ${(0.12 + pulse * 0.2).toFixed(3)})`);
      }
      if (swipe !== null) {
        if (swipe.to === lane.index && swipe.to !== swipe.from) {
          this.fillLane(lane.index, top, swipe.ok ? 'rgba(70, 230, 140, 0.26)' : 'rgba(226, 59, 59, 0.28)');
        } else if (swipe.from === lane.index) {
          this.fillLane(lane.index, top, 'rgba(255, 255, 255, 0.07)');
        }
      }
      if (ui.hintLane === lane.index) {
        const pulse = this.reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin(this.time * 5);
        this.fillLane(lane.index, top, `rgba(70, 230, 140, ${(0.12 + pulse * 0.16).toFixed(3)})`);
      }
    }
  }

  private drawCones(cx: number, y: number): void {
    const ctx = this.ctx;
    for (const dx of [-this.laneW * 0.26, 0, this.laneW * 0.26]) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.fillRect(cx + dx - 7, y + 6, 14, 2);
      ctx.fillStyle = '#f26b1d';
      ctx.beginPath();
      ctx.moveTo(cx + dx, y - 8);
      ctx.lineTo(cx + dx + 6, y + 6);
      ctx.lineTo(cx + dx - 6, y + 6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx + dx - 3, y - 2, 6, 2.6);
    }
  }

  private syncViews(sim: Sim, dt: number, ui: StageUi): void {
    const rate = this.reduceMotion ? 60 : 18;
    const visit = (v: Vehicle): void => {
      const tx = this.laneCenter(v.x);
      const ty = this.yOf(v.s);
      let view = this.views.get(v.id);
      if (view === undefined) {
        view = { x: tx, y: ty, yaw: 0, puff: (v.id % 7) * 0.1, seen: this.frameId };
        this.views.set(v.id, view);
      }
      const k = ease(rate, dt);
      const dx = (tx - view.x) * k;
      view.x += dx;
      view.y += (ty - view.y) * k;
      /* Vehicles turn into a lane change: a little yaw from how fast they slide across. */
      const wantedYaw = this.reduceMotion || dt <= 0 ? 0 : clamp((dx / dt) * 0.0075, -0.5, 0.5);
      view.yaw += (wantedYaw - view.yaw) * ease(12, dt);
      view.seen = this.frameId;
      if (v.state !== 'leaving' && v.state !== 'towed' && !ui.still) {
        this.emitSmoke(sim, v, view, dt);
      }
    };
    for (const lane of sim.lanes) {
      lane.queue.forEach(visit);
    }
    sim.leaving.forEach(visit);
    for (const [id, view] of this.views) {
      if (view.seen !== this.frameId) {
        this.views.delete(id);
      }
    }
  }

  private emitSmoke(sim: Sim, v: Vehicle, view: View, dt: number): void {
    const idling = v.state === 'booth' || v.speed < IDLING_SPEED;
    if (!idling || v.block === 'breakdown' || isEngineOff(sim, v) || view.y > this.h + 10) {
      return;
    }
    const strength = IDLE_KG_PER_MIN[v.cls] / IDLE_KG_PER_MIN[0];
    const every = (this.reduceMotion ? 1.8 : 0.5) / Math.sqrt(strength);
    view.puff -= dt;
    if (view.puff <= 0 && this.puffs.length < 220) {
      view.puff = every;
      const r = this.carW * (0.34 + 0.1 * strength);
      const len = LENGTH[v.cls] * this.unit;
      this.puffs.push({
        x: view.x + (v.id % 2 === 0 ? -1 : 1) * this.carW * 0.22,
        y: view.y + len - 2,
        r,
        grow: r * 1.5,
        life: 0,
        max: 1.7,
        dx: ((v.id * 37) % 11) - 5,
        dy: 8 + strength * 2,
      });
    }
  }

  private drawVehicles(sim: Sim): void {
    for (const v of sim.leaving) {
      this.drawVehicle(v);
    }
    for (const lane of sim.lanes) {
      for (let k = lane.queue.length - 1; k >= 0; k -= 1) {
        this.drawVehicle(lane.queue[k]);
      }
    }
    /* What is steering, and what still can be: arrows and badges on top. */
    for (const lane of sim.lanes) {
      for (const v of lane.queue) {
        this.drawMarks(sim, v);
      }
    }
  }

  private sprite(v: Vehicle): HTMLCanvasElement | null {
    const name = spriteName(v);
    const cached = this.baked.get(name);
    if (cached !== undefined) {
      return cached;
    }
    const picture = this.pictures.get(name);
    if (picture === undefined) {
      return null;
    }
    const w = this.carW * WIDTH_BY_CLASS[v.cls];
    const len = LENGTH[v.cls] * this.unit;
    const pad = 6;
    const c = document.createElement('canvas');
    c.width = Math.ceil((w + pad * 2) * this.dpr);
    c.height = Math.ceil((len + pad * 2) * this.dpr);
    const ctx = c.getContext('2d') as CanvasRenderingContext2D;
    ctx.scale(this.dpr, this.dpr);
    ctx.shadowColor = 'rgba(8, 14, 30, 0.45)';
    ctx.shadowBlur = 3.5 * this.dpr;
    ctx.shadowOffsetY = 2 * this.dpr;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(picture, pad, pad, w, len);
    this.baked.set(name, c);
    return c;
  }

  private drawVehicle(v: Vehicle): void {
    const view = this.views.get(v.id);
    if (view === undefined || view.y > this.h + 4) {
      return;
    }
    const image = this.sprite(v);
    if (image === null) {
      return;
    }
    const ctx = this.ctx;
    const len = LENGTH[v.cls] * this.unit;
    const iw = image.width / this.dpr;
    const ih = image.height / this.dpr;
    if (Math.abs(view.yaw) > 0.01) {
      ctx.save();
      ctx.translate(view.x, view.y + len / 2);
      ctx.rotate(view.yaw);
      ctx.drawImage(image, -iw / 2, -len / 2 - 6, iw, ih);
      ctx.restore();
    } else {
      ctx.drawImage(image, view.x - iw / 2, view.y - 6, iw, ih);
    }
  }

  private drawMarks(sim: Sim, v: Vehicle): void {
    const view = this.views.get(v.id);
    if (view === undefined || view.y > this.h) {
      return;
    }
    const ctx = this.ctx;
    const len = LENGTH[v.cls] * this.unit;
    const cy = view.y + len / 2;
    if (v.needsReload && this.badge !== null) {
      const wrong = canRedirect(v) && inWrongLane(sim, v);
      const grow = wrong && !this.reduceMotion ? Math.sin(this.time * 7) * 2 : 0;
      const size = Math.max(19, this.carW * 0.82) + grow;
      if (wrong) {
        ctx.strokeStyle = '#ff5a4f';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(view.x, cy, size * 0.68, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.drawImage(this.badge, view.x - size / 2, cy - size / 2, size, size);
    }
    /* A subtle arrow on whatever is changing lanes. */
    if (v.target !== null && v.target !== v.lane && v.state === 'approach') {
      const dir = Math.sign(v.target - v.lane);
      const bob = this.reduceMotion ? 0 : Math.sin(this.time * 10) * 2;
      const ax = view.x + dir * (this.carW * 0.75 + bob);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(ax - dir * 5, cy - 6);
      ctx.lineTo(ax, cy);
      ctx.lineTo(ax - dir * 5, cy + 6);
      ctx.stroke();
    }
  }

  private drawGates(sim: Sim, dt: number): void {
    const ctx = this.ctx;
    for (const lane of sim.lanes) {
      const wantClosed = lane.queue[0]?.state === 'booth' || lane.status === 'closed' || lane.fault !== null;
      const k = ease(9, dt);
      this.gates[lane.index] += ((wantClosed ? 1 : 0) - this.gates[lane.index]) * k;
      const left = this.roadLeft + this.laneW * lane.index + Math.min(7, this.laneW * 0.11);
      const y = this.boothY - 8;
      const length = this.laneW * 0.72;
      const angle = (1 - this.gates[lane.index]) * -1.25;
      ctx.save();
      ctx.translate(left, y);
      ctx.rotate(angle);
      ctx.lineCap = 'round';
      ctx.lineWidth = 3.4;
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(length, 0);
      ctx.stroke();
      ctx.strokeStyle = '#e23b3b';
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(length, 0);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  private drawLamps(sim: Sim): void {
    const ctx = this.ctx;
    const y = this.canopyTop + this.canopyH - 10;
    for (const lane of sim.lanes) {
      const x = this.laneCenter(lane.index);
      const look = boothLook(lane);
      const blink = Math.floor(this.time * 5) % 2 === 0;
      let color = LOOK_COLOR[look];
      if ((lane.status === 'opening' || lane.status === 'closing') && !blink && !this.reduceMotion) {
        color = '#8a6d14';
      }
      if (look === 'fault' && !blink && !this.reduceMotion) {
        color = '#b85c0a';
      }
      ctx.fillStyle = 'rgba(8, 20, 50, 0.4)';
      ctx.beginPath();
      ctx.arc(x, y + 1, 7.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.stroke();
      /* A mark as well as a colour, for anyone who cannot tell them apart. */
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      if (look === 'closed') {
        ctx.moveTo(x - 2.4, y - 2.4);
        ctx.lineTo(x + 2.4, y + 2.4);
        ctx.moveTo(x + 2.4, y - 2.4);
        ctx.lineTo(x - 2.4, y + 2.4);
      } else if (look === 'fault') {
        ctx.moveTo(x, y - 3);
        ctx.lineTo(x, y + 0.6);
        ctx.moveTo(x, y + 3);
        ctx.lineTo(x, y + 3);
      } else if (look === 'open') {
        ctx.moveTo(x - 2.6, y + 0.2);
        ctx.lineTo(x - 0.6, y + 2.2);
        ctx.lineTo(x + 2.8, y - 2);
      }
      ctx.stroke();
    }
  }

  private drawPuffs(dt: number, still: boolean): void {
    const ctx = this.ctx;
    const image = this.puffImage;
    if (image === null) {
      return;
    }
    for (let i = this.puffs.length - 1; i >= 0; i -= 1) {
      const p = this.puffs[i];
      if (!still) {
        p.life += dt;
        p.x += p.dx * dt;
        p.y += p.dy * dt;
      }
      if (p.life >= p.max) {
        this.puffs.splice(i, 1);
        continue;
      }
      const k = p.life / p.max;
      const r = p.r + p.grow * k;
      ctx.globalAlpha = 0.62 * (1 - k) * Math.min(1, p.life * 6);
      ctx.drawImage(image, p.x - r, p.y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
  }

  private drawLeaves(sim: Sim): void {
    if (sim.enginesTimer <= 0 || this.leafImage === null) {
      return;
    }
    const ctx = this.ctx;
    for (const lane of sim.lanes) {
      for (const v of lane.queue) {
        const view = this.views.get(v.id);
        if (view !== undefined && view.y < this.h && isEngineOff(sim, v)) {
          const size = Math.max(16, this.carW * 0.72);
          ctx.drawImage(this.leafImage, view.x - size / 2, view.y + (LENGTH[v.cls] * this.unit) / 2 - size / 2, size, size);
        }
      }
    }
  }

  private bubble(x: number, y: number, color: string, pulse: boolean): void {
    const ctx = this.ctx;
    const k = this.reduceMotion || !pulse ? 0.4 : (this.time * 1.6) % 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 1 - k;
    ctx.beginPath();
    ctx.arc(x, y, 18 + k * 17, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  }

  private drawFaults(sim: Sim): void {
    const ctx = this.ctx;
    for (const lane of sim.lanes) {
      if (lane.fault === 'reader') {
        const p = this.faultPoint(lane);
        this.bubble(p.x, p.y, '#ff8a1f', !lane.repairing);
        if (this.wrench !== null) {
          ctx.save();
          ctx.translate(p.x - 10, p.y - 10);
          ctx.scale(20 / 24, 20 / 24);
          ctx.fillStyle = '#ffffff';
          ctx.fill(this.wrench);
          ctx.restore();
        }
        if (lane.repairing) {
          ctx.strokeStyle = '#35d46f';
          ctx.lineWidth = 4;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.arc(p.x, p.y, 21, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - clamp(lane.faultLeft / REPAIR_S, 0, 1)));
          ctx.stroke();
        }
      } else if (lane.fault === 'closure' || lane.closureIn > 0) {
        const p = this.faultPoint(lane);
        const left = Math.ceil(lane.fault === 'closure' ? lane.faultLeft : lane.closureIn);
        ctx.fillStyle = lane.fault === 'closure' ? '#ff8a1f' : 'rgba(255, 138, 31, 0.92)';
        ctx.beginPath();
        ctx.roundRect(p.x - 21, p.y - 13, 42, 26, 9);
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 14px "Nunito Black", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${left}m`, p.x, p.y + 1);
      }
    }
  }

  private drawBlocks(sim: Sim): void {
    const ctx = this.ctx;
    for (const lane of sim.lanes) {
      const v = lane.queue[0];
      if (v === undefined || v.block === null) {
        continue;
      }
      const c = this.centerOf(v);
      const towing = sim.tow !== null && sim.tow.vehicleId === v.id;
      this.bubble(c.x, c.y, v.block === 'tag' ? '#ffc32d' : '#e23b3b', !towing);
      ctx.fillStyle = v.block === 'tag' ? '#10284c' : '#ffffff';
      ctx.font = '900 21px "Nunito Black", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(v.block === 'tag' ? '?' : '!', c.x, c.y + 1);
    }
  }

  private drawTow(sim: Sim, dt: number, still: boolean): void {
    const ctx = this.ctx;
    const picture = this.pictures.get('navie');
    if (picture === undefined) {
      return;
    }
    const w = Math.max(56, this.carW * 2.6);
    const height = w / 2;
    if (sim.tow !== null) {
      if (this.towId !== sim.tow.vehicleId) {
        this.towId = sim.tow.vehicleId;
        this.towTotal = Math.max(sim.tow.left, 0.01);
      }
      const done = 1 - sim.tow.left / this.towTotal;
      const arrive = 1 - Math.pow(1 - clamp(done / 0.7, 0, 1), 2);
      const parked = Math.min(this.laneCenter(sim.tow.lane) + this.laneW * 0.75, this.w - w / 2 - 2);
      this.naviePos = { x: this.w + w + (parked - this.w - w) * arrive, y: this.boothY + this.unit * 0.7 };
      this.navieLeaving = false;
    } else {
      this.towId = -1;
      if (this.naviePos !== null && this.navieLeaving && !still) {
        this.naviePos.x += 340 * dt;
      } else if (this.naviePos !== null && !this.navieLeaving) {
        this.naviePos = null;
      }
      if (this.naviePos !== null && this.naviePos.x > this.w + w) {
        this.naviePos = null;
      }
    }
    if (this.naviePos !== null) {
      ctx.drawImage(picture, this.naviePos.x - w / 2, this.naviePos.y - height / 2, w, height);
    }
  }

  /** How many are waiting below the bottom of the screen, per lane. */
  private drawOverflow(sim: Sim): void {
    const ctx = this.ctx;
    for (const lane of sim.lanes) {
      let hidden = 0;
      for (const v of lane.queue) {
        const view = this.views.get(v.id);
        if (view !== undefined && view.y > this.h - 14 && !canRedirect(v)) {
          hidden += 1;
        }
      }
      if (hidden > 0) {
        const x = this.laneCenter(lane.index);
        const y = this.h - 13;
        const text = `+${hidden}`;
        ctx.font = '900 13px "Nunito Black", system-ui, sans-serif';
        const w = Math.max(26, ctx.measureText(text).width + 12);
        ctx.fillStyle = '#e23b3b';
        ctx.beginPath();
        ctx.roundRect(x - w / 2, y - 10, w, 20, 10);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x, y + 1);
      }
    }
  }

  /** Passing cloud shadows, birds in clean air, and smog that never hides the game. */
  private drawAir(haze: number, enginesOff: boolean): void {
    const ctx = this.ctx;
    if (!this.reduceMotion && this.shadowImage !== null) {
      ctx.globalAlpha = 0.09;
      for (let i = 0; i < 2; i += 1) {
        const span = this.w + 420;
        const x = ((i * 310 + this.time * (7 + i * 3)) % span) - 210;
        const y = this.h * (0.3 + i * 0.38);
        ctx.drawImage(this.shadowImage, x - 170, y - 110, 340, 220);
      }
      ctx.globalAlpha = 1;
    }
    if (haze < 0.14 && !this.reduceMotion) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = 1.8;
      ctx.lineCap = 'round';
      const span = this.w + 160;
      const lead = (this.time * 26) % span;
      for (let i = 0; i < 3; i += 1) {
        const bx = lead - 80 - i * 24;
        const by = this.h * 0.2 + i * 15 + Math.sin(this.time * 2 + i) * 3;
        const flap = Math.sin(this.time * 9 + i) * 2.4;
        ctx.beginPath();
        ctx.moveTo(bx - 6, by - flap);
        ctx.quadraticCurveTo(bx - 2, by - 3, bx, by);
        ctx.quadraticCurveTo(bx + 2, by - 3, bx + 6, by - flap);
        ctx.stroke();
      }
    }
    const k = clamp(haze, 0, 1);
    if (k > 0.02) {
      ctx.fillStyle = `rgba(120, 106, 86, ${(k * k * 0.3 + k * 0.08).toFixed(3)})`;
      ctx.fillRect(0, 0, this.w, this.h);
      if (k > 0.3 && this.smogImage !== null) {
        ctx.globalAlpha = (k - 0.3) * 0.5;
        for (let i = 0; i < 5; i += 1) {
          const drift = this.reduceMotion ? 0 : this.time * (6 + i * 2);
          const x = ((i * 137 + drift) % (this.w + 240)) - 120;
          const y = this.h * (0.12 + i * 0.19);
          const r = 100 + i * 12;
          ctx.drawImage(this.smogImage, x - r, y - r, r * 2, r * 2);
        }
        ctx.globalAlpha = 1;
      }
    }
    if (enginesOff) {
      ctx.fillStyle = 'rgba(70, 210, 120, 0.09)';
      ctx.fillRect(0, 0, this.w, this.h);
    }
  }

  private drawSparks(dt: number, still: boolean): void {
    const ctx = this.ctx;
    for (let i = this.sparks.length - 1; i >= 0; i -= 1) {
      const s = this.sparks[i];
      if (!still) {
        s.life -= dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
      }
      if (s.life <= 0) {
        this.sparks.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = Math.min(1, s.life * 3);
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawFloaters(dt: number, still: boolean): void {
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = this.floaters.length - 1; i >= 0; i -= 1) {
      const f = this.floaters[i];
      if (!still) {
        f.life -= dt;
        f.y -= 18 * dt;
      }
      if (f.life <= 0) {
        this.floaters.splice(i, 1);
        continue;
      }
      ctx.font = `900 ${f.size}px "Nunito Black", system-ui, sans-serif`;
      ctx.globalAlpha = Math.min(1, f.life * 2.2);
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = 'rgba(10, 22, 41, 0.85)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  private drawRings(sim: Sim, ui: StageUi): void {
    const ctx = this.ctx;
    const outline = (id: number | null, color: string, pulse: boolean): void => {
      if (id === null) {
        return;
      }
      for (const lane of sim.lanes) {
        for (const v of lane.queue) {
          if (v.id === id) {
            const c = this.centerOf(v);
            const len = LENGTH[v.cls] * this.unit;
            const grow = pulse && !this.reduceMotion ? Math.sin(this.time * 6) * 2.5 + 2.5 : 1;
            ctx.lineWidth = 3;
            ctx.strokeStyle = color;
            ctx.beginPath();
            ctx.roundRect(c.x - this.carW / 2 - 5 - grow, c.y - len / 2 - 5 - grow, this.carW + 10 + grow * 2, len + 10 + grow * 2, 10);
            ctx.stroke();
          }
        }
      }
    };
    outline(ui.selected, '#ffffff', false);
    outline(ui.ring, '#ffc32d', true);
    if (ui.ringLane !== null) {
      const grow = this.reduceMotion ? 1 : Math.sin(this.time * 6) * 2 + 2;
      const x = this.roadLeft + this.laneW * ui.ringLane;
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ffc32d';
      ctx.beginPath();
      ctx.roundRect(x + 2 - grow, this.canopyTop - grow, this.laneW - 4 + grow * 2, this.boothY - this.canopyTop + 8 + grow * 2, 12);
      ctx.stroke();
    }
    if (ui.ring !== null && ui.hintLane !== null) {
      for (const lane of sim.lanes) {
        for (const v of lane.queue) {
          if (v.id === ui.ring) {
            const c = this.centerOf(v);
            const tx = this.laneCenter(ui.hintLane);
            const k = this.reduceMotion ? 1 : (this.time * 0.7) % 1;
            const x = c.x + (tx - c.x) * k;
            ctx.setLineDash([3, 7]);
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.beginPath();
            ctx.moveTo(c.x, c.y);
            ctx.lineTo(tx, c.y);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = 'rgba(255, 195, 45, 0.95)';
            ctx.beginPath();
            ctx.arc(x, c.y, 11, 0, Math.PI * 2);
            ctx.fill();
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = '#ffffff';
            ctx.stroke();
          }
        }
      }
    }
  }

  /** The direction arrow while a finger is swiping. */
  private drawSwipe(ui: StageUi): void {
    const swipe = ui.swipe;
    if (swipe === null || swipe.from === swipe.to) {
      return;
    }
    const ctx = this.ctx;
    const from = this.laneCenter(swipe.from);
    const to = this.laneCenter(swipe.to);
    const dir = Math.sign(to - from);
    const y = clamp(swipe.y, this.boothY + 30, this.h - 16);
    const color = swipe.ok ? '#ffffff' : '#ffb4ae';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(8, 20, 50, 0.45)';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(from, y);
    ctx.lineTo(to, y);
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.setLineDash([2, 9]);
    ctx.beginPath();
    ctx.moveTo(from, y);
    ctx.lineTo(to - dir * 10, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(to - dir * 11, y - 10);
    ctx.lineTo(to, y);
    ctx.lineTo(to - dir * 11, y + 10);
    ctx.stroke();
  }
}

