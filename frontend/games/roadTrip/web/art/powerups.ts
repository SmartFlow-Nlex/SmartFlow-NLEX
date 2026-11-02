import type { PowerUpKind } from '../../core/types';
import { BRAND_FONT, ellipsePath, rgba, rgrad, shade, type Ctx } from './kit';

/**
 * Temporary power-up capsules. They are kept apart from every pick-up in
 * vehicles.ts (gold hex nuts, teal gears, cyan sparks, the green wrench
 * ring): a rounded hexagonal gem with a thick white rim, a coloured faceted
 * core and a bold white icon. The icon's SHAPE says what it is, so the
 * colours are a second cue, never the only one:
 *
 *   spread  three arrows fanning upward      (three-way horn)
 *   magnet  horseshoe magnet                 (pulls pick-ups in)
 *   bubble  shield inside a bubble ring      (blocks a hit)
 *   rally   double up-chevron with "x2"      (sidekicks fire twice as fast)
 */

export const POWERUP_BOX: [number, number, number, number] = [-80, -80, 80, 80]; // centred

export const POWERUP_INFO: Record<PowerUpKind, { name: string; colour: string }> = {
  spread: { name: 'Spread Horn', colour: '#F2543D' },
  magnet: { name: 'Bolt Magnet', colour: '#E8459B' },
  bubble: { name: 'Bubble Shield', colour: '#2F7BFF' },
  rally: { name: 'Sidekick Rally', colour: '#2EB84E' },
};

/** A rounded hexagon (pointy top) as the current path. */
function hexPath(ctx: Ctx, r: number, round: number): void {
  const pts: [number, number][] = [];
  for (let i = 0; i < 6; i += 1) {
    const a = -Math.PI / 2 + (Math.PI / 3) * i;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  ctx.beginPath();
  const mid = (i: number): [number, number] => {
    const [ax, ay] = pts[i % 6];
    const [bx, by] = pts[(i + 1) % 6];
    return [(ax + bx) / 2, (ay + by) / 2];
  };
  const [sx, sy] = mid(5);
  ctx.moveTo(sx, sy);
  for (let i = 0; i < 6; i += 1) {
    const [px, py] = pts[i];
    const [nx, ny] = mid(i);
    ctx.arcTo(px, py, nx, ny, round);
  }
  ctx.closePath();
}

/** Stroke the current path twice: dark edge, then white. */
function iconStroke(ctx: Ctx, w: number, edge: string): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = w + 5;
  ctx.strokeStyle = edge;
  ctx.stroke();
  ctx.lineWidth = w;
  ctx.strokeStyle = '#FFFFFF';
  ctx.stroke();
}

function iconFill(ctx: Ctx, edge: string): void {
  ctx.lineJoin = 'round';
  ctx.lineWidth = 5;
  ctx.strokeStyle = edge;
  ctx.stroke();
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
}

function arrow(ctx: Ctx, angle: number, len: number, edge: string): void {
  ctx.save();
  ctx.translate(0, 20);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -len + 8);
  iconStroke(ctx, 7, edge);
  ctx.beginPath();
  ctx.moveTo(0, -len - 4);
  ctx.lineTo(10, -len + 10);
  ctx.lineTo(-10, -len + 10);
  ctx.closePath();
  iconFill(ctx, edge);
  ctx.restore();
}

function drawIcon(ctx: Ctx, kind: PowerUpKind, edge: string, t: number): void {
  switch (kind) {
    case 'spread': {
      // Draw the outer arrows first, the middle one over them, joined at a hub.
      arrow(ctx, -0.62, 34, edge);
      arrow(ctx, 0.62, 34, edge);
      arrow(ctx, 0, 40, edge);
      ellipsePath(ctx, 0, 20, 7, 7);
      iconFill(ctx, edge);
      break;
    }
    case 'magnet': {
      const path = (): void => {
        ctx.beginPath();
        ctx.moveTo(-17, -24);
        ctx.lineTo(-17, 2);
        ctx.arc(0, 2, 17, Math.PI, 0, true);
        ctx.lineTo(17, -24);
      };
      path();
      ctx.lineCap = 'butt';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 17;
      ctx.strokeStyle = edge;
      ctx.stroke();
      path();
      ctx.lineWidth = 12;
      ctx.strokeStyle = '#FFFFFF';
      ctx.stroke();
      // Tips in the core colour, so the two ends read as poles.
      for (const side of [-1, 1]) {
        ctx.fillStyle = edge;
        ctx.fillRect(side * 17 - 6, -24, 12, 9);
      }
      // Pull lines.
      ctx.lineCap = 'round';
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      const k = (t * 1.5) % 1;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * 17, -32 - k * 4);
        ctx.lineTo(side * 17, -38 - k * 4);
        ctx.stroke();
      }
      break;
    }
    case 'bubble': {
      ellipsePath(ctx, 0, 0, 30, 30);
      iconStroke(ctx, 5, edge);
      ctx.beginPath();
      ctx.arc(0, 0, 22, Math.PI * 1.1, Math.PI * 1.45);
      ctx.lineCap = 'round';
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#FFFFFF';
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -17);
      ctx.quadraticCurveTo(7, -13, 14, -13);
      ctx.quadraticCurveTo(15, 7, 0, 18);
      ctx.quadraticCurveTo(-15, 7, -14, -13);
      ctx.quadraticCurveTo(-7, -13, 0, -17);
      ctx.closePath();
      iconFill(ctx, edge);
      break;
    }
    case 'rally': {
      for (const y of [-14, 4]) {
        ctx.beginPath();
        ctx.moveTo(-18, y + 10);
        ctx.lineTo(0, y - 8);
        ctx.lineTo(18, y + 10);
        iconStroke(ctx, 8, edge);
      }
      ctx.font = `900 19px ${BRAND_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 5;
      ctx.strokeStyle = edge;
      ctx.strokeText('x2', 0, 30);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText('x2', 0, 30);
      break;
    }
  }
}

export function drawPowerUp(ctx: Ctx, kind: PowerUpKind, t: number): void {
  const colour = POWERUP_INFO[kind].colour;
  const dark = shade(colour, -0.5);
  const float = Math.sin(t * 3) * 4;
  const pulse = 0.75 + 0.25 * Math.sin(t * 4);
  ctx.save();
  // Halo.
  ctx.fillStyle = rgrad(ctx, 0, 0, 0, 78, [
    [0, rgba(colour, 0.45 * pulse)],
    [0.6, rgba(colour, 0.18 * pulse)],
    [1, rgba(colour, 0)],
  ]);
  ellipsePath(ctx, 0, 0, 78, 78);
  ctx.fill();
  ctx.translate(0, float);
  ctx.rotate(Math.sin(t * 2) * 0.06);

  // White rim.
  hexPath(ctx, 58, 14);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = dark;
  ctx.stroke();

  // Faceted core.
  hexPath(ctx, 47, 10);
  ctx.fillStyle = rgrad(ctx, 0, 0, 0, 50, [
    [0, shade(colour, 0.45)],
    [0.55, colour],
    [1, shade(colour, -0.3)],
  ], -14, -18);
  ctx.fill();
  ctx.save();
  ctx.clip();
  // Facets: alternate wedges slightly lighter.
  for (let i = 0; i < 6; i += 2) {
    const a0 = -Math.PI / 2 + (Math.PI / 3) * i;
    const a1 = a0 + Math.PI / 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a0) * 60, Math.sin(a0) * 60);
    ctx.lineTo(Math.cos(a1) * 60, Math.sin(a1) * 60);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fill();
  }
  // A shine band sweeping across every couple of seconds.
  const sweep = ((t * 0.6) % 1.6) - 0.3;
  const x = -70 + sweep * 140;
  ctx.beginPath();
  ctx.moveTo(x - 10, -60);
  ctx.lineTo(x + 8, -60);
  ctx.lineTo(x - 22, 60);
  ctx.lineTo(x - 40, 60);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fill();
  ctx.restore();
  hexPath(ctx, 47, 10);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = rgba(dark, 0.6);
  ctx.stroke();
  // Top-left gleam on the rim.
  ctx.beginPath();
  ctx.ellipse(-26, -40, 12, 5, -0.5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fill();

  drawIcon(ctx, kind, dark, t);
  ctx.restore();
}
