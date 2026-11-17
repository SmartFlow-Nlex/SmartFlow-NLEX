import type { Expression } from '../../roadTrip/core/types';
import { art, blinkAt, drawCharacter, preload } from '../../roadTrip/web/art/clay';
import { BRAND_FONT, ellipsePath, makeCanvas, roundRect, vgrad, type Ctx } from '../../roadTrip/web/art/kit';
import type { Scene } from './appApi';

/**
 * The Grand Prix's own start screen: race morning at a little NLEX pit stop. An elevated
 * expressway runs across the back between soft hills; a pit garage on one side and a grandstand
 * on the other; bunting with fairy lights strung over the start line; flags, cones, palms and
 * clouds. Navie stands in front on the chequered line in a warm pool of light, as the hero.
 *
 * Navie is Tollbound Heroes' finished model, read as is (never redrawn), shown front-three-quarter
 * and alive: breathing, blinking, a little bounce, an excited hop now and then that ends looking
 * at you, a happy hop when tapped, and a dash off to race when Start is pressed.
 *
 * The scenery is painted once per size into one picture; each frame draws that, three drifting
 * clouds, the bunting and flags swaying, the lights twinkling, a few puffs, and Navie.
 * Panel screens use the same place without Navie, dimmed behind their cards.
 */

export interface Stage {
  x: number;
  y: number;
  w: number;
  h: number;
}

const NAVIE_VIEWS = ['h.navie.qR', 'h.navie.frontR', 'h.navie.q2R', 'h.navie.front', 'h.navie.face'];
const FLAG_COLOURS = ['#1464E8', '#FFC32D', '#FFFFFF', '#E2453C', '#2BB3A3'];

interface Puff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  r: number;
  star: boolean;
}

function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export class MenuScene implements Scene {
  private width = 390;
  private height = 844;
  private dpr = 1;
  private t = 0;
  private background: HTMLCanvasElement | null = null;
  private cloudSprite: HTMLCanvasElement | null = null;
  private stage: Stage | null = null;
  private pokeT = -10;
  private goT = -1;
  private puffs: Puff[] = [];
  private lastExcite = -1;
  /** Navie's views not yet drawn on this canvas: each is drawn once, tiny, under the scenery, so its first real appearance never stalls a frame. */
  private warm = NAVIE_VIEWS.slice();
  dim = 0;

  constructor(private readonly options: { hero: boolean; reduceMotion?: boolean } = { hero: false }) {
    void preload(NAVIE_VIEWS);
  }

  resize(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.background = null;
  }

  /** Where Navie stands, in CSS px (the start screen measures its empty middle). */
  setStage(stage: Stage | null): void {
    const before = this.stage;
    this.stage = stage;
    if (before === null || stage === null || Math.abs(before.y + before.h - (stage.y + stage.h)) > 1 || Math.abs(before.w - stage.w) > 1) {
      this.background = null;
    }
  }

  /** A tap on Navie: a happy hop and a few sparkles. */
  poke(): void {
    if (this.goT < 0 && this.t - this.pokeT > 0.5) {
      this.pokeT = this.t;
      this.spawn(6, true);
    }
  }

  /** Start Race: a crouch, a hop, and a dash off to the right. Returns how long it takes (seconds). */
  go(): number {
    if (this.options.reduceMotion === true || this.stage === null || !this.options.hero) {
      return 0;
    }
    this.goT = this.t;
    return 0.95;
  }

  // -- the ground Navie stands on ------------------------------------------------------

  private groundY(): number {
    const st = this.stage;
    return st !== null ? st.y + st.h - 8 : this.height * 0.62;
  }

  private navieWidth(): number {
    const st = this.stage;
    if (st === null) {
      return this.width * 0.5;
    }
    return Math.max(120, Math.min(st.w * 0.64, st.h * 0.94, 300));
  }

  // -- painted once ----------------------------------------------------------------------

  private ensureBackground(): HTMLCanvasElement {
    if (this.background === null) {
      const { canvas, ctx } = makeCanvas(this.width, this.height, this.dpr);
      this.paint(ctx, this.width, this.height);
      this.background = canvas;
    }
    return this.background;
  }

  private paint(ctx: Ctx, w: number, h: number): void {
    const gy = this.groundY();
    /* The start straight runs up from wherever Navie stands (the middle, or the left half when held sideways). */
    const cx = this.stage !== null && this.options.hero ? this.stage.x + this.stage.w / 2 : w / 2;
    /* The far end of the start straight, where the ground meets the hills. */
    const horizon = gy - Math.max(70, Math.min(h * 0.15, 150));
    // Sky: deep at the top, pale at the hills; a soft morning sun.
    ctx.fillStyle = vgrad(ctx, 0, horizon, [
      [0, '#4FB2F5'],
      [0.55, '#9ED8FF'],
      [1, '#E6F6FF'],
    ]);
    ctx.fillRect(0, 0, w, horizon + 2);
    const sun = ctx.createRadialGradient(w * 0.84, h * 0.13, 4, w * 0.84, h * 0.13, w * 0.42);
    sun.addColorStop(0, 'rgba(255,248,214,0.95)');
    sun.addColorStop(0.18, 'rgba(255,240,190,0.55)');
    sun.addColorStop(1, 'rgba(255,240,190,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, w, horizon);
    // Hills: a hazy far ridge with one rounded peak, then a greener near one.
    const hillTop = horizon - h * 0.16;
    this.ridge(ctx, w, horizon, hillTop + h * 0.03, '#A7D6CF', 0.9, 3);
    ctx.fillStyle = '#9CCFC4';
    ctx.beginPath();
    ctx.moveTo(w * 0.02, horizon);
    ctx.quadraticCurveTo(w * 0.2, hillTop - h * 0.02, w * 0.36, horizon - h * 0.05);
    ctx.lineTo(w * 0.36, horizon);
    ctx.fill();
    this.ridge(ctx, w, horizon, hillTop + h * 0.08, '#86C79A', 1.4, 7);
    // The expressway on its pillars across the back, with its green sign.
    this.viaduct(ctx, w, horizon, h);
    // Palms and trees behind the buildings.
    for (const [x, s] of [[0.06, 1.1], [0.45, 0.8], [0.93, 1.05], [0.56, 0.7]] as [number, number][]) {
      this.palm(ctx, w * x, horizon + 2, h * 0.075 * s);
    }
    // Grass, mown in stripes, down to the bottom.
    ctx.fillStyle = vgrad(ctx, horizon, h, [
      [0, '#8AD36A'],
      [1, '#4FAE47'],
    ]);
    ctx.fillRect(0, horizon, w, h - horizon);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    for (let i = 0; i < 9; i += 1) {
      const y0 = horizon + (h - horizon) * ((i * 2) / 18) ** 1.6;
      const y1 = horizon + (h - horizon) * ((i * 2 + 1) / 18) ** 1.6;
      ctx.fillRect(0, y0, w, y1 - y0);
    }
    // The pit garage (left) and the grandstand (right), standing on the far grass.
    this.pit(ctx, -w * 0.03, horizon + 3, w * 0.4, h * 0.12);
    this.grandstand(ctx, w * 0.62, horizon + 3, w * 0.42, h * 0.11);
    // Bushes along the far edge of the grass.
    for (let i = 0; i < 9; i += 1) {
      const x = w * (0.04 + i * 0.12) + hash(i) * 10;
      if (Math.abs(x - cx) < w * 0.2) {
        continue;
      }
      this.bush(ctx, x, horizon + 8 + hash(i + 4) * 6, 10 + hash(i + 9) * 8);
    }
    // The start straight in perspective, kerbs and lines, the chequered start line under Navie.
    this.track(ctx, w, h, horizon, gy, cx);
    // A little start gantry far down the straight.
    this.gantry(ctx, cx, horizon, w * 0.2);
    // Cones and a tyre stack by the kerbs; race flags on poles.
    const spread = (y: number): number => w * 0.18 + (w * 0.8 - w * 0.18) * ((y - horizon) / (h - horizon));
    for (const [side, y, kind] of [[-1, gy - 26, 'cone'], [-1, gy + 6, 'cone'], [1, gy - 14, 'tyres'], [1, gy + 22, 'cone']] as [number, number, string][]) {
      const x = cx + side * (spread(y) + 16 + (y - horizon) * 0.08);
      const s = 0.6 + ((y - horizon) / (h - horizon)) * 0.9;
      if (kind === 'cone') {
        this.cone(ctx, x, y, s);
      } else {
        this.tyres(ctx, x, y, s);
      }
    }
    // The warm pool of light Navie stands in.
    if (this.options.hero) {
      const nw = this.navieWidth();
      const pool = ctx.createRadialGradient(cx, gy, 4, cx, gy, nw * 0.75);
      pool.addColorStop(0, 'rgba(255,246,214,0.75)');
      pool.addColorStop(0.55, 'rgba(255,236,190,0.28)');
      pool.addColorStop(1, 'rgba(255,236,190,0)');
      ctx.fillStyle = pool;
      ctx.save();
      ctx.translate(cx, gy);
      ctx.scale(1, 0.32);
      ctx.beginPath();
      ctx.arc(0, 0, nw * 0.75, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private ridge(ctx: Ctx, w: number, base: number, top: number, colour: string, waves: number, seed: number): void {
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(0, base);
    for (let i = 0; i <= 24; i += 1) {
      const x = (w * i) / 24;
      const y = top + (Math.sin(i * 0.55 * waves + seed) * 0.5 + 0.5) * (base - top) * 0.45 + hash(i + seed) * 4;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, base);
    ctx.closePath();
    ctx.fill();
  }

  private viaduct(ctx: Ctx, w: number, horizon: number, h: number): void {
    const deck = horizon - h * 0.085;
    const thick = Math.max(7, h * 0.016);
    // Pillars.
    for (let x = w * 0.08; x < w; x += w * 0.24) {
      ctx.fillStyle = vgrad(ctx, deck, horizon, [
        [0, '#B7C2D0'],
        [1, '#98A6B8'],
      ]);
      roundRect(ctx, x - 6, deck + thick - 2, 12, horizon - deck - thick + 4, 3);
      ctx.fill();
      ctx.fillStyle = '#C9D3DF';
      roundRect(ctx, x - 12, deck + thick - 2, 24, 5, 2);
      ctx.fill();
    }
    // The deck: a pale slab, a darker underside, a blue rail along the top.
    ctx.fillStyle = '#D9E1EA';
    ctx.fillRect(0, deck, w, thick);
    ctx.fillStyle = '#9EABBB';
    ctx.fillRect(0, deck + thick - 3, w, 3);
    ctx.fillStyle = '#1F6FF0';
    ctx.fillRect(0, deck - 4, w, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillRect(0, deck - 5, w, 1.2);
    // Lamp posts on the deck.
    for (let x = w * 0.2; x < w; x += w * 0.24) {
      ctx.strokeStyle = '#8D9AAB';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, deck - 4);
      ctx.lineTo(x, deck - 22);
      ctx.quadraticCurveTo(x, deck - 27, x + 7, deck - 27);
      ctx.stroke();
      ctx.fillStyle = '#FFF3C4';
      ellipsePath(ctx, x + 8, deck - 26.5, 4, 2);
      ctx.fill();
    }
    // A green expressway sign over the lanes, with a small NLEX badge.
    const sx = w * 0.64;
    const sw = Math.min(118, w * 0.3);
    const sh = 30;
    const top = deck - 4 - sh - 10;
    ctx.fillStyle = '#7D8A9C';
    ctx.fillRect(sx + 8, top + sh, 3, 12);
    ctx.fillRect(sx + sw - 11, top + sh, 3, 12);
    ctx.fillStyle = '#167A44';
    roundRect(ctx, sx, top, sw, sh, 5);
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.6;
    roundRect(ctx, sx + 2.5, top + 2.5, sw - 5, sh - 5, 3.5);
    ctx.stroke();
    ctx.fillStyle = '#1464E8';
    roundRect(ctx, sx + 6, top + 7, 26, 16, 3);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `900 9px ${BRAND_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('NLEX', sx + 19, top + 15.5);
    ctx.font = `900 11px ${BRAND_FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText('Grand Prix ➜', sx + 37, top + 15.5);
  }

  private palm(ctx: Ctx, x: number, base: number, tall: number): void {
    ctx.strokeStyle = '#9C7A4E';
    ctx.lineWidth = Math.max(3, tall * 0.09);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, base);
    ctx.quadraticCurveTo(x + tall * 0.12, base - tall * 0.5, x + tall * 0.05, base - tall);
    ctx.stroke();
    const tx = x + tall * 0.05;
    const ty = base - tall;
    ctx.fillStyle = '#3E9E57';
    for (let i = 0; i < 6; i += 1) {
      const a = -Math.PI / 2 + (i - 2.5) * 0.62;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.quadraticCurveTo(tx + Math.cos(a) * tall * 0.4, ty + Math.sin(a) * tall * 0.4 - tall * 0.08, tx + Math.cos(a) * tall * 0.55, ty + Math.sin(a) * tall * 0.55 + tall * 0.12);
      ctx.quadraticCurveTo(tx + Math.cos(a) * tall * 0.3, ty + Math.sin(a) * tall * 0.3 + tall * 0.02, tx, ty);
      ctx.fill();
    }
  }

  private bush(ctx: Ctx, x: number, y: number, r: number): void {
    ctx.fillStyle = '#3F9A4E';
    for (const [dx, dy, k] of [[-0.7, 0.1, 0.75], [0.7, 0.15, 0.7], [0, -0.25, 1]] as [number, number, number][]) {
      ellipsePath(ctx, x + dx * r, y + dy * r, r * k, r * k * 0.85);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ellipsePath(ctx, x - r * 0.25, y - r * 0.55, r * 0.45, r * 0.25);
    ctx.fill();
  }

  private pit(ctx: Ctx, x: number, base: number, w: number, h: number): void {
    // Body, roof, a striped awning, two garage doors (one open, tools inside), a yellow PIT disc.
    ctx.fillStyle = 'rgba(16,40,76,0.16)';
    ellipsePath(ctx, x + w * 0.5, base, w * 0.55, 6);
    ctx.fill();
    ctx.fillStyle = vgrad(ctx, base - h, base, [
      [0, '#FFFFFF'],
      [1, '#DCE6F2'],
    ]);
    roundRect(ctx, x, base - h, w, h, [10, 10, 2, 2]);
    ctx.fill();
    ctx.fillStyle = '#1464E8';
    roundRect(ctx, x - 6, base - h - 9, w + 12, 14, 7);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    roundRect(ctx, x, base - h - 7, w, 3, 2);
    ctx.fill();
    const stripes = 8;
    const ay = base - h + 8;
    for (let i = 0; i < stripes; i += 1) {
      ctx.fillStyle = i % 2 === 0 ? '#1F6FF0' : '#FFFFFF';
      ctx.beginPath();
      const sx = x + 4 + ((w - 8) / stripes) * i;
      const sw = (w - 8) / stripes;
      ctx.moveTo(sx, ay);
      ctx.lineTo(sx + sw, ay);
      ctx.lineTo(sx + sw, ay + 10);
      ctx.quadraticCurveTo(sx + sw / 2, ay + 15, sx, ay + 10);
      ctx.closePath();
      ctx.fill();
    }
    const doorW = w * 0.3;
    const doorH = h * 0.5;
    for (let i = 0; i < 2; i += 1) {
      const dx = x + w * 0.12 + i * (doorW + w * 0.1);
      ctx.fillStyle = i === 0 ? '#22324C' : '#B8C6D8';
      roundRect(ctx, dx, base - doorH, doorW, doorH, [5, 5, 0, 0]);
      ctx.fill();
      if (i === 0) {
        // Tools on the wall, a warm light inside.
        ctx.fillStyle = 'rgba(255,214,120,0.35)';
        roundRect(ctx, dx + 2, base - doorH + 2, doorW - 4, doorH * 0.35, 3);
        ctx.fill();
        ctx.fillStyle = '#E2453C';
        roundRect(ctx, dx + doorW * 0.18, base - doorH * 0.42, doorW * 0.32, doorH * 0.3, 2);
        ctx.fill();
        ctx.fillStyle = '#FFC32D';
        ctx.fillRect(dx + doorW * 0.6, base - doorH * 0.62, doorW * 0.08, doorH * 0.4);
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 1.2;
        for (let k = 1; k < 5; k += 1) {
          ctx.beginPath();
          ctx.moveTo(dx + 2, base - doorH + (doorH / 5) * k);
          ctx.lineTo(dx + doorW - 2, base - doorH + (doorH / 5) * k);
          ctx.stroke();
        }
      }
    }
    const px = x + w * 0.82;
    const py = base - h * 0.62;
    ctx.fillStyle = '#FFC32D';
    ctx.beginPath();
    ctx.arc(px, py, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#10284C';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#10284C';
    ctx.font = `900 9px ${BRAND_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PIT', px, py + 0.5);
  }

  private grandstand(ctx: Ctx, x: number, base: number, w: number, h: number): void {
    ctx.fillStyle = 'rgba(16,40,76,0.16)';
    ellipsePath(ctx, x + w * 0.5, base, w * 0.55, 6);
    ctx.fill();
    // Tiers, a crowd of colourful dots, a roof on thin posts, a GO NAVIE banner, pennants.
    const tiers = 4;
    for (let i = 0; i < tiers; i += 1) {
      const ty = base - (h * 0.78 * (i + 1)) / tiers;
      ctx.fillStyle = i % 2 === 0 ? '#E7EDF5' : '#D3DDEA';
      ctx.fillRect(x + i * 4, ty, w - i * 4, (h * 0.78) / tiers + 1);
      for (let k = 0; k < 13; k += 1) {
        const px = x + i * 4 + 6 + ((w - i * 4 - 12) / 12) * k;
        ctx.fillStyle = FLAG_COLOURS[(k + i * 3) % FLAG_COLOURS.length] === '#FFFFFF' ? '#FF8FA3' : FLAG_COLOURS[(k + i * 3) % FLAG_COLOURS.length];
        ctx.beginPath();
        ctx.arc(px, ty + 3.5, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const roofY = base - h * 0.78 - h * 0.28;
    ctx.fillStyle = '#9AA8BA';
    ctx.fillRect(x + 4, roofY, 2.5, h * 0.3);
    ctx.fillRect(x + w - 8, roofY, 2.5, h * 0.3);
    ctx.fillStyle = '#1464E8';
    ctx.beginPath();
    ctx.moveTo(x - 6, roofY + 8);
    ctx.lineTo(x + 8, roofY - 4);
    ctx.lineTo(x + w + 4, roofY - 4);
    ctx.lineTo(x + w + 4, roofY + 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(x + 8, roofY - 4, w - 4, 2);
    // Banner on the front rail.
    const bw = w * 0.62;
    const bx = x + w * 0.2;
    const by = base - h * 0.34;
    ctx.fillStyle = '#FFC32D';
    roundRect(ctx, bx, by, bw, 15, 4);
    ctx.fill();
    ctx.fillStyle = '#10284C';
    ctx.font = `900 9.5px ${BRAND_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GO NAVIE!', bx + bw / 2, by + 8);
    // Pennants on the roof.
    for (let i = 0; i < 4; i += 1) {
      const fx = x + 14 + ((w - 24) / 3) * i;
      ctx.strokeStyle = '#7D8A9C';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(fx, roofY - 4);
      ctx.lineTo(fx, roofY - 20);
      ctx.stroke();
      ctx.fillStyle = FLAG_COLOURS[i % 4];
      ctx.beginPath();
      ctx.moveTo(fx, roofY - 20);
      ctx.lineTo(fx + 11, roofY - 16);
      ctx.lineTo(fx, roofY - 12);
      ctx.closePath();
      ctx.fill();
    }
  }

  private track(ctx: Ctx, w: number, h: number, horizon: number, gy: number, cx: number): void {
    const topHalf = w * 0.17;
    const bottomHalf = w * 0.82;
    const halfAt = (y: number): number => topHalf + (bottomHalf - topHalf) * ((y - horizon) / (h - horizon));
    ctx.fillStyle = vgrad(ctx, horizon, h, [
      [0, '#7A8396'],
      [1, '#4A5264'],
    ]);
    ctx.beginPath();
    ctx.moveTo(cx - topHalf, horizon);
    ctx.lineTo(cx + topHalf, horizon);
    ctx.lineTo(cx + bottomHalf, h);
    ctx.lineTo(cx - bottomHalf, h);
    ctx.closePath();
    ctx.fill();
    // Kerbs: red and white blocks, each a little longer nearer.
    const n = 14;
    for (let i = 0; i < n; i += 1) {
      const y0 = horizon + (h - horizon) * (i / n) ** 1.7;
      const y1 = horizon + (h - horizon) * ((i + 1) / n) ** 1.7;
      ctx.fillStyle = i % 2 === 0 ? '#E2453C' : '#FFFFFF';
      for (const side of [-1, 1]) {
        const a0 = halfAt(y0);
        const a1 = halfAt(y1);
        const k0 = Math.max(3, a0 * 0.07);
        const k1 = Math.max(3, a1 * 0.07);
        ctx.beginPath();
        ctx.moveTo(cx + side * a0, y0);
        ctx.lineTo(cx + side * (a0 + k0), y0);
        ctx.lineTo(cx + side * (a1 + k1), y1);
        ctx.lineTo(cx + side * a1, y1);
        ctx.closePath();
        ctx.fill();
      }
    }
    // Edge lines and a dashed middle line.
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + side * topHalf * 0.9, horizon);
      ctx.lineTo(cx + side * (topHalf * 0.9 + 1.5), horizon);
      ctx.lineTo(cx + side * (bottomHalf * 0.9 + 6), h);
      ctx.lineTo(cx + side * bottomHalf * 0.9, h);
      ctx.closePath();
      ctx.fill();
    }
    for (let i = 0; i < 8; i += 2) {
      const y0 = horizon + (h - horizon) * (i / 8) ** 1.7;
      const y1 = horizon + (h - horizon) * ((i + 0.9) / 8) ** 1.7;
      if (y1 > gy - 30 && y0 < gy + 30) {
        continue;
      }
      const w0 = 1 + ((y0 - horizon) / (h - horizon)) * 6;
      const w1 = 1 + ((y1 - horizon) / (h - horizon)) * 6;
      ctx.beginPath();
      ctx.moveTo(cx - w0 / 2, y0);
      ctx.lineTo(cx + w0 / 2, y0);
      ctx.lineTo(cx + w1 / 2, y1);
      ctx.lineTo(cx - w1 / 2, y1);
      ctx.closePath();
      ctx.fill();
    }
    // The chequered start line, two rows, just in front of Navie's wheels.
    const lineY = gy + 4;
    const rowH = Math.max(6, (halfAt(lineY) / bottomHalf) * 13);
    const half = halfAt(lineY);
    const cells = 16;
    for (let r = 0; r < 2; r += 1) {
      const y = lineY + r * rowH;
      const a = halfAt(y);
      for (let i = 0; i < cells; i += 1) {
        ctx.fillStyle = (i + r) % 2 === 0 ? '#10284C' : '#FFFFFF';
        ctx.fillRect(cx - a + ((2 * a) / cells) * i, y, (2 * a) / cells + 0.6, rowH + 0.4);
      }
    }
    void half;
  }

  private gantry(ctx: Ctx, cx: number, horizon: number, span: number): void {
    const top = horizon - span * 0.42;
    ctx.fillStyle = '#E8EEF5';
    ctx.fillRect(cx - span / 2, top, 4, span * 0.42);
    ctx.fillRect(cx + span / 2 - 4, top, 4, span * 0.42);
    ctx.fillStyle = '#10284C';
    roundRect(ctx, cx - span / 2 - 2, top - 8, span + 4, 11, 3);
    ctx.fill();
    for (let i = 0; i < 5; i += 1) {
      ctx.fillStyle = '#E2453C';
      ctx.beginPath();
      ctx.arc(cx - span * 0.3 + (span * 0.6 * i) / 4, top - 2.5, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private cone(ctx: Ctx, x: number, y: number, s: number): void {
    ctx.fillStyle = 'rgba(16,40,76,0.25)';
    ellipsePath(ctx, x, y, 9 * s, 3 * s);
    ctx.fill();
    ctx.fillStyle = '#FF7A1A';
    ctx.beginPath();
    ctx.moveTo(x - 7 * s, y);
    ctx.lineTo(x - 1.6 * s, y - 20 * s);
    ctx.quadraticCurveTo(x, y - 22 * s, x + 1.6 * s, y - 20 * s);
    ctx.lineTo(x + 7 * s, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(x - 4.6 * s, y - 11 * s, 9.2 * s, 3.4 * s);
    ctx.fillStyle = '#E2601A';
    roundRect(ctx, x - 9 * s, y - 2 * s, 18 * s, 3 * s, 1.5 * s);
    ctx.fill();
  }

  private tyres(ctx: Ctx, x: number, y: number, s: number): void {
    for (let i = 0; i < 3; i += 1) {
      const ty = y - i * 7 * s;
      ctx.fillStyle = '#2A2F38';
      ellipsePath(ctx, x, ty - 3 * s, 11 * s, 5 * s);
      ctx.fill();
      ctx.fillStyle = i === 1 ? '#FFFFFF' : '#E2453C';
      ctx.fillRect(x - 11 * s, ty - 4 * s, 22 * s, 1.6 * s);
    }
    ctx.fillStyle = '#4A505C';
    ellipsePath(ctx, x, y - 17 * s, 5 * s, 2 * s);
    ctx.fill();
  }

  private ensureCloud(): HTMLCanvasElement {
    if (this.cloudSprite === null) {
      const { canvas, ctx } = makeCanvas(120, 56, this.dpr);
      ctx.fillStyle = '#DCEBFA';
      for (const [x, y, r] of [[30, 36, 18], [56, 30, 24], [84, 36, 18], [44, 40, 16], [72, 42, 16]] as [number, number, number][]) {
        ctx.beginPath();
        ctx.arc(x, y + 3, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#FFFFFF';
      for (const [x, y, r] of [[30, 34, 17], [56, 27, 23], [84, 34, 17], [44, 37, 15], [72, 39, 15]] as [number, number, number][]) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      this.cloudSprite = canvas;
    }
    return this.cloudSprite;
  }

  // -- every frame ------------------------------------------------------------------------

  private spawn(n: number, star: boolean): void {
    const st = this.stage;
    if (st === null) {
      return;
    }
    const nw = this.navieWidth();
    const gy = this.groundY();
    for (let i = 0; i < n; i += 1) {
      this.puffs.push(
        star
          ? { x: st.x + st.w / 2 + (Math.random() - 0.5) * nw * 0.9, y: gy - nw * (0.5 + Math.random() * 0.5), vx: (Math.random() - 0.5) * 60, vy: -40 - Math.random() * 50, life: 0, max: 0.8, r: 4 + Math.random() * 3, star: true }
          : { x: st.x + st.w / 2 - nw * 0.42, y: gy - nw * 0.08, vx: -40 - Math.random() * 40, vy: -10 - Math.random() * 20, life: 0, max: 0.7, r: 5 + Math.random() * 5, star: false },
      );
    }
  }

  private drawBunting(ctx: Ctx): void {
    const w = this.width;
    const gy = this.groundY();
    const horizon = gy - Math.max(70, Math.min(this.height * 0.15, 150));
    const y0 = horizon - this.height * 0.12;
    const sag = this.height * 0.045;
    const sway = Math.sin(this.t * 1.3) * 2;
    ctx.strokeStyle = 'rgba(16,40,76,0.55)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-4, y0);
    ctx.quadraticCurveTo(w / 2, y0 + sag * 2 + sway, w + 4, y0);
    ctx.stroke();
    const n = 13;
    const bulbs = [new Path2D(), new Path2D()];
    for (let i = 1; i < n; i += 1) {
      const u = i / n;
      const x = -4 + (w + 8) * u;
      const y = (1 - u) * (1 - u) * y0 + 2 * u * (1 - u) * (y0 + sag * 2 + sway) + u * u * y0;
      const flap = Math.sin(this.t * 3 + i * 0.9) * 2.2;
      ctx.fillStyle = FLAG_COLOURS[i % FLAG_COLOURS.length];
      ctx.beginPath();
      ctx.moveTo(x - 6, y);
      ctx.lineTo(x + 6, y);
      ctx.lineTo(x + flap, y + 13);
      ctx.closePath();
      ctx.fill();
      // Fairy lights between the flags, twinkling in two sets.
      const bx = x + (w + 8) / n / 2;
      const by = y + 2;
      bulbs[(i + Math.floor(this.t * 1.6)) % 2].arc(bx, by, 2.4, 0, Math.PI * 2);
      bulbs[(i + Math.floor(this.t * 1.6)) % 2].closePath();
    }
    ctx.fillStyle = 'rgba(255,233,150,1)';
    ctx.fill(bulbs[0]);
    ctx.fillStyle = 'rgba(255,233,150,0.45)';
    ctx.fill(bulbs[1]);
  }

  private drawFlag(ctx: Ctx): void {
    // A chequered flag waving by the start line.
    const gy = this.groundY();
    const x = this.width * 0.1;
    const top = gy - this.height * 0.12;
    ctx.strokeStyle = '#E8EEF5';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x, gy - 6);
    ctx.lineTo(x, top);
    ctx.stroke();
    const fw = 26;
    const fh = 17;
    for (let r = 0; r < 3; r += 1) {
      for (let c = 0; c < 4; c += 1) {
        const wave = (k: number): number => Math.sin(this.t * 4 + k * 1.3) * 2.2 * (k / 4);
        ctx.fillStyle = (r + c) % 2 === 0 ? '#10284C' : '#FFFFFF';
        const x0 = x + (fw / 4) * c;
        const y0 = top + (fh / 3) * r;
        ctx.beginPath();
        ctx.moveTo(x0, y0 + wave(c));
        ctx.lineTo(x0 + fw / 4 + 0.5, y0 + wave(c + 1));
        ctx.lineTo(x0 + fw / 4 + 0.5, y0 + fh / 3 + 0.5 + wave(c + 1));
        ctx.lineTo(x0, y0 + fh / 3 + 0.5 + wave(c));
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  private drawNavie(ctx: Ctx): void {
    const st = this.stage;
    if (st === null || !this.options.hero) {
      return;
    }
    const nw = this.navieWidth();
    const size = nw / 1.256;
    let x = st.x + st.w / 2;
    const gy = this.groundY();
    const t = this.t;
    const calm = this.options.reduceMotion === true;
    /* Resting: facing a little to the right, a slow bounce. */
    let yaw = -35;
    let expr: Expression = 'happy';
    let hop = calm ? 0 : 1.6 + Math.sin(t * 2.6) * 1.6;
    let tilt = 0;
    let squash = 0;
    let lookX = 0;
    /* Every few seconds: an excited little hop (with a rev of puffs) that ends looking at you for a moment. */
    const cycle = t % 7.5;
    if (!calm && cycle > 4.6 && cycle < 5.15) {
      const k = (cycle - 4.6) / 0.55;
      hop += Math.sin(k * Math.PI) * 24;
      tilt = Math.sin(k * Math.PI * 2) * 0.05;
      expr = 'celebrate';
      if (this.lastExcite !== Math.floor(t / 7.5)) {
        this.lastExcite = Math.floor(t / 7.5);
        this.spawn(4, false);
      }
    }
    if (cycle > 4.88 && cycle < 7.05) {
      yaw = -12;
      lookX = 0;
    } else if (!calm && cycle >= 7.05 && cycle < 7.35) {
      hop += Math.sin(((cycle - 7.05) / 0.3) * Math.PI) * 7;
    }
    /* Tapped: a happy hop, looking at you. */
    const poked = t - this.pokeT;
    if (poked < 0.55) {
      hop += calm ? 0 : Math.sin((poked / 0.55) * Math.PI) * 30;
      expr = 'celebrate';
      yaw = -12;
    }
    /* Start Race: crouch, hop, then away to the right. */
    if (this.goT >= 0) {
      const g = t - this.goT;
      expr = 'determined';
      yaw = -35;
      if (g < 0.2) {
        squash = Math.sin((g / 0.2) * Math.PI * 0.5) * 0.9;
        hop = 0;
      } else if (g < 0.5) {
        const k = (g - 0.2) / 0.3;
        hop = Math.sin(k * Math.PI) * 30;
        squash = Math.max(0, 0.9 - k * 3) * 0.9;
        expr = 'celebrate';
      } else {
        const k = g - 0.5;
        yaw = -55;
        hop = 0;
        x += k * k * this.width * 7;
        if (Math.random() < 0.7) {
          this.puffs.push({ x: x - nw * 0.45, y: gy - nw * 0.06, vx: -80 - Math.random() * 60, vy: -15 - Math.random() * 15, life: 0, max: 0.6, r: 6 + Math.random() * 6, star: false });
        }
      }
    }
    ctx.save();
    if (squash > 0) {
      ctx.translate(x, gy);
      ctx.scale(1 + squash * 0.09, 1 - squash * 0.12);
      ctx.translate(-x, -gy);
    }
    drawCharacter(ctx, 'navie', x, gy, size, {
      expr,
      anim: { t, blink: blinkAt(t, 2), talk: 0, lookX, lookY: 0 },
      hop,
      tilt,
      yaw,
    });
    ctx.restore();
  }

  private drawPuffs(ctx: Ctx, dt: number): void {
    if (this.puffs.length === 0) {
      return;
    }
    for (const p of this.puffs) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += (p.star ? 90 : -10) * dt;
      const a = Math.max(0, 1 - p.life / p.max);
      if (p.star) {
        ctx.fillStyle = `rgba(255,214,64,${a.toFixed(2)})`;
        const r = p.r;
        ctx.beginPath();
        for (let i = 0; i < 8; i += 1) {
          const rr = i % 2 === 0 ? r : r * 0.42;
          const ang = (i / 8) * Math.PI * 2 - Math.PI / 2;
          ctx.lineTo(p.x + Math.cos(ang) * rr, p.y + Math.sin(ang) * rr);
        }
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillStyle = `rgba(240,244,250,${(a * 0.8).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (1 + p.life * 1.2), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    this.puffs = this.puffs.filter((p) => p.life < p.max);
  }

  draw(ctx: CanvasRenderingContext2D, _t: number, dt: number): void {
    this.t += dt;
    if (this.warm.length > 0 && this.options.hero) {
      const sprite = art(this.warm[0]);
      if (sprite !== null) {
        ctx.drawImage(sprite.img, 0, 0, 4, 4);
        this.warm.shift();
      }
    }
    ctx.drawImage(this.ensureBackground(), 0, 0, this.width, this.height);
    // Three clouds drifting slowly across the sky.
    const cloud = this.ensureCloud();
    const gy = this.groundY();
    const skyH = gy - Math.max(70, Math.min(this.height * 0.15, 150)) - this.height * 0.2;
    for (let i = 0; i < 3; i += 1) {
      const speed = 6 + i * 3;
      const span = this.width + 160;
      const x = ((this.t * speed + i * span * 0.37 + hash(i) * 200) % span) - 140;
      const y = Math.max(20, skyH * (0.25 + i * 0.28));
      const s = 0.8 + hash(i + 3) * 0.6;
      ctx.drawImage(cloud, x, y, 120 * s, 56 * s);
    }
    this.drawBunting(ctx);
    this.drawFlag(ctx);
    this.drawNavie(ctx);
    this.drawPuffs(ctx, dt);
    if (this.dim > 0) {
      ctx.fillStyle = `rgba(10,22,41,${this.dim})`;
      ctx.fillRect(0, 0, this.width, this.height);
    }
  }

  dispose(): void {
    this.background = null;
    this.cloudSprite = null;
    this.puffs = [];
  }
}
