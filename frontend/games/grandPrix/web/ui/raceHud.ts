import { makeCanvas } from '../../../roadTrip/web/art/kit';
import { canvasEl, h } from '../../../roadTrip/web/ui/dom';
import { formatTime } from '../../core/progression';
import { ITEMS, ITEM_DEFS } from '../../core/items';
import type { RaceState } from '../../core/race';
import { mapPoint, trackMap } from '../../core/tracks';
import { drawItemIcon } from '../art/itemArt';
import type { SteeringMode } from '../../core/types';
import { gpIcon, wheelPicture } from './gpIcons';

/**
 * The race HUD in HTML over the canvas, arcade style, kept to what a racer needs: pause and a big
 * place badge top left, the lap and time in the middle, the mini map top right; at the bottom the
 * steering wheel in one corner and the boost and item buttons in the other (mirrored for left hands).
 * Buttons, tilt and lanes modes swap the wheel for their own controls. Banners and short messages
 * appear in the middle. Only changed things are written to the page.
 */

const SUFFIX = (n: number): string => (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th');

export class RaceHud {
  readonly root: HTMLElement;
  readonly pause: HTMLButtonElement;
  /** The wheel's touch area, and the wheel picture inside it. */
  readonly wheelZone: HTMLElement;
  readonly wheel: HTMLElement;
  readonly left: HTMLButtonElement;
  readonly right: HTMLButtonElement;
  readonly boost: HTMLButtonElement;
  readonly item: HTMLButtonElement;
  private itemCtx: CanvasRenderingContext2D;
  private itemName: HTMLElement;
  private mapCtx: CanvasRenderingContext2D;
  private mapBase: HTMLCanvasElement | null = null;
  private mapSize = 100;
  private warnEl: HTMLElement;
  private warnT = 0;
  private clock = 0;
  private place: HTMLElement;
  private placeNum: HTMLElement;
  private placeSuf: HTMLElement;
  private placeArrow: HTMLElement;
  private lap: HTMLElement;
  private time: HTMLElement;
  private best: HTMLElement;
  private cells: HTMLElement[] = [];
  private boostRing: HTMLElement;
  private boostMax = 2;
  private wasBurning = false;
  private toastEl: HTMLElement;
  private toastT = 0;
  private banner: HTMLElement;
  private bannerT = 0;
  private lights: HTMLElement;
  private count: HTMLElement;
  private wheelSpin: HTMLElement;
  private wheelDeg = 0;
  private level: HTMLElement;
  private levelBubble: HTMLElement;
  private hint: HTMLElement;
  private hintGone = false;
  private last = new Map<string, string>();
  private lastPlace = 0;
  private lastItemState = 'empty';

  constructor(mode: 'cup' | 'trial', private readonly steering: SteeringMode, boostSide: 'left' | 'right', onPause: () => void) {
    this.pause = h('button', { class: 'icon-btn hud-pause', attrs: { 'aria-label': 'Pause' }, onClick: onPause }, [h('span', { class: 'pause-glyph', attrs: { 'aria-hidden': 'true' } })]);
    this.placeNum = h('span', { class: 'gp-pos-num' });
    this.placeSuf = h('span', { class: 'gp-pos-suf' });
    this.placeArrow = h('span', { class: 'gp-pos-arrow', attrs: { 'aria-hidden': 'true' } });
    this.place = h('div', { class: 'gp-pos', attrs: { 'aria-live': 'polite' } }, [this.placeNum, this.placeSuf, this.placeArrow]);
    this.lap = h('div', { class: 'gp-lap' });
    this.time = h('div', { class: 'gp-time' });
    this.best = h('div', { class: 'gp-best hidden' });
    this.toastEl = h('div', { class: 'toast', attrs: { role: 'status' } });
    this.banner = h('div', { class: 'gp-banner', attrs: { 'aria-hidden': 'true' } });
    this.lights = h('div', { class: 'gp-lights', attrs: { 'aria-live': 'assertive' } });
    this.count = h('div', { class: 'gp-count', attrs: { 'aria-hidden': 'true' } });
    const wheelOn = steering === 'wheel';
    const wheelSide = boostSide === 'right' ? 'left' : 'right';
    this.hint = h('span', { class: 'gp-steer-hint' }, [gpIcon('rotate', 'gp-steer-hint-ico'), h('span', { text: steering === 'tilt' ? 'Tilt to steer' : 'Rotate to steer' })]);
    /* The wheel: a soft shadow that stays put, the picture that turns, and a touch area a little bigger than both. */
    this.wheelSpin = h('div', { class: 'gp-wheel-spin' }, [wheelPicture()]);
    this.wheel = h('div', { class: 'gp-wheel' }, [h('span', { class: 'gp-wheel-shadow' }), this.wheelSpin]);
    this.wheelZone = h('div', { class: `gp-steer-zone ${wheelSide}${wheelOn ? '' : ' hidden'}`, attrs: { 'aria-hidden': 'true' } }, [this.wheel, wheelOn ? this.hint : null]);
    this.levelBubble = h('span', { class: 'gp-level-bubble' });
    this.level = h('div', { class: `gp-level${steering === 'tilt' ? '' : ' hidden'}`, attrs: { 'aria-hidden': 'true' } }, [h('span', { class: 'gp-level-mid' }), this.levelBubble, steering === 'tilt' ? this.hint : null]);
    const sideBtns = steering === 'buttons' || steering === 'lanes';
    const hold = steering === 'buttons';
    this.left = h('button', { class: `steer-btn left${sideBtns ? '' : ' hidden'}${hold ? ' hold' : ''}`, attrs: { 'aria-label': hold ? 'Steer left' : 'One line left', tabindex: '-1' } }, [h('span', { class: 'chev', text: '◀', attrs: { 'aria-hidden': 'true' } })]);
    this.right = h('button', { class: `steer-btn right${sideBtns ? '' : ' hidden'}${hold ? ' hold' : ''}`, attrs: { 'aria-label': hold ? 'Steer right' : 'One line right', tabindex: '-1' } }, [h('span', { class: 'chev', text: '▶', attrs: { 'aria-hidden': 'true' } })]);
    /* Boost: a big round button, three energy cells round its rim, a ring that drains while it burns. */
    const cellBox = h('span', { class: 'gp-cells', attrs: { 'aria-hidden': 'true' } });
    for (let i = 0; i < 3; i += 1) {
      const cell = h('span', { class: 'gp-cell' }, [h('span', { class: 'gp-cell-fill' })]);
      this.cells.push(cell);
      cellBox.append(cell);
    }
    this.boostRing = h('span', { class: 'gp-boost-ring', attrs: { 'aria-hidden': 'true' } });
    this.boost = h('button', { class: `gp-boost ${boostSide}`, attrs: { 'aria-label': 'Boost', tabindex: '-1' } }, [
      this.boostRing,
      h('span', { class: 'gp-boost-bolt', text: '⚡', attrs: { 'aria-hidden': 'true' } }),
      h('span', { class: 'gp-boost-label', text: 'BOOST' }),
      cellBox,
    ]);
    const icon = canvasEl(56, 56, 'gp-item-icon');
    this.itemCtx = icon.ctx;
    this.itemName = h('span', { class: 'gp-item-name', text: 'ITEM' });
    /* The item sits beside the boost, a little higher, on the boost thumb's side; the steering thumb keeps its corner. */
    this.item = h('button', { class: `gp-item ${boostSide} ${sideBtns ? 'stacked' : 'beside'} empty hidden`, attrs: { 'aria-label': 'Item: none yet', tabindex: '-1' } }, [h('span', { class: 'gp-item-q', text: '?', attrs: { 'aria-hidden': 'true' } }), icon.canvas, this.itemName]);
    this.mapSize = typeof window !== 'undefined' && window.innerWidth <= 360 ? 84 : 100;
    const map = canvasEl(this.mapSize, this.mapSize, 'gp-minimap');
    this.mapCtx = map.ctx;
    this.warnEl = h('div', { class: 'gp-warn', attrs: { 'aria-hidden': 'true' } });
    this.root = h('div', { class: `hud gp-hud steer-${steering}` }, [
      h('div', { class: 'hud-top' }, [
        h('div', { class: 'gp-top-left' }, [this.pause, mode === 'cup' ? this.place : h('div', { class: 'gp-pos trial', text: 'TRIAL' })]),
        h('div', { class: 'gp-lapbox' }, [this.lap, this.time]),
        map.canvas,
      ]),
      h('div', { class: 'hud-mid' }, [this.best]),
      this.warnEl,
      this.toastEl,
      this.banner,
      this.lights,
      this.count,
      this.wheelZone,
      h('div', { class: `controls ${boostSide}-handed steer-${steering}` }, [this.left, this.right, this.level, this.boost, this.item]),
    ]);
  }

  private set(key: string, value: string, apply: () => void): void {
    if (this.last.get(key) !== value) {
      this.last.set(key, value);
      apply();
    }
  }

  /** Restarts a CSS animation class on an element. */
  private pop(el: HTMLElement, cls: string): void {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  /** Lowest point of the top HUD, for the camera (the road starts below it). */
  reservedTop(): number {
    const mid = this.root.querySelector<HTMLElement>('.hud-mid');
    return mid !== null ? mid.getBoundingClientRect().top + parseFloat(getComputedStyle(document.documentElement).fontSize) * 2.2 : 0;
  }

  toast(text: string): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    this.toastT = 1.4;
  }

  /** A big banner across the middle for a moment: FINAL LAP!, or the finishing place. */
  showBanner(text: string, kind: 'final' | 'finish' | 'first' = 'final'): void {
    this.banner.textContent = text;
    this.banner.className = `gp-banner ${kind}`;
    this.pop(this.banner, 'show');
    this.bannerT = kind === 'finish' ? 2.4 : 1.7;
  }

  /** Start lights: 0-3 red lamps lit, or 'go'. Empty string hides them. The big number pops with each lamp. */
  setLights(state: number | 'go' | ''): void {
    this.set('lights', String(state), () => {
      this.lights.replaceChildren();
      this.lights.classList.toggle('show', state !== '');
      if (state === '') {
        this.count.classList.remove('show');
        return;
      }
      for (let i = 0; i < 3; i += 1) {
        const on = state === 'go' ? 'green' : i < state ? 'red' : '';
        this.lights.append(h('span', { class: `lamp ${on}` }));
      }
      this.count.textContent = state === 'go' ? 'GO!' : state === 0 ? 'Ready?' : String(4 - state);
      this.count.className = `gp-count${state === 'go' ? ' go' : state === 0 ? ' ready' : ''}`;
      this.pop(this.count, 'show');
    });
  }

  /** A short warning over the track (a Sipa Ball on its way to Navie). */
  warn(text: string): void {
    this.warnEl.textContent = text;
    this.warnEl.classList.add('show');
    this.warnT = 2;
  }

  /** Turns the steering wheel to `angle` degrees (and marks it held), or moves the tilt level's bubble. */
  steer(angle: number, gripped: boolean, value: number): void {
    if (this.steering === 'tilt') {
      this.levelBubble.style.transform = `translateX(${(value * 46).toFixed(1)}px)`;
      return;
    }
    if (this.steering !== 'wheel') {
      return;
    }
    if (gripped && !this.hintGone) {
      this.hintGone = true;
      this.hint.classList.add('gone');
    }
    this.set('held', String(gripped), () => this.wheel.classList.toggle('held', gripped));
    if (Math.abs(angle - this.wheelDeg) > 0.15 || (angle === 0 && this.wheelDeg !== 0)) {
      this.wheelDeg = angle;
      this.wheelSpin.style.transform = `rotate(${angle.toFixed(1)}deg)`;
    }
  }

  /** The "Rotate to steer" bubble goes after a few seconds even if nobody touches the wheel. */
  hideHint(): void {
    if (!this.hintGone) {
      this.hintGone = true;
      this.hint.classList.add('gone');
    }
  }

  /** The item slot: empty, rolling (a roulette of icons), or ready with its name; a pop when it lands. */
  private updateItem(s: RaceState): void {
    const p = s.cars[0];
    this.set('itemOn', String(s.items), () => this.item.classList.toggle('hidden', !s.items));
    if (!s.items) {
      return;
    }
    const rolling = p.item !== null && p.itemRoll > 0;
    const shown = p.item === null ? null : rolling ? ITEMS[Math.floor(this.clock * 14) % ITEMS.length] : p.item;
    const state = p.item === null ? 'empty' : rolling ? 'rolling' : 'ready';
    this.set('itemIcon', `${state}|${shown}`, () => {
      const ctx = this.itemCtx;
      ctx.clearRect(0, 0, 56, 56);
      if (shown !== null) {
        ctx.save();
        ctx.translate(28, 28);
        ctx.scale(0.45, 0.45);
        drawItemIcon(ctx, shown, 0);
        ctx.restore();
      }
      this.item.classList.toggle('empty', state === 'empty');
      this.item.classList.toggle('rolling', state === 'rolling');
      this.item.classList.toggle('ready', state === 'ready');
      if (state !== this.lastItemState) {
        if (state === 'rolling') {
          this.pop(this.item, 'got');
        } else if (state === 'ready') {
          this.pop(this.item, 'landed');
        }
        this.lastItemState = state;
      }
      this.itemName.textContent = state === 'ready' && p.item !== null ? ITEM_DEFS[p.item].name : state === 'rolling' ? '' : 'ITEM';
      this.item.setAttribute(
        'aria-label',
        state === 'ready' && p.item !== null ? `Item: ${ITEM_DEFS[p.item].name}, ready. ${ITEM_DEFS[p.item].text}` : state === 'rolling' ? 'Item: rolling' : 'Item: none - drive through a gift box',
      );
    });
  }

  /**
   * The mini map: the whole circuit as a smooth loop with a chequered start, every car as a dot in
   * its colour, Navie biggest, ringed in white with a soft glow. Redrawn every frame (a few arcs).
   */
  private mapT = 0;

  private updateMap(s: RaceState, dt: number): void {
    /* About 30 times a second: smooth enough for dots, half the work of every frame. */
    this.mapT -= dt;
    if (this.mapT > 0) {
      return;
    }
    this.mapT = 1 / 30;
    const ctx = this.mapCtx;
    const size = this.mapSize;
    const pad = 13;
    const map = trackMap(s.track);
    const at = (distance: number): [number, number] => {
      const [u, v] = mapPoint(map, distance, s.length);
      return [pad + u * (size - pad * 2), pad + v * (size - pad * 2)];
    };
    if (this.mapBase === null) {
      const ratio = Math.min(3, window.devicePixelRatio || 1);
      const { canvas, ctx: b } = makeCanvas(size, size, ratio);
      const g = b.createLinearGradient(0, 0, 0, size);
      g.addColorStop(0, 'rgba(20,58,112,0.82)');
      g.addColorStop(1, 'rgba(10,30,62,0.82)');
      b.fillStyle = g;
      b.beginPath();
      b.roundRect(0, 0, size, size, 20);
      b.fill();
      b.strokeStyle = 'rgba(255,195,45,0.85)';
      b.lineWidth = 2;
      b.beginPath();
      b.roundRect(1, 1, size - 2, size - 2, 19);
      b.stroke();
      /* A smooth closed curve through the midpoints of the schematic loop. */
      const pts = map.points.map((pt) => [pad + pt[0] * (size - pad * 2), pad + pt[1] * (size - pad * 2)] as [number, number]);
      const path = (): void => {
        b.beginPath();
        const n = pts.length;
        const mid = (i: number): [number, number] => [(pts[i % n][0] + pts[(i + 1) % n][0]) / 2, (pts[i % n][1] + pts[(i + 1) % n][1]) / 2];
        const m0 = mid(0);
        b.moveTo(m0[0], m0[1]);
        for (let i = 1; i <= n; i += 1) {
          const m = mid(i);
          b.quadraticCurveTo(pts[i % n][0], pts[i % n][1], m[0], m[1]);
        }
        b.closePath();
      };
      b.lineJoin = 'round';
      b.lineCap = 'round';
      path();
      b.strokeStyle = '#06101f';
      b.lineWidth = 9;
      b.stroke();
      path();
      b.strokeStyle = '#E7EEF7';
      b.lineWidth = 5;
      b.stroke();
      /* The start line: a little chequered bar across the track. */
      const [sx, sy] = at(0);
      const [tx, ty] = at(4);
      const len = Math.hypot(tx - sx, ty - sy) || 1;
      const nx = -(ty - sy) / len;
      const ny = (tx - sx) / len;
      for (let i = -3; i < 3; i += 1) {
        b.fillStyle = (i + 3) % 2 === 0 ? '#10284C' : '#FFFFFF';
        b.fillRect(sx + nx * i * 2 - 1.2, sy + ny * i * 2 - 1.2, 2.4, 2.4);
      }
      this.mapBase = canvas;
    }
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(this.mapBase, 0, 0, size, size);
    for (const shot of s.shots) {
      const [x, y] = at(shot.distance);
      ctx.fillStyle = shot.kind === 'sipa' ? '#FFD34D' : '#8B5A2B';
      ctx.beginPath();
      ctx.arc(x, y, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (s.ghostCar !== null) {
      const [x, y] = at(Math.max(0, s.ghostCar.distance));
      ctx.fillStyle = 'rgba(120,180,255,0.6)';
      ctx.beginPath();
      ctx.arc(x, y, 4.8, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = s.cars.length - 1; i >= 1; i -= 1) {
      const car = s.cars[i];
      const [x, y] = at(Math.max(0, car.distance));
      ctx.fillStyle = car.colour;
      ctx.strokeStyle = '#06101f';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(x, y, 4.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    const [nx, ny] = at(Math.max(0, s.cars[0].distance));
    ctx.fillStyle = `rgba(95,211,255,${(0.25 + 0.15 * Math.sin(this.clock * 6)).toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(nx, ny, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3A8CF4';
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(nx, ny, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  update(s: RaceState, ghostDelta: number | null, dt: number): void {
    this.clock += dt;
    this.updateItem(s);
    this.updateMap(s, dt);
    if (this.warnT > 0) {
      this.warnT -= dt;
      if (this.warnT <= 0) {
        this.warnEl.classList.remove('show');
      }
    }
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) {
        this.banner.classList.remove('show');
      }
    }
    this.set('place', `${s.place}`, () => {
      this.placeNum.textContent = String(s.place);
      this.placeSuf.textContent = SUFFIX(s.place);
      this.place.setAttribute('aria-label', `Place ${s.place} of ${s.cars.length}`);
      this.place.dataset.rank = s.place <= 3 ? String(s.place) : 'n';
      if (this.lastPlace !== 0 && s.place !== this.lastPlace) {
        /* Passed someone (or was passed): the badge pops, with a little arrow; first place gets a sparkle. */
        const up = s.place < this.lastPlace;
        this.placeArrow.textContent = up ? '▲' : '▼';
        this.placeArrow.className = `gp-pos-arrow ${up ? 'up' : 'down'}`;
        this.pop(this.place, 'pop');
        this.pop(this.placeArrow, 'show');
        if (up && s.place === 1) {
          this.pop(this.place, 'first');
        }
      }
      this.lastPlace = s.place;
    });
    const lap = Math.max(1, Math.min(s.laps, Math.floor(Math.max(0, s.cars[0].distance) / s.length) + 1));
    this.set('lap', `${lap}`, () => {
      this.lap.replaceChildren(h('span', { class: 'gp-lap-word', text: 'LAP' }), h('span', { class: 'gp-lap-n', text: `${lap}` }), h('span', { class: 'gp-lap-of', text: `/${s.laps}` }));
      if (lap > 1) {
        this.pop(this.lap, 'pop');
      }
      this.lap.classList.toggle('final', lap === s.laps && s.laps > 1);
    });
    const t = s.finished ? s.cars[0].finishTime ?? s.time : s.time;
    this.set('time', t.toFixed(1), () => {
      this.time.textContent = formatTime(t);
    });
    /* Only the time trial's ghost gap shows here; best laps wait for the results. */
    const bestText = ghostDelta !== null ? (Math.abs(ghostDelta) < 0.05 ? 'Level with ghost' : `Ghost ${ghostDelta > 0 ? '+' : '-'}${Math.abs(ghostDelta).toFixed(1)} s`) : '';
    this.set('best', bestText, () => {
      this.best.textContent = bestText;
      this.best.classList.toggle('hidden', bestText === '');
      this.best.classList.toggle('ahead', ghostDelta !== null && ghostDelta < 0);
    });
    const charges = Math.floor(s.boostMeter * 3 + 1e-6);
    const partial = s.boostMeter * 3 - charges;
    const burning = s.boostT > 0;
    /* The ring drains from however long this burn started at (a turbo item burns longer). */
    if (burning && (!this.wasBurning || s.boostT > this.boostMax)) {
      this.boostMax = s.boostT;
    }
    this.wasBurning = burning;
    this.set('meter', `${charges}|${Math.round(partial * 20)}|${burning}`, () => {
      this.cells.forEach((cell, i) => {
        cell.classList.toggle('full', i < charges);
        cell.style.setProperty('--fill', i === charges ? `${Math.round(partial * 100)}%` : i < charges ? '100%' : '0%');
      });
      const wasReady = this.boost.classList.contains('ready');
      this.boost.classList.toggle('ready', charges > 0 && !burning);
      if (!wasReady && charges > 0 && !burning) {
        this.pop(this.boost, 'charged');
      }
      if (burning && !this.boost.classList.contains('active')) {
        this.pop(this.boost, 'flash');
      }
      this.boost.classList.toggle('active', burning);
      this.boost.setAttribute('aria-label', `Boost, ${charges} charge${charges === 1 ? '' : 's'}`);
    });
    if (burning) {
      this.boostRing.style.setProperty('--deg', `${Math.round((s.boostT / Math.max(0.5, this.boostMax)) * 360)}deg`);
    }
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) {
        this.toastEl.classList.remove('show');
      }
    }
  }
}

/**
 * A track's outline as a picture for the briefing: the smooth loop on a sky in the track's time of
 * day (morning, sunset, night), with the start marked.
 */
export function trackPreview(track: import('../../core/tracks').TrackDef, size = 132): HTMLCanvasElement {
  const ratio = Math.min(3, window.devicePixelRatio || 1);
  const { canvas, ctx } = makeCanvas(size, size, ratio);
  canvas.className = 'track-preview';
  const sky: Record<string, [string, string]> = { morning: ['#7fd0ff', '#d7f2ff'], sunset: ['#ff9a5c', '#ffd8a6'], night: ['#0b1233', '#3a2a66'] };
  const [a, b] = sky[track.time] ?? sky.morning;
  const g = ctx.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, 22);
  ctx.fill();
  const map = trackMap(track);
  const pad = 16;
  const pts = map.points.map((pt) => [pad + pt[0] * (size - pad * 2), pad + pt[1] * (size - pad * 2)] as [number, number]);
  const n = pts.length;
  const mid = (i: number): [number, number] => [(pts[i % n][0] + pts[(i + 1) % n][0]) / 2, (pts[i % n][1] + pts[(i + 1) % n][1]) / 2];
  const path = (): void => {
    ctx.beginPath();
    const m0 = mid(0);
    ctx.moveTo(m0[0], m0[1]);
    for (let i = 1; i <= n; i += 1) {
      const m = mid(i);
      ctx.quadraticCurveTo(pts[i % n][0], pts[i % n][1], m[0], m[1]);
    }
    ctx.closePath();
  };
  ctx.lineJoin = 'round';
  path();
  ctx.strokeStyle = track.time === 'night' ? '#e8466c' : '#10284c';
  ctx.lineWidth = 12;
  ctx.stroke();
  path();
  ctx.strokeStyle = '#5a6375';
  ctx.lineWidth = 8;
  ctx.stroke();
  path();
  ctx.setLineDash([5, 6]);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.setLineDash([]);
  const length = track.segments.reduce((sum, seg) => sum + seg.length, 0);
  const [u, v] = mapPoint(map, 0, length);
  const sx = pad + u * (size - pad * 2);
  const sy = pad + v * (size - pad * 2);
  ctx.fillStyle = '#ffc32d';
  ctx.strokeStyle = '#10284c';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(sx, sy, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  return canvas;
}
