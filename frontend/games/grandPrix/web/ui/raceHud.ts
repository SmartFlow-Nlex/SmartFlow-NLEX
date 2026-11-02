import { makeCanvas } from '../../../roadTrip/web/art/kit';
import { canvasEl, h } from '../../../roadTrip/web/ui/dom';
import { pickupIcon } from '../../../roadTrip/web/ui/icons';
import { formatTime } from '../../core/progression';
import { ITEMS, ITEM_DEFS } from '../../core/items';
import type { RaceState } from '../../core/race';
import { mapPoint, trackMap } from '../../core/tracks';
import { drawItemIcon } from '../art/itemArt';
import type { SteeringMode } from '../../core/types';

/**
 * The race HUD in HTML over the canvas: place, lap and time at the top,
 * messages in the middle, the steering pad (below the car) and the boost
 * button with its three-part meter at the bottom. Only changed text is written.
 */

export class RaceHud {
  readonly root: HTMLElement;
  readonly pause: HTMLButtonElement;
  readonly pad: HTMLElement;
  readonly left: HTMLButtonElement;
  readonly right: HTMLButtonElement;
  readonly boost: HTMLButtonElement;
  readonly item: HTMLButtonElement;
  private itemCtx: CanvasRenderingContext2D;
  private itemName: HTMLElement;
  private mapCtx: CanvasRenderingContext2D;
  private mapBase: HTMLCanvasElement | null = null;
  private mapT = 0;
  private warnEl: HTMLElement;
  private warnT = 0;
  private clock = 0;
  private place: HTMLElement;
  private lap: HTMLElement;
  private time: HTMLElement;
  private best: HTMLElement;
  private bolts: HTMLElement;
  private meter: HTMLElement[] = [];
  private toastEl: HTMLElement;
  private lights: HTMLElement;
  private last = new Map<string, string>();
  private toastT = 0;

  constructor(mode: 'cup' | 'trial', steering: SteeringMode, boostSide: 'left' | 'right', onPause: () => void) {
    this.pause = h('button', { class: 'icon-btn hud-pause', attrs: { 'aria-label': 'Pause' }, onClick: onPause }, [h('span', { class: 'pause-glyph', attrs: { 'aria-hidden': 'true' } })]);
    this.place = h('div', { class: 'gp-place', attrs: { 'aria-live': 'polite' } });
    this.lap = h('div', { class: 'gp-lap' });
    this.time = h('div', { class: 'gp-time' });
    this.best = h('div', { class: 'gp-best' });
    this.bolts = h('span', { class: 'n', text: '0' });
    this.toastEl = h('div', { class: 'toast', attrs: { role: 'status' } });
    this.lights = h('div', { class: 'gp-lights', attrs: { 'aria-live': 'assertive' } });
    this.pad = h('div', { class: `pad${steering === 'drag' ? '' : ' hidden'}`, attrs: { 'aria-hidden': 'true' } }, [h('span', { class: 'pad-hint', text: 'Drag here to steer' })]);
    this.left = h('button', { class: `lane-btn left${steering === 'lanes' ? '' : ' hidden'}`, attrs: { 'aria-label': 'One line left', tabindex: '-1' } }, [h('span', { class: 'chev', text: '‹', attrs: { 'aria-hidden': 'true' } })]);
    this.right = h('button', { class: `lane-btn right${steering === 'lanes' ? '' : ' hidden'}`, attrs: { 'aria-label': 'One line right', tabindex: '-1' } }, [h('span', { class: 'chev', text: '›', attrs: { 'aria-hidden': 'true' } })]);
    const meter = h('span', { class: 'gp-meter', attrs: { 'aria-hidden': 'true' } });
    for (let i = 0; i < 3; i += 1) {
      const seg = h('span', { class: 'gp-seg' });
      this.meter.push(seg);
      meter.append(seg);
    }
    this.boost = h('button', { class: `gp-boost ${boostSide}`, attrs: { 'aria-label': 'Boost', tabindex: '-1' } }, [h('span', { class: 'gp-boost-label', text: 'BOOST' }), meter]);
    // The item button: opposite the boost with the drag pad; above it with lane buttons (they take the corners).
    const itemSide = steering === 'lanes' ? boostSide : boostSide === 'right' ? 'left' : 'right';
    const icon = canvasEl(52, 52, 'gp-item-icon');
    this.itemCtx = icon.ctx;
    this.itemName = h('span', { class: 'gp-item-name', text: 'ITEM' });
    this.item = h('button', { class: `gp-item ${itemSide} empty hidden`, attrs: { 'aria-label': 'Item: none yet', tabindex: '-1' } }, [icon.canvas, this.itemName]);
    const map = canvasEl(96, 96, 'gp-minimap');
    this.mapCtx = map.ctx;
    this.warnEl = h('div', { class: 'gp-warn', attrs: { 'aria-hidden': 'true' } });
    this.root = h('div', { class: 'hud gp-hud' }, [
      h('div', { class: 'hud-top' }, [
        this.pause,
        h('div', { class: 'gp-box' }, [mode === 'cup' ? this.place : h('div', { class: 'gp-place', text: 'TRIAL' }), h('div', { class: 'gp-box-text' }, [this.lap, this.time])]),
        h('div', { class: 'hud-stats' }, [h('div', { class: 'stat', attrs: { 'aria-label': 'Bolts picked up' } }, [h('img', { class: 'stat-icon', attrs: { src: pickupIcon('bolt', 22), alt: '' } }), this.bolts])]),
      ]),
      h('div', { class: 'hud-mid' }, [this.best]),
      map.canvas,
      this.warnEl,
      this.toastEl,
      this.lights,
      h('div', { class: `controls ${boostSide}-handed${steering === 'lanes' ? ' lanes-mode' : ''}` }, [this.pad, this.left, this.right, this.boost, this.item]),
    ]);
  }

  private set(key: string, value: string, apply: () => void): void {
    if (this.last.get(key) !== value) {
      this.last.set(key, value);
      apply();
    }
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

  /** Start lights: 0-3 red lamps lit, or 'go'. Empty string hides them. */
  setLights(state: number | 'go' | ''): void {
    this.set('lights', String(state), () => {
      this.lights.replaceChildren();
      this.lights.classList.toggle('show', state !== '');
      if (state === '') {
        return;
      }
      for (let i = 0; i < 3; i += 1) {
        const on = state === 'go' ? 'green' : i < state ? 'red' : '';
        this.lights.append(h('span', { class: `lamp ${on}` }));
      }
      this.lights.append(h('span', { class: 'lights-text', text: state === 'go' ? 'GO!' : state === 0 ? 'Get ready' : String(4 - state) }));
    });
  }

  /** A short warning over the track (a Sipa Ball on its way to Navie). */
  warn(text: string): void {
    this.warnEl.textContent = text;
    this.warnEl.classList.add('show');
    this.warnT = 2;
  }

  /** The item slot: empty, rolling (a roulette of icons), or ready with its name. */
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
      ctx.clearRect(0, 0, 52, 52);
      if (shown !== null) {
        ctx.save();
        ctx.translate(26, 26);
        ctx.scale(0.42, 0.42);
        drawItemIcon(ctx, shown, 0);
        ctx.restore();
      }
      this.item.classList.toggle('empty', state === 'empty');
      this.item.classList.toggle('rolling', state === 'rolling');
      this.item.classList.toggle('ready', state === 'ready');
      this.itemName.textContent = state === 'ready' && p.item !== null ? ITEM_DEFS[p.item].name : state === 'rolling' ? '...' : 'ITEM';
      this.item.setAttribute(
        'aria-label',
        state === 'ready' && p.item !== null ? `Item: ${ITEM_DEFS[p.item].name}, ready. ${ITEM_DEFS[p.item].text}` : state === 'rolling' ? 'Item: rolling' : 'Item: none - drive through a gift box',
      );
    });
  }

  /**
   * The mini map: the whole circuit, every car as a dot in its colour (Navie
   * bigger, ringed in white). Redrawn about 30 times a second.
   */
  private updateMap(s: RaceState, dt: number): void {
    this.mapT -= dt;
    if (this.mapT > 0) {
      return;
    }
    this.mapT = 1 / 30;
    const ctx = this.mapCtx;
    const size = 96;
    const pad = 11;
    const map = trackMap(s.track);
    const at = (distance: number): [number, number] => {
      const [u, v] = mapPoint(map, distance, s.length);
      return [pad + u * (size - pad * 2), pad + v * (size - pad * 2)];
    };
    if (this.mapBase === null) {
      const ratio = Math.min(3, window.devicePixelRatio || 1);
      const { canvas, ctx: b } = makeCanvas(size, size, ratio);
      b.fillStyle = 'rgba(16,40,76,0.72)';
      b.beginPath();
      b.roundRect(0, 0, size, size, 16);
      b.fill();
      b.beginPath();
      map.points.forEach((pt, i) => {
        const x = pad + pt[0] * (size - pad * 2);
        const y = pad + pt[1] * (size - pad * 2);
        if (i === 0) {
          b.moveTo(x, y);
        } else {
          b.lineTo(x, y);
        }
      });
      b.closePath();
      b.lineJoin = 'round';
      b.strokeStyle = '#0A1629';
      b.lineWidth = 7;
      b.stroke();
      b.strokeStyle = '#C9D3DE';
      b.lineWidth = 3.5;
      b.stroke();
      // The start line: a short white tick across the track.
      const [sx, sy] = at(0);
      const [tx, ty] = at(4);
      const len = Math.hypot(tx - sx, ty - sy) || 1;
      b.strokeStyle = '#FFFFFF';
      b.lineWidth = 2.5;
      b.beginPath();
      b.moveTo(sx - ((ty - sy) / len) * 6, sy + ((tx - sx) / len) * 6);
      b.lineTo(sx + ((ty - sy) / len) * 6, sy - ((tx - sx) / len) * 6);
      b.stroke();
      this.mapBase = canvas;
    }
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(this.mapBase, 0, 0, size, size);
    // Shots on their way (small), the ghost, then rivals, then Navie on top.
    for (const shot of s.shots) {
      const [x, y] = at(shot.distance);
      ctx.fillStyle = shot.kind === 'sipa' ? '#FFD34D' : '#8B5A2B';
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    if (s.ghostCar !== null) {
      const [x, y] = at(Math.max(0, s.ghostCar.distance));
      ctx.fillStyle = 'rgba(120,180,255,0.6)';
      ctx.beginPath();
      ctx.arc(x, y, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = s.cars.length - 1; i >= 1; i -= 1) {
      const car = s.cars[i];
      const [x, y] = at(Math.max(0, car.distance));
      ctx.fillStyle = car.colour;
      ctx.strokeStyle = '#0A1629';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, 4.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    const [nx, ny] = at(Math.max(0, s.cars[0].distance));
    ctx.fillStyle = '#3A8CF4';
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(nx, ny, 5.6, 0, Math.PI * 2);
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
    this.set('place', `${s.place}`, () => {
      this.place.innerHTML = '';
      this.place.append(h('span', { class: 'p-big', text: `P${s.place}` }), h('span', { class: 'p-of', text: `/${s.cars.length}` }));
      this.place.setAttribute('aria-label', `Place ${s.place} of ${s.cars.length}`);
    });
    const lap = Math.max(1, Math.min(s.laps, Math.floor(Math.max(0, s.cars[0].distance) / s.length) + 1));
    this.set('lap', `${lap}`, () => {
      this.lap.textContent = `Lap ${lap}/${s.laps}`;
    });
    const t = s.finished ? s.cars[0].finishTime ?? s.time : s.time;
    this.set('time', t.toFixed(1), () => {
      this.time.textContent = formatTime(t);
    });
    const bestLap = s.lapTimes.length > 0 ? Math.min(...s.lapTimes) : null;
    const bestText = ghostDelta !== null ? (Math.abs(ghostDelta) < 0.05 ? 'Level with your ghost' : `Ghost ${ghostDelta > 0 ? '+' : '-'}${Math.abs(ghostDelta).toFixed(1)} s`) : bestLap !== null ? `Best lap ${formatTime(bestLap)}` : '';
    this.set('best', bestText, () => {
      this.best.textContent = bestText;
      this.best.classList.toggle('hidden', bestText === '');
      this.best.classList.toggle('ahead', ghostDelta !== null && ghostDelta < 0);
    });
    this.set('bolts', String(s.bolts), () => {
      this.bolts.textContent = String(s.bolts);
    });
    const charges = Math.floor(s.boostMeter * 3 + 1e-6);
    const partial = s.boostMeter * 3 - charges;
    this.set('meter', `${charges}|${Math.round(partial * 10)}|${s.boostT > 0}`, () => {
      this.meter.forEach((seg, i) => {
        seg.classList.toggle('full', i < charges);
        seg.style.setProperty('--fill', i === charges ? `${Math.round(partial * 100)}%` : i < charges ? '100%' : '0%');
      });
      this.boost.classList.toggle('ready', charges > 0);
      this.boost.classList.toggle('active', s.boostT > 0);
      this.boost.setAttribute('aria-label', `Boost, ${charges} charge${charges === 1 ? '' : 's'}`);
    });
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) {
        this.toastEl.classList.remove('show');
      }
    }
  }
}
