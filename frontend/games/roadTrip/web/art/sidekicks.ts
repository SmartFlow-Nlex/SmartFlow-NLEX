import type { Expression, SidekickId } from '../../core/types';
import { drawCheeks, drawExtras, drawEyes, drawMouth, EXPR, starPath, type FaceAnim, type FaceStyle } from './faces';
import { ellipsePath, groundShadow, hgrad, paint, rgba, rgrad, roundRect, shade, sheen, vgrad, type Ctx } from './kit';
import { C } from './palette';

/**
 * The collectible sidekicks: small hovering vehicle-creatures that fly
 * beside the hero. They share the cast's face construction (faces.ts) and
 * body finish (soft paint() gradients, a sheen, dark outlines), but each has
 * its own silhouette so they can be told apart at 40-70 px:
 *
 *   Pip      tricycle drone   - asymmetric: roof canopy, handlebar + mirror right, horn bell left
 *   Bumbo    mini bus-bot     - wide pill body, big round horn-dish on the roof
 *   Mila     scooter          - tall and narrow, cradled by a horseshoe magnet with white tips
 *   Kumpuni  repair kart      - low and wide, toolbox on top, wrench arm to the right
 *   Bantay   bulldog patrol   - square head, folded ears, wide silver jowls, siren dome
 *   Silip    camera drone     - round ball, two rotor arms, periscope lens on top
 *   Walis    street sweeper   - low kart on two spinning brushes, a broom raised behind
 *   Barya    flying toll coin - a ridged round coin with little wings and a slot on top
 *   Sibat    dart jet         - tall thin dart, nose up, swept fins
 *   Tala     parol star       - a five-point lantern with tassels, glowing
 *   Ilaw     traffic light    - a T shape: three hooded lamps across the top
 *   Maso     mallet           - a wide hammer head on a short wrapped handle
 *
 * They face the camera (faces show in gameplay too) and hover: jets, glow
 * pads or rotors underneath, never wheels on the ground. Evolved forms add
 * parts and one extra colour accent so they differ at a glance.
 *
 * Units: origin at the ground point under the sidekick, y up is negative;
 * the body floats between roughly y -40 and -175 and everything stays inside
 * SIDEKICK_BOX at scale 1. Outlines are a little heavier than the cast's
 * (4 units) because these are shown smaller.
 */

export interface SidekickPose {
  expr: Expression;
  /** Seconds, for idle motion (bob, propellers, blinking handled by blink). */
  t: number;
  /** 0 open .. 1 closed. */
  blink: number;
  /** 0 closed .. 1 open (speaking). */
  talk: number;
  /** -1..1 where it looks. */
  lookX: number;
  evolved: boolean;
  /** 0..1: its action flash (a shot, a repair, a shield), drawn as a brief glow/pose on the creature itself. */
  action: number;
}

/** Drawing box at scale 1, relative to the origin: [left, top, right, bottom]. */
export const SIDEKICK_BOX: [number, number, number, number] = [-100, -190, 100, 20];

export const SIDEKICK_COLOURS: Record<SidekickId, { body: string; accent: string }> = {
  pip: { body: '#4FB6FF', accent: '#FFC32D' },
  bumbo: { body: '#FF8A1F', accent: '#7B4BD6' },
  mila: { body: '#FF7DB8', accent: '#1FB8A8' },
  kumpuni: { body: '#3DBB5C', accent: '#FF8A1F' },
  bantay: { body: '#2A4A86', accent: '#C9D3DE' },
  silip: { body: '#9BE03C', accent: '#FFFFFF' },
  walis: { body: '#20B6C7', accent: '#FFD23F' },
  barya: { body: '#FFC83D', accent: '#A86A00' },
  sibat: { body: '#E8485A', accent: '#FFFFFF' },
  tala: { body: '#FFE3A8', accent: '#E8408A' },
  ilaw: { body: '#39424F', accent: '#FFC32D' },
  maso: { body: '#C9743A', accent: '#6B7686' },
};

const OUT = 4;
const STEEL = '#8A97A8';
const STEEL_DARK = '#4C5868';

/** Flame colours for the little jets: [core, outer]. */
const BLUE_FLAME: [string, string] = ['#FFFFFF', '#6FD0FF'];
const HOT_FLAME: [string, string] = ['#FFF4C2', '#FF6A2A'];

// -- shared bits -----------------------------------------------------------------

function face(over: Partial<FaceStyle> & Pick<FaceStyle, 'eyeGap' | 'eyeY' | 'cheekX' | 'cheekY' | 'mouthY' | 'outline'>): FaceStyle {
  return {
    eyeRx: 15,
    eyeRy: 18,
    iris: C.navieIris,
    irisDark: '#1F5FBF',
    lashes: false,
    browColor: over.outline,
    browWidth: 3.6,
    browRise: 3,
    browLength: 16,
    skin: '#FBFDFF',
    cheekR: 6.5,
    mouthX: 0,
    mouthW: 20,
    ...over,
  };
}

/** The pale windscreen-like face panel every sidekick wears (fills the current path). */
function facePanel(ctx: Ctx, top: number, bottom: number, outline: string, tint = '#DCEBFF'): void {
  ctx.fillStyle = vgrad(ctx, top, bottom, [
    [0, '#FFFFFF'],
    [0.7, '#F7FBFF'],
    [1, tint],
  ]);
  ctx.fill();
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = rgba(outline, 0.6);
  ctx.stroke();
}

function drawFace(ctx: Ctx, s: FaceStyle, x: number, expr: Expression, anim: FaceAnim, mouth = true): void {
  ctx.save();
  ctx.translate(x, 0);
  drawCheeks(ctx, s, expr);
  drawEyes(ctx, s, expr, anim);
  if (mouth) {
    drawMouth(ctx, s, expr, anim);
  }
  ctx.restore();
}

/** A polygon with rounded corners as the current path. */
function roundPoly(ctx: Ctx, pts: [number, number][], r: number): void {
  const n = pts.length;
  ctx.beginPath();
  const mid = (i: number): [number, number] => {
    const [ax, ay] = pts[i % n];
    const [bx, by] = pts[(i + 1) % n];
    return [(ax + bx) / 2, (ay + by) / 2];
  };
  const [sx, sy] = mid(n - 1);
  ctx.moveTo(sx, sy);
  for (let i = 0; i < n; i += 1) {
    const [px, py] = pts[i];
    const [mx, my] = mid(i);
    ctx.arcTo(px, py, mx, my, r);
  }
  ctx.closePath();
}

/** Stroke the current path as a body outline. */
function outline(ctx: Ctx, colour: string, width = OUT): void {
  ctx.lineWidth = width;
  ctx.strokeStyle = colour;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

/** A small round lamp (headlight, beacon). */
function lamp(ctx: Ctx, x: number, y: number, r: number, core: string, rim: string, glow = 0.35): void {
  ctx.fillStyle = rgrad(ctx, x, y, 0, r * 1.9, [
    [0, rgba(core, glow)],
    [1, rgba(core, 0)],
  ]);
  ellipsePath(ctx, x, y, r * 1.9, r * 1.9);
  ctx.fill();
  ellipsePath(ctx, x, y, r, r);
  ctx.fillStyle = rgrad(ctx, x, y, 0, r, [
    [0, '#FFFFFF'],
    [0.55, core],
    [1, shade(core, -0.25)],
  ], x - r * 0.3, y - r * 0.35);
  ctx.fill();
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = rim;
  ctx.stroke();
  ellipsePath(ctx, x - r * 0.32, y - r * 0.34, r * 0.26, r * 0.2);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
}

/** A downward jet nozzle with a flickering flame under it. `y` is the nozzle's bottom. */
function jet(ctx: Ctx, x: number, y: number, w: number, t: number, flame: [string, string], phase: number, power = 1): void {
  const len = (15 + Math.sin(t * 31 + phase) * 2.5 + Math.sin(t * 17 + phase * 2) * 1.5) * power;
  ctx.fillStyle = rgrad(ctx, x, y + len * 0.5, 0, w * 1.1 + len * 0.4, [
    [0, rgba(flame[1], 0.35)],
    [1, rgba(flame[1], 0)],
  ]);
  ellipsePath(ctx, x, y + len * 0.5, w * 1.1 + len * 0.3, len * 0.8);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - w * 0.4, y);
  ctx.quadraticCurveTo(x - w * 0.34, y + len * 0.6, x, y + len);
  ctx.quadraticCurveTo(x + w * 0.34, y + len * 0.6, x + w * 0.4, y);
  ctx.closePath();
  ctx.fillStyle = vgrad(ctx, y, y + len, [
    [0, flame[0]],
    [0.45, rgba(flame[1], 0.95)],
    [1, rgba(flame[1], 0)],
  ]);
  ctx.fill();
  roundRect(ctx, x - w / 2, y - 9, w, 10, [3, 3, 6, 6]);
  ctx.fillStyle = vgrad(ctx, y - 9, y + 1, [
    [0, '#D5DDE7'],
    [1, STEEL_DARK],
  ]);
  ctx.fill();
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = '#2B3442';
  ctx.stroke();
}

/** A glowing hover pad: flat disc with soft light under it. */
function hoverPad(ctx: Ctx, x: number, y: number, rx: number, glow: string, t: number, phase: number, rim = STEEL_DARK): void {
  const k = 0.8 + 0.2 * Math.sin(t * 6 + phase);
  ctx.fillStyle = vgrad(ctx, y, y + 26, [
    [0, rgba(glow, 0.45 * k)],
    [1, rgba(glow, 0)],
  ]);
  ctx.beginPath();
  ctx.moveTo(x - rx * 0.85, y);
  ctx.lineTo(x + rx * 0.85, y);
  ctx.lineTo(x + rx * 0.55, y + 26);
  ctx.lineTo(x - rx * 0.55, y + 26);
  ctx.closePath();
  ctx.fill();
  ellipsePath(ctx, x, y, rx, rx * 0.3);
  ctx.fillStyle = vgrad(ctx, y - rx * 0.3, y + rx * 0.3, [
    [0, '#9AA6B6'],
    [1, '#2E3644'],
  ]);
  ctx.fill();
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = rim;
  ctx.stroke();
  ellipsePath(ctx, x, y + rx * 0.06, rx * 0.68, rx * 0.16);
  ctx.fillStyle = rgrad(ctx, x, y + rx * 0.06, 0, rx * 0.7, [
    [0, '#FFFFFF'],
    [0.5, rgba(glow, 0.95 * k)],
    [1, rgba(glow, 0.2)],
  ]);
  ctx.fill();
}

/** A radial action flash: soft glow and a four/eight point star. */
function burst(ctx: Ctx, x: number, y: number, r: number, a: number, colour: string): void {
  if (a <= 0.01) {
    return;
  }
  ctx.save();
  ctx.fillStyle = rgrad(ctx, x, y, 0, r, [
    [0, `rgba(255,255,255,${0.95 * a})`],
    [0.4, rgba(colour, 0.7 * a)],
    [1, rgba(colour, 0)],
  ]);
  ellipsePath(ctx, x, y, r, r);
  ctx.fill();
  ctx.globalAlpha = Math.min(1, a * 1.4);
  starPath(ctx, x, y, r * 0.85, 4, 0.22);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.translate(x, y);
  ctx.rotate(Math.PI / 4);
  starPath(ctx, 0, 0, r * 0.5, 4, 0.3);
  ctx.fillStyle = colour;
  ctx.fill();
  ctx.restore();
}

function sparkle(ctx: Ctx, x: number, y: number, r: number, colour: string): void {
  starPath(ctx, x, y, r, 4, 0.3);
  ctx.fillStyle = colour;
  ctx.fill();
}

/** A jagged electric arc between two points. */
function zap(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, t: number, seed: number, colour: string, width = 3): void {
  const n = 5;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  for (let i = 1; i < n; i += 1) {
    const k = i / n;
    const jitter = Math.sin(t * 40 + seed * 7 + i * 2.3) * 6;
    const nx = -(y1 - y0);
    const ny = x1 - x0;
    const len = Math.hypot(nx, ny) || 1;
    ctx.lineTo(x0 + (x1 - x0) * k + (nx / len) * jitter, y0 + (y1 - y0) * k + (ny / len) * jitter);
  }
  ctx.lineTo(x1, y1);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = width + 3;
  ctx.strokeStyle = rgba(colour, 0.35);
  ctx.stroke();
  ctx.lineWidth = width;
  ctx.strokeStyle = '#FFFFFF';
  ctx.stroke();
}

// -- Pip: tricycle drone ------------------------------------------------------------

const PIP_O = '#16508F';
const PIP_FACE = face({
  eyeGap: 21, eyeY: -122, eyeRx: 14.5, eyeRy: 17, cheekX: 37, cheekY: -106, cheekR: 6, mouthY: -82, mouthW: 18,
  outline: PIP_O, browColor: '#1F5FBF',
});

function hornBell(ctx: Ctx, x: number, y: number, r: number, rim: string, o: string): void {
  ellipsePath(ctx, x, y, r, r);
  ctx.fillStyle = rgrad(ctx, x, y, 0, r, [
    [0, '#2B2F38'],
    [0.55, '#5A4A2A'],
    [0.7, shade(rim, -0.2)],
    [1, shade(rim, 0.3)],
  ]);
  ctx.fill();
  outline(ctx, o, 3);
  ellipsePath(ctx, x, y, r * 0.62, r * 0.62);
  ctx.lineWidth = 2;
  ctx.strokeStyle = rgba(rim, 0.9);
  ctx.stroke();
  ellipsePath(ctx, x - r * 0.42, y - r * 0.5, r * 0.28, r * 0.16);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fill();
}

function flameDecal(ctx: Ctx, x: number, y: number, dir: 1 | -1): void {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + dir * 10, y - 12, x + dir * 6, y - 22);
  ctx.quadraticCurveTo(x + dir * 16, y - 12, x + dir * 18, y - 16);
  ctx.quadraticCurveTo(x + dir * 22, y - 6, x + dir * 28, y - 14);
  ctx.quadraticCurveTo(x + dir * 32, y - 4, x + dir * 38, y);
  ctx.closePath();
  ctx.fillStyle = vgrad(ctx, y - 22, y, [
    [0, '#FFD34D'],
    [1, '#FF5A2A'],
  ]);
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = '#B83A10';
  ctx.stroke();
}

function drawPip(ctx: Ctx, p: SidekickPose, anim: FaceAnim): void {
  const o = PIP_O;
  const body = SIDEKICK_COLOURS.pip.body;
  const ev = p.evolved;
  const flame = ev ? HOT_FLAME : BLUE_FLAME;
  const t = p.t;
  const fx = -14;

  // Evolved: a V of swept tail fins rising from the roof.
  if (ev) {
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(fx + side * 22, -160);
      ctx.rotate(side * 0.62);
      ctx.beginPath();
      ctx.moveTo(-10, 2);
      ctx.lineTo(-5, -19);
      ctx.quadraticCurveTo(1, -25, 7, -19);
      ctx.lineTo(10, 2);
      ctx.closePath();
      paint(ctx, '#FF6A2A', -25, 2, '#8E2A08', 3);
      ctx.beginPath();
      ctx.moveTo(0, -2);
      ctx.lineTo(1, -17);
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.strokeStyle = C.yellow;
      ctx.stroke();
      ctx.restore();
    }
  }

  jet(ctx, -42, -52, 20, t, flame, 0, ev ? 1.25 : 1);
  jet(ctx, 14, -52, 20, t, flame, 1.7, ev ? 1.25 : 1);
  jet(ctx, 63, -54, 16, t, flame, 3.1, 0.8);

  // The motorbike half: fork, handlebar with its grip, mirror, mudguard, big headlight.
  ctx.strokeStyle = STEEL_DARK;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(58, -134);
  ctx.quadraticCurveTo(72, -146, 86, -144);
  ctx.moveTo(78, -144);
  ctx.lineTo(82, -160);
  ctx.stroke();
  roundRect(ctx, 80, -150, 11, 11, 4);
  ctx.fillStyle = '#2B2F38';
  ctx.fill();
  ellipsePath(ctx, 83, -165, 6, 7);
  ctx.fillStyle = vgrad(ctx, -172, -158, [
    [0, '#CFE6FF'],
    [1, '#7FB3F0'],
  ]);
  ctx.fill();
  outline(ctx, o, 2.6);
  roundRect(ctx, 54, -138, 18, 80, 9);
  paint(ctx, shade(body, -0.1), -138, -58, o, OUT);
  ctx.beginPath();
  ctx.moveTo(48, -60);
  ctx.quadraticCurveTo(63, -80, 78, -60);
  ctx.lineTo(78, -55);
  ctx.lineTo(48, -55);
  ctx.closePath();
  paint(ctx, C.yellow, -80, -55, o, 3);
  ellipsePath(ctx, 63, -116, 15, 15);
  paint(ctx, body, -131, -101, o, 3);
  lamp(ctx, 63, -116, 10.5, '#E6F5FF', 'rgba(20,62,142,0.8)');

  // Horn barrel(s) on the left of the sidecar.
  const bells = ev ? [-128, -104] : [-116];
  ctx.strokeStyle = STEEL_DARK;
  ctx.lineWidth = 6;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  for (const by of bells) {
    ctx.moveTo(-70, by);
    ctx.lineTo(-84, by);
  }
  ctx.stroke();

  // Roof posts and the open cabin front (the face).
  for (const px of [-74, 34]) {
    roundRect(ctx, px, -150, 11, 50, 4);
    paint(ctx, body, -150, -100, o, 3);
  }
  roundRect(ctx, -65, -147, 102, 46, 12);
  facePanel(ctx, -147, -101, o);

  // Sidecar tub: a rounded bowl under the cabin.
  const tub = (): void => {
    ctx.beginPath();
    ctx.moveTo(-78, -104);
    ctx.lineTo(50, -104);
    ctx.bezierCurveTo(54, -72, 36, -52, fx, -52);
    ctx.bezierCurveTo(-64, -52, -82, -72, -78, -104);
    ctx.closePath();
  };
  tub();
  paint(ctx, body, -104, -52, null);
  ctx.save();
  tub();
  ctx.clip();
  ctx.fillStyle = C.yellow;
  ctx.fillRect(-80, -97, 132, 6);
  if (ev) {
    flameDecal(ctx, -78, -54, 1);
    flameDecal(ctx, 50, -54, -1);
  }
  sheen(ctx, -50, -90, 26, 14, 0.3);
  ctx.restore();
  tub();
  outline(ctx, o);
  roundRect(ctx, -82, -109, 136, 9, 4.5);
  paint(ctx, shade(body, 0.15), -109, -100, o, 3);
  drawFace(ctx, PIP_FACE, fx, p.expr, anim);

  // Canopy roof with its lip.
  const roof = (): void => {
    ctx.beginPath();
    ctx.moveTo(-88, -144);
    ctx.bezierCurveTo(-90, -160, -78, -168, -60, -168);
    ctx.lineTo(32, -168);
    ctx.bezierCurveTo(50, -168, 62, -160, 60, -144);
    ctx.quadraticCurveTo(fx, -152, -88, -144);
    ctx.closePath();
  };
  roof();
  paint(ctx, C.yellow, -168, -144, o, OUT);
  ctx.save();
  roof();
  sheen(ctx, -52, -164, 40, 6, 0.55);
  ctx.restore();
  ctx.beginPath();
  ctx.moveTo(-82, -148.5);
  ctx.quadraticCurveTo(fx, -156, 54, -148.5);
  ctx.lineWidth = 3;
  ctx.strokeStyle = ev ? '#FF6A2A' : shade(body, -0.05);
  ctx.stroke();

  for (const by of bells) {
    hornBell(ctx, -84, by, ev ? 10 : 11.5, ev ? '#FF8A3A' : C.yellow, o);
  }
  for (const by of bells) {
    burst(ctx, -84, by, 15, p.action, C.yellow);
  }
}

// -- Bumbo: mini bus-bot ----------------------------------------------------------------

const BUMBO_O = '#8E3A00';
const BUMBO_FACE = face({
  eyeGap: 30, eyeY: -98, eyeRx: 16, eyeRy: 18.5, cheekX: 54, cheekY: -80, cheekR: 7.5, mouthY: -60, mouthW: 24,
  outline: BUMBO_O, browColor: '#6B2E00', browLength: 17, iris: '#8A62E8', irisDark: '#4A2A9E',
});
const ZAP = '#7FEFFF';

function drawBumbo(ctx: Ctx, p: SidekickPose, anim: FaceAnim): void {
  const o = BUMBO_O;
  const body = SIDEKICK_COLOURS.bumbo.body;
  const purple = SIDEKICK_COLOURS.bumbo.accent;
  const ev = p.evolved;
  const t = p.t;
  const a = p.action;

  // Big hover ring under the belly.
  hoverPad(ctx, 0, -38, 46, ev ? ZAP : '#B89BFF', t, 0, '#3A2470');

  // Tesla coils (evolved) stand behind the dish.
  if (ev) {
    for (const side of [-1, 1]) {
      const cx = side * 48;
      ctx.fillStyle = '#3A2470';
      ctx.fillRect(cx - 3, -162, 6, 30);
      for (let i = 0; i < 4; i += 1) {
        ellipsePath(ctx, cx, -140 - i * 6, 9 - i, 3);
        ctx.fillStyle = i % 2 === 0 ? '#E8B04A' : '#B87A20';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#6B4200';
        ctx.stroke();
      }
      ellipsePath(ctx, cx, -166, 7, 7);
      ctx.fillStyle = rgrad(ctx, cx, -166, 0, 7, [
        [0, '#FFFFFF'],
        [0.6, ZAP],
        [1, '#1FA6C9'],
      ], cx - 2, -168);
      ctx.fill();
      outline(ctx, '#0F5C75', 2.4);
    }
  }

  // Roof cap and the horn-dish (a loudspeaker bell facing forward) on its neck.
  roundRect(ctx, -62, -146, 124, 24, 10);
  paint(ctx, purple, -146, -122, '#2E1A66', OUT);
  ctx.fillStyle = '#2E1A66';
  ctx.fillRect(-7, -148, 14, 10);
  const dishY = -154;
  const dishR = (ev ? 22 : 25) * (1 + a * 0.06);
  ellipsePath(ctx, 0, dishY, dishR, dishR);
  paint(ctx, purple, dishY - dishR, dishY + dishR, '#2E1A66', OUT);
  ellipsePath(ctx, 0, dishY, dishR * 0.8, dishR * 0.8);
  ctx.fillStyle = rgrad(ctx, 0, dishY, 0, dishR * 0.8, [
    [0, '#7A4A1A'],
    [0.35, '#C9792A'],
    [0.8, '#FFD6A0'],
    [1, '#FFF3D6'],
  ]);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#8E3A00';
  ctx.stroke();
  // Ridges of the bell.
  ellipsePath(ctx, 0, dishY, dishR * 0.56, dishR * 0.56);
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = 'rgba(142,58,0,0.6)';
  ctx.stroke();
  ellipsePath(ctx, 0, dishY, dishR * 0.28, dishR * 0.28);
  ctx.fillStyle = rgrad(ctx, 0, dishY, 0, dishR * 0.28, [
    [0, '#FFFFFF'],
    [0.5, ev ? ZAP : C.yellow],
    [1, ev ? '#1FA6C9' : '#C98A00'],
  ]);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = ev ? '#0F5C75' : '#8A5A00';
  ctx.stroke();
  ellipsePath(ctx, -dishR * 0.42, dishY - dishR * 0.55, dishR * 0.24, dishR * 0.12);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fill();

  // Chubby bus body.
  roundRect(ctx, -86, -132, 172, 90, 38);
  paint(ctx, body, -132, -42, o, OUT);
  ctx.save();
  roundRect(ctx, -86, -132, 172, 90, 38);
  ctx.clip();
  ctx.fillStyle = vgrad(ctx, -54, -42, [
    [0, shade(purple, 0.1)],
    [1, shade(purple, -0.25)],
  ]);
  ctx.fillRect(-86, -54, 172, 12);
  if (ev) {
    ctx.fillStyle = ZAP;
    ctx.fillRect(-86, -57, 172, 3);
  }
  sheen(ctx, -44, -124, 44, 14, 0.3);
  ctx.restore();
  roundRect(ctx, -86, -132, 172, 90, 38);
  outline(ctx, o);
  // Little side windows on the bus flanks.
  for (const side of [-1, 1]) {
    roundRect(ctx, side < 0 ? -84 : 76, -112, 8, 26, 4);
    ctx.fillStyle = 'rgba(30,58,102,0.55)';
    ctx.fill();
  }

  roundRect(ctx, -70, -122, 140, 48, 20);
  facePanel(ctx, -122, -74, o, '#FFE6CC');
  drawFace(ctx, BUMBO_FACE, 0, p.expr, anim);
  lamp(ctx, -64, -60, 8.5, '#FFF6D6', '#8E3A00');
  lamp(ctx, 64, -60, 8.5, '#FFF6D6', '#8E3A00');

  // Zaps: arcs from the coils (evolved), sound waves from the dish (action).
  if (ev) {
    zap(ctx, -48, -166, -dishR + 2, dishY - 6, t, 1, ZAP, 2.2);
    zap(ctx, 48, -166, dishR - 2, dishY - 6, t, 2, ZAP, 2.2);
  }
  if (a > 0.01) {
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 0; i < 2; i += 1) {
      const r = dishR + 6 + i * 8 + a * 3;
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = rgba(ev ? ZAP : C.yellow, a * (1 - i * 0.35));
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(0, dishY, r, r * 0.8, 0, side < 0 ? Math.PI * 0.8 : -Math.PI * 0.2, side < 0 ? Math.PI * 1.2 : Math.PI * 0.2);
        ctx.stroke();
      }
    }
    ctx.restore();
    burst(ctx, 0, dishY, dishR * 0.9, a, ev ? ZAP : C.yellow);
    if (ev) {
      zap(ctx, -48, -166, -82, -146, t, 3, ZAP, 2.4 * a);
      zap(ctx, 48, -166, 82, -146, t, 4, ZAP, 2.4 * a);
    }
  }
}

// -- Mila: magnet scooter ----------------------------------------------------------------

const MILA_O = '#A3245E';
const MILA_FACE = face({
  eyeGap: 19, eyeY: -116, eyeRx: 14, eyeRy: 17, cheekX: 32, cheekY: -99, cheekR: 6, mouthY: -73, mouthW: 16,
  outline: MILA_O, browColor: '#B03A72', browWidth: 3, browLength: 13, lashes: true, iris: '#2EC2B0', irisDark: '#0F6E64',
});

function magnetU(ctx: Ctx, r: number, cy: number, top: number, w: number, colour: string, tip: string, o: string): void {
  const path = (): void => {
    ctx.beginPath();
    ctx.moveTo(-r, top);
    ctx.lineTo(-r, cy);
    ctx.arc(0, cy, r, Math.PI, 0, true);
    ctx.lineTo(r, top);
  };
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';
  path();
  ctx.lineWidth = w + OUT * 2;
  ctx.strokeStyle = o;
  ctx.stroke();
  path();
  ctx.lineWidth = w;
  ctx.strokeStyle = hgrad(ctx, -r - w / 2, r + w / 2, [
    [0, shade(colour, 0.3)],
    [0.2, colour],
    [0.5, shade(colour, -0.15)],
    [0.8, colour],
    [1, shade(colour, -0.3)],
  ]);
  ctx.stroke();
  // Tips.
  for (const side of [-1, 1]) {
    ctx.fillStyle = hgrad(ctx, side * r - w / 2, side * r + w / 2, [
      [0, '#FFFFFF'],
      [1, shade(tip, -0.2)],
    ]);
    ctx.fillRect(side * r - w / 2, top, w, 14);
    ctx.lineWidth = OUT;
    ctx.strokeStyle = o;
    ctx.strokeRect(side * r - w / 2, top, w, 14);
  }
  // Highlight along the left arm.
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-r - w * 0.22, top + 18);
  ctx.lineTo(-r - w * 0.22, cy);
  ctx.stroke();
}

function haloRing(ctx: Ctx, cy: number, rx: number, ry: number, rot: number, half: 'back' | 'front', colour: string, t: number): void {
  ctx.save();
  ctx.translate(0, cy);
  ctx.rotate(rot);
  ctx.beginPath();
  if (half === 'back') {
    ctx.ellipse(0, 0, rx, ry, 0, Math.PI, Math.PI * 2);
  } else {
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI);
  }
  ctx.lineCap = 'round';
  ctx.lineWidth = 9;
  ctx.strokeStyle = rgba(colour, 0.35);
  ctx.stroke();
  ctx.lineWidth = 4;
  ctx.strokeStyle = colour;
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#FFFFFF';
  ctx.stroke();
  if (half === 'front') {
    // A bead running round the ring.
    const ang = (t * 2.2) % (Math.PI * 2);
    if (Math.sin(ang) > 0) {
      sparkle(ctx, Math.cos(ang) * rx, Math.sin(ang) * ry, 7, '#FFFFFF');
    }
  }
  ctx.restore();
}

function drawMila(ctx: Ctx, p: SidekickPose, anim: FaceAnim): void {
  const o = MILA_O;
  const body = SIDEKICK_COLOURS.mila.body;
  const teal = SIDEKICK_COLOURS.mila.accent;
  const ev = p.evolved;
  const t = p.t;
  const a = p.action;
  const gold = C.yellow;

  if (ev) {
    haloRing(ctx, -62, 74, 13, 0.14, 'back', gold, t);
    haloRing(ctx, -62, 74, 13, -0.14, 'back', gold, t + 1.4);
  }

  // Hover orb in place of the front wheel.
  const k = 0.85 + 0.15 * Math.sin(t * 5);
  ctx.fillStyle = rgrad(ctx, 0, -36, 0, 34, [
    [0, rgba(teal, 0.5 * k)],
    [1, rgba(teal, 0)],
  ]);
  ellipsePath(ctx, 0, -32, 34, 26);
  ctx.fill();
  ellipsePath(ctx, 0, -40, 15, 13);
  ctx.fillStyle = rgrad(ctx, 0, -40, 0, 15, [
    [0, '#FFFFFF'],
    [0.5, shade(teal, 0.35)],
    [1, teal],
  ], -4, -45);
  ctx.fill();
  outline(ctx, shade(teal, -0.45), 3);

  // The horseshoe magnet cradling the scooter: its arms are the handlebars.
  magnetU(ctx, 58, -112, -170, 20, teal, ev ? gold : '#E8EEF5', shade(teal, -0.5));
  if (a > 0.01 || ev) {
    // Field lines between the tips.
    const s = Math.max(a, ev ? 0.35 : 0);
    ctx.save();
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 2; i += 1) {
      ctx.strokeStyle = rgba(ev ? gold : '#FFFFFF', s * (0.9 - i * 0.3));
      ctx.beginPath();
      ctx.moveTo(-58, -172);
      ctx.bezierCurveTo(-46, -182 - i * 4, 46, -182 - i * 4, 58, -172);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Leg shield (the scooter's front) with the horn "tie".
  ctx.beginPath();
  ctx.moveTo(-40, -90);
  ctx.lineTo(40, -90);
  ctx.bezierCurveTo(42, -70, 34, -54, 22, -48);
  ctx.lineTo(-22, -48);
  ctx.bezierCurveTo(-34, -54, -42, -70, -40, -90);
  ctx.closePath();
  paint(ctx, body, -90, -48, o, OUT);
  roundRect(ctx, -7, -90, 14, 10, [0, 0, 5, 5]);
  ctx.fillStyle = vgrad(ctx, -90, -80, [
    [0, shade(teal, 0.2)],
    [1, shade(teal, -0.2)],
  ]);
  ctx.fill();
  // Mudguard over the orb.
  ctx.beginPath();
  ctx.moveTo(-20, -48);
  ctx.quadraticCurveTo(0, -60, 20, -48);
  ctx.lineTo(16, -44);
  ctx.quadraticCurveTo(0, -52, -16, -44);
  ctx.closePath();
  ctx.fillStyle = shade(body, -0.2);
  ctx.fill();

  // Head (the headset) with the face.
  roundRect(ctx, -50, -152, 100, 68, 30);
  paint(ctx, body, -152, -84, o, OUT);
  ctx.save();
  roundRect(ctx, -50, -152, 100, 68, 30);
  ctx.clip();
  sheen(ctx, -24, -146, 30, 10, 0.4);
  ctx.restore();
  roundRect(ctx, -40, -142, 80, 48, 18);
  facePanel(ctx, -142, -94, o, '#FFE0EE');
  drawFace(ctx, MILA_FACE, 0, p.expr, anim);
  lamp(ctx, 0, -153, 8, '#FFF6E0', o, 0.4);

  // Grip caps where the magnet passes the head.
  for (const side of [-1, 1]) {
    roundRect(ctx, side * 58 - 13, -128, 26, 10, 5);
    ctx.fillStyle = shade(body, -0.15);
    ctx.fill();
    outline(ctx, o, 2.6);
  }

  if (ev) {
    haloRing(ctx, -62, 74, 13, 0.14, 'front', gold, t);
    haloRing(ctx, -62, 74, 13, -0.14, 'front', gold, t + 1.4);
  }
  for (const side of [-1, 1]) {
    burst(ctx, side * 58, -166, 16, a, ev ? gold : teal);
  }
}

// -- Kumpuni: repair kart -------------------------------------------------------------------

const KUMPUNI_O = '#1C6630';
const KUMPUNI_FACE = face({
  eyeGap: 25, eyeY: -102, eyeRx: 15, eyeRy: 17, cheekX: 44, cheekY: -86, mouthY: -71, mouthW: 18,
  outline: KUMPUNI_O, browColor: '#14501F', browWidth: 4, browLength: 15, iris: '#5FB84A', irisDark: '#255E1A',
});

function wrenchShape(ctx: Ctx, x: number, y: number, len: number, rot: number, o: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  roundRect(ctx, -4.5, -len, 9, len, 4);
  ctx.fillStyle = hgrad(ctx, -4.5, 4.5, [
    [0, '#FFFFFF'],
    [1, STEEL],
  ]);
  ctx.fill();
  outline(ctx, o, 2.6);
  ctx.beginPath();
  // Open-jaw head: a ring with a slot cut from the top down to its middle.
  ctx.arc(0, -len - 6, 10, -Math.PI / 2 + 0.5, Math.PI * 1.5 - 0.5, false);
  ctx.lineTo(-3.5, -len - 5);
  ctx.lineTo(3.5, -len - 5);
  ctx.closePath();
  ctx.fillStyle = '#E8EEF5';
  ctx.fill();
  outline(ctx, o, 2.6);
  ctx.restore();
}

function drawKumpuni(ctx: Ctx, p: SidekickPose, anim: FaceAnim): void {
  const o = KUMPUNI_O;
  const body = SIDEKICK_COLOURS.kumpuni.body;
  const orange = SIDEKICK_COLOURS.kumpuni.accent;
  const ev = p.evolved;
  const t = p.t;
  const a = p.action;

  hoverPad(ctx, -50, -44, 22, '#A8F0B0', t, 0, '#1C3A24');
  hoverPad(ctx, 36, -44, 22, '#A8F0B0', t, 1.5, '#1C3A24');

  // Crane boom (evolved) stands behind everything.
  const tipX = 86;
  const tipY = -170;
  if (ev) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = 12 + OUT;
    ctx.strokeStyle = '#6B4A00';
    ctx.beginPath();
    ctx.moveTo(40, -130);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    ctx.lineWidth = 12;
    ctx.strokeStyle = C.yellow;
    ctx.stroke();
    // Lattice marks.
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#8A5A00';
    for (let i = 1; i < 5; i += 1) {
      const k = i / 5;
      const x = 40 + (tipX - 40) * k;
      const y = -130 + (tipY + 130) * k;
      ctx.beginPath();
      ctx.moveTo(x - 4, y + 4);
      ctx.lineTo(x + 4, y - 4);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Kart body: low, wide, flared toward the bottom.
  const kart: [number, number][] = [[-70, -132], [56, -132], [70, -50], [-84, -50]];
  roundPoly(ctx, kart, 18);
  paint(ctx, body, -132, -50, o, OUT);
  ctx.save();
  roundPoly(ctx, kart, 18);
  ctx.clip();
  sheen(ctx, -44, -126, 40, 12, 0.3);
  ctx.restore();
  // Bumper band.
  roundRect(ctx, -86, -62, 158, 16, 8);
  paint(ctx, orange, -62, -46, o, 3);
  if (ev) {
    ctx.save();
    roundRect(ctx, -86, -62, 158, 16, 8);
    ctx.clip();
    ctx.fillStyle = '#20242C';
    for (let x = -100; x < 80; x += 20) {
      ctx.beginPath();
      ctx.moveTo(x, -46);
      ctx.lineTo(x + 10, -46);
      ctx.lineTo(x + 26, -62);
      ctx.lineTo(x + 16, -62);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    roundRect(ctx, -86, -62, 158, 16, 8);
    outline(ctx, o, 3);
  }

  roundRect(ctx, -66, -124, 118, 44, 14);
  facePanel(ctx, -124, -80, o, '#DDF5E2');
  drawFace(ctx, KUMPUNI_FACE, -7, p.expr, anim);

  // Toolbox on the roof (two tiers when evolved).
  const boxTop = ev ? -164 : -152;
  const boxL = ev ? -66 : -56;
  const boxW = ev ? 100 : 84;
  roundRect(ctx, boxL, boxTop, boxW, -128 - boxTop, 6);
  paint(ctx, orange, boxTop, -128, o, OUT);
  ctx.strokeStyle = rgba(o, 0.6);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(boxL + 4, boxTop + 9);
  ctx.lineTo(boxL + boxW - 4, boxTop + 9);
  if (ev) {
    ctx.moveTo(boxL + 4, boxTop + 22);
    ctx.lineTo(boxL + boxW - 4, boxTop + 22);
  }
  ctx.stroke();
  for (const ly of ev ? [boxTop + 15, boxTop + 28] : [boxTop + 16]) {
    roundRect(ctx, boxL + boxW / 2 - 7, ly - 3, 14, 6, 2);
    ctx.fillStyle = '#E8EEF5';
    ctx.fill();
    outline(ctx, o, 1.6);
  }
  // Handle.
  ctx.beginPath();
  ctx.moveTo(boxL + boxW / 2 - 14, boxTop);
  ctx.quadraticCurveTo(boxL + boxW / 2, boxTop - 16, boxL + boxW / 2 + 14, boxTop);
  ctx.lineWidth = 5;
  ctx.strokeStyle = STEEL_DARK;
  ctx.stroke();

  // Amber beacon, its highlight sweeping round.
  const bx = ev ? 46 : 44;
  ellipsePath(ctx, bx, -134, 10, 11);
  ctx.fillStyle = rgrad(ctx, bx, -134, 0, 11, [
    [0, '#FFF6C9'],
    [0.6, '#FFB020'],
    [1, '#C97A00'],
  ]);
  ctx.fill();
  outline(ctx, o, 3);
  const sweep = Math.sin(t * 5);
  ellipsePath(ctx, bx + sweep * 5, -137, 3, 5);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fill();

  // Arm: shoulder, elbow, wrench (or the crane cable and hook).
  if (ev) {
    ctx.strokeStyle = '#2B3442';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX, -124 + a * 6);
    ctx.stroke();
    ellipsePath(ctx, tipX, tipY, 5, 5);
    ctx.fillStyle = STEEL_DARK;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(tipX - 6, -118 + a * 6, 7, 0, Math.PI, false);
    ctx.lineWidth = 4;
    ctx.strokeStyle = STEEL_DARK;
    ctx.stroke();
    wrenchShape(ctx, tipX - 13, -114 + a * 6, 26, Math.PI, o);
  } else {
    const lift = a * 8;
    ctx.lineCap = 'round';
    ctx.lineWidth = 9 + OUT;
    ctx.strokeStyle = o;
    ctx.beginPath();
    ctx.moveTo(62, -96);
    ctx.lineTo(84, -112 - lift * 0.5);
    ctx.lineTo(78, -134 - lift);
    ctx.stroke();
    ctx.lineWidth = 9;
    ctx.strokeStyle = STEEL;
    ctx.stroke();
    ellipsePath(ctx, 84, -112 - lift * 0.5, 6, 6);
    ctx.fillStyle = orange;
    ctx.fill();
    outline(ctx, o, 2.4);
    wrenchShape(ctx, 78, -132 - lift, 20, 0.1, o);
  }
  ellipsePath(ctx, 63, -96, 8, 8);
  ctx.fillStyle = orange;
  ctx.fill();
  outline(ctx, o, 2.6);

  const fx = ev ? tipX - 13 : 80;
  const fy = ev ? -84 + a * 6 : -160 - a * 8;
  burst(ctx, fx, fy, 15, a, '#7CF09A');
  if (a > 0.3) {
    sparkle(ctx, fx - 14, fy + 10, 5 * a, C.yellow);
    sparkle(ctx, fx + 8, fy + 14, 4 * a, '#FFFFFF');
  }
}

// -- Bantay: bulldog patrol scooter ----------------------------------------------------------

const BANTAY_O = '#0E1E3E';
const BANTAY_FACE = face({
  eyeGap: 25, eyeY: -124, eyeRx: 14.5, eyeRy: 16.5, cheekX: 48, cheekY: -90, cheekR: 7, mouthY: -81, mouthW: 20,
  outline: BANTAY_O, browColor: '#0E1E3E', browWidth: 6, browRise: 1, browLength: 20, iris: '#6E5236', irisDark: '#33210F',
});

function shieldPath(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - h / 2);
  ctx.quadraticCurveTo(x + w * 0.3, y - h * 0.38, x + w / 2, y - h * 0.44);
  ctx.quadraticCurveTo(x + w * 0.52, y + h * 0.1, x, y + h / 2);
  ctx.quadraticCurveTo(x - w * 0.52, y + h * 0.1, x - w / 2, y - h * 0.44);
  ctx.quadraticCurveTo(x - w * 0.3, y - h * 0.38, x, y - h / 2);
  ctx.closePath();
}

function drawBantay(ctx: Ctx, p: SidekickPose, anim: FaceAnim): void {
  const o = BANTAY_O;
  const body = SIDEKICK_COLOURS.bantay.body;
  const silver = SIDEKICK_COLOURS.bantay.accent;
  const ev = p.evolved;
  const t = p.t;
  const a = p.action;
  const gold = C.yellow;
  const trim = ev ? gold : silver;

  // Evolved: shield-plate wings fanning out behind the head.
  if (ev) {
    for (const side of [-1, 1]) {
      const flap = Math.sin(t * 4) * 0.05;
      for (let i = 2; i >= 0; i -= 1) {
        ctx.save();
        ctx.translate(side * 62, -114);
        ctx.rotate(side * (0.8 + i * 0.46 + flap));
        shieldPath(ctx, 0, -18, 21, 29);
        paint(ctx, i === 1 ? '#FFFFFF' : shade(silver, 0.1), -33, -3, '#8A5A00', 3);
        shieldPath(ctx, 0, -18, 21, 29);
        ctx.lineWidth = 2;
        ctx.strokeStyle = gold;
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  jet(ctx, -28, -44, 20, t, ev ? HOT_FLAME : BLUE_FLAME, 0.6);
  jet(ctx, 28, -44, 20, t, ev ? HOT_FLAME : BLUE_FLAME, 2.2);

  // Scooter body under the head, with the shield emblem.
  roundRect(ctx, -44, -80, 88, 38, [8, 8, 16, 16]);
  paint(ctx, shade(body, -0.1), -80, -42, o, OUT);
  shieldPath(ctx, 0, -55, 28, 26);
  paint(ctx, trim, -68, -42, o, 2.6);
  ctx.save();
  ctx.font = '900 13px sans-serif';
  starPath(ctx, 0, -56, 7, 5, 0.45);
  ctx.fillStyle = ev ? '#FFFFFF' : body;
  ctx.fill();
  ctx.restore();

  // Folded bulldog ears.
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 40, -160);
    ctx.quadraticCurveTo(side * 76, -170, side * 90, -150);
    ctx.quadraticCurveTo(side * 86, -132, side * 72, -124);
    ctx.quadraticCurveTo(side * 66, -142, side * 44, -140);
    ctx.closePath();
    paint(ctx, shade(body, -0.3), -168, -124, o, OUT);
    if (ev) {
      ctx.beginPath();
      ctx.moveTo(side * 84, -154);
      ctx.quadraticCurveTo(side * 86, -138, side * 74, -128);
      ctx.lineWidth = 3;
      ctx.strokeStyle = gold;
      ctx.stroke();
    }
  }

  // Siren dome.
  roundRect(ctx, -14, -168, 28, 10, 4);
  paint(ctx, silver, -168, -158, o, 3);
  const flash = 0.6 + 0.4 * Math.sin(t * 7);
  ellipsePath(ctx, 0, -170, 10, 9);
  ctx.fillStyle = rgrad(ctx, 0, -172, 0, 11, [
    [0, '#FFFFFF'],
    [0.5, ev ? '#FFE07A' : '#7FC4FF'],
    [1, ev ? '#C98A00' : '#1F6FE5'],
  ]);
  ctx.fill();
  outline(ctx, o, 3);
  ctx.fillStyle = rgba(ev ? '#FFE07A' : '#7FC4FF', 0.35 * flash);
  ellipsePath(ctx, 0, -168, 17, 9);
  ctx.fill();

  // Big square head.
  roundRect(ctx, -68, -162, 136, 92, 30);
  paint(ctx, body, -162, -70, o, OUT);
  ctx.save();
  roundRect(ctx, -68, -162, 136, 92, 30);
  ctx.clip();
  sheen(ctx, -36, -156, 36, 10, 0.35);
  ctx.restore();
  if (ev) {
    roundRect(ctx, -62, -156, 124, 80, 25);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = gold;
    ctx.stroke();
  }
  roundRect(ctx, -54, -150, 108, 50, 18);
  facePanel(ctx, -150, -100, o, '#DCE4F0');
  drawFace(ctx, BANTAY_FACE, 0, p.expr, anim, false);

  // Wide silver jowls (the muzzle) over the lower face.
  ctx.beginPath();
  ctx.moveTo(-76, -98);
  ctx.bezierCurveTo(-82, -78, -72, -62, -50, -62);
  ctx.lineTo(50, -62);
  ctx.bezierCurveTo(72, -62, 82, -78, 76, -98);
  ctx.bezierCurveTo(56, -108, 24, -108, 0, -98);
  ctx.bezierCurveTo(-24, -108, -56, -108, -76, -98);
  ctx.closePath();
  paint(ctx, silver, -106, -62, o, OUT);
  ctx.save();
  ctx.clip();
  drawCheeks(ctx, { ...BANTAY_FACE, cheekY: -84, cheekX: 52 }, p.expr);
  ctx.restore();
  // Nose.
  ctx.beginPath();
  ctx.moveTo(-10, -100);
  ctx.quadraticCurveTo(0, -104, 10, -100);
  ctx.quadraticCurveTo(10, -92, 0, -89);
  ctx.quadraticCurveTo(-10, -92, -10, -100);
  ctx.closePath();
  ctx.fillStyle = '#1A2234';
  ctx.fill();
  ellipsePath(ctx, -3.5, -99, 3, 1.8);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fill();
  ctx.save();
  drawMouth(ctx, BANTAY_FACE, p.expr, anim);
  ctx.restore();
  // Little underbite fangs on the calm faces.
  const m = EXPR[p.expr].mouth;
  if (m === 'smile' || m === 'firm' || m === 'wobble') {
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 7 - 3, -77);
      ctx.lineTo(side * 7, -84);
      ctx.lineTo(side * 7 + 3, -77);
      ctx.closePath();
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = C.eyeInk;
      ctx.stroke();
    }
  }

  // Action: a translucent shield bubble in front of the body.
  if (a > 0.01) {
    ctx.save();
    const s = 0.9 + a * 0.1;
    ctx.translate(0, -106);
    ctx.scale(s, s);
    shieldPath(ctx, 0, 0, 176, 138);
    ctx.fillStyle = rgba(ev ? gold : '#7FC4FF', 0.22 * a);
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = rgba('#FFFFFF', 0.9 * a);
    ctx.stroke();
    ctx.lineWidth = 9;
    ctx.strokeStyle = rgba(ev ? gold : '#7FC4FF', 0.4 * a);
    ctx.stroke();
    ctx.restore();
    burst(ctx, 0, -55, 18, a, ev ? gold : '#7FC4FF');
  }
}

// -- Silip: camera drone -----------------------------------------------------------------------

const SILIP_O = '#3B7310';
const SILIP_FACE = face({
  eyeGap: 20, eyeY: -112, eyeRx: 14.5, eyeRy: 17.5, cheekX: 35, cheekY: -94, mouthY: -71, mouthW: 15,
  outline: SILIP_O, browColor: '#2F6A0A', browWidth: 3.2, browLength: 13, iris: '#3E9BF0', irisDark: '#1F5FBF',
});
const RADAR = '#3FA9FF';

function rotor(ctx: Ctx, x: number, y: number, t: number, phase: number, tip: string): void {
  // Spinning disc blur and one visible blade.
  ellipsePath(ctx, x, y, 22, 6);
  ctx.fillStyle = 'rgba(235,255,210,0.7)';
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = 'rgba(59,115,16,0.8)';
  ctx.stroke();
  const k = Math.cos(t * 38 + phase);
  roundRect(ctx, x - 21 * Math.abs(k), y - 2.5, 42 * Math.abs(k), 5, 2.5);
  ctx.fillStyle = tip;
  ctx.fill();
  ellipsePath(ctx, x, y + 2, 7, 6);
  ctx.fillStyle = STEEL_DARK;
  ctx.fill();
}

function drawSilip(ctx: Ctx, p: SidekickPose, anim: FaceAnim): void {
  const o = SILIP_O;
  const body = SIDEKICK_COLOURS.silip.body;
  const ev = p.evolved;
  const t = p.t;
  const a = p.action;

  // Downwash under the rotors and a little belly light.
  ctx.fillStyle = rgrad(ctx, 0, -40, 0, 26, [
    [0, rgba('#E6FFB8', 0.6)],
    [1, rgba('#E6FFB8', 0)],
  ]);
  ellipsePath(ctx, 0, -40, 26, 16);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 2;
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i += 1) {
      const y = -112 + ((t * 60 + i * 14) % 42);
      ctx.beginPath();
      ctx.moveTo(side * 70 + (i - 1) * 8, y);
      ctx.lineTo(side * 70 + (i - 1) * 9, y + 8);
      ctx.stroke();
    }
  }

  // Mast and periscope (or the radar dish and twin lenses when evolved).
  ctx.save();
  roundRect(ctx, 4, -168, 12, 26, 4);
  paint(ctx, '#E8EEF5', -168, -142, o, 3);
  ctx.restore();
  if (ev) {
    roundRect(ctx, -26, -160, 8, 18, 3);
    paint(ctx, '#E8EEF5', -160, -142, o, 2.6);
    ctx.save();
    ctx.translate(-22, -166);
    ctx.rotate(Math.sin(t * 1.6) * 0.35);
    ellipsePath(ctx, 0, 0, 20, 11);
    ctx.fillStyle = rgrad(ctx, 0, 0, 0, 20, [
      [0, '#FFFFFF'],
      [0.6, '#D8ECFF'],
      [1, RADAR],
    ], -4, -3);
    ctx.fill();
    outline(ctx, '#1F5FBF', 3);
    ellipsePath(ctx, 0, 0, 3, 3);
    ctx.fillStyle = '#1F5FBF';
    ctx.fill();
    ctx.restore();
    // Twin-lens head.
    roundRect(ctx, -6, -182, 40, 18, 7);
    paint(ctx, '#FFFFFF', -182, -164, o, 3);
    for (const lx of [6, 22]) {
      ellipsePath(ctx, lx, -173, 6, 6);
      ctx.fillStyle = rgrad(ctx, lx, -173, 0, 6, [
        [0, '#9EDBFF'],
        [0.6, RADAR],
        [1, '#10284C'],
      ]);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = o;
      ctx.stroke();
      ellipsePath(ctx, lx - 2, -175, 1.8, 1.4);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
    }
  } else {
    roundRect(ctx, -2, -182, 26, 18, 7);
    paint(ctx, '#FFFFFF', -182, -164, o, 3);
    ellipsePath(ctx, 11, -173, 7, 7);
    ctx.fillStyle = rgrad(ctx, 11, -173, 0, 7, [
      [0, '#9EDBFF'],
      [0.6, '#3E9BF0'],
      [1, '#10284C'],
    ]);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = o;
    ctx.stroke();
    ellipsePath(ctx, 8.5, -175.5, 2.2, 1.6);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
  }

  // Rotor arms.
  for (const side of [-1, 1]) {
    ctx.lineCap = 'round';
    ctx.lineWidth = 10 + OUT;
    ctx.strokeStyle = o;
    ctx.beginPath();
    ctx.moveTo(side * 44, -118);
    ctx.lineTo(side * 70, -134);
    ctx.stroke();
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#FFFFFF';
    ctx.stroke();
  }

  // Ball body: lime shell, white belly band.
  ellipsePath(ctx, 0, -102, 54, 52);
  paint(ctx, body, -154, -50, o, OUT);
  ctx.save();
  ellipsePath(ctx, 0, -102, 54, 52);
  ctx.clip();
  ctx.fillStyle = vgrad(ctx, -82, -50, [
    [0, '#FFFFFF'],
    [1, '#DDE8D0'],
  ]);
  ctx.beginPath();
  ctx.moveTo(-60, -82);
  ctx.quadraticCurveTo(0, -70, 60, -82);
  ctx.lineTo(60, -40);
  ctx.lineTo(-60, -40);
  ctx.closePath();
  ctx.fill();
  if (ev) {
    ctx.fillStyle = RADAR;
    ctx.beginPath();
    ctx.moveTo(-60, -84);
    ctx.quadraticCurveTo(0, -72, 60, -84);
    ctx.lineTo(60, -80);
    ctx.quadraticCurveTo(0, -68, -60, -80);
    ctx.closePath();
    ctx.fill();
  }
  sheen(ctx, -24, -140, 30, 12, 0.45);
  ctx.restore();
  ellipsePath(ctx, 0, -102, 54, 52);
  outline(ctx, o);
  // Visor face.
  ellipsePath(ctx, 0, -114, 42, 28);
  facePanel(ctx, -142, -86, o, '#E6F5D0');
  drawFace(ctx, SILIP_FACE, 0, p.expr, anim);

  for (const side of [-1, 1]) {
    rotor(ctx, side * 70, -138, t, side > 0 ? 1.1 : 0, ev ? RADAR : '#5A6B4A');
  }

  if (a > 0.01) {
    const lx = ev ? 14 : 11;
    burst(ctx, lx, -172, 12, a, ev ? RADAR : '#C8FF7A');
    ctx.save();
    ctx.lineWidth = 3;
    ctx.strokeStyle = rgba(ev ? RADAR : '#C8FF7A', a * 0.8);
    ellipsePath(ctx, 0, -102, 58 + (1 - a) * 20, 56 + (1 - a) * 20);
    ctx.stroke();
    ctx.restore();
  }
}

// -- Walis: street sweeper ---------------------------------------------------------------------

const WALIS_O = '#0C5A66';
const WALIS_FACE = face({
  eyeGap: 22, eyeY: -102, eyeRx: 14, eyeRy: 16, cheekX: 40, cheekY: -86, mouthY: -66, mouthW: 15,
  outline: WALIS_O, browColor: WALIS_O, browWidth: 3.2, browLength: 13, iris: '#1F8FA8', irisDark: '#0C5A66',
});

/** A round spinning brush with bristles sticking out. */
function sweepBrush(ctx: Ctx, x: number, y: number, r: number, t: number, phase: number, bristle: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(t * 9 + phase);
  ctx.strokeStyle = bristle;
  ctx.lineWidth = 3.4;
  ctx.lineCap = 'round';
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55);
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    ctx.stroke();
  }
  ellipsePath(ctx, 0, 0, r * 0.6, r * 0.6);
  ctx.fillStyle = vgrad(ctx, -r, r, [
    [0, '#E6EDF5'],
    [1, STEEL],
  ]);
  ctx.fill();
  outline(ctx, STEEL_DARK, 2.6);
  ctx.restore();
}

function broom(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, o: string): void {
  ctx.lineCap = 'round';
  ctx.lineWidth = 8 + 3;
  ctx.strokeStyle = o;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#C89A5B';
  ctx.stroke();
  // The bristles at the top, fanned out.
  const a = Math.atan2(y1 - y0, x1 - x0);
  ctx.save();
  ctx.translate(x1, y1);
  ctx.rotate(a + Math.PI / 2);
  ctx.beginPath();
  ctx.moveTo(-8, 4);
  ctx.lineTo(8, 4);
  ctx.lineTo(16, -20);
  ctx.quadraticCurveTo(0, -27, -16, -20);
  ctx.closePath();
  ctx.fillStyle = vgrad(ctx, -24, 4, [
    [0, '#FFE27A'],
    [1, '#E0A100'],
  ]);
  ctx.fill();
  outline(ctx, '#8A5A00', 3);
  ctx.restore();
}

function drawWalis(ctx: Ctx, p: SidekickPose, anim: FaceAnim): void {
  const o = WALIS_O;
  const { body, accent } = SIDEKICK_COLOURS.walis;
  const ev = p.evolved;
  const t = p.t;
  const a = p.action;

  // The broom raised behind (a second one when evolved).
  broom(ctx, 54, -112, 80, -168 - a * 6, o);
  if (ev) {
    broom(ctx, -54, -112, -80, -168 - a * 6, o);
  }
  sweepBrush(ctx, -50, -52, 25, t, 0, ev ? '#FFD23F' : '#E8C547');
  sweepBrush(ctx, 50, -52, 25, -t, 1, ev ? '#FFD23F' : '#E8C547');

  // The hopper on top, and its beacon.
  roundRect(ctx, -36, -150, 72, 28, [14, 14, 4, 4]);
  paint(ctx, accent, -150, -122, o, 3.4);
  lamp(ctx, 0, -158, 8, ev ? '#FF8A1F' : '#FFC32D', o, 0.5);

  roundRect(ctx, -74, -130, 148, 78, 26);
  paint(ctx, body, -130, -52, o, OUT);
  ctx.save();
  roundRect(ctx, -74, -130, 148, 78, 26);
  ctx.clip();
  sheen(ctx, -56, -128, 40, 10, 0.4);
  if (ev) {
    ctx.fillStyle = accent;
    ctx.fillRect(-74, -66, 148, 7);
  }
  ctx.restore();
  roundRect(ctx, -56, -125, 112, 48, 18);
  facePanel(ctx, -125, -77, o, '#D5F4F7');
  drawFace(ctx, WALIS_FACE, 0, p.expr, anim);

  if (a > 0.01) {
    burst(ctx, 50, -48, 26, a, '#BDF4FF');
    burst(ctx, -50, -48, 26, a, '#BDF4FF');
  }
  if (ev) {
    sparkle(ctx, -86, -128, 7 + Math.sin(t * 6) * 2, '#FFE27A');
    sparkle(ctx, 88, -124, 6 + Math.cos(t * 6) * 2, '#FFE27A');
  }
}

// -- Barya: flying toll coin --------------------------------------------------------------------

const BARYA_O = '#8A5A00';
const BARYA_FACE = face({
  eyeGap: 19, eyeY: -114, eyeRx: 13.5, eyeRy: 16, cheekX: 33, cheekY: -96, mouthY: -83, mouthW: 16,
  outline: BARYA_O, browColor: BARYA_O, browWidth: 3.2, browLength: 12, iris: '#B86E00', irisDark: '#7A4600',
});

function drawBarya(ctx: Ctx, p: SidekickPose, anim: FaceAnim): void {
  const o = BARYA_O;
  const { body } = SIDEKICK_COLOURS.barya;
  const ev = p.evolved;
  const t = p.t;
  const a = p.action;
  const cy = -106;

  hoverPad(ctx, 0, -42, 24, '#FFE27A', t, 0.6, o);

  // Little wings, flapping.
  const flap = Math.sin(t * 16) * 0.28;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * 54, cy - 6);
    ctx.scale(side, 1);
    ctx.rotate(-0.25 + flap);
    ctx.beginPath();
    ctx.moveTo(0, 8);
    ctx.quadraticCurveTo(26, -22, 42, -8);
    ctx.quadraticCurveTo(30, -2, 32, 6);
    ctx.quadraticCurveTo(20, 4, 18, 12);
    ctx.quadraticCurveTo(8, 8, 0, 8);
    ctx.closePath();
    ctx.fillStyle = vgrad(ctx, -20, 12, [
      [0, '#FFFFFF'],
      [1, ev ? '#FFE9A8' : '#D8E8F7'],
    ]);
    ctx.fill();
    outline(ctx, o, 3);
    ctx.restore();
  }

  // The coin: a ridged rim round a pale face.
  ellipsePath(ctx, 0, cy, 60, 60);
  paint(ctx, body, cy - 60, cy + 60, o, OUT);
  ctx.save();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(138,90,0,0.55)';
  for (let i = 0; i < 28; i += 1) {
    const ang = (i / 28) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(ang) * 50, cy + Math.sin(ang) * 50);
    ctx.lineTo(Math.cos(ang) * 58, cy + Math.sin(ang) * 58);
    ctx.stroke();
  }
  ctx.restore();
  ellipsePath(ctx, 0, cy, 47, 47);
  facePanel(ctx, cy - 47, cy + 47, o, '#FFF0C2');
  drawFace(ctx, BARYA_FACE, 0, p.expr, anim);

  // The coin slot on top; evolved, a little crown of coins instead.
  if (ev) {
    for (const [x, y] of [[-22, -168], [22, -168], [0, -176]] as [number, number][]) {
      ellipsePath(ctx, x, y, 13, 13);
      paint(ctx, '#FFE27A', y - 13, y + 13, o, 3);
      ellipsePath(ctx, x, y, 6, 6);
      ctx.strokeStyle = 'rgba(138,90,0,0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    sparkle(ctx, -60, -158, 7 + Math.sin(t * 6) * 2, '#FFF4A8');
    sparkle(ctx, 62, -60, 6 + Math.cos(t * 5) * 2, '#FFF4A8');
  } else {
    roundRect(ctx, -22, -171, 44, 10, 5);
    ctx.fillStyle = '#5A3A00';
    ctx.fill();
    outline(ctx, o, 2.6);
  }

  if (a > 0.01) {
    burst(ctx, 0, -176, 22, a, '#FFE27A');
  }
}

// -- Sibat: dart jet ---------------------------------------------------------------------------

const SIBAT_O = '#7A1420';
const SIBAT_FACE = face({
  eyeGap: 14, eyeY: -118, eyeRx: 11, eyeRy: 14, cheekX: 24, cheekY: -102, mouthY: -93, mouthW: 11,
  outline: SIBAT_O, browColor: SIBAT_O, browWidth: 3, browLength: 10, iris: '#C8283C', irisDark: '#7A1420',
});

function drawSibat(ctx: Ctx, p: SidekickPose, anim: FaceAnim): void {
  const o = SIBAT_O;
  const { body, accent } = SIDEKICK_COLOURS.sibat;
  const ev = p.evolved;
  const t = p.t;
  const a = p.action;

  // Jets under the tail.
  jet(ctx, ev ? -12 : 0, -56, 20, t, BLUE_FLAME, 0.4);
  if (ev) {
    jet(ctx, 12, -56, 20, t, BLUE_FLAME, 2.1);
  }

  // Swept fins.
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 22, -108);
    ctx.lineTo(side * (ev ? 80 : 68), -56);
    ctx.quadraticCurveTo(side * 44, -60, side * 22, -64);
    ctx.closePath();
    ctx.fillStyle = vgrad(ctx, -108, -56, [
      [0, accent],
      [1, '#D9DEE6'],
    ]);
    ctx.fill();
    outline(ctx, o, 3.4);
    if (ev) {
      // A lightning flash on each fin.
      ctx.beginPath();
      ctx.moveTo(side * 34, -92);
      ctx.lineTo(side * 48, -78);
      ctx.lineTo(side * 40, -77);
      ctx.lineTo(side * 54, -64);
      ctx.lineTo(side * 34, -74);
      ctx.lineTo(side * 41, -76);
      ctx.closePath();
      ctx.fillStyle = '#FFD23F';
      ctx.fill();
    }
    // Little canards by the nose.
    ctx.beginPath();
    ctx.moveTo(side * 14, -152);
    ctx.lineTo(side * 34, -134);
    ctx.lineTo(side * 18, -136);
    ctx.closePath();
    ctx.fillStyle = accent;
    ctx.fill();
    outline(ctx, o, 2.6);
  }

  // The body: a tall dart, nose up.
  const bodyPath = (): void => {
    ctx.beginPath();
    ctx.moveTo(0, -186);
    ctx.bezierCurveTo(16, -170, 36, -140, 34, -104);
    ctx.bezierCurveTo(33, -84, 28, -66, 22, -56);
    ctx.lineTo(-22, -56);
    ctx.bezierCurveTo(-28, -66, -33, -84, -34, -104);
    ctx.bezierCurveTo(-36, -140, -16, -170, 0, -186);
    ctx.closePath();
  };
  bodyPath();
  paint(ctx, body, -186, -56, o, OUT);
  ctx.save();
  bodyPath();
  ctx.clip();
  sheen(ctx, -22, -172, 16, 34, 0.45);
  ctx.fillStyle = accent;
  ctx.fillRect(-40, -78, 80, 7);
  ctx.restore();
  bodyPath();
  outline(ctx, o);
  ellipsePath(ctx, 0, -116, 28, 31);
  facePanel(ctx, -147, -85, o, '#FBE3E6');
  drawFace(ctx, SIBAT_FACE, 0, p.expr, anim);

  if (a > 0.01) {
    burst(ctx, 0, -184, 24, a, '#7FE7FF');
  }
}

// -- Tala: parol star --------------------------------------------------------------------------

const TALA_O = '#A81E5C';
const TALA_FACE = face({
  eyeGap: 16, eyeY: -112, eyeRx: 12, eyeRy: 14.5, cheekX: 28, cheekY: -96, mouthY: -86, mouthW: 13,
  outline: TALA_O, browColor: TALA_O, browWidth: 3, browLength: 11, iris: '#C8408A', irisDark: '#8A1E5C',
});

function tassel(ctx: Ctx, x: number, y: number, t: number, phase: number, colour: string, o: string): void {
  const sway = Math.sin(t * 3 + phase) * 4;
  ctx.lineCap = 'round';
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = o;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + sway * 0.4, y + 12, x + sway, y + 22);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + sway - 5, y + 22);
  ctx.lineTo(x + sway + 5, y + 22);
  ctx.lineTo(x + sway + 7 + sway * 0.2, y + 40);
  ctx.lineTo(x + sway - 7 + sway * 0.2, y + 40);
  ctx.closePath();
  ctx.fillStyle = colour;
  ctx.fill();
  outline(ctx, o, 2.2);
}

function drawTala(ctx: Ctx, p: SidekickPose, anim: FaceAnim): void {
  const o = TALA_O;
  const { body, accent } = SIDEKICK_COLOURS.tala;
  const ev = p.evolved;
  const t = p.t;
  const a = p.action;
  const cy = -104;

  // It gives off its own light.
  const k = 0.85 + 0.15 * Math.sin(t * 3);
  ctx.fillStyle = rgrad(ctx, 0, cy, 0, 96, [
    [0, rgba('#FFE27A', 0.6 * k)],
    [0.6, rgba('#FF8AC2', 0.22 * k)],
    [1, rgba('#FF8AC2', 0)],
  ]);
  ellipsePath(ctx, 0, cy, 96, 96);
  ctx.fill();

  tassel(ctx, -44, -48, t, 0, accent, o);
  tassel(ctx, 44, -48, t, 1.3, accent, o);
  if (ev) {
    tassel(ctx, 0, -66, t, 2.4, '#FFD23F', o);
    // The second star behind, turned between the points of the first.
    ctx.save();
    ctx.translate(0, cy);
    ctx.rotate(Math.PI / 5 + Math.sin(t * 0.8) * 0.05);
    starPath(ctx, 0, 0, 86, 5, 0.5);
    ctx.fillStyle = vgrad(ctx, -86, 86, [
      [0, '#FFE27A'],
      [1, '#FF9A3D'],
    ]);
    ctx.fill();
    outline(ctx, o, 3);
    ctx.restore();
  }

  starPath(ctx, 0, cy, 80, 5, 0.52);
  ctx.fillStyle = vgrad(ctx, cy - 80, cy + 70, [
    [0, '#FFFBEA'],
    [0.55, body],
    [1, '#FFC26B'],
  ]);
  ctx.fill();
  ctx.lineJoin = 'round';
  outline(ctx, o);
  // The bamboo frame showing through the capiz.
  ctx.save();
  starPath(ctx, 0, cy, 80, 5, 0.52);
  ctx.clip();
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = rgba(accent, 0.6);
  for (let i = 0; i < 5; i += 1) {
    const ang = -Math.PI / 2 + (i / 5) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(ang) * 30, cy + Math.sin(ang) * 30);
    ctx.lineTo(Math.cos(ang) * 80, cy + Math.sin(ang) * 80);
    ctx.stroke();
  }
  ctx.restore();

  ellipsePath(ctx, 0, cy, 41, 39);
  facePanel(ctx, cy - 39, cy + 39, o, '#FFEFC9');
  drawFace(ctx, TALA_FACE, 0, p.expr, anim);

  if (ev) {
    sparkle(ctx, -70, -160, 8 + Math.sin(t * 5) * 2, '#FFF4A8');
    sparkle(ctx, 74, -152, 7 + Math.cos(t * 5) * 2, '#FFF4A8');
  }
  if (a > 0.01) {
    burst(ctx, 0, cy, 60, a, '#FFE27A');
  }
}

// -- Ilaw: pocket traffic light ----------------------------------------------------------------

const ILAW_O = '#141A24';
const ILAW_FACE = face({
  eyeGap: 17, eyeY: -106, eyeRx: 12.5, eyeRy: 14.5, cheekX: 30, cheekY: -90, mouthY: -76, mouthW: 13,
  outline: ILAW_O, browColor: ILAW_O, browWidth: 3.2, browLength: 11, iris: '#2EAD5B', irisDark: '#1E6B3A',
});

function drawIlaw(ctx: Ctx, p: SidekickPose, anim: FaceAnim): void {
  const o = ILAW_O;
  const { body, accent } = SIDEKICK_COLOURS.ilaw;
  const ev = p.evolved;
  const t = p.t;
  const a = p.action;

  hoverPad(ctx, 0, -48, 34, '#7FFFB0', t, 2.2, o);

  // Evolved: arrow boards at the sides.
  if (ev) {
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 44, -124);
      ctx.lineTo(side * 74, -124);
      ctx.lineTo(side * 92, -104);
      ctx.lineTo(side * 74, -84);
      ctx.lineTo(side * 44, -84);
      ctx.closePath();
      ctx.fillStyle = vgrad(ctx, -124, -84, [
        [0, '#FFE27A'],
        [1, accent],
      ]);
      ctx.fill();
      outline(ctx, o, 3.4);
    }
  }

  // The body.
  roundRect(ctx, -46, -142, 92, 92, 18);
  paint(ctx, body, -142, -50, o, OUT);
  roundRect(ctx, -38, -128, 76, 66, 14);
  facePanel(ctx, -128, -62, o, '#DDF5E4');
  drawFace(ctx, ILAW_FACE, 0, p.expr, anim);

  // The three lamps across the top, under little hoods.
  roundRect(ctx, -60, -180, 120, 46, 14);
  paint(ctx, body, -180, -134, o, OUT);
  ctx.save();
  roundRect(ctx, -60, -180, 120, 46, 14);
  ctx.clip();
  ctx.fillStyle = ev ? accent : rgba(accent, 0.85);
  ctx.fillRect(-60, -141, 120, 6);
  ctx.restore();
  const green = a < 0.05;
  const lamps: [number, string, boolean][] = [
    [-36, '#FF4A3D', a >= 0.05],
    [0, '#FFC32D', false],
    [36, '#3CD26E', green],
  ];
  for (const [x, colour, on] of lamps) {
    if (on) {
      lamp(ctx, x, -158, 13, colour, o, 0.6);
    } else {
      ellipsePath(ctx, x, -158, 13, 13);
      ctx.fillStyle = shade(colour, -0.55);
      ctx.fill();
      outline(ctx, o, 2.4);
    }
    ctx.beginPath();
    ctx.arc(x, -158, 17, Math.PI * 1.08, Math.PI * 1.92);
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#141A24';
    ctx.stroke();
  }
  if (a > 0.01) {
    burst(ctx, -36, -158, 26, a, '#FF6A5A');
  }
  void t;
}

// -- Maso: mallet ------------------------------------------------------------------------------

const MASO_O = '#5A2E0C';
const MASO_FACE = face({
  eyeGap: 22, eyeY: -141, eyeRx: 13.5, eyeRy: 15.5, cheekX: 40, cheekY: -124, mouthY: -113, mouthW: 15,
  outline: MASO_O, browColor: MASO_O, browWidth: 3.6, browLength: 14, iris: '#B8602A', irisDark: '#7A3A10',
});

function drawMaso(ctx: Ctx, p: SidekickPose, anim: FaceAnim): void {
  const o = MASO_O;
  const ev = p.evolved;
  const head = ev ? '#7C8EA6' : SIDEKICK_COLOURS.maso.body;
  const band = ev ? '#FFC32D' : SIDEKICK_COLOURS.maso.accent;
  const t = p.t;
  const a = p.action;
  const half = ev ? 88 : 80;

  jet(ctx, 0, -46, 22, t, HOT_FLAME, 3.1);

  // The handle, wrapped twice.
  roundRect(ctx, -14, -100, 28, 56, 8);
  ctx.fillStyle = vgrad(ctx, -100, -44, [
    [0, '#D9A36A'],
    [1, '#9A6A3A'],
  ]);
  ctx.fill();
  outline(ctx, o, 3.4);
  ctx.fillStyle = shade(band, -0.1);
  ctx.fillRect(-13, -72, 26, 7);
  ctx.fillRect(-13, -58, 26, 7);

  // A swing tips the head forward for a moment.
  ctx.save();
  ctx.translate(0, -96);
  ctx.rotate(a * 0.14);
  ctx.translate(0, 96);
  roundRect(ctx, -half, -176, half * 2, 84, 22);
  paint(ctx, head, -176, -92, o, OUT);
  ctx.save();
  roundRect(ctx, -half, -176, half * 2, 84, 22);
  ctx.clip();
  sheen(ctx, -half + 14, -174, 40, 10, 0.45);
  ctx.fillStyle = band;
  ctx.fillRect(-half, -176, 16, 84);
  ctx.fillRect(half - 16, -176, 16, 84);
  ctx.restore();
  roundRect(ctx, -half, -176, half * 2, 84, 22);
  outline(ctx, o);
  roundRect(ctx, -54, -170, 108, 72, 18);
  facePanel(ctx, -170, -98, o, '#F7E6D5');
  drawFace(ctx, MASO_FACE, 0, p.expr, anim);
  if (ev) {
    sparkle(ctx, -half - 8, -180, 7 + Math.sin(t * 6) * 2, '#FFE27A');
    sparkle(ctx, half + 6, -92, 6 + Math.cos(t * 6) * 2, '#FFE27A');
  }
  ctx.restore();

  if (a > 0.01) {
    burst(ctx, half, -130, 30, a, '#FFB24A');
  }
}

// -- entry point ------------------------------------------------------------------------------

const DRAW: Record<SidekickId, (ctx: Ctx, p: SidekickPose, anim: FaceAnim) => void> = {
  pip: drawPip,
  bumbo: drawBumbo,
  mila: drawMila,
  kumpuni: drawKumpuni,
  bantay: drawBantay,
  silip: drawSilip,
  walis: drawWalis,
  barya: drawBarya,
  sibat: drawSibat,
  tala: drawTala,
  ilaw: drawIlaw,
  maso: drawMaso,
};

/** Where drawExtras puts the sweat drops / dizzy stars, per sidekick: [top, halfWidth]. */
const EXTRAS: Record<SidekickId, [number, number]> = {
  pip: [-160, 72],
  bumbo: [-150, 84],
  mila: [-160, 64],
  kumpuni: [-156, 74],
  bantay: [-160, 76],
  silip: [-160, 70],
  walis: [-140, 80],
  barya: [-160, 62],
  sibat: [-170, 44],
  tala: [-170, 74],
  ilaw: [-170, 64],
  maso: [-176, 84],
};

const PHASE: Record<SidekickId, number> = { pip: 0, bumbo: 1.1, mila: 2.3, kumpuni: 3.2, bantay: 4.4, silip: 5.3, walis: 0.7, barya: 1.8, sibat: 2.9, tala: 3.9, ilaw: 4.9, maso: 5.8 };

/** Origin (0,0) = the point on the ground below it; the body hovers above (roughly y -40 .. -170). Draws its own soft ground shadow at y=0. */
/** The tall and wide ones are drawn a touch smaller, so all of them fit the one sprite box. */
const FIT: Partial<Record<SidekickId, number>> = { walis: 0.89, barya: 0.94, sibat: 0.88, tala: 0.94, maso: 0.83 };

export function drawSidekick(ctx: Ctx, id: SidekickId, pose: SidekickPose): void {
  const t = pose.t;
  const ph = PHASE[id];
  const bob = Math.sin(t * 2.6 + ph) * 4;
  const anim: FaceAnim = { t, blink: pose.blink, talk: pose.talk, lookX: pose.lookX, lookY: 0 };

  let lift = bob;
  let tilt = 0;
  let shakeX = 0;
  switch (pose.expr) {
    case 'happy':
      tilt = Math.sin(t * 5 + ph) * 0.035;
      break;
    case 'celebrate':
      lift += Math.abs(Math.sin(t * 7 + ph)) * 2;
      tilt = Math.sin(t * 7 + ph) * 0.04;
      break;
    case 'hurt':
      tilt = 0.06;
      shakeX = Math.sin(t * 43) * 1.5;
      lift = bob * 0.5 - 2;
      break;
    case 'worried':
      lift = bob * 0.6 - 2;
      break;
    case 'surprised':
      lift = bob + 1.5;
      break;
    default:
      break;
  }
  // The action kicks the body back a touch (recoil / brace).
  lift -= pose.action * 2;

  // Soft shadow: tighter and darker the lower it floats.
  const k = 1 - lift / 40;
  groundShadow(ctx, 0, 0, 48 * k, 7, 0.24 * k);

  ctx.save();
  ctx.translate(shakeX, -lift);
  ctx.translate(0, -100);
  ctx.rotate(tilt);
  ctx.translate(0, 100);
  const fit = FIT[id] ?? 1;
  ctx.scale(fit, fit);
  DRAW[id](ctx, pose, anim);
  const [top, half] = EXTRAS[id];
  drawExtras(ctx, pose.expr, top, half, anim);
  ctx.restore();
}
