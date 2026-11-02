/**
 * Drawing helpers shared by all the game's art. Every picture in the game is
 * drawn with these on a canvas - there are no image files - so the cast,
 * the world and the icons share one construction: soft vertical gradients,
 * a top-left highlight, a darker outline of the body colour, and round shapes.
 */

export type Ctx = CanvasRenderingContext2D;

export const BRAND_FONT = '"Nunito Black", ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif';
export const UI_FONT = 'ui-rounded, "SF Pro Rounded", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Lighter (amount > 0) or darker (amount < 0) version of a colour, amount in -1..1. */
export function shade(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const mix = (c: number): number => Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount));
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number | [number, number, number, number]): void {
  const [tl, tr, br, bl] = typeof r === 'number' ? [r, r, r, r] : r;
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
  ctx.lineTo(x + bl, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
  ctx.lineTo(x, y + tl);
  ctx.quadraticCurveTo(x, y, x + tl, y);
  ctx.closePath();
}

export function ellipsePath(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, rotation = 0): void {
  ctx.beginPath();
  ctx.ellipse(cx, cy, Math.max(0.01, rx), Math.max(0.01, ry), rotation, 0, Math.PI * 2);
}

export function vgrad(ctx: Ctx, y0: number, y1: number, stops: [number, string][]): CanvasGradient {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  for (const [at, color] of stops) {
    g.addColorStop(at, color);
  }
  return g;
}

export function hgrad(ctx: Ctx, x0: number, x1: number, stops: [number, string][]): CanvasGradient {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  for (const [at, color] of stops) {
    g.addColorStop(at, color);
  }
  return g;
}

export function rgrad(ctx: Ctx, x: number, y: number, r0: number, r1: number, stops: [number, string][], fx = x, fy = y): CanvasGradient {
  const g = ctx.createRadialGradient(fx, fy, r0, x, y, r1);
  for (const [at, color] of stops) {
    g.addColorStop(at, color);
  }
  return g;
}

/** Fill the current path with a body-paint look: gradient, then outline. */
export function paint(ctx: Ctx, base: string, top: number, bottom: number, outline: string | null, width = 3): void {
  ctx.fillStyle = vgrad(ctx, top, bottom, [
    [0, shade(base, 0.35)],
    [0.45, base],
    [1, shade(base, -0.28)],
  ]);
  ctx.fill();
  if (outline !== null) {
    ctx.lineWidth = width;
    ctx.strokeStyle = outline;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

/** A soft white sheen over the upper-left of the current path's area. */
export function sheen(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, alpha = 0.35): void {
  ctx.save();
  ctx.clip();
  ctx.fillStyle = rgrad(ctx, cx, cy, 0, Math.max(rx, ry), [
    [0, `rgba(255,255,255,${alpha})`],
    [1, 'rgba(255,255,255,0)'],
  ]);
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function groundShadow(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, alpha = 0.28): void {
  ctx.fillStyle = rgrad(ctx, cx, cy, 0, rx, [
    [0, `rgba(10,22,41,${alpha})`],
    [0.7, `rgba(10,22,41,${alpha * 0.6})`],
    [1, 'rgba(10,22,41,0)'],
  ]);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, ry / rx);
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Centred text in the brand font, optional outline. */
export function brandText(ctx: Ctx, text: string, x: number, y: number, size: number, fill: string, stroke?: string, strokeWidth = 3): void {
  ctx.font = `900 ${size}px ${BRAND_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (stroke !== undefined) {
    ctx.lineWidth = strokeWidth;
    ctx.strokeStyle = stroke;
    ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

/** An offscreen canvas of a CSS size at a pixel ratio, with a context scaled to CSS units. */
export function makeCanvas(width: number, height: number, ratio = 1): { canvas: HTMLCanvasElement; ctx: Ctx } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width * ratio));
  canvas.height = Math.max(1, Math.ceil(height * ratio));
  const ctx = canvas.getContext('2d')!;
  ctx.scale(ratio, ratio);
  return { canvas, ctx };
}

/** Smooth 0..1 easing. */
export const ease = (t: number): number => {
  const k = Math.max(0, Math.min(1, t));
  return k * k * (3 - 2 * k);
};

export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
