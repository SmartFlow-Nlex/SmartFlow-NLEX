import type { Expression, MachineId } from '../../core/types';
import { starPath } from './faces';
import { ellipsePath, groundShadow, hgrad, paint, rgba, rgrad, roundRect, shade, vgrad, type Ctx } from './kit';
import { C } from './palette';

/**
 * The Barrikada family, the road's fictional mechanical opponents: road-works
 * machines built out of barrier panels, toll-gate booms for arms, a toll-booth
 * head with one big lens, and a crown of cones. Not car characters and not
 * traffic - the only thing a boss fight's horn pulses can affect. Haring
 * (king) is road-works yellow, Prinsipe (prince) blue, Reyna (queen) royal
 * pink and gold; the same make of machine, so the same fight.
 *
 * Drawn in a 200-unit-tall box like the cast (it is far wider). The three
 * chest gears sit at x = -64, 0, 64; in the finale the renderer scales the
 * machine so they line up with the three lanes.
 */

export const GEAR_X = [-64, 0, 64];
export const GEAR_Y = -92;

export interface GearLook {
  state: 'closed' | 'telegraph' | 'open';
  /** 0-1 progress of the opening. */
  t: number;
  flash: number;
}

interface MachineSkin {
  panel: string;
  stripe: string;
  edge: string;
  boom: string;
  boomEdge: string;
  crownHi: string;
  crown: string;
  crownEdge: string;
}

const SKINS: Record<MachineId, MachineSkin> = {
  barrikada: { panel: C.barrierYellow, stripe: C.barrierBlack, edge: '#6B4A00', boom: C.boomRed, boomEdge: '#5B1210', crownHi: '#FFB06A', crown: C.cone, crownEdge: '#8A3A0A' },
  prinsipe: { panel: '#5FB2FF', stripe: '#123A7A', edge: '#0B2A5A', boom: '#1F6FE0', boomEdge: '#0B2A5A', crownHi: '#FFFFFF', crown: '#9FD2FF', crownEdge: '#123A7A' },
  reyna: { panel: '#F06FA8', stripe: '#5A1450', edge: '#4A0E42', boom: '#9A2BB8', boomEdge: '#4A0E42', crownHi: '#FFF1A8', crown: '#FFC32D', crownEdge: '#8A5A00' },
};

export interface BossDrawOptions {
  /** Which machine (default: Haring Barrikada). */
  skin?: MachineId;
  shadow: boolean;
  gears: GearLook[] | null;
  /** 0-1: smoke and glow of the overheat phase. */
  overheat?: number;
  /** Seconds since last hit (shake). */
  hurtT?: number;
}

function stripes(ctx: Ctx, x: number, y: number, w: number, h: number, a: string, b: string, step = 16): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = a;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = b;
  for (let i = -h; i < w + h; i += step * 2) {
    ctx.beginPath();
    ctx.moveTo(x + i, y + h);
    ctx.lineTo(x + i + step, y + h);
    ctx.lineTo(x + i + step + h, y);
    ctx.lineTo(x + i + h, y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function gear(ctx: Ctx, x: number, y: number, r: number, look: GearLook, t: number): void {
  // Slot ring.
  ellipsePath(ctx, x, y, r + 7, r + 7);
  ctx.fillStyle = '#2B323E';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#11151C';
  ctx.stroke();
  const open = look.state === 'open' ? 1 : look.state === 'telegraph' ? Math.min(1, look.t / 0.9) : 0;
  // The gear itself: glowing orange when exposed.
  if (open > 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t * (look.state === 'open' ? 2.4 : 0.8));
    const teeth = 10;
    ctx.beginPath();
    for (let i = 0; i < teeth * 2; i += 1) {
      const a = (Math.PI * i) / teeth;
      const rr = i % 2 === 0 ? r : r * 0.78;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = rgrad(ctx, 0, 0, 0, r, [
      [0, '#FFF3B0'],
      [0.5, '#FFB13B'],
      [1, '#E2621B'],
    ]);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#8A3A0A';
    ctx.stroke();
    ellipsePath(ctx, 0, 0, r * 0.3, r * 0.3);
    ctx.fillStyle = '#8A3A0A';
    ctx.fill();
    ctx.restore();
    if (look.flash > 0) {
      ellipsePath(ctx, x, y, r * 1.2, r * 1.2);
      ctx.fillStyle = `rgba(255,255,255,${look.flash * 2.4})`;
      ctx.fill();
    }
  }
  // Shutter halves slide apart as it opens (closed = steel plate with an X bolt).
  if (open < 1) {
    ctx.save();
    ellipsePath(ctx, x, y, r + 1, r + 1);
    ctx.clip();
    const gap = open * r;
    for (const side of [-1, 1]) {
      ctx.fillStyle = hgrad(ctx, x - r, x + r, [
        [0, shade(C.steel, 0.2)],
        [1, shade(C.steel, -0.25)],
      ]);
      ctx.fillRect(side < 0 ? x - r - 1 - gap : x + gap, y - r - 1, r + 1, r * 2 + 2);
    }
    if (open === 0) {
      ctx.strokeStyle = C.steelDark;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - r * 0.45, y - r * 0.45);
      ctx.lineTo(x + r * 0.45, y + r * 0.45);
      ctx.moveTo(x + r * 0.45, y - r * 0.45);
      ctx.lineTo(x - r * 0.45, y + r * 0.45);
      ctx.stroke();
    }
    ctx.restore();
  }
  // Telegraph / open ring: a steady pulsing ring, never a flash.
  if (look.state !== 'closed') {
    const pulse = 0.5 + 0.5 * Math.sin(t * 6);
    ctx.lineWidth = look.state === 'open' ? 4 : 3;
    ctx.strokeStyle = look.state === 'open' ? `rgba(255,236,120,${0.7 + 0.3 * pulse})` : `rgba(255,236,120,${0.35 + 0.3 * pulse})`;
    ellipsePath(ctx, x, y, r + 11 + pulse * 3, r + 11 + pulse * 3);
    ctx.stroke();
  }
}

export function drawBarrikada(ctx: Ctx, expr: Expression, t: number, options: BossDrawOptions): void {
  const look = SKINS[options.skin ?? 'barrikada'];
  const shake = options.hurtT !== undefined && options.hurtT < 0.25 ? Math.sin(t * 90) * 3 * (1 - options.hurtT / 0.25) : 0;
  ctx.save();
  ctx.translate(shake, 0);
  if (options.shadow) {
    groundShadow(ctx, 0, -2, 175, 16, 0.35);
  }
  // Tracks.
  for (const side of [-1, 1]) {
    roundRect(ctx, side < 0 ? -158 : 86, -42, 72, 42, 18);
    ctx.fillStyle = vgrad(ctx, -42, 0, [
      [0, '#3A4252'],
      [1, '#141821'],
    ]);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#0B0E14';
    ctx.stroke();
    for (let i = 0; i < 3; i += 1) {
      ellipsePath(ctx, (side < 0 ? -140 : 104) + i * 18, -20, 7, 7);
      ctx.fillStyle = '#5D6878';
      ctx.fill();
    }
  }
  // Boom arms (toll gates) - raised and lowered with a slow swing.
  for (const side of [-1, 1]) {
    const swing = Math.sin(t * 1.3 + side) * 0.12 + (expr === 'happy' ? -0.35 : 0);
    ctx.save();
    ctx.translate(side * 118, -150);
    ctx.rotate(side * (-0.45 + swing));
    const reach = 70;
    roundRect(ctx, side < 0 ? -reach : 0, -8, reach, 16, 8);
    ctx.save();
    ctx.clip();
    stripes(ctx, side < 0 ? -reach : 0, -8, reach, 16, '#FFFFFF', look.boom, 12);
    ctx.restore();
    roundRect(ctx, side < 0 ? -reach : 0, -8, reach, 16, 8);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = look.boomEdge;
    ctx.stroke();
    // A round stop sign at the tip.
    ellipsePath(ctx, side * reach, 0, 13, 13);
    ctx.fillStyle = look.boom;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#FFFFFF';
    ctx.stroke();
    ctx.restore();
    ellipsePath(ctx, side * 118, -150, 14, 14);
    paint(ctx, C.steel, -164, -136, C.steelDark, 2.5);
  }
  // Torso of barrier panels.
  roundRect(ctx, -124, -184, 248, 146, 16);
  paint(ctx, look.panel, -184, -38, look.edge, 3.5);
  ctx.save();
  roundRect(ctx, -124, -184, 248, 146, 16);
  ctx.clip();
  stripes(ctx, -124, -184, 248, 26, look.panel, look.stripe, 18);
  stripes(ctx, -124, -64, 248, 26, look.panel, look.stripe, 18);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(-124, -158, 248, 2);
  ctx.fillRect(-124, -66, 248, 2);
  ctx.restore();
  // Rivets.
  ctx.fillStyle = shade(look.panel, -0.35);
  for (const x of [-112, -40, 40, 112]) {
    for (const y of [-150, -74]) {
      ellipsePath(ctx, x, y, 3, 3);
      ctx.fill();
    }
  }
  // Chest gears.
  const looks: GearLook[] = options.gears ?? GEAR_X.map(() => ({ state: 'closed' as const, t: 0, flash: 0 }));
  GEAR_X.forEach((x, i) => gear(ctx, x, GEAR_Y, 22, looks[i], t + i));

  // Head: toll booth with a big lens.
  roundRect(ctx, -54, -238, 108, 58, 10);
  paint(ctx, '#E9EEF4', -238, -180, '#4C5868', 3);
  ctx.beginPath();
  ctx.moveTo(-64, -236);
  ctx.lineTo(0, -262);
  ctx.lineTo(64, -236);
  ctx.closePath();
  paint(ctx, look.boom, -262, -236, look.boomEdge, 3);
  // Crown of cones.
  for (const [x, h] of [[-44, 22], [-22, 28], [0, 34], [22, 28], [44, 22]] as [number, number][]) {
    const base = -248 + Math.abs(x) * 0.4;
    ctx.beginPath();
    ctx.moveTo(x - 9, base);
    ctx.lineTo(x, base - h);
    ctx.lineTo(x + 9, base);
    ctx.closePath();
    ctx.fillStyle = vgrad(ctx, base - h, base, [
      [0, look.crownHi],
      [1, look.crown],
    ]);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = look.crownEdge;
    ctx.stroke();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(x - 5, base - h * 0.55, 10, 4);
  }
  // The lens eye.
  const calm = expr === 'happy' || expr === 'worried';
  const lens = calm ? C.lensCalm : C.lens;
  const open = expr === 'surprised' ? 1.15 : expr === 'determined' ? 0.92 : 1;
  ellipsePath(ctx, 0, -209, 22 * open, 22 * open);
  ctx.fillStyle = '#1B202A';
  ctx.fill();
  ellipsePath(ctx, 0, -209, 17 * open, 17 * open);
  ctx.fillStyle = rgrad(ctx, 0, -209, 0, 17 * open, [
    [0, '#FFFFFF'],
    [0.3, shade(lens, 0.3)],
    [1, shade(lens, -0.3)],
  ], -5, -215);
  ctx.fill();
  if (expr === 'happy') {
    // Calm smile glow inside the lens.
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, -212, 9, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();
  }
  if (expr === 'hurt' || (options.hurtT !== undefined && options.hurtT < 0.2)) {
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.5;
    for (let i = -2; i <= 2; i += 1) {
      ctx.beginPath();
      ctx.moveTo(-14, -209 + i * 5);
      ctx.lineTo(14, -209 + i * 5 + ((i * 7) % 3));
      ctx.stroke();
    }
  }
  // Brow plate: angled down for "determined", up for worried.
  const tilt = expr === 'determined' ? 0.32 : expr === 'worried' ? -0.25 : expr === 'surprised' ? -0.05 : 0;
  const lift = expr === 'surprised' ? -6 : 0;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * 14, -234 + lift);
    ctx.rotate(side * tilt);
    roundRect(ctx, -16, -4, 32, 8, 3);
    ctx.fillStyle = C.steelDark;
    ctx.fill();
    ctx.restore();
  }
  // Overheat smoke and glow.
  const heat = options.overheat ?? 0;
  if (heat > 0) {
    for (let i = 0; i < 5; i += 1) {
      const k = (t * 0.6 + i / 5) % 1;
      const x = (i - 2) * 30 + Math.sin(t + i) * 8;
      const y = -190 - k * 90;
      ellipsePath(ctx, x, y, 14 + k * 20, 12 + k * 16);
      ctx.fillStyle = `rgba(120,120,130,${0.35 * heat * (1 - k)})`;
      ctx.fill();
    }
    roundRect(ctx, -124, -184, 248, 146, 16);
    ctx.fillStyle = `rgba(255,90,40,${0.12 * heat})`;
    ctx.fill();
  }
  if (expr === 'celebrate') {
    for (const [x, y] of [[-140, -230], [140, -220]]) {
      starPath(ctx, x, y, 10, 4, 0.3);
      ctx.fillStyle = C.yellow;
      ctx.fill();
    }
  }
  ctx.restore();
  void rgba;
}
