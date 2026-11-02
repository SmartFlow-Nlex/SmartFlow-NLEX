import type { Expression } from '../../core/types';
import { ellipsePath, rgba, rgrad, vgrad, type Ctx } from './kit';
import { C } from './palette';

/**
 * One face construction for the whole cast, taken from Navie's: big glossy
 * oval eyes on a pale windscreen "face", blue irises with two highlights,
 * brows above, pink cheeks, and a mouth on the front below. Characters
 * differ only in proportions and details (lashes, brow weight, iris colour),
 * so they read as one family.
 */

export interface FaceStyle {
  /** Eye centres at (+-eyeGap, eyeY). */
  eyeGap: number;
  eyeY: number;
  eyeRx: number;
  eyeRy: number;
  iris: string;
  irisDark: string;
  lashes: boolean;
  browColor: string;
  browWidth: number;
  /** Brow height above the eye centre. */
  browRise: number;
  browLength: number;
  /** Colour of the face panel around the eyes (used for eyelids). */
  skin: string;
  cheekX: number;
  cheekY: number;
  cheekR: number;
  mouthX: number;
  mouthY: number;
  mouthW: number;
  outline: string;
}

export interface FaceAnim {
  /** Seconds, for idle motion. */
  t: number;
  /** 0 open .. 1 closed. */
  blink: number;
  /** 0 closed .. 1 open (speaking). */
  talk: number;
  lookX: number;
  lookY: number;
}

interface ExprShape {
  eye: 'open' | 'squeeze' | 'arc';
  scale: number;
  pupil: number;
  lidTop: number;
  lidBottom: number;
  /** + inner ends down (determined), - inner ends up (worried). */
  browTilt: number;
  browLift: number;
  mouth: 'smile' | 'talk' | 'grin' | 'wobble' | 'o' | 'firm' | 'grimace';
}

export const EXPR: Record<Expression, ExprShape> = {
  idle: { eye: 'open', scale: 1, pupil: 1, lidTop: 0, lidBottom: 0, browTilt: 0, browLift: 0, mouth: 'smile' },
  speaking: { eye: 'open', scale: 1, pupil: 1, lidTop: 0, lidBottom: 0.05, browTilt: 0, browLift: 1.5, mouth: 'talk' },
  happy: { eye: 'open', scale: 1, pupil: 1.02, lidTop: 0, lidBottom: 0.32, browTilt: -0.05, browLift: 2.5, mouth: 'grin' },
  worried: { eye: 'open', scale: 1, pupil: 0.86, lidTop: 0.12, lidBottom: 0, browTilt: -0.42, browLift: 3, mouth: 'wobble' },
  surprised: { eye: 'open', scale: 1.12, pupil: 0.7, lidTop: 0, lidBottom: 0, browTilt: -0.05, browLift: 7, mouth: 'o' },
  determined: { eye: 'open', scale: 1, pupil: 1.05, lidTop: 0.3, lidBottom: 0.08, browTilt: 0.45, browLift: -1, mouth: 'firm' },
  hurt: { eye: 'squeeze', scale: 1, pupil: 1, lidTop: 0, lidBottom: 0, browTilt: -0.35, browLift: 1, mouth: 'grimace' },
  celebrate: { eye: 'arc', scale: 1, pupil: 1, lidTop: 0, lidBottom: 0, browTilt: -0.1, browLift: 4, mouth: 'grin' },
};

function drawOpenEye(ctx: Ctx, s: FaceStyle, shape: ExprShape, side: -1 | 1, anim: FaceAnim): void {
  const cx = side * s.eyeGap;
  const cy = s.eyeY;
  const rx = s.eyeRx * shape.scale;
  const ry = s.eyeRy * shape.scale;
  ctx.save();
  ctx.translate(cx, cy);

  // White of the eye.
  ellipsePath(ctx, 0, 0, rx, ry);
  ctx.fillStyle = vgrad(ctx, -ry, ry, [
    [0, '#FFFFFF'],
    [0.75, '#F2F7FF'],
    [1, '#D7E6FA'],
  ]);
  ctx.fill();

  ctx.save();
  ellipsePath(ctx, 0, 0, rx, ry);
  ctx.clip();
  // Iris and pupil, looking around a little.
  const ix = anim.lookX * rx * 0.28;
  const iy = anim.lookY * ry * 0.2 + ry * 0.14;
  const ir = rx * 0.8;
  ctx.fillStyle = rgrad(ctx, ix, iy, 0, ir, [
    [0, '#9EDBFF'],
    [0.45, s.iris],
    [1, s.irisDark],
  ], ix, iy - ir * 0.45);
  ellipsePath(ctx, ix, iy, ir, ir * 1.05);
  ctx.fill();
  ctx.fillStyle = C.eyeInk;
  ellipsePath(ctx, ix, iy + ir * 0.05, ir * 0.48 * shape.pupil, ir * 0.52 * shape.pupil);
  ctx.fill();
  // Highlights: one big, one small, as in the render.
  ctx.fillStyle = '#FFFFFF';
  ellipsePath(ctx, ix - ir * 0.32, iy - ir * 0.36, ir * 0.27, ir * 0.3);
  ctx.fill();
  ellipsePath(ctx, ix + ir * 0.34, iy + ir * 0.3, ir * 0.13, ir * 0.13);
  ctx.fill();

  // Eyelids in the face colour: top (blink, determination) and bottom (smiling eyes).
  const top = Math.max(shape.lidTop, anim.blink);
  if (top > 0.01) {
    ctx.fillStyle = s.skin;
    ctx.beginPath();
    ctx.rect(-rx - 2, -ry - 2, rx * 2 + 4, ry * 2 * top + 2);
    ctx.fill();
  }
  if (shape.lidBottom > 0.01 && anim.blink < 0.9) {
    ctx.fillStyle = s.skin;
    ctx.beginPath();
    const y = ry - ry * 2 * shape.lidBottom;
    ctx.moveTo(-rx - 2, ry + 2);
    ctx.lineTo(-rx - 2, y + ry * 0.25);
    ctx.quadraticCurveTo(0, y - ry * 0.3, rx + 2, y + ry * 0.25);
    ctx.lineTo(rx + 2, ry + 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Outline and the lid line.
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = rgba(C.eyeInk, 0.85);
  ellipsePath(ctx, 0, 0, rx, ry);
  ctx.stroke();
  if (top > 0.01) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = C.eyeInk;
    ctx.beginPath();
    const y = -ry + ry * 2 * top;
    const half = Math.sqrt(Math.max(0, 1 - (y / ry) ** 2)) * rx;
    ctx.moveTo(-half, y);
    ctx.lineTo(half, y);
    ctx.stroke();
  }
  if (s.lashes && top < 0.6) {
    // Lash line over the top and two flicks at the outer corner.
    ctx.lineCap = 'round';
    ctx.lineWidth = 3.4;
    ctx.strokeStyle = C.eyeInk;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, Math.PI * 1.12, Math.PI * 1.88);
    ctx.stroke();
    ctx.lineWidth = 2.4;
    for (let i = 0; i < 2; i += 1) {
      const a = Math.PI * (1.9 - i * 0.1) ;
      const ox = Math.cos(a) * rx * side;
      const oy = Math.sin(a) * ry;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.quadraticCurveTo(ox + side * 5, oy - 3, ox + side * 7, oy - 7 + i * 3);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawClosedEye(ctx: Ctx, s: FaceStyle, kind: 'squeeze' | 'arc', side: -1 | 1): void {
  const cx = side * s.eyeGap;
  const cy = s.eyeY;
  const w = s.eyeRx * 0.95;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = C.eyeInk;
  ctx.beginPath();
  if (kind === 'arc') {
    // ^ ^ happy closed eyes
    ctx.moveTo(-w, s.eyeRy * 0.15);
    ctx.quadraticCurveTo(0, -s.eyeRy * 0.75, w, s.eyeRy * 0.15);
  } else {
    // > < squeezed eyes
    const dir = side === -1 ? 1 : -1;
    ctx.moveTo(-w * dir, -s.eyeRy * 0.45);
    ctx.lineTo(w * dir * 0.7, 0);
    ctx.lineTo(-w * dir, s.eyeRy * 0.45);
  }
  ctx.stroke();
  ctx.restore();
}

function drawBrow(ctx: Ctx, s: FaceStyle, shape: ExprShape, side: -1 | 1, anim: FaceAnim): void {
  const cx = side * s.eyeGap;
  const cy = s.eyeY - s.eyeRy * shape.scale - s.browRise - shape.browLift - Math.sin(anim.t * 2.2) * 0.3;
  const half = s.browLength / 2;
  // Inner end is toward the middle of the face.
  const innerDrop = shape.browTilt * 9;
  const innerX = cx - side * half;
  const outerX = cx + side * half;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = s.browWidth;
  ctx.strokeStyle = s.browColor;
  ctx.beginPath();
  ctx.moveTo(innerX, cy + innerDrop);
  ctx.quadraticCurveTo(cx, cy - 3 - Math.abs(shape.browTilt) * 2, outerX, cy - innerDrop * 0.4 + 1);
  ctx.stroke();
  ctx.restore();
}

export function drawEyes(ctx: Ctx, s: FaceStyle, expr: Expression, anim: FaceAnim): void {
  const shape = EXPR[expr];
  for (const side of [-1, 1] as const) {
    if (shape.eye === 'open') {
      drawOpenEye(ctx, s, shape, side, anim);
    } else {
      drawClosedEye(ctx, s, shape.eye, side);
    }
    drawBrow(ctx, s, shape, side, anim);
  }
}

export function drawCheeks(ctx: Ctx, s: FaceStyle, expr: Expression): void {
  const strength = expr === 'happy' || expr === 'celebrate' ? 0.75 : expr === 'hurt' ? 0.35 : 0.55;
  for (const side of [-1, 1]) {
    ctx.fillStyle = rgrad(ctx, side * s.cheekX, s.cheekY, 0, s.cheekR * 1.4, [
      [0, rgba(C.cheek, strength)],
      [1, rgba(C.cheek, 0)],
    ]);
    ellipsePath(ctx, side * s.cheekX, s.cheekY, s.cheekR * 1.4, s.cheekR * 0.85);
    ctx.fill();
  }
}

export function drawMouth(ctx: Ctx, s: FaceStyle, expr: Expression, anim: FaceAnim): void {
  const shape = EXPR[expr];
  const w = s.mouthW;
  ctx.save();
  ctx.translate(s.mouthX, s.mouthY);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = C.eyeInk;
  ctx.lineWidth = 2.8;
  const openMouth = (height: number, tongue: boolean, teeth: boolean): void => {
    const path = (): void => {
      ctx.beginPath();
      ctx.moveTo(-w / 2, 0);
      ctx.quadraticCurveTo(0, height * 0.18, w / 2, 0);
      ctx.bezierCurveTo(w * 0.46, height * 1.2, -w * 0.46, height * 1.2, -w / 2, 0);
      ctx.closePath();
    };
    path();
    ctx.fillStyle = '#7A1F33';
    ctx.fill();
    ctx.save();
    ctx.clip();
    if (teeth) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(-w / 2, -2, w, height * 0.28);
    }
    if (tongue) {
      ctx.fillStyle = '#FF7F9A';
      ellipsePath(ctx, 0, height * 0.92, w * 0.26, height * 0.34);
      ctx.fill();
    }
    ctx.restore();
    path();
    ctx.stroke();
  };
  switch (shape.mouth) {
    case 'smile':
      ctx.beginPath();
      ctx.moveTo(-w / 2, 0);
      ctx.quadraticCurveTo(0, w * 0.42, w / 2, 0);
      ctx.stroke();
      break;
    case 'talk':
      openMouth(w * (0.18 + 0.42 * anim.talk), true, false);
      break;
    case 'grin':
      openMouth(w * (expr === 'celebrate' ? 0.72 : 0.6), true, expr === 'happy');
      break;
    case 'wobble':
      ctx.beginPath();
      ctx.moveTo(-w * 0.38, w * 0.12);
      ctx.quadraticCurveTo(-w * 0.19, -w * 0.06, 0, w * 0.1);
      ctx.quadraticCurveTo(w * 0.19, w * 0.24, w * 0.38, w * 0.06);
      ctx.stroke();
      break;
    case 'o':
      ellipsePath(ctx, 0, w * 0.16, w * 0.16, w * 0.22);
      ctx.fillStyle = '#7A1F33';
      ctx.fill();
      ctx.stroke();
      break;
    case 'firm':
      ctx.beginPath();
      ctx.moveTo(-w * 0.42, w * 0.04);
      ctx.quadraticCurveTo(0, w * 0.22, w * 0.42, -w * 0.06);
      ctx.stroke();
      break;
    case 'grimace': {
      ctx.beginPath();
      ctx.moveTo(-w * 0.42, w * 0.06);
      for (let i = 1; i <= 6; i += 1) {
        ctx.lineTo(-w * 0.42 + (w * 0.84 * i) / 6, w * (i % 2 === 0 ? 0.06 : -0.04));
      }
      ctx.lineTo(w * 0.42, w * 0.22);
      for (let i = 5; i >= 0; i -= 1) {
        ctx.lineTo(-w * 0.42 + (w * 0.84 * i) / 6, w * (i % 2 === 0 ? 0.3 : 0.2));
      }
      ctx.closePath();
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

function star(ctx: Ctx, x: number, y: number, r: number, points = 5, inner = 0.45): void {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i += 1) {
    const a = (Math.PI * i) / points - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * inner;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

/** Small emotional accents around a character's head. */
export function drawExtras(ctx: Ctx, expr: Expression, top: number, halfWidth: number, anim: FaceAnim): void {
  ctx.save();
  if (expr === 'worried') {
    // Sweat drop.
    const x = halfWidth * 0.72;
    const y = top + 30 + Math.sin(anim.t * 3) * 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y - 9);
    ctx.quadraticCurveTo(x + 7, y + 2, x, y + 6);
    ctx.quadraticCurveTo(x - 7, y + 2, x, y - 9);
    ctx.fillStyle = 'rgba(160,220,255,0.95)';
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = '#3B8FD8';
    ctx.stroke();
  } else if (expr === 'surprised') {
    // Exclamation pop.
    const x = halfWidth * 0.78;
    const y = top + 4;
    const pop = 1 + Math.sin(anim.t * 10) * 0.05;
    ctx.translate(x, y);
    ctx.scale(pop, pop);
    ctx.fillStyle = C.yellow;
    ctx.strokeStyle = '#B07B00';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-4, -16);
    ctx.lineTo(4, -16);
    ctx.lineTo(2, 2);
    ctx.lineTo(-2, 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 8, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (expr === 'hurt') {
    // Dizzy stars circling.
    for (let i = 0; i < 3; i += 1) {
      const a = anim.t * 3 + (i * Math.PI * 2) / 3;
      const x = Math.cos(a) * halfWidth * 0.5;
      const y = top + 6 + Math.sin(a) * 6;
      star(ctx, x, y, 6);
      ctx.fillStyle = C.yellow;
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = '#B07B00';
      ctx.stroke();
    }
  } else if (expr === 'celebrate') {
    // Sparkles.
    const spots: [number, number, number][] = [
      [-halfWidth * 0.95, top + 20, 0],
      [halfWidth * 0.95, top + 12, 1.3],
      [-halfWidth * 0.55, top - 6, 2.1],
      [halfWidth * 0.6, top - 10, 0.7],
    ];
    for (const [x, y, phase] of spots) {
      const k = 0.6 + 0.4 * Math.sin(anim.t * 5 + phase);
      star(ctx, x, y, 8 * k, 4, 0.3);
      ctx.fillStyle = C.yellow;
      ctx.fill();
    }
  }
  ctx.restore();
}

export { star as starPath };
